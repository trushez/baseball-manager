// The season: schedule, playing a day's games at every level, and what each game leaves behind
// (results and records, stats on every player, pitchers' work, tired legs, injuries).
import { Game } from '../engine/game.js';
import { toEngineTeam } from '../club/engine-team.js';
import { Rng } from '../core/rng.js';
import { seeds, gb } from './standings.js';
import { isPitcher, fullName, HIST } from '../data/world.js';
import { envFor } from './ballpark.js';
import { bestLineup, lineupProblems, autoRoles, pitchQuality, playerIn } from '../club/depth.js';
import { levelPlayers, userLineup } from '../club/minors.js';
import { teamFrom } from '../club/match.js';
import { makeHitter, makePitcher } from '../data/generate.js';
import { game, orgState, autoClub } from '../state.js';
import { mlbSchedule, minorSchedule } from './schedule.js';
import { dayNo, fromDayNo } from './calendar.js';
import { staffFor } from './ability.js';
import { rollInjuries, injuryWords, startInjury, surgeryFor, setback, rehabGames } from './injuries.js';
import { message, about } from './inbox.js';
import { value } from './value.js';
import { enrich } from '../data/attributes.js';
import { addGameSplit, addHandSplits } from './splits.js';
import { addH2H } from './h2h.js';
import { notePosition } from './awards.js';
import { injuryVoices, voices } from './media.js';
import { strengths, settle } from './style.js';
/** Days left of his minimum stay on the injured list (the same sum as roster.js, which imports this file). */
const ilLeft = (st, p) => { const x = st.il.get(p.id); return x ? Math.max(0, x.kind - (dayNo(game.date) - x.since)) : 0; };

// ---------- the season ----------

export function newSeason(year = 2027) {
  const world = game.world;
  const mlb = mlbSchedule(world.mlb, { year, seed: `${game.manager}-${game.orgId}-${year}` });
  const minors = minorSchedule([...world.clubs.values()], { year, seed: `${game.orgId}-${year}` });
  const games = [];
  for (const d of mlb.days) for (const g of d.games) games.push({ ...g, level: 'MLB', d: dayNo(d.date) });
  for (const d of minors) for (const g of d.games) games.push({ ...g, d: dayNo(d.date) });
  const s = {
    year, games, start: dayNo(mlb.start), end: dayNo(mlb.end), post: null,
    records: new Map(world.mlb.map((c) => [c.id, blankRecord()])),
    minorRecords: new Map([...world.clubs.values()].filter((c) => c.level !== 'MLB').map((c) => [c.id, blankRecord()])),
  };
  indexSeason(s);
  return s;
}

export const blankRecord = () => ({ w: 0, l: 0, rs: 0, ra: 0, hw: 0, hl: 0, aw: 0, al: 0, dw: 0, dl: 0, last: '' });

/** Games by day number, for quick lookups. Rebuilt after loading a save. */
export function indexSeason(s) {
  s.byDay = new Map();
  for (const g of s.games) {
    if (!s.byDay.has(g.d)) s.byDay.set(g.d, []);
    s.byDay.get(g.d).push(g);
  }
}

export const gamesOn = (d) => game.season?.byDay.get(d) || [];
export const userClubIds = () => new Set([game.orgId, ...Object.values(game.world.orgs.get(game.orgId).affiliates).map((t) => t.id)]);
export const userGameOn = (d) => gamesOn(d).find((g) => g.level === 'MLB' && !g.s && (g.home === game.orgId || g.away === game.orgId));

// ---------- pitchers' work ----------

export const pitchesOn = (p, d) => (p.plog || []).filter(([day]) => day === d).reduce((a, [, n]) => a + n, 0);
const recent = (p, d, days) => { let n = 0; for (let k = 1; k <= days; k++) n += pitchesOn(p, d - k); return n; };

/** A pitcher's readiness today: Rested, Tired (pitched yesterday) or Unavailable. */
export function armStatus(p, d) {
  const y = pitchesOn(p, d - 1), y2 = pitchesOn(p, d - 2), y3 = pitchesOn(p, d - 3);
  if ((y && y2 && y3) || y >= 35 || y + y2 >= 55 || recent(p, d, 4) >= 70) return 'Unavailable';
  return y ? 'Tired' : 'Rested';
}
/** Days since he last pitched (20+ pitches), up to 7. */
export function daysRest(p, d) { for (let k = 1; k <= 6; k++) if (pitchesOn(p, d - k) >= 20) return k - 1; return 7; }
/** A starter's state for a start: four days' rest or more is rested, three is short rest (tired), less is exhausted. */
export function restStatus(p, d) {
  // a quick-recovering arm is ready a day sooner, a slow one a day later
  const rc = p.r?.recov ?? 50, need = rc >= 65 ? 3 : rc <= 35 ? 5 : 4;
  const r = daysRest(p, d); return r >= need ? 'Rested' : r === need - 1 ? 'Tired' : 'Exhausted';
}

