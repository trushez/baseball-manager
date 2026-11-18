// The title screen that appears after the logos: an empty ballpark at dusk and the ways into the game.
import { h, toast } from './dom.js';
import { nav } from './nav.js';
import { game } from '../state.js';
import { withProgress } from './progress.js';
import { listSaves, loadGame } from '../save.js';
import { GAME_VERSION } from '../version.js';

/** Starting positions that make the career harder; each one just pre-sets the New Game screen. */
const CHALLENGES = [
  { id: 'rebuild', name: 'The rebuild', text: 'Take over one of the five weakest clubs with no playing career behind you, against sharper rival general managers.', bg: 'none', route: true, difficulty: 'hard' },
  { id: 'climb', name: 'The long climb', text: 'Start at one of the five weakest clubs as a former minor league player and work your way up the ladder.', bg: 'minor', route: true },
  { id: 'spotlight', name: 'Under the spotlight', text: 'Any club you like, but you arrive as a famous former All-Star, the owner expects results and the other general managers are sharper.', bg: 'star', route: false, difficulty: 'hard' },
];

/**
 * @param {{ newGame: () => void }} o newGame shows the New Game screen
 * Resolves when the player has chosen a way in and the screen is gone.
 */
export function titleScreen({ newGame }) {
  return new Promise((done) => {
    // the cover art: the game's name is painted into it, so the heading below is kept for screen readers only
    const root = h('div', { class: 'title title-art' });
    const box = h('div', { class: 'title-menu' });
    document.body.append(root);
    requestAnimationFrame(() => root.classList.add('in'));
    const close = () => { window.removeEventListener('keydown', key); root.classList.remove('in'); root.classList.add('out'); setTimeout(() => { root.remove(); done(); }, 350); };
    const btn = (label, sub, on, cls = '') => h('button', { class: `title-btn ${cls}`, onClick: on }, h('b', {}, label), sub ? h('small', {}, sub) : null);

    let latest = null;
    const main = () => {
      box.replaceChildren(...[
        latest ? btn('Continue', `${latest.name}: ${latest.label}`, async () => {
          try { await withProgress(`Loading "${latest.name}"`, () => loadGame(latest.name)); const { inboxScreen } = await import('./inbox-screen.js'); nav.reset(inboxScreen()); close(); } catch (e) { toast(`Could not load: ${e.message}`); }
        }) : null,
        btn('New Game', 'Pick a club and take charge', () => { newGame(); close(); }),
        btn('Challenge', 'Harder starting positions', challenges),
        btn('Load Game', 'Saved games and imports', async () => { close(); nav.push((await import('./load-screen.js')).loadScreen()); }),
        // the desktop game can close itself; a browser tab cannot
        globalThis.bmDesktop ? btn('Quit', 'Close the game', () => globalThis.bmDesktop.confirmClose())
          : document.fullscreenEnabled && !globalThis.Capacitor ? btn('Full Screen', 'Hide the browser around the game', async () => (await import('./layout.js')).toggleWebFullscreen()) : null].filter(Boolean));
      box.querySelector('.title-btn')?.focus({ preventScroll: true });
    };
    const challenges = () => {
      box.replaceChildren(
        h('div', { class: 'title-sub' }, 'Choose a challenge'),
        ...CHALLENGES.map((c) => btn(c.name, c.text, () => {
          game.startBg = c.bg; game.startRoute = !!c.route;
          if (c.difficulty && game.settings) game.settings.difficulty = c.difficulty;
          newGame(); close(); toast(`${c.name}: the New Game screen is set up for it. Pick your club.`);
        }, 'wide')),
        h('button', { class: 'title-back', onClick: main }, 'Back'));
      box.querySelector('.title-btn')?.focus({ preventScroll: true });
    };

    root.append(
      h('div', { class: 'title-top' }, h('div', { class: 'title-kicker' }, 'Ryder Game Studios presents'), h('h1', { class: 'title-name' }, 'Baseball', h('br'), 'Manager')),
      box,
      h('div', { class: 'title-foot' }, h('span', { class: 'title-ver' }, `Ryder Game Studios \u00a0\u00a0 Version ${GAME_VERSION}`)));
    // arrow keys and Enter, as in a console game
    const key = (e) => {
      const bs = [...box.querySelectorAll('.title-btn')];
      if (!bs.length || !root.isConnected) return;
      const at = bs.indexOf(document.activeElement);
      if (e.key === 'ArrowDown') { bs[(at + 1) % bs.length].focus(); e.preventDefault(); }
      else if (e.key === 'ArrowUp') { bs[(at - 1 + bs.length) % bs.length].focus(); e.preventDefault(); }
    };
    window.addEventListener('keydown', key);
    main();
    listSaves().then((l) => { latest = l.slice().sort((a, b) => b.savedAt - a.savedAt)[0] || null; if (box.querySelector('.title-btn') && !box.querySelector('.title-sub')) main(); }).catch(() => {});
  });
}
