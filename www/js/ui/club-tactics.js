// Club tactics: the batting selection against right- and left-handed starters, the pitching staff
// (both in ui/selection.js), the depth chart and team instructions.
import { av, avSort, avShort, avLabel } from './attr-ui.js';
import { h, fill, cmTabs, toast, val } from './dom.js';
import { clubTitle, plink, select } from './club-ui.js';
import { clubMenu } from './menu.js';
import { battingSelection, pitchingSelection } from './selection.js';
import { FIELD_POS, fullName, positions, lastSeason, fix, ipText, rate3, mainPos, isPitcher } from '../data/world.js';
import { game, org, orgState } from '../state.js';
import { nav } from './nav.js';
import { armStatus } from '../season/sim.js';
import { dayNo } from '../season/calendar.js';
import { levelState, syncLevel, MINOR_LEVELS } from '../club/minors.js';
import { DIALS, DIAL_KEYS, ensureStyle, setDial, styleReport, settledWords } from '../season/style.js';
import { teamTotals } from '../season/teamstats.js';
import {
  activeHitters, activePitchers, bestLineup, lineupProblems, playerIn, valueAt, autoRoles, ROLE_LIST, INSTRUCTIONS, pitchQuality,
} from '../club/depth.js';

export function clubTactics(start = 'lineupR', startLevel = 'MLB') {
  const o = org();
  const st = orgState();
  const club = o.club;
  let tab = start === 'team' ? 'lineupR' : start;
  let level = startLevel; // MLB, or a minor league club whose lineups and rotation you set here
  const body = h('div', { class: 'cm-panel grow' });
  // the rotation and bullpen are one pitching screen now
  if (tab === 'rotation' || tab === 'bullpen') tab = 'pitching';
  const ALL_TABS = [
    { id: 'lineupR', label: 'Batting v RHP' }, { id: 'lineupL', label: 'Batting v LHP' }, { id: 'pitching', label: 'Pitching Staff' },
    { id: 'depth', label: 'Depth Chart' }, { id: 'instr', label: 'Instructions' }, { id: 'style', label: 'Club Style' },
  ];
  const tabsHost = h('div', { style: { display: 'contents' } });
  let tabs;
  function drawTabs() {
    tabs = cmTabs(level === 'MLB' ? ALL_TABS : ALL_TABS.slice(0, 3), tab, (id) => { tab = id; picked = null; render(); });
    fill(tabsHost, tabs.el);
  }
  const LEVEL_LABEL = { MLB: 'MLB', AAA: 'AAA', AA: 'AA', 'A+': 'High-A', A: 'Single-A', R: 'Rookie' };
  const levelHost = h('div', { class: 'cm-pad btnrow lvl-strip', style: { justifyContent: 'center', flexWrap: 'wrap' } });
  function drawLevels() {
    fill(levelHost, ['MLB', ...MINOR_LEVELS].map((l) => h('button', { class: `grp-btn${level === l ? ' on' : ''}`, onClick: () => { level = l; if (l !== 'MLB' && !['lineupR', 'lineupL', 'pitching'].includes(tab)) tab = 'lineupR'; picked = null; drawLevels(); drawTabs(); render(); } }, LEVEL_LABEL[l])),
      h('button', { class: 'cm-btn', title: 'Everyone at this level, with attributes and stats', onClick: async () => nav.push((await import('./squad-screen.js')).squadScreen(o.id, { level: level === 'MLB' ? 'active' : level })) }, 'Full squad'));
  }
  let picked = null; // the slot or player selected on the selection screens
  const ui = { get picked() { return picked; }, set: (v) => { picked = v; }, render: () => render(), get level() { return level === 'MLB' ? null : level; } };

  // a minor league level: the lineups and staff are that club's, and they are the assistant's until you change one
  function minorPanel() {
    const { view, tac } = levelState(o, st, level);
    const handed = syncLevel(o, st, level);
    if (handed) toast(`You now set the ${LEVEL_LABEL[level]} lineups and staff.`);
    const mode = (manual) => h('button', { class: `cm-btn${tac.manual === manual ? ' go' : ''}`, onClick: () => { tac.manual = manual; render(); } }, manual ? 'I set them' : 'Assistant sets them');
    const head = h('div', { class: 'cm-pad btnrow', style: { justifyContent: 'center' } }, h('span', { class: 'cm-s' }, `${LEVEL_LABEL[level]} lineups and staff: `), mode(false), mode(true),
      h('span', { class: 'cm-s' }, tac.manual ? 'Games at this level use your choices on any day they can be used; an injury or a move sends the day back to the assistant.' : 'The assistant picks each day, and rests tired players. Change anything below to take over.'));
    return { view, head };
  }

  function render() {
    if (level !== 'MLB') {
      const { view, head } = minorPanel();
      if (tab === 'lineupR' || tab === 'lineupL') fill(body, head, battingSelection(o, view, tab === 'lineupR' ? 'R' : 'L', ui));
      else fill(body, head, pitchingSelection(o, view, ui));
      return;
    }
    if (tab === 'lineupR' || tab === 'lineupL') fill(body, battingSelection(o, st, tab === 'lineupR' ? 'R' : 'L', ui));
    if (tab === 'pitching') fill(body, pitchingSelection(o, st, ui));
    if (tab === 'depth') fill(body, depthChart());
    if (tab === 'instr') fill(body, instructions());
    if (tab === 'style') fill(body, clubStyle());
  }

  // ---------- depth chart ----------
  function depthChart() {
    const hitters = activeHitters(o, st);
    const at = (lu, pos) => { const s = lu.find((x) => x.pos === pos); return s ? playerIn(o, s.id) : null; };
    const rows = [...FIELD_POS, 'DH'].map((pos) => {
      const starters = new Set([at(st.lineupR, pos)?.id, at(st.lineupL, pos)?.id]);
      const backups = hitters.filter((p) => !starters.has(p.id) && (pos === 'DH' || positions(p).includes(pos)))
        .sort((a, b) => valueAt(b, pos) - valueAt(a, pos)).slice(0, 3);
      const cell = (p) => (p ? [plink(p), ' ', av(p, pos === 'DH' ? 'Power' : 'Fielding')] : h('span', { class: 'cm-r' }, 'nobody'));
      return h('tr', {}, h('td', { class: 'l y' }, pos), h('td', { class: 'l' }, cell(at(st.lineupR, pos))), h('td', { class: 'l' }, cell(at(st.lineupL, pos))),
        h('td', { class: 'l' }, backups.length ? backups.map((p, i) => [i ? ', ' : '', plink(p, `${p.first[0]}. ${p.last}`)]) : h('span', { class: 'cm-s' }, 'none on the active roster')));
    });
    return h('div', {},
      h('div', { class: 'cm-h' }, 'Depth chart'),
      h('p', { class: 'cm-sub' }, 'Starters come from your two lineups (grade shown: Fielding, or Power at DH). Backups are the active players who know the position.'),
      h('div', { class: 'cm-tblwrap' }, h('table', { class: 'cm-tbl' },
        h('thead', {}, h('tr', {}, ['Pos', 'v RHP', 'v LHP', 'Backups'].map((c) => h('th', { class: 'l' }, c)))), h('tbody', {}, rows))));
  }

  // ---------- club style ----------
  // Three dials, set rarely. How well the squad suits each is never shown: the results are the only evidence.
  let pendingStyle = null;
  function clubStyle() {
    ensureStyle(o, st);
    rep = null;
    const pend = pendingStyle;
    return h('div', {},
      h('p', { class: 'cm-sub cm-pad' }, 'How the club plays. Pick a plan, then build the squad for it. A plan that suits the players pays off over a season; one that does not will cost you. A change takes weeks to settle in, so do not flip it at will.'),
      DIAL_KEYS.map((dial) => h('div', {},
        h('div', { class: 'cm-h' }, DIALS[dial].label),
        h('div', { class: 'cm-pad cm-opts' }, DIALS[dial].options.map(([v, name, desc]) => h('button', {
          class: 'cm-opt', 'aria-pressed': String(st.style[dial] === v),
          onClick: () => { pendingStyle = st.style[dial] === v ? null : { dial, v, name }; render(); },
        }, h('b', {}, name), h('span', {}, desc)))),
        pend && pend.dial === dial ? h('div', { class: 'cm-pad btnrow' },
          h('span', { class: 'cm-s' }, `Change to "${pend.name}"? The players will need weeks to settle into it and will play below their level until they do.`),
          h('button', { class: 'cm-btn', onClick: () => { setDial(st, dial, pend.v); pendingStyle = null; toast('Club style changed.'); render(); } }, 'Confirm'),
          h('button', { class: 'cm-btn', onClick: () => { pendingStyle = null; render(); } }, 'Cancel')) : null,
        evidence(dial))));
  }

  // what the numbers say: the club against the league on the things the dial touches
  let rep;
  function evidence(dial) {
    if (!rep) {
      const ids = game.world.mlb.map((c) => c.id);
      rep = styleReport(o.id, teamTotals(game.season?.year ?? game.year), ids) || { early: true };
    }
    const words = st.style[dial] === 'bal' ? 'No set plan, so nothing to settle.' : `The club is ${settledWords(st.fam[dial])}.`;
    if (rep.early) return h('p', { class: 'cm-sub cm-pad' }, `${words} The numbers will show here after a few weeks of games.`);
    return h('div', { class: 'cm-pad' },
      h('p', { class: 'cm-sub' }, `${words} The club's numbers this season (${rep.games} games), against the league average and where it ranks:`),
      h('div', { class: 'cm-tblwrap' }, h('table', { class: 'cm-tbl' },
        h('thead', {}, h('tr', {}, ['', 'Club', 'League', 'Rank'].map((c, i) => h('th', { class: i ? 'r' : 'l' }, c)))),
        h('tbody', {}, rep[dial].map((r) => h('tr', {}, h('td', { class: 'l' }, r.label), h('td', { class: `r ${r.hi ? 'hi' : r.lo ? 'lo' : ''}` }, r.mine), h('td', { class: 'r' }, r.lg), h('td', { class: 'r' }, `${r.rank} of ${r.of}`)))))));
  }

  // ---------- instructions ----------
  function instructions() {
    return h('div', {}, Object.entries(INSTRUCTIONS).map(([key, def]) => h('div', {},
      h('div', { class: 'cm-h' }, def.label),
      h('div', { class: 'cm-pad cm-opts' }, def.options.map(([v, name, desc]) => h('button', {
        class: 'cm-opt', 'aria-pressed': String(st.instr[key] === v), onClick: () => { st.instr[key] = v; render(); },
      }, h('b', {}, name), h('span', {}, desc)))))));
  }

  drawLevels(); drawTabs(); render();
  return {
    el: h('div', { style: { display: 'contents' } }, clubTitle(club, `${club.city} Tactics`), levelHost, tabsHost, body),
    side: () => clubMenu('tactics'), bg: 'tactics',
    onShow: render,
    // for the Squad screen, which shows these panels under its own tabs
    body,
    setLevel: (l) => { level = l; if (l !== 'MLB' && !['lineupR', 'lineupL', 'pitching'].includes(tab)) tab = 'lineupR'; picked = null; },
    setTab: (t) => { tab = t === 'rotation' || t === 'bullpen' ? 'pitching' : t; picked = null; render(); },
  };
}

