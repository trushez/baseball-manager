// Shown when Continue cannot go on until you fix your roster. The assistant says what is wrong, suggests
// the moves that put it right (each explained before it is made), and can make them all for you.
import { h, fill } from './dom.js';
import { nav } from './nav.js';
import { clubMenu } from './menu.js';
import { game, orgState } from '../state.js';
import { rosterProblems } from '../season/roster.js';
import { planPanel } from './plan-panel.js';

export function requiredScreen() {
  const body = h('div', { class: 'cm-panel grow cm-pad' });
  const o = game.world.orgs.get(game.orgId);
  const go = async (what) => {
    if (what === 'squad') nav.push((await import('./squad-screen.js')).squadScreen(game.orgId));
    else nav.push((await import('./club-tactics.js')).clubTactics());
  };

  function render() {
    const st = orgState();
    const problems = rosterProblems(o, st).filter((x) => game.phase !== 'spring' || !/must have/.test(x));
    fill(body,
      problems.length
        ? h('div', { class: 'cm-h' }, 'Your roster needs attention')
        : [h('div', { class: 'cm-h cm-g' }, 'Your roster is ready'), h('p', { class: 'cm-sub' }, 'Press Continue to carry on.')],
      planPanel(o, st, { onChange: render, always: true }),
      h('div', { class: 'cm-pad btnrow', style: { justifyContent: 'center' } },
        h('button', { class: 'cm-btn', onClick: () => go('squad') }, 'Squad'),
        h('button', { class: 'cm-btn', onClick: () => go('tactics') }, 'Tactics')),
      h('p', { class: 'cm-s' }, 'Every move is explained before it is made, and you can undo moves until you press Continue.'));
  }

  render();
  return {
    el: h('div', { style: { display: 'contents' } }, h('div', { class: 'cm-title' }, 'Before You Continue'), body),
    side: () => clubMenu(null),
    onShow: render,
  };
}
