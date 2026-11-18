// The assistant on the waiver wire and in the Rule 5 draft. With the option switched on in Game Options, he puts in
// waiver claims for players who would help, protects your best exposed prospects on the deadline, makes your list for the
// draft, and tells you what he did. Where a move needs a place on the 40-man roster he clears one only by designating
// somebody clearly weaker, never a Rule 5 pick, a locked player or anyone on the active roster or injured list.
import { game, orgState } from '../state.js';
import { fullName } from '../data/world.js';
import { counts, addToForty } from '../club/depth.js';
import { value } from './value.js';
import { designate } from './roster.js';
import { message } from './inbox.js';

const on = () => !!game.settings.assistantWire;
const me = () => game.world.orgs.get(game.orgId);

/** Who the assistant would let go to make a 40-man place: weakest first. Used by the pop-ups as well. */
export function cuttable(o = me(), st = orgState(game.orgId), except = null) {
  return o.players.filter((x) => st.forty.has(x.id) && x.id !== except?.id && !x.rule5 && !st.active.has(x.id) && !st.il.has(x.id) && !st.lock?.[x.id]).sort((a, b) => value(a) - value(b));
}

/** Free a 40-man place for p if that costs somebody clearly weaker. Returns the player designated, null if there was room already, or false. */
function clearSpot(p, margin) {
  const o = me(), st = orgState(game.orgId);
  if (counts(o, st).forty < 40) return null;
  const cut = cuttable(o, st, p)[0];
  if (!cut || value(cut) > value(p) - margin || designate(o, st, cut)) return false;
  return cut;
}

/** Each day: put in a claim for a player another club has designated, if he would help us. One claim at a time. */
export function wireDay() {
  if (!on() || !['spring', 'regular'].includes(game.phase)) return;
  const claims = (game.claims ||= {});
  if (Object.keys(claims).length) return;
  const o = me(), st = orgState(game.orgId);
  const best = [];
  for (const other of game.world.orgs.values()) {
    if (other.id === game.orgId) continue;
    for (const id of orgState(other.id).dfa.keys()) {
      const p = game.world.players.get(id);
      if (!p) continue;
      const mates = [...st.forty].map((x) => game.world.players.get(x)).filter((x) => x && x.kind === p.kind);
      const worst = Math.min(...mates.map(value), 99);
      if (value(p) >= 46 && value(p) >= worst + 4) best.push({ p, other, v: value(p) });
    }
  }
  best.sort((a, b) => b.v - a.v);
  const pick = best[0];
  if (!pick) return;
  const cut = clearSpot(pick.p, 6);
  if (cut === false) return;
  claims[pick.p.id] = true;
  message({ cat: 'club', player: pick.p.id, title: `Waivers: your assistant put in a claim for ${fullName(pick.p)}`, body: `${pick.other.club.city} designated ${fullName(pick.p)} (${pick.p.age}) for assignment and he looks better than what you have at the back of the 40-man roster.${cut ? ` To make a place the assistant designated ${fullName(cut)}, who is the weakest player you can spare.` : ''} Clubs with a worse record get the first call, so the claim may not come off. You will hear the result.` });
}

/** The protection deadline: the best of your exposed players go on the 40-man roster while there is room (or somebody clearly weaker to cut). */
export function assistantProtect(exposed) {
  if (!on()) return;
  const done = [], cutLog = [];
  for (const p of exposed.filter((x) => value(x) >= 46).slice(0, 4)) {
    const cut = clearSpot(p, 8);
    if (cut === false) continue;
    if (cut) cutLog.push(cut);
    addToForty(orgState(game.orgId), p);
    done.push(p);
  }
  message({ cat: 'club', important: true, title: done.length ? `Rule 5: your assistant protected ${done.length} player${done.length === 1 ? '' : 's'}` : 'Rule 5: your assistant protected nobody',
    body: done.length ? `He put ${done.map((p) => `${fullName(p)} (${p.age})`).join(', ')} on the 40-man roster so that no club can pick ${done.length === 1 ? 'him' : 'them'}.${cutLog.length ? ` To make room he designated ${cutLog.map(fullName).join(' and ')}.` : ''}` : 'None of your eligible players was good enough to be worth a 40-man place, and there was nobody weaker to let go.' });
}

/** The draft: if you have not made a list, the assistant makes one from the best players left open, within the room you have. */
export function assistantList(R, available) {
  if (!on() || R.queue.length) return;
  const o = me(), st = orgState(game.orgId);
  const worst = (k) => Math.min(...[...st.forty].map((x) => game.world.players.get(x)).filter((x) => x && x.kind === k).map(value), 99);
  const picks = available().filter((p) => value(p) >= Math.max(48, worst(p.kind) + 1)).slice(0, 2);
  const names = [];
  for (const p of picks) {
    const cut = clearSpot(p, 8);
    if (cut === false) continue;
    R.queue.push(p.id);
    names.push(fullName(p));
    if (counts(o, st).forty >= 40) break; // the pick will fill the last place
  }
  if (names.length) message({ cat: 'club', title: 'Rule 5: your assistant made your list', body: `You had no list, so your assistant put ${names.join(' and ')} on it. He picks for you in your turn if they are still there. Each must stay on your active roster all season or be offered back.` });
}
