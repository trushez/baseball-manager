// Standings: division tables, the wild card race, and playoff seeds.
import { game } from '../state.js';

export const pct = (r) => (r.w + r.l ? r.w / (r.w + r.l) : 0);
export const gb = (lead, r) => ((lead.w - r.w) + (r.l - lead.l)) / 2;

/** Wins for a over b in games between them. */
function h2h(a, b) {
  let w = 0, l = 0;
  for (const g of game.season.games) {
    if (!g.s || g.level !== 'MLB' || g.post) continue;
    if (g.home === a && g.away === b) { if (g.s[1] > g.s[0]) w++; else l++; }
    if (g.away === a && g.home === b) { if (g.s[0] > g.s[1]) w++; else l++; }
  }
  return w - l;
}

const order = (ids) => {
  const R = game.season.records;
  return ids.sort((a, b) => pct(R.get(b)) - pct(R.get(a)) || h2h(b, a) || (R.get(b).rs - R.get(b).ra) - (R.get(a).rs - R.get(a).ra) || a.localeCompare(b));
};

export function divisions(league) {
  const out = new Map();
  for (const c of game.world.mlb) {
    if (league && c.league !== league) continue;
    if (!out.has(c.division)) out.set(c.division, []);
    out.get(c.division).push(c.id);
  }
  for (const [k, ids] of out) out.set(k, order(ids));
  return out;
}

/** Six playoff clubs per league: division winners seeded 1-3 by record, then three wild cards. */
export function seeds(league) {
  const divs = [...divisions(league).values()];
  const leaders = order(divs.map((d) => d[0]));
  const rest = order(divs.flatMap((d) => d.slice(1)));
  return [...leaders, ...rest.slice(0, 3)];
}

/** Wild card race: every non-leader in the league, with games behind the third wild card. */
export function wildCard(league) {
  const divs = [...divisions(league).values()];
  const leaders = new Set(divs.map((d) => d[0]));
  const rest = order(divs.flatMap((d) => d).filter((id) => !leaders.has(id)));
  return rest;
}

export const leagues = () => [...new Set(game.world.mlb.map((c) => c.league))].sort();
