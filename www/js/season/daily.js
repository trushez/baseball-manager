// The day's news. Every game played today is looked at as it finishes (noteGame); when the day closes
// (dayNews) the best of it goes into the Continue newspaper as headlines, so there is always something
// to read, and you get one message with the scores of all your clubs, from the majors to Single-A,
// with a line score and the star of each game. Nothing here is saved: it lasts for one day.
import { game } from '../state.js';
import { fullName, isPitcher, lastSeason } from '../data/world.js';
import { headline } from './headlines.js';
import { message, about } from './inbox.js';
import { userClubIds } from './sim.js';
import { divisions } from './standings.js';
import { Rng } from '../core/rng.js';
import { gameReport } from './news.js';
import { pitchFeature } from './pitchfeature.js';
import { batFeature } from './batfeature.js';
import { voices, recentForm } from './media.js';

const LEVEL_NAME = { MLB: 'Majors', AAA: 'Triple-A', AA: 'Double-A', 'A+': 'High-A', A: 'Single-A', R: 'Rookie' };
const ORDER = ['MLB', 'AAA', 'AA', 'A+', 'A', 'R'];
const NUMW = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen'];
const num = (n) => NUMW[n] ?? String(n);
const club = (id) => game.world.clubs.get(id);
const city = (id) => club(id)?.city ?? id;
const up = (s) => s.toUpperCase();
const ipText = (outs) => `${Math.floor(outs / 3)}.${outs % 3}`;

let day = { d: null, mine: [], picks: [] };
/** The player behind the story being weighed, so the email can say more than the headline. */
let cur = null;
const fresh = (d) => { if (day.d !== d) day = { d, mine: [], picks: [] }; return day; };

/** How good a day at the plate was, for picking the star. */
const batScore = (L) => (L.H || 0) + (L['2B'] || 0) + 2 * (L['3B'] || 0) + 3 * (L.HR || 0) + (L.RBI || 0) + 0.6 * (L.R || 0) + 0.4 * (L.BB || 0) + 0.5 * (L.SB || 0);
const pitScore = (L) => (L.pOuts || 0) / 3 - 2 * (L.pR || 0) + 0.5 * (L.pK || 0) - 0.3 * ((L.pH || 0) + (L.pBB || 0));

function batLine(p, L) {
  const bits = [`${L.H}-${L.AB}`];
  if (L.HR) bits.push(L.HR > 1 ? `${L.HR} HR` : 'HR');
  if (L['3B']) bits.push('3B');
  if (L['2B']) bits.push(L['2B'] > 1 ? `${L['2B']} 2B` : '2B');
  if (L.RBI) bits.push(`${L.RBI} RBI`);
  if (L.SB) bits.push(L.SB > 1 ? `${L.SB} SB` : 'SB');
  return `${p.last} ${bits.join(', ')}`;
}
const pitLine = (p, L) => `${p.last} ${ipText(L.pOuts)} IP, ${L.pR} R, ${L.pK} K`;

/** The players on one side of a finished engine game. */
const sidePlayers = (eng, key) => {
  const t = eng.side[key].team;
  return [...t.lineup.map((x) => x.player), ...t.bench, t.starter, ...t.bullpen].filter(Boolean);
};

/** The best hitter and pitcher on one side. */
function stars(eng, key) {
  let bat = null, pit = null;
  for (const p of sidePlayers(eng, key)) {
    const L = eng.stats.get(p.id);
    if (!L) continue;
    if (L.PA && (!bat || batScore(L) > bat.s)) bat = { p, L, s: batScore(L) };
    if (L.BF && (!pit || pitScore(L) > pit.s)) pit = { p, L, s: pitScore(L) };
  }
  return { bat, pit };
}

/** The most runs the winner trailed by at any point. */
function comeback(eng, winKey) {
  const a = eng.linescore.away, hm = eng.linescore.home;
  let ra = 0, rh = 0, worst = 0;
  for (let i = 0; i < Math.max(a.length, hm.length); i++) {
    ra += a[i] || 0;
    worst = Math.max(worst, winKey === 'home' ? ra - rh : 0);
    rh += hm[i] || 0;
    worst = Math.max(worst, winKey === 'away' ? rh - ra : 0);
  }
  return worst;
}

