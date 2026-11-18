// Finances: a summary of every budget line, then a page for each big part: salaries, scouting, training and facilities.
import { h, fill, toast } from './dom.js';
import { nav } from './nav.js';
import { clubTitle, plink, select } from './club-ui.js';
import { clubMenu } from './menu.js';
import { mainPos, money, fullName, salaryIn } from '../data/world.js';
import { game, userClub } from '../state.js';
import { budget, expected, committed, owner, STYLES, taxFor, cbtLine, askOwner, extraFor, budgetOutlook } from '../season/finance.js';
import { confidenceWords } from '../season/reactions.js';
import { staffCost, staffBudget, COACH_ROLES, DEV_LEVELS } from '../season/ability.js';
import { scoutCost, scoutBudget, myScouts } from '../season/scouting.js';
import { analyticsBudget, analyticsCost, levelOf, LEVELS } from '../season/analytics.js';
import { salaryFor, schedule } from '../season/trade.js';
import { movePanel } from './budget-move.js';
import { facilities, KINDS, levelWords, requestImprovement, stepCost } from '../season/facilities.js';

const TABS = [['summary', 'Summary'], ['salaries', 'Salaries'], ['scouting', 'Scouting'], ['analytics', 'Analytics'], ['training', 'Training'], ['facilities', 'Facilities']];
const asks = { payroll: [5e6, 10e6, 20e6], staff: [5e5, 1e6], scouting: [5e5, 1e6], analytics: [5e5, 1e6] };