/** A starter's readiness to relieve: rested four days after a start, tired at two or three, exhausted sooner. */
function starterReadiness(p, d) {
  for (let k = 1; k <= 4; k++) if (pitchesOn(p, d - k) >= 30) return k <= 1 ? 'Exhausted' : k <= 3 ? (k === 3 ? 'Tired' : 'Exhausted') : 'Rested';
  return armStatus(p, d) === 'Unavailable' ? 'Exhausted' : armStatus(p, d);
}
const canStart = (p, d) => !p.injury && recent(p, d, 4) < 20;

// ---------- building the two teams ----------

const MINOR_ROLES = ['Closer', 'Setup', 'Middle', 'Middle', 'Middle', 'Long', 'Long'];
let fillerN = 0;

/** The postseason, or a September game for a club within three games of a playoff place. */
function bigGame(rec, orgId) {
  if (rec.post) return true;
  if (game.phase !== 'regular' || game.date.getMonth() < 8) return false;
  const lg = game.world.orgs.get(orgId).club.league;
  const cut = seeds(lg).at(-1);
  return gb(game.season.records.get(cut), game.season.records.get(orgId)) <= 3;
}

/** Choose today's starter: the next in the rotation who is rested, else a bullpen game. */
function chooseStarter(o, st, level, d, commit = true) {
  if (level === 'MLB') {
    const rot = st.rotation.map((id) => playerIn(o, id)).filter(Boolean);
    const n = rot.length;
    // manual: the man you have next goes, rested or not (unless he is hurt or not on the active roster)
    if (st.rotMode === 'manual' && n) {
      const p = rot[(st.rotIdx || 0) % n];
      if (p && st.active.has(p.id) && !p.injury) { if (commit) st.rotIdx = ((st.rotIdx || 0) + 1) % n; return p; }
    }
    for (let k = 0; k < n; k++) {
      const p = rot[((st.rotIdx || 0) + k) % n];
      if (st.active.has(p.id) && canStart(p, d)) { if (commit) st.rotIdx = ((st.rotIdx || 0) + k + 1) % n; return p; }
    }
    // nobody fully rested: the rotation man with the most rest goes on short rest (a starter, never the closer),
    // and only if none has had two days off does a reliever open
    const rested = (p) => { for (let k = 1; k <= 6; k++) if (pitchesOn(p, d - k) >= 20) return k; return 7; };
    const short = rot.filter((p) => st.active.has(p.id) && !p.injury && rested(p) >= 3).sort((a, b) => rested(b) - rested(a));
    if (short.length) { if (commit) st.rotIdx = (rot.indexOf(short[0]) + 1) % n; return short[0]; }
    const arms = [...st.active].map((id) => playerIn(o, id)).filter((p) => p && isPitcher(p) && !p.injury && st.pen[p.id] !== 'Closer' && p.role !== 'Closer');
    return arms.sort((a, b) => recent(a, d, 3) - recent(b, d, 3) || (b.r?.stamina ?? 0) - (a.r?.stamina ?? 0))[0];
  }
  const arms = levelPlayers(o, st, level).filter(isPitcher);
  const tac = o.id === game.orgId && !autoClub() ? st.minor?.[level] : null;
  // the rotation you set for this level, when it has one that can pitch today
  const mine = tac?.manual ? tac.rotation.map((id) => arms.find((p) => p.id === id)).filter(Boolean) : [];
  const rot = mine.length >= 3 ? mine : arms.filter((p) => p.role === 'Starter').sort((a, b) => value(b) - value(a)).slice(0, 5);
  if (mine.length < 3) for (const p of arms.sort((a, b) => (b.grades.Stamina?.[0] ?? 0) - (a.grades.Stamina?.[0] ?? 0))) { if (rot.length >= 5) break; if (!rot.includes(p)) rot.push(p); }
  const idx = st.minorRot[level] || 0;
  const strict = mine.length >= 3 && tac.rotMode === 'manual';
  for (let k = 0; k < rot.length; k++) {
    const p = rot[(idx + k) % rot.length];
    if (strict || canStart(p, d)) { if (commit) st.minorRot[level] = (idx + k + 1) % rot.length; return p; }
  }
  return arms.find((p) => recent(p, d, 2) === 0) || null;
}

/**
 * How the rotation lines up over the club's next games: the starter for each, from the rotation pointer on,
 * skipping anyone injured on the day. Map of pitcher id to { n, d } (n = 0 for the next game).
 * The rotation is first turned so the next man up is first (SP1 is always the next starter).
 */
export function staffPlan(orgId = game.orgId) {
  const o = game.world.orgs.get(orgId), st = orgState(orgId);
  if (st.rotIdx) { st.rotation = [...st.rotation.slice(st.rotIdx), ...st.rotation.slice(0, st.rotIdx)]; st.rotIdx = 0; }
  const plan = new Map();
  if (!game.season) return plan;
  const today = dayNo(game.date);
  const days = [...new Set(game.season.games.filter((g) => g.level === 'MLB' && !g.s && g.d >= today && (g.home === orgId || g.away === orgId)).map((g) => g.d))].sort((a, b) => a - b).slice(0, 6);
  const rot = st.rotation.map((id) => playerIn(o, id)).filter(Boolean);
  let idx = 0;
  days.forEach((d, n) => {
    for (let k = 0; k < rot.length; k++) {
      const p = rot[(idx + k) % rot.length];
      const hurt = p.injury && d - p.injury.since < p.injury.days;
      if (!hurt && !plan.has(p.id) && (n > 0 || st.rotMode === 'manual' || canStart(p, d))) { plan.set(p.id, { n, d, rest: n === 0 ? daysRest(p, d) : null }); idx = (idx + k + 1) % rot.length; return; }
    }
  });
  return plan;
}

