// What the story-watcher needs to know about a game before it starts: who is making his debut, who
// has never had a hit or a homer in the majors, season home run totals, each club's streak, and
// whether the game matters more than most. With `after`, today's game (already recorded) is taken off.
import { game } from '../state.js';
import { divisions, wildCard, seeds, gb, leagues } from './standings.js';
import { ROUND_NAME } from './postseason.js';

const mlbRows = (p, kind) => (p?.hist?.[kind] || []).filter((r) => r[1] === 'MLB');
const sum = (rows, i) => rows.reduce((a, r) => a + (r[i] || 0), 0);
// column positions in a batting history row: [season, level, club, g, pa, ab, h, 2b, 3b, hr, ...]
const G = 3, H = 6, HR = 9;

/** @param {any} rec schedule entry (home, away, post, series) @param {{after?:boolean, eng?:any}} [o] */
export function storyContext(rec, { after = false, eng = null } = {}) {
  const W = game.world;
  const today = (id, k) => (after && eng ? eng.stats.get(id)?.[k] || 0 : 0);
  const year = game.season?.year ?? game.year;
  const ctx = {
    careerHits: (id) => sum(mlbRows(W.players.get(id), 'bat'), H) - today(id, 'H'),
    careerHR: (id) => sum(mlbRows(W.players.get(id), 'bat'), HR) - today(id, 'HR'),
    seasonHR: (id) => sum(mlbRows(W.players.get(id), 'bat').filter((r) => r[0] === year), HR) - today(id, 'HR'),
    debut: (id) => {
      const p = W.players.get(id);
      if (!p || p.filler) return false;
      const games = sum(mlbRows(p, 'bat'), G) + sum(mlbRows(p, 'pit'), G);
      return games - (after && eng?.stats.get(id)?.PA ? 1 : 0) === 0;
    },
    streak: {},
  };
  for (const key of ['away', 'home']) {
    const r = game.season?.records.get(rec[key]);
    let last = r?.last || '';
    if (after && !rec.post) last = last.slice(0, -1);
    const run = last.match(/(W+|L+)$/)?.[0];
    if (run) ctx.streak[key] = { type: run[0], n: run.length };
  }
  ctx.bigNote = bigNote(rec, after);
  // a postseason game: the narrator needs the series state, so it can say when a win ends it, and what that win means
  const ser = rec.post ? game.season?.post?.series.find((x) => x.id === rec.series) : null;
  if (ser) {
    const city = (id) => W.clubs.get(id).city;
    const need = ser.round === 'WC' ? 2 : ser.round === 'DS' ? 3 : 4;
    const lg = ser.league, sd = game.season.post.seeds?.[lg] || [];
    ctx.finale = { ws: ser.round === 'WS', round: ser.round, after, need, wins: { [city(ser.hi)]: ser.wins.hi, [city(ser.lo)]: ser.wins.lo },
      seeds: { [city(ser.hi)]: sd.indexOf(ser.hi) + 1, [city(ser.lo)]: sd.indexOf(ser.lo) + 1 }, league: lg };
  } else {
    const r = raceView(rec, after);
    if (r) { ctx.race = r.facts; ctx.clinch = r.clinch; ctx.elim = r.elim; }
  }
  return ctx;
}

