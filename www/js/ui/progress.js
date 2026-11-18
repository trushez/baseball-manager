// A progress bar for saving and loading: it fills smoothly over a short, fixed time even when the work itself is instant.
import { h } from './dom.js';

const MIN_MS = 1100;

/** Run `work` behind a bar. The bar eases toward 90% while it runs, then fills and fades; resolves with the work's result. */
export async function withProgress(label, work) {
  const fill = h('i');
  const note = h('span', { class: 'pg-note' }, label);
  const veil = h('div', { class: 'pg-veil' }, h('div', { class: 'pg-box' }, h('b', {}, label), h('div', { class: 'pg-bar' }, fill), note));
  document.body.append(veil);
  requestAnimationFrame(() => veil.classList.add('in'));
  const t0 = performance.now();
  let stop = false;
  const tick = () => {
    if (stop) return;
    const k = Math.min(1, (performance.now() - t0) / MIN_MS);
    fill.style.width = `${Math.round(90 * (1 - (1 - k) ** 2))}%`;
    requestAnimationFrame(tick);
  };
  tick();
  let res, err;
  try { res = await work(); } catch (e) { err = e; }
  const wait = MIN_MS - (performance.now() - t0);
  if (wait > 0 && !err) await new Promise((r) => setTimeout(r, wait));
  stop = true;
  if (err) { veil.remove(); throw err; }
  fill.style.width = '100%';
  await new Promise((r) => setTimeout(r, 300));
  veil.classList.remove('in');
  setTimeout(() => veil.remove(), 250);
  return res;
}
