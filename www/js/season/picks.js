// Draft picks as trade assets. A pick is named by its draft year, its round and the club it began with ("2028:1:BOS").
// Everyone owns their own picks until a trade moves one; the owner is kept in game.pickOwner. A draft uses the owner of
// each pick, so a club that traded its second-round pick no longer picks in that round and the club that got it does.
// Compensation picks (for qualifying offers) are not tradable.
import { game } from '../state.js';
import { slotValue } from './draft.js';
import { money } from '../data/world.js';

export const ROUNDS = 20;
/** Ask a draft class's value in dollars of surplus: a bit over three times the slot money. */
const MULT = 3.5;

export const pickKey = (year, round, orig) => `${year}:${round}:${orig}`;
export const parseKey = (k) => { const [y, r, o] = k.split(':'); return { year: +y, round: +r, orig: o }; };
export const ownerOf = (year, round, orig) => game.pickOwner?.[pickKey(year, round, orig)] ?? orig;

/** The drafts whose picks can be traded: the coming one (until it is held) and the two after it. */
export function tradableYears() {
  const y = game.year;
  return [...(game.drafts?.[y] ? [] : [y]), y + 1, y + 2];
}

const clubs = () => game.world.mlb.map((c) => c.org);

/** Every pick a club holds, as keys, best first. */
export function picksOf(orgId, { rounds = ROUNDS } = {}) {
  const out = [];
  for (const year of tradableYears()) for (let r = 1; r <= rounds; r++) for (const orig of clubs()) if (ownerOf(year, r, orig) === orgId) out.push(pickKey(year, r, orig));
  return out;
}
export const holds = (orgId, key) => { const { year, round, orig } = parseKey(key); return tradableYears().includes(year) && ownerOf(year, round, orig) === orgId; };

/** Where a club is likely to pick in a round, 1 (worst record) to 30, from last season's record. */
function projectedSlot(orig) {
  const rec = (c) => { const r = game.history?.[game.year - 1]?.clubs?.[c]; return r ? r.w / Math.max(1, r.w + r.l) : (() => { const q = game.world.orgs.get(c)?.club.record2026; return q ? q[0] / Math.max(1, q[0] + q[1]) : 0.5; })(); };
  const sorted = clubs().slice().sort((a, b) => rec(a) - rec(b));
  return sorted.indexOf(orig) + 1;
}

/** What a pick is worth, in the same dollars as a player's trade value. Picks further off are discounted, and the next draft's order is guessed from last season's record (the further-off ones from the middle). */
export function pickValue(key, plan = 'middle') {
  const { year, round, orig } = parseKey(key);
  const ahead = year - tradableYears()[0];
  const slot = ahead <= 0 ? projectedSlot(orig) : 15.5 + (projectedSlot(orig) - 15.5) * 0.4;
  const n = Math.round((round - 1) * 30 + slot);
  const tilt = plan === 'rebuild' ? 1.15 : plan === 'contend' ? 0.8 : 1;
  return slotValue(n) * MULT * 0.92 ** Math.max(0, ahead) * tilt;
}

export function pickLabel(key, viewerOrg = game.orgId) {
  const { year, round, orig } = parseKey(key);
  const nth = (n) => `${n}${[, 'st', 'nd', 'rd'][n % 10 > 3 || [11, 12, 13].includes(n) ? 0 : n % 10] || 'th'}`;
  const c = game.world.orgs.get(orig)?.club.city ?? orig;
  return `${year} ${nth(round)}-round pick${orig === viewerOrg ? '' : ` (${c})`}`;
}
export const pickWorthText = (key) => money(Math.round(pickValue(key) / 1e5) * 1e5);

/** Move a pick to a new owner. */
export function movePick(key, to) {
  const { orig } = parseKey(key);
  (game.pickOwner ||= {});
  if (to === orig) delete game.pickOwner[key]; else game.pickOwner[key] = to;
}
/** Drop the owners of picks in drafts held more than a year ago (run each winter). */
export function prunePicks() {
  if (!game.pickOwner) return;
  const first = Math.min(...tradableYears());
  for (const k of Object.keys(game.pickOwner)) if (parseKey(k).year < first - 1) delete game.pickOwner[k];
}
