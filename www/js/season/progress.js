// The record of how each player has developed, one line a winter: his overall ability for everyone, and the full set of
// attributes for the players your club knows well (yours, shortlisted, or once yours). The Progression tab draws it.
import { game } from '../state.js';
import { value } from './value.js';
import { ATTRS, groupsFor, attrValue } from '../data/attributes.js';

/** The attribute keys kept for a player, in a fixed order, so a snapshot is just a list of numbers. */
export const keysFor = (p) => groupsFor(p).flatMap((g) => ATTRS[g].map((a) => a[0]));

/** One snapshot of a player as he is now. attrs: the attribute list too. */
export function snap(p, year, attrs) {
  const row = [year, Math.round(value(p) * 10) / 10];
  if (attrs) row.push(keysFor(p).map((k) => attrValue(p, k) ?? 0));
  return row;
}

/** After the winter's development: file the season just played. */
export function snapshotYear(year = game.year - 1) {
  for (const p of game.world.list) {
    if (p.retired || !p.orgId) continue;
    const known = p.orgId === game.orgId || game.shortlist?.has(p.id) || p.wasMine;
    const row = snap(p, year, known);
    const prog = (p.prog ||= []).filter((r) => r[0] !== year);
    prog.push(row);
    p.prog = prog.slice(-15);
  }
}