/** A sentence on why tonight matters, or null. */
function bigNote(rec, after) {
  const S = game.season;
  if (!S) return null;
  const city = (id) => game.world.clubs.get(id).city;
  if (rec.post) {
    const s = S.post?.series.find((x) => x.id === rec.series);
    if (!s) return null;
    const need = s.round === 'WC' ? 2 : s.round === 'DS' ? 3 : 4;
    // after the game is recorded, the series count includes it
    const [a, b] = [s.wins.hi - (after && rec.s && ((rec.home === s.hi) === (rec.s[1] > rec.s[0])) ? 1 : 0), s.wins.lo - (after && rec.s && ((rec.home === s.lo) === (rec.s[1] > rec.s[0])) ? 1 : 0)];
    const sd = S.post.seeds?.[s.league] || [];
    const seed = (id) => { const n = sd.indexOf(id) + 1; return n ? (n <= 3 ? `the ${nthW(n)} seed` : 'a wild card club') : ''; };
    const PRIZE = { WC: 'a place in the Division Series', DS: 'a place in the Championship Series', LCS: 'the pennant and a place in the World Series', WS: 'the World Series' };
    if (a === need - 1 && b === need - 1) return `It's a deciding game in the ${ROUND_NAME[s.round]}, the winner takes ${PRIZE[s.round]}, and the loser goes home.`;
    if (a === need - 1 || b === need - 1) {
      const lead = a === need - 1 ? s.hi : s.lo, down = lead === s.hi ? s.lo : s.hi;
      const dw = lead === s.hi ? b : a;
      return s.round === 'LCS' ? `${city(lead)} are one win from the pennant. ${city(down)}, ${dw === 0 ? 'who have not won yet in this series,' : 'who need this one,'} have to find an answer tonight.`
        : s.round === 'WS' ? `${city(lead)} are one win from the championship of baseball, and ${city(down)} have their backs to the wall.`
        : `${city(lead)} are one win from ${PRIZE[s.round]}. ${city(down)} are playing for their season.`;
    }
    const open = a + b === 0;
    if (open) return `${ROUND_NAME[s.round]}, game one. ${city(s.hi)}${seed(s.hi) ? `, ${seed(s.hi)},` : ''} against ${city(s.lo)}${seed(s.lo) ? `, ${seed(s.lo)}` : ''}, with ${PRIZE[s.round]} at stake.`;
    return `${ROUND_NAME[s.round]}: ${city(s.hi)} ${a}, ${city(s.lo)} ${b} in the series, and ${PRIZE[s.round]} on the line.`;
  }
  const rv = raceView(rec, after);
  if (rv) {
    const parts = [];
    for (const key of ['home', 'away']) {
      if (rv.clinch[key]?.div) parts.push(`A win tonight clinches the ${rv.clinch[key].div} for ${city(rec[key])}.`);
      else if (rv.clinch[key]?.spot) parts.push(`A win tonight puts ${city(rec[key])} in the postseason.`);
      if (rv.elim[key]) parts.push(`A loss tonight would end ${city(rec[key])}'s season.`);
    }
    if (parts.length) return parts.join(' ');
  }
  const d = game.date;
  if (d.getMonth() < 8) return null; // September only
  for (const lg of leagues()) {
    const ids = [...divisions(lg).values()].flat();
    if (!ids.includes(rec.home) && !ids.includes(rec.away)) continue;
    const cut = seeds(lg).at(-1);
    const R = S.records;
    const near = [rec.home, rec.away].filter((id) => ids.includes(id) && gb(R.get(cut), R.get(id)) <= 3);
    if (near.length === 2) return `Both clubs are in the race for October, with the season in its last weeks.`;
    if (near.length === 1) {
      const id = near[0];
      const g = gb(R.get(cut), R.get(id));
      return g <= 0 ? `${city(id)} hold a playoff place, and every game counts now.` : `${city(id)} are ${g === 0.5 ? 'half a game' : `${g} games`} out of a playoff place.`;
    }
  }
  return null;
}

const nthW = (n) => ['', 'first', 'second', 'third', 'fourth', 'fifth', 'sixth'][n] || `${n}th`;
const shortDiv = (d) => String(d).replace('American League', 'AL').replace('National League', 'NL');

/**
 * Where each club stands in the race going into a game, and what this game can decide: whether a win would clinch
 * the division or a postseason place, and whether a loss would end the club's season. Worked out as the pennant
 * race watch does (ties count against the club), from the standings before the game was played.
 */