/** "Today", "Tomorrow" or "Sat 12" for a day number. */
export function dayWord(d) {
  const t = dayNo(game.date);
  if (d === t) return 'Today';
  if (d === t + 1) return 'Tomorrow';
  const x = fromDayNo(d);
  return `${x.toLocaleDateString('en-GB', { weekday: 'short' })} ${x.getDate()}`;
}

/** Who is expected to start for a club today (nothing is changed). */
export function probableStarter(clubId, level, d) {
  const club = game.world.clubs.get(clubId);
  const o = game.world.orgs.get(club.org);
  return chooseStarter(o, orgState(o.id), level, d, false);
}

/**
 * Both teams for a game, ready for the engine. For your club the lineup is the one you set; AI clubs
 * pick theirs each day, resting tired and hurt players.
 */
export function prepareGame(rec) {
  const d = rec.d;
  const sides = {};
  for (const key of ['away', 'home']) {
    const clubId = rec[key];
    const club = game.world.clubs.get(clubId);
    const o = game.world.orgs.get(club.org);
    const st = orgState(o.id);
    sides[key] = { club, o, st, user: o.id === game.orgId && rec.level === 'MLB', big: rec.level === 'MLB' && bigGame(rec, o.id), post: !!rec.post };
    sides[key].starter = chooseStarter(o, st, rec.level, d) || filler('p', club, 'Starter');
    sides[key].starterStatus = sides[key].starter.filler ? 'Rested' : restStatus(sides[key].starter, d);
  }
  for (const key of ['away', 'home']) {
    const sd = sides[key];
    const oppHand = sides[key === 'away' ? 'home' : 'away'].starter.throws === 'L' ? 'L' : 'R';
    sd.team = buildTeam(sd, rec.level, d, oppHand);
  }
  return { rec, sides, away: sides.away.team, home: sides.home.team };
}

/** The lineup a computer club would send out today against a starter who throws `hand`, for the match day screen (nothing is changed). */
export function expectedLineup(o, st, hand) {
  const hitters = [...st.active].map((id) => playerIn(o, id)).filter((p) => p && !isPitcher(p) && !p.injury);
  const fresh = hitters.filter((p) => (p.fat || 0) < 75);
  const pool = fresh.length >= 10 && fresh.filter((p) => p.pos === 'C').length >= 1 ? fresh : hitters;
  return bestLineup(pool, hand).map((x) => ({ p: pool.find((q) => q.id === x.id), pos: x.pos })).filter((x) => x.p);
}

function buildTeam(sd, level, d, hand) {
  const { club, o, st, starter } = sd;
  let hitters, arms;
  if (level === 'MLB') {
    hitters = [...st.active].map((id) => playerIn(o, id)).filter((p) => p && !isPitcher(p) && !p.injury);
    arms = [...st.active].map((id) => playerIn(o, id)).filter((p) => p && isPitcher(p) && !p.injury);
  } else {
    hitters = levelPlayers(o, st, level).filter((p) => !isPitcher(p));
    arms = levelPlayers(o, st, level).filter(isPitcher);
  }
  while (hitters.length < 10) hitters.push(filler('h', club, ['C', 'SS', 'CF', '2B', '3B', 'RF', 'LF', '1B', 'DH', 'C'][hitters.length % 10]));
  let lineup;
  const userLu = sd.user && !autoClub() ? (hand === 'L' ? st.lineupL : st.lineupR) : level !== 'MLB' && o.id === game.orgId && !autoClub() ? userLineup(o, st, level, hand, hitters) : null;
  if (userLu && (level !== 'MLB' || !lineupProblems(userLu, o, st).length) && userLu.every((s) => !playerIn(o, s.id)?.injury)) {
    lineup = userLu.map((s) => ({ p: playerIn(o, s.id), pos: s.pos }));
  } else {
    // the assistant picks: tired regulars sit when there is someone to play instead
    const fresh = hitters.filter((p) => (p.fat || 0) < 75);
    const pool = fresh.length >= 10 && fresh.filter((p) => p.pos === 'C').length >= 1 ? fresh : hitters;
    lineup = bestLineup(pool, hand).map((s) => ({ p: pool.find((x) => x.id === s.id), pos: s.pos }));
    if (sd.user && userLu) message({ cat: 'club', title: 'Your assistant picked today\'s lineup', body: 'The lineup you set could not be used (an injury or a missing player), so the assistant filled it for this game.' });
  }
  const inLu = new Set(lineup.map((s) => s.p.id));
  const bench = hitters.filter((p) => !inLu.has(p.id)).slice(0, level === 'MLB' ? 6 : 5);
  const relievers = arms.filter((p) => p.id !== starter.id); // at MLB the rotation is kept out of the pen below
  let roles;
  if (level === 'MLB') roles = st.pen;
  else if (o.id === game.orgId && !autoClub() && st.minor?.[level]?.manual && st.minor[level].rotation.length >= 3) {
    // the bullpen you set: your roles first, anyone else in the middle
    const tac = st.minor[level];
    const pool = relievers.filter((p) => !tac.rotation.includes(p.id));
    roles = {};
    for (const p of pool.slice().sort((a, b) => (tac.pen[b.id] ? 1 : 0) - (tac.pen[a.id] ? 1 : 0)).slice(0, 8)) roles[p.id] = tac.pen[p.id] || 'Middle';
  } else roles = autoRoles(relievers.filter((p) => p.role !== 'Starter').slice(0, 8));
  const pen = relievers
    .filter((p) => level === 'MLB' ? !st.rotation.includes(p.id) : roles[p.id])
    // a reliever who has thrown too much lately is exhausted: yours to use at your own risk, never the computer's
    .map((p) => ({ p, role: roles[p.id] || 'Middle', status: armStatus(p, d) === 'Unavailable' ? 'Exhausted' : armStatus(p, d), last3: recent(p, d, 3) }));
  if (level === 'MLB') {
    for (const id of st.rotation) {
      const p = playerIn(o, id);
      if (!p || p.id === starter.id || p.injury || !st.active.has(id)) continue;
      // the other starters: between starts in the season; in the postseason they can come out of the bullpen
      const status = !sd.post ? 'Unavailable' : starterReadiness(p, d);
      pen.push({ p, role: 'Starter', status, last3: recent(p, d, 3) });
    }
  }
  while (pen.filter((x) => x.status !== 'Unavailable').length < 4) pen.push({ p: filler('p', club, 'Middle'), role: 'Middle', status: 'Rested', last3: 0 });
  const r = level === 'MLB' ? game.season.records.get(o.id) : game.season.minorRecords.get(club.id);
  return teamFrom(club, { lineup, bench, starter, starterStatus: sd.starterStatus, pen, instr: st.instr, sx: level === 'MLB' ? strengths(o, st) : undefined, user: sd.user, record: r ? `${r.w}-${r.l}` : '', day: d, big: sd.big, post: sd.post });
}

