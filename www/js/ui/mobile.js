// Phone helpers. A table too wide for the screen is shown as cards instead of scrolling sideways:
// the first column is the card's heading and every other column becomes a small labelled figure.
// A "Sort by" control stands in for the column headings that the cards hide.
import { h } from './dom.js';

let uid = 0;
const narrow = () => typeof window !== 'undefined' && window.innerWidth <= 700;

function toCards(table) {
  const head = table.tHead?.rows[table.tHead.rows.length - 1];
  const ths = head ? [...head.cells] : [];
  const firstBody = table.tBodies[0]?.rows[0] || table.rows[0];
  if (!firstBody) return;
  const usable = !!ths.length && firstBody.cells.length === ths.length;
  if (usable) {
    for (const tr of table.tBodies[0]?.rows || []) {
      [...tr.cells].forEach((td, i) => { if (!td.hasAttribute('colspan')) td.dataset.label = ths[i].textContent.replace(/[▲▼]/g, '').trim(); });
    }
  }
  table.classList.add('m-cards');
  // sorting: the headings are hidden, so offer them as a drop-down
  const sortable = ths.filter((t) => t.classList.contains('sortable'));
  if (usable && sortable.length && !table.previousElementSibling?.classList?.contains('m-sort')) {
    const sel = h('select', { class: 'cm-input', 'aria-label': 'Sort by' },
      sortable.map((t) => h('option', { value: String(ths.indexOf(t)), selected: t.classList.contains('sorted') }, t.textContent.replace(/[▲▼]/g, '').trim() || 'Sort')));
    const bar = h('div', { class: 'm-sort' }, h('span', { class: 'cm-s' }, 'Sort by'), sel,
      h('button', { class: 'cm-btn', 'aria-label': 'Reverse order', onClick: () => { const th = ths.find((t) => t.classList.contains('sorted')); th?.click(); } }, '⇅'));
    // the table is rebuilt on every sort, so the control is rebuilt with it: pick, and the new table takes its place
    sel.addEventListener('change', () => {
      const th = ths[Number(sel.value)];
      if (th.classList.contains('sorted')) return;
      th.click();
    });
    table.before(bar);
  }
}


// One line per row, always: a table too wide for the screen keeps its first column and as many of the
// others as fit, left to right (a column holding a button always stays); the rest are hidden.
function toFit(table) {
  const head = table.tHead?.rows[table.tHead.rows.length - 1];
  const rows = [...(table.tBodies[0]?.rows || [])];
  const sample = rows.find((r) => !r.querySelector('[colspan]')) || rows[0];
  if (!sample) return;
  const n = sample.cells.length;
  const all = [...(table.tHead?.rows || []), ...table.tBodies.length ? [...table.tBodies].flatMap((b) => [...b.rows]) : [], ...(table.tFoot?.rows || [])].filter((r) => r.cells.length === n);
  // a cell with several buttons (offer amounts, actions) becomes one button that drops the choices
  const label = (i) => (head?.cells[i]?.textContent || '').replace(/[▲▼]/g, '').trim();
  for (let i = 0; i < n; i++) {
    if (!rows.some((r) => r.cells.length === n && r.cells[i].querySelectorAll('button.cm-btn').length > 1)) continue;
    const word = label(i);
    for (const r of rows) if (r.cells.length === n) pickCell(r.cells[i], word);
    // the button says what the column is for, so its heading can go (it stays as the tooltip)
    if (head?.cells[i]) { head.cells[i].title = word; head.cells[i].textContent = ''; }
  }
  table.classList.add('m-fit');
  // widths with no wrapping in the body and headings allowed to break between words
  table.classList.add('m-measure');
  const widths = [...Array(n).keys()].map((i) => Math.max(...all.map((r) => r.cells[i].getBoundingClientRect().width)));
  table.classList.remove('m-measure');
  const avail = (table.parentElement?.clientWidth || window.innerWidth) - 6;
  const keep = new Set([0]);
  let used = Math.min(widths[0] || 0, avail * 0.45);
  const last = n - 1;
  if (n > 2 && head?.cells[1]?.classList.contains('l') && widths[1] < avail * 0.4) { keep.add(1); used += widths[1]; }
  if (last > 0 && sample.cells[last].querySelector('button.cm-btn, input, select')) { keep.add(last); used += widths[last]; }
  const PRI = ['AVG', 'OBP', 'SLG', 'OPS', 'HR', 'RBI', 'ERA', 'IP', 'W-L', 'SV', 'WHIP', 'K/9', 'FIP', 'SB', 'BB/9', 'G', 'PA', 'W', 'L'];
  // a heading marked m-low is the first to go when room is short
  const rank = (i) => { if (head?.cells[i]?.classList.contains('m-low')) return 999 + i; const k = PRI.indexOf(label(i)); return k < 0 ? 99 + i : k; };
  const order = [...Array(n).keys()].slice(1).sort((a, b) => rank(a) - rank(b));
  // a long text column (a list of names, a note) may take two lines, so it is counted at about half its length
  const textCol = (i) => i > 0 && (head?.cells[i]?.classList.contains('l') || sample.cells[i]?.classList.contains('l')) && widths[i] > avail * 0.3 && !sample.cells[i].querySelector('button.cm-btn, input, select');
  for (const i of order) {
    if (keep.has(i) || !widths[i]) continue;
    // a text column takes what room is left, as long as that is a fair share; it is clamped to two lines
    const w = textCol(i) ? Math.max(avail * 0.3, Math.min(widths[i] / 2, avail - used)) : widths[i];
    if (used + w <= avail) { keep.add(i); used += w; if (textCol(i)) for (const r of all) clampCell(r.cells[i]); }
  }
  // any other long words left in a kept column stop at two lines too
  for (const r of rows) [...r.cells].forEach((c, i) => {
    if (i && keep.has(i) && c.textContent.trim().length > 22 && !c.querySelector('button.cm-btn, input, select')) clampCell(c);
  });
  for (const r of all) [...r.cells].forEach((c, i) => { if (!keep.has(i)) c.classList.add('m-h'); });
  for (const th of head?.cells || []) if (th.textContent.trim().length > 6) clampCell(th);
  // the name column takes what is left, and long names are cut short rather than pushing the figures off
  for (const r of all) r.cells[0].classList.add('m-first');
  // sorting stays available as a drop-down for the headings that are still sortable
  const ths = head ? [...head.cells] : [];
  const sortable = ths.filter((t) => t.classList.contains('sortable'));
  if (sortable.length && !table.previousElementSibling?.classList?.contains('m-sort')) {
    const sel = h('select', { class: 'cm-input', 'aria-label': 'Sort by' },
      sortable.map((t) => h('option', { value: String(ths.indexOf(t)), selected: t.classList.contains('sorted') }, t.textContent.replace(/[▲▼]/g, '').trim() || 'Sort')));
    sel.addEventListener('change', () => { const th = ths[Number(sel.value)]; if (!th.classList.contains('sorted')) th.click(); });
    table.before(h('div', { class: 'm-sort' }, h('span', { class: 'cm-s' }, 'Sort by'), sel,
      h('button', { class: 'cm-btn', 'aria-label': 'Reverse order', onClick: () => (ths.find((t) => t.classList.contains('sorted')) || ths[Number(sel.value)])?.click() }, '⇅')));
  }
}

