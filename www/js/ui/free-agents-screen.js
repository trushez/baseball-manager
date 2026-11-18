// The free agent market: everyone without a club, with the sort and position filters of the other selection
// screens. Talks open from here; before the market opens only your own players can be signed.
import { av } from './attr-ui.js';
import { h, fill } from './dom.js';
import { nav } from './nav.js';
import { plink, select } from './club-ui.js';
import { mainPos, money, isPitcher, fullName } from '../data/world.js';
import { game, orgState } from '../state.js';
import { dateWords } from '../season/calendar.js';
import { value, askingSalary, askingYears } from '../season/value.js';
import { marketPlayers, marketOpen, winterDates, cannotSign, signFreeAgent, interestIn } from '../season/winter.js';
import { negotiateScreen } from './negotiate-screen.js';

const SORTS = [['value', 'Ability'], ['age', 'Age'], ['ask', 'Asking salary'], ['name', 'Name'], ['pos', 'Position']];
const POSNS = [['all', 'All players'], ['mine', 'Your free agents'], ['P', 'Pitchers'], ['SP', 'Starters'], ['RP', 'Relievers'], ['H', 'Hitters'], ['C', 'Catchers'], ['IF', 'Infielders'], ['OF', 'Outfielders']];
const IF = new Set(['1B', '2B', '3B', 'SS']), OF = new Set(['LF', 'CF', 'RF']);

// the sort and filter outlive the panel, which is rebuilt each time you come back to the screen
const f = { sort: 'value', pos: 'all' };

/** The market, plus your own players whose contracts have run out and who are still yours to re-sign. */
function everyone() {
  const out = marketPlayers(), have = new Set(out.map((p) => p.id));
  if (game.winter?.on && !marketOpen()) {
    const st = orgState(), o = game.world.orgs.get(game.orgId);
    for (const p of o.players) if (!have.has(p.id) && !p.retired && st.level.get(p.id) === 'FA' && p.contract?.status !== 'signed') out.push(p);
  }
  return out.sort((a, b) => value(b) - value(a));
}

export function freeAgentsPanel() {
  // before the market opens, the players you can still re-sign are the ones that matter
  const list = h('div', { class: 'cm-tblwrap' });
  const status = h('p', { class: 'cm-s cm-pad' });

  const match = (p) => {
    const pos = mainPos(p);
    switch (f.pos) {
      case 'mine': return p.orgId === game.orgId;
      case 'P': return isPitcher(p);
      case 'SP': return pos === 'SP';
      case 'RP': return isPitcher(p) && pos !== 'SP';
      case 'H': return !isPitcher(p);
      case 'C': return pos === 'C';
      case 'IF': return IF.has(pos);
      case 'OF': return OF.has(pos);
      default: return true;
    }
  };
  const order = {
    value: (a, b) => value(b) - value(a), age: (a, b) => a.age - b.age, ask: (a, b) => askingSalary(b) - askingSalary(a),
    name: (a, b) => `${a.last}${a.first}`.localeCompare(`${b.last}${b.first}`), pos: (a, b) => mainPos(a).localeCompare(mainPos(b)) || value(b) - value(a),
  };

  function render() {
    const all = everyone(), rows = all.filter(match).sort(order[f.sort]).slice(0, 150);
    const stuck = rows.find((p) => cannotSign(p));
    fill(status, marketOpen()
      ? `${all.length} free agents. Other clubs are bidding every day, so the better players do not stay long.`
      : `Free agency opens to the other clubs on ${dateWords(winterDates().open)}. Until then you have the market to yourself: talk to any free agent and sign him before a rival can bid.`,
      stuck ? h('div', { class: 'cm-r' }, cannotSign(stuck)) : null);
    fill(list, h('table', { class: 'cm-tbl fa-tbl' },
      h('thead', {}, h('tr', {}, ['Player', 'Pos', 'Age', 'Key attributes', 'Asks', 'Years', 'Interest', ''].map((c, i) => h('th', { class: i < 2 || i === 3 || i === 6 ? 'l' : '' }, c)))),
      h('tbody', {}, rows.length ? rows.map((p) => {
        const why = cannotSign(p), mine = p.orgId === game.orgId;
        return h('tr', { class: mine ? 'sel' : '' },
          h('td', { class: 'l' }, plink(p)), h('td', { class: 'l' }, mainPos(p)), h('td', {}, p.age),
          h('td', { class: 'l' }, (isPitcher(p) ? ['Stuff', 'Movement', 'Control'] : ['Contact', 'Power', 'Eye']).map((k, i) => [i ? '  ' : '', av(p, k)])),
          h('td', {}, money(askingSalary(p))), h('td', {}, askingYears(p)),
          h('td', { class: 'l cm-s' }, mine ? 'Your player' : marketOpen() ? interestIn(p).replace(/ \(\d+\)/, '') : ''),
          h('td', {}, h('button', { class: 'cm-btn', disabled: !!why, title: why || '', onClick: () => nav.push(negotiateScreen(p, { how: 'Signed as a free agent', kind: 'free' })) }, 'Negotiate')));
      }) : h('tr', {}, h('td', { class: 'l cm-s', colspan: 8 }, f.pos === 'mine' ? 'None of your players are out of contract.' : 'Nobody matches.')))));
  }

  render();
  return h('div', {},
    h('div', { class: 'cm-pad', style: { display: 'flex', gap: '12px', alignItems: 'center' } },
      h('span', { class: 'cm-s' }, 'Sort By'), select(SORTS, f.sort, (v) => { f.sort = v; render(); }, { class: 'cm-sel cm-grey' }),
      h('span', { class: 'cm-s' }, 'Show'), select(POSNS, f.pos, (v) => { f.pos = v; render(); }, { class: 'cm-sel cm-grey' })),
    status, list);
}
