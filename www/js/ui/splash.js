// The start-up logos. Each one fades in and out by itself, and a click, tap or key moves to the next;
// Escape skips the lot. Partner logos are picked up from img/logos/ when the files are there and
// fall back to a plain lettered mark when they are not.
import { h } from './dom.js';

const SLIDES = [
  { id: 'ryder', src: 'img/logos/ryder.svg', alt: 'Ryder Game Studios', bg: '#0b0e13', ink: '#9aa3b2' },
  { id: 'threeandtwo', src: 'img/logos/threeandtwo.png', alt: 'Three & Two Baseball', top: 'In association with', bg: '#faf8f4', ink: '#7a7468', fall: ['THREE&TWO', 'BASEBALL'], amp: true },
  { id: 'baseball4cast', src: 'img/logos/baseball4cast.png', alt: 'Baseball4Cast', top: 'Forecasts by', bg: '#76492f', ink: '#e3cdbd', fall: ['Baseball4Cast', ''] },
];
const HOLD = 2300;

export function splash() {
  return new Promise((done) => {
    const root = h('div', { class: 'splash', role: 'presentation' });
    const hint = h('div', { class: 'splash-hint' }, 'Click to continue, Esc to skip');
    document.body.append(root);
    let i = -1, timer = 0, over = false;

    const finish = () => {
      if (over) return;
      over = true;
      clearTimeout(timer);
      window.removeEventListener('keydown', key, true);
      root.classList.add('out');
      setTimeout(() => { root.remove(); done(); }, 350);
    };
    const mark = (s) => {
      const img = h('img', { class: 'splash-logo', src: s.src, alt: s.alt, draggable: 'false' });
      img.onerror = () => {
        if (!s.fall) { img.remove(); return; }
        const [a, b] = s.amp ? s.fall[0].split('&') : [s.fall[0], ''];
        img.replaceWith(h('div', { class: 'splash-word' }, h('b', {}, a, s.amp ? h('i', {}, '&') : null, b), s.fall[1] ? h('span', {}, s.fall[1]) : null));
      };
      return img;
    };
    const next = () => {
      clearTimeout(timer);
      i += 1;
      if (i >= SLIDES.length) { finish(); return; }
      const s = SLIDES[i];
      const card = h('div', { class: `splash-card ${s.id}` }, s.top ? h('div', { class: 'splash-top' }, s.top) : null, mark(s));
      root.style.background = s.bg; root.style.setProperty('--ink', s.ink);
      root.replaceChildren(card, hint);
      requestAnimationFrame(() => requestAnimationFrame(() => card.classList.add('in')));
      timer = setTimeout(next, HOLD);
    };
    function key(e) {
      e.preventDefault(); e.stopPropagation();
      if (e.key === 'Escape') finish(); else next();
    }
    root.addEventListener('click', next);
    window.addEventListener('keydown', key, true);
    next();
  });
}
