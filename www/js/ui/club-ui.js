// Pieces shared by the club screens: title bars in the club's colours, grade cells, the player link.
import { h, vClass, toast, dropdown } from './dom.js';
import { fullName, isPitcher, mainPos, FIELD_POS } from '../data/world.js';
import { familiarity } from '../data/attributes.js';
import { nav } from './nav.js';
import { game } from '../state.js';

/** Readable text colour on a club colour. */
export function textOn(hex) {
  const n = parseInt(hex.replace('#', ''), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.4 ? '#101010' : '#ffffff';
}

/** CM-style title bar in a club's colours: club colour behind, a stripe of the second colour beneath. */
export function clubTitle(club, text, act) {
  return h('div', { class: 'cm-title club', style: { background: club.kitA, color: textOn(club.kitA), borderColor: club.kitB, boxShadow: `inset 0 -4px 0 ${club.kitB}` } },
    text, act || null);
}

/** A 20-80 grade for a table cell: present, with the future in small type when it differs. */
export function gradeCell(pair) {
  if (!pair) return '';
  const [now, fut] = pair;
  return h('span', { class: vClass(now), title: `Present ${now}, future ${fut}` }, now, fut > now ? h('small', { class: 'fut' }, fut) : null);
}

/** Player name that opens his profile. Late import avoids a circular dependency with the profile screen. */
export const plink = (p, text) => h('button', {
  class: 'pl', 'data-pid': p?.id, onClick: async () => {
    try { const { playerScreen } = await import('./player-screen.js'); nav.push(playerScreen(p)); } catch (e) { console.error('profile', p?.id, e); toast(`Could not open ${fullName(p)}: ${e.message}`); }
  },
}, text ?? fullName(p));

/** A club's name that opens its page. */
export const clink = (orgId, text) => h('button', {
  class: 'pl', onClick: async () => {
    try { const { clubScreen } = await import('./club-screen.js'); nav.push(clubScreen(orgId)); } catch (e) { console.error('club', orgId, e); toast(`Could not open that club: ${e.message}`); }
  },
}, text ?? game.world.orgs.get(orgId)?.club.city ?? orgId);

export const hand = { L: 'Left', R: 'Right', S: 'Switch' };

/** A small drop-down. options: [[value, label]]. */
export function select(options, value, onChange, attrs = {}) {
  return dropdown(options, value, onChange, { aria: attrs['aria-label'], wide: /cm-grey/.test(attrs.class || '') });
}

/** A position cell: his main position, then every other he can cover with how well (20 is natural), as on his profile. */
export function posCell(p, main = mainPos(p)) {
  if (isPitcher(p)) return h('b', { class: 'cm-y' }, main);
  const list = FIELD_POS.map((x) => [x, familiarity(p, x)]).filter(([x, f]) => f >= 10 && x !== main).sort((a, b) => b[1] - a[1]);
  const own = familiarity(p, main);
  return h('span', { class: 'poscell' }, h('b', { class: 'cm-y' }, main), own < 20 ? h('span', { class: 'cm-s' }, ` ${own}`) : null,
    ...list.map(([x, f]) => h('span', { class: `pc ${f >= 18 ? 'hi' : f >= 15 ? 'ok' : 'lo'}` }, ' ', h('span', { class: 'cm-s' }, x), ` ${f}`)));
}
