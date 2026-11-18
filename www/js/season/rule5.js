// The Rule 5 draft. A minor leaguer who has been in pro ball long enough and is not on his club's 40-man roster can be picked by
// another club in December. The club that picks him pays a small fee and must keep him on its active roster all season, or offer
// him back to the club he came from. The pieces, in the order the winter brings them:
//   1 December      the protection deadline: clubs add their best eligible players to the 40-man roster (yours is your choice)
//   12 December     the draft, worst record first, one pick for each club that wants one
//   the spring      each club decides whether its pick makes the team; if not he goes back
//   90 days in      a pick who has stayed on the active roster belongs to his new club
import { assistantProtect, assistantList } from './wire.js';
import { fullName, isPitcher } from '../data/world.js';
import { game, orgState } from '../state.js';
import { Rng } from '../core/rng.js';
import { value } from './value.js';
import { dayNo, dateWords, fromDayNo } from './calendar.js';
import { message, about } from './inbox.js';
import { counts, addToForty, activeHitters, activePitchers } from '../club/depth.js';
import { transfer, designate, move, canOption, waiverOrder } from './roster.js';

export const FEE = 100000;
export const BACK_FEE = 50000;
export const KEEP_DAYS = 90;
export const MAX_QUEUE = 3;
const MINORS = ['AAA', 'AA', 'A+', 'A', 'R'];

export const R5 = () => (game.rule5 ||= { year: null, queue: [], protectedIds: [], done: false, log: [], mine: [] });

/** Called as the winter begins: a fresh list for this year's draft. */
export function startRule5() {
  game.rule5 = { year: game.year, queue: [], protectedIds: [], done: false, log: [], mine: [] };
}

/** Seasons of pro ball on his record. */
export function yearsPro(p) {
  const ys = new Set();
  for (const k of ['bat', 'pit']) for (const r of p.hist?.[k] || []) ys.add(r[0]);
  return ys.size;
}

/** Eligible to be picked: a minor leaguer with enough pro seasons, who is not on the 40-man roster. */
export function eligible(p) {
  if (!p || p.retired || !p.orgId || p.amateur || p.rule5 || !MINORS.includes(p.level)) return false;
  const st = orgState(p.orgId);
  if (st.forty.has(p.id) || st.dfa.has(p.id)) return false;
  const y = yearsPro(p);
  return y >= 4 || ((p.age ?? 0) >= 22 && y >= 3);
}

export const isProtected = (p) => R5().protectedIds.includes(p.id);
export const dates = () => {
  const y = game.year - 1;
  return { protect: new Date(y, 11, 1), draft: new Date(y, 11, 12) };
};
export const stage = (date = game.date) => {
  const d = dates();
  return dayNo(date) < dayNo(d.protect) ? 'before' : dayNo(date) < dayNo(d.draft) ? 'protected' : 'after';
};

/** Your players who could be picked, best first. */
export function myExposed() {
  const o = game.world.orgs.get(game.orgId);
  return o.players.filter(eligible).sort((a, b) => value(b) - value(a));
}
/** Players other clubs have left open, best first. */
export function available() {
  return [...game.world.orgs.values()].filter((o) => o.id !== game.orgId)
    .flatMap((o) => o.players.filter((p) => eligible(p) && !isProtected(p))).sort((a, b) => value(b) - value(a));
}
export const room = () => 40 - counts(game.world.orgs.get(game.orgId), orgState()).forty;

/** Put one of your players on the 40-man roster so no other club can pick him. Returns the reason it cannot be done, or null. */
export function protect(p) {
  const o = game.world.orgs.get(game.orgId), st = orgState();
  if (p.orgId !== game.orgId) return 'He is not in your organisation.';
  if (st.forty.has(p.id)) return null;
  if (counts(o, st).forty >= 40) return 'Your 40-man roster is full. Designate or release someone, or move a long injury to the 60-day list, to make room.';
  addToForty(st, p);
  return null;
}

