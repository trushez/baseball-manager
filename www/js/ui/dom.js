// Small DOM helpers shared by every screen.

/**
 * Create an element. attrs: class, style (object), dataset (object), on<Event> handlers, CSS custom
 * properties (keys starting --), booleans (true sets the attribute, false omits it), anything else as attributes.
 * Children may be strings, nodes, arrays, or null/false (skipped).
 * @param {string} tag
 * @param {Record<string, any>} [attrs]
 * @param {...any} kids
 * @returns {HTMLElement}
 */
export function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k.startsWith('--')) el.style.setProperty(k, v);
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  append(el, kids);
  return el;
}

function append(el, kids) {
  for (const k of kids) {
    if (k == null || k === false) continue;
    if (Array.isArray(k)) append(el, k);
    else el.append(k instanceof Node ? k : document.createTextNode(String(k)));
  }
}

/** Replace all children of `el`. */
export function fill(el, ...kids) {
  el.replaceChildren();
  append(el, kids);
  return el;
}

/** Colour class for a 20-80 value shown on its own in a table. */
export function vClass(v) {
  if (v >= 70) return 'v-top';
  if (v >= 60) return 'v-hi';
  if (v >= 45) return 'v-avg';
  if (v >= 35) return 'v-lo';
  return 'v-bad';
}
export const val = (v) => h('span', { class: vClass(v), title: `${v} on the 20-80 scale` }, v);

/**
 * A row of CM-style tab buttons. Returns the element plus select(id) to change the highlight from outside.
 * @param {{id:string,label:string,disabled?:boolean}[]} tabs
 */
export function cmTabs(tabs, active, onSelect) {
  const el = h('div', { class: 'cm-tabs', role: 'tablist', '--n': tabs.length });
  const btns = tabs.map((t) => h('button', {
    class: 'cm-tab', role: 'tab', disabled: t.disabled, 'aria-selected': String(t.id === active),
    onClick: () => { select(t.id); onSelect(t.id); },
  }, t.label));
  el.append(...btns);
  function select(id) { btns.forEach((b, i) => b.setAttribute('aria-selected', String(tabs[i].id === id))); }
  return { el, select };
}

let toastTimer = 0;
let toastAt = 0;
let toastMsg = '';
/** Clears the note when you change screen, but not one that was only just written by the action that caused the change. */
export function clearToast() {
  toastSink = null; // a screen that wants its own results (the inbox) asks again when it is shown
  if (Date.now() - toastAt < 1500) return;
  clearTimeout(toastTimer);
  toastMsg = '';
  document.querySelector('.cm-note')?.remove();
}
let toastSink = null;
/** While set, results go to the screen instead of the note: the sink returns true when it has shown the message. */
export const captureToasts = (fn) => { toastSink = fn; };
/** What an action did, written as a quiet line under the screen's title (no pop-up), until the next screen or a few seconds pass. */
export function toast(msg) {
  if (toastSink?.(msg)) return;
  toastAt = Date.now();
  toastMsg = msg;
  placeToast();
  // the action usually redraws the screen straight after, which can take the title (and the note) with it
  if (typeof requestAnimationFrame !== 'undefined') requestAnimationFrame(() => { if (toastMsg && !document.querySelector('.cm-note')) placeToast(); });
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toastMsg = ''; document.querySelector('.cm-note')?.remove(); }, 5200);
}
/** Put the current note under the title of the screen on show (the shell calls this after drawing a screen). */
export function placeToast() {
  if (typeof document === 'undefined') return;
  document.querySelector('.cm-note')?.remove();
  if (!toastMsg) return;
  const main = document.querySelector('.cm-main');
  if (!main) return;
  const n = h('div', { class: 'cm-note', role: 'status' }, toastMsg);
  const title = main.querySelector('.cm-title');
  // inside the title bar, laid over the top of the screen below it, so nothing on the screen moves
  if (title) title.append(n); else main.prepend(n);
}

export const fullName = (p) => `${p.first} ${p.last}`;
export const ordinal = (n) => {
  const s = ['th', 'st', 'nd', 'rd'], v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
};

