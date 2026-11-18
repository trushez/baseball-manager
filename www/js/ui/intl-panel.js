// Transfers, International: this winter's class of teenage prospects, what your scouts say and the bonus you bid.
import { av } from './attr-ui.js';
import { h, fill, toast } from './dom.js';
import { plink, select } from './club-ui.js';
import { mainPos, money, isPitcher, fullName } from '../data/world.js';
import { game } from '../state.js';
import { reportOn, requestScouting, countryOf, seen } from '../season/scouting.js';
import { intl, open, prospects, poolOf, committed, roomLeft, bid, withdraw, placeAssistant, assistantList } from '../season/amateurs.js';

const SORTS = [['ask', 'Asking bonus'], ['age', 'Age'], ['name', 'Name'], ['scout', 'Your scouts\' ceiling']];
const KINDS = [['all', 'All players'], ['P', 'Pitchers'], ['H', 'Hitters']];
const f = { sort: 'ask', kind: 'all', nation: 'all', bids: false };
const pm = (v) => money(v, { short: false });

export function intlPanel() {
  const box = h('div', {});

  function render() {
    const s = intl();
    if (!open()) {
      const r = s.results;
      fill(box, h('p', { class: 'cm-s cm-pad' }, game.date.getMonth() >= 1 && game.date.getMonth() <= 5 && r
        ? `Signing day was 15 January: ${r.count} of the class signed. The next class opens on 1 December.`
        : 'The next class of international prospects opens on 1 December and signs on 15 January.'),
      r ? h('table', { class: 'cm-tbl' }, h('thead', {}, h('tr', {}, ['Biggest bonuses', 'Club', 'Pos', 'Age', 'Bonus'].map((c, i) => h('th', { class: i < 2 ? 'l' : '' }, c)))),
        h('tbody', {}, r.top.map((x) => h('tr', {}, h('td', { class: 'l' }, plink(game.world.players.get(x.pid), x.name)), h('td', { class: 'l' }, game.world.orgs.get(x.org)?.club.city), h('td', {}, x.pos), h('td', {}, x.age), h('td', {}, pm(x.bonus)))))) : null);
      return;
    }
    let rows = prospects();
    const nations = [...new Set(rows.map((p) => countryOf(p)))].sort();
    if (f.kind === 'P') rows = rows.filter(isPitcher); else if (f.kind === 'H') rows = rows.filter((p) => !isPitcher(p));
    if (f.nation !== 'all') rows = rows.filter((p) => countryOf(p) === f.nation);
    if (f.bids) rows = rows.filter((p) => s.bids[p.id]);
    const ceil = (p) => reportOn(p)?.pj ?? -1;
    rows = rows.sort({ ask: (a, b) => b.ask - a.ask, age: (a, b) => a.age - b.age, name: (a, b) => `${a.last}${a.first}`.localeCompare(`${b.last}${b.first}`), scout: (a, b) => ceil(b) - ceil(a) || b.ask - a.ask }[f.sort]).slice(0, 150);
    const n = Object.keys(s.bids).length;
    fill(box,
      h('p', { class: 'cm-s cm-pad' }, `Signing day is 15 January. Your pool is ${pm(poolOf())}; you have bid ${pm(committed())} on ${n} ${n === 1 ? 'player' : 'players'}, leaving ${pm(roomLeft())}. A prospect signs with the best offer, which counts the bonus first and the club's standing a little. Offers below about 85% of his ask are refused.`),
      h('div', { class: 'cm-pad btnrow' },
        h('button', { class: 'cm-btn go', onClick: () => { const k = placeAssistant(); toast(k ? `The assistant has placed ${k} bids.` : 'The assistant found nobody it would bid for.'); render(); } }, `Place the assistant's bids (${assistantList().length})`),
        h('button', { class: 'cm-btn', disabled: !n, onClick: () => { s.bids = {}; render(); } }, 'Clear my bids'),
        h('span', { class: 'cm-s' }, 'Sort By'), select(SORTS, f.sort, (v) => { f.sort = v; render(); }, { class: 'cm-sel cm-grey' }),
        select(KINDS, f.kind, (v) => { f.kind = v; render(); }, { class: 'cm-sel cm-grey' }),
        select([['all', 'All countries'], ...nations.map((c) => [c, c])], f.nation, (v) => { f.nation = v; render(); }, { class: 'cm-sel cm-grey' }),
        h('label', { class: 'cm-s' }, h('input', { type: 'checkbox', checked: f.bids, onChange: (e) => { f.bids = e.target.checked; render(); } }), ' My bids only')),
      h('table', { class: 'cm-tbl' },
        h('thead', {}, h('tr', {}, ['Player', 'From', 'Age', 'Pos', 'What your scouts say', 'Known', 'Asks', 'Your bid', ''].map((c, i) => h('th', { class: i === 0 || i === 1 || i === 4 || i === 5 ? 'l' : '' }, c)))),
        h('tbody', {}, rows.map((p) => {
          const rep = reportOn(p), mine = s.bids[p.id];
          const input = h('input', { class: 'cm-input', type: 'number', min: 0, step: 5, style: { width: '84px' }, value: Math.round((mine || p.ask * 1.05) / 1000), 'aria-label': `Bid in thousands for ${fullName(p)}` });
          return h('tr', { class: mine ? 'sel' : '' },
            h('td', { class: 'l' }, plink(p)), h('td', { class: 'l' }, countryOf(p)), h('td', {}, p.age), h('td', {}, mainPos(p)),
            h('td', { class: 'l cm-s' }, rep ? rep.pot.replace('has the potential to become ', '').replace('could become ', '') : h('button', { class: 'cm-btn', onClick: () => { toast(requestScouting(p)); } }, 'Scout him')),
            h('td', { class: 'l' }, (isPitcher(p) ? ['Stuff', 'Control'] : ['Contact', 'Power']).map((k, i) => [i ? '  ' : '', av(p, k)])),
            h('td', {}, pm(p.ask)),
            h('td', {}, mine ? h('b', { class: 'y' }, pm(mine)) : h('span', { class: 'cm-s' }, 'none'), ' ', input, ' K'),
            h('td', {}, h('button', { class: 'cm-btn go', onClick: () => { const why = bid(p, Number(input.value) * 1000); if (why) toast(why); render(); } }, mine ? 'Change' : 'Bid'),
              mine ? h('button', { class: 'cm-btn', onClick: () => { withdraw(p); render(); } }, 'Withdraw') : null));
        }))),
      rows.length ? null : h('p', { class: 'cm-s cm-pad cm-empty' }, 'Nobody matches.'));
  }
  render();
  return box;
}
