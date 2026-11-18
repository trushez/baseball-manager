// Analytics: how big a department to run, what each step buys and what each step costs you.
import { h, fill, toast } from './dom.js';
import { clubMenu } from './menu.js';
import { clubTitle } from './club-ui.js';
import { money } from '../data/world.js';
import { game, userClub } from '../state.js';
import { LEVELS, levelOf, edgeFor, analyticsBudget, analyticsCost, setAnalytics } from '../season/analytics.js';
import { askOwner } from '../season/finance.js';
import { movePanel } from './budget-move.js';
import { dayNo } from '../season/calendar.js';

const GIVES = [
  'Nothing.',
  'Scouts\' reports a little less wrong. Development a touch faster.',
  'Reports clearly sharper. A monthly note on workload and who is improving.',
  'Strongest gains per dollar. Adds a trade-market tip each month.',
  'Small further gains. Biomechanics flags. The clubhouse will not like it.',
  'Barely more than the step before. Expensive, and the owner will notice.',
];
const COSTS = [
  '-',
  'Next to nothing.',
  'The old hands raise an eyebrow.',
  'A rival may hire your head of analytics. A cheap owner dislikes it.',
  'Veterans grumble when the team loses. Poaching more likely.',
  'Poaching and grumbling are likelier still, for little extra benefit.',
];

export function analyticsScreen() {
  const body = h('div', { class: 'cm-panel grow' });
  function render() {
    const cur = levelOf(), b = analyticsBudget(), c = analyticsCost();
    const hit = game.staff?.[game.orgId]?.analyticsHit > dayNo(game.date);
    const head = h('table', { class: 'cm-tbl info' }, h('tbody', {},
      [['Analytics budget', money(b)], ['Spent', money(c)], ['Left', h('span', { class: b - c < 0 ? 'cm-r' : 'cm-g' }, money(b - c))],
        ['Department today', hit ? 'About half strength: someone has left or the group is being cut.' : `${LEVELS[cur].label}. ${Math.round(edgeFor() * 100)}% of what the top level would give.`],
        ['Ask the owner for more', h('span', {}, [5e5, 1e6, 2e6].map((a) => h('button', { class: 'cm-btn', onClick: () => { toast(askOwner('analytics', a).text); render(); } }, `+${money(a)}`)))]]
        .map(([k, v]) => h('tr', {}, h('td', { class: 'l cm-s' }, k), h('td', { class: 'l y' }, v)))));
    const rows = LEVELS.map((L, i) => h('tr', { class: i === cur ? 'sel' : '' },
      h('td', { class: 'l' }, L.label), h('td', {}, L.cost ? money(L.cost) : '-'),
      h('td', {}, i === cur ? h('span', { class: 'cm-g' }, 'Now') : h('button', { class: 'cm-btn', onClick: () => { toast(setAnalytics(i)); render(); } }, i > cur ? 'Expand' : 'Cut')),
      h('td', { class: 'l' }, GIVES[i]), h('td', { class: 'l cm-s' }, COSTS[i]), h('td', { class: 'l cm-s' }, L.words)));
    fill(body, h('div', { class: 'cm-tblwrap' }, head,
      h('div', { class: 'cm-h' }, 'Move money in from another line'),
      movePanel(render, 'analytics'),
      h('div', { class: 'cm-h' }, 'Departments'),
      h('table', { class: 'cm-tbl' }, h('thead', {}, h('tr', {}, ['Level', 'A year', '', 'What you get', 'What it costs you', 'What it is'].map((t, i) => h('th', { class: i === 0 || i >= 3 ? 'l' : '' }, t)))), h('tbody', {}, rows)),
      h('p', { class: 'cm-s cm-pad' }, 'The gains flatten out after the third level while the bills do not. A bigger department needs the owner\'s money under its own budget line, and taking the top-end staff away from a rival is what rivals do back.')));
  }
  render();
  return { el: h('div', { style: { display: 'contents' } }, clubTitle(userClub(), 'Analytics'), body), side: () => clubMenu('analytics'), onShow: render };
}
