// History: every finished season kept (each club's record, finish and postseason, the champions, the leaders,
// who managed where), the managers themselves (you and the computer's), and the record book. Seasons are
// archived when the World Series ends and kept in game.history; screens read careers from it.
import { noteDeal } from './contracts.js';
import { game } from '../state.js';
import { Rng } from '../core/rng.js';
import { isPitcher, seasonLine } from '../data/world.js';
import { divisions, leagues } from './standings.js';
import { realHonours } from '../data/honours.js';
import { confidence, confidenceWords } from './reactions.js';

const W = () => game.world;
const lgShort = (l) => (l.startsWith('American') ? 'AL' : 'NL');

// ---------- managers ----------

const FIRST = ['Bob', 'Dave', 'Mike', 'Tom', 'Jim', 'Joe', 'Bill', 'Rick', 'Mark', 'Dan', 'Steve', 'Gary', 'Ron', 'Phil', 'Ray', 'Walt', 'Frank', 'Ed', 'Lou', 'Hal', 'Ted', 'Carl', 'Larry', 'Pete', 'Sam', 'Ken', 'Rob', 'Tony', 'Luis', 'Manny', 'Rafael', 'Carlos'];
const LAST = ['Haskins', 'Mercer', 'Dunleavy', 'Prater', 'Holloway', 'Kessler', 'Brannigan', 'Whitlow', 'Castellano', 'Garrity', 'Lindqvist', 'Moreland', 'Fairbanks', 'Teague', 'Corrigan', 'Ashby', 'Delacroix', 'Pruitt', 'Valdés', 'Ostrowski', 'McCaskill', 'Renfro', 'Sutter', 'Larkin', 'Bramlett', 'Ybarra', 'Hollins', 'Dempsey', 'Novak', 'Quintana', 'Tolbert', 'Wyatt'];

/** A new invented manager with his three hidden ratings (tactics, handling players, developing them, 1 to 20) and a reputation. */
export function newManager(tag, year) {
  game.managers ||= {};
  const rng = new Rng(`newmgr-${tag}`);
  const taken = new Set(Object.values(game.managers).map((m) => m.name.split(' ').at(-1)));
  let last = rng.pick(LAST);
  for (let k = 0; k < 60 && taken.has(last); k++) last = rng.pick(LAST);
  const id = `g-${tag}`;
  const m = { id, name: `${rng.pick(FIRST)} ${last}`, since: year, age: rng.int(42, 66), r: { tac: rng.int(6, 16), han: rng.int(6, 16), dev: rng.int(6, 16) }, rep: rng.int(15, 65) };
  game.managers[id] = m;
  return m;
}

/** Every club's manager: yours, and for the others the real manager (from honours.json) or an invented one. */
export function ensureManagers() {
  game.managers ||= {};
  game.mgrOf ||= {};
  const real = realHonours()?.managers || {};
  const year = game.season?.year ?? game.year;
  if (!game.managers.you) game.managers.you = { id: 'you', name: game.manager, since: year, user: true };
  game.managers.you.name = game.manager;
  for (const o of W().orgs.values()) {
    if (o.id === game.orgId && !game.jobs?.jobless) { game.mgrOf[o.id] = 'you'; continue; }
    if (game.mgrOf[o.id] === 'you') delete game.mgrOf[o.id];
    if (game.jobs?.vac?.[o.id]) continue; // an open post stays open
    if (game.mgrOf[o.id] && game.mgrOf[o.id] !== 'you') continue;
    const r = real[o.id];
    if (r) {
      const id = `m${r.id}`;
      game.managers[id] ||= { id, name: r.name, mlbId: r.id, since: year };
      game.mgrOf[o.id] = id;
    } else {
      const rng = new Rng(`mgr-${o.id}-${game.manager}`);
      const id = `g-${o.id}-${year}`;
      // no two managers share a surname
      const taken = new Set(Object.values(game.managers).map((m) => m.name.split(' ').at(-1)));
      let last = rng.pick(LAST);
      for (let k = 0; k < 40 && taken.has(last); k++) last = rng.pick(LAST);
      game.managers[id] ||= { id, name: `${rng.pick(FIRST)} ${last}`, since: year, age: rng.int(44, 64) };
      game.mgrOf[o.id] = id;
    }
  }
}
export const managerOf = (orgId) => { ensureManagers(); return game.managers[game.mgrOf[orgId]]; };
export const managerName = (orgId) => (game.mgrOf?.[orgId] === 'you' ? game.manager : managerOf(orgId)?.name ?? `the ${W().orgs.get(orgId)?.club.city} manager`);

// ---------- the season archive ----------

const CATS = {
  bat: [['HR', (s) => s.hr], ['RBI', (s) => s.rbi], ['H', (s) => s.h], ['SB', (s) => s.sb], ['AVG', (s) => (s.pa >= 502 ? s.avg : null), 3], ['OPS', (s) => (s.pa >= 502 ? s.ops : null), 3]],
  pit: [['W', (s) => s.w], ['SO', (s) => s.so], ['SV', (s) => s.sv], ['ERA', (s) => (s.outs >= 486 ? s.era : null), 2, true]],
};

