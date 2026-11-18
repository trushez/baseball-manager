// The width of the screens: they fill the window by default; a player can keep them to a centred column instead.
// It is a choice for the computer, not for a career, so it lives in the browser's storage.
const KEY = 'bm-narrow';

/** Apply the saved choice. Called once at start. */
export function applyLayout() {
  let narrow = false;
  try { narrow = localStorage.getItem(KEY) === '1'; } catch { /* storage blocked: fill the window */ }
  document.documentElement.classList.toggle('narrow', narrow);
}

export function setNarrow(on) {
  document.documentElement.classList.toggle('narrow', on);
  try { localStorage.setItem(KEY, on ? '1' : '0'); } catch { /* kept for this session only */ }
}

/** Full screen in a browser (a tablet or phone): the page asks the browser to hide its own bars. */
export function toggleWebFullscreen() {
  if (document.fullscreenElement) { document.exitFullscreen?.().catch(() => {}); return; }
  document.documentElement.requestFullscreen?.({ navigationUI: 'hide' }).catch(() => {});
}
