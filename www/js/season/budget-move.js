// Moving money between the budget lines (salaries, scouting, analytics, training) without asking the owner for more:
// what you take from one line is added to another for the season. Only money not already spent or committed can move.
import { game } from '../state.js';
import { money } from '../data/world.js';
import { budget, expected, owner } from './finance.js';
import { staffBudget, staffCost } from './ability.js';
import { scoutBudget, scoutCost } from './scouting.js';
import { analyticsBudget, analyticsCost } from './analytics.js';

export const LINE_NAMES = { payroll: 'Salaries', scouting: 'Scouting', analytics: 'Analytics', staff: 'Training' };

/** Money still free on a line this season. */
export function lineRoom(line, orgId = game.orgId) {
  const y = game.year;
  const [b, s] = {
    payroll: [budget(orgId, y), expected(orgId, y)],
    scouting: [scoutBudget(orgId), scoutCost(orgId)],
    analytics: [analyticsBudget(orgId), analyticsCost(orgId)],
    staff: [staffBudget(orgId), staffCost(orgId)],
  }[line];
  return Math.max(0, b - s);
}

/** Move an amount from one line to another for this season. Returns { ok, text }. */
export function moveBudget(from, to, amount, orgId = game.orgId) {
  if (from === to) return { ok: false, text: 'Choose two different lines.' };
  const free = lineRoom(from, orgId);
  if (amount > free) return { ok: false, text: `No: ${LINE_NAMES[from].toLowerCase()} has only ${money(free)} not already spent or committed.` };
  const x = ((owner(orgId).extra ||= {}));
  const y = game.year;
  (x[from] ||= {})[y] = (x[from][y] || 0) - amount;
  (x[to] ||= {})[y] = (x[to][y] || 0) + amount;
  return { ok: true, text: `${money(amount)} moved from ${LINE_NAMES[from].toLowerCase()} to ${LINE_NAMES[to].toLowerCase()} for ${y}.` };
}