/** Label and value lists: a long value shows two lines, and a tap on it shows the rest. */
function kvClamp(t) {
  for (const r of t.rows) for (const c of r.cells) {
    if (c.querySelector('button.cm-btn, input, select') || c.textContent.length < 30) continue;
    clampCell(c);
    c.classList.add('m-more');
    c.addEventListener('click', () => c.classList.toggle('m-open'));
  }
}

/** A long text cell wraps onto a second line and no further. */
function clampCell(td) {
  if (td.firstElementChild?.classList.contains('m-clamp')) return;
  const box = h('div', { class: 'm-clamp' });
  box.append(...td.childNodes);
  td.append(box);
  td.classList.add('m-wrap');
}

/** Several buttons in one cell become one: it shows the chosen one (or the column's name) and drops the rest. */
function pickCell(td, heading) {
  if (td.querySelector('.m-pick')) return;
  const buttons = [...td.querySelectorAll('button.cm-btn')];
  if (buttons.length < 2) return;
  const cur = buttons.find(isCurrent);
  const word = heading ? heading.split(/\s+/)[0] : '';
  const text = cur ? optLabel(cur) : word && word.length <= 9 ? word : 'Choose';
  const pick = h('button', { class: 'cm-btn m-pick' + (cur ? ' go' : ''), 'aria-haspopup': 'menu', onClick: (e) => { e.stopPropagation(); openList(pick, buttons); } }, `${text} ▾`);
  for (const b of buttons) b.classList.add('m-picked');
  td.classList.add('m-pickcell');
  td.prepend(pick);
}

function scan(root) {
  if (!narrow()) return;
  for (const t of root.querySelectorAll('table.cm-tbl:not([data-m])')) {
    // a table with nothing in it yet ("No hitters at this level") shows only its message, and is looked at again when it fills
    const body = [...(t.tBodies[0]?.rows || [])];
    if (t.tHead && !body.some((r) => !r.querySelector('[colspan]'))) { t.classList.add('m-empty'); continue; }
    t.classList.remove('m-empty');
    t.dataset.m = '1';
    if (t.classList.contains('msg-tbl') || t.closest('.pp-stats') || t.classList.contains('fa-tbl')) continue;
    // label and value lists (no headings, two or three columns) keep every column and let long values wrap
    if (!t.tHead && (t.tBodies[0]?.rows[0]?.cells.length || 0) <= 3 && !t.querySelector('button')) { t.classList.add('m-kv'); kvClamp(t); continue; }
    toFit(t); // measured with no wrapping, so a table that only looks narrow because its words are broken up is caught too
  }
}

