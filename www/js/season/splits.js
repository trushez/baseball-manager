// Splits for the stats screens: each major league player's season by month, home and away (game lines
// in the same shape as his history rows), and against left- and right-handed opponents, counted at-bat
// by at-bat from the game's events.
import { HIST, line } from '../data/world.js';

// at-bat counts kept for the handedness splits
export const PA_KEYS = ['pa', 'ab', 'h', 'b2', 'b3', 'hr', 'bb', 'so', 'hbp', 'sf'];
const NO_AB = new Set(['BB', 'IBB', 'HBP', 'SF', 'SAC']);

function bucket(p, year, kind, key, size) {
  const y = ((p.splits ||= {})[year] ||= {});
  const k = (y[kind] ||= {});
  return (k[key] ||= new Array(size).fill(0));
}

/** A game line (HIST order) into the month and home/away splits. */
export function addGameSplit(p, kind, year, month, home, add) {
  for (const key of [`m${month}`, home ? 'home' : 'away']) {
    const b = bucket(p, year, kind, key, HIST[kind].length);
    HIST[kind].forEach((k, i) => { b[i] += add[k] || 0; });
  }
}

/** Every plate appearance of a game into the batter's and pitcher's handedness splits. */
export function addHandSplits(events, players, year) {
  for (const e of events) {
    if (e.type !== 'paEnd') continue;
    const b = players.get(e.data.batterId), pt = players.get(e.data.pitcherId);
    if (!b || !pt || b.filler || pt.filler) continue;
    const r = e.data.result;
    const add = {
      pa: 1, ab: NO_AB.has(r) ? 0 : 1, h: ['1B', '2B', '3B', 'HR'].includes(r) ? 1 : 0, b2: r === '2B' ? 1 : 0, b3: r === '3B' ? 1 : 0, hr: r === 'HR' ? 1 : 0,
      bb: r === 'BB' || r === 'IBB' ? 1 : 0, so: r === 'K' ? 1 : 0, hbp: r === 'HBP' ? 1 : 0, sf: r === 'SF' ? 1 : 0,
    };
    const pHand = pt.throws === 'L' ? 'L' : 'R';
    const bHand = b.bats === 'S' ? (pHand === 'L' ? 'R' : 'L') : b.bats === 'L' ? 'L' : 'R';
    const bb = bucket(b, year, 'bat', `vs${pHand}`, PA_KEYS.length);
    const pb = bucket(pt, year, 'pit', `vs${bHand}`, PA_KEYS.length);
    PA_KEYS.forEach((k, i) => { bb[i] += add[k]; pb[i] += add[k]; });
  }
}

/** A handedness split as rates. */
export function handLine(arr) {
  if (!arr) return null;
  const o = Object.fromEntries(PA_KEYS.map((k, i) => [k, arr[i]]));
  const singles = o.h - o.b2 - o.b3 - o.hr;
  o.avg = o.ab ? o.h / o.ab : null;
  const d = o.ab + o.bb + o.hbp + o.sf;
  o.obp = d ? (o.h + o.bb + o.hbp) / d : null;
  o.slg = o.ab ? (singles + 2 * o.b2 + 3 * o.b3 + 4 * o.hr) / o.ab : null;
  o.ops = o.obp != null && o.slg != null ? o.obp + o.slg : null;
  o.kPct = o.pa ? o.so / o.pa : null;
  o.bbPct = o.pa ? o.bb / o.pa : null;
  return o;
}

/** A month or home/away split as a full line. */
export const gameLine = (kind, arr, year, key) => (arr ? line(kind, [year, key, '', ...arr]) : null);
