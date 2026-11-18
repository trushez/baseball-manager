// Showing attributes: the 1 to 20 figure, green from 16 up, red at 6 and below. Split attributes show
// both figures, against right-handers / against left-handers.
import { h } from './dom.js';
import { seen, shown } from '../season/scouting.js';
import { isPitcher } from '../data/world.js';
import { attr, attrValue, defence, attrLabel, attrShort, to20 } from '../data/attributes.js';

// the old grade names some screens still use, to attribute keys
const GK = {
  Contact: 'contact', Power: 'power', Eye: 'eye', 'Avoid K': 'avoidK', Speed: 'speed', Stealing: 'steal', Instincts: 'instincts',
  Fielding: '_def', Arm: 'arm', Stuff: 'stuff', Movement: 'movement', Control: 'control', Velocity: 'velocity', Stamina: 'stamina', 'Hold runners': 'hold',
};
export const keyOf = (k) => GK[k] ?? k;

/** One figure, coloured. */
export const num = (v, rep = false) => (v == null ? h('span', { class: 'a20 none' }, '-') : h('span', { class: `a20${v >= 16 ? ' hi' : v <= 6 ? ' lo' : ''}${rep ? ' rep' : ''}`, title: rep ? 'As your scout judged him' : undefined }, String(v)));

/** A player's attribute as it should appear in a table cell. In fog of war, unseen players show "?", and players known only from a report show his scout's reading. */
export function av(p, k) {
  k = keyOf(k);
  const w = seen(p);
  if (w.mode === 'partial' && !shown(p, k)) return h('span', { class: 'a20 unk', title: 'No scout has looked at him closely enough to judge this' }, '?');
  const rep = w.mode === 'report';
  const q = w.v;
  if (k === '_def') return num(defence(q), rep);
  const a = attr(q, k);
  // change since spring training (the snapshot is taken then), for the players you can follow closely
  const d = !rep && p.r0 && p.r?.[k] != null && p.r0[k] != null ? to20(p.r[k], k) - to20(p.r0[k], k) : 0;
  const arrow = d ? h('i', { class: `arr ${d > 0 ? 'up' : 'dn'}`, title: `${d > 0 ? 'Up' : 'Down'} ${Math.abs(d)} since spring training` }, d > 0 ? '↑' : '↓') : null;
  if (arrow && !Array.isArray(a)) return h('span', { class: 'a20w' }, num(a), arrow);
  return Array.isArray(a) ? h('span', { class: `a20s${rep ? ' rep' : ''}`, title: 'against right-handers / against left-handers' }, num(a[0], rep), h("i", {}, "/"), num(a[1], rep)) : num(a, rep);
}
/** For sorting. */
export const avSort = (p, k) => { k = keyOf(k); const w = seen(p); if (w.mode === 'partial' && !shown(p, k)) return -1; return k === '_def' ? defence(w.v) : attrValue(w.v, k); };
export const avLabel = (k) => (keyOf(k) === '_def' ? 'Defence' : attrLabel(keyOf(k)));
export const avShort = (k) => (keyOf(k) === '_def' ? 'Def' : attrShort(keyOf(k)));

const KEY_BAT = ['contact', 'power', 'eye', 'speed', '_def'];
const KEY_PIT = ['stuff', 'movement', 'control', 'velocity', 'stamina'];
/** The ratings that matter most for his job, labelled, with "?" for any your scouts have not seen. */
export function keyAttrs(p) {
  return h('span', { class: 'keyattrs' }, (isPitcher(p) ? KEY_PIT : KEY_BAT).map((k) => h('span', { class: 'ka' }, h('i', {}, avShort(k)), av(p, k))));
}
