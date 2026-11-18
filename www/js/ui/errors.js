// When something goes wrong. Any error the game does not handle itself opens a plain box saying so, with
// a report the player can copy (or, in the desktop build, find in the log file beside the saves), and
// autosave is paused for the rest of the sitting so a broken state never writes over a good save.
// A save or load the player makes himself clears the pause.
import { h } from './dom.js';
import { game, longDate } from '../state.js';
import { GAME_VERSION } from '../version.js';

const LOG = [];
const MAX_LOG = 300;
const desktop = () => globalThis.bmDesktop || null;

function note(kind, args) {
  const text = args.map((a) => (a instanceof Error ? `${a.message}\n${a.stack || ''}` : typeof a === 'string' ? a : safeJson(a))).join(' ');
  const line = `${new Date().toISOString()} ${kind} ${text}`;
  LOG.push(line);
  if (LOG.length > MAX_LOG) LOG.splice(0, LOG.length - MAX_LOG);
  try { desktop()?.log?.(line); } catch { /* the log is a help, never a reason to fail */ }
}
function safeJson(v) { try { return JSON.stringify(v); } catch { return String(v); } }

/** Where the game stands, for the top of a report. */
function context() {
  const club = game.world && game.orgId ? game.world.orgs.get(game.orgId)?.club : null;
  return [
    `Baseball Manager ${GAME_VERSION}${desktop() ? ` (desktop ${desktop().platform || ''})` : ' (browser)'}`,
    club ? `Club: ${club.full ?? `${club.city} ${club.name}`}, manager ${game.manager}` : 'No game loaded',
    game.date ? `Game date: ${longDate(game.date)}, phase ${game.phase}${game.winter?.on ? ', winter' : ''}` : '',
    `Data: ${game.world?.dataInfo?.name || 'built-in'}`,
    `Reported: ${new Date().toISOString()}`,
    typeof navigator !== 'undefined' ? `System: ${navigator.userAgent}` : '',
  ].filter(Boolean).join('\n');
}

export function errorReport(err) {
  const what = err instanceof Error ? `${err.name}: ${err.message}\n${err.stack || ''}` : String(err?.message || err);
  return `${context()}\n\nError:\n${what}\n\nRecent log:\n${LOG.slice(-60).join('\n')}`;
}

let open = null;

/** Tell the player, once at a time. during: what the game was doing ("playing the day"). */
export function reportError(err, { during = '' } = {}) {
  note('ERROR', [err]);
  game.broken = true;
  if (typeof document === 'undefined' || open) return;
  const report = errorReport(err);
  const close = () => { open?.remove(); open = null; };
  const copy = h('button', { class: 'cm-btn', onClick: async () => {
    try { await navigator.clipboard.writeText(report); copy.textContent = 'Copied'; } catch { pre.focus(); copy.textContent = 'Select the text and copy it'; }
  } }, 'Copy report');
  const pre = h('textarea', { class: 'cm-input err-report', readOnly: true, rows: 8, spellcheck: false }, report);
  const folder = desktop()?.openLogFolder ? h('button', { class: 'cm-btn', onClick: () => desktop().openLogFolder() }, 'Open log folder') : null;
  const load = h('button', { class: 'cm-btn', onClick: async () => {
    close();
    const [{ nav }, { loadScreen }] = await Promise.all([import('./nav.js'), import('./load-screen.js')]);
    nav.push(loadScreen());
  } }, 'Load a saved game');
  open = h('div', { class: 'dlg-back err-back' },
    h('div', { class: 'dlg', role: 'alertdialog', 'aria-modal': 'true', 'aria-label': 'Something went wrong' },
      h('div', { class: 'cm-title' }, 'Something went wrong'),
      h('div', { class: 'dlg-body' },
        h('p', {}, `The game hit a problem${during ? ` while ${during}` : ''} and could not finish it.`),
        h('p', {}, 'Autosave is paused so this does not write over your last good save. You can carry on, but the safest thing is to load your last save. If it happens again, please send the report below.'),
        pre),
      h('div', { class: 'dlg-btns' }, copy, folder, load, h('button', { class: 'cm-btn go', onClick: close }, 'Carry on'))));
  document.body.append(open);
  open.querySelector('.go')?.focus();
}

/** A save or load made by the player: autosave can run again. */
export const clearBroken = () => { delete game.broken; };

/** Install once, at start-up. */
export function installErrorHandling() {
  for (const kind of ['error', 'warn']) {
    const orig = console[kind].bind(console);
    console[kind] = (...args) => { note(kind.toUpperCase(), args); orig(...args); };
  }
  window.addEventListener('error', (e) => {
    // a picture or a sound that fails to load is not the game's problem
    if (!e.error && e.target && e.target !== window) return;
    reportError(e.error || new Error(e.message || 'Unknown error'));
  });
  window.addEventListener('unhandledrejection', (e) => reportError(e.reason || new Error('Unknown error')));
  note('INFO', [`Started ${GAME_VERSION}`]);
}
