// A small panel for moving money between budget lines, used on the Finances and Analytics screens.
import { h, fill } from './dom.js';
import { select } from './club-ui.js';
import { money } from '../data/world.js';
import { toast } from './dom.js';
import { LINE_NAMES, lineRoom, moveBudget } from '../season/budget-move.js';

export function movePanel(onDone, to = 'analytics') {
  const st = { from: to === 'payroll' ? 'scouting' : 'payroll', to, amt: 1e6 };
  const opts = Object.entries(LINE_NAMES);
  const root = h('div', { class: 'cm-pad bmove', style: { display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' } });
  const draw = () => {
    const pair = (word, el) => h('span', { class: 'bmove-pair' }, h('span', { class: 'cm-s' }, word), el);
    fill(root,
      pair('Move', select([[5e5, '$500k'], [1e6, '$1M'], [2e6, '$2M'], [5e6, '$5M']].map(([v, l]) => [String(v), l]), String(st.amt), (v) => { st.amt = Number(v); draw(); }, { class: 'cm-sel cm-grey' })),
      pair('from', select(opts.filter(([k]) => k !== st.to).map(([k, l]) => [k, `${l} (${money(lineRoom(k))} free)`]), st.from, (v) => { st.from = v; draw(); }, { class: 'cm-sel cm-grey' })),
      pair('to', select(opts.filter(([k]) => k !== st.from), st.to, (v) => { st.to = v; draw(); }, { class: 'cm-sel cm-grey' })),
      h('button', { class: 'cm-btn go', onClick: () => { const r = moveBudget(st.from, st.to, st.amt); toast(r.text); if (r.ok) onDone(); } }, 'Move the money'));
  };
  draw();
  return root;
}