/** Called after every game today, at every level. */
export function noteGame(rec, eng) {
  if (!game.season || !rec.s) return;
  const D = fresh(rec.d);
  const ids = userClubIds();
  const ours = ids.has(rec.home) ? 'home' : ids.has(rec.away) ? 'away' : null;
  if (ours) {
    const theirs = ours === 'home' ? 'away' : 'home';
    const st = stars(eng, ours);
    D.mine.push({ rec, ours, theirs, line: { away: [...eng.linescore.away], home: [...eng.linescore.home] },
      rhe: { away: [eng.score.away, eng.side.away.hits, eng.side.away.errors], home: [eng.score.home, eng.side.home.hits, eng.side.home.errors] },
      bat: st.bat && st.bat.s >= 2 ? batLine(st.bat.p, st.bat.L) : '', batId: st.bat?.p.id,
      pit: st.pit && st.pit.L.pOuts >= 9 ? pitLine(st.pit.p, st.pit.L) : '', pitId: st.pit?.p.id });
  }
  if (rec.level !== 'MLB') return;
  // candidate headlines from this major league game, each with how much it would sell a paper
  const [a, hm] = rec.s;
  const winKey = hm > a ? 'home' : 'away', loseKey = winKey === 'home' ? 'away' : 'home';
  const W = rec[winKey], L = rec[loseKey];
  const mine = rec.home === game.orgId || rec.away === game.orgId;
  const rng = new Rng(`daily-${rec.id}`);
  const add = (score, options) => D.picks.push({ score: score + rng.next(), text: rng.pick(options), mine, rec, eng, p: cur?.p, S: cur?.S, w: W, l: L, hi: Math.max(a, hm), lo: Math.min(a, hm) });
  const hi = Math.max(a, hm), lo = Math.min(a, hm);
  for (const key of ['away', 'home']) {
    for (const p of sidePlayers(eng, key)) {
      const S = eng.stats.get(p.id);
      if (!S) continue;
      cur = { p, S };
      const won = key === winKey, them = city(rec[key === 'home' ? 'away' : 'home']), us = city(rec[key]);
      const n = up(p.last);
      if (S.HR === 2) add(won ? 5 : 3.5, [`${n} GOES DEEP TWICE AS ${up(us)} ${won ? 'BEAT' : 'FALL TO'} ${up(them)}`, `TWO HOMERS FOR ${n}`, `${n} HOMERS TWICE ${won ? 'IN WIN' : 'IN DEFEAT'} AT ${up(city(rec.home))}`]);
      if (S.H >= 4 && S.HR < 3) add(4.5, [`${n} PICKS UP ${up(num(S.H))} HITS`, `${up(num(S.H))}-HIT NIGHT FOR ${n}`, `${n} ${S.H}-FOR-${S.AB} ${won ? 'LEADS' : 'NOT ENOUGH FOR'} ${up(us)}`]);
      if (S.RBI >= 5) add(5, [`${n} DRIVES IN ${up(num(S.RBI))}`, `${S.RBI} RBI FOR ${n} AS ${up(us)} ${won ? 'ROLL' : 'LOSE ANYWAY'}`]);
      if (S.SB >= 3) add(3.5, [`${n} STEALS ${up(num(S.SB))} BASES`, `${n} RUNS WILD ON THE BASES`]);
      if (S.GS && S.pOuts >= 27 && S.pR === 0) add(8, [`${n} SHUTS OUT ${up(them)} ON HIS OWN`, `COMPLETE-GAME SHUTOUT FOR ${n}`, `${n} GOES THE DISTANCE, BLANKS ${up(them)}`]);
      else if (S.GS && S.pOuts >= 27) add(6, [`${n} GOES THE DISTANCE AGAINST ${up(them)}`, `COMPLETE GAME FOR ${n}`]);
      else if (S.GS && S.pOuts >= 21 && S.pR === 0) add(5, [`${n} DEALS ${up(num(Math.floor(S.pOuts / 3)))} SCORELESS INNINGS`, `${n} BLANKS ${up(them)} FOR ${Math.floor(S.pOuts / 3)}`, `NOTHING DOING FOR ${up(them)} AGAINST ${n}`]);
      if (S.pK >= 10 && S.pK < 14) add(5, [`${n} STRIKES OUT ${S.pK}`, `${S.pK} STRIKEOUTS FOR ${n} AGAINST ${up(them)}`, `${n} FANS ${up(num(S.pK))} ${won ? 'IN WIN' : 'BUT LOSES'}`]);
      if (S.GS && S.pR >= 7 && S.pOuts < 12) add(3, [`${up(them)} KNOCK ${n} OUT EARLY`, `ROUGH NIGHT FOR ${n}: ${S.pR} RUNS`]);
    }
  }
  cur = null;
  const walkOff = eng.events.some((e) => e.type === 'halfEnd' && e.data.walkOff);
  if (walkOff) add(6, [`WALK-OFF WIN FOR ${up(city(rec.home))}`, `${up(city(rec.home))} WIN IT IN THE ${rec.inn > 9 ? `${rec.inn}TH` : 'NINTH'}`, `${up(city(L))} BEATEN AT THE DEATH IN ${up(game.world.clubs.get(rec.home)?.town ?? city(rec.home))}`]);
  const back = comeback(eng, winKey);
  if (back >= 4) add(6, [`${up(city(W))} COME BACK FROM ${back} DOWN TO BEAT ${up(city(L))}`, `${up(city(W))} RALLY FROM ${back} RUNS BEHIND`, `${up(city(L))} BLOW ${back}-RUN LEAD`]);
  if (lo === 0 && hi >= 1) add(2.5, [`${up(city(W))} BLANK ${up(city(L))} ${hi}-0`, `${up(city(L))} SHUT OUT BY ${up(city(W))}`]);
  if (hi - lo >= 10) add(3.5, [`${up(city(W))} POUND ${up(city(L))} ${hi}-${lo}`, `${up(city(L))} ROUTED ${hi}-${lo}`]);
  if (rec.inn >= 11 && rec.inn < 13) add(3.5, [`${up(city(W))} WIN IN ${rec.inn} INNINGS`, `EXTRA-INNING WIN FOR ${up(city(W))}`]);
  if (hi === 1) add(3, [`${up(city(W))} EDGE ${up(city(L))} 1-0`, `ONE RUN ENOUGH FOR ${up(city(W))}`]);
  // the plain result, so even a dull day has its scores
  if (!rec.post) add(0, [`${up(city(W))} ${hi}, ${up(city(L))} ${lo}`, `${up(city(W))} BEAT ${up(city(L))} ${hi}-${lo}`]);
}

