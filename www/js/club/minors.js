// Your minor league clubs' lineups, rotations and bullpens. The assistant sets them by default (and rests tired
// players); once you change one on the Tactics screen, or choose "I set them", the games at that level use yours
// whenever they are usable, and fall back to the assistant's picks on any day they are not (an injury, a move).
import { isPitcher } from '../data/world.js';
import { value } from '../season/value.js';
import { syncTeams } from '../season/roster.js';
import { bestLineup, autoStaff, activeHitters, lineupProblems } from './depth.js';

export const MINOR_LEVELS = ['AAA', 'AA', 'A+', 'A', 'R'];
const TAC = new Set(['lineupR', 'lineupL', 'rotation', 'pen', 'rotMode', 'rotIdx']);

/** Players who can play at a level today: not on the injured list or designated, not hurt. */
export function levelPlayers(o, st, level) {
  return o.players.filter((p) => (st.level.get(p.id) === level && !st.active.has(p.id) && !st.il.has(p.id) && !st.dfa.has(p.id) && !p.injury)
    || (p.rehab?.level === level && !p.rehab.ready && st.il.has(p.id) && !p.injury));
}
/** Everyone at a level including the hurt, as the Tactics screen lists them (the hurt carry a tag). */
export const levelAll = (o, st, level) => o.players.filter((p) => st.level.get(p.id) === level && !st.active.has(p.id) && !st.il.has(p.id) && !st.dfa.has(p.id));

export const tacOf = (st, level) => (st.minor ||= {})[level] ||= { manual: false, rotMode: 'auto', rotIdx: 0, lineupR: [], lineupL: [], rotation: [], pen: {} };

/** A copy of the club's state in which the lineups, rotation and bullpen are this level's, and the "active roster" is everyone at the level. Edits write through. */
export function levelState(o, st, level) {
  const tac = tacOf(st, level);
  const ids = new Set(levelAll(o, st, level).map((p) => p.id));
  const view = new Proxy(st, {
    get: (t, k) => (TAC.has(k) ? tac[k] : k === 'active' ? ids : t[k]),
    set: (t, k, v) => { if (TAC.has(k)) tac[k] = v; else t[k] = v; return true; },
  });
  return { view, tac, ids };
}

const sig = (tac) => JSON.stringify([tac.lineupR, tac.lineupL, tac.rotation, tac.pen, tac.rotMode]);

/** Make a level's saved choices fit who is there now (new players, men moved away). Returns true when you have changed something since the last call (which also hands the level to you). */
export function syncLevel(o, st, level) {
  const { view, tac, ids } = levelState(o, st, level);
  const edited = tac.sig != null && tac.sig !== sig(tac);
  const hit = activeHitters(o, view), healthy = hit.filter((p) => !p.injury);
  const bad = (lu) => lu.length !== 9 || lu.some((s) => !ids.has(s.id)) || lineupProblems(lu, o, view).length;
  for (const k of ['lineupR', 'lineupL']) if (bad(tac[k])) tac[k] = bestLineup(healthy.length >= 9 ? healthy : hit, k === 'lineupR' ? 'R' : 'L');
  const arms = o.players.filter((p) => ids.has(p.id) && isPitcher(p));
  if (tac.rotation.some((id) => !ids.has(id)) || tac.rotation.length < Math.min(5, arms.length) || Object.keys(tac.pen).some((id) => !ids.has(id))) {
    autoStaff(o, view); // new men or men moved away: the assistant fills the staff again
  }
  if (edited && !tac.manual) tac.manual = true;
  tac.sig = sig(tac);
  return edited;
}

/** The lineup the games at this level will use against a starter throwing `hand`, or null for the assistant's own choice. */
export function userLineup(o, st, level, hand, hitters) {
  const tac = st.minor?.[level];
  if (!tac?.manual) return null;
  const lu = hand === 'L' ? tac.lineupL : tac.lineupR;
  const ok = lu.length === 9 && lu.every((s) => hitters.some((p) => p.id === s.id));
  return ok && !lineupProblems(lu, o, { active: new Set(hitters.map((p) => p.id)) }).length ? lu : null;
}

/**
 * The assistant arranges the minor leagues: at Triple-A, Double-A, High-A and Single-A the best players (hitters and
 * pitchers separately) go to the higher levels, every level keeps the number of each it has now, and the lineups,
 * rotations and bullpens at every level go back to the assistant's own choice. Returns how many players changed level.
 */
export function arrangeMinors(o, st) {
  const order = ['AAA', 'AA', 'A+', 'A'];
  const movable = o.players.filter((p) => order.includes(st.level.get(p.id)) && !st.active.has(p.id) && !st.il.has(p.id) && !st.dfa.has(p.id) && !p.rehab);
  let moved = 0;
  for (const pit of [true, false]) {
    const group = movable.filter((p) => isPitcher(p) === pit);
    const sizes = order.map((lv) => group.filter((p) => st.level.get(p.id) === lv).length);
    const ranked = group.slice().sort((a, b) => value(b) - value(a) || a.age - b.age);
    let i = 0;
    order.forEach((lv, k) => {
      for (let n = 0; n < sizes[k]; n++, i++) {
        const p = ranked[i];
        if (st.level.get(p.id) !== lv) { st.level.set(p.id, lv); moved++; }
      }
    });
  }
  for (const lv of MINOR_LEVELS) { const t = tacOf(st, lv); t.manual = false; t.rotMode = 'auto'; }
  syncTeams();
  return moved;
}