/** Your queue for the draft: up to three players, in the order you would like them. */
export function queueAdd(p) {
  const q = R5().queue;
  if (q.includes(p.id)) return null;
  if (q.length >= MAX_QUEUE) return `Your list is full (${MAX_QUEUE}). Remove someone first.`;
  q.push(p.id);
  return null;
}
export const queueRemove = (p) => { const r = R5(); r.queue = r.queue.filter((x) => x !== p.id); };
export const queueMove = (p, by) => {
  const q = R5().queue, i = q.indexOf(p.id), j = i + by;
  if (i < 0 || j < 0 || j >= q.length) return;
  [q[i], q[j]] = [q[j], q[i]];
};

// ---------- the protection deadline ----------

/** On 1 December the computer clubs name the players they will keep safe: their best few, whether or not there is room. */
export function protectionDay() {
  const R = R5();
  for (const o of game.world.orgs.values()) {
    if (o.id === game.orgId) continue;
    const mine = o.players.filter(eligible).sort((a, b) => value(b) - value(a));
    const n = mine.filter((p) => value(p) >= 46).slice(0, 4);
    for (const p of n) R.protectedIds.push(p.id);
  }
  assistantProtect(myExposed());
  const exposed = myExposed().filter((p) => value(p) >= 44);
  message({
    cat: 'club', important: true, stop: game.settings.stops.important, title: 'Rule 5: the protection deadline has passed',
    body: exposed.length
      ? `Clubs have named the players they are protecting. ${exposed.length === 1 ? 'One of your players is' : `${exposed.length} of your players are`} still open to the Rule 5 draft on ${dateWords(dates().draft)}: ${exposed.slice(0, 5).map(fullName).join(', ')}. Another club can pick a player and keep him if he is good enough, and you lose him. You will hear about it either way.`
      : 'Clubs have named the players they are protecting. None of your minor leaguers is likely to be taken in the Rule 5 draft.',
  });
}

/** A few days ahead: a reminder, with the names, so that nothing is lost by not having looked. */
export function protectionReminder() {
  const exposed = myExposed().filter((p) => value(p) >= 44);
  const free = room();
  message({
    cat: 'club', important: true, stop: game.settings.stops.important, title: 'Rule 5: protect your players by 1 December',
    body: `On ${dateWords(dates().protect)} clubs name the minor leaguers they want to keep safe. Anyone left off the 40-man roster who has been in pro ball long enough can be picked by another club in the Rule 5 draft on ${dateWords(dates().draft)}.\n\nYou have ${free} spot${free === 1 ? '' : 's'} free on the 40-man roster. ${exposed.length ? `Players other clubs may want: ${exposed.slice(0, 6).map((p) => `${fullName(p)} (${p.age})`).join(', ')}.` : 'None of your eligible players looks worth protecting.'}\n\nOpen Transfers, then Rule 5, to protect a player with one click. You do not have to protect anyone.`,
  });
}

// ---------- the draft ----------

const takeFee = (o, p, amount) => (o.club.otherMoney ||= []).push({ name: `${p.last}, ${p.first}`, note: 'Rule 5 fee', years: { [game.year]: amount } });

/** One club picks a player. */
function take(p, orgId) {
  const from = p.orgId, fromLevel = p.level, o = game.world.orgs.get(orgId), st = orgState(orgId);
  transfer(p, orgId, 'AAA', 'rule5', { note: 'Rule 5 draft' });
  addToForty(st, p);
  p.rule5 = { from, fromLevel, year: game.year, to: orgId };
  (st.lock ||= {})[p.id] = true;
  if (orgId === game.orgId) takeFee(o, p, FEE);
  return from;
}

/** The computer's pick: the best open player who could help it, if it has room or can make room. */
function aiPick(o, taken) {
  const st = orgState(o.id);
  const worst = (isP) => Math.min(...(isP ? activePitchers(o, st) : activeHitters(o, st)).map(value), 99);
  const pool = [...game.world.orgs.values()].filter((x) => x.id !== o.id)
    .flatMap((x) => x.players.filter((p) => eligible(p) && !isProtected(p) && !taken.has(p.id)))
    .filter((p) => value(p) >= Math.max(42, worst(isPitcher(p))));
  pool.sort((a, b) => value(b) - value(a));
  const p = pool[0];
  if (!p) return null;
  if (counts(o, st).forty >= 40) {
    const cut = [...st.forty].map((x) => game.world.players.get(x)).filter((x) => x && !x.rule5 && !st.active.has(x.id) && !st.il.has(x.id) && !st.lock?.[x.id])
      .sort((a, b) => value(a) - value(b))[0];
    if (!cut || value(cut) > value(p) - 4) return null;
    designate(o, st, cut);
  }
  return p;
}