/** A game-style drop-down: a button that opens a list in the game's own colours, in place of the browser's select. */
export function dropdown(options, value, onChange, { label = '', title = '', wide = false, aria } = {}) {
  let cur = value;
  const text = () => `${label}${options.find(([v]) => String(v) === String(cur))?.[1] ?? ''}`;
  const t = h('span', { class: 'cm-drop-t' }, text());
  const btn = h('button', { type: 'button', class: `cm-drop${wide ? ' wide' : ''}`, 'aria-haspopup': 'listbox', 'aria-label': aria, title, onClick: toggle }, t, h('span', { class: 'cm-drop-a' }, '▾'));
  function close() { document.querySelector('.cm-droplist')?.remove(); document.removeEventListener('mousedown', away, true); document.removeEventListener('keydown', key, true); }
  function away(e) { if (!e.target.closest?.('.cm-droplist') && !btn.contains(e.target)) close(); }
  function key(e) { if (e.key === 'Escape') close(); }
  function toggle() {
    if (document.querySelector('.cm-droplist')) { close(); return; }
    const r = btn.getBoundingClientRect();
    const list = h('div', { class: 'cm-droplist', role: 'listbox', style: { left: `${Math.max(4, r.left)}px`, minWidth: `${r.width}px` } },
      options.map(([v, l]) => h('button', { type: 'button', role: 'option', class: `cm-dropitem${String(v) === String(cur) ? ' on' : ''}`, onClick: () => { const changed = String(v) !== String(cur); cur = v; t.textContent = text(); close(); if (changed) onChange(v); } }, l)));
    document.body.append(list);
    // below the button, or above it when there is no room
    // below the button, or above it when there is more room there; never past the screen's edge (the list scrolls instead)
    const lh = list.offsetHeight || 0, below = window.innerHeight - r.bottom - 8, above = r.top - 8;
    const up = lh > below && above > below;
    const room = Math.max(120, up ? above : below);
    list.style.maxHeight = `${room}px`;
    list.style.top = `${up ? Math.max(4, r.top - Math.min(lh, room)) : r.bottom}px`;
    // keep the list on screen: slide it left when it would run off the right edge, and cap its width
    list.style.maxWidth = `${window.innerWidth - 8}px`;
    const over = list.getBoundingClientRect().right - (window.innerWidth - 4);
    if (over > 0) list.style.left = `${Math.max(4, r.left - over)}px`;
    document.addEventListener('mousedown', away, true); document.addEventListener('keydown', key, true);
    list.querySelector('.on')?.scrollIntoView?.({ block: 'nearest' });
  }
  return btn;
}

// hold a button and the figure keeps changing, faster the longer it is held (the buttons are rebuilt on every change, so the release is heard on the window)
let holdTimer = null;
/** Keeps the page from getting shorter while a stepper is in use: when the screen below a stepper shrinks (a shorter
 *  verdict, a row that goes away) and the page is scrolled down, the browser would pull everything down under the
 *  finger. The page keeps its tallest height until the stepper has been left alone for a moment. */
function steady(go) {
  const body = document.body, h0 = document.documentElement.scrollHeight;
  if (!holdTimer) body.style.minHeight = `${h0}px`;
  else body.style.minHeight = `${Math.max(h0, parseFloat(body.style.minHeight) || 0)}px`;
  clearTimeout(holdTimer);
  holdTimer = setTimeout(() => { body.style.minHeight = ''; holdTimer = null; }, 2000);
  go();
}

export function holdable(fn) {
  const go = () => steady(fn);
  return {
    onPointerdown: (e) => {
      if (e.button) return;
      e.preventDefault();
      let n = 0, timer = null, live = true;
      const tick = () => { if (!live) return; go(); n++; timer = setTimeout(tick, n < 6 ? 140 : n < 16 ? 80 : 40); };
      const stop = () => { live = false; clearTimeout(timer); window.removeEventListener('pointerup', stop); window.removeEventListener('pointercancel', stop); window.removeEventListener('blur', stop); };
      window.addEventListener('pointerup', stop); window.addEventListener('pointercancel', stop); window.addEventListener('blur', stop);
      go(); n = 1;
      timer = setTimeout(tick, 380);
    },
    onClick: (e) => { if (e.detail === 0) go(); }, // the keyboard
  };
}
