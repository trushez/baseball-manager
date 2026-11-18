// The Progression tab: how a player has developed over the years. His results season by season (public figures, for anyone),
// and his ability and attributes winter by winter (recorded from the first winter of your game, shown only where your scouting
// can see him properly).
import { h } from './dom.js';
import { game } from '../state.js';
import { isPitcher, seasonLine, fix, rate3 } from '../data/world.js';
import { tboPlus, tbaMinus } from '../season/tb.js';
import { seen } from '../season/scouting.js';
import { value } from '../season/value.js';
import { ATTRS, attrValue } from '../data/attributes.js';
import { keysFor, snap } from '../season/progress.js';

const NS = 'http://www.w3.org/2000/svg';
const sv = (tag, attrs = {}, ...kids) => { const e = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v); e.append(...kids.filter((x) => x != null)); return e; };
const LV = { MLB: 'MLB', AAA: 'AAA', AA: 'AA', 'A+': 'A+', A: 'A', R: 'R', DSL: 'DSL', FCL: 'FCL' };

/** A line chart: points are { label, sub, y }. flip: lower is better, so the line is drawn upside down. ref: a reference line. */
function chart(points, { ref, flip = false, unit = '' } = {}) {
  const W = 760, H = 190, L = 40, R = 14, T = 14, B = 38;
  const ys = points.map((p) => p.y).concat(ref != null ? [ref] : []);
  let lo = Math.min(...ys), hi = Math.max(...ys);
  const pad = Math.max(4, (hi - lo) * 0.18); lo -= pad; hi += pad;
  const X = (i) => (points.length === 1 ? (L + W - R) / 2 : L + (i * (W - L - R)) / (points.length - 1));
  const Y = (v) => { const t = (v - lo) / (hi - lo); return T + (H - T - B) * (flip ? t : 1 - t); };
  const svg = sv('svg', { viewBox: `0 0 ${W} ${H}`, class: 'pg-chart', role: 'img', 'aria-label': 'Development over the years' });
  for (let k = 0; k <= 3; k++) {
    const v = lo + ((hi - lo) * k) / 3, y = Y(v);
    svg.append(sv('line', { x1: L, x2: W - R, y1: y, y2: y, class: 'pg-grid' }), sv('text', { x: L - 6, y: y + 4, class: 'pg-ax', 'text-anchor': 'end' }, String(Math.round(v))));
  }
  if (ref != null) svg.append(sv('line', { x1: L, x2: W - R, y1: Y(ref), y2: Y(ref), class: 'pg-ref' }), sv('text', { x: W - R, y: Y(ref) - 4, class: 'pg-ax', 'text-anchor': 'end' }, `average ${ref}`));
  svg.append(sv('polyline', { points: points.map((p, i) => `${X(i)},${Y(p.y)}`).join(' '), class: 'pg-line' }));
  points.forEach((p, i) => {
    const good = ref == null || (flip ? p.y <= ref : p.y >= ref);
    svg.append(sv('circle', { cx: X(i), cy: Y(p.y), r: 4.5, class: `pg-dot${p.now ? ' now' : ''}${good ? ' up' : ' down'}` }),
      sv('text', { x: X(i), y: Y(p.y) - 9, class: 'pg-val', 'text-anchor': 'middle' }, `${p.y}${unit}`),
      sv('text', { x: X(i), y: H - 20, class: 'pg-ax', 'text-anchor': 'middle' }, p.label),
      sv('text', { x: X(i), y: H - 7, class: 'pg-ax sub', 'text-anchor': 'middle' }, p.sub || ''));
  });
  return h('div', { class: 'pg-wrap' }, svg);
}

const arrow = (d, flip = false) => (d == null || d === 0 ? '' : h('span', { class: (flip ? d < 0 : d > 0) ? 'cm-g' : 'cm-r' }, ` ${d > 0 ? '+' : ''}${d}`));

/** Results, season by season at his main level. */
function results(p) {
  const kind = isPitcher(p) ? 'pit' : 'bat';
  const rows = p.hist?.[kind] || [];
  const years = [...new Set(rows.map((r) => r[0]))].sort((a, b) => a - b);
  const out = [];
  for (const yr of years) {
    const these = rows.filter((r) => r[0] === yr);
    const lv = these.some((r) => r[1] === 'MLB') ? 'MLB' : [...these].sort((a, b) => b[4] - a[4])[0][1];
    const s = seasonLine(p, kind, yr, lv);
    if (!s) continue;
    const idx = kind === 'bat' ? tboPlus(s, yr, lv) : tbaMinus(s, p, yr, lv);
    if (idx == null) continue;
    out.push({ yr, lv, s, idx, age: (p.age ?? 27) - (game.year - yr) });
  }
  return { kind, out };
}

