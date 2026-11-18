// The league's talent budget (Phase 6, development depth).
//
// CM 01/02 keeps a fixed census of ability: it ranks every player by his new CA and hands the old list of
// values back in that order, so the number of players on any CA never changes. For one to rise another has
// to fall, and those who fall are mostly the ones already near their potential. It works, but players lose
// ability for no visible reason, which is the thing people hate about it.
//
// This is the same idea made soft and made to give reasons. After each winter's development the league is
// ranked, and every rank is compared with where the same rank stood when the game began (the census).
// Where the league has fallen short, part of the shortfall goes to players with the most room and the most
// drive. Where it has run ahead, part of the excess comes off players who are least protected: close to
// their ceiling, past the age their position holds up to, short of playing time, or careless of themselves.
// Each nudge keeps its reason, so the winter report can say why.
import { Rng } from '../core/rng.js';
import { game } from '../state.js';
import { hidden } from './hidden.js';
import { caOf, applyChange } from './ability.js';
import { onsetOf } from './ageing.js';

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

/** 101 quantiles of CA, lowest first. */
export function quantiles(cas) {
  const s = cas.slice().sort((a, b) => a - b);
  return Array.from({ length: 101 }, (_, i) => s[Math.min(s.length - 1, Math.round((i / 100) * (s.length - 1)))]);
}
export function initCensus(players = game.world.list) {
  const live = players.filter((p) => !p.retired);
  game.census = quantiles(live.map(caOf));
  // hitters and pitchers are kept to their own census, so one kind cannot drift ahead of the other
  game.censusK = { bat: quantiles(live.filter((p) => p.kind !== 'pit').map(caOf)), pit: quantiles(live.filter((p) => p.kind === 'pit').map(caOf)) };
}
/** The CA the census puts at a fraction of the way up the league (0 = the weakest, 1 = the best). */
const at = (q, f) => { const x = clamp(f, 0, 1) * 100, i = Math.min(99, Math.floor(x)); return q[i] + (q[i + 1] - q[i]) * (x - i); };

/** The dials: how much of the gap to the census is closed each winter, and the most a player can gain or lose to it (CA points). */
export const BUDGET = { pull: 0.7, capUp: 7, capDown: 6, on: true };

/**
 * Apply the budget. Returns, in CA points: what moved on the visible figures (up, down, net), what the budget asked for in
 * all (asked, much of it going into the hidden fractions first), and how far the league was from the census (gap). Each affected player gets
 * p.bud = { d, why } for the report.
 */
export function settleBudget(players = game.world.list, rng = new Rng(`budget-${game.year}-${game.manager}`)) {
  if (!BUDGET.on) return { up: 0, down: 0, net: 0, asked: 0, gap: 0 };
  if (!game.census || !game.censusK) initCensus(players);
  const all = players.filter((p) => !p.retired && p.pa != null);
  const plan = [];
  let gapSum = 0;
  for (const kind of ['bat', 'pit']) {
    const q = game.censusK[kind];
    const list = all.filter((p) => (p.kind === 'pit') === (kind === 'pit'));
    const ranked = list.map((p) => ({ p, ca: caOf(p) })).sort((a, b) => b.ca - a.ca || (a.p.id < b.p.id ? -1 : 1));
    const N = ranked.length;
    // weights, one for each way of being helped or hurt
    for (let i = 0; i < N; i++) {
      const r = ranked[i], p = r.p;
      r.d = at(q, 1 - i / (N - 1)) - r.ca;
      const age = p.age ?? 27, hid = hidden(p);
      const gap = Math.max(0, (p.pa ?? r.ca) - r.ca);
      const u = clamp(p._u ?? 0.7, 0, 1);
      if (r.d > 0) {
        const youth = clamp((29 - age) / 10, 0, 1);
        const room = clamp(gap / 50, 0, 1);
        const drive = clamp((hid.ambition - 30) / 50, 0, 1);
        const parts = { room: room * (0.4 + 0.6 * youth), drive: 0.35 * drive, play: 0.25 * u };
        r.w = 0.05 + 1.2 * parts.room * (0.7 + 0.3 * u) * (0.85 + 0.3 * drive);
        r.why = parts.room >= parts.drive && parts.room >= parts.play ? 'room' : parts.drive >= parts.play ? 'drive' : 'play';
        r.cap = Math.min(BUDGET.capUp, 0.6 * gap);
      } else if (r.d < 0) {
        const near = 1 - clamp(gap / 40, 0, 1);
        const old = clamp((age - onsetOf(p) + 3) / 6, 0, 1);
        const idle = 1 - u;
        const lax = clamp((50 - hid.professionalism) / 30, 0, 1);
        const parts = { ceiling: 0.45 * near, age: 0.9 * old, usage: 0.5 * idle, effort: 0.4 * lax };
        r.w = 0.05 + parts.ceiling + parts.age + parts.usage + parts.effort;
        r.why = Object.entries(parts).sort((a, b) => b[1] - a[1])[0][0];
        r.cap = BUDGET.capDown;
      } else r.w = 0;
    }
    // The share of the gap we mean to close is divided up by weight. Whatever a player's cap stops him
    // taking is handed on to the others, in a second pass.
    const take = (side, scale) => ranked.filter((r) => Math.sign(r.d) === side && r.w).map((r) => ({ r, n: clamp(BUDGET.pull * r.d * scale * (r.w / meanW[side]), side > 0 ? 0 : -r.cap, side > 0 ? r.cap : 0) }));
    const meanW = {};
    for (const side of [1, -1]) { const L = ranked.filter((r) => Math.sign(r.d) === side && r.w); meanW[side] = L.reduce((a, r) => a + r.w, 0) / Math.max(1, L.length) || 1; }
    for (const side of [1, -1]) {
      const want = BUDGET.pull * ranked.filter((r) => Math.sign(r.d) === side).reduce((a, r) => a + Math.abs(r.d), 0);
      let got = take(side, 1).reduce((a, x) => a + Math.abs(x.n), 0);
      const scale = got > 0 ? clamp(want / got, 1, 3) : 1;
      plan.push(...take(side, scale));
    }
    gapSum += ranked.reduce((a, r) => a + r.d, 0);
  }
  let up = 0, down = 0;
  for (const { r, n } of plan) {
    if (Math.abs(n) < 0.02) continue;
    const moved = applyChange(r.p, n / 5, new Rng(`bud-${r.p.id}-${game.year}-${rng.int(0, 1e6)}`)) * 5;
    r.p.dvYear = (r.p.dvYear || 0) + moved / 5;
    r.p.bud = { d: Math.round(moved * 10) / 10, why: r.why };
    if (moved > 0) up += moved; else down -= moved;
  }
  return { up: Math.round(up), down: Math.round(down), net: Math.round(up - down), asked: Math.round(plan.reduce((a, x) => a + x.n, 0)), gap: Math.round(gapSum) };
}

/** What the budget did, in the player's own terms. */
export const BUDGET_WORDS = {
  room: 'He had plenty of room to grow, and he took it.',
  drive: 'His drive to improve showed.',
  play: 'Regular playing time helped.',
  ceiling: 'He was close to the most he will ever be, and others have caught him up.',
  age: 'His position is hard on the body, and he has started to feel it.',
  usage: 'Too little playing time to keep him sharp.',
  effort: 'He has not been looking after himself.',
};
