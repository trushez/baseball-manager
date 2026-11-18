// Squad: the organisation level by level, with CM-style column sets (overview, attributes, mental, stats, contracts).
import { teamSelection } from './selection.js';
import { clubTactics } from './club-tactics.js';
import { av, avSort, avShort, avLabel } from './attr-ui.js';
import { h, fill, cmTabs, toast } from './dom.js';
import { nav } from './nav.js';
import { rosterAction } from './roster-action.js';
import { planPanel } from './plan-panel.js';
import { clubTitle, plink, gradeCell, select } from './club-ui.js';
import { positions } from '../data/world.js';
import { clubMenu } from './menu.js';
import { sortTable } from './table.js';
import { isPitcher, mainPos, lastSeason, seasonLine, salaryIn, money, statusShort, rate3, fix, pct, ipText, LEVEL_NAME } from '../data/world.js';
import { orgState, game, isUserOrg, yearsAhead } from '../state.js';
import { schedule, worth, worthText } from '../season/trade.js';
import { counts } from '../club/depth.js';
import { tboPlus, tbaMinus } from '../season/tb.js';
import { limits, placeCode, ilDaysLeft, levelWords } from '../season/roster.js';
import { armStatus, staffPlan, dayWord, pitchesOn } from '../season/sim.js';
import { dayNo } from '../season/calendar.js';
import { value } from '../season/value.js';
import { posString } from '../data/attributes.js';
import { expectedLineup } from '../season/sim.js';

// the attributes view: every attribute a player shows, in the profile's order
const HIT_GRADES = ['contact', 'power', 'gap', 'eye', 'avoidK', 'bunt', 'vsfb', 'vsbr', 'sit', 'speed', 'steal', 'instincts', 'range', 'hands', 'arm', 'acc', 'turn', 'antic', 'posn'];
const PIT_GRADES = ['velocity', 'stuff', 'movement', 'control', 'stamina', 'hold', 'cmd', 'dec', 'psel', 'recov', 'dura'];
const MENTAL = ['comp', 'conc', 'det', 'work', 'lead', 'temper', 'prof', 'amb', 'cons', 'big', 'adapt', 'team', 'str', 'agi', 'fit'];
const MOVE_TO = [['MLB', 'Majors'], ['AAA', 'Triple-A'], ['AA', 'Double-A'], ['A+', 'High-A'], ['A', 'Single-A'], ['R', 'Rookie']];

const ROLE_SHORT = { Closer: 'CL', Setup: 'SU', Matchup: 'MU', Middle: 'MR', Long: 'LR' };
const POS_ORDER = ['C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF', 'DH'];
const ROLE_RANK = { Closer: 10, Setup: 11, Matchup: 12, Middle: 13, Long: 14 };

/** When he last pitched: [days ago for sorting, words]. */
function lastOuting(p, today) {
  for (let k = 1; k <= 10; k++) { const n = pitchesOn(p, today - k); if (n) return [k, `${k === 1 ? 'Yesterday' : `${k} days ago`} (${n} pitches)`]; }
  return [99, ''];
}

