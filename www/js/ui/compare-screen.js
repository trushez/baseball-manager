// Player comparison, a CM 01/02 favourite: two players side by side, the better grade highlighted.
import { av, avSort, avShort, avLabel } from './attr-ui.js';
import { h, fill } from './dom.js';
import { plink } from './club-ui.js';
import { clubMenu } from './menu.js';
import { fullName, isPitcher, mainPos, lastSeason, statusShort, salaryIn, money, rate3, fix, pct, ipText } from '../data/world.js';
import { game } from '../state.js';

const HIT = ['contact', 'power', 'gap', 'eye', 'avoidK', 'speed', 'steal', 'instincts', 'range', 'hands', 'arm', 'acc'];
const PIT = ['velocity', 'stuff', 'movement', 'control', 'stamina', 'hold'];
const BOTH = ['comp', 'conc', 'det', 'work', 'lead', 'temper', 'str', 'agi', 'fit'];

export function compareScreen(a, b) {
  const body = h('div', { class: 'cm-panel grow' });
  const picker = h('div', { class: 'cm-pad' });
  let left = a, right = b;

  function pickBox(onPick) {
    const out = h('div', { class: 'pick-list' });
    const input = h('input', { class: 'cm-input', type: 'search', placeholder: 'Type a name', onInput: () => {
      const words = input.value.trim().toLowerCase().split(/\s+/).filter(Boolean);
      if (!words.length) { fill(out); return; }
      const hits = game.world.list.filter((p) => { const n = fullName(p).toLowerCase(); return words.every((w) => n.includes(w)); }).slice(0, 10);
      fill(out, hits.map((p) => h('button', { class: 'cm-opt', onClick: () => onPick(p) },
        h('b', {}, fullName(p)), h('span', {}, `${mainPos(p)}, ${p.club ? p.club.city : ''} ${p.club?.level !== 'MLB' ? `(${p.club?.level})` : ''}, age ${p.age}`))));
    } });
    setTimeout(() => input.focus(), 0);
    return h('div', {}, h('label', { class: 'cm-field' }, h('span', {}, 'Compare with'), input), out);
  }

  function render() {
    if (!right) {
      fill(picker, pickBox((p) => { right = p; game.compareWith = left.id; render(); }));
      fill(body, picker);
      return;
    }
    const keys = [...new Set([...(isPitcher(left) ? PIT : HIT), ...(isPitcher(right) ? PIT : HIT), ...BOTH])];
    const row = (label, x, y, better) => h('tr', {},
      h('td', { class: `${better === 1 ? 'cm-g' : ''} y` }, x ?? ''), h('td', { class: 'mid' }, label), h('td', { class: `${better === -1 ? 'cm-g' : ''} y l` }, y ?? ''));
    const g = (p, k) => avSort(p, k);
    const cmp = (x, y, lowGood = false) => (x == null || y == null || x === y ? 0 : (x > y) !== lowGood ? 1 : -1);
    const sa = lastSeason(left), sb = lastSeason(right);
    const statRows = [];
    if (sa && sb && isPitcher(left) === isPitcher(right)) {
      if (isPitcher(left)) {
        statRows.push(row('IP', ipText(sa.outs), ipText(sb.outs), cmp(sa.outs, sb.outs)), row('ERA', fix(sa.era), fix(sb.era), cmp(sa.era, sb.era, true)),
          row('FIP', fix(sa.fip), fix(sb.fip), cmp(sa.fip, sb.fip, true)), row('K/9', fix(sa.k9, 1), fix(sb.k9, 1), cmp(sa.k9, sb.k9)),
          row('BB/9', fix(sa.bb9, 1), fix(sb.bb9, 1), cmp(sa.bb9, sb.bb9, true)));
      } else {
        statRows.push(row('PA', sa.pa, sb.pa, cmp(sa.pa, sb.pa)), row('AVG', rate3(sa.avg), rate3(sb.avg), cmp(sa.avg, sb.avg)),
          row('OBP', rate3(sa.obp), rate3(sb.obp), cmp(sa.obp, sb.obp)), row('SLG', rate3(sa.slg), rate3(sb.slg), cmp(sa.slg, sb.slg)),
          row('HR', sa.hr, sb.hr, cmp(sa.hr, sb.hr)), row('SB', sa.sb, sb.sb, cmp(sa.sb, sb.sb)),
          row('K%', pct(sa.kPct), pct(sb.kPct), cmp(sa.kPct, sb.kPct, true)), row('BB%', pct(sa.bbPct), pct(sb.bbPct), cmp(sa.bbPct, sb.bbPct)));
      }
    }
    fill(body,
      h('table', { class: 'cm-tbl compare' },
        h('thead', {}, h('tr', {}, h('th', {}, plink(left)), h('th', { class: 'mid' }, ''), h('th', { class: 'l' }, plink(right)))),
        h('tbody', {},
          row('Club', left.club ? `${left.club.city} (${left.club.level})` : '', right.club ? `${right.club.city} (${right.club.level})` : ''),
          row('Position', mainPos(left), mainPos(right)),
          row('Age', left.age, right.age, cmp(left.age, right.age, true)),
          row('Bats / throws', `${left.bats}/${left.throws}`, `${right.bats}/${right.throws}`),
          row('Contract', statusShort(left), statusShort(right)),
          row(`${game.year} salary`, money(salaryIn(left, game.year)), money(salaryIn(right, game.year))),
          h('tr', {}, h('td', { colspan: 3, class: 'sec' }, 'Attributes')),
          keys.map((k) => row(avLabel(k), av(left, k), av(right, k), cmp(g(left, k), g(right, k)))),
          statRows.length ? [h('tr', {}, h('td', { colspan: 3, class: 'sec' }, `Last season (${sa.season} / ${sb.season})`)), statRows] : null)),
      h('div', { class: 'cm-pad btnrow' },
        h('button', { class: 'cm-btn', onClick: () => { right = null; render(); } }, 'Change the second player'),
        h('button', { class: 'cm-btn', onClick: () => { [left, right] = [right, left]; render(); } }, 'Swap sides')));
  }

  render();
  return {
    el: h('div', { style: { display: 'contents' } }, h('div', { class: 'cm-title' }, 'Player Comparison'), body),
    side: () => clubMenu(null),
  };
}
