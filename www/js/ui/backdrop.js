// The picture behind each screen, as in CM: a club's own team pack if you have put one in game/img/packs,
// otherwise one of the historical photographs (game/img/photos.json, fetched by tools/fetch-photos.js).
// Each screen names its kind (profile, squad, club...) and the club it shows; a club keeps the same photo
// on the same screen, and different clubs get different ones.

let manifest = null;
const seen = new Map(); // url -> Promise<boolean>, so a missing file is only asked for once

const loadManifest = () => (manifest ??= fetch('img/photos.json').then((r) => (r.ok ? r.json() : { photos: [] })).catch(() => ({ photos: [] })));
const exists = (url) => {
  if (!seen.has(url)) seen.set(url, new Promise((res) => { const i = new Image(); i.onload = () => res(true); i.onerror = () => res(false); i.src = url; }));
  return seen.get(url);
};
let stadiums = null;
const loadStadiums = () => (stadiums ??= fetch('img/stadiums.json').then((r) => (r.ok ? r.json() : { photos: [] })).catch(() => ({ photos: [] })));
/** The ballpark photographs the game ships with, for the title screen: one picked at random, in the shape of the window. */
export async function titlePhoto() {
  const { photos } = await loadStadiums();
  const want = window.innerWidth < window.innerHeight ? 'port' : 'land';
  const pool = photos.filter((p) => p.title && p.orient === want);
  return pool.length ? pool[Math.floor(Math.random() * pool.length)].file : null;
}
const hash = (s) => [...s].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);

/** The picture for a screen, or null. */
export async function backdropFor(screen = 'default', org = '') {
  const tries = [];
  if (org) for (const name of [screen, 'default']) for (const ext of ['jpg', 'png']) tries.push(`img/packs/${org}/${name}.${ext}`);
  for (const url of tries) if (await exists(url)) return url;
  // the ballpark photographs first, then the old ones; a club keeps the same picture on the same screen
  const ours = (await loadStadiums()).photos;
  for (const pool of [ours.filter((p) => p.screens.includes(screen)), ours.filter((p) => p.screens.includes('default'))]) {
    if (!pool.length) continue;
    const start = hash(`${screen}-${org}`) % pool.length;
    for (let i = 0; i < pool.length; i++) { const url = pool[(start + i) % pool.length].file; if (await exists(url)) return url; }
  }
  const { photos } = await loadManifest();
  for (const pool of [photos.filter((p) => p.screens.includes(screen)), photos.filter((p) => p.screens.includes('default')), photos]) {
    if (!pool.length) continue;
    const start = hash(`${screen}-${org}`) % pool.length;
    for (let i = 0; i < pool.length; i++) {
      const url = `img/bg/${pool[(start + i) % pool.length].id}.jpg`;
      if (await exists(url)) return url;
    }
  }
  return null;
}

let token = 0;
/** Put the screen's picture behind the app (or none). */
export function showBackdrop(screen, org) {
  const mine = ++token;
  const root = document.documentElement;
  backdropFor(screen, org).then((url) => {
    if (mine !== token) return; // a newer screen has taken over
    if (url) { root.style.setProperty('--bg', `url("${new URL(url, location.href).href}")`); root.classList.add('has-bg'); } else { root.style.removeProperty('--bg'); root.classList.remove('has-bg'); }
  });
}
