// Computer general managers. Every club has an invented GM, but they all play the same: a club differs from the next only a
// little, and by its situation. Each has a plan (contending, rebuilding or in between), reviewed on a few dates in the
// year, that decides whether he buys for now or sells for the future. A GM keeps no memory of you: every offer is judged on its own.
import { game } from '../state.js';
import { Rng } from '../core/rng.js';
import { dayNo } from './calendar.js';
import { budgetRank } from './finance.js';
import { FIRST, LAST } from '../data/generate.js';

const today = () => dayNo(game.date);

/** The size of a GM's mistakes and the margin he asks, from the difficulty setting. */
export const errScale = () => ({ easy: 1.6, realistic: 1, hard: 0.5 }[game.settings?.difficulty || 'realistic']);

/** The GM of a club, made the first time he is needed and kept in the save. */
export function gmOf(orgId) {
  const all = (game.gms ||= {});
  const r = new Rng(`gm-${orgId}-${game.world.mlb?.length ?? 30}`);
  const first = r.pick(FIRST), last = r.pick(LAST);
  const small = () => (r.next() - 0.5) * 0.1; // clubs differ only a little
  const flat = {
    name: `${first} ${last}`,
    love: +(1 + small()).toFixed(2), ageBias: 0, numbers: 0.5, gamble: 0.5, hard: +(1 + small()).toFixed(2),
    patience: 0.5, grudge: 0, pride: 0.04, star: 0.5,
  };
  // a general manager has no temperament and no memory of you: every club plays the same, apart from what its situation asks
  if (all[orgId]) { if (!all[orgId].even) Object.assign(all[orgId], { ...flat, name: all[orgId].name, even: true }); return all[orgId]; }
  return (all[orgId] = { ...flat, even: true, plan: null });
}

/** How he does business: the club's situation, in a few words, for the trade screen. */
export function gmWords(orgId) {
  return { contend: 'a contender, looking for help now', rebuild: 'rebuilding, wants prospects and picks', middle: 'in the middle of the table' }[gmPlan(orgId)];
}

/** The computer general managers keep no record of your past dealings. */
export const gmView = () => 'Every club judges an offer on its own merits.';
export const dealt = () => {};
export const insulted = () => {};

/** How many days he will not take your call after an insult or a long haggle. */
export const lockDays = (orgId, base) => Math.round(base * (0.7 + gmOf(orgId).patience * 0.8));

const rawPlan = (orgId) => {
  const R = game.season?.records?.get(orgId);
  if (game.phase === 'regular' && R && R.w + R.l >= 40) {
    const pc = R.w / (R.w + R.l);
    return pc >= 0.54 ? 'contend' : pc <= 0.46 ? 'rebuild' : 'middle';
  }
  const r = budgetRank(orgId);
  return r <= 9 ? 'contend' : r >= 22 ? 'rebuild' : 'middle';
};

/** His plan. Reviewed on 1 June, 15 July and at the start of the winter; until then it stands. */
export function gmPlan(orgId) {
  const g = gmOf(orgId);
  if (!g.plan) g.plan = rawPlan(orgId);
  return g.plan;
}

export function reviewPlans(date = game.date) {
  const mo = date.getMonth(), d = date.getDate();
  const key = (mo === 5 && d === 1) ? 'jun' : (mo === 6 && d === 15) ? 'jul' : (mo === 10 && d === 2) ? 'winter' : null;
  if (!key) return;
  const stamp = `${game.year}-${key}`;
  if (game.planReview === stamp) return;
  game.planReview = stamp;
  const r = new Rng(`plans-${stamp}`);
  for (const c of game.world.mlb) {
    const g = gmOf(c.org), next = rawPlan(c.org);
    if (!g.plan) { g.plan = next; continue; }
    // a patient GM sticks with the plan unless the picture has changed a lot
    if (next !== g.plan && (g.plan === 'middle' || next === 'middle' || !r.chance(g.patience * 0.5))) g.plan = next;
  }
}
