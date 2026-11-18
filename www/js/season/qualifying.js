// Qualifying offers. Before free agency opens a club can offer a departing player one year at the average of the
// 125 highest salaries. He has until the market opens to decide. If he refuses and signs elsewhere, the club he
// leaves gets a compensation pick after the first round of the draft and the club that signs him loses its
// second-round pick (a later one if it has no second-round pick). A player can be offered one only once in his career.
import { game, orgState } from '../state.js';
import { Rng } from '../core/rng.js';
import { salaryIn, fullName } from '../data/world.js';
import { askingSalary, value } from './value.js';
import { message } from './inbox.js';
import { ownerOf } from './picks.js';

const QO_CACHE = { k: '', v: 0 };
const money = (v) => `$${(v / 1e6).toFixed(1)}M`;

/** The qualifying offer for the coming season: the average of the 125 highest salaries, to the nearest $100,000. */
export function qoAmount(year = game.year) {
  const key = `qo-${year}`;
  QO_CACHE.k !== key && (QO_CACHE.k = key, QO_CACHE.v = 0);
  if (QO_CACHE.v) return QO_CACHE.v;
  const sal = [];
  for (const p of game.world.list) {
    if (p.retired || !p.orgId) continue;
    const y = salaryIn(p, year);
    if (typeof y === 'number') sal.push(y);
  }
  sal.sort((a, b) => b - a);
  const top = sal.slice(0, 125);
  const v = top.length ? top.reduce((a, b) => a + b, 0) / top.length : 20e6;
  return (QO_CACHE.v = Math.round(v / 1e5) * 1e5);
}

/** Can his club still make him an offer: still its own, a free agent to be, never offered before, and worth a look. */
export function qoEligible(p) {
  return !!p.orgId && !p.qoUsed && !p.foreign && !p.retired && p.contract?.status !== 'signed' && !game.winter?.open && orgState(p.orgId).level.get(p.id) === 'FA';
}

/** The club makes the offer. Returns false if he cannot have one. */
export function makeOffer(p) {
  if (!qoEligible(p)) return false;
  p.qo = { org: p.orgId, year: game.year, amount: qoAmount(), status: 'offered' };
  p.qoUsed = true;
  return true;
}
export function withdrawOffer(p) {
  if (p.qo?.status !== 'offered') return false;
  delete p.qo; delete p.qoUsed;
  return true;
}

/** Would he take it? Players asking clearly more than the offer refuse; the rest usually accept. */
export function accepts(p, rng = new Rng(`qo-${game.year}-${p.id}`)) {
  const ask = askingSalary(p), amt = p.qo?.amount ?? qoAmount();
  if (ask >= amt * 1.15) return rng.chance(0.03);
  if (ask >= amt * 0.95) return rng.chance(0.3);
  return rng.chance(0.9);
}

/** A computer club's decision before the market: offer one to a player worth clearly more than the figure. */
export function clubWouldOffer(p) {
  return qoEligible(p) && value(p) >= 54 && askingSalary(p) >= qoAmount() * 1.2;
}

/** The player's answer: marks the offer accepted or declined and says which. */
export function decide(p) {
  if (p.qo?.status !== 'offered') return null;
  const yes = accepts(p);
  p.qo.status = yes ? 'accepted' : 'declined';
  return yes;
}

/** A club has signed a player who refused an offer: pick penalty for it, compensation for his old club. Once per player. */
export function noteSigning(p, oid) {
  const q = p.qo;
  if (!q || q.status !== 'declined' || q.counted || q.org === oid) return;
  q.counted = true;
  const slot = ((game.qoPicks ||= {})[q.year] ||= { comp: [], lost: [] });
  slot.comp.push(q.org);
  slot.lost.push(oid);
  const city = (id) => game.world.orgs.get(id)?.club.city ?? id;
  if (oid === game.orgId) message({ cat: 'club', player: p.id, title: `Draft pick forfeited for ${fullName(p)}`, body: `${fullName(p)} turned down a qualifying offer from ${city(q.org)}, so signing him costs you your second-round pick in the ${q.year} draft. ${city(q.org)} receive a compensation pick after the first round.` });
  else if (q.org === game.orgId) message({ cat: 'club', player: p.id, title: `Compensation pick: ${fullName(p)} signed with ${city(oid)}`, body: `${fullName(p)} turned down your qualifying offer and has signed with ${city(oid)}. You receive a compensation pick after the first round of the ${q.year} draft, and ${city(oid)} lose their second-round pick.` });
}

/** The picks that change in a draft: compensation picks (clubs, in the order they were earned) and clubs losing one. */
export const pickChanges = (year) => game.qoPicks?.[year] ?? { comp: [], lost: [] };

/** The order a draft is made in: every round in the base order, with each pick going to whoever owns it now, compensation picks after round one, and penalty picks removed. */
export function draftSequence(order, rounds, year) {
  const ch = pickChanges(year);
  const seq = [];
  for (let r = 1; r <= rounds; r++) {
    for (const orig of order) seq.push({ org: ownerOf(year, r, orig), orig, round: r });
    if (r === 1) for (const org of ch.comp) seq.push({ org, orig: org, round: 1, comp: true });
  }
  // a club that signed a player who refused its offer loses its second-round pick (its third if it holds none), whoever began with it
  for (const org of ch.lost) {
    for (const r of [2, 3, 4]) {
      const i = seq.findIndex((x) => x.org === org && x.round === r && !x.comp);
      if (i >= 0) { seq.splice(i, 1); break; }
    }
  }
  return seq;
}
export { money };