/** A stand-in from the club's extended spring roster when a minor league club is short of players. */
function filler(kind, club, pos) {
  const rng = new Rng(`filler-${club.id}-${fillerN++}`);
  const p = kind === 'p' ? makePitcher(rng, pos, 38) : makeHitter(rng, pos, 38);
  p.id = `fill-${club.id}-${fillerN}`;
  p.filler = true;
  return enrich(p);
}

// ---------- playing and recording ----------

export function simulateGame(rec) {
  const prep = prepareGame(rec);
  const g = new Game({ away: toEngineTeam(prep.away), home: toEngineTeam(prep.home), seed: `${rec.id}-${game.manager}-${game.luck}`, extraRunner: !rec.post, env: envFor(rec) }).playAll();
  recordGame(prep, g);
  return g;
}

/** Everything a finished game leaves behind. */
export function recordGame(prep, g) {
  const { rec, sides } = prep;
  const d = rec.d;
  rec.s = [g.score.away, g.score.home];
  rec.inn = g.inning;
  const { holds, ...dec } = decisions(g, prep);
  Object.assign(rec, dec);
  if (rec.level === 'MLB') for (const key of ['away', 'home']) settle(sides[key].st); // each club settles a little further into its style
  const yr = game.season.year;
  const world = game.world;
  const played = [];
  const month = fromDayNo(d).getMonth() + 1;
  const ser = rec.post ? game.season.post?.series.find((x) => x.id === rec.series) : null;
  if (!rec.post && rec.level === 'MLB') addHandSplits(g.events, world.players, yr);
  if (rec.level === 'MLB') addH2H(g.events, world.players);
  for (const key of ['away', 'home']) {
    const club = sides[key].club;
    for (const [id, L] of g.stats) {
      const p = world.players.get(id);
      if (!p || p.filler || p.orgId !== sides[key].o.id) continue;
      if (L.PA) {
        const batAdd = { g: 1, pa: L.PA, ab: L.AB, h: L.H, b2: L['2B'], b3: L['3B'], hr: L.HR, r: L.R, rbi: L.RBI, bb: L.BB, so: L.K, sb: L.SB, cs: L.CS, hbp: L.HBP, sf: L.SF };
        if (!rec.post) addLine(p, 'bat', yr, rec.level, club.id, batAdd);
        else if (ser) addPost(p, 'bat', yr, ser.round, club.id, batAdd);
        // his game log: [day, opponent, level, AB, R, H, 2B, 3B, HR, RBI, BB, K, SB], the last ten games
        logGame(p, 'gb', [d, rec[key === 'home' ? 'away' : 'home'], rec.level, L.AB, L.R, L.H, L['2B'], L['3B'], L.HR, L.RBI, L.BB, L.K, L.SB]);
        if (!rec.post && rec.level === 'MLB') addGameSplit(p, 'bat', yr, month, key === 'home', batAdd);
        p.playedDay = d;
        if (p.rust) p.rust--;
        if (p.rehab && rec.level === p.rehab.level) p.rehab.done++;
        const at = g.side[key].order.find((o) => o.player.id === id)?.pos;
        if (at && at !== 'DH' && at !== 'P' && !p.filler) { (p.played ||= {}); p.played[at] = (p.played[at] || 0) + 1; }
        if (at && at !== 'P' && rec.level === 'MLB' && !rec.post) notePosition(p, at);
        p.fat = Math.min(100, (p.fat || 0) + (g.side[key].order.find((o) => o.player.id === id)?.pos === 'C' ? 13 : 8));
        if (!isPitcher(p)) played.push({ p, kind: 'hitter', tired: p.fat });
      }
      if (L.BF) {
        const er = L.pER ?? Math.max(0, L.pR - (L.pR && unearned(rec.id, id) ? 1 : 0)); // earned runs as the engine counted them (runs on an error are unearned)
        const pitAdd = {
          g: 1, gs: L.GS ? 1 : 0, outs: L.pOuts, bf: L.BF, h: L.pH, er, hr: L.pHR, bb: L.pBB, so: L.pK,
          w: dec.w === id ? 1 : 0, l: dec.l === id ? 1 : 0, sv: dec.sv === id ? 1 : 0, hld: holds.includes(id) ? 1 : 0,
        };
        if (!rec.post) addLine(p, 'pit', yr, rec.level, club.id, pitAdd);
        else if (ser) addPost(p, 'pit', yr, ser.round, club.id, pitAdd);
        if (!rec.post && rec.level === 'MLB') addGameSplit(p, 'pit', yr, month, key === 'home', pitAdd);
        if (!L.PA) { if (p.rust) p.rust--; if (p.rehab && rec.level === p.rehab.level) p.rehab.done++; }
        (p.plog ||= []).push([d, L.pitches]);
        if (p.plog.length > 8) p.plog.splice(0, p.plog.length - 8);
        played.push({ p, kind: L.GS ? 'starter' : 'reliever', tired: 60 + recent(p, d, 3) * 0.6 });
        // [day, opponent, level, started, outs, H, R, ER, BB, K, HR, pitches, decision], the last ten outings
        logGame(p, 'gp', [d, rec[key === 'home' ? 'away' : 'home'], rec.level, L.GS ? 1 : 0, L.pOuts, L.pH, L.pR, er, L.pBB, L.pK, L.pHR, L.pitches, dec.w === id ? 'W' : dec.l === id ? 'L' : dec.sv === id ? 'S' : '']);
      }
    }
  }
  // a postseason game keeps its own small box score, for the story of the series: [id, side, AB, H, HR, RBI, R] and [id, side, started, outs, H, R, ER, BB, K, pitches]
  if (rec.post) {
    rec.hl = { b: [], p: [] };
    for (const key of ['away', 'home']) for (const [id, L] of g.stats) {
      const p = world.players.get(id);
      if (!p || p.filler || p.orgId !== sides[key].o.id) continue;
      if (L.PA && (L.H >= 2 || L.HR || L.RBI >= 2)) rec.hl.b.push([id, key[0], L.AB, L.H, L.HR, L.RBI, L.R]);
      if (L.BF) rec.hl.p.push([id, key[0], L.GS ? 1 : 0, L.pOuts, L.pH, L.pR, L.pER ?? L.pR, L.pBB, L.pK, L.pitches]);
    }
  }
  // records (postseason games count only in their series)
  const win = rec.s[1] > rec.s[0] ? 'home' : 'away';
  const book = rec.level === 'MLB' ? game.season.records : game.season.minorRecords;
  for (const key of rec.post ? [] : ['away', 'home']) {
    const id = rec.level === 'MLB' ? sides[key].o.id : sides[key].club.id;
    const r = book.get(id) || book.set(id, blankRecord()).get(id);
    const won = key === win;
    const [rs, ra] = key === 'home' ? [rec.s[1], rec.s[0]] : [rec.s[0], rec.s[1]];
    r[won ? 'w' : 'l']++; r.rs += rs; r.ra += ra;
    r[`${key === 'home' ? 'h' : 'a'}${won ? 'w' : 'l'}`]++;
    if (rec.level === 'MLB' && sides.away.club.division === sides.home.club.division) r[`d${won ? 'w' : 'l'}`]++;
    r.last = (r.last + (won ? 'W' : 'L')).slice(-10);
  }
  // injuries
  const rng = new Rng(`inj-${rec.id}-${game.luck}`);
  for (const inj of rollInjuries(rng, played)) {
    if (inj.p.injury) continue;
    const mine = inj.p.orgId === game.orgId;
    inj.days = Math.max(1, Math.round(inj.days * (1.15 - 0.015 * (staffFor(inj.p.orgId)?.med ?? 10))));
    inj.p.injury = startInjury(inj.p, inj.type, inj.days, d, rng, !mine);
    delete inj.p.rehab;
    (inj.p.injuryLog ||= []).push({ d, y: game.season.year, org: inj.p.orgId, level: rec.level, days: inj.p.injury.days, text: injuryWords(inj.p.injury), post: !!rec.post });
    if (inj.p.injuryLog.length > 60) inj.p.injuryLog.shift();
    (game.season.injuries ||= []).push([d, inj.p.id, rec.level, inj.p.injury.days, injuryWords(inj.p.injury).split(',').slice(0, inj.p.injury.surgery ? 2 : 1).join(',')]);
    const choice = mine && surgeryFor(inj.p.injury) ? treatmentChoice(inj.p) : null;
    // a star lost in October: kept for the season story, and a bigger message when it is your club
    let post = null;
    if (rec.post && rec.level === 'MLB' && inj.p.injury.days >= 5) {
      const ser = game.season.post?.series.find((x) => x.id === rec.series);
      const mates = game.world.orgs.get(inj.p.orgId)?.players.filter((q) => q.level === 'MLB' && q !== inj.p && !q.injury) || [];
      const pit = isPitcher(inj.p), v = value(inj.p);
      const better = mates.filter((q) => isPitcher(q) === pit && (pit ? (q.role === 'Starter') === (inj.p.role === 'Starter') : true) && value(q) > v).length;
      const role = pit ? (inj.p.role === 'Starter' ? (better === 0 ? 'ace' : better <= 1 ? 'number two starter' : 'starter') : inj.p.role === 'Closer' ? 'closer' : 'reliever') : (better === 0 ? 'best hitter' : better <= 2 ? 'one of the top hitters' : 'regular');
      if (v >= 52 && (better <= 2) && ser) {
        post = { d, pid: inj.p.id, org: inj.p.orgId, round: ser.round, series: ser.id, days: inj.p.injury.days, role, words: injuryWords(inj.p.injury).split(',')[0] };
        (game.season.postInj ||= []).push(post);
      }
    }
    if (mine && rec.level !== 'MLB') {
      const at = sides[inj.p.club?.id === sides.home.club.id ? 'home' : 'away'].club, vs = sides[inj.p.club?.id === sides.home.club.id ? 'away' : 'home'].club;
      message({ cat: 'injury', player: inj.p.id, title: `${inj.p.club.city} (${rec.level}): ${fullName(inj.p)} injured, ${injuryWords(inj.p.injury)}`,
        body: `${fullName(inj.p)} was hurt playing for ${at.city} against ${vs.city}: ${an(inj.type)}. The medical staff expect him to miss ${inj.days <= 6 ? 'a few days' : `about ${Math.max(1, Math.round(inj.days / 7))} weeks`}. The minor league staff will cover his place.${choice ? `\n${choice.text}` : ''}\n${about(inj.p)}`, choice });
    } else if (mine && post) {
      const vsC = sides[inj.p.club?.id === sides.home.club.id ? 'away' : 'home'].club.city;
      message({
        cat: 'injury', important: true, stop: true, player: inj.p.id,
        title: `${fullName(inj.p)} is out for the postseason: ${injuryWords(inj.p.injury)}`,
        body: `${fullName(inj.p)}, your ${post.role}, was hurt in the game against ${vsC} and the medical staff expect him to miss ${Math.max(1, Math.round(inj.days / 7))} weeks. With the postseason already under way, that is the rest of the year. The clubhouse is stunned, and the ${game.world.orgs.get(game.orgId).club.name} must now find a way to keep going without him. He cannot play until he is fit; place him on the injured list to free his roster spot, and decide who takes his place.${choice ? `\n${choice.text}` : ''}`, choice,
        voices: injuryVoices(inj.p, inj.p.injury),
      });
  } else if (mine) {
      message({
        cat: 'injury', important: true, stop: game.settings.stops.injuries, player: inj.p.id,
        title: `${fullName(inj.p)} injured: ${injuryWords(inj.p.injury)}`,
        body: `${fullName(inj.p)} was hurt in ${rec.level === 'MLB' ? 'the game' : `${sides[inj.p.club?.id === sides.home.club.id ? 'home' : 'away'].club.city}'s game`} against ${sides[inj.p.club?.id === sides.home.club.id ? 'away' : 'home'].club.city}. The medical staff expect him to miss ${inj.days <= 6 ? 'a few days' : `about ${Math.max(1, Math.round(inj.days / 7))} weeks`}.${rec.level === 'MLB' ? ' He cannot play until he is fit; place him on the injured list to free his roster spot.' : ''}${choice ? `\n${choice.text}` : ''}`, choice,
        voices: rec.level === 'MLB' ? injuryVoices(inj.p, inj.p.injury) : undefined,
      });
    } else if (rec.level === 'MLB' && inj.days >= 15 && value(inj.p) >= 57) {
    }
  }
  return rec;
}

