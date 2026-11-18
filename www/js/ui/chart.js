// A line chart in plain SVG for the stats screens: one y-axis, thin lines with markers, a legend and a
// label at the end of each line, recessive grid, and a crosshair with a tooltip on hover. Series keep
// their colour by slot in a fixed order (validated for the game's dark panels, colour-blind safe).
import { h } from './dom.js';

export const SERIES = ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#008300', '#9085e9', '#e66767'];
const NS = 'http://www.w3.org/2000/svg';
const s = (tag, attrs = {}, ...kids) => {
  const el = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) if (v != null) el.setAttribute(k, String(v));
  for (const c of kids.flat()) if (c != null) el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  return el;
};

/**
 * @param {{ series:{name:string, values:(number|null)[], color?:string}[], labels:string[], format?:(v:number)=>string,
 *           title?:string, zero?:boolean, height?:number, baseline?:number }} o
 *   values line up with labels (one per x position); null leaves a gap. baseline draws a reference line (e.g. .500).
 */
export function lineChart(o) {
  const W = 760, H = o.height || 280, M = { l: 52, r: 120, t: 14, b: 30 };
  const fmt = o.format || ((v) => String(Math.round(v * 100) / 100));
  const all = o.series.flatMap((x) => x.values).filter((v) => v != null);
  if (!all.length) return h('p', { class: 'cm-sub cm-pad cm-empty' }, 'No games played yet.');
  let lo = Math.min(...all, o.zero ? 0 : Infinity, o.baseline ?? Infinity), hi = Math.max(...all, o.baseline ?? -Infinity);
  if (lo === hi) { lo -= 1; hi += 1; }
  const pad = (hi - lo) * 0.08; lo -= pad; hi += pad;
  const n = o.labels.length;
  const x = (i) => M.l + (n === 1 ? (W - M.l - M.r) / 2 : (i * (W - M.l - M.r)) / (n - 1));
  const y = (v) => M.t + ((hi - v) * (H - M.t - M.b)) / (hi - lo);

  const svg = s('svg', { viewBox: `0 0 ${W} ${H}`, class: 'chart', role: 'img', 'aria-label': o.title || 'Chart' });
  // grid and y labels on round numbers
  const raw = (hi - lo) / 4, mag = 10 ** Math.floor(Math.log10(raw)), f = raw / mag;
  const step = (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * mag;
  for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) {
    svg.append(s('line', { x1: M.l, x2: W - M.r, y1: y(v), y2: y(v), class: 'grid' }), s('text', { x: M.l - 6, y: y(v) + 4, class: 'ax', 'text-anchor': 'end' }, fmt(Math.abs(v) < 1e-9 ? 0 : v)));
  }
  if (o.baseline != null) svg.append(s('line', { x1: M.l, x2: W - M.r, y1: y(o.baseline), y2: y(o.baseline), class: 'base' }));
  // x labels: every one when few, otherwise spaced out
  const every = Math.ceil(n / 10);
  o.labels.forEach((l, i) => { if (i % every === 0 || i === n - 1) svg.append(s('text', { x: x(i), y: H - 10, class: 'ax', 'text-anchor': 'middle' }, l)); });
  // lines, markers and end labels
  const ends = [];
  o.series.forEach((ser, si) => {
    const col = ser.color || SERIES[si % SERIES.length];
    let d = '';
    ser.values.forEach((v, i) => { if (v == null) return; d += `${d && ser.values[i - 1] != null ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`; });
    svg.append(s('path', { d, class: 'ln', stroke: col }));
    if (n <= 24) ser.values.forEach((v, i) => { if (v != null) svg.append(s('circle', { cx: x(i), cy: y(v), r: 4, fill: col, class: 'mk' })); });
    const last = ser.values.map((v, i) => [v, i]).filter(([v]) => v != null).at(-1);
    if (last) ends.push({ y: y(last[0]), text: `${ser.name} ${fmt(last[0])}`, col });
  });
  // end labels, nudged apart so they don't overlap
  ends.sort((a, b) => a.y - b.y);
  for (let i = 1; i < ends.length; i++) if (ends[i].y - ends[i - 1].y < 14) ends[i].y = ends[i - 1].y + 14;
  for (const e of ends) svg.append(s('rect', { x: W - M.r + 6, y: e.y - 5, width: 10, height: 10, rx: 2, fill: e.col }), s('text', { x: W - M.r + 20, y: e.y + 4, class: 'lab' }, e.text));

  // hover: crosshair and tooltip
  const cross = s('line', { y1: M.t, y2: H - M.b, class: 'cross', visibility: 'hidden' });
  svg.append(cross);
  const tip = h('div', { class: 'chart-tip', hidden: true });
  const wrap = h('div', { class: 'chart-wrap' }, o.title ? h('div', { class: 'cm-h' }, o.title) : null, svg, tip,
    o.series.length > 1 ? h('div', { class: 'chart-legend' }, o.series.map((ser, si) => h('span', {}, h('i', { style: { background: ser.color || SERIES[si % SERIES.length] } }), ser.name))) : null);
  svg.addEventListener('mousemove', (ev) => {
    const r = svg.getBoundingClientRect();
    const px = ((ev.clientX - r.left) / r.width) * W;
    const i = Math.max(0, Math.min(n - 1, Math.round(((px - M.l) / (W - M.l - M.r)) * (n - 1))));
    cross.setAttribute('x1', x(i)); cross.setAttribute('x2', x(i)); cross.setAttribute('visibility', 'visible');
    tip.hidden = false;
    tip.replaceChildren(h('b', {}, o.labels[i]), ...o.series.map((ser, si) => h('div', {}, h('i', { style: { background: ser.color || SERIES[si % SERIES.length] } }), `${ser.name}: ${ser.values[i] == null ? '-' : fmt(ser.values[i])}`)));
    const left = (x(i) / W) * r.width;
    tip.style.left = `${Math.min(r.width - 180, left + 12)}px`;
    tip.style.top = '30px';
  });
  svg.addEventListener('mouseleave', () => { cross.setAttribute('visibility', 'hidden'); tip.hidden = true; });
  return wrap;
}