export function raceView(rec, after = false) {
  const S = game.season, W = game.world;
  if (!S || rec.post || !rec.home || !rec.away) return null;
  const R = S.records;
  const winner = after && rec.s ? (rec.s[1] > rec.s[0] ? 'home' : 'away') : null;
  const w0 = (id) => (R.get(id)?.w || 0) - (winner && rec[winner] === id ? 1 : 0);
  const l0 = (id) => (R.get(id)?.l || 0) - (winner && rec[winner] !== id && (rec.home === id || rec.away === id) ? 1 : 0);
  const rem = new Map();
  for (const g of S.games) {
    if (g.level !== 'MLB' || g.post || g.s) continue;
    rem.set(g.home, (rem.get(g.home) || 0) + 1);
    rem.set(g.away, (rem.get(g.away) || 0) + 1);
  }
  if (after) for (const id of [rec.home, rec.away]) rem.set(id, (rem.get(id) || 0) + 1);
  const clubs = W.mlb;
  const side = (id) => (rec.home === id ? 'home' : rec.away === id ? 'away' : null);
  // outcome: null (not yet played), or the side that wins
  const Wn = (id, o) => w0(id) + (o && side(id) === o ? 1 : 0);
  const Mx = (id, o) => Wn(id, o) + (rem.get(id) || 0) - (o && side(id) ? 1 : 0);
  const mates = (x) => clubs.filter((c) => c.division === clubs.find((k) => k.id === x).division && c.id !== x);
  const lg = (x) => clubs.filter((c) => c.league === clubs.find((k) => k.id === x).league && c.id !== x);
  const divWon = (x, o) => mates(x).every((c) => Mx(c.id, o) < Wn(x, o));
  const spotWon = (x, o) => divWon(x, o) || lg(x).filter((c) => Mx(c.id, o) >= Wn(x, o)).length < 3;
  const out = (x, o) => mates(x).some((c) => Wn(c.id, o) > Mx(x, o)) && lg(x).filter((c) => Wn(c.id, o) > Mx(x, o)).length >= 6;
  const clinch = {}, elim = {}, facts = {};
  const divs = divisions();
  for (const key of ['home', 'away']) {
    const x = rec[key], other = key === 'home' ? 'away' : 'home';
    if (!R.get(x)) return null;
    const c = clubs.find((k) => k.id === x);
    const myWin = key, myLoss = other;
    if (!divWon(x, null) && divWon(x, myWin)) clinch[key] = { div: shortDiv(c.division) };
    else if (!spotWon(x, null) && spotWon(x, myWin)) clinch[key] = { spot: true };
    if (!out(x, null) && out(x, myLoss)) elim[key] = true;
    // the plain facts of the race, for the radio man to drop in
    const ids = divs.get(c.division) || [], place = ids.indexOf(x) + 1;
    const gbOf = (a, b) => ((w0(a) - w0(b)) + (l0(b) - l0(a))) / 2;
    const left = rem.get(x) || 0, name = shortDiv(c.division), city = c.city;
    const gw = (n) => (n === 0.5 ? 'half a game' : `${n % 1 ? n.toFixed(1) : n} game${n === 1 ? '' : 's'}`);
    const list = [];
    const games = w0(x) + l0(x);
    if (games >= 20 && ids.length) {
      if (place === 1) { const g = gbOf(x, ids[1]); list.push(g > 0 ? `${city} lead the ${name} by ${gw(g)}${left <= 40 ? `, with ${left} to play` : ''}.` : `${city} are level at the top of the ${name}.`); }
      else { const g = gbOf(ids[0], x); list.push(`${city} are ${nthW(place)} in the ${name}, ${gw(g)} behind ${W.clubs.get(ids[0]).city}.`); }
      const wcl = wildCard(c.league), rank = wcl.indexOf(x) + 1;
      if (rank >= 1 && rank <= 3) list.push(`${city} would be in as a wild card today${wcl[3] && gbOf(x, wcl[3]) > 0 ? `, ${gw(gbOf(x, wcl[3]))} clear of ${W.clubs.get(wcl[3]).city}` : ''}.`);
      else if (rank >= 4 && rank <= 8 && wcl[2]) list.push(`${city} are ${gw(Math.max(0, gbOf(wcl[2], x)))} out of the last wild card place.`);
    }
    if (clinch[key]?.div) list.push(`${city} can win the ${name} tonight.`);
    facts[key] = list;
  }
  return { facts, clinch, elim };
}

export { wildCard };
