// An organisation's roster decisions: who is on the 26-man active roster, at which level everyone
// plays, lineups against right- and left-handed starters, the rotation, bullpen roles and team
// instructions. autoOrg() is the assistant's choice, used for every AI club and as the user's start.
import { game, autoClub, registerAutoOrg } from '../state.js';
import { message } from '../season/inbox.js';
import { LEVELS, FIELD_POS, isPitcher, onForty, leaving, positions, grade, fullName } from '../data/world.js';
import { fieldingAt, familiarity } from '../data/attributes.js';
import { injuryWords } from '../season/injuries.js';

export const ACTIVE_MAX = 26;
export const PITCHERS_MAX = 13;
export const FORTY_MAX = 40;
export const PEN_ROLES = ['Closer', 'Setup', 'Setup', 'Matchup', 'Middle', 'Middle', 'Long', 'Long'];
export const ROLE_LIST = ['Closer', 'Setup', 'Matchup', 'Middle', 'Long'];
export const INSTRUCTIONS = {
  running: { label: 'Baserunning', options: [['conservative', 'Conservative', 'Steal only with the fastest runners.'], ['normal', 'Normal', 'Run when the odds favour it.'], ['aggressive', 'Aggressive', 'Put pressure on the catcher.']] },
  bunting: { label: 'Sacrifice bunts', options: [['never', 'Never', 'Play for the big inning.'], ['normal', 'Late and close', 'Weak hitters bunt the runner over late in close games.'], ['often', 'Often', 'Bunt whenever a run matters.']] },
  hook: { label: 'Starter hook', options: [['quick', 'Quick', 'Go to the bullpen early.'], ['normal', 'Normal', 'Pitch counts and the game decide.'], ['long', 'Long', 'Let starters work deep.']] },
  ibb: { label: 'Intentional walks', options: [['never', 'Never', 'Pitch to everyone.'], ['normal', 'Rarely', 'Only the most dangerous hitters, late and close.'], ['often', 'Freely', 'Set up force plays and the better matchup.']] },
};

// How much fielding matters at each position, and the cost of playing somewhere unfamiliar.
const DEF_WEIGHT = { C: 0.45, SS: 0.4, CF: 0.35, '2B': 0.3, '3B': 0.3, RF: 0.18, LF: 0.12, '1B': 0.06, DH: 0 };
const OUT_OF_POSITION = 25; // a player who has not played a position is a last resort there

export const offence = (p) => 0.3 * grade(p, 'Power') + 0.25 * grade(p, 'Contact') + 0.25 * grade(p, 'Eye') + 0.2 * grade(p, 'Avoid K');
/** Offence against a starter throwing `hand`: the platoon edge is worth a couple of grade points. */
const offVs = (p, hand) => offence(p) + ((p.bats === 'S' || (hand === 'R' ? p.bats === 'L' : p.bats === 'R')) ? 2.5 : 0);
let memo = null; // while a lineup is being built the same player, position and hand are priced over and over: remember the answers for that one call
export function valueAt(p, pos, hand = 'R') {
  if (memo) {
    const k = `${p.id}|${pos}|${hand}`;
    let v = memo.get(k);
    if (v === undefined) { v = valueAtRaw(p, pos, hand); memo.set(k, v); }
    return v;
  }
  return valueAtRaw(p, pos, hand);
}
function valueAtRaw(p, pos, hand) {
  if (pos === 'DH') return offVs(p, hand) - 1;
  // his fielding at this position, after what not knowing it costs him (the same as in a game)
  const r = fieldingAt(p, pos);
  const def = (pos === 'C' ? r.block * 0.3 + r.framing * 0.3 + r.cthrow * 0.2 + r.hands * 0.2 : r.range * 0.5 + r.hands * 0.3 + r.arm * 0.2) - 50;
  const fam = familiarity(p, pos);
  return offVs(p, hand) + def * DEF_WEIGHT[pos] - (fam >= 15 ? 0 : (15 - fam) * (OUT_OF_POSITION / 12));
}
export const pitchQuality = (p) => grade(p, 'Stuff') + grade(p, 'Movement') + grade(p, 'Control');
export const starterValue = (p) => pitchQuality(p) + 0.6 * grade(p, 'Stamina');

