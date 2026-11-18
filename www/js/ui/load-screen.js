// Load Game from the start screen.
import { h, fill, toast } from './dom.js';
import { withProgress } from './progress.js';
import { nav } from './nav.js';
import { listSaves, loadGame } from '../save.js';
import { importButton } from './save-files.js';

export function loadScreen() {
  const box = h('div', { class: 'cm-panel grow' });
  const draw = async () => {
    let list = [];
    try { list = await listSaves(); } catch (e) { fill(box, h('p', { class: 'cm-pad cm-r' }, `Saves are not available in this browser (${e.message}).`)); return; }
    fill(box, h('table', { class: 'cm-tbl' }, h('tbody', {}, list.length ? list.map((s) => h('tr', { class: 'pick', onClick: async () => {
      try {
        await withProgress(`Loading "${s.name}"`, () => loadGame(s.name));
        const { inboxScreen } = await import('./inbox-screen.js');
        nav.reset(inboxScreen());
      } catch (e) { toast(`Could not load: ${e.message}`); }
    } }, h('td', { class: 'l y' }, s.name), h('td', { class: 'l' }, s.label), h('td', { class: 'l cm-s' }, new Date(s.savedAt).toLocaleString('en-GB'))))
      : h('tr', {}, h('td', { class: 'l cm-s' }, 'No saved games yet.')))), h('div', { class: 'cm-pad' }, importButton(() => draw())));
  };
  draw();
  return {
    el: h('div', { style: { display: 'contents' } }, h('div', { class: 'cm-title' }, 'Load Game'), box),
    side: () => [{ label: 'New Game', onClick: () => nav.back() }, { label: 'Load Game', on: true }],
    dateBox: () => ['Load', h('br'), 'Game'],
  };
}
