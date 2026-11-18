// The winter hub, shown once when the winter opens: your players whose contracts have run out, your arbitration
// cases and options, against the budget, before the market and the rest of the winter are played with Continue.
import { av, avSort, avShort, avLabel } from './attr-ui.js';
import { h, fill, toast } from './dom.js';
import { nav } from './nav.js';
import { clubTitle, plink, gradeCell } from './club-ui.js';
import { clubMenu } from './menu.js';
import { mainPos, money, salaryIn, isPitcher } from '../data/world.js';
import { game, org, orgState } from '../state.js';
import { counts } from '../club/depth.js';
import { yourFreeAgents } from '../season/offseason.js';
import { reSign, winterDates } from '../season/winter.js';
import { dateWords } from '../season/calendar.js';
import { doContinue } from './continue.js';
import { budget, committed, owner, STYLES, room } from '../season/finance.js';
import { qoAmount, qoEligible, makeOffer, withdrawOffer } from '../season/qualifying.js';
import { arbitrationSalary } from '../season/value.js';
import { negotiateScreen } from './negotiate-screen.js';
import { figures, settlePoints } from '../season/arbitration.js';
import { taxFor, cbtLine, expected } from '../season/finance.js';
import { termsText, noMoney } from '../season/contracts.js';

export function winterScreen() {
  const o = org(), st = orgState();
  const fas = yourFreeAgents();
  const keep = new Set();
  const total = h('span', { class: 'y' });
  const table = h('div', { class: 'cm-tblwrap' });
  const inArb = () => o.players.filter((p) => /^A\d/.test(String(salaryIn(p, game.year) ?? '')));
  let arb = inArb();
  const opts = o.players.filter((p) => String(salaryIn(p, game.year) ?? '').includes('opt'));

  const money27 = h('div', { class: 'cm-pad' });
  const b = budget(game.orgId, game.year);
  const arbCost = () => arb.reduce((a, p) => a + (game.arbSettled?.[p.id] ?? arbitrationSalary(p, salaryIn(p, game.year))), 0);
  const dealt = (p) => p.contract?.status === 'signed';

  function render() {
    arb = inArb();
    const c27 = committed(game.orgId, game.year).total; // includes anyone you have just signed
    const cost = fas.filter((x) => keep.has(x.p.id) && !dealt(x.p)).reduce((a, x) => a + x.salary, 0);
    fill(total, money(cost));
    const left = b - c27 - arbCost() - cost;
    const payroll = c27 + arbCost() + cost;
    const tax = taxFor(game.orgId, game.year, payroll);
    fill(money27, h('table', { class: 'cm-tbl info' }, h('tbody', {},
      [['Owner', `${STYLES[owner(game.orgId).style].label}`],
        [`${game.year} budget`, money(b)],
        ['Already committed', money(c27)],
        [`Arbitration (${arb.length}), estimated`, money(arbCost())],
        ['Free agents you keep', money(cost)],
        ['Luxury tax', cbtLine(game.orgId, game.year, payroll, tax)],
        ['Left in the budget', h('span', { class: left < 0 ? 'cm-r' : 'cm-g' }, left < 0 ? `${money(-left)} over` : money(left))],
      ].map(([k, v]) => h('tr', {}, h('td', { class: 'l cm-s' }, k), h('td', { class: 'l y' }, v))))),
    left < 0 ? h('p', { class: 'cm-r' }, 'That is more than the owner will spend. Keeping the payroll inside the budget is one of his goals for the season.') : null);
    fill(table, h('table', { class: 'cm-tbl' },
      h('thead', {}, h('tr', {}, ['Re-sign', 'Player', 'Pos', 'Age', 'Key attributes', 'Asks', 'Years', ''].map((c, i) => h('th', { class: i < 3 || i === 4 ? 'l' : '' }, c)))),
      h('tbody', {}, fas.length ? fas.map(({ p, salary, years }) => h('tr', { class: keep.has(p.id) ? 'sel' : '' },
        h('td', { class: 'l' }, h('input', { type: 'checkbox', checked: keep.has(p.id) || dealt(p), disabled: dealt(p), 'aria-label': `Re-sign ${p.first} ${p.last}`, onChange: (e) => { if (e.target.checked) { if (salary > room(game.orgId, game.year)) { toast('That is more than is left in the owner\'s budget.'); } else { reSign(p); keep.add(p.id); } } render(); } })),
        h('td', { class: 'l' }, plink(p)), h('td', { class: 'l' }, mainPos(p)), h('td', {}, p.age),
        h('td', { class: 'l' }, (isPitcher(p) ? ['Stuff', 'Movement', 'Control'] : ['Contact', 'Power', 'Eye']).map((k, i) => [i ? '  ' : '', av(p, k)])),
        h('td', {}, dealt(p) ? h('span', { class: 'cm-g' }, p.contract.text) : money(salary)), h('td', {}, dealt(p) ? '' : years),
        h('td', {}, dealt(p) ? '' : h('button', { class: 'cm-btn', title: noMoney() || '', onClick: () => nav.push(negotiateScreen(p, { kind: 'resign', onDone: () => { reSign(p); keep.add(p.id); } })) }, 'Negotiate'),
          dealt(p) ? null : p.qo?.status === 'offered'
            ? h('button', { class: 'cm-btn', title: `He decides when the market opens on ${dateWords(winterDates().open)}. Click to withdraw.`, onClick: () => { withdrawOffer(p); render(); } }, `Offer ${money(p.qo.amount)} made`)
            : qoEligible(p) ? h('button', { class: 'cm-btn', title: `One year at ${money(qoAmount())}, the average of the 125 highest salaries. If he refuses and signs elsewhere you get a pick after the first round of the draft and that club loses its second-round pick. A player can be offered one once in his career.`, onClick: () => { makeOffer(p); render(); } }, `Qualifying offer ${money(qoAmount())}`) : null)))
        : h('tr', {}, h('td', { class: 'l cm-s', colspan: 8 }, 'None of your players are free agents this winter.')))));
  }

  const arbPanel = h('div', { class: 'cm-tblwrap' });
  function drawArb() {
    arb = inArb();
    fill(arbPanel, h('table', { class: 'cm-tbl' },
      h('thead', {}, h('tr', {}, ['Player', 'Year', 'He asks', 'Club offers', 'Agreed', 'Settle'].map((c, i) => h('th', { class: i === 0 ? 'l' : '' }, c)))),
      h('tbody', {}, arb.map((p) => {
        const yr = salaryIn(p, game.year), f = figures(p, yr), set = game.arbSettled?.[p.id];
        return h('tr', {}, h('td', { class: 'l' }, plink(p)), h('td', {}, yr), h('td', {}, money(f.player)), h('td', {}, money(f.club)),
          h('td', {}, set ? h('b', { class: 'cm-g' }, money(set)) : h('span', { class: 'cm-s' }, 'Hearing')),
          h('td', {}, settlePoints(p, yr).map((x, i) => h('button', { class: `cm-btn${set === x ? ' go' : ''}`, title: i === 0 ? 'The club\'s figure' : i === 4 ? 'His figure' : '', onClick: () => { (game.arbSettled ||= {})[p.id] = x; drawArb(); render(); } }, money(x))),
            set ? h('button', { class: 'cm-btn', onClick: () => { delete game.arbSettled[p.id]; drawArb(); render(); } }, 'Hearing') : null));
      }))),
    h('p', { class: 'cm-s cm-pad' }, 'Settle anywhere between his figure and the club\'s before the hearing. If you do not, a panel picks whichever figure is closer to what players of his record earn, and he is sore about it, more so if he loses.'));
  }
  drawArb();

  render();
  const c = counts(o, st);
  return {
    el: h('div', { style: { display: 'contents' } },
      clubTitle(o.club, 'The Off-Season'),
      h('div', { class: 'cm-panel cm-pad' },
        h('p', { class: 'cm-note' }, 'Your free agents can be re-signed at what they ask. Everyone else goes to the open market, where the other clubs sign players to fill their needs. Arbitration cases (', h('b', {}, arb.length), ') are settled at a share of each player\'s market value, and club options (', h('b', {}, opts.length), ') are picked up when the player is worth it.'),
        h('p', { class: 'cm-s' }, `Your 40-man roster has ${c.forty} players. Free agency opens on ${dateWords(winterDates().open)}; until then no other club can bid, so you can talk to any free agent and sign him first. Tick a player to re-sign him at what he asks, or negotiate. After that Continue plays the winter day by day, and the Free Agents screen shows the market.`)),
      h('div', { class: 'cm-panel' }, h('div', { class: 'cm-h' }, `Money for ${game.year}`), money27),
      arb.length ? h('div', { class: 'cm-panel' }, h('div', { class: 'cm-h' }, 'Arbitration'), arbPanel) : null,
      h('div', { class: 'cm-panel grow' }, h('div', { class: 'cm-h' }, 'Your free agents'), table,
        h('p', { class: 'cm-pad cm-sub' }, `Cost of the players you keep in ${game.year}: `, total)),
      h('div', { class: 'cm-panel cm-pad', style: { display: 'flex', justifyContent: 'flex-end' } }, h('button', { class: 'cm-btn go big', onClick: () => { nav.reset(winterScreen()); doContinue(); } }, 'Start the winter'))),
    side: () => clubMenu('continue'),
    onShow: () => { render(); drawArb(); },
  };
}