/** The assistant's set-up for a whole organisation. */
/** @param {{forty?:Set<string>, dfa?:Map<string,number>}} [keep] roster facts to carry over (the winter keeps 40-man rosters) */
export function autoOrg(org, keep = {}) {
  const forty = keep.forty ?? new Set(org.players.filter(onForty).map((p) => p.id));
  const level = new Map();
  for (const p of org.players) level.set(p.id, leaving(p) ? 'FA' : p.level === 'MLB' && !forty.has(p.id) ? 'AAA' : p.level);
  const st = {
    orgId: org.id, level, active: new Set(), lineupR: [], lineupL: [], rotation: [], pen: {},
    forty, // the 40-man roster
    il: new Map(),  // id -> { kind: 10 | 15 | 60, since: day }
    dfa: keep.dfa ?? new Map(), // id -> day designated for assignment
    minorRot: {},   // level -> index of the next starter
    instr: { running: 'normal', bunting: 'normal', hook: 'normal', ibb: 'normal' },
  };
  pickActive(org, st);
  autoLineups(org, st);
  autoStaff(org, st);
  return st;
}

/** 13 pitchers (5 starters, 8 relievers) and 13 hitters from the major league players on the 40-man roster. */
function pickActive(org, st) {
  const pool = org.players.filter((p) => st.level.get(p.id) === 'MLB' && st.forty.has(p.id) && !st.il.has(p.id));
  const arms = pool.filter(isPitcher);
  const starters = arms.filter((p) => p.role === 'Starter').sort((a, b) => starterValue(b) - starterValue(a)).slice(0, 5);
  const relievers = arms.filter((p) => !starters.includes(p)).sort((a, b) => pitchQuality(b) - pitchQuality(a)).slice(0, PITCHERS_MAX - starters.length);
  const bats = pool.filter((p) => !isPitcher(p));
  const chosen = new Set();
  // cover every position first (two catchers), then the best remaining bats
  const need = ['C', 'C', 'SS', 'CF', '2B', '3B', 'RF', 'LF', '1B'];
  for (const pos of need) {
    const best = bats.filter((p) => !chosen.has(p) && positions(p).includes(pos)).sort((a, b) => valueAt(b, pos) - valueAt(a, pos))[0];
    if (best) chosen.add(best);
  }
  for (const p of bats.slice().sort((a, b) => offence(b) - offence(a))) {
    if (chosen.size >= ACTIVE_MAX - starters.length - relievers.length) break;
    chosen.add(p);
  }
  st.active = new Set([...starters, ...relievers, ...chosen].map((p) => p.id));
  // everyone else in the majors goes to Triple-A
  for (const p of pool) if (!st.active.has(p.id)) st.level.set(p.id, 'AAA');
  // short of 13 and 13 (free agents leaving, injuries)? Call up from the 40-man first, then the best in Triple-A
  const order = ['AAA', 'AA', 'A+', 'A'];
  const short = (pit) => (pit ? PITCHERS_MAX : ACTIVE_MAX - PITCHERS_MAX) - [...st.active].filter((id) => isPitcher(org.players.find((x) => x.id === id)) === pit).length;
  for (const pit of [true, false]) {
    const value = pit ? pitchQuality : offence;
    const cands = org.players.filter((p) => isPitcher(p) === pit && !st.active.has(p.id) && order.includes(st.level.get(p.id)))
      .filter((p) => !st.il.has(p.id) && !p.injury)
      .sort((a, b) => (st.forty.has(b.id) - st.forty.has(a.id)) || (order.indexOf(st.level.get(a.id)) - order.indexOf(st.level.get(b.id))) || value(b) - value(a));
    for (const p of cands) {
      if (short(pit) <= 0) break;
      if (!st.forty.has(p.id)) addToForty(st, p);
      st.active.add(p.id);
      st.level.set(p.id, 'MLB');
    }
  }
}

export const activePlayers = (org, st) => org.players.filter((p) => st.active.has(p.id));
export const activeHitters = (org, st) => activePlayers(org, st).filter((p) => !isPitcher(p));
export const activePitchers = (org, st) => activePlayers(org, st).filter(isPitcher);