/** The draft itself, on the last day of the winter meetings. Returns the picks. */
export function rule5Draft() {
  const R = R5();
  if (R.done) return [];
  R.done = true;
  assistantList(R, available);
  const taken = new Set(), picks = [];
  const myRoom = () => 40 - counts(game.world.orgs.get(game.orgId), orgState()).forty;
  const skipped = [];
  for (const orgId of waiverOrder()) {
    const o = game.world.orgs.get(orgId);
    if (!o) continue;
    let p = null;
    if (orgId === game.orgId) {
      p = R.queue.map((id) => game.world.players.get(id)).find((x) => x && eligible(x) && !isProtected(x) && !taken.has(x.id) && x.orgId !== game.orgId) || null;
      if (p && myRoom() <= 0) { skipped.push(p); p = null; }
    } else if (new Rng(`r5-${game.year}-${orgId}`).chance(0.5)) p = aiPick(o, taken);
    if (!p) continue;
    taken.add(p.id);
    const from = take(p, orgId);
    picks.push({ pid: p.id, from, to: orgId, n: picks.length + 1 });
    if (from === game.orgId) message({ cat: 'club', important: true, player: p.id, title: `${fullName(p)} taken in the Rule 5 draft`, body: `${o.club.city} picked ${fullName(p)} from your minor leagues in the Rule 5 draft. He leaves your organisation unless ${o.club.city} cannot keep him on their major league roster this season, in which case he is offered back to you.\n${about(p)}` });
    if (orgId === game.orgId) message({ cat: 'club', important: true, player: p.id, title: `You picked ${fullName(p)} in the Rule 5 draft`, body: `${fullName(p)} (${p.age}) comes from ${game.world.orgs.get(from).club.city} for a fee of $${FEE / 1000}k and goes on your 40-man roster.\n\nThe rule: he must be on your active roster for the whole season. If you do not want to keep him you can offer him back to ${game.world.orgs.get(from).club.city}; you will be charged $${BACK_FEE / 1000}k. After ${KEEP_DAYS} days of the season he is yours without conditions.\n${about(p)}` });
  }
  R.log = picks;
  if (skipped.length) message({ cat: 'club', important: true, title: 'Rule 5: your list was skipped', body: `Your 40-man roster was full, so ${skipped.map(fullName).join(', ')} could not be picked. Next year, make room before the draft.` });
  else if (R.queue.length && !picks.some((x) => x.to === game.orgId)) message({ cat: 'club', title: 'Rule 5: nobody on your list was left', body: 'Every player on your list was either protected or taken before your turn.' });
  const top = picks.slice(0, 8).map((x) => ({ pid: x.pid, t: fullName(game.world.players.get(x.pid)) }));
  if (picks.length) message({ cat: 'league', quiet: true, title: `The Rule 5 draft: ${picks.length} picks`, parts: [{ p: `${picks.length} players were taken in the Rule 5 draft.` }, { head: ['Pick', 'Player', 'Taken by', 'From'], rows: picks.slice(0, 12).map((x) => [x.n, { pid: x.pid, t: fullName(game.world.players.get(x.pid)) }, game.world.orgs.get(x.to).club.city, game.world.orgs.get(x.from).club.city]) }], body: 'The Rule 5 draft is over.' });
  void top;
  return picks;
}

// ---------- keeping a pick, or giving him back ----------

export const mineRule5 = () => game.world.orgs.get(game.orgId).players.filter((p) => p.rule5);

