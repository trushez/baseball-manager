// New game: your name and the club you take over.
import { h, fill, toast } from './dom.js';
import { nav } from './nav.js';
import { sortTable } from './table.js';
import { money, loadWorld } from '../data/world.js';
import { game } from '../state.js';
import { BACKGROUNDS, weakestFive } from '../season/jobs.js';

function dataLine() {
  const i = game.world.dataInfo;
  if (!i) return '';
  return `Player data: ${i.name}, ${i.players.toLocaleString('en-GB')} players.`;
}

export function startScreen(onStart, sets = []) {
  let pick = null;
  const name = h('input', { class: 'cm-input', type: 'text', maxlength: 40, placeholder: 'Your name', value: game.manager || '' });
  const chosen = h('span', { class: 'start-pick' }, 'Choose a club below');
  const startBtn = h('button', { class: 'cm-btn go big', disabled: true, onClick: start }, 'Start Game');

  game.startBg ||= 'minor';
  const bg = h('select', { class: 'cm-input', onChange: () => { game.startBg = bg.value; } }, ...BACKGROUNDS.map((b) => h('option', { value: b.id }, b.label)));
  bg.value = game.startBg;
  const route = h('input', { type: 'checkbox', onChange: () => { game.startRoute = route.checked; clubs = route.checked ? all.filter((c) => weakestFive().includes(c.org)) : all; pick = null; fill(chosen, 'Choose a club below'); startBtn.disabled = true; table.update(clubs); } });
  route.checked = !!game.startRoute;
  const all = game.world.mlb;
  let clubs = route.checked ? all.filter((c) => weakestFive().includes(c.org)) : all;
  const div = (c) => (c.division || '').replace('American League', 'AL').replace('National League', 'NL');
  const table = sortTable({
    rows: clubs, sort: 'div', desc: false,
    cols: [
      { key: 'club', label: 'Club', left: true, get: (c) => `${c.full ?? `${c.city} ${c.name}`}`, show: (c) => h('span', {}, h('span', { class: 'swatch', style: { background: c.kitA, borderColor: c.kitB } }), `${c.full ?? `${c.city} ${c.name}`}`) },
      { key: 'div', label: 'Division', left: true, get: (c) => div(c) },
      { key: 'w', label: '2026', get: (c) => c.record2026?.[0], show: (c) => (c.record2026 ? `${c.record2026[0]}-${c.record2026[1]}` : '') },
      { key: 'pay', label: 'Payroll 2026', get: (c) => c.payroll2026, show: (c) => money(c.payroll2026) },
      { key: 'age', label: 'Avg age', get: (c) => c.avgAge2026 },
    ],
    rowClass: (c) => (c === pick ? 'sel' : ''),
    onRow: (c) => { pick = c; fill(chosen, h('span', { class: 'swatch', style: { background: c.kitA, borderColor: c.kitB } }), `${c.full ?? `${c.city} ${c.name}`}`); startBtn.disabled = false; table.update(clubs); },
  });

  function dataPick() {
    const cur = game.world.dataInfo?.file || '';
    const sel = h('select', { class: 'cm-input', onChange: async () => {
      const keep = name.value;
      try {
        game.world = await loadWorld('data/', sel.value || null);
        game.manager = keep;
        nav.reset(startScreen(onStart, sets));
      } catch (e) { toast(e.message); sel.value = cur; }
    } },
    h('option', { value: '' }, game.defaultData?.name || 'Built-in data'),
    ...sets.map((f) => h('option', { value: f }, f.replace(/\.json$/i, '').replace(/[-_]+/g, ' '))));
    sel.value = cur;
    return sel;
  }

  function start() {
    if (!pick) return;
    const n = name.value.trim();
    if (!n) { toast('Enter your name first.'); name.focus(); return; }
    game.manager = n;
    game.orgId = pick.org;
    onStart();
  }

  const el = h('div', { style: { display: 'contents' } },
    h('div', { class: 'cm-title' }, 'Baseball Manager'),
    h('div', { class: 'cm-panel cm-pad start-form' },
      h('label', { class: 'cm-field' }, h('span', {}, 'Manager'), name),
      h('p', { class: 'cm-s' }, 'The game opens at the start of the 2026-27 off-season, with every club\'s roster, contracts and last season\'s record. Pick the club you want to run.'),
      h('label', { class: 'cm-field' }, h('span', {}, 'Your background'), bg),
      h('label', { class: 'cm-field' }, h('span', {}, 'Career route'), route, h('span', { class: 'cm-s' }, ' Start at one of the five weakest clubs, with less reputation, and work up.')),
      sets.length ? h('label', { class: 'cm-field' }, h('span', {}, 'Player data'), dataPick()) : null,
      h('p', { class: 'cm-s' }, dataLine())),
    h('div', { class: 'cm-panel cm-pad start-bar' }, chosen, startBtn),
    h('div', { class: 'cm-panel grow' }, table.el));

  return {
    el,
    side: () => [{ label: 'New Game', on: true }, { label: 'Load Game', onClick: async () => nav.push((await import('./load-screen.js')).loadScreen()) }],
    dateBox: () => ['New', h('br'), 'Game'],
    onShow: () => setTimeout(() => name.focus(), 0),
  };
}
