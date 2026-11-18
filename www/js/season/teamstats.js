// Club totals for a season, added up from every player's season lines (players who have left still
// count for the club they played for), and where a club ranks in its league.
import { HIST, line } from '../data/world.js';
import { game } from '../state.js';

/** Map of club id -> { bat, pit } lines for major league games in a season. */
export function teamTotals(year = game.season?.year ?? game.year, level = 'MLB') {
  const out = new Map();
  const blank = (kind) => [year, level, '', ...HIST[kind].map(() => 0)];
  for (const p of game.world.list) {
    for (const kind of ['bat', 'pit']) {
      for (const r of p.hist?.[kind] || []) {
        if (r[0] !== year || r[1] !== level) continue;
        if (!out.has(r[2])) out.set(r[2], { bat: blank('bat'), pit: blank('pit') });
        const t = out.get(r[2])[kind];
        t[2] = r[2];
        for (let i = 3; i < r.length; i++) t[i] += r[i];
      }
    }
  }
  const lines = new Map();
  for (const [id, t] of out) lines.set(id, { bat: line('bat', t.bat), pit: line('pit', t.pit) });
  return lines;
}

/** Rank of a club (1 = best) among `ids` by a number; `asc` when lower is better. */
export function rankOf(id, ids, get, asc = false) {
  const vals = ids.map((x) => ({ x, v: get(x) })).filter((e) => e.v != null);
  vals.sort((a, b) => (asc ? a.v - b.v : b.v - a.v));
  const i = vals.findIndex((e) => e.x === id);
  return i < 0 ? null : i + 1;
}
