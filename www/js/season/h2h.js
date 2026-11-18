// Batter against pitcher, from 2027 on: plate appearances, hits, home runs, walks and strikeouts for every
// meeting in the majors that involves your organisation (kept to those so saves stay small).
import { game } from '../state.js';

const NO_AB = new Set(['BB', 'IBB', 'HBP', 'SF', 'SAC']);

/** Record every plate appearance of a finished game. */
export function addH2H(events, players) {
  const me = game.orgId;
  for (const e of events) {
    if (e.type !== 'paEnd') continue;
    const b = players.get(e.data.batterId), p = players.get(e.data.pitcherId);
    if (!b || !p || b.filler || p.filler || (b.orgId !== me && p.orgId !== me)) continue;
    const r = e.data.result;
    const x = ((game.h2h ||= {})[`${b.id}|${p.id}`] ||= [0, 0, 0, 0, 0, 0]); // pa, ab, h, hr, bb, so
    x[0]++;
    if (!NO_AB.has(r)) x[1]++;
    if (['1B', '2B', '3B', 'HR'].includes(r)) x[2]++;
    if (r === 'HR') x[3]++;
    if (r === 'BB' || r === 'IBB') x[4]++;
    if (r === 'K') x[5]++;
  }
}

/** "3 for 8, a home run, 2 strikeouts", or null if they have never met. */
export function h2hWords(batterId, pitcherId) {
  const x = game.h2h?.[`${batterId}|${pitcherId}`];
  if (!x?.[0]) return null;
  const [, ab, hh, hr, bb, so] = x;
  const bits = [`${hh} for ${ab}`];
  if (hr) bits.push(hr === 1 ? 'a home run' : `${hr} home runs`);
  if (bb) bits.push(bb === 1 ? 'a walk' : `${bb} walks`);
  if (so) bits.push(so === 1 ? 'a strikeout' : `${so} strikeouts`);
  return bits.join(', ');
}