/**
 * Best lineup against a starter throwing `hand`: scarce positions filled first, the best remaining bat
 * at DH, then improved by trying every bench swap and every exchange of positions until nothing helps.
 */
export function bestLineup(hitters, hand) {
  const outer = memo;
  memo = outer || new Map();
  try { return bestLineupNow(hitters, hand); } finally { memo = outer; }
}

function bestLineupNow(hitters, hand) {
  const used = new Set();
  const slots = [];
  for (const pos of ['C', 'SS', 'CF', '2B', '3B', 'RF', 'LF', '1B']) {
    const cands = hitters.filter((p) => !used.has(p.id)).sort((a, b) => valueAt(b, pos, hand) - valueAt(a, pos, hand));
    if (!cands.length) continue;
    used.add(cands[0].id);
    slots.push({ id: cands[0].id, pos });
  }
  const dh = hitters.filter((p) => !used.has(p.id)).sort((a, b) => offVs(b, hand) - offVs(a, hand))[0];
  if (dh) slots.push({ id: dh.id, pos: 'DH' });
  improve(slots, hitters, hand);
  return battingOrder(slots, hitters, hand);
}

function improve(slots, hitters, hand) {
  const byId = new Map(hitters.map((p) => [p.id, p]));
  const v = (id, pos) => valueAt(byId.get(id), pos, hand);
  for (let pass = 0; pass < 20; pass++) {
    let better = false;
    // exchange positions between two players in the lineup
    for (let i = 0; i < slots.length; i++) {
      for (let j = i + 1; j < slots.length; j++) {
        const a = slots[i], b = slots[j];
        if (v(a.id, b.pos) + v(b.id, a.pos) > v(a.id, a.pos) + v(b.id, b.pos) + 0.01) { [a.pos, b.pos] = [b.pos, a.pos]; better = true; }
      }
    }
    // bring in a bench player
    const inLu = new Set(slots.map((s) => s.id));
    for (const s of slots) {
      for (const p of hitters) {
        if (inLu.has(p.id)) continue;
        if (v(p.id, s.pos) > v(s.id, s.pos) + 0.01) { inLu.delete(s.id); inLu.add(p.id); s.id = p.id; better = true; }
      }
    }
    if (!better) break;
  }
}

/** On-base skill at the top, the best all-round bats second and third, power fourth. */
function battingOrder(slots, hitters, hand) {
  const byId = new Map(hitters.map((p) => [p.id, p]));
  const obs = (s) => { const p = byId.get(s.id); return grade(p, 'Eye') + grade(p, 'Contact') + 0.5 * grade(p, 'Speed'); };
  const all = (s) => offVs(byId.get(s.id), hand);
  const pow = (s) => grade(byId.get(s.id), 'Power');
  const left = [...slots];
  const take = (f) => { left.sort((a, b) => f(b) - f(a)); return left.shift(); };
  const second = take(all), third = take(all);
  const first = take(obs);
  const fourth = take(pow);
  const rest = left.sort((a, b) => all(b) - all(a));
  return [first, second, third, fourth, ...rest].filter(Boolean);
}

function autoLineups(org, st) {
  const hitters = activeHitters(org, st);
  st.lineupR = bestLineup(hitters, 'R');
  st.lineupL = bestLineup(hitters, 'L');
}

export function autoStaff(org, st) {
  const arms = activePitchers(org, st);
  st.rotation = arms.filter((p) => p.role === 'Starter').sort((a, b) => starterValue(b) - starterValue(a)).slice(0, 5).map((p) => p.id);
  for (const p of arms.filter((x) => !st.rotation.includes(x.id)).sort((a, b) => starterValue(b) - starterValue(a))) {
    if (st.rotation.length >= 5) break;
    st.rotation.push(p.id);
  }
  st.pen = autoRoles(arms.filter((p) => !st.rotation.includes(p.id)));
}

