// Prediction odds: how likely each club is to win its division, make the playoffs and win the World Series, found by
// playing out the rest of the schedule many times. A club's strength is its roster (the active players' value) mixed with
// how it has actually played, so the odds start from talent in April and lean more on the record as the season goes.
import { game, orgState } from '../state.js';
import { Rng } from '../core/rng.js';
import { value } from './value.js';
import { activePlayers } from '../club/depth.js';
import { isPitcher } from '../data/world.js';
import { divisions, leagues } from './standings.js';

const SPREAD = 0.04;    // one standard deviation of roster strength is about six or seven wins over a season
const PRIOR = 90;       // games' worth of weight the roster rating carries against the record
const HOME = 0.02;

const avg = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 40);
const top = (a, n) => a.sort((x, y) => y - x).slice(0, n);

/** Roster strength as a win rate, one per club. */
export function talent() {
  const raw = new Map();
  for (const c of game.world.mlb) {
    const o = game.world.orgs.get(c.id), st = orgState(c.id);
    const act = activePlayers(o, st);
    const hit = top(act.filter((p) => !isPitcher(p)).map((p) => value(p)), 9);
    const sp = top(act.filter((p) => isPitcher(p) && p.role === 'Starter').map((p) => value(p)), 5);
    const rp = top(act.filter((p) => isPitcher(p) && p.role !== 'Starter').map((p) => value(p)), 6);
    raw.set(c.id, 0.5 * avg(hit) + 0.35 * avg(sp) + 0.15 * avg(rp));
  }
  const vals = [...raw.values()];
  const mean = avg(vals), sd = Math.sqrt(avg(vals.map((v) => (v - mean) ** 2))) || 1;
  return new Map([...raw].map(([id, v]) => [id, 0.5 + SPREAD * ((v - mean) / sd)]));
}

const log5 = (a, b) => (a * (1 - b)) / (a * (1 - b) + b * (1 - a));
/** Chance of winning a best-of-n series when each game is won with probability p. */
function bestOf(n, p) {
  const need = Math.ceil(n / 2);
  let win = 0;
  const f = (w, l, pr) => {
    if (w === need) { win += pr; return; }
    if (l === need) return;
    f(w + 1, l, pr * p); f(w, l + 1, pr * (1 - p));
  };
  f(0, 0, 1);
  return win;
}

/** The odds for every club, or null when there is no season to forecast or the postseason has begun. */
export function teamOdds(runs = 400) {
  const S = game.season;
  if (!S || S.post) return null;
  const T = talent();
  const clubs = game.world.mlb;
  const rec = new Map(clubs.map((c) => { const r = S.records.get(c.id) || { w: 0, l: 0 }; return [c.id, r]; }));
  const q = new Map(clubs.map((c) => { const r = rec.get(c.id); return [c.id, (T.get(c.id) * PRIOR + r.w) / (PRIOR + r.w + r.l)]; }));
  const left = S.games.filter((g) => g.level === 'MLB' && !g.s && !g.post);
  const homeP = left.map((g) => Math.min(0.9, Math.max(0.1, log5(q.get(g.home), q.get(g.away)) + HOME)));
  const rng = new Rng(`odds-${S.year}-${game.date?.getTime?.() ?? 0}`);
  const out = new Map(clubs.map((c) => [c.id, { id: c.id, div: 0, playoff: 0, bye: 0, title: 0, wins: 0 }]));
  const lgs = leagues().map((lg) => ({ lg, divs: [...divisions(lg).values()] }));
  const series = (a, b, n) => (rng.next() < bestOf(n, log5(q.get(a), q.get(b))) ? a : b);
  for (let k = 0; k < runs; k++) {
    const w = new Map(clubs.map((c) => [c.id, rec.get(c.id).w]));
    for (let i = 0; i < left.length; i++) { const g = left[i]; const id = rng.next() < homeP[i] ? g.home : g.away; w.set(id, w.get(id) + 1); }
    const key = (id) => w.get(id) + rng.next() * 0.5; // a coin flip settles ties
    const champs = [];
    for (const { divs } of lgs) {
      const leaders = divs.map((d) => d.slice().sort((a, b) => key(b) - key(a))[0]);
      const seedL = leaders.slice().sort((a, b) => key(b) - key(a));
      const rest = divs.flatMap((d) => d).filter((id) => !leaders.includes(id)).sort((a, b) => key(b) - key(a)).slice(0, 3);
      leaders.forEach((id) => { out.get(id).div++; });
      const s = [...seedL, ...rest];
      s.forEach((id) => { out.get(id).playoff++; });
      seedL.slice(0, 2).forEach((id) => { out.get(id).bye++; });
      const w1 = series(s[2], s[5], 3), w2 = series(s[3], s[4], 3);
      const ds1 = series(s[0], [w1, w2].sort((a, b) => key(a) - key(b))[0], 5);
      const ds2 = series(s[1], [w1, w2].sort((a, b) => key(a) - key(b))[1], 5);
      champs.push(series(ds1, ds2, 7));
    }
    const win = series(champs[0], champs[1], 7);
    out.get(win).title++;
    for (const c of clubs) out.get(c.id).wins += w.get(c.id);
  }
  return [...out.values()].map((x) => ({ id: x.id, div: x.div / runs, playoff: x.playoff / runs, bye: x.bye / runs, title: x.title / runs, wins: x.wins / runs, now: rec.get(x.id), strength: T.get(x.id) }))
    .sort((a, b) => b.title - a.title || b.playoff - a.playoff || b.wins - a.wins);
}

/** A chance as the tables show it: whole per cent, with a floor and ceiling so nothing reads as a certainty. */
export const chanceText = (x) => (x < 0.005 ? '<1%' : x > 0.995 ? '>99%' : `${Math.round(x * 100)}%`);
