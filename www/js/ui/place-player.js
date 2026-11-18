// Put a player you have just received straight into the lineup or the rotation. If he is not on the active roster yet
// he is called up first, and the usual box asks who makes way when the roster is full.
import { toast } from './dom.js';
import { fullName } from '../data/world.js';
import { rosterAction } from './roster-action.js';
import { checkpoint } from '../season/undo.js';
import { activeHitters, bestLineup, starterValue, playerIn } from '../club/depth.js';

async function onActive(o, st, p) {
  if (st.active.has(p.id)) return true;
  return rosterAction(o, st, p, { type: 'move', to: 'MLB' }, { ask: false, follow: false });
}

/** Pitcher into the rotation: a free spot if there is one, otherwise he takes the place of the weakest starter, who goes to the bullpen. */
export async function addToRotation(o, st, p) {
  if (st.rotation.includes(p.id)) { toast(`${fullName(p)} is already in the rotation.`); return false; }
  if (!(await onActive(o, st, p))) return false;
  checkpoint(`${fullName(p)} into the rotation`);
  let said = `${fullName(p)} is in the rotation.`;
  if (st.rotation.length >= 5) {
    const weakest = st.rotation.map((id) => playerIn(o, id)).filter(Boolean).sort((a, b) => starterValue(a) - starterValue(b))[0];
    if (weakest) {
      st.rotation = st.rotation.map((id) => (id === weakest.id ? p.id : id));
      st.pen = { ...st.pen, [weakest.id]: 'Long' };
      said = `${fullName(p)} takes ${fullName(weakest)}'s place in the rotation. ${fullName(weakest)} moves to long relief.`;
    }
  } else st.rotation = [...st.rotation, p.id];
  delete st.pen[p.id];
  toast(said);
  return true;
}

/** Hitter into the lineup: both lineups are picked again from the active players, and he plays where the best nine have him. */
export async function addToLineup(o, st, p) {
  if (!(await onActive(o, st, p))) return false;
  const hitters = activeHitters(o, st);
  const r = bestLineup(hitters, 'R'), l = bestLineup(hitters, 'L');
  const inR = r.some((x) => x.id === p.id), inL = l.some((x) => x.id === p.id);
  if (!inR && !inL) { toast(`${fullName(p)} is on the bench: he does not make either lineup ahead of the men already there.`); return true; }
  checkpoint(`${fullName(p)} into the lineup`);
  st.lineupR = r; st.lineupL = l;
  const where = (a) => a.find((x) => x.id === p.id)?.pos;
  toast(`${fullName(p)} is in the lineup${inR ? ` at ${where(r)} against right-handers` : ''}${inR && inL ? ' and' : ''}${inL ? ` at ${where(l)} against left-handers` : ''}.`);
  return true;
}
