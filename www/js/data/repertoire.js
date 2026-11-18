// The pitches a pitcher throws and how good each one is.
//
// The data set has no pitch-level figures yet: the pipeline writes a placeholder (a four-seamer and a slider, or
// those two with a changeup and a curve, each a fixed step below his Stuff). A placeholder would make every
// pitcher the same, so the game draws a repertoire for each from his own ratings instead, the same every time for
// the same player: a groundball pitcher throws a sinker, a pitcher with movement has a breaking ball worth the name,
// and there is a real gap between his best pitch and his worst. A data set that carries real repertoires keeps them.
//
// The grades are set so that, weighted by how often each pitch is thrown, they average his Stuff. The match engine
// (engine/model.js) uses each pitch's grade against that average, so a repertoire changes how a pitcher gets his
// outs (more strikeouts with two strikes from a great slider, more grounders from a sinker, trouble against
// opposite-handed hitters without a changeup) without making him better or worse overall.
import { Rng } from '../core/rng.js';

export const FASTBALLS = new Set(['Four-seam', 'Sinker', 'Cutter']);
export const BREAKING = new Set(['Slider', 'Sweeper', 'Curveball']);
export const OFFSPEED = new Set(['Changeup', 'Splitter']);
export const kindOf = (name) => (FASTBALLS.has(name) ? 'fb' : OFFSPEED.has(name) ? 'off' : 'br');

/** How often each kind of pitch is thrown, before the count and the pitch's quality move it. */
export const USE = { fb: 0.52, br: 0.32, off: 0.16 };

/** The share of each pitch in a repertoire: the kind's share split between its pitches, the first of each kind a little more. */
export function usage(names) {
  const by = { fb: [], br: [], off: [] };
  for (const n of names) by[kindOf(n)].push(n);
  const kinds = Object.keys(by).filter((k) => by[k].length);
  const total = kinds.reduce((a, k) => a + USE[k], 0);
  const out = {};
  for (const k of kinds) {
    const list = by[k], share = USE[k] / total;
    const w = list.map((_, i) => (i === 0 ? 1.6 : 1));
    const sw = w.reduce((a, x) => a + x, 0);
    list.forEach((n, i) => { out[n] = share * (w[i] / sw); });
  }
  return out;
}

const PLACEHOLDERS = ['Four-seam,Slider', 'Changeup,Curveball,Four-seam,Slider'];
/** A repertoire the pipeline made up from Stuff alone. */
export const isPlaceholder = (pg) => !pg || PLACEHOLDERS.includes(Object.keys(pg).sort().join(','));

const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

/** A repertoire for a pitcher, from his ratings. Grades as the data keeps them: { pitch: [now, future] }. */
export function repertoire(p) {
  const r = p.r || {};
  const rng = new Rng(`rep-${p.id}`);
  const g = (k) => r[k] ?? 50;
  const starter = /start/i.test(p.role || '') || (p.role == null && g('stamina') >= 50);
  const names = [];
  // the fastball: a groundball pitcher sinks it; a few throw a cutter as well
  const sinker = g('pgb') >= 57 ? rng.chance(0.8) : g('pgb') >= 50 ? rng.chance(0.25) : rng.chance(0.06);
  names.push(sinker ? 'Sinker' : 'Four-seam');
  if (starter && sinker && rng.chance(0.45)) names.push('Four-seam');
  if (rng.chance(starter ? 0.22 : 0.15)) names.push('Cutter');
  // the breaking balls: one for most relievers, two for many starters
  const breaks = ['Slider', 'Sweeper', 'Curveball'];
  const bw = { Slider: 0.5, Sweeper: 0.18, Curveball: 0.32 };
  const first = rng.weighted(bw);
  names.push(first);
  if (starter ? rng.chance(0.55) : rng.chance(0.12)) {
    const rest = Object.fromEntries(breaks.filter((b) => b !== first && !(first === 'Sweeper' && b === 'Slider') && !(first === 'Slider' && b === 'Sweeper')).map((b) => [b, bw[b]]));
    names.push(rng.weighted(rest));
  }
  // something slower: nearly every starter, some relievers; a groundball arm favours the splitter
  if (starter ? rng.chance(0.92) : rng.chance(0.35)) names.push(rng.chance(g('pgb') >= 55 ? 0.4 : 0.25) ? 'Splitter' : 'Changeup');

  // each pitch's quality from the ratings that make it, with a spread of its own
  const raw = {};
  for (const n of names) {
    const k = kindOf(n);
    const base = k === 'fb' ? 0.55 * g('stuff') + 0.45 * g('velocity') : k === 'br' ? 0.6 * g('stuff') + 0.4 * g('movement') : 0.45 * g('stuff') + 0.55 * g('movement');
    raw[n] = base + rng.normal(0, k === 'fb' ? 3.5 : 6.5) - (n === 'Cutter' || (n === 'Four-seam' && sinker) ? 3 : 0);
  }
  // so that, thrown as often as he throws them, they average his Stuff
  const use = usage(names);
  const mean = names.reduce((a, n) => a + raw[n] * use[n], 0);
  const lift = g('stuff') - mean;
  // the future grade keeps the gap the data gave between his Stuff now and later
  const gs = p.grades?.Stuff;
  const later = gs ? gs[1] - gs[0] : 0;
  const out = {};
  for (const n of names) { const now = clamp(Math.round(raw[n] + lift), 20, 80); out[n] = [now, clamp(now + later, 20, 80)]; }
  return out;
}

/** Give a pitcher a real repertoire if he has only the placeholder (players, and two-way players with pitch grades). */
export function ensureRepertoire(p) {
  if (!p?.pitchGrades || !isPlaceholder(p.pitchGrades)) return p;
  p.pitchGrades = repertoire(p);
  return p;
}