/** At the end of the day: the best headlines, and the scores of all your clubs. */
export function dayNews(d) {
  const D = fresh(d);
  // headlines: the strongest few, but no more than one from the same story kind in a row
  const picks = D.picks.filter((x) => !x.mine).sort((a, b) => b.score - a.score);
  const seen = new Set();
  let n = 0;
  for (const x of picks) {
    if (n >= 3 || (n >= 2 && x.score < 4)) break;
    if (seen.has(x.text)) continue;
    seen.add(x.text);
    headline(x.text);
    n++;
  }
  if (!n && game.phase === 'regular') offDay(d);
  if (game.settings.news?.stories !== false) storyMessages(D);
  if (D.mine.length && game.settings.news?.scores !== false) scoresMessage(D);
  day = { d: null, mine: [], picks: [] };
}

function scoresMessage(D) {
  const me = game.orgId;
  const rows = [];
  const parts = [];
  let w = 0, l = 0;
  const games = D.mine.slice().sort((a, b) => ORDER.indexOf(a.rec.level) - ORDER.indexOf(b.rec.level));
  for (const x of games) {
    const { rec, ours, theirs } = x;
    const won = (rec.s[1] > rec.s[0]) === (ours === 'home');
    if (won) w++; else l++;
    const book = rec.level === 'MLB' ? game.season.records : game.season.minorRecords;
    const id = rec.level === 'MLB' ? me : rec[ours];
    const r = rec.post ? null : book.get(id);
    const us = rec[ours], them = rec[theirs];
    const sc = ours === 'home' ? `${rec.s[1]}-${rec.s[0]}` : `${rec.s[0]}-${rec.s[1]}`;
    rows.push([LEVEL_NAME[rec.level], `${city(us)} ${ours === 'home' ? 'v' : 'at'} ${city(them)}`, `${won ? 'W' : 'L'} ${sc}${rec.inn > 9 ? ` (${rec.inn})` : ''}`, r ? `${r.w}-${r.l}` : '',
      x.batId && x.bat ? { pid: x.batId, t: x.bat } : '-', x.pitId && x.pit ? { pid: x.pitId, t: x.pit } : '-']);
  }
  const all = w + l;
  const lead = all === 1 ? (w ? 'A win for your only club in action today.' : 'A defeat for your only club in action today.')
    : w === all ? (all === 2 ? 'Both your clubs in action won today.' : `A clean sweep: all ${num(all)} of your clubs won today.`) : l === all ? (all === 2 ? 'Both your clubs in action lost today.' : `A bad day: all ${num(all)} of your clubs lost.`)
      : `Your clubs went ${w}-${l} today.`;
  parts.push({ p: lead });
  // something worth a sentence from the farm
  const farm = games.filter((x) => x.rec.level !== 'MLB');
  const best = farm.map((x) => ({ x, p: game.world.players.get(x.batId), L: x.bat })).filter((y) => y.p && /HR|3-|4-|5-/.test(y.L))[0];
  if (best) parts.push({ p: `In ${LEVEL_NAME[best.x.rec.level]}, ${fullName(best.p)} (${best.p.age}) stood out for ${city(best.x.rec[best.x.ours])}: ${best.L.replace(`${best.p.last} `, '')}.` });
  parts.push({ head: ['Level', 'Game', 'Result', 'Record', 'Top hitter', 'Top pitcher'], rows });
  // a line score for each game
  for (const x of games) {
    const n = Math.max(9, x.line.away.length, x.line.home.length);
    const cells = (key) => [city(x.rec[key]), ...Array.from({ length: n }, (_, i) => x.line[key][i] ?? (key === 'home' && i === x.line.home.length && x.line.away.length > x.line.home.length ? 'x' : '')), ...x.rhe[key]];
    parts.push({ head: [LEVEL_NAME[x.rec.level], ...Array.from({ length: n }, (_, i) => String(i + 1)), 'R', 'H', 'E'], rows: [cells('away'), cells('home')], ls: true });
  }
  message({ cat: 'result', title: `Scores from your clubs: ${w}-${l} today`, quiet: true, minor: true, scores: true, parts });
  // line scores are kept on the latest 30 of these only, to keep the save small
  const old = game.inbox.filter((m) => m.scores && m.parts.some((x) => x.ls));
  for (const m of old.slice(0, Math.max(0, old.length - 30))) m.parts = m.parts.filter((x) => !x.ls);
}