export function financeScreen(tab = 'summary') {
  const o = game.world.orgs.get(game.orgId), y = game.year;
  const area = h('div', { class: 'cm-panel grow' });
  const tabs = h('div', { class: 'cm-tabs', style: { display: 'flex', gap: '4px', padding: '6px' } });
  const rowsOf = (pairs) => h('table', { class: 'cm-tbl info' }, h('tbody', {}, pairs.map(([k, v]) => h('tr', {}, h('td', { class: 'l cm-s' }, k), h('td', { class: 'l y' }, v)))));
  const left = (b, s) => h('span', { class: b - s < 0 ? 'cm-r' : 'cm-g' }, b - s < 0 ? `${money(s - b)} over` : money(b - s));
  const askButtons = (line) => h('span', {}, asks[line].map((a) => h('button', { class: 'cm-btn', onClick: () => { const r = askOwner(line, a); toast(r.text); draw(); } }, `+${money(a)}`)));

  const lines = () => [
    ['Salaries', budget(game.orgId, y), expected(game.orgId, y), 'payroll'],
    ['Scouting', scoutBudget(), scoutCost(), 'scouting'],
    ['Analytics', analyticsBudget(), analyticsCost(), 'analytics'],
    ['Training: coaches and development', staffBudget(), staffCost(), 'staff'],
  ];

  function summary() {
    const own = owner(game.orgId), [cw, cc] = confidenceWords();
    const pay = expected(game.orgId, y), tax = taxFor(game.orgId, y, pay);
    return h('div', {},
      rowsOf([['Owner', `${STYLES[own.style].label}. ${STYLES[own.style].words}`], ['His view of you', h('span', { class: cc }, cw)], ['Luxury tax', cbtLine(game.orgId, y, pay, tax)]]),
      h('div', { class: 'cm-h' }, `${y} budget`),
      h('table', { class: 'cm-tbl' }, h('thead', {}, h('tr', {}, ['Line', 'Budget', 'Spent or committed', 'Left', 'Ask the owner for more'].map((c, i) => h('th', { class: i === 0 || i === 4 ? 'l' : '' }, c)))),
        h('tbody', {}, lines().map(([name, b, s, key]) => h('tr', {}, h('td', { class: 'l' }, name), h('td', {}, money(b)), h('td', {}, money(s)), h('td', {}, left(b, s)), h('td', { class: 'l' }, askButtons(key)))),
          h('tr', {}, h('td', { class: 'l' }, h('b', {}, 'Total')), h('td', {}, money(lines().reduce((a, l) => a + l[1], 0))), h('td', {}, money(lines().reduce((a, l) => a + l[2], 0))), h('td', {}, ''), h('td', {})))),
      h('div', { class: 'cm-h' }, 'Move money between lines'),
      movePanel(draw, 'scouting'),
      h('p', { class: 'cm-s cm-pad' }, 'Only money not already spent or committed can be moved, and it moves for this season only. The owner decides what to give from his style, his confidence in you and how the team has done. Asking again too soon costs you his confidence.'),
      h('div', { class: 'cm-h' }, 'What you owe players who have gone'),
      h('table', { class: 'cm-tbl' }, h('tbody', {}, (o.club.otherMoney || []).filter((m) => m.years[y]).map((m) => h('tr', {}, h('td', { class: 'l' }, m.name), h('td', { class: 'l cm-s' }, m.note || ''), h('td', {}, money(m.years[y])))))));
  }

  const ctlCache = new Map();
  const ctl = (p) => { if (!ctlCache.has(p.id)) ctlCache.set(p.id, p.contract && p.contract.status !== 'free agent' ? schedule(p) : []); return ctlCache.get(p.id); };
  let sort = 'pay';
  let span = 6; // how many seasons the Salaries table shows
  /** The contract in words: a deal still carrying its 2026 text ("1 y (26)") is described by his status instead. */
  const deal = (p) => {
    const c = p.contract || {}, raw = c.text || '';
    const award = /^(Arbitration|Pre-arbitration): 1 y\/(\$[\d.,]+[Mk]?) \((\d\d)\)$/.exec(raw);
    const bare = /^1 y(?:\/\$[\d.,]+[Mk]?)? \((\d\d)\)$/.test(raw) || /^Selected to the 40-man/.test(raw);
    if (!award && !bare) return raw.replace(/^[^:]*: /, '');
    // a club-controlled player: say what he is this season, from his contract rows, and how long the club keeps him
    const row = c.years?.find((x) => x.season === y), a = typeof row?.status === 'string' ? /^A(\d)/.exec(row.status) : null;
    const lastCtl = ctl(p).reduce((m, x) => Math.max(m, x.season), 0);
    const what = a ? `Arbitration yr ${a[1]}` : award ? `${award[1] === 'Arbitration' ? 'Arb. award' : 'Pre-arb.'} ${award[2]}` : c.status === 'arbitration' ? 'Arbitration' : 'Pre-arbitration';
    return `${what}${lastCtl ? `, kept to ${lastCtl}` : ''}`;
  };
  function salaries() {
    const ps = o.players.filter((p) => salaryFor(p, y) != null);
    const ord = { pay: (a, b) => (salaryFor(b, y) ?? 0) - (salaryFor(a, y) ?? 0), name: (a, b) => `${a.last}${a.first}`.localeCompare(`${b.last}${b.first}`), age: (a, b) => a.age - b.age, years: (a, b) => schedule(b).length - schedule(a).length };
    ps.sort(ord[sort]);
    const years = Array.from({ length: span }, (_, i) => y + i);
    // the same figures the Clubs screen and the budget use, so every payroll number in the game agrees
    const tot = years.map((yr) => committed(game.orgId, yr).total);
    const proj = years.map((yr) => expected(game.orgId, yr));
    return h('div', {},
      h('div', { class: 'cm-pad', style: { display: 'flex', gap: '8px', alignItems: 'center' } }, h('span', { class: 'cm-s' }, 'Sort By'),
        select([['pay', 'Salary'], ['name', 'Name'], ['age', 'Age'], ['years', 'Years left']], sort, (v) => { sort = v; draw(); }, { class: 'cm-sel cm-grey' }),
        h('span', { class: 'cm-s', style: { marginLeft: '14px' } }, 'Seasons shown'), select([['3', '3'], ['6', '6'], ['10', '10']], String(span), (v) => { span = Number(v); draw(); }, { class: 'cm-sel cm-grey' })),
      h('table', { class: 'cm-tbl' }, h('thead', {}, h('tr', {}, ['Player', 'Pos', 'Age', ...years.map(String), 'Contract'].map((c, i) => h('th', { class: i < 2 || i === 3 + years.length ? 'l' : '' }, c)))),
        h('tbody', {}, ps.slice(0, 80).map((p) => h('tr', {}, h('td', { class: 'l' }, plink(p)), h('td', { class: 'l' }, mainPos(p)), h('td', {}, p.age),
          years.map((yr) => { const s = salaryFor(p, yr), raw = salaryIn(p, yr); if (s != null) { const dv = p.contract?.years?.find((x) => x.season === yr)?.deferred; return h('td', { class: typeof raw === 'string' ? 'cm-s' : '', title: dv ? `${money(dv)} of his salary this year is deferred and paid later` : '' }, typeof raw === 'string' ? `~${money(s)}` : money(s) + (dv ? ` (+${money(dv)} def.)` : '')); } const c = ctl(p).find((x) => x.season === yr); return h('td', { class: 'cm-s' }, c ? `~${money(c.salary)}` : ''); }),
          h('td', { class: 'l cm-s' }, deal(p)))),
          h('tr', {}, h('td', { class: 'l' }, h('b', {}, 'Committed: settled contracts and money owed')), h('td', {}), h('td', {}), tot.map((t) => h('td', { class: 'y' }, money(t))), h('td', {})),
          h('tr', {}, h('td', { class: 'l' }, h('b', {}, 'Projected spend: with arbitration and estimates')), h('td', {}), h('td', {}), proj.map((t) => h('td', { class: 'y' }, `~${money(t)}`)), h('td', { class: 'l cm-s' }, 'a guide, not a commitment')))),
      bottomLine(years),
      deferredBlock(),
      h('p', { class: 'cm-s cm-pad' }, 'Figures in grey with a ~ are estimates: arbitration years and club options still to be settled, and seasons of club control after the contract ends. The projected row adds the arbitration and option estimates for that season to the committed row.'));
  }

  /** What is left to spend each season, from the owner's budget down: contracts, money owed, deferred pay due, arbitration and option estimates. */
  function bottomLine(years) {
    const dRows = (o.club.otherMoney || []).filter((m) => m.deferred);
    const col = years.map((yr) => {
      const c = committed(game.orgId, yr), e = expected(game.orgId, yr), b = budgetOutlook(game.orgId, yr);
      const def = dRows.reduce((a, m) => a + (m.years[yr] || 0), 0);
      return { b, contracts: c.contracts, owed: c.owed - def, def, est: Math.max(0, e - c.total), total: e, left: b.value - e };
    });
    const row = (label, f, cls = '') => h('tr', {}, h('td', { class: 'l' }, cls ? h('b', {}, label) : label), col.map((x) => f(x)));
    // costs are shown as minus figures; nothing at all shows as a plain $0
    const m = (v, est, cost) => h('td', { class: est ? 'cm-s' : '' }, v === 0 ? '$0' : `${est ? '~' : ''}${cost ? '-' : ''}${money(Math.abs(v))}`);
    return h('div', {},
      h('div', { class: 'cm-h' }, 'What is left to spend'),
      h('table', { class: 'cm-tbl' }, h('thead', {}, h('tr', {}, ['', ...years.map(String)].map((c, i) => h('th', { class: i ? '' : 'l' }, c)))),
        h('tbody', {},
          row("Owner's budget", (x) => m(x.b.value, x.b.est), 'b'),
          row('Less: player contracts', (x) => m(x.contracts, false, true)),
          ...(col.some((x) => x.owed > 0) ? [row('Less: money owed to players who have gone', (x) => m(x.owed, false, true))] : []),
          row('Less: deferred pay due', (x) => m(x.def, false, true)),
          row('Less: arbitration and option estimates', (x) => m(x.est, true, true)),
          h('tr', {}, h('td', { class: 'l' }, h('b', {}, 'Left to spend')), col.map((x) => h('td', { class: x.left >= 0 ? 'cm-g' : 'cm-r' }, h('b', {}, x.left >= 0 ? money(x.left) : `${money(-x.left)} over`)))))),
      h('p', { class: 'cm-s cm-pad' }, 'Every figure after the first is a cost against the owner\'s budget. Budgets for seasons the owner has not set yet are estimates (~), grown at the pace of the league.'));
  }

  /** Deferred pay your club owes: money put off in contracts you signed, due in later seasons, whoever the player plays for now. */
  function deferredBlock() {
    const rows = (o.club.otherMoney || []).filter((m) => m.deferred);
    if (!rows.length) return null;
    const names = [...new Set(rows.map((m) => m.name))];
    const yrs = [...new Set(rows.flatMap((m) => Object.keys(m.years).map(Number)))].sort();
    const total = (yr) => rows.reduce((a, m) => a + (m.years[yr] || 0), 0);
    return h('div', {},
      h('div', { class: 'cm-h' }, 'Deferred pay you owe'),
      h('table', { class: 'cm-tbl' }, h('thead', {}, h('tr', {}, ['Player', ...yrs.map(String)].map((c, i) => h('th', { class: i ? '' : 'l' }, c)))),
        h('tbody', {}, names.map((n) => h('tr', {}, h('td', { class: 'l' }, n), yrs.map((yr) => h('td', {}, (() => { const v = rows.filter((m) => m.name === n).reduce((a, m) => a + (m.years[yr] || 0), 0); return v ? money(v) : ''; })())))),
          h('tr', {}, h('td', { class: 'l' }, h('b', {}, 'Total owed')), yrs.map((yr) => h('td', { class: 'y' }, money(total(yr))))))),
      h('p', { class: 'cm-s cm-pad' }, 'This money is part of the committed row above for each of those seasons. It was put off from contracts you signed, so it stays your debt even if the player is traded or released.'));
  }

  function scouting() {
    const sc = myScouts(), b = scoutBudget(), c = scoutCost();
    return h('div', {},
      rowsOf([['Scouting budget', money(b)], ['Scouts\' wages', money(c)], ['Left', left(b, c)], ['Ask the owner for more', askButtons('scouting')]]),
      h('div', { class: 'cm-h' }, 'Your scouts'),
      h('table', { class: 'cm-tbl' }, h('tbody', {}, sc.length ? sc.map((s) => h('tr', {}, h('td', { class: 'l' }, s.name), h('td', {}, money(s.wage)))) : h('tr', {}, h('td', { class: 'l cm-s' }, 'You have no scouts.')))),
      h('div', { class: 'cm-pad' }, h('button', { class: 'cm-btn go', onClick: async () => nav.push((await import('./scouting-screen.js')).scoutingScreen()) }, 'Hire and assign scouts')));
  }

  function analyticsTab() {
    const b = analyticsBudget(), c = analyticsCost();
    return h('div', {},
      rowsOf([['Analytics budget', money(b)], ['Spent', money(c)], ['Left', left(b, c)], ['Department', LEVELS[levelOf()].label], ['Ask the owner for more', askButtons('analytics')]]),
      movePanel(draw, 'analytics'),
      h('div', { class: 'cm-pad' }, h('button', { class: 'cm-btn go', onClick: async () => nav.push((await import('./analytics-screen.js')).analyticsScreen()) }, 'Set the size of the department')));
  }

  function training() {
    const S = game.staff?.[game.orgId], b = staffBudget(), c = staffCost();
    return h('div', {},
      rowsOf([['Training budget', money(b)], ['Spent', money(c)], ['Left', left(b, c)], ['Ask the owner for more', askButtons('staff')]]),
      h('div', { class: 'cm-h' }, 'Coaches and development'),
      h('table', { class: 'cm-tbl' }, h('tbody', {}, S ? [...Object.entries(COACH_ROLES).map(([r, l]) => h('tr', {}, h('td', { class: 'l' }, l), h('td', { class: 'l' }, S.coaches[r].name), h('td', {}, money(S.coaches[r].wage)))),
        h('tr', {}, h('td', { class: 'l' }, 'Minor league development'), h('td', { class: 'l' }, DEV_LEVELS[S.dev].label), h('td', {}, money(DEV_LEVELS[S.dev].cost)))] : null)),
      h('div', { class: 'cm-pad' }, h('button', { class: 'cm-btn go', onClick: async () => nav.push((await import('./staff-screen.js')).staffScreen()) }, 'Hire coaches and set development')));
  }

  function facilitiesTab() {
    const f = facilities(game.orgId);
    return h('div', {},
      h('p', { class: 'cm-s cm-pad' }, 'Each rating runs from 1 to 20. You can ask the board for an improvement, but owners rarely agree unless the club is winning and he is pleased with you. An improvement is built over the winter and paid for from the payroll budget over three years.'),
      h('table', { class: 'cm-tbl' }, h('thead', {}, h('tr', {}, ['', 'Rating', 'In words', 'What it does', ''].map((c, i) => h('th', { class: i === 0 || i >= 2 ? 'l' : '' }, c)))),
        h('tbody', {}, Object.entries(KINDS).map(([k, K]) => h('tr', {}, h('td', { class: 'l' }, K.label), h('td', { class: 'y' }, String(f[k])), h('td', { class: 'l' }, levelWords(f[k])), h('td', { class: 'l cm-s' }, K.effect),
          h('td', {}, f.pending[k] ? h('span', { class: 'cm-g' }, `Planned for ${f.pending[k]}`) : h('button', { class: 'cm-btn', title: `Costs ${money(stepCost(f[k]))} a year for three years`, onClick: () => { const r = requestImprovement(k); toast(r.text); draw(); } }, 'Ask the board')))))));
  }

  function draw() {
    fill(tabs, TABS.map(([k, l]) => h('button', { class: `cm-btn${tab === k ? ' go' : ''}`, onClick: () => { tab = k; draw(); } }, l)));
    fill(area, h('div', { class: 'cm-tblwrap' }, { summary, salaries, scouting, analytics: analyticsTab, training, facilities: facilitiesTab }[tab]()));
  }
  draw();
  return { el: h('div', { style: { display: 'contents' } }, clubTitle(userClub(), 'Finances'), h('div', { class: 'cm-panel' }, tabs), area), side: () => clubMenu('finances'), onShow: draw };
}
