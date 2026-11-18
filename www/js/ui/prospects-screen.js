// Prospects: the national Top 100, your own top 30 and any club's, with the outlet's words on each player's potential next to
// what your own scouts say, when they arrive, how risky they are and how much buzz there is around them.
import { h, fill, cmTabs } from './dom.js';
import { clubTitle, plink, select, posCell } from './club-ui.js';
import { clubMenu } from './menu.js';
import { sortTable } from './table.js';
import { game, userClub } from '../state.js';
import { mainPos, isPitcher, seasonLine, LEVEL_NAME, rate3 } from '../data/world.js';
import { nationalList, clubList, prospectInfo, hypeWords, OUTLET, refreshProspects } from '../season/prospects.js';

const club = (id) => game.world.orgs.get(id)?.club;

const lineOf = (p) => {
  const y = game.season?.year;
  if (!y) return '';
  if (isPitcher(p)) { const l = seasonLine(p, 'pit', y, p.level); return l && l.outs ? `${l.era.toFixed(2)} ERA, ${(l.outs / 3).toFixed(0)} IP` : ''; }
  const l = seasonLine(p, 'bat', y, p.level);
  return l && l.pa ? `${rate3(l.avg)}/${rate3(l.obp)}/${rate3(l.slg)}` : '';
};

export function prospectsScreen() {
  let tab = 'nat', other = game.orgId;
  const area = h('div', { class: 'cm-panel grow pros' });
  const tabs = cmTabs([{ id: 'nat', label: 'Top 100' }, { id: 'mine', label: 'Your top 30' }, { id: 'club', label: 'Another club' }], tab, (id) => { tab = id; draw(); });

  function draw() {
    try { drawList(); } catch (e) { console.error('prospects', e); fill(area, h('p', { class: 'cm-pad cm-r' }, `The prospect lists could not be drawn: ${e.message} (${(e.stack || '').split('\n').slice(1, 3).map((l) => l.trim().replace(/^at /, '').replace(/\(?https?:\/\/[^/]+\/(?:js\/)?/, '(')).join(' < ')})`)); }
  }

  function drawList() {
    refreshProspects();
    const rows = tab === 'nat' ? nationalList() : clubList(tab === 'mine' ? game.orgId : other).map((x) => ({ ...x, move: null }));
    const cols = [
      { key: 'rank', label: '#', get: (r) => r.rank, asc: true },
      { key: 'move', label: 'Move', get: (r) => r.move ?? 0, show: (r) => (r.move ? h('span', { class: r.move > 0 ? 'cm-g' : 'cm-r' }, `${r.move > 0 ? '▲' : '▼'} ${Math.abs(r.move)}`) : '-') },
      { key: 'name', label: 'Prospect', left: true, get: (r) => `${r.p.last} ${r.p.first}`, show: (r) => plink(r.p) },
      { key: 'club', label: 'Club', left: true, get: (r) => club(r.p.orgId)?.city ?? '', asc: true },
      { key: 'pos', label: 'Pos', left: true, get: (r) => mainPos(r.p), show: (r) => posCell(r.p), asc: true },
      { key: 'age', label: 'Age', get: (r) => r.p.age, asc: true },
      { key: 'lvl', label: 'Level', left: true, get: (r) => LEVEL_NAME[r.p.level], asc: true },
      { key: 'line', label: 'This season', left: true, get: (r) => lineOf(r.p), asc: true },
      { key: 'outlet', label: `${OUTLET.name} says`, left: true, get: (r) => prospectInfo(r.p)?.outlet ?? '', asc: true, show: (r) => h('span', { class: 'cm-s' }, (prospectInfo(r.p)?.outlet ?? '').replace(/^has the potential to become |^could become |^is /, '')) },
      { key: 'yours', label: 'Your scouts', left: true, get: (r) => prospectInfo(r.p)?.yours ?? '', asc: true, show: (r) => { const y = prospectInfo(r.p)?.yours; return y ? h('span', {}, y.replace(/^has the potential to become |^could become |^is /, '')) : h('span', { class: 'cm-s' }, 'not scouted'); } },
      { key: 'eta', label: 'Arrives', get: (r) => { const e = prospectInfo(r.p)?.eta; return e === 'now' ? 0 : e ?? 9999; }, asc: true, show: (r) => String(prospectInfo(r.p)?.eta ?? '-') },
      { key: 'risk', label: 'Risk', left: true, get: (r) => ['low', 'moderate', 'high', 'extreme'].indexOf(prospectInfo(r.p)?.risk), asc: true, show: (r) => { const k = prospectInfo(r.p)?.risk; return h('span', { class: k === 'low' ? 'cm-g' : k === 'moderate' ? '' : 'cm-r' }, k ?? '-'); } },
      { key: 'hype', label: 'Buzz', left: true, get: (r) => prospectInfo(r.p)?.hype ?? 0, show: (r) => hypeWords(prospectInfo(r.p)?.hype) },
    ];
    // on a single club's list the club and the move are the same for everyone or empty: the room goes to the columns that differ
    if (tab !== 'nat') cols.splice(0, cols.length, ...cols.filter((c) => !['move', 'club'].includes(c.key)));
    const t = sortTable({ rows, cols, sort: 'rank', desc: false, id: `prospects-${tab}`, empty: tab === 'nat' ? 'The first list comes out at the end of the first month of the season.' : 'No prospects here.' });
    fill(area,
      h('div', { class: 'cm-pad' }, tabs.el, tab === 'club' ? select(game.world.mlb.map((c) => [c.org, c.full ?? `${c.city} ${c.name}`]).sort((a, b) => a[1].localeCompare(b[1])), other, (v) => { other = v; draw(); }) : null),
      h('p', { class: 'cm-s cm-pad' }, `${OUTLET.name} has its own scouts and is sometimes wrong. Your scouts' words appear once one of them has reported on the player. A prospect has fewer than 130 major league at-bats and 50 innings. Buzz is how much the game is talking about him: computer clubs pay for it whether or not the talent has changed.`),
      t.el);
  }

  return { el: h('div', { style: { display: 'contents' } }, clubTitle(userClub(), 'Prospects'), area), side: () => clubMenu('prospects'), onShow: draw };
}
