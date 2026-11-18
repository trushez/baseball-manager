// Application shell: the blue sidebar on the left, the current screen, and Back / Next underneath.
import { h, fill, toast, clearToast, placeToast } from './dom.js';
import { nav } from './nav.js';
import { showBackdrop } from './backdrop.js';
import { applyTheme } from './theme.js';
import { game } from '../state.js';

/**
 * @param {HTMLElement} root
 * @param {{date:string|(()=>string), day:string|(()=>string), manager?:string, menu?:()=>any[]}} ctx
 */
export function createShell(root, ctx) {
  const stack = [];
  const ahead = []; // screens left with Back, for the forward arrow / Next

  const side = h('div', { class: 'cm-side-in' });
  const screenHost = h('div', { style: { display: 'contents' } });
  const backBtn = h('button', { class: 'cm-big', onClick: () => back() }, 'Back');
  const nextBtn = h('button', { class: 'cm-big', onClick: () => { const cur = stack[stack.length - 1]; if (cur?.locked) cur.onContinue?.(); else forward(); } }, 'Next');

  // phone chrome: a top bar (Back, Menu, date) and a bottom bar (the main action); shown by css below 700 px
  const mtop = h('div', { class: 'm-top' });
  const mbot = h('div', { class: 'm-bottom' });
  const mmenu = h('div', { class: 'm-menu', hidden: true, role: 'menu' });
  root.replaceChildren(h('div', { class: 'cm-app' },
    h('aside', { class: 'cm-side', 'aria-label': 'Game menu' }, side),
    h('main', { class: 'cm-main' }, screenHost, h('div', { class: 'cm-backnext' }, backBtn, nextBtn)),
    mtop, mbot, mmenu));

  let menuRest = [];
  let menuFor = null, menuGroup = null; // the screen the open menu belongs to, and the group it shows
  function closeMenu() {
    mmenu.hidden = true;
    mtop.querySelector('.m-menubtn')?.setAttribute('aria-expanded', 'false');
    document.removeEventListener('pointerdown', menuAway, true);
  }
  function menuAway(e) { if (!e.target.closest?.('.m-menu') && !e.target.closest?.('.m-menubtn')) closeMenu(); }
  /** The menu is a drop-down grid; a group opens its own list with a way back, so nothing ever needs scrolling. */
  function drawMenu(group = null) {
    menuGroup = group?.label ?? null;
    const list = group ? group.children : menuRest;
    const item = (it) => h('button', {
      class: `m-item${it.on ? ' on' : ''}${it.hl ? ' hl' : ''}`, role: 'menuitem', disabled: it.disabled,
      onClick: () => { if (it.children) { drawMenu(it); return; } closeMenu(); it.onClick?.(); },
    }, h('span', {}, it.label), it.children ? h('b', { class: 'm-more' }, '›') : null, it.sub ? h('small', {}, it.sub) : null);
    fill(mmenu, group ? h('button', { class: 'm-item m-head', onClick: () => drawMenu(null) }, `‹ ${group.label}`) : null, list.filter(Boolean).map(item));
    mmenu.classList.toggle('sub', !!group);
  }
  function toggleMenu() {
    if (!mmenu.hidden) { closeMenu(); return; }
    drawMenu(null);
    menuFor = stack[stack.length - 1];
    mmenu.hidden = false;
    mtop.querySelector('.m-menubtn')?.setAttribute('aria-expanded', 'true');
    document.addEventListener('pointerdown', menuAway, true);
  }
  function renderMobile(list, lock, date) {
    // the same screen redrawing its menu (a live match does at every half inning) keeps an open menu open, with the new items;
    // a new screen closes it
    const keepOpen = !mmenu.hidden && menuFor === stack[stack.length - 1];
    if (!keepOpen) closeMenu();
    const [a, b, ...more] = list;
    const sideItem = b && !b.children ? b : null;
    menuRest = sideItem ? more : [b, ...more].filter(Boolean);
    if (keepOpen) drawMenu(menuRest.find((x) => x?.children && x.label === menuGroup) || null);
    const unreadHot = (sideItem?.hl) || menuRest.some((x) => x.hl);
    // Continue sits at the top, Back along the bottom
    fill(mtop,
      a ? h('button', { class: `m-back m-cont${a.hl ? ' hl' : ''}`, disabled: a.disabled, onClick: () => a.onClick?.() }, a.short || a.label) : h('span'),
      h('button', { class: `m-menubtn${unreadHot ? ' hl' : ''}`, 'aria-haspopup': 'menu', 'aria-expanded': keepOpen ? 'true' : 'false', onClick: toggleMenu }, 'Menu ▾'),
      h('div', { class: 'm-date' }, date));
    const btn = (it, cls) => h('button', { class: `m-btn ${cls}${it.hl ? ' hl' : ''}${it.on ? ' on' : ''}`, disabled: it.disabled, onClick: () => it.onClick?.() },
      it.short || it.label, it.sub ? h('small', {}, it.sub) : null);
    fill(mbot,
      h('button', { class: 'm-btn main', 'aria-label': 'Back', disabled: lock || stack.length < 2, onClick: () => back() }, '‹ Back'),
      sideItem ? btn(sideItem, 'aux') : null);
  }

  const defaultSide = () => [
    { label: 'Continue Game', disabled: true },
    { label: ctx.manager, hl: true, onClick: () => toast('The front office desk arrives with the season screens.') },
    { label: 'Leagues', onClick: () => toast('Leagues arrive with the season screens.') },
    { label: 'Clubs', onClick: () => toast('Club screens arrive in Phase 4.') },
    { label: 'Find', onClick: () => toast('Player search arrives in Phase 4.') },
    { label: 'Game Options', onClick: () => toast('Options arrive later.') },
  ];

  /**
   * The Space bar does the next useful thing, so a whole season can be played with one key: read the next unread message; with none
   * left, Continue; on a match day, play the game; during the game, pause and resume it, and Continue when it is over. It stays out of the way of text fields, dialogs and pop-up menus.
   */
  let spaceDown = false;
  document.addEventListener('keydown', (e) => {
    if (e.code !== 'Space' || e.repeat || e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return;
    if (e.target.closest?.('input, textarea, select, [contenteditable="true"]')) return;
    if (document.querySelector('[role="dialog"], .cm-popout, .cm-droplist, .busy')) return;
    if (!root.isConnected || !stack.length || !game.world || !game.orgId) return;
    e.preventDefault(); spaceDown = true;
    spaceAction();
  }, true);
  document.addEventListener('keyup', (e) => { if (e.code === 'Space' && spaceDown) { spaceDown = false; e.preventDefault(); } }, true);
  async function spaceAction() {
    const cur = stack[stack.length - 1];
    if (cur?.locked) { if (cur.space) cur.space(); else if (!nextBtn.disabled) cur.onContinue?.(); return; }
    if (cur?.space?.()) return;
    if (game.inbox?.some((m) => !m.read && !m.minor) && !cur?.space) { const { inboxScreen } = await import('./inbox-screen.js'); nav.push(inboxScreen()); return; }
    (await import('./continue.js')).doContinue();
  }

  // a screen with `locked` (a match under way) has no Back: the only way out is its own Continue
  const locked = () => !!stack[stack.length - 1]?.locked;

  /** A list that pops out beside a sidebar button, closing when you pick something, click elsewhere or press Escape. */
  function popOut(btn, kids) {
    const was = document.querySelector('.cm-popout');
    closePop();
    if (was && was.dataset.for === btn.textContent) return;
    const r = btn.getBoundingClientRect();
    const phone = window.innerWidth <= 700;
    const horizontal = getComputedStyle(side).flexDirection === 'row' || window.innerWidth < 900;
    // on a phone the menu is a sheet that rises from the bottom bar
    const list = h('div', { class: `cm-popout${phone ? ' sheet' : ''}`, role: 'menu', dataset: { for: btn.textContent }, style: phone ? { bottom: `${window.innerHeight - side.parentNode.getBoundingClientRect().top}px` } : horizontal ? { left: `${Math.max(4, r.left)}px`, top: `${r.bottom}px` } : { left: `${r.right}px`, top: `${r.top}px` } },
      kids.map((k) => h('button', { class: `cm-popitem${k.on ? ' on' : ''}${k.hl ? ' hl' : ''}`, role: 'menuitem', onClick: () => { closePop(); k.onClick?.(); } }, k.label)));
    document.body.append(list);
    // keep it on the screen when the button is low down
    const over = list.getBoundingClientRect().bottom - window.innerHeight;
    if (over > 0 && !horizontal && !phone) list.style.top = `${Math.max(4, r.top - over - 8)}px`;
    setTimeout(() => { document.addEventListener('pointerdown', away, true); document.addEventListener('keydown', esc, true); }, 0);
  }
  function closePop() { document.querySelector('.cm-popout')?.remove(); document.removeEventListener('pointerdown', away, true); document.removeEventListener('keydown', esc, true); }
  function away(e) { if (!e.target.closest?.('.cm-popout') && !e.target.closest?.('.has-sub')) closePop(); }
  function esc(e) { if (e.key === 'Escape') closePop(); }

  function renderSide() {
    closePop();
    const cur = stack[stack.length - 1];
    const lock = locked();
    const items = cur?.side ? cur.side() : ctx.menu ? ctx.menu() : defaultSide();
    const val = (x) => (typeof x === 'function' ? x() : x);
    const date = cur?.dateBox ? cur.dateBox() : [val(ctx.day), h('br'), val(ctx.date)];
    fill(side,
      h('button', { class: 'cm-sidebtn cm-mback', 'aria-label': 'Back', disabled: lock || stack.length < 2, onClick: () => back() }, '‹'),
      h('div', { class: 'cm-datebox' }, date),
      h('div', { class: 'cm-arrows' },
        h('button', { class: 'cm-arrow', 'aria-label': 'Back', disabled: lock || stack.length < 2, onClick: () => back() }, '←'),
        h('button', { class: 'cm-arrow', 'aria-label': 'Forward', disabled: lock || !ahead.length, onClick: () => forward() }, '→')),
      items.filter(Boolean).map((it) => h('button', {
        class: `cm-sidebtn${it.hl ? ' hl' : ''}${it.big ? ' big' : ''}${it.on ? ' on' : ''}${it.children ? ' has-sub' : ''}`, disabled: it.disabled,
        'aria-haspopup': it.children ? 'menu' : null,
        onClick: it.children ? (e) => popOut(e.currentTarget, it.children) : it.onClick,
      }, it.label, it.children ? h('span', { class: 'cm-sidearrow' }, '▸') : null, it.sub ? h('small', {}, it.sub) : null)));
    backBtn.parentNode?.classList.toggle('cm-locked', lock);
    renderMobile(items.filter(Boolean), lock, date.map((n) => (n && n.cloneNode ? n.cloneNode(true) : n)));
    if (lock) {
      // in a match: no Back, and Next becomes Continue once the game is over
      const done = cur.canContinue?.();
      backBtn.hidden = true;
      nextBtn.textContent = 'Continue';
      nextBtn.disabled = !done;
      nextBtn.classList.toggle('go', !!done);
    } else {
      backBtn.hidden = false;
      nextBtn.textContent = 'Next';
      nextBtn.classList.remove('go');
      backBtn.disabled = stack.length < 2;
      nextBtn.disabled = !ahead.length;
    }
  }

  // Going back returns you to where you were: the page scroll and any scrolled list or table inside the screen.
  const pathOf = (root, el) => { const p = []; while (el && el !== root) { const par = el.parentNode; p.unshift([...par.children].indexOf(el)); el = par; } return p; };
  const at = (root, path) => path.reduce((n, i) => n?.children?.[i], root);
  function remember(s) {
    if (!s?.el || typeof document === 'undefined' || !s.el.querySelectorAll) return;
    const inner = [];
    for (const e of s.el.querySelectorAll('*')) if (e.scrollTop > 0) inner.push([pathOf(s.el, e), e.scrollTop]);
    s._scroll = { y: window.scrollY, inner };
  }
  function restore(s) {
    const sc = s._scroll;
    if (!sc) { window.scrollTo(0, 0); return; }
    const apply = () => { for (const [path, top] of sc.inner) { const e = at(s.el, path); if (e) e.scrollTop = top; } window.scrollTo(0, sc.y); };
    apply();
    if (typeof requestAnimationFrame !== 'undefined') requestAnimationFrame(apply);
  }

  function show(back = false) {
    clearToast();
    const cur = stack[stack.length - 1];
    fill(screenHost, cur.el);
    cur.onShow?.();
    if (typeof document !== 'undefined') showBackdrop(cur.bg || 'default', cur.bgOrg ?? ctx.org?.() ?? '');
    try { applyTheme(ctx.club?.()); } catch { /* no club yet */ }
    renderSide();
    placeToast();
    if (back) restore(cur); else window.scrollTo(0, 0);
  }

  function push(screen, keepAhead = false) {
    remember(stack[stack.length - 1]);
    stack[stack.length - 1]?.onHide?.();
    if (!keepAhead) ahead.length = 0;
    stack.push(screen);
    show(keepAhead && !!screen._scroll);
  }
  function back() {
    if (stack.length < 2 || locked()) return;
    remember(stack[stack.length - 1]);
    const s = stack.pop();
    s.onHide?.();
    ahead.push(s);
    show(true);
  }
  function forward() {
    if (!ahead.length) return;
    push(ahead.pop(), true);
  }

  /** Start again from one screen (a new game). */
  function reset(screen) {
    while (stack.length) stack.pop().onHide?.();
    ahead.length = 0;
    push(screen);
  }
  /** Replace the current screen without adding a step to Back (tabs that are really separate screens). */
  function replace(screen) {
    stack.pop()?.onHide?.();
    push(screen, true);
  }

  const api = { push, back, reset, replace, refreshSide: renderSide, canBack: () => stack.length > 1 };
  nav.attach(api);
  return api;
}