/** When the World Series is over: the season into game.history. */
export function archiveSeason() {
  const S = game.season, y = S.year;
  game.history ||= {};
  if (game.history[y]) return game.history[y];
  ensureManagers();
  for (const p of W().players.values()) noteDeal(p, p.orgId); // every contract in force this year is kept in the player's own history
  const post = S.post;
  const went = {}; // the furthest each club went
  const ORDER = ['WC', 'DS', 'LCS', 'WS'];
  for (const s of post?.series || []) for (const id of [s.hi, s.lo]) if (ORDER.indexOf(s.round) > ORDER.indexOf(went[id] ?? '')) went[id] = s.round;
  const clubs = {};
  for (const [div, ids] of divisions()) {
    const lead = S.records.get(ids[0]);
    ids.forEach((id, i) => {
      const r = S.records.get(id);
      clubs[id] = { w: r.w, l: r.l, rs: r.rs, ra: r.ra, div, place: i + 1, gb: ((lead.w - r.w) + (r.l - lead.l)) / 2,
        post: post?.champion === id ? 'Champions' : went[id] ?? null, mgr: game.mgrOf[id] };
    });
  }
  const ws = post?.series.find((s) => s.round === 'WS');
  const leaders = {};
  for (const lg of leagues()) {
    const L = (leaders[lgShort(lg)] = {});
    const ps = W().list.filter((p) => p.orgId && W().orgs.get(p.orgId)?.club.league === lg);
    for (const kind of ['bat', 'pit']) {
      for (const [k, f, dp, low] of CATS[kind]) {
        const rows = ps.map((p) => { const s = seasonLine(p, kind, y, 'MLB'); const v = s && f(s); return v == null || (kind === 'bat' && isPitcher(p)) ? null : [p.id, v, p.orgId]; })
          .filter(Boolean).sort((a, b) => (low ? a[1] - b[1] : b[1] - a[1])).slice(0, 3)
          .map(([id, v, org]) => [id, dp ? Number(v.toFixed(dp)) : v, org]);
        L[k] = rows;
      }
    }
  }
  const H = (game.history[y] = {
    year: y, clubs, champion: post?.champion ?? null,
    pennant: ws ? { [lgShort(W().orgs.get(ws.hi).club.league)]: ws.hi, [lgShort(W().orgs.get(ws.lo).club.league)]: ws.lo } : {},
    leaders, owner: { conf: confidence(), words: confidenceWords()[0] }, userOrg: game.orgId,
    series: (post?.series || []).map((x) => ({ round: x.round, league: x.league, hi: x.hi, lo: x.lo, winner: x.winner, hiW: x.wins?.hi ?? 0, loW: x.wins?.lo ?? 0 })),
  });
  return H;
}

// ---------- careers ----------

/** A manager's seasons, oldest first: [{year, org, w, l, place, div, post, mvoy}]. */
export function managerCareer(id) {
  const out = [];
  for (const [y, H] of Object.entries(game.history || {}).sort((a, b) => a[0] - b[0])) {
    for (const [org, c] of Object.entries(H.clubs)) {
      if (c.mgr !== id) continue;
      const moy = Object.values(game.awards?.[y]?.season || {}).some((a) => a['Manager of the Year'] === org);
      out.push({ year: Number(y), org, ...c, moy, owner: id === 'you' ? H.owner : null });
    }
  }
  return out;
}

/** A club's seasons, oldest first, with the manager's name. */
export function clubSeasons(orgId) {
  return Object.entries(game.history || {}).sort((a, b) => a[0] - b[0])
    .map(([y, H]) => ({ year: Number(y), ...H.clubs[orgId], mgrName: game.managers?.[H.clubs[orgId]?.mgr]?.name ?? '' }))
    .filter((r) => r.w != null);
}

/** Award winners from a club ([year, award, pid]), from the game's awards. */
export function clubAwards(orgId) {
  const out = [];
  for (const [y, A] of Object.entries(game.awards || {})) {
    for (const won of Object.values(A.season || {})) for (const [award, id] of Object.entries(won)) {
      if (award === 'Manager of the Year') { if (id === orgId) out.push([Number(y), award, null]); continue; }
      const p = W().players.get(id);
      if (p && wasWith(p, Number(y), orgId)) out.push([Number(y), award.replace(/^(Gold Glove|Silver Slugger) ([A-Z0-9]+?)\d?$/, '$1 ($2)'), id]);
    }
  }
  return out.sort((a, b) => a[0] - b[0]);
}
/** Did he play for the club that season (the major league club, at any point)? */
const wasWith = (p, y, orgId) => ['bat', 'pit'].some((k) => (p.hist?.[k] || []).some((r) => r[0] === y && r[1] === 'MLB' && String(r[2]).split('-')[0] === orgId));

// ---------- the record book ----------