/** Offer him back to the club he came from. Always allowed; costs half the fee. Returns null. */
export function offerBack(p, why = 'offered back') {
  const r = p.rule5;
  if (!r) return 'He is not a Rule 5 pick.';
  const holder = game.world.orgs.get(p.orgId), origin = game.world.orgs.get(r.from);
  const wasMine = p.orgId === game.orgId;
  const st = orgState(p.orgId);
  if (st.lock) delete st.lock[p.id];
  const fee = holder.club.otherMoney?.findIndex((x) => x.name === `${p.last}, ${p.first}` && x.note === 'Rule 5 fee');
  if (wasMine && fee >= 0) { holder.club.otherMoney.splice(fee, 1); takeFee(holder, p, BACK_FEE); }
  const level = r.fromLevel && MINORS.includes(r.fromLevel) ? r.fromLevel : 'AA';
  delete p.rule5;
  transfer(p, r.from, level, 'rule5back', { note: why });
  if (wasMine) message({ cat: 'club', player: p.id, title: `${fullName(p)} goes back to ${origin.club.city}`, body: `${fullName(p)} was ${why} to ${origin.club.city}.${fee >= 0 ? ` You pay $${BACK_FEE / 1000}k.` : ''}` });
  if (r.from === game.orgId) message({ cat: 'club', player: p.id, title: `${fullName(p)} is back`, body: `${holder.club.city} could not keep ${fullName(p)} and he has returned to your organisation, at ${level}.\n${about(p)}` });
  return null;
}

/** Spring: each computer club decides whether its pick is good enough for the active roster. Run once, as the season opens. */
export function rule5Opening(assistant = false) {
  for (const o of game.world.orgs.values()) {
    const st = orgState(o.id);
    if (o.id === game.orgId) {
      // when the assistant runs your club it makes the call: he plays if there is room, otherwise he goes back
      if (assistant || game.settings.assistantWire) for (const p of o.players.filter((x) => x.rule5 && !st.active.has(x.id) && !st.il.has(x.id))) if (move(o, st, p, 'MLB')) offerBack(p, 'offered back');
      continue;
    }
    for (const p of o.players.filter((x) => x.rule5)) {
      const worst = Math.min(...(isPitcher(p) ? activePitchers(o, st) : activeHitters(o, st)).map(value), 99);
      let keep = value(p) >= worst - 1 && new Rng(`r5k-${game.year}-${p.id}`).chance(0.75);
      if (keep && !st.active.has(p.id)) {
        let err = move(o, st, p, 'MLB');
        if (err) {
          const down = (isPitcher(p) ? activePitchers(o, st) : activeHitters(o, st)).filter((x) => !st.lock?.[x.id] && canOption(x)).sort((a, b) => value(a) - value(b))[0];
          if (down && value(down) < value(p) && !move(o, st, down, 'AAA')) err = move(o, st, p, 'MLB');
        }
        keep = !err;
      }
      if (!keep) offerBack(p, 'returned');
    }
  }
}

/** The problem you must fix before the season: a Rule 5 pick who is not on the active roster. */
export function rule5Problems(o, st) {
  const out = [];
  for (const p of o.players.filter((x) => x.rule5 && x.orgId === o.id)) {
    if (!st.active.has(p.id) && !st.il.has(p.id)) out.push(`${fullName(p)} is a Rule 5 pick and must be on your active roster. Activate him, or offer him back to ${game.world.orgs.get(p.rule5.from).club.city} from his profile or the Rule 5 page.`);
  }
  return out;
}

/** Each day of the season: after enough days the pick is simply yours. */
export function rule5Day(d) {
  if (!game.season || d - game.season.start < KEEP_DAYS) return;
  for (const o of game.world.orgs.values()) {
    for (const p of o.players.filter((x) => x.rule5)) {
      const st = orgState(o.id);
      if (st.lock) delete st.lock[p.id];
      delete p.rule5;
      if (o.id === game.orgId) message({ cat: 'club', player: p.id, title: `${fullName(p)} is yours for good`, body: `${fullName(p)} has stayed on your roster for ${KEEP_DAYS} days of the season. The Rule 5 conditions no longer apply and you can move him like any other player.` });
    }
  }
}

/** Why a Rule 5 pick cannot be sent down or designated, or null. */
export function ruleNote(p) {
  if (!p.rule5) return null;
  return `${fullName(p)} is a Rule 5 pick: he has to stay on the active roster (the injured list is fine) until ${dateWords(fromDayNo(game.season ? game.season.start + KEEP_DAYS : dayNo(game.date)))}. If you do not want him, offer him back to ${game.world.orgs.get(p.rule5.from).club.city}.`;
}
