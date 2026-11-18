// Injuries: everyone in the organisation who is hurt, or fit and waiting to come off the injured list, in one table.
// The big league players first; each of them opens the Injury Centre, where the moves are made.
import { h } from './dom.js';
import { nav } from './nav.js';
import { clubMenu } from './menu.js';
import { plink } from './club-ui.js';
import { sortTable } from './table.js';
import { game, org, orgState } from '../state.js';
import { mainPos, isPitcher } from '../data/world.js';
import { injuryLeft } from '../season/advice.js';
import { placeCode, ilDaysLeft } from '../season/roster.js';
import { dayNo, fromDayNo, dateWords } from '../season/calendar.js';

const LEVEL_ORDER = { MLB: 0, IL: 1, DFA: 2, AAA: 3, AA: 4, 'A+': 5, A: 6, R: 7 };
const role = (p) => (isPitcher(p) ? (p.role === 'Starter' ? 'SP' : p.role === 'Closer' ? 'CL' : 'RP') : mainPos(p));

/** When he is due back, in words: day to day, about N weeks, or fit. */
function back(p) {
  const left = injuryLeft(p);
  if (!p.injury) return 'Fit';
  if (left <= 6) return 'Day to day';
  if (left < 60) return `About ${Math.round(left / 7)} week${Math.round(left / 7) === 1 ? '' : 's'}`;
  return `About ${Math.round(left / 30)} months`;
}

export function injuriesScreen() {
  const o = org(), st = orgState();
  const where = (p) => {
    const c = placeCode(st, p);
    if (c === 'IL') { const x = st.il.get(p.id); return `${x.kind}-day injured list`; }
    if (c === 'MLB') return 'Active roster';
    return c || '';
  };
  const panel = h('div', { class: 'cm-panel grow' });
  // drawn again each time you come back to it, so a player activated in the Injury Centre is gone from the list
  function draw() {
  // players still under contract with you: not the free agents leaving in the winter
  const rows = o.players.filter((p) => (p.injury || st.il.has(p.id)) && placeCode(st, p) in LEVEL_ORDER && !game.freeAgents?.includes(p.id));
  const majors = (p) => st.il.has(p.id) || st.active.has(p.id);
  const status = (p) => {
    if (st.il.has(p.id) && !p.injury) return ilDaysLeft(st, p) ? h('span', { class: 'cm-y' }, `Fit; ${ilDaysLeft(st, p)} days left on the list`) : h('span', { class: 'cm-g' }, 'Fit: ready to come back');
    if (st.active.has(p.id) && injuryLeft(p) > 6) return h('span', { class: 'cm-r' }, 'Hurt on the active roster');
    return '';
  };
  const table = rows.length ? sortTable({
    id: 'injuries', rows, sort: 'lvl', desc: false,
    cols: [
      { key: 'name', label: 'Player', left: true, get: (p) => p.last, show: (p) => plink(p) },
      { key: 'pos', label: 'Pos', left: true, get: (p) => role(p), show: (p) => h('b', { class: 'cm-y' }, role(p)) },
      { key: 'age', label: 'Age', get: (p) => p.age, asc: true },
      { key: 'lvl', label: 'Where', left: true, get: (p) => (LEVEL_ORDER[placeCode(st, p)] ?? 9) * 1000 - injuryLeft(p), show: (p) => where(p) },
      { key: 'inj', label: 'Injury', left: true, get: (p) => p.injury?.type ?? '', show: (p) => (p.injury ? p.injury.type : h('span', { class: 'cm-s' }, 'Healed')) },
      { key: 'since', label: 'Since', left: true, get: (p) => p.injury?.since ?? 0, show: (p) => (p.injury?.since != null ? dateWords(fromDayNo(p.injury.since)) : '') },
      { key: 'left', label: 'Back', left: true, get: (p) => injuryLeft(p), asc: true, show: (p) => h('span', { class: p.injury ? 'cm-r' : 'cm-g' }, back(p)) },
      { key: 'note', label: '', left: true, get: () => 0, show: status },
      { key: 'go', label: '', get: () => 0, show: (p) => (majors(p) ? h('button', { class: 'cm-btn', onClick: async () => nav.push((await import('./cover-screen.js')).coverScreen(p)) }, 'Injury Centre') : '') },
    ],
  }).el : h('p', { class: 'cm-pad cm-empty' }, 'Nobody in the organisation is injured.');
  const big = rows.filter(majors).length;
  const today = dayNo(game.date);
  const fresh = rows.filter((p) => p.injury && today - p.injury.since <= 7).length;
  panel.replaceChildren(
    h('p', { class: 'cm-sub cm-pad' }, rows.length ? `${rows.length} in the organisation: ${big} with the big league club, ${rows.length - big} in the minors.${fresh ? ` ${fresh} hurt in the last week.` : ''} Click a heading to sort; the Injury Centre makes the moves for a big league player.` : ''),
    table);
  }
  draw();
  return {
    el: h('div', { style: { display: 'contents' } }, h('div', { class: 'cm-title' }, 'Injuries'), panel),
    side: () => clubMenu('injuries'),
    onShow: draw,
  };
}
