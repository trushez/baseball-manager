// Clubs: every organisation, with its last-season record and payroll. Click one to open it.
import { lastRecord } from '../season/history.js';
import { expected as expectedFor } from '../season/finance.js';
import { h } from './dom.js';
import { nav } from './nav.js';
import { clubMenu } from './menu.js';
import { sortTable } from './table.js';
import { money } from '../data/world.js';
import { game } from '../state.js';
import { clubScreen } from './club-screen.js';

export function clubsScreen() {
  const div = (c) => (c.division || '').replace('American League', 'AL').replace('National League', 'NL');
  const t = sortTable({
    rows: game.world.mlb, sort: 'div', desc: false,
    rowClass: (c) => (c.org === game.orgId ? 'now' : ''),
    onRow: (c) => nav.push(clubScreen(c.org)),
    cols: [
      { key: 'club', label: 'Club', left: true, get: (c) => `${c.full ?? `${c.city} ${c.name}`}`, show: (c) => h('span', {}, h('span', { class: 'swatch', style: { background: c.kitA, borderColor: c.kitB } }), `${c.full ?? `${c.city} ${c.name}`}`) },
      { key: 'div', label: 'Division', left: true, get: div },
      { key: 'w', label: String(game.year - 1), get: (c) => lastRecord(c)?.[0], show: (c) => { const r = lastRecord(c); return r ? `${r[0]}-${r[1]}` : ''; } },
      { key: 'pay', label: game.year - 1 <= 2026 ? `Payroll ${game.year - 1}` : `Payroll ${game.year}`, get: (c) => (game.year - 1 <= 2026 ? c.payroll2026 : expectedFor(c.org, game.year)), show: (c) => money(game.year - 1 <= 2026 ? c.payroll2026 : expectedFor(c.org, game.year)) },
      { key: 'park', label: 'Ballpark', left: true, get: (c) => c.venue },
    ],
  });
  return {
    el: h('div', { style: { display: 'contents' } }, h('div', { class: 'cm-title' }, 'Clubs'), h('div', { class: 'cm-panel grow' }, t.el)),
    side: () => clubMenu('clubs'), bg: 'league',
  };
}
