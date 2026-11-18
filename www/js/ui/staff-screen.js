// Staff: your six coaches, the development level of the minors, and the players you give extra attention. Coaches are hired
// from the pool of people out of work; their wages and the development level come out of the staff budget.
import { h, fill, toast } from './dom.js';
import { clubMenu } from './menu.js';
import { clubTitle, select } from './club-ui.js';
import { money, fullName, isPitcher, mainPos } from '../data/world.js';
import { game, userClub, orgState } from '../state.js';
import { COACH_ROLES, DEV_LEVELS, staffCost, staffBudget, hireCoach, setDevLevel } from '../season/ability.js';
import { ensureStaff, STYLES, STYLE_NOTE, SPECS, ROLE_WHAT, FOCUS_MAX, focusOf, focusKeys, setFocus, clearFocus } from '../season/coaching.js';
import { attrLabel } from '../data/attributes.js';

const specName = (role, c) => SPECS[role]?.[c.spec]?.[0] ?? '-';
const COLS = ['Role', 'Name', 'Style', 'Specialty', 'Rating', 'Young', 'Vets', 'Motiv', 'Wage', ''];
const head = (cols) => h('thead', {}, h('tr', {}, cols.map((c, i) => h('th', { class: [0, 1, 2, 3].includes(i) ? 'l' : '', title: { Young: 'Working with young players', Vets: 'Working with veterans', Motiv: 'Motivation' }[c] || '' }, c))));
const cells = (c, role) => [h('td', { class: 'l' }, c.name + (c.interim ? ' (interim)' : '')), h('td', { class: 'l cm-s', title: STYLE_NOTE[c.style] }, STYLES[c.style]), h('td', { class: 'l' }, specName(role, c)), h('td', { class: 'y' }, c.rating), h('td', {}, c.youth), h('td', {}, c.vets), h('td', {}, c.motiv), h('td', {}, money(c.wage))];

export function staffScreen() {
  const body = h('div', { class: 'cm-panel grow' });
  let open = null; // the role being replaced
  const pick = { pid: '', key: '' };

  function render() {
    const S = ensureStaff();
    const cost = staffCost(), budget = staffBudget();
    const top = h('table', { class: 'cm-tbl info' }, h('tbody', {},
      [['Staff budget', money(budget)], ['Spent on staff', money(cost)],
        ['Left', h('span', { class: budget - cost < 0 ? 'cm-r' : 'cm-g' }, money(budget - cost))]]
        .map(([k, v]) => h('tr', {}, h('td', { class: 'l cm-s' }, k), h('td', { class: 'l y' }, v)))));
    const rows = Object.entries(COACH_ROLES).map(([role, label]) => {
      const c = S.coaches[role];
      return h('tr', { class: open === role ? 'sel' : '', title: ROLE_WHAT[role] }, h('td', { class: 'l' }, label), ...cells(c, role),
        h('td', {}, h('button', { class: 'cm-btn', onClick: () => { open = open === role ? null : role; render(); } }, open === role ? 'Close' : 'Replace')));
    });
    const pool = open && h('div', {},
      h('div', { class: 'cm-h' }, `Candidates for ${COACH_ROLES[open].toLowerCase()}`),
      h('p', { class: 'cm-s cm-pad' }, ROLE_WHAT[open]),
      h('table', { class: 'cm-tbl' }, head(['', ...COLS.slice(1, 9), '']),
        h('tbody', {}, game.coachPool.filter((c) => c.role === open).sort((a, b) => b.rating - a.rating).map((c) => h('tr', {}, h('td', {}), ...cells(c, open),
          h('td', {}, h('button', { class: 'cm-btn go', onClick: () => { const m = hireCoach(c.id); toast(m); if (!m.startsWith('No')) open = null; render(); } }, 'Hire')))))));
    const dev = h('div', { class: 'cm-pad cm-opts' }, Object.entries(DEV_LEVELS).map(([k, d]) => h('button', {
      class: 'cm-opt', 'aria-pressed': String(S.dev === k), onClick: () => { toast(setDevLevel(k)); render(); },
    }, h('b', {}, d.label), h('span', {}, `${money(d.cost)} a year. ${k === 'high' ? 'Players below the majors develop faster.' : k === 'low' ? 'Players below the majors develop more slowly.' : 'The usual rate of development.'}`))));

    // training focus
    const o = game.world.orgs.get(game.orgId), st = orgState(game.orgId);
    const eligible = o.players.filter((p) => !p.retired && ['MLB', 'AAA', 'AA', 'A+', 'A'].includes(st.active.has(p.id) ? 'MLB' : st.level.get(p.id))).sort((a, b) => a.last.localeCompare(b.last));
    const chosen = game.world.players.get(pick.pid);
    const keyOpts = chosen ? focusKeys(chosen).map((k) => [k, attrLabel(k)]) : [];
    if (!keyOpts.some(([k]) => k === pick.key)) pick.key = keyOpts[0]?.[0] ?? '';
    const cur = focusOf();
    const focus = h('div', {},
      h('p', { class: 'cm-s cm-pad' }, `Up to ${FOCUS_MAX} players can work mostly on one thing. It moves where his improvement goes, not how much of it there is, so he gets better at that at the cost of the rest.`),
      cur.length ? h('table', { class: 'cm-tbl' }, h('tbody', {}, cur.map((p) => h('tr', {}, h('td', { class: 'l' }, fullName(p)), h('td', { class: 'l cm-s' }, `${mainPos(p)}, ${p.age}`), h('td', { class: 'l' }, attrLabel(p.focus)),
        h('td', {}, h('button', { class: 'cm-btn', onClick: () => { toast(clearFocus(p)); render(); } }, 'Clear'))))) ) : h('p', { class: 'cm-s cm-pad cm-empty' }, 'Nobody has a focus yet.'),
      h('div', { class: 'cm-pad', style: { display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' } },
        select([['', 'Choose a player'], ...eligible.map((p) => [p.id, `${fullName(p)} (${mainPos(p)}, ${p.age})`])], pick.pid, (v) => { pick.pid = v; render(); }, { class: 'cm-sel cm-grey' }),
        chosen ? select(keyOpts, pick.key, (v) => { pick.key = v; render(); }, { class: 'cm-sel cm-grey' }) : null,
        h('button', { class: 'cm-btn go', disabled: !chosen, onClick: () => { toast(setFocus(chosen, pick.key)); pick.pid = ''; render(); } }, 'Set focus')));

    fill(body,
      h('div', { class: 'cm-h' }, 'Budget'), top,
      h('div', { class: 'cm-h' }, 'Coaching staff'),
      h('div', { class: 'cm-tblwrap' }, h('table', { class: 'cm-tbl' }, head(COLS), h('tbody', {}, rows))),
      pool,
      h('div', { class: 'cm-h' }, 'Development in the minors'), dev,
      h('div', { class: 'cm-h' }, 'Training focus'), focus,
      h('p', { class: 'cm-s cm-pad' }, 'Rating is how good a coach is; Young and Vets are how well he works with players of 24 and under and of 31 and over; Motiv is how much he lifts the mood of the clubhouse. A coach\'s specialty tilts the improvement of his players towards it. The minor leagues have no coaches of their own: the development director and the level stand for all of them. Coaches change each winter, when a new group comes on the market.'));
  }
  render();
  return { el: h('div', { style: { display: 'contents' } }, clubTitle(userClub(), 'Staff'), body), side: () => clubMenu('staff') };
}
