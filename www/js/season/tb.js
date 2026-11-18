// ThreeAndTwo's own measures, shown as each player's headline figures.
// TBO9: bases a hitter produces per game: (singles + 2 x doubles + 3 x triples + 4 x homers + walks
//   + stolen bases) per plate appearance, times 4.5 plate appearances a game.
// TBA9: bases a pitcher allows per nine innings: (singles + 2 x doubles + 3 x triples + 4 x homers
//   + walks) per inning, times 9.
// TBO9+ and TBA9- set each against the league that season: 100 is league average, 120 is 20% above.
// For TBO9+ higher is better; for TBA9- lower is better.
// Doubles and triples allowed are counted pitch by pitch from 2027 on; for earlier seasons they are
// estimated from the hits a pitcher allowed and the league's mix of hits that year.
import { game } from '../state.js';
import { HIST } from '../data/world.js';

const cache = new Map();

/** League totals for a season at a level: { tbo9, tba9, r2, r3 }. */
export function leagueTB(year, level = 'MLB') {
  const key = `${year}-${level}-${game.season?.year === year ? game.date?.getTime() : ''}`;
  if (cache.has(key)) return cache.get(key);
  const b = Object.fromEntries(HIST.bat.map((k) => [k, 0]));
  let outs = 0;
  for (const p of game.world.list) {
    for (const r of p.hist?.bat || []) if (r[0] === year && r[1] === level) HIST.bat.forEach((k, i) => { b[k] += r[i + 3]; });
    for (const r of p.hist?.pit || []) if (r[0] === year && r[1] === level) outs += r[3 + HIST.pit.indexOf('outs')];
  }
  const singles = b.h - b.b2 - b.b3 - b.hr;
  const bases = singles + 2 * b.b2 + 3 * b.b3 + 4 * b.hr + b.bb;
  const out = {
    tbo9: b.pa ? ((bases + b.sb) / b.pa) * 4.5 : null,
    tba9: outs ? (bases / (outs / 3)) * 9 : null,
    r2: b.h - b.hr ? b.b2 / (b.h - b.hr) : 0.2, r3: b.h - b.hr ? b.b3 / (b.h - b.hr) : 0.02,
  };
  cache.set(key, out);
  if (cache.size > 40) cache.delete(cache.keys().next().value);
  return out;
}

/** A hitter's TBO9 from a season line (seasonLine / line output). */
export function tbo9(s) {
  if (!s?.pa) return null;
  const singles = s.h - s.b2 - s.b3 - s.hr;
  return ((singles + 2 * s.b2 + 3 * s.b3 + 4 * s.hr + s.bb + (s.sb || 0)) / s.pa) * 4.5;
}

/** A pitcher's TBA9 for a season line. p and year let 2027 use the counted doubles and triples. */
export function tba9(s, p = null, year = null) {
  if (!s?.outs) return null;
  const counted = p && year ? countedAllowed(p, year) : null;
  let b2, b3;
  if (counted && counted.pa && s.level === 'MLB') ({ b2, b3 } = counted);
  else { const lg = leagueTB(s.season ?? year ?? 2026); b2 = (s.h - s.hr) * lg.r2; b3 = (s.h - s.hr) * lg.r3; }
  const singles = s.h - b2 - b3 - s.hr;
  return ((singles + 2 * b2 + 3 * b3 + 4 * s.hr + s.bb) / (s.outs / 3)) * 9;
}

/** Doubles and triples allowed, from the pitch-by-pitch splits (both hands added). */
function countedAllowed(p, year) {
  const sp = p.splits?.[year]?.pit;
  if (!sp) return null;
  const add = (i) => (sp.vsL?.[i] || 0) + (sp.vsR?.[i] || 0);
  return { pa: add(0), b2: add(3), b3: add(4) };
}

export const tboPlus = (s, year, level = 'MLB') => { const v = tbo9(s), lg = leagueTB(year, level).tbo9; return v != null && lg ? Math.round((100 * v) / lg) : null; };
export const tbaMinus = (s, p, year, level = 'MLB') => { const v = tba9(s, p, year), lg = leagueTB(year, level).tba9; return v != null && lg ? Math.round((100 * v) / lg) : null; };