/** A day without games still makes the paper: a look at one of the division races. */
function offDay(d) {
  const divs = [...divisions().entries()];
  if (!divs.length) return;
  const [div, ids] = divs[d % divs.length];
  const R = game.season.records;
  const a = R.get(ids[0]), b = R.get(ids[1]);
  if (!a || !b) return;
  const gb = ((a.w - b.w) + (b.l - a.l)) / 2;
  const name = div.replace('American League', 'AL').replace('National League', 'NL').toUpperCase();
  headline(gb <= 0 ? `OFF DAY: ${up(city(ids[0]))} AND ${up(city(ids[1]))} LEVEL AT THE TOP OF THE ${name}`
    : `OFF DAY: ${up(city(ids[0]))} LEAD THE ${name} BY ${gb % 1 ? gb.toFixed(1) : gb}`, ids.slice(0, 2).includes(game.orgId));
}

/** Sentence case for a headline, with the names put back. */
function sentence(text, names) {
  let t = text.toLowerCase();
  // whole words only; a word ending in a full stop ("St.") has no word boundary after it, so look for a non-letter instead
  for (const n of names) for (const w of String(n).split(/\s+/)) if (w.length > 1) t = t.replace(new RegExp(`(?<![\\p{L}\\d])${w.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\p{L}\\d])`, 'gu'), w);
  t = t.replace(/\b(rbi|hr|mvp)\b/g, (m) => m.toUpperCase());
  return t.charAt(0).toUpperCase() + t.slice(1);
}

