// Undo for your own roster moves, until you press Continue. Each move (or batch of moves the assistant
// makes for you) takes a snapshot of your organisation first; Undo puts it back exactly.
import { game, orgState } from '../state.js';

const stack = [];

function snapshot() {
  const o = game.world.orgs.get(game.orgId);
  const st = orgState();
  const people = new Map();
  const remember = (p) => { if (p && !people.has(p.id)) people.set(p.id, { p, orgId: p.orgId, team: p.team, club: p.club, level: p.level, contract: structuredClone(p.contract), mv: p.mv ? p.mv.map((m) => ({ ...m })) : undefined }); };
  o.players.forEach(remember);
  return {
    people, remember, players: [...o.players], freeAgents: [...game.freeAgents], inbox: game.inbox.length,
    otherMoney: structuredClone(o.club.otherMoney || []),
    st: { ...st, level: new Map(st.level), active: new Set(st.active), forty: new Set(st.forty), il: new Map(st.il), dfa: new Map(st.dfa),
      dfaFrom: { ...(st.dfaFrom || {}) }, lineupR: [...st.lineupR], lineupL: [...st.lineupL], rotation: [...st.rotation], pen: { ...st.pen } },
  };
}

/** Call before a move you might want to take back. */
export function checkpoint(label) {
  stack.push({ label, snap: snapshot() });
  if (stack.length > 30) stack.shift();
}

export const lastMove = () => stack[stack.length - 1]?.label || null;

export function undo() {
  const top = stack.pop();
  if (!top) return null;
  restore(top.snap);
  return top.label;
}

function restore(snap) {
  const o = game.world.orgs.get(game.orgId);
  for (const x of snap.people.values()) {
    Object.assign(x.p, { orgId: x.orgId, team: x.team, club: x.club, level: x.level, contract: x.contract });
    if (x.mv) x.p.mv = x.mv; else delete x.p.mv;
  }
  o.players.splice(0, o.players.length, ...snap.players);
  game.freeAgents = snap.freeAgents;
  game.inbox.length = Math.min(game.inbox.length, snap.inbox);
  o.club.otherMoney = snap.otherMoney;
  Object.assign(orgState(), snap.st); // in place: open screens keep the same object
}

/** Run fn on the real state, return what it returns, and put everything back exactly (for working out a plan without making it). */
export function trial(fn) {
  const snap = snapshot();
  try { return fn(); } finally { restore(snap); }
}

export function clearUndo() { stack.length = 0; }
