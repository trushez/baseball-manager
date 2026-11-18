// Closing the game. A desktop game asks before it throws away what you have not saved: the window's close
// button (or Quit) brings up "Save before you quit?" when anything has happened since the last save. In a
// browser the page asks the browser's own question instead.
import { h } from './dom.js';
import { game } from '../state.js';
import { unsaved } from '../save.js';

const desktop = () => globalThis.bmDesktop || null;

let leaving = false; // set once the player has chosen to go, so the browser does not ask a second time

function askToQuit() {
  return new Promise((resolve) => {
    const done = (v) => { box.remove(); resolve(v); };
    const box = h('div', { class: 'dlg-back err-back' },
      h('div', { class: 'dlg', role: 'alertdialog', 'aria-modal': 'true', 'aria-label': 'Quit' },
        h('div', { class: 'cm-title' }, 'Save before you quit?'),
        h('div', { class: 'dlg-body' }, h('p', {}, game.saveName ? `Your game has moved on since it was last saved as "${game.saveName}".` : 'This game has not been saved yet.')),
        h('div', { class: 'dlg-btns' },
          h('button', { class: 'cm-btn go', onClick: () => done('save') }, 'Save and quit'),
          h('button', { class: 'cm-btn', onClick: () => done('quit') }, 'Quit without saving'),
          h('button', { class: 'cm-btn', onClick: () => done('stay') }, 'Cancel'))));
    document.body.append(box);
    box.querySelector('.go')?.focus();
  });
}

/** Install once, at start-up. */
export function installAppGuards() {
  const d = desktop();
  if (!d) {
    window.addEventListener('beforeunload', (e) => { if (!leaving && unsaved()) { e.preventDefault(); e.returnValue = ''; } });
    return;
  }
  d.onCloseRequest(() => quitGame());
}

let asking = false;
/**
 * Quit Game (Game Options, the title screen, the window's close button): asks to save if anything has happened since
 * the last save, then closes the desktop game. In a browser, which cannot close its own tab, it goes back to the title screen.
 */
export async function quitGame() {
  if (asking) return;
  asking = true;
  try {
    if (game.orgId && unsaved()) {
      const a = await askToQuit();
      if (a === 'stay') return;
      if (a === 'save') {
        const { saveGame } = await import('../save.js');
        const club = game.world.orgs.get(game.orgId).club;
        await saveGame(game.saveName || `${game.manager} ${club.name}`);
      }
    }
    leaving = true;
    const d = desktop();
    if (d) d.confirmClose(); else location.reload();
  } catch (e) {
    const { reportError } = await import('./errors.js');
    reportError(e, { during: 'saving before quitting' });
  } finally { asking = false; }
}
