import { h } from './dom.js';
import { plink, clink } from './club-ui.js';
import { game } from '../state.js';

/** Line score, then batting and pitching for both clubs. */
export function boxView(b) {
  const W = game.world;
  const name = (id) => { const c = W.clubs.get(id); return c && W.orgs.has(c.org ?? id) ? clink(c.org ?? id, c.city) : (c?.city ?? id); };
  const n = Math.max(9, b.line.away.length, b.line.home.length);
  const innings = Array.from({ length: n }, (_, i) => i + 1);
  const pl = (id, t) => { const p = W.players.get(id); return p ? plink(p, t) : t; };
  const bat = (key) => h('table', { class: 'cm-tbl box-tbl' },
    h('thead', {}, h('tr', {}, h('th', { class: 'l' }, name(b[key])), ['', 'AB', 'R', 'H', 'RBI', 'BB', 'K'].map((c) => h('th', {}, c)))),
    h('tbody', {}, b.bat[key].map(([id, t, pos, ab, r, hh, rbi, bb, k, hr]) => h('tr', {},
      h('td', { class: 'l' }, pl(id, t), hr ? h('span', { class: 'cm-y' }, hr > 1 ? ` ${hr} HR` : ' HR') : null), h('td', { class: 'cm-s' }, pos),
      [ab, r, hh, rbi, bb, k].map((v) => h('td', {}, v))))));
  const pit = (key) => h('table', { class: 'cm-tbl box-tbl' },
    h('thead', {}, h('tr', {}, h('th', { class: 'l' }, name(b[key])), ['IP', 'H', 'R', 'BB', 'K', 'HR', 'P'].map((c) => h('th', {}, c)))),
    h('tbody', {}, b.pit[key].map(([id, t, ip, hh, r, bb, k, hr, pc, dec]) => h('tr', {},
      h('td', { class: 'l' }, pl(id, t), dec ? h('span', { class: dec === 'L' ? 'cm-r' : 'cm-g' }, ` (${dec})`) : null),
      [ip, hh, r, bb, k, hr, pc].map((v) => h('td', {}, v))))));
  return h('div', { class: 'box' },
    h('div', { class: 'cm-tblwrap' }, h('table', { class: 'cm-tbl box-line' },
      h('thead', {}, h('tr', {}, h('th', { class: 'l' }, ''), innings.map((i) => h('th', {}, i)), ['R', 'H', 'E'].map((c) => h('th', { class: 'rhe' }, c)))),
      h('tbody', {}, ['away', 'home'].map((key) => h('tr', {}, h('td', { class: 'l' }, name(b[key])),
        innings.map((i) => h('td', {}, b.line[key][i - 1] ?? (i <= b.line[key].length ? '' : key === 'home' && i === b.line.home.length + 1 && b.line.away.length > b.line.home.length ? 'x' : ''))),
        b.rhe[key].map((v) => h('td', { class: 'rhe y' }, v))))))),
    h('div', { class: 'box-two' }, bat('away'), bat('home')),
    h('div', { class: 'box-two' }, pit('away'), pit('home')));
}