/** Major league single-season records since 1900, to be chased in the game. */
export const MLB_RECORDS = {
  bat: [
    ['Home runs', 'hr', 73, 'Barry Bonds', 2001], ['Hits', 'h', 262, 'Ichiro Suzuki', 2004], ['Runs batted in', 'rbi', 191, 'Hack Wilson', 1930],
    ['Doubles', 'b2', 67, 'Earl Webb', 1931], ['Triples', 'b3', 36, 'Chief Wilson', 1912], ['Stolen bases', 'sb', 130, 'Rickey Henderson', 1982],
    ['Walks', 'bb', 232, 'Barry Bonds', 2004], ['Runs', 'r', 177, 'Babe Ruth', 1921], ['Batting average', 'avg', 0.426, 'Nap Lajoie', 1901],
  ],
  pit: [
    ['Strikeouts', 'so', 383, 'Nolan Ryan', 1973], ['Saves', 'sv', 62, 'Francisco Rodríguez', 2008], ['Wins', 'w', 41, 'Jack Chesbro', 1904],
    ['Earned run average', 'era', 0.96, 'Dutch Leonard', 1914],
  ],
};
const QUAL = { avg: (s) => s.pa >= 502, era: (s) => s.outs >= 486 };
const LOW = new Set(['era']);

/** The best seasons in the game (2027 on) for each record category, optionally for one club: [{label, key, best:[pid, value, year, org]}]. */
export function gameRecords(orgId = null) {
  const out = [];
  for (const kind of ['bat', 'pit']) {
    for (const [label, key] of MLB_RECORDS[kind]) {
      let best = null;
      for (const p of W().list) {
        if (kind === 'bat' && isPitcher(p)) continue;
        const years = new Set((p.hist?.[kind] || []).filter((r) => r[0] >= 2027 && r[1] === 'MLB').map((r) => r[0]));
        for (const y of years) {
          // one club's record counts only what he did for that club
          const rows = (p.hist[kind] || []).filter((r) => r[0] === y && r[1] === 'MLB' && (!orgId || String(r[2]).split('-')[0] === orgId));
          if (!rows.length) continue;
          const s = seasonLine({ hist: { [kind]: rows } }, kind, y);
          if (QUAL[key] && !QUAL[key](s)) continue;
          const v = s[key];
          if (v == null) continue;
          if (!best || (LOW.has(key) ? v < best[1] : v > best[1])) best = [p.id, v, y, String(rows[0][2]).split('-')[0]];
        }
      }
      out.push({ kind, label, key, best });
    }
  }
  return out;
}

/** Career totals: the leaders in each counting category, from the first major league season in the database (every career is complete for players who debuted in 2004 or later). */
export function careerLeaders(n = 5, orgId = null) {
  const out = [];
  for (const kind of ['bat', 'pit']) {
    for (const [label, key] of MLB_RECORDS[kind]) {
      if (QUAL[key]) continue;
      const rows = [];
      for (const p of W().list) {
        if (kind === 'bat' && isPitcher(p)) continue;
        const hist = (p.hist?.[kind] || []).filter((r) => r[1] === 'MLB' && (!orgId || String(r[2]).split('-')[0] === orgId));
        if (!hist.length) continue;
        const s = seasonLine({ hist: { [kind]: hist.map((r) => [2027, ...r.slice(1)]) } }, kind, 2027);
        if (s[key]) rows.push([p.id, s[key]]);
      }
      out.push({ label, rows: rows.sort((a, b) => b[1] - a[1]).slice(0, n) });
    }
  }
  return out;
}

/**
 * During the season: a player passing a major league record, or closing on one late in the year, makes the news.
 * Returns the stories for today ([{p, label, value, record, broken}]); each is told once.
 */
export function recordWatch() {
  const S = game.season, y = S.year;
  const seen = (S.recSeen ||= {});
  const frac = (() => { const r = S.records.get(game.orgId); return r ? (r.w + r.l) / 162 : 0; })();
  const out = [];
  for (const p of W().list) {
    if (!p.orgId || p.filler) continue;
    for (const kind of ['bat', 'pit']) {
      if (kind === 'bat' && isPitcher(p)) continue;
      const s = seasonLine(p, kind, y, 'MLB');
      if (!s) continue;
      for (const [label, key, rec, holder, ry] of MLB_RECORDS[kind]) {
        if (QUAL[key]) continue; // rate records are judged at the end
        const v = s[key];
        const id = `${p.id}-${key}`;
        if (v > rec && !seen[`${id}-b`]) { seen[`${id}-b`] = 1; out.push({ p, label, key, v, rec, holder, ry, broken: true }); }
        else if (frac >= 0.6 && v >= rec * (frac + 0.12) && !seen[`${id}-w`] && v <= rec) { seen[`${id}-w`] = 1; out.push({ p, label, key, v, rec, holder, ry, broken: false }); }
      }
    }
  }
  return out;
}

/** A club's record in the season before this one: from the archive once the game has played it, from the real 2026 data for the first year. [w, l] or null. */
export function lastRecord(club) {
  const y = game.year - 1;
  const c = game.history?.[y]?.clubs?.[club.org ?? club.id];
  if (c) return [c.w, c.l];
  return y <= 2026 && club.record2026 ? club.record2026 : null;
}