const an = (t) => `${/^[aeiou]/i.test(t) ? 'an' : 'a'} ${t}`;

/** The medical staff's two ways forward, for you to choose in the inbox (rest unless you say otherwise). */
function treatmentChoice(p) {
  const inj = p.injury, s = surgeryFor(inj);
  const wk = (n) => (n >= 120 ? `about ${Math.round(n / 30)} months` : `about ${Math.round(n / 7)} weeks`);
  const risk = s.risk >= 0.4 ? 'a real chance' : s.risk >= 0.25 ? 'some risk' : 'a small risk';
  return {
    kind: 'surgery', pid: p.id, since: inj.since, picked: null,
    text: `The doctors offer two courses. ${s.rest[0].toUpperCase() + s.rest.slice(1)} should have him back in ${wk(inj.days)}, with ${risk} of a setback${inj.type === 'torn elbow ligament' ? ' (and if the ligament goes again, surgery after all)' : ''}. Or ${s.op}, ${wk(Math.round((s.days[0] + s.days[1]) / 2))} out, but he should come back sound. They will go with rest unless you decide otherwise within the week.`,
    options: [{ id: 'rest', label: `Rest (${wk(inj.days)})` }, { id: 'surgery', label: `Surgery (${wk(Math.round((s.days[0] + s.days[1]) / 2))})` }],
  };
}