/** Closer and setup men by quality, a left-hander for matchups, the most stamina for long relief. */
export function autoRoles(relievers) {
  // late innings want strikeouts most, and a pitcher who closed last season gets the benefit of the doubt
  const late = (p) => 1.4 * grade(p, 'Stuff') + grade(p, 'Movement') + grade(p, 'Control') + (p.role === 'Closer' ? 3 : 0);
  const left = relievers.slice().sort((a, b) => late(b) - late(a));
  const roles = {};
  const take = (role, pred = () => true) => {
    const i = left.findIndex(pred);
    if (i >= 0) roles[left.splice(i, 1)[0].id] = role;
  };
  take('Closer'); take('Setup'); take('Setup');
  take('Matchup', (p) => p.throws === 'L');
  left.sort((a, b) => grade(b, 'Stamina') - grade(a, 'Stamina'));
  take('Long'); take('Long');
  for (const p of left) roles[p.id] = 'Middle';
  return roles;
}

// ---------- checks and moves ----------

/** Problems with a lineup, in words, or [] when it is legal. */
export function lineupProblems(lineup, org, st) {
  const out = [];
  if (lineup.length !== 9) out.push(`The lineup has ${lineup.length} players, not nine.`);
  const ids = new Set(lineup.map((s) => s.id));
  if (ids.size !== lineup.length) out.push('A player is listed twice.');
  for (const pos of [...FIELD_POS, 'DH']) {
    const n = lineup.filter((s) => s.pos === pos).length;
    if (n === 0) out.push(`Nobody is playing ${pos}.`);
    if (n > 1) out.push(`${n} players are at ${pos}.`);
  }
  for (const s of lineup) {
    const who = playerIn(org, s.id);
    if (!who) out.push('A player in the lineup has left the club.');
    else if (!st.active.has(s.id)) out.push(`${fullName(who)} is not on the active roster.`);
  }
  return out;
}

/** A club message sent at most once a day under one title: a repeat the same day replaces the earlier text instead of adding another. */
function messageOnce(m) {
  const day = game.date.toDateString();
  const old = [...game.inbox].reverse().find((x) => x.title === m.title && !x.closed && new Date(x.date).toDateString() === day);
  if (old) game.inbox.splice(game.inbox.indexOf(old), 1);
  message(m);
}

export const playerIn = (org, id) => org.players.find((p) => p.id === id);

export function counts(org, st) {
  const active = activePlayers(org, st);
  let il60 = 0;
  for (const [id, x] of st.il) if (x.kind === 60 && st.forty.has(id)) il60++;
  return { active: active.length, pitchers: active.filter(isPitcher).length, forty: st.forty.size - il60 };
}

/** Put a player on the 40-man roster; a minor league contract becomes a major league one at the minimum. */
export function addToForty(st, p) {
  st.forty.add(p.id);
  if (!p.contract || p.contract.status === 'minor league') {
    p.contract = { ...(p.contract || {}), status: 'pre-arbitration', serviceTime: p.contract?.serviceTime ?? 0, options: p.contract?.options ?? 3,
      years: [{ season: game.year, salary: 780000 }], text: 'Selected to the 40-man roster' };
  }
}

/**
 * Move a player to another level. Returns null when done, or the reason it cannot be done.
 * The limits checked here are the 26-man active roster (13 pitchers at most) and the 40-man roster; options,
 * waivers and service time are handled by season/roster.js when a move is confirmed.
 */
export function movePlayer(org, st, p, to) {
  const from = st.active.has(p.id) ? 'MLB' : st.level.get(p.id);
  if (from === to) return null;
  if (from === 'FA') return 'He becomes a free agent this winter. Re-signing players arrives with the player market.';
  if (to === 'MLB') {
    const c = counts(org, st);
    if (c.active >= ACTIVE_MAX) return 'The active roster is full (26). Send someone down first.';
    if (isPitcher(p) && c.pitchers >= PITCHERS_MAX) return 'The active roster already has 13 pitchers.';
    if (!st.forty.has(p.id)) {
      if (c.forty >= FORTY_MAX) return 'The 40-man roster is full. He needs a place on it before he can be called up.';
      addToForty(st, p);
    }
    st.active.add(p.id);
    st.level.set(p.id, 'MLB');
  } else {
    st.active.delete(p.id);
    st.level.set(p.id, to);
  }
  repair(org, st);
  return null;
}