function resultsPanel(p) {
  const { kind, out } = results(p);
  if (!out.length) return h('p', { class: 'cm-sub cm-pad cm-empty' }, 'No professional seasons to chart yet.');
  const flip = kind === 'pit';
  const pts = out.map((r) => ({ label: String(r.yr), sub: LV[r.lv] || r.lv, y: r.idx }));
  const head = kind === 'bat' ? ['Year', 'Age', 'Level', 'G', 'PA', 'AVG', 'OBP', 'SLG', 'HR', 'TBO9+', 'Change'] : ['Year', 'Age', 'Level', 'G', 'GS', 'IP', 'ERA', 'WHIP', 'K/9', 'TBA9-', 'Change'];
  const cells = (r) => (kind === 'bat' ? [r.s.g, r.s.pa, rate3(r.s.avg), rate3(r.s.obp), rate3(r.s.slg), r.s.hr] : [r.s.g, r.s.gs, Math.round(r.s.outs / 3), fix(r.s.era), fix(r.s.whip), fix(r.s.k9, 1)]);
  return h('div', {},
    h('div', { class: 'cm-h' }, kind === 'bat' ? 'Results: TBO9+ by season (100 is the league average, higher is better)' : 'Results: TBA9- by season (100 is the league average, lower is better)'),
    chart(pts, { ref: 100, flip }),
    h('div', { class: 'cm-tblwrap' }, h('table', { class: 'cm-tbl' },
      h('thead', {}, h('tr', {}, head.map((c, i) => h('th', { class: i === 0 ? 'l' : '' }, c)))),
      h('tbody', {}, out.map((r, i) => h('tr', {}, h('td', { class: 'l y' }, r.yr), h('td', {}, r.age), h('td', {}, LV[r.lv] || r.lv), ...cells(r).map((v) => h('td', {}, v)), h('td', { class: 'y' }, r.idx),
        h('td', {}, i ? arrow(r.idx - out[i - 1].idx, flip) : '')))))));
}

/** Ability and attributes, winter by winter, with the player as he is today as the last point. */
function ratingsPanel(p) {
  const mode = seen(p).mode;
  if (mode !== 'exact') return h('div', {}, h('div', { class: 'cm-h' }, 'Ratings'), h('p', { class: 'cm-sub cm-pad' }, 'His ratings are not yet known well enough to chart how they have changed. Get a scouting report on him, and the record starts from there.'));
  const hist = (p.prog || []).slice().sort((a, b) => a[0] - b[0]);
  const nowYear = game.year;
  const rows = hist.filter((r) => r[0] < nowYear).concat([snap(p, nowYear, true)]);
  const age = (r) => (p.age ?? 27) - (nowYear - r[0]);
  const pts = rows.map((r, i) => ({ label: i === rows.length - 1 ? 'now' : String(r[0]), sub: i === rows.length - 1 ? '' : `age ${age(r)}`, y: Math.round(r[1]), now: i === rows.length - 1 }));
  const out = [h('div', { class: 'cm-h' }, 'Ratings: his overall ability, winter by winter')];
  if (rows.length < 2) out.push(h('p', { class: 'cm-sub cm-pad' }, 'The record of his development starts this winter. After each season his ability and attributes are filed here, so you can see whether he is growing, holding or fading.'));
  out.push(chart(pts, { unit: '' }));
  // the attributes, for players the club has followed
  const withAttrs = rows.filter((r) => r[2]);
  if (withAttrs.length >= 2) {
    const keys = keysFor(p), flat = Object.values(ATTRS).flat();
    const name = (k) => flat.find((a) => a[0] === k)?.[1] ?? k;
    const first = withAttrs[0], last = withAttrs.at(-1);
    // the attributes that moved most come first; the rest follow in their usual order
    const moves = keys.map((k, i) => ({ k, i, d: (last[2][i] ?? 0) - (first[2][i] ?? 0) })).filter((x) => first[2][x.i] != null && last[2][x.i] != null);
    const order = moves.slice().sort((a, b) => Math.abs(b.d) - Math.abs(a.d)).slice(0, 14);
    out.push(h('div', { class: 'cm-h' }, `Attributes: the ${order.length} that have moved most since the winter after ${first[0]}`));
    out.push(h('div', { class: 'cm-tblwrap' }, h('table', { class: 'cm-tbl' },
      h('thead', {}, h('tr', {}, h('th', { class: 'l' }, 'Attribute'), withAttrs.map((r, i) => h('th', {}, i === withAttrs.length - 1 ? 'Now' : `After ${r[0]}`)), h('th', {}, 'Change'))),
      h('tbody', {}, order.map((x) => h('tr', {}, h('td', { class: 'l' }, name(x.k)), withAttrs.map((r) => h('td', { class: 'y' }, r[2][x.i] ?? '-')), h('td', {}, x.d ? arrow(x.d) : h('span', { class: 'cm-s' }, '0'))))))));
  } else if (rows.length >= 2) out.push(h('p', { class: 'cm-s cm-pad' }, 'Attribute by attribute history is kept for the players in your organisation and on your shortlist.'));
  return h('div', {}, ...out);
}

export function progressTab(p) {
  return h('div', { class: 'pp-progress' }, resultsPanel(p), ratingsPanel(p));
}