function logGame(p, k, row) {
  if (p.filler) return;
  const log = (p[k] ||= []);
  log.push(row);
  if (log.length > 10) log.splice(0, log.length - 10);
}

const unearned = (gid, pid) => new Rng(`ue-${gid}-${pid}-${game.luck}`).chance(0.18);

/** Add a game to a player's season line at this level and club (the same rows the profile shows). */
/** A postseason series adds to his postseason record: one line per year and round, in the same columns as his season lines (the round stands where the level does). */
function addPost(p, kind, yr, round, club, add) {
  const rows = ((p.ps ||= {})[kind] ||= []);
  let row = rows.find((r) => r[0] === yr && r[1] === round && r[2] === club);
  if (!row) { row = [yr, round, club, ...HIST[kind].map(() => 0)]; rows.push(row); }
  HIST[kind].forEach((k, i) => { row[i + 3] += add[k] || 0; });
}

function addLine(p, kind, yr, level, club, add) {
  p.hist ||= {};
  const rows = (p.hist[kind] ||= []);
  let row = rows.find((r) => r[0] === yr && r[1] === level && r[2] === club);
  if (!row) { row = [yr, level, club, ...HIST[kind].map(() => 0)]; rows.push(row); }
  HIST[kind].forEach((k, i) => { row[i + 3] += add[k] || 0; });
}

