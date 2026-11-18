// The manual, in the game: the chapters down the side, the open one on the right, with Previous and Next at its foot.
import { h, fill } from './dom.js';
import { clubMenu } from './menu.js';
import { MANUAL } from './manual-text.js';

let lastChapter = MANUAL[0].id; // the manual opens where you left it

export function manualScreen(start = lastChapter) {
  let cur = MANUAL.some((c) => c.id === start) ? start : MANUAL[0].id;
  const list = h('nav', { class: 'man-toc', 'aria-label': 'Chapters' });
  const page = h('article', { class: 'man-page' });

  function draw() {
    lastChapter = cur;
    const i = MANUAL.findIndex((c) => c.id === cur), ch = MANUAL[i];
    fill(list, MANUAL.map((c, n) => h('button', { class: `man-ch${c.id === cur ? ' on' : ''}`, 'aria-current': c.id === cur ? 'page' : null, onClick: () => { cur = c.id; draw(); page.scrollTop = 0; window.scrollTo(0, 0); } },
      h('span', { class: 'n' }, String(n + 1)), c.title)));
    const prev = MANUAL[i - 1], next = MANUAL[i + 1];
    fill(page,
      h('div', { class: 'man-num' }, `Chapter ${i + 1} of ${MANUAL.length}`),
      h('h2', { class: 'man-title' }, ch.title),
      ch.sections.map((s) => h('section', {}, h('h3', {}, s.h), s.p.map((t) => h('p', {}, t)))),
      h('div', { class: 'man-foot' },
        prev ? h('button', { class: 'cm-btn', onClick: () => { cur = prev.id; draw(); page.scrollTop = 0; window.scrollTo(0, 0); } }, `‹ ${prev.title}`) : h('span'),
        next ? h('button', { class: 'cm-btn go', onClick: () => { cur = next.id; draw(); page.scrollTop = 0; window.scrollTo(0, 0); } }, `${next.title} ›`) : h('span')));
  }
  draw();
  return {
    el: h('div', { style: { display: 'contents' } }, h('div', { class: 'cm-title' }, 'Manual'), h('div', { class: 'cm-panel grow man' }, list, page)),
    side: () => clubMenu('options'),
  };
}