const lineupSnap = (st) => ['lineupR', 'lineupL'].map((k) => (st[k] || []).map((s) => `${s.id}:${s.pos}`).join(',')).join('|');

/**
 * A note about your staff that you have since dealt with is withdrawn: 'Your rotation has an open spot' once the
 * rotation is full again, 'Your lineup changed' once you have changed the lineup yourself. Unread, it goes from the
 * inbox; read, it says it has been dealt with.
 */
export function settleStaffNotes(st) {
  if (!st) return;
  for (let i = game.inbox.length - 1; i >= 0; i--) {
    const m = game.inbox[i];
    if (m.closed || m.cat !== 'club') continue;
    const kind = m.staff || (m.title === 'Your rotation has an open spot' ? 'rotation' : null); // older saves carry no tag
    if (!kind) continue;
    const done = kind === 'rotation' ? st.rotation.length >= (m.want || 5) || (m.rot != null && m.rot !== st.rotation.join())
      : m.snap != null && m.snap !== lineupSnap(st);
    if (!done) continue;
    if (!m.read) game.inbox.splice(i, 1);
    else m.closed = kind === 'rotation' ? 'Dealt with: you have set the rotation since.' : 'Dealt with: you have changed the lineup since.';
  }
}

let hush = 0;
/** Moves you make yourself (the Injury Centre, the roster boxes) show their result on the spot, so the 'Your lineup changed' mail is held back for them. */
export function withoutLineupNote(fn) { hush++; try { return fn(); } finally { hush--; } }