/**
 * What each pitcher walked into and how it went: the lead of his own side and the runners on when he came in, the
 * smallest lead he had while he was out there. Starters have an entry lead of 0. Built from the event boards.
 */
function stints(g, prep) {
  const out = { away: new Map(), home: new Map() };
  const other = (k) => (k === 'home' ? 'away' : 'home');
  const open = (side, id, board, outs) => {
    if (id == null || out[side].has(id)) return;
    const lead = board.score[side] - board.score[other(side)];
    out[side].set(id, { lead, runners: outs >= 3 ? 0 : board.bases.filter((x) => x != null).length, min: lead, order: out[side].size });
  };
  open('away', prep.away.pitcher.id, { score: { away: 0, home: 0 }, bases: [] }, 0);
  open('home', prep.home.pitcher.id, { score: { away: 0, home: 0 }, bases: [] }, 0);
  for (const e of g.events) {
    const b = e.board;
    const side = e.type === 'sub' && e.data.kind === 'pitcher' ? e.data.side : b.half === 'top' ? 'home' : 'away';
    const id = e.type === 'sub' && e.data.kind === 'pitcher' ? e.data.inId : b.pitcherId;
    open(side, id, b, b.outs);
    const st = out[side].get(id);
    if (st) st.min = Math.min(st.min, b.score[side] - b.score[other(side)]);
  }
  return out;
}

/** Winning and losing pitcher, the save and the holds, from the run of the scoring and the way each reliever came in. */
export function decisions(g, prep) {
  const lastP = { away: prep.away.pitcher.id, home: prep.home.pitcher.id };
  const goAhead = { away: null, home: null };
  let lead = 0;
  for (const e of g.events) {
    const b = e.board;
    const fielding = b.half === 'top' ? 'home' : 'away';
    lastP[fielding] = b.pitcherId;
    const now = Math.sign(b.score.home - b.score.away);
    if (now !== lead && now !== 0) {
      const side = now > 0 ? 'home' : 'away';
      const other = side === 'home' ? 'away' : 'home';
      goAhead[side] = { w: lastP[side], l: b.pitcherId && fielding === other ? b.pitcherId : lastP[other] };
    }
    lead = now;
  }
  const winner = g.score.home > g.score.away ? 'home' : 'away';
  const loser = winner === 'home' ? 'away' : 'home';
  const ga = goAhead[winner] || { w: prep[winner].pitcher.id, l: prep[loser].pitcher.id };
  let w = ga.w;
  const starter = prep[winner].pitcher.id;
  const outs = (id) => g.stats.get(id)?.pOuts || 0;
  if (w === starter && outs(starter) < 15) {
    const relievers = [...g.stats].filter(([id, L]) => L.BF && !L.GS && g.side[winner].team.bullpen.some((p) => p.id === id));
    if (relievers.length) w = relievers.sort((a, b) => b[1].pOuts - a[1].pOuts)[0][0];
  }
  const S = stints(g, prep);
  // the official rule: the finisher, not the winner, came in with the lead and kept it, and either faced the tying run
  // (on base, at bat or on deck), or had a lead of three or fewer and a whole inning, or pitched three innings
  const saveEntry = (x, o) => x && x.lead > 0 && x.min > 0 && o >= 1 && (x.lead <= x.runners + 2 || (x.lead <= 3 && o >= 3) || o >= 9);
  const finisher = lastP[winner];
  const sv = finisher !== w && finisher !== prep[winner].pitcher.id && saveEntry(S[winner].get(finisher), outs(finisher)) ? finisher : null;
  // a hold: a reliever who came in with a save chance, got an out, and left with the lead still his side's
  const holds = [];
  for (const side of ['away', 'home']) {
    for (const [id, x] of S[side]) {
      if (x.order === 0 || id === w || id === sv) continue;
      if (side === winner && id === lastP[side]) continue;
      if (side === loser && id === lastP[side]) continue;
      if (x.lead > 0 && x.min > 0 && outs(id) >= 1 && (x.lead <= x.runners + 2 || x.lead <= 3)) holds.push(id);
    }
  }
  return { w, l: ga.l, sv, holds };
}

