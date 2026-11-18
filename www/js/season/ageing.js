// How early and how fast each kind of player ages (Phase 6, development depth).
//
// In CM 01/02 the age at which a player starts to decline depends on his position: strikers early,
// defenders late. In baseball the legs go first, so the positions that lean on them (catcher, shortstop,
// centre field) turn first and the ones that live on the bat (first base, designated hitter) last.
// `on` moves the start of decline in years, `st` how steeply he falls once it has started.
import { isPitcher, positions, listedPos as mainPos } from '../data/world.js';

export const POS_AGE = {
  C: { on: -1.5, st: 1.15 }, SS: { on: -1, st: 1.1 }, CF: { on: -1, st: 1.1 }, '2B': { on: -0.5, st: 1.05 },
  '3B': { on: 0, st: 1 }, LF: { on: 0.5, st: 0.95 }, RF: { on: 0.5, st: 0.95 }, '1B': { on: 1.5, st: 0.85 }, DH: { on: 1.5, st: 0.85 },
  SP: { on: 0, st: 1.05 }, RP: { on: -0.5, st: 1.1 },
};

/** The age profile for a player's main position. */
export function ageProfile(p) {
  if (isPitcher(p)) return POS_AGE[p.role === 'Starter' ? 'SP' : 'RP'];
  const pos = [mainPos(p), positions(p)[0]].find((x) => POS_AGE[x]);
  return POS_AGE[pos] || POS_AGE['3B'];
}

/** The age at which this player starts to decline: 30, his own shift (p.ag), and his position's. */
export const onsetOf = (p) => 30 + (p.ag || 0) + ageProfile(p).on;