/** After a move, fill any lineup spot, rotation turn or bullpen role left by a player who is no longer active. */
export function repair(org, st) {
  // a player is only 'in the majors' while he is on the active roster or the injured list
  for (const [id, lv] of st.level) if (lv === 'MLB' && !st.active.has(id) && !st.il.has(id)) st.level.set(id, 'AAA');
  const everyone = activeHitters(org, st);
  const hitters = everyone.filter((p) => !p.injury);
  const changes = [];
  for (const key of ['lineupR', 'lineupL']) {
    if (st.lineupLock && org.id === game.orgId) continue; // a locked lineup is exactly as you set it
    const hand = key === 'lineupR' ? 'R' : 'L';
    const used = new Set(st[key].filter((s) => st.active.has(s.id)).map((s) => s.id));
    // a man who has left the active roster is replaced in his own place in the order, by the best player for that position;
    // nobody else moves, so a batting order you set is not shuffled
    const lu = [];
    let replaced = false;
    for (const s of st[key]) {
      if (st.active.has(s.id)) { lu.push(s); continue; }
      const best = hitters.filter((p) => !used.has(p.id)).sort((a, b) => valueAt(b, s.pos, hand) - valueAt(a, s.pos, hand))[0];
      if (best) { used.add(best.id); lu.push({ id: best.id, pos: s.pos }); replaced = true; changes.push({ key, out: s.id, inn: best.id, pos: s.pos }); }
    }
    const before = lu.length;
    for (const pos of [...FIELD_POS, 'DH']) {
      if (lu.some((s) => s.pos === pos)) continue;
      const best = hitters.filter((p) => !used.has(p.id)).sort((a, b) => valueAt(b, pos, hand) - valueAt(a, pos, hand))[0];
      if (best) { lu.push({ id: best.id, pos }); used.add(best.id); }
    }
    if (lu.length !== before) st[key] = battingOrder(lu, everyone, hand);
    else if (replaced || lu.length !== st[key].length) st[key] = lu;
  }
  if (changes.length && !hush && org.id === game.orgId && ['spring', 'regular'].includes(game.phase)) {
    const nm = (id) => { const p = org.players.find((x) => x.id === id) || game.world.players.get(id); return p ? fullName(p) : 'a player'; };
    const lines = ['lineupR', 'lineupL'].map((k) => [k, changes.filter((c) => c.key === k)]).filter(([, c]) => c.length)
      .map(([k, c]) => `Against ${k === 'lineupR' ? 'right' : 'left'}-handers: ${c.map((x) => `${nm(x.inn)} takes ${nm(x.out)}'s place at ${x.pos}`).join('; ')}.`);
    for (const c of changes) { const p = game.world.players.get(c.out); if (p) injuryNews(p); }
    messageOnce({ cat: 'club', staff: 'lineup', snap: lineupSnap(st), title: 'Your lineup changed', body: `Somebody in your lineup is no longer on the active roster (injured and moved to the injured list, sent down, traded or released), so the assistant put the best available player in his place and left the rest of the batting order as you had it.\n${lines.join('\n')}\nOpen Tactics to change it.` });
  }
  if (org.id === game.orgId && !autoClub()) { keepStaff(org, st); return; }
  const arms = activePitchers(org, st);
  st.rotation = st.rotation.filter((id) => st.active.has(id));
  for (const p of arms.filter((x) => !st.rotation.includes(x.id)).sort((a, b) => starterValue(b) - starterValue(a))) {
    if (st.rotation.length >= 5) break;
    st.rotation.push(p.id);
  }
  const pen = {};
  for (const p of arms) if (!st.rotation.includes(p.id)) pen[p.id] = st.pen[p.id] || 'Middle';
  st.pen = pen;
}

/** Why a player is off the active roster, in a few words. */
function whyOut(org, st, id) {
  const p = game.world.players.get(id);
  if (!p) return 'gone';
  if (p.orgId !== org.id) return p.orgId ? 'traded' : 'released';
  if (st.dfa?.has(id)) return 'designated for assignment';
  if (p.injury) return `injured: ${injuryWords(p.injury)}`;
  if (st.il?.has(id)) return 'on the injured list';
  return `sent down to ${st.level.get(id) || 'the minors'}`;
}

/** An injured player of yours always has an injury message, even when the injury began before the game was running or the news was lost. */
export function injuryNews(p) {
  if (!p.injury || p.orgId !== game.orgId) return;
  const since = new Date(game.date.getFullYear(), 0, 1).getTime();
  if (game.inbox.some((m) => m.cat === 'injury' && m.player === p.id && m.date >= since && /injured|Setback|treatment/i.test(m.title))) return;
  message({ cat: 'injury', important: true, stop: game.settings.stops.injuries, player: p.id, title: `${fullName(p)} injured: ${injuryWords(p.injury)}`,
    body: `${fullName(p)} is hurt: ${injuryWords(p.injury)}. He is out of your active roster until he is fit again.` });
}

/**
 * The manager's own pitching staff: when someone leaves the active roster his turn in the rotation
 * and his bullpen role simply go, and nobody else is moved. The computer never fills the gap or
 * reshuffles the others without being asked; the inbox says what is open.
 */
export function keepStaff(org, st) {
  const name = (id) => { const p = org.players.find((x) => x.id === id) || game.world.players.get(id); return p ? fullName(p) : 'a pitcher'; };
  const gone = st.rotation.filter((id) => !st.active.has(id));
  st.rotation = st.rotation.filter((id) => st.active.has(id));
  const pen = {};
  for (const p of activePitchers(org, st)) if (!st.rotation.includes(p.id)) pen[p.id] = st.pen[p.id] || 'Middle';
  st.pen = pen;
  if (gone.length && ['spring', 'regular'].includes(game.phase)) {
    for (const id of gone) { const p = game.world.players.get(id); if (p) injuryNews(p); }
    // a move you made yourself (the Injury Centre, the roster boxes) shows its result on the spot, so no mail for it
    if (hush) return gone;
    messageOnce({ cat: 'club', staff: 'rotation', want: Math.min(5, st.rotation.length + gone.length), rot: st.rotation.join(), title: 'Your rotation has an open spot', body: `${gone.map((id) => `${name(id)} (${whyOut(org, st, id)})`).join(' and ')} ${gone.length > 1 ? 'are' : 'is'} no longer on the active roster, so ${gone.length > 1 ? 'those turns are' : 'that turn is'} empty in your rotation (${st.rotation.length} starters). Nothing else was changed. Open Squad, Pitching Staff to fill the spot yourself, or press Automatic to let the assistant do it.` });
  }
  return gone;
}


export { LEVELS };

registerAutoOrg(autoOrg);
