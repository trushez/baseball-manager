// The assistant's whole plan for your roster, shown the same way on the squad screen and before you continue: what is wrong,
// every move that puts it right in the order they must be made, one button to make them all, and Undo.
import { h, toast } from './dom.js';
import { game, orgState } from '../state.js';
import { rosterProblems } from '../season/roster.js';
import { plan, runPlan, moveLabel } from '../season/advice.js';
import { checkpoint, undo, lastMove } from '../season/undo.js';
import { rosterAction } from './roster-action.js';

const lower = (s) => `${s.charAt(0).toLowerCase()}${s.slice(1)}`;

/** Make the first n steps of the plan (one step goes through the usual explanation box; several are made together). */
export async function doSteps(o, st, steps, n) {
  if (n === 1) return rosterAction(o, st, steps[0].p, steps[0].a);
  checkpoint(n === steps.length ? 'the assistant\'s moves' : `${n} moves`);
  const r = runPlan(o, st, steps, n);
  if (r.error) toast(r.error);
  toast(r.done.length ? `Done: ${r.done.map(lower).join('; ')}.` : 'Nothing was changed.');
  return r.done.length > 0;
}

/**
 * @param {object} opts  onChange: called after a move so the screen can redraw; always: show the panel even with nothing to do
 * @returns {HTMLElement|null}
 */
export function planPanel(o, st, { onChange, always = false, compact = false } = {}) {
  const problems = rosterProblems(o, st).filter((x) => game.phase !== 'spring' || !/must have/.test(x));
  const steps = plan(o, st);
  const last = lastMove();
  if (!problems.length && !steps.length && !always && !last) return null;
  const all = steps.length; // the button makes every move in the plan, the needed ones and the sensible extras
  const after = () => onChange?.();
  return h('div', { class: 'advice' },
    problems.length ? h('ul', { class: 'problems' }, problems.map((p) => h('li', {}, p))) : null,
    steps.length ? (() => {
      const head = h('div', { class: 'cm-h' }, h('span', { class: 'adv-long' }, steps.length > 1 ? `Your assistant's plan: ${steps.length} moves, in this order` : 'Your assistant suggests'), h('span', { class: 'adv-short' }, steps.length > 1 ? `Assistant's plan (${steps.length})` : 'Assistant suggests'), h('span', { class: 'sp' }),
        all ? h('button', { class: 'cm-btn go', onClick: async (e) => { e.stopPropagation(); await doSteps(o, st, steps, all); after(); } }, all > 1 ? `Fix it for me (${all} moves)` : 'Fix it for me') : null);
      const tbl = h('table', { class: 'cm-tbl' }, h('tbody', {}, steps.map((x, i) => h('tr', { class: x.must ? 'must' : '' },
        h('td', { class: 'l y' }, steps.length > 1 ? `${i + 1}. ` : '', moveLabel(x.p, x.a)),
        h('td', { class: 'l why' }, x.why),
        h('td', {}, h('button', { class: 'cm-btn', title: i ? `Makes moves 1 to ${i + 1}, in order` : '', onClick: async () => { await doSteps(o, st, steps, i + 1); after(); } }, i ? `Do 1 to ${i + 1}` : 'Do it'))))));
      // folded on the squad tables, which have to fit one screen: the headline and the button stay in view
      return compact ? h('details', { class: 'advice-fold' }, h('summary', {}, head), tbl) : h('div', {}, head, tbl);
    })() : null,
    last ? h('div', { class: 'cm-pad btnrow', style: { justifyContent: 'center' } },
      h('button', { class: 'cm-btn', title: 'Undo works until you press Continue', onClick: () => { const l = undo(); if (l) toast(`Undone: ${lower(l)}.`); after(); } }, `Undo: ${last.length > 40 ? `${last.slice(0, 38)}...` : last}`)) : null);
}