// ---------- the end of each day ----------

/** Heal, rest, service time, and the computer's roster work, after the day's games. */
export function endOfDay(d) {
  const world = game.world;
  for (const p of world.list) {
    if (p.injury?.sb != null && d - p.injury.since === p.injury.sb) {
      const words = setback(p, p.injury, d, new Rng(`setback-${p.id}-${d}-${game.luck}`));
      if (p.orgId === game.orgId) message({ cat: 'injury', important: true, stop: game.settings.stops.injuries, player: p.id, title: `Setback for ${fullName(p)}: ${injuryWords(p.injury)}`, body: `Bad news from the medical staff on ${fullName(p)} (${p.injury.type}): ${words}.`, voices: p.level === 'MLB' ? voices(p.orgId, 'setback', { p }, 0.4) : undefined });
      
    }
    if (p.injury && d - p.injury.since >= p.injury.days) {
      const inj = p.injury;
      delete p.injury;
      const st = p.orgId ? orgState(p.orgId) : null;
      // after a long layoff he plays himself back into form: rust that wears off game by game, best done in the minors
      const n = rehabGames(p, inj);
      if (n) p.rust = n;
      const aff = p.orgId && (world.orgs.get(p.orgId).affiliates.AAA || world.orgs.get(p.orgId).affiliates.AA);
      // everyone on the list who recovers goes to the farm club to play himself back, however short the layoff
      if (st?.il.has(p.id) && aff && game.phase !== 'offseason') p.rehab = { level: aff.level, club: aff.id, since: d, need: n || 2, done: 0, until: d + (isPitcher(p) ? 30 : 20) };
      if (p.orgId === game.orgId && inj.days >= 5 && orgState().forty.has(p.id)) {
        // the start of a rehab stint is filed quietly: the message that matters is the one saying he is ready
        message({ cat: 'injury', minor: !!p.rehab, player: p.id, title: p.rehab ? `${fullName(p)} starts a rehab assignment` : `${fullName(p)} is fit again`,
          body: p.rehab
            ? `${fullName(p)} has recovered from his ${inj.type} and joins ${aff.city} (${aff.level}) on a rehab assignment. After ${Math.round(inj.days / 7)} weeks out he needs about ${p.rehab.need} ${isPitcher(p) ? 'outings' : 'games'} to be sharp; you will hear when he is ready. ${ilLeft(orgState(), p) > 0 ? `He must stay on the injured list ${ilLeft(orgState(), p)} more ${ilLeft(orgState(), p) === 1 ? 'day' : 'days'}. Once that is served you can activate him, but he will be rusty until he has played them off.` : 'You can activate him now if you need him, but he will be rusty until he has played them off.'}`
            : `${fullName(p)} has recovered from his ${inj.type}${orgState().il.has(p.id) ? ' and can be activated from the injured list' : ''}.${n ? ' After so long out he will be rusty for his first few games.' : ''}` });
      }
    }
    if (p.rehab && (p.rehab.done >= p.rehab.need || d >= p.rehab.until)) {
      const r = p.rehab;
      r.ready = true;
      // the injured list has a minimum stay: he is not ready to be activated until it is served
      if (p.orgId === game.orgId && !r.told && !(orgState().il.has(p.id) && ilLeft(orgState(), p) > 0)) {
        r.told = true;
        message({ cat: 'injury', important: true, stop: game.settings.stops.injuries, player: p.id, title: `${fullName(p)} is ready to be activated`,
          body: `${fullName(p)} has ${r.done >= r.need ? `finished his rehab assignment (${r.done} ${isPitcher(p) ? 'outings' : 'games'})` : 'used up the time allowed for a rehab assignment'}${p.rust ? ', though he is not quite sharp yet' : ' and looks sharp'}. Activate him from the injured list.` });
      }
    }
    // everyone recovers a little overnight, more on a day without a game
    if (p.fat) p.fat = Math.max(0, p.fat - (p.playedDay === d ? 6 : 15) * (1 + ((p.r?.fit ?? 50) - 50) / 80 + ((p.r?.prof ?? 50) - 50) / 250));
  }
  // a day of major league service for everyone on an active roster or the injured list
  if (game.phase === 'regular') {
    for (const o of world.orgs.values()) {
      const st = orgState(o.id);
      for (const id of [...st.active, ...st.il.keys()]) {
        const c = world.players.get(id)?.contract;
        if (!c) continue;
        const yrs = Math.floor(c.serviceTime || 0), days = Math.round(((c.serviceTime || 0) - yrs) * 1000) + 1;
        c.serviceTime = days >= 172 ? yrs + 1 : yrs + days / 1000;
      }
    }
  }
}

export { dayNo, fromDayNo };
