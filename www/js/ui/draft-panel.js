// The Draft tab of Transfers: the strategy you give your scouts, and how the last draft went. The draft itself
// runs by itself in July (season/draft.js).
import { h, fill } from './dom.js';
import { game } from '../state.js';
import { money } from '../data/world.js';
import { plink } from './club-ui.js';
import { APPROACH, MIX, SCHOOL, SPEND, plan, setPlan } from '../season/draft.js';

let keptYear = null;

export function draftPanel() {
  const box = h('div', { class: 'cm-pad' });
  const years = () => Object.keys(game.drafts || {}).map(Number).sort((a, b) => b - a);
  let year = years().includes(keptYear) ? keptYear : years()[0];

  function group(title, key, opts) {
    const cur = plan()[key];
    return h('div', { style: { marginBottom: '8px' } }, h('div', { class: 'cm-s' }, title),
      h('div', { class: 'btnrow', style: { justifyContent: 'flex-start' } }, opts.map(([id, label]) => h('button', { class: 'cm-btn', 'aria-pressed': String(cur === id), onClick: () => { setPlan({ [key]: id }); draw(); } }, label))),
      (() => { const d = opts.find((o) => o[0] === cur)?.[2]; return d ? h('div', { class: 'cm-s', style: { marginTop: '2px' } }, d) : null; })());
  }

  function results() {
    const D = game.drafts?.[year];
    if (!D) return h('p', { class: 'cm-s cm-empty' }, 'No draft has been held yet. The first runs at the All-Star break in July.');
    const W = game.world, me = game.orgId;
    const club = (id) => W.clubs.get(id)?.city ?? id;
    const cell = (r) => { const p = W.players.get(r[2]); return r[8] && p ? plink(p, r[4]) : `${r[4]}${r[8] ? '' : ' (unsigned)'}`; };
    const row = (r, withClub) => h('tr', { class: r[1] === me ? 'now' : '' }, h('td', { class: 'y' }, r[0]), withClub ? h('td', { class: 'l' }, club(r[1])) : null, h('td', { class: 'l' }, cell(r)), h('td', {}, r[5]), h('td', { class: 'cm-s' }, r[6] ? 'High school' : 'College'), h('td', {}, r[8] ? money(r[3]) : '-'));
    const head = (c1) => h('thead', {}, h('tr', {}, ['Pick', c1, 'Player', 'Pos', 'From', 'Bonus'].filter(Boolean).map((c, i) => h('th', { class: c === 'Player' || c === c1 ? 'l' : '' }, c))));
    const mine = D.picks.filter((r) => r[1] === me);
    const spent = mine.reduce((a, r) => a + r[3], 0);
    return h('div', {},
      h('p', { class: 'cm-s' }, `You made ${mine.length} picks and signed ${mine.filter((r) => r[8]).length}, spending ${money(spent)} in bonuses. Bonuses are paid from the draft pool and do not come out of your payroll budget.`),
      h('div', { class: 'cm-h' }, `Your picks`), h('table', { class: 'cm-tbl' }, head(null), h('tbody', {}, mine.map((r) => row(r, false)))),
      h('div', { class: 'cm-h' }, 'First round'), h('table', { class: 'cm-tbl' }, head('Club'), h('tbody', {}, D.picks.slice(0, 30 + (D.comp || 0)).map((r) => row(r, true)))));
  }

  function draw() {
    const ys = years();
    const upcoming = game.season && !game.drafts?.[game.season.year] ? `The ${game.season.year} draft runs at the All-Star break on 13 July.` : 'This year\'s draft is done. The next one is in July.';
    fill(box,
      h('p', { class: 'cm-sub' }, `${upcoming} The game makes the class and every club picks from what its own scouts believe; your scouts' ability decides how well you read it. You set the approach and the signing money, and the picks and offers are handled for you.`),
      group('What to look for', 'approach', APPROACH), group('Pitchers or hitters', 'mix', MIX), group('College or high school', 'school', SCHOOL), group('Signing money', 'spend', SPEND),
      ys.length ? h('div', { class: 'btnrow', style: { justifyContent: 'flex-start', marginTop: '10px' } }, h('span', { class: 'cm-s' }, 'Draft of'), ys.map((y) => h('button', { class: 'cm-btn', 'aria-pressed': String(y === year), onClick: () => { year = y; keptYear = y; draw(); } }, String(y)))) : null,
      results());
  }
  draw();
  return box;
}