export function watchTables(root) {
  if (!root || typeof MutationObserver === 'undefined') return;
  let queued = false;
  new MutationObserver(() => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => { queued = false; scan(root); });
  }).observe(root, { childList: true, subtree: true });
  scan(root);
}

// ---------- tab rows and filter strips become drop-downs ----------
// A row of tabs is replaced by one button showing the current choice; tapping it drops a grid of the choices.
// The real buttons stay in the page (hidden), so every screen keeps working as it was written.
const GROUPS = [
  { sel: '.cm-tabs, .tx-tabs', label: null },
  { sel: '.quick-links', label: 'Lineups and depth' },
  { sel: '.depth-strip', label: 'Position' },
  { sel: '.lvl-strip', label: 'Level' },
];

const optLabel = (b) => b.textContent.replace(/\s+/g, ' ').trim();
const isCurrent = (b) => b.getAttribute('aria-selected') === 'true' || b.classList.contains('go') || b.classList.contains('on') || b.getAttribute('aria-pressed') === 'true';

function currentLabel(c, g) {
  const cur = [...c.querySelectorAll('button')].find(isCurrent);
  if (g.label && c.matches('.depth-strip')) return cur ? `${g.label}: ${optLabel(cur)}` : 'All positions';
  return cur ? optLabel(cur) : (c.dataset.mlabel || g.label || 'Choose');
}

let pop = null;
function closePop() { pop?.remove(); pop = null; document.removeEventListener('pointerdown', popAway, true); }
function popAway(e) { if (pop && !pop.contains(e.target) && !e.target.closest('.m-drop, .m-pick')) closePop(); }

function openPop(btn, c) {
  const kids = [];
  for (const el of c.children) {
    if (el.matches('button')) kids.push(el);
    else if (el.matches('.depth-lab')) kids.push({ head: optLabel(el) });
    else if (el.querySelector?.('button')) kids.push(...el.querySelectorAll('button'));
  }
  openList(btn, kids);
}

/** A list of buttons dropped under (or, near the bottom of the screen, above) the button that opened it. */
function openList(btn, kids) {
  btn.dataset.id ||= `p${++uid}`;
  const again = pop && pop.dataset.for === btn.dataset.id;
  closePop();
  if (again) return;
  const r = btn.getBoundingClientRect();
  const below = r.bottom < window.innerHeight * 0.6;
  pop = h('div', { class: 'm-pop', role: 'menu', dataset: { for: btn.dataset.id }, style: below ? { top: `${Math.round(r.bottom + 2)}px` } : { bottom: `${Math.round(window.innerHeight - r.top + 2)}px`, top: 'auto' } },
    kids.map((k) => k.head
      ? h('div', { class: 'm-pop-head' }, k.head)
      : h('button', { class: `m-pop-item${isCurrent(k) ? ' on' : ''}`, disabled: k.disabled, role: 'menuitem', onClick: () => { closePop(); k.click(); } }, optLabel(k))));
  document.body.append(pop);
  setTimeout(() => document.addEventListener('pointerdown', popAway, true), 0);
}

function dropFor(c, g) {
  if (c.dataset.md) { const d = document.querySelector(`.m-drop[data-id="${c.dataset.md}"]`); if (d) { const t = currentLabel(c, g); if (d.firstChild.textContent !== t) d.firstChild.textContent = t; } return; }
  const buttons = c.querySelectorAll('button');
  if (!buttons.length) return;
  c.dataset.md = String(++uid);
  c.classList.add('m-src');
  const drop = h('button', { class: 'm-drop', dataset: { id: c.dataset.md }, 'aria-haspopup': 'menu', onClick: () => openPop(drop, c) }, h('span', {}, currentLabel(c, g)), h('b', {}, '▾'));
  // consecutive rows share one bar, so two drop-downs sit side by side
  let bar = null;
  const prev = c.previousElementSibling;
  if (prev?.dataset?.md && prev.previousElementSibling?.classList.contains('m-dropbar')) bar = prev.previousElementSibling;
  if (!bar) { bar = h('div', { class: 'm-dropbar' }); c.before(bar); }
  bar.append(drop);
}

function scanTabs(root) {
  if (!narrow()) return;
  for (const g of GROUPS) for (const c of root.querySelectorAll(g.sel)) if (!c.closest('.m-pop, .m-menu')) dropFor(c, g);
  for (const bar of root.querySelectorAll('.m-dropbar')) {
    // drop-downs whose row has gone are cleared away
    for (const d of [...bar.children]) if (!root.querySelector(`[data-md="${d.dataset.id}"]`)) d.remove();
    if (!bar.children.length) bar.remove();
  }
}

export function watchTabs(root) {
  if (!root || typeof MutationObserver === 'undefined') return;
  let queued = false;
  new MutationObserver(() => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => { queued = false; scanTabs(root); });
  }).observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'aria-selected'] });
  scanTabs(root);
}