export function squadScreen(orgId, start = {}) {
  const o = game.world.orgs.get(orgId);
  const st = orgState(orgId);
  const mine = isUserOrg(orgId);
  let level = start.level || 'active';
  let view = start.view || 'select';
  let vs = 'R'; // the lineup the selection view shows
  let sub = start.sub || null; // a lineup, pitching or depth chart panel shown instead of one of the views above it
  let tac = null;
  let picked = null; // the player or pitching slot picked for a swap on the Selection view
  let group = start.group || 'bat';
  let only = null; // a position chip you have picked: { g: 'bat'|'pit', k: 'SS' }
  // stats: this season (at the level shown) once it has started, otherwise the last full season
  let statYear = game.season && game.phase !== 'offseason' && game.phase !== 'spring' ? 'now' : 'last';

  const head = h('div', { class: 'cm-sub squad-count' });
  const body = h('div', { class: 'cm-panel grow' });
  const levelTabs = cmTabs([
    { id: 'active', label: 'Active Roster' }, { id: 'forty', label: '40-Man' }, { id: 'AAA', label: 'Triple-A' },
    { id: 'AA', label: 'Double-A' }, { id: 'A+', label: 'High-A' }, { id: 'A', label: 'Single-A' }, { id: 'R', label: 'Rookie' }, { id: 'IL', label: 'Injured List' },
    ...(game.phase === 'offseason' ? [{ id: 'FA', label: 'Free Agents' }] : []),
  ], level, (id) => { level = id; only = null; render(); });
  const viewTabs = cmTabs([
    { id: 'select', label: 'Team' }, { id: 'overview', label: 'Player Summary' }, { id: 'grades', label: 'Attributes' }, { id: 'mental', label: 'Mental' }, { id: 'stats', label: 'Stats' }, { id: 'contracts', label: 'Contracts' },
  ], view, (id) => { view = id; sub = null; render(); });
  viewTabs.el.classList.add('cm-tabs-small');
  // the lineup, pitching and depth panels: the same ones as Tactics, for the level chosen in the top row
  const SUBS = [{ id: 'lineupR', label: 'Lineup v RHP' }, { id: 'lineupL', label: 'Lineup v LHP' }, { id: 'pitching', label: 'Pitching Staff' }, { id: 'depth', label: 'Depth Chart' }];
  const subTabs = cmTabs(SUBS, sub, (id) => { sub = id; render(); });
  subTabs.el.classList.add('cm-tabs-small');
  subTabs.el.dataset.mlabel = 'Lineups and staff';
  /** Hitters or Pitchers: its own control, with the one you are looking at filled in. */
  const groupBar = (all) => h('div', { class: 'grp-seg' }, h('span', { class: 'cm-s' }, 'Showing'),
    [['bat', 'Hitters'], ['pit', 'Pitchers']].map(([k, label]) => {
      const n = all.filter((p) => (k === 'pit') === isPitcher(p)).length;
      return h('button', { class: `grp-btn${group === k ? ' on' : ''}`, 'aria-pressed': String(group === k), onClick: () => { group = k; only = null; render(); } }, `${label} (${n})`);
    }));

  function members() {
    return o.players.filter((p) => {
      if (level === 'active') return st.active.has(p.id);
      if (level === 'forty') return st.forty.has(p.id) || st.il.has(p.id);
      if (level === 'IL') return st.il.has(p.id);
      return !st.active.has(p.id) && !st.il.has(p.id) && st.level.get(p.id) === level;
    });
  }

  function render() {
    // one tab lit across the two rows: a view, or one of the panels
    const lineups = ['active', 'AAA', 'AA', 'A+', 'A', 'R'].includes(level);
    if (sub && !lineups) sub = null;
    if (sub === 'depth' && level !== 'active') sub = null;
    viewTabs.select(sub ? '' : view); subTabs.select(sub || '');
    [...subTabs.el.children].forEach((b, i) => { b.disabled = !lineups || (SUBS[i].id === 'depth' && level !== 'active'); });
    const c = counts(o, st);
    const lim = limits();
    const off40 = [...st.il].filter(([id, x]) => x.kind === 60 && st.forty.has(id)).length;
    fill(head, h('span', { class: c.active !== lim.active ? 'cm-r' : '' }, `Active roster ${c.active} / ${lim.active} (${c.pitchers} pitchers)`), '   ·   ',
      h('span', { class: c.forty > 40 ? 'cm-r' : '', title: 'Everyone on the 40-man roster counts, including the 10- and 15-day injured lists. Players on the 60-day list do not.' }, `40-man roster ${c.forty} / 40`),
      off40 ? h('span', { class: 'cm-s' }, ` (plus ${off40} on the 60-day list, not counted)`) : '',
      c.forty > 40 ? ' (over the limit: designate or release players to get down to 40)' : '',
      level === 'FA' ? '   ·   these players leave when free agency opens' : `   ·   ${o.players.length} players in the organisation`);
    if (sub && mine) { tac ||= clubTactics(sub); tac.setLevel(level === 'active' ? 'MLB' : level); tac.setTab(sub); fill(body, tac.body); return; }
    body.classList.remove('sq-fit');
    const all = members();
    const rows = all.filter((p) => (group === 'pit') === isPitcher(p) && (!only || only.g !== group || fits(p, only.k)));
    const other = all.length - rows.length;
    const ds = defaultSort();
    const t = sortTable({ rows, cols: columns(), sort: ds, desc: !['pos', 'role'].includes(ds), onRow: null, empty: only && only.g === group ? `No ${only.k} at this level. Click the ${only.k} chip again to show everyone.` : `No ${group === 'pit' ? 'pitchers' : 'hitters'} at this level.`,
      rowClass: (p) => `${(group === 'pit' ? pitIdx(p) : posIdx(p)) % 2 ? 'grp-b ' : ''}${level === 'forty' ? (st.active.has(p.id) ? 'on-active' : '') : st.forty.has(p.id) ? 'on-forty' : ''}` });
    if (view === 'select') {
      // your active roster is edited right here: pick a player, then another to swap their places
      if (mine && level === 'active') { fill(body, teamSelection(o, st, { get picked() { return picked; }, set: (v) => { picked = v; }, render: () => render(), season })); return; }
      fill(body, selection(all), mine ? assistant() : null);
      return;
    }
    body.classList.add('sq-fit'); body.classList.toggle('sq-stats', view === 'stats'); body.classList.toggle('sq-contracts', view === 'contracts'); body.classList.toggle('sq-roomy', ['overview', 'grades', 'mental', 'contracts'].includes(view));
    fill(body,
      h('div', { class: 'sq-filters' }, groupBar(all), depthStrip(all)),
      view === 'stats' && game.season ? h('div', { class: 'cm-pad filters' }, h('span', { class: 'cm-s' }, 'Stats for'),
        ['now', 'last'].map((k) => h('button', { class: `cm-btn${statYear === k ? ' go' : ''}`, onClick: () => { statYear = k; render(); } }, k === 'now' ? `${game.season.year}${['AAA', 'AA', 'A+', 'A', 'R'].includes(level) ? ` at ${LEVEL_NAME[level]}` : ''}` : 'Last season'))) : null,
      t.el,
      level === 'forty' ? h('p', { class: 'cm-s cm-pad' }, 'Players marked in green are on the active roster. Everyone listed counts against the 40 except players on the 60-day injured list.') : null,
      other ? h('p', { class: 'cm-s cm-pad' }, `${other} ${group === 'pit' ? 'hitters' : 'pitchers'} at this level too: switch with the ${group === 'pit' ? 'Hitters' : 'Pitchers'} tab.`) : null,
      mine ? assistant() : null);
  }

  /** The squad as CM 01/02 lays it out: slot box, tag, name, positions in yellow, and his key figures. */
  function selection(all) {
    const live = level === 'active';
    const hit = all.filter((p) => !isPitcher(p)), pit = all.filter(isPitcher);
    const key = vs === 'R' ? 'lineupR' : 'lineupL';
    const lineup = live ? (st[key]?.length ? st[key].map((x) => ({ p: hit.find((q) => q.id === x.id), pos: x.pos })).filter((x) => x.p) : expectedLineup(o, st, vs)) : [];
    const inLine = new Set(lineup.map((x) => x.p.id));
    const bench = hit.filter((p) => !inLine.has(p.id)).sort((a, b) => posKey(a) - posKey(b));
    const tag = (p) => (p.injury ? h('span', { class: 'sq-tag inj' }, 'Inj') : !isPitcher(p) && (p.fat || 0) > 70 ? h('span', { class: 'sq-tag tir' }, 'Tir') : isPitcher(p) && p.plog?.length && armStatus(p, dayNo(game.date)) === 'Tired' ? h('span', { class: 'sq-tag tir' }, 'Tir') : h('span', { class: 'sq-tag' }));
    const positions = (p) => (isPitcher(p) ? (p.role === 'Starter' ? 'SP' : p.role === 'Closer' ? 'CL' : 'RP') : posString(p).replace(/\s+/g, ' '));
    const fig = (l, v) => h('span', { class: 'sq-fig' }, v);
    const HH = ['AVG', 'HR', 'RBI'], PH = ['ERA', 'IP', 'SO'];
    const colh = (hs) => h('div', { class: 'sq-row full sq-colh' }, h('span'), h('span'), h('span', { class: 'sq-name' }, 'Name'), h('span', { class: 'sq-pos' }, 'Pos'), h('span', { class: 'sq-figs' }, hs.map((x) => h('span', { class: 'sq-fig' }, x))));
    const keys = (p) => {
      const s = season(p);
      return isPitcher(p)
        ? [fig('ERA', s?.outs ? fix(s.era) : '-'), fig('IP', s?.outs ? ipText(s.outs) : '-'), fig('SO', s?.outs ? s.so : '-')]
        : [fig('AVG', s?.ab ? rate3(s.avg) : '-'), fig('HR', s ? s.hr : '-'), fig('RBI', s ? s.rbi : '-')];
    };
    // on the injured list: an Activate button by his name once he is fit and has served his time, otherwise what is left
    const ilBit = (p) => {
      if (level !== 'IL' || !mine || !st.il.has(p.id)) return null;
      const ready = !p.injury && ilDaysLeft(st, p) === 0;
      if (ready) return h('button', { class: 'cm-btn go sq-act', title: 'Bring him back on to the active roster', onClick: async (e) => { e.stopPropagation(); nav.push((await import('./cover-screen.js')).coverScreen(p)); } }, 'Activate');
      return h('span', { class: 'cm-s sq-act', title: p.injury ? p.injury.type : 'Fit, but still serving his time on the list' }, p.injury ? 'still hurt' : `${ilDaysLeft(st, p)}d to serve`);
    };
    const mark = (p) => (level === 'forty' ? (st.active.has(p.id) ? ' on-active' : '') : level !== 'active' && st.forty.has(p.id) ? ' on-forty' : '');
    const row = (slot, p, cls = '') => h('div', { class: `sq-row full ${cls}${mark(p)}`, title: mark(p) === ' on-active' ? 'On the active roster' : mark(p) === ' on-forty' ? 'On the 40-man roster' : null }, h('span', { class: `sq-slot${cls.includes('sub') ? ' sub' : ''}` }, slot), tag(p), h('span', { class: 'sq-name' }, plink(p), ilBit(p)), h('span', { class: 'sq-pos' }, positions(p)), h('span', { class: 'sq-figs' }, keys(p)));
    const bar = h('div', { class: 'sq-bar' },
      (live ? lineup.map((x) => x.pos) : ['C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF', 'DH']).map((x) => h('span', { class: 'sq-cell' }, x)), h('span', { class: 'sq-gap' }),
      ['SP1', 'SP2', 'SP3', 'SP4', 'SP5', 'CL', 'SU', 'MR', 'LR'].map((x) => h('span', { class: 'sq-cell' }, x)));
    const left = live
      ? [...lineup.map((x) => row(x.pos, x.p)), ...bench.map((p, i) => row(`BN${i + 1}`, p, 'sub'))]
      : [...hit].sort((a, b) => posKey(a) - posKey(b)).map((p) => row(mainPos(p), p));
    const right = [...pit].sort((a, b) => roleKey(a) - roleKey(b)).map((p) => row(live || level === 'forty' ? roleCode(p) : (p.role === 'Starter' ? 'SP' : 'RP'), p, st.rotation.includes(p.id) || st.pen[p.id] ? '' : 'sub'));
    return h('div', { class: 'sq-sel' },
      h('div', { class: 'sq-head' }, 'Position(s)'), bar,
      live ? h('div', { class: 'sq-vs' }, h('span', { class: 'cm-s' }, 'Lineup shown'), ['R', 'L'].map((k) => h('button', { class: `grp-btn${vs === k ? ' on' : ''}`, onClick: () => { vs = k; render(); } }, k === 'R' ? 'v right-handers' : 'v left-handers'))) : null,
      h('div', { class: 'sq-cols full' }, h('div', {}, h('div', { class: 'sq-sub' }, live ? 'Lineup and bench' : 'Hitters'), colh(HH), left.length ? left : h('p', { class: 'cm-s cm-pad cm-empty' }, 'No hitters at this level.')),
        h('div', {}, h('div', { class: 'sq-sub' }, live ? 'Rotation and bullpen' : 'Pitchers'), colh(PH), right.length ? right : h('p', { class: 'cm-s cm-pad cm-empty' }, 'No pitchers at this level.'))),
      h('p', { class: 'cm-s cm-pad' }, 'Click a name to open him.', level === 'forty' ? [' ', h('span', { class: 'cm-g' }, 'Green bar'), ' = on the active roster.'] : level !== 'active' && level !== 'FA' ? [' ', h('span', { class: 'cm-y' }, 'Gold bar'), ' = on the 40-man roster.'] : null));
  }

  /** What the squad holds, position by position, so a gap shows at once. */
  function depthStrip(all) {
    const hit = all.filter((p) => !isPitcher(p)), pit = all.filter(isPitcher);
    const need = level === 'active' || level === 'forty';
    const chip = (label, n, gap) => {
      const g = POS_ORDER.includes(label) ? 'bat' : 'pit', on = only && only.g === g && only.k === label;
      return h('button', { class: `depth-chip${n === 0 && gap ? ' empty' : ''}${on ? ' on' : ''}`, title: on ? 'Show everyone again' : `Show only ${label}`, 'aria-pressed': String(!!on),
        onClick: () => { only = on ? null : { g, k: label }; group = g; render(); } }, h('b', {}, label), ` ${n}`);
    };
    const at = (pos) => hit.filter((p) => mainPos(p) === pos).length;
    const rot = pit.filter((p) => st.rotation.includes(p.id)).length;
    const pen = (role) => pit.filter((p) => st.pen[p.id] === role).length;
    return h('div', { class: 'depth-strip' },
      h('span', { class: 'depth-lab' }, 'Hitters'), POS_ORDER.map((pos) => chip(pos, at(pos), need && pos !== 'DH')),
      h('span', { class: 'depth-lab' }, 'Pitchers'),
      level === 'active' || level === 'forty'
        ? [chip('SP', rot, need), chip('CL', pen('Closer'), false), chip('SU', pen('Setup'), false), chip('MR', pen('Middle') + pen('Matchup'), false), chip('LR', pen('Long'), false)]
        : [chip('SP', pit.filter((p) => p.role === 'Starter').length, false), chip('RP', pit.filter((p) => p.role !== 'Starter').length, false)]);
  }

  /** Does he belong to the position chip picked? */
  function fits(p, k) {
    if (POS_ORDER.includes(k)) return mainPos(p) === k;
    const live = level === 'active' || level === 'forty';
    if (k === 'SP') return live ? st.rotation.includes(p.id) : p.role === 'Starter';
    if (k === 'RP') return p.role !== 'Starter';
    const r = st.pen[p.id];
    return k === 'CL' ? r === 'Closer' : k === 'SU' ? r === 'Setup' : k === 'MR' ? r === 'Middle' || r === 'Matchup' : r === 'Long';
  }

  function defaultSort() {
    // everywhere else the squad is in position order, best first within each position
    return group === 'pit' ? 'role' : 'pos';
  }

  // SP1 to SP5 in the order they start, then the bullpen by role
  const roleCode = (p) => { const i = st.rotation.indexOf(p.id); return i >= 0 ? `SP${i + 1}` : ROLE_SHORT[st.pen[p.id]] || mainPos(p); };
  const roleOrder = (p) => { const i = st.rotation.indexOf(p.id); return -(i >= 0 ? i : ROLE_RANK[st.pen[p.id]] ?? 20); };
  // the order of the squad: hitters by position (C first, DH last), pitchers by rotation slot and then bullpen role, best first within each
  const posIdx = (p) => { const i = POS_ORDER.indexOf(mainPos(p)); return i < 0 ? POS_ORDER.length : i; };
  const pitIdx = (p) => { const i = st.rotation.indexOf(p.id); return i >= 0 ? i : ROLE_RANK[st.pen[p.id]] ?? (p.role === 'Starter' ? 8 : 20); };
  /** His main position, then any other he plays well (15 or more): "1B/2B/3B". The full list is on his profile. */
  const posShort = (p) => { const m = mainPos(p), more = positions(p).filter((x) => x !== m); return h('span', { title: posString(p) }, h('b', { class: 'cm-y' }, m), more.map((x) => `/${x}`)); };
  const posKey = (p) => posIdx(p) * 1000 - value(p);
  const roleKey = (p) => pitIdx(p) * 1000 - value(p);

  function columns() {
    const pit = group === 'pit';
    const base = [
      { key: 'name', label: 'Name', left: true, get: (p) => `${p.last} ${p.first}`, show: (p) => plink(p) },
      pit ? { key: 'role', label: 'Role', left: true, asc: true, get: (p) => roleKey(p), show: (p) => h('b', { class: st.rotation.includes(p.id) ? 'cm-y' : '' }, roleCode(p)) }
        : { key: 'pos', label: 'Pos', left: true, asc: true, get: (p) => posKey(p), show: (p) => posShort(p) },
      { key: 'age', label: 'Age', get: (p) => p.age, asc: true },
      { key: 'bt', label: 'B/T', get: (p) => `${p.bats || '-'}/${p.throws || '-'}` },
    ];
    const place = { key: 'place', label: 'Place', left: true, get: (p) => {
      const c = placeCode(st, p);
      if (c === 'IL') { const x = st.il.get(p.id); return `${x.kind}-day IL${x.kind === 60 ? ', off the 40' : ''}${ilDaysLeft(st, p) ? ` (${ilDaysLeft(st, p)}d)` : ', ready'}`; }
      return c === 'MLB' ? 'Active roster' : levelWords(c);
    } };
    const cond = { key: 'cond', label: 'Condition', left: true, get: (p) => condition(p).text, show: (p) => { const c = condition(p); return h('span', { class: c.cls, title: c.title }, c.text); } };
    const grades = (keys) => keys.map((k) => ({ key: k, label: avShort(k), title: avLabel(k), get: (p) => avSort(p, k), show: (p) => av(p, k) }));
    if (view === 'overview') {
      const plan = pit && level === 'active' && game.season ? staffPlan(orgId) : null;
      const today = game.season ? dayNo(game.date) : 0;
      const staff = plan ? [
        { key: 'next', label: 'Next start', left: true, get: (p) => plan.get(p.id)?.n ?? 99, asc: true, show: (p) => { const x = plan.get(p.id); return x ? h('span', { class: x.n === 0 ? 'cm-g' : 'y' }, dayWord(x.d)) : st.rotation.includes(p.id) ? h('span', { class: 'cm-s' }, p.injury ? 'Injured' : 'Not in the next six') : ''; } },
        { key: 'arm', label: 'Arm', left: true, get: (p) => armStatus(p, today), show: (p) => { const a = armStatus(p, today); return h('span', { class: a === 'Rested' ? '' : a === 'Tired' ? 'cm-y' : 'cm-r' }, a); } },
        { key: 'lastp', label: 'Last pitched', left: true, get: (p) => lastOuting(p, today)[0], asc: true, show: (p) => lastOuting(p, today)[1] },
      ] : [];
      const cols = [...base, ...staff, ...(level === 'forty' || level === 'IL' ? [place] : []), cond,
        ...grades(pit ? ['Stuff', 'Movement', 'Control', 'Stamina'] : ['Contact', 'Power', 'Eye', 'Avoid K', 'Speed', 'Fielding']),
        { key: 'status', label: 'Status', left: true, get: (p) => `${st.forty.has(p.id) ? '0' : '1'}${statusShort(p)}`, show: (p) => h('span', {}, st.forty.has(p.id) ? h('b', { class: 'tag40' }, '40') : '', statusShort(p)) },
        { key: `y${game.year}`, label: String(game.year), get: (p) => num(salaryIn(p, game.year)), show: (p) => money(salaryIn(p, game.year)) },
        { key: 'worth', label: 'Value', get: (p) => worth(game.orgId, p) ?? -1e12, title: 'What he is worth to your club in a trade', show: (p) => h('span', { class: 'y' }, worthText(p)) }];
      if (mine && level !== 'FA' && level !== 'IL') cols.push({ key: 'move', label: 'Move to', left: true, get: () => '', show: (p) => moveSelect(p) });
      return cols;
    }
    if (view === 'grades') return [...base.filter((c) => c.key !== 'bt'), ...grades(pit ? PIT_GRADES : HIT_GRADES)];
    if (view === 'mental') return [...base, ...grades(MENTAL)];
    if (view === 'stats') return [...base.filter((c) => c.key !== 'bt'), ...(pit ? pitStats() : batStats())];
    return [...base,
      { key: 'status', label: 'Status', left: true, get: (p) => `${st.forty.has(p.id) ? '0' : '1'}${statusShort(p)}`, show: (p) => h('span', {}, st.forty.has(p.id) ? h('b', { class: 'tag40' }, '40') : '', statusShort(p)) },
      { key: 'svc', label: 'Service', get: (p) => p.contract?.serviceTime, show: (p) => (p.contract?.serviceTime != null ? String(Math.floor(p.contract.serviceTime)) : ''), title: 'Full years of major league service time (days are on his profile)' },
      { key: 'opt', label: 'Opts', get: (p) => p.contract?.options, title: 'Minor league options left' },
      // years the contract does not name still have club control: shown as an estimate, with arbitration years marked
      ...yearsAhead().map((y) => {
        const open = (p) => { const v = salaryIn(p, y); return v == null || (typeof v === 'string' && /^A\d/.test(v)); };
        const est = (p) => (open(p) && p.contract?.status !== 'free agent' ? schedule(p).find((x) => x.season === y) : null);
        return { key: `y${y}`, label: String(y), get: (p) => num(salaryIn(p, y)) ?? est(p)?.salary ?? null,
          show: (p) => { const x = est(p); if (!x) return money(salaryIn(p, y)); const arb = (p.contract?.serviceTime ?? 0) + x.t >= 3; const now = y === game.year; return h('span', { class: now ? '' : 'cm-s', title: now ? 'What he is paid this season' : arb ? 'Arbitration year: an estimate' : 'Club control: an estimate' }, `${now ? '' : '~'}${money(x.salary)}${arb ? ' arb' : ''}`); } };
      }),
      { key: 'text', label: 'Contract', left: true, get: (p) => p.contract?.text || '' }];
  }

  const season = (p) => {
    if (statYear === 'last' || !game.season) {
      const yr = (game.season?.year ?? game.year) - 1;
      return seasonLine(p, isPitcher(p) ? 'pit' : 'bat', yr) || lastSeason(p);
    }
    const lv = ['AAA', 'AA', 'A+', 'A', 'R'].includes(level) ? level : null;
    return seasonLine(p, isPitcher(p) ? 'pit' : 'bat', game.season.year, level === 'active' ? 'MLB' : lv);
  };
  const ss = (f) => (p) => { const s = season(p); return s ? f(s) : null; };
  function batStats() {
    return [
      { key: 'tbop', label: 'TBO9+', cls: 'hl', get: ss((s) => tboPlus(s, s.season, s.level.includes('/') ? 'MLB' : s.level)), title: 'TBO9 against the league, 100 is average' },
      { key: 'g', label: 'G', get: ss((s) => s.g) }, { key: 'pa', label: 'PA', get: ss((s) => s.pa) },
      { key: 'avg', label: 'AVG', get: ss((s) => s.avg), show: (p) => rate3(season(p)?.avg) },
      { key: 'obp', label: 'OBP', get: ss((s) => s.obp), show: (p) => rate3(season(p)?.obp) },
      { key: 'slg', label: 'SLG', get: ss((s) => s.slg), show: (p) => rate3(season(p)?.slg) },
      { key: 'ops', label: 'OPS', get: ss((s) => s.ops), show: (p) => rate3(season(p)?.ops) },
      { key: 'hr', label: 'HR', get: ss((s) => s.hr) }, { key: 'rbi', label: 'RBI', get: ss((s) => s.rbi) }, { key: 'sb', label: 'SB', get: ss((s) => s.sb) },
      { key: 'bbp', label: 'BB%', get: ss((s) => s.bbPct), show: (p) => pct(season(p)?.bbPct) },
      { key: 'kp', label: 'K%', get: ss((s) => s.kPct), show: (p) => pct(season(p)?.kPct), asc: true },
    ];
  }
  function pitStats() {
    return [
      { key: 'tbam', label: 'TBA9-', cls: 'hl', asc: true, get: (p) => { const s = season(p); return s ? tbaMinus(s, p, s.season, s.level.includes('/') ? 'MLB' : s.level) : null; }, title: 'TBA9 against the league, 100 is average, lower is better' },
      { key: 'g', label: 'G', get: ss((s) => s.g) }, { key: 'gs', label: 'GS', get: ss((s) => s.gs) },
      { key: 'ip', label: 'IP', get: ss((s) => s.outs), show: (p) => (season(p) ? ipText(season(p).outs) : '') },
      { key: 'era', label: 'ERA', get: ss((s) => s.era), show: (p) => fix(season(p)?.era), asc: true },
      { key: 'fip', label: 'FIP', get: ss((s) => s.fip), show: (p) => fix(season(p)?.fip), asc: true },
      { key: 'whip', label: 'WHIP', get: ss((s) => s.whip), show: (p) => fix(season(p)?.whip), asc: true },
      { key: 'k9', label: 'K/9', get: ss((s) => s.k9), show: (p) => fix(season(p)?.k9, 1) },
      { key: 'bb9', label: 'BB/9', get: ss((s) => s.bb9), show: (p) => fix(season(p)?.bb9, 1), asc: true },
      { key: 'sv', label: 'SV', get: ss((s) => s.sv) },
    ];
  }

  function moveSelect(p) {
    const here = placeCode(st, p);
    if (!MOVE_TO.some(([v]) => v === here)) return h('span', { class: 'cm-s' }, levelWords(here));
    const addable = !st.forty.has(p.id) && here !== 'MLB';
    const opts = MOVE_TO.map(([v, l]) => [v, v === here ? (v === 'MLB' ? 'Active roster' : `${l} (now)`) : l]);
    if (addable) opts.push(['ADD40', 'Add to 40-man']);
    return select(opts, here, async (to) => {
      await rosterAction(o, st, p, to === 'ADD40' ? { type: 'add40' } : { type: 'move', to });
      render();
    }, { 'aria-label': `Move ${p.first} ${p.last}` });
  }

  /** What is wrong with the roster, the assistant's whole plan for putting it right, and Undo. */
  function assistant() {
    const plan = planPanel(o, orgState(), { onChange: render, compact: true });
    if (!['AAA', 'AA', 'A+', 'A', 'R'].includes(level)) return plan;
    // the minor leagues as a whole: best players up, lineups and rotations back to the assistant's
    const arrange = h('div', { class: 'cm-pad btnrow' }, h('button', { class: 'cm-btn go', onClick: async () => {
      const { arrangeMinors } = await import('../club/minors.js');
      const { checkpoint } = await import('../season/undo.js');
      checkpoint('Minor leagues arranged');
      const n = arrangeMinors(o, orgState());
      toast(n ? `Your assistant moved ${n} ${n === 1 ? 'player' : 'players'} between the minor league clubs and set their lineups and rotations.` : 'The minor leagues were already well arranged. Your assistant reset the lineups and rotations.');
      render();
    } }, 'Ask the assistant to arrange the minor leagues'));
    return h('div', { style: { display: 'contents' } }, plan, arrange);
  }

  render();
  const club = o.club;
  return {
    el: h('div', { style: { display: 'contents' } }, clubTitle(club, `${club.full ?? `${club.city} ${club.name}`}`), levelTabs.el, viewTabs.el,
      mine ? subTabs.el : null,
      head, body),
    side: () => clubMenu(mine ? 'squad' : null), bg: 'squad', bgOrg: orgId,
    onShow: render,
  };
}

/** Fit, tired (hitters' run of games, pitchers' recent work) or injured. */
function condition(p) {
  if (p.injury) {
    const left = Math.max(0, p.injury.days - (dayNo(game.date) - p.injury.since));
    return { text: `Injured, ${left}d`, cls: 'cm-r', title: p.injury.type };
  }
  if (isPitcher(p)) {
    if (!p.plog?.length) return { text: 'Rested', cls: 'cm-g' };
    const a = armStatus(p, dayNo(game.date));
    return { text: a, cls: a === 'Rested' ? 'cm-g' : a === 'Tired' ? 'cm-y' : 'cm-r' };
  }
  const f = p.fat || 0;
  return f > 70 ? { text: `Tired ${Math.round(f)}%`, cls: 'cm-r' } : f > 50 ? { text: `Tiring ${Math.round(f)}%`, cls: 'cm-y' } : { text: 'Fresh', cls: 'cm-g' };
}

const num = (v) => (typeof v === 'number' ? v : null);