/** The day's best stories as emails of their own: the strongest around the majors, and any big night from your own club. */
function storyMessages(D) {
  const me = game.orgId;
  // one story per player and per game, the strongest first
  const seenP = new Set(), seenG = new Set();
  const good = D.picks.filter((x) => x.score >= (x.mine ? 4.5 : 6.8)).sort((a, b) => b.score - a.score).filter((x) => {
    const k = x.p?.id;
    if (seenG.has(x.rec.id) || (k && seenP.has(k))) return false;
    seenG.add(x.rec.id); if (k) seenP.add(k);
    return true;
  });
  const mine = good.filter((x) => x.mine).slice(0, 1);
  // other clubs' games are not your news: only your own club's stories become messages
  for (const x of mine) {
    const { rec } = x;
    const names = [x.p ? fullName(x.p) : '', city(rec.home), city(rec.away), city(x.w), city(x.l), game.world.clubs.get(rec.home)?.town ?? ''];
    const parts = [];
    // a story about one player's night is told about him, not as the match report again
    const ownStory = x.p && x.eng && x.S && x.text.includes(up(x.p.last));
    const pitStory = ownStory && isPitcher(x.p) && x.S.GS && (x.S.pOuts >= 15 || x.S.pK >= 10);
    const batStory = ownStory && !isPitcher(x.p) && x.S.PA >= 3;
    if (pitStory || batStory) {
      try {
        const opp = rec.home === x.p.orgId ? rec.away : rec.home;
        const ctx = { us: city(x.p.orgId), opp: city(opp), home: rec.home === x.p.orgId, won: x.w === x.p.orgId, name: (id) => game.world.players.get(id)?.last ?? null };
        for (const t of (pitStory ? pitchFeature : batFeature)(x.p, x.eng, rec, x.S, ctx)) parts.push({ p: t });
        parts.push({ p: `${city(x.w)} won ${x.hi}-${x.lo}${rec.inn > 9 ? ` in ${rec.inn} innings` : ''}${rec.post ? ' in the postseason' : ''}.` });
      } catch { parts.length = 0; }
    }
    if (!parts.length && x.eng) { try { for (const t of gameReport(rec, x.eng, true)) parts.push({ p: t }); } catch { /* fall back to the score line */ } }
    if (!parts.length) parts.push({ p: `${city(x.w)} ${x.hi}, ${city(x.l)} ${x.lo}${rec.inn > 9 ? ` in ${rec.inn} innings` : ''}${rec.post ? ' in the postseason' : ''}.` });
    if (x.p && x.S) {
      const line = isPitcher(x.p) ? pitLine(x.p, x.S) : batLine(x.p, x.S);
      parts.push({ p: `${fullName(x.p)} of ${city(x.p.orgId)}: ${line.replace(`${x.p.last} `, '')}.` });
      const ls = lastSeason(x.p);
      if (ls && (isPitcher(x.p) ? ls.ip >= 25 : ls.pa >= 100)) parts.push({ p: about(x.p) });
      const form = recentForm(x.p);
      const vs = form?.hot ? voices(x.p.orgId, isPitcher(x.p) ? 'hotP' : 'hot', { p: x.p, form: form.text ?? form }, 0.6) : [];
      for (const v of vs) parts.push({ q: v.q, by: v.by });
    }
    message({ cat: x.mine ? 'club' : 'league', minor: !x.mine, title: sentence(x.text, names), quiet: true, player: x.p?.id, parts, important: x.mine && x.p?.orgId === me });
  }
}
