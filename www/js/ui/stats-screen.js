// Stats: the in-depth numbers. Batting and pitching leaderboards for any season and any club, with
// standard and advanced columns; splits for any player (left and right, home and away, month by month)
// with a monthly chart; team tables; and trends over the season for up to four clubs on one chart.
import { dataCredit } from './credit.js';
import { h, fill, cmTabs } from './dom.js';
import { clubMenu } from './menu.js';
import { plink, select, posCell } from './club-ui.js';
import { sortTable } from './table.js';
import { lineChart } from './chart.js';
import { isPitcher, seasonLine, mainPos, rate3, fix, pct, ipText, HIST, line } from '../data/world.js';
import { game } from '../state.js';
import { handLine, gameLine } from '../season/splits.js';
import { teamTotals } from '../season/teamstats.js';
import { divisions } from '../season/standings.js';
import { fromDayNo, monthName } from '../season/calendar.js';
import { tbo9, tba9, tboPlus, tbaMinus } from '../season/tb.js';

const MONTHS = [3, 4, 5, 6, 7, 8, 9];
const MON = { 3: 'Mar', 4: 'Apr', 5: 'May', 6: 'Jun', 7: 'Jul', 8: 'Aug', 9: 'Sep', 10: 'Oct' };
const W = () => game.world;

/** League totals for a season, for OPS+, ERA+ and FIP. */
function league(year) {
  const bat = new Array(HIST.bat.length).fill(0), pit = new Array(HIST.pit.length).fill(0);
  for (const p of W().list) {
    for (const r of p.hist?.bat || []) if (r[0] === year && r[1] === 'MLB') r.slice(3).forEach((v, i) => { bat[i] += v; });
    for (const r of p.hist?.pit || []) if (r[0] === year && r[1] === 'MLB') r.slice(3).forEach((v, i) => { pit[i] += v; });
  }
  const b = line('bat', [year, 'MLB', '', ...bat]), t = line('pit', [year, 'MLB', '', ...pit]);
  const fipRaw = t.ip ? (13 * t.hr + 3 * t.bb - 2 * t.so) / t.ip : 0;
  return { b, t, fipC: (t.era ?? 4) - fipRaw };
}

// wOBA weights, close to recent seasons
const wOBA = (s) => {
  const singles = s.h - s.b2 - s.b3 - s.hr;
  const d = s.ab + s.bb + s.hbp + s.sf;
  return d ? (0.69 * s.bb + 0.72 * s.hbp + 0.88 * singles + 1.25 * s.b2 + 1.58 * s.b3 + 2.03 * s.hr) / d : null;
};

export function statsScreen(start = 'bat', startYear = null) {
  let tab = start;
  const years = [...new Set([game.season?.year, game.year - 1, game.year - 2, game.year - 3, ...Object.keys(game.history || {}).map(Number)].filter(Boolean))].sort((a, b) => b - a);
  let year = startYear && years.includes(startYear) ? startYear : years[0], club = 'all', qualified = true, view = 'standard', pickId = null;
  let trendClubs = null, measure = 'above';
  const body = h('div', { class: 'cm-panel grow st-stats' });
  const tabs = cmTabs([
    { id: 'bat', label: 'Batting' }, { id: 'pit', label: 'Pitching' }, { id: 'splits', label: 'Player Splits' },
    { id: 'teams', label: 'Teams' }, { id: 'trends', label: 'Season Trends' },
  ], tab, (id) => { tab = id; render(); });

  function render() { ({ bat: board, pit: board, splits, teams, trends })[tab](); }

  const clubOptions = () => [['all', 'All clubs'], ...W().mlb.map((c) => [c.org, `${c.full ?? `${c.city} ${c.name}`}`])];
  const filters = (extra = []) => h('div', { class: 'cm-pad filters' },
    select(years.map((y) => [y, String(y)]), year, (v) => { year = Number(v); render(); }, { 'aria-label': 'Season' }),
    select(clubOptions(), club, (v) => { club = v; render(); }, { 'aria-label': 'Club' }),
    ...extra);

  // ---------- leaderboards ----------
  function board() {
    const pit = tab === 'pit';
    const lg = league(year);
    const games = year === game.season?.year ? Math.max(1, ...[...game.season.records.values()].map((r) => r.w + r.l)) : 162;
    const rows = [];
    for (const p of W().list) {
      if (isPitcher(p) !== pit) continue;
      const s = seasonLine(p, pit ? 'pit' : 'bat', year, 'MLB');
      if (club !== 'all' && !(s && String(s.club).split('/').some((c) => c === club))) continue;
      if (!s || (pit ? !s.outs : !s.pa)) continue;
      if (qualified && (pit ? s.outs < games * 3 : s.pa < games * 3.1)) continue;
      rows.push({ p, s });
    }
    const name = { key: 'name', label: 'Player', left: true, get: (x) => x.p.last, show: (x) => plink(x.p) };
    const clubCol = { key: 'club', label: 'Club', left: true, get: (x) => String(x.s.club).split('/').map((c) => W().orgs.get(c)?.club.abbr || c).join('/') };
    const n = (key, label, f, o = {}) => ({ key, label, get: (x) => f(x.s, x.p), ...o });
    const r3 = (key, label, f, o = {}) => ({ key, label, get: (x) => f(x.s), show: (x) => rate3(f(x.s)), ...o });
    const f2 = (key, label, f, o = {}) => ({ key, label, get: (x) => f(x.s), show: (x) => fix(f(x.s)), ...o });
    const pc = (key, label, f, o = {}) => ({ key, label, get: (x) => f(x.s), show: (x) => pct(f(x.s)), ...o });
    let cols, sort;
    if (!pit && view === 'standard') {
      sort = 'tbop';
      cols = [name, clubCol, { key: 'pos', label: 'Pos', left: true, get: (x) => mainPos(x.p), show: (x) => posCell(x.p) }, n('age', 'Age', (s, p) => p.age),
        { key: 'tbop', label: 'TBO9+', get: (x) => tboPlus(x.s, year), cls: 'hl', title: 'TBO9 against the league: 100 is average, higher is better' },
        f2('tbo9', 'TBO9', (s) => tbo9(s), { title: 'Bases produced per game: singles, 2 x doubles, 3 x triples, 4 x homers, walks and steals per plate appearance, times 4.5' }),
        n('g', 'G', (s) => s.g), n('pa', 'PA', (s) => s.pa), n('ab', 'AB', (s) => s.ab), n('r', 'R', (s) => s.r), n('h', 'H', (s) => s.h),
        n('b2', '2B', (s) => s.b2), n('b3', '3B', (s) => s.b3), n('hr', 'HR', (s) => s.hr), n('rbi', 'RBI', (s) => s.rbi),
        n('bb', 'BB', (s) => s.bb), n('so', 'SO', (s) => s.so, { asc: true }), n('sb', 'SB', (s) => s.sb), n('cs', 'CS', (s) => s.cs, { asc: true }),
        r3('avg', 'AVG', (s) => s.avg), r3('obp', 'OBP', (s) => s.obp), r3('slg', 'SLG', (s) => s.slg), r3('ops', 'OPS', (s) => s.ops)];
    } else if (!pit) {
      sort = 'opsp';
      const babip = (s) => { const d = s.ab - s.so - s.hr + s.sf; return d > 0 ? (s.h - s.hr) / d : null; };
      cols = [name, clubCol, n('pa', 'PA', (s) => s.pa),
        r3('iso', 'ISO', (s) => (s.slg != null ? s.slg - s.avg : null), { title: 'Isolated power: slugging minus average' }),
        r3('babip', 'BABIP', babip, { title: 'Average on balls in play' }),
        pc('kp', 'K%', (s) => s.kPct, { asc: true }), pc('bbp', 'BB%', (s) => s.bbPct),
        f2('bbk', 'BB/K', (s) => (s.so ? s.bb / s.so : null)), pc('hrp', 'HR%', (s) => (s.pa ? s.hr / s.pa : null)),
        r3('woba', 'wOBA', wOBA, { title: 'Weighted on-base average' }),
        n('opsp', 'OPS+', (s) => (s.obp != null && lg.b.obp ? Math.round(100 * (s.obp / lg.b.obp + s.slg / lg.b.slg - 1)) : null), { title: 'OPS against the league, 100 is average' })];
    } else if (view === 'standard') {
      sort = 'tbam';
      cols = [name, clubCol, n('age', 'Age', (s, p) => p.age),
        { key: 'tbam', label: 'TBA9-', get: (x) => tbaMinus(x.s, x.p, year), asc: true, cls: 'hl', title: 'TBA9 against the league: 100 is average, lower is better' },
        { key: 'tba9', label: 'TBA9', get: (x) => tba9(x.s, x.p, year), show: (x) => fix(tba9(x.s, x.p, year)), asc: true, title: 'Bases allowed per nine innings: singles, 2 x doubles, 3 x triples, 4 x homers and walks per inning, times 9' },
        n('g', 'G', (s) => s.g), n('gs', 'GS', (s) => s.gs),
        { key: 'ip', label: 'IP', get: (x) => x.s.outs, show: (x) => ipText(x.s.outs) }, n('w', 'W', (s) => s.w), n('l', 'L', (s) => s.l, { asc: true }), n('sv', 'SV', (s) => s.sv),
        n('h', 'H', (s) => s.h, { asc: true }), n('er', 'ER', (s) => s.er, { asc: true }), n('hr', 'HR', (s) => s.hr, { asc: true }), n('bb', 'BB', (s) => s.bb, { asc: true }), n('so', 'SO', (s) => s.so),
        f2('era', 'ERA', (s) => s.era, { asc: true }), f2('whip', 'WHIP', (s) => s.whip, { asc: true })];
    } else {
      sort = 'fip';
      const fip = (s) => (s.ip ? (13 * s.hr + 3 * s.bb - 2 * s.so) / s.ip + lg.fipC : null);
      const babip = (s) => { const d = s.bf - s.so - s.hr - s.bb; return d > 0 ? (s.h - s.hr) / d : null; };
      cols = [name, clubCol, { key: 'ip', label: 'IP', get: (x) => x.s.outs, show: (x) => ipText(x.s.outs) },
        f2('k9', 'K/9', (s) => s.k9), f2('bb9', 'BB/9', (s) => s.bb9, { asc: true }), f2('hr9', 'HR/9', (s) => s.hr9, { asc: true }),
        pc('kp', 'K%', (s) => s.kPct), pc('bbp', 'BB%', (s) => s.bbPct, { asc: true }), pc('kbb', 'K-BB%', (s) => (s.kPct != null ? s.kPct - s.bbPct : null)),
        r3('babip', 'BABIP', babip, { asc: true, title: 'Average on balls in play against' }),
        f2('fip', 'FIP', fip, { asc: true, title: 'Fielding independent pitching: what his ERA would be from strikeouts, walks and homers alone' }),
        n('erap', 'ERA+', (s) => (s.era ? Math.round((100 * lg.t.era) / s.era) : null), { title: 'ERA against the league, 100 is average, higher is better' }),
        n('fipm', 'FIP-', (s) => { const f = fip(s); return f ? Math.round((100 * f) / lg.t.era) : null; }, { asc: true, title: 'FIP against the league, 100 is average, lower is better' })];
    }
    const toggle = (k, l, cur, set) => h('button', { class: `cm-btn${cur === k ? ' go' : ''}`, onClick: () => { set(k); render(); } }, l);
    fill(body,
      filters([
        toggle('standard', 'Standard', view, (v) => { view = v; }), toggle('advanced', 'Advanced', view, (v) => { view = v; }),
        h('label', { class: 'cm-check' }, h('input', { type: 'checkbox', checked: qualified, onChange: (e) => { qualified = e.target.checked; render(); } }), ' Qualified only'),
        h('span', { class: 'cm-s' }, `${rows.length} players`)]),
      rows.length ? sortTable({ rows, cols, sort, desc: !cols.find((c) => c.key === sort)?.asc, limit: 300, rowClass: (x) => (x.p.orgId === game.orgId ? 'now' : '') }).el
        : h('p', { class: 'cm-sub cm-pad' }, qualified ? 'Nobody qualifies yet. Untick "Qualified only".' : 'No major league stats for this season.'),
      h('p', { class: 'cm-s cm-pad' }, `Major league games only. Qualified: 3.1 plate appearances or one inning per team game. League ${pit ? `ERA ${fix(lg.t.era)}` : `AVG ${rate3(lg.b.avg)}, OBP ${rate3(lg.b.obp)}, SLG ${rate3(lg.b.slg)}`}.`));
  }

  // ---------- player splits ----------
  function splits() {
    const yr = game.season?.year ?? game.year;
    const pool = W().list.filter((p) => p.splits?.[yr]);
    if (!pool.length) { fill(body, h('p', { class: 'cm-sub cm-pad' }, 'Splits build up as the season is played.')); return; }
    if (!pickId || !pool.some((p) => p.id === pickId)) {
      const mine = pool.filter((p) => p.orgId === game.orgId && !isPitcher(p)).sort((a, b) => (seasonLine(b, 'bat', yr, 'MLB')?.pa || 0) - (seasonLine(a, 'bat', yr, 'MLB')?.pa || 0));
      pickId = (mine[0] || pool[0]).id;
    }
    const p = W().players.get(pickId);
    const listId = 'split-players';
    const input = h('input', { class: 'cm-input', list: listId, placeholder: 'Find a player', 'aria-label': 'Player' });
    input.addEventListener('change', () => {
      const hit = pool.find((x) => `${x.first} ${x.last} (${W().orgs.get(x.orgId)?.club.abbr || 'FA'})` === input.value);
      if (hit) { pickId = hit.id; render(); }
    });
    const ours = pool.filter((x) => x.orgId === game.orgId);
    fill(body,
      h('div', { class: 'cm-pad filters' },
        select(ours.map((x) => [x.id, `${x.first} ${x.last}`]), ours.some((x) => x.id === pickId) ? pickId : '', (v) => { pickId = v; render(); }, { 'aria-label': 'Your players' }),
        input, h('datalist', { id: listId }, pool.map((x) => h('option', { value: `${x.first} ${x.last} (${W().orgs.get(x.orgId)?.club.abbr || 'FA'})` })))),
      splitsView(p, yr));
  }

  // ---------- teams ----------
  function teams() {
    if (!game.season) { fill(body, h('p', { class: 'cm-sub cm-pad' }, 'Team stats start with the season.')); return; }
    const T = teamTotals(game.season.year);
    const rows = W().mlb.map((c) => ({ c, r: game.season.records.get(c.id), ...(T.get(c.id) || {}) })).filter((x) => x.bat);
    const g = (x) => Math.max(1, x.r.w + x.r.l);
    const lg = league(game.season.year);
    fill(body, rows.length ? sortTable({
      rows, sort: 'diff', rowClass: (x) => (x.c.org === game.orgId ? 'now' : ''),
      cols: [
        { key: 'club', label: 'Club', left: true, get: (x) => `${x.c.full ?? `${x.c.city} ${x.c.name}`}` },
        { key: 'wl', label: 'W-L', get: (x) => x.r.w / g(x), show: (x) => `${x.r.w}-${x.r.l}` },
        { key: 'diff', label: 'Diff', get: (x) => x.r.rs - x.r.ra, show: (x) => h('span', { class: x.r.rs >= x.r.ra ? 'cm-g' : 'cm-r' }, `${x.r.rs - x.r.ra > 0 ? '+' : ''}${x.r.rs - x.r.ra}`) },
        { key: 'pyth', label: 'Pyth W-L', get: (x) => x.r.rs ** 1.83 / (x.r.rs ** 1.83 + x.r.ra ** 1.83), show: (x) => { const w = Math.round(g(x) * (x.r.rs ** 1.83 / (x.r.rs ** 1.83 + x.r.ra ** 1.83 || 1))); return `${w}-${g(x) - w}`; }, title: 'The record the runs scored and allowed suggest' },
        { key: 'rpg', label: 'R/G', get: (x) => x.r.rs / g(x), show: (x) => (x.r.rs / g(x)).toFixed(2) },
        { key: 'avg', label: 'AVG', get: (x) => x.bat.avg, show: (x) => rate3(x.bat.avg) },
        { key: 'obp', label: 'OBP', get: (x) => x.bat.obp, show: (x) => rate3(x.bat.obp) },
        { key: 'slg', label: 'SLG', get: (x) => x.bat.slg, show: (x) => rate3(x.bat.slg) },
        { key: 'opsp', label: 'OPS+', get: (x) => Math.round(100 * (x.bat.obp / lg.b.obp + x.bat.slg / lg.b.slg - 1)) },
        { key: 'hr', label: 'HR', get: (x) => x.bat.hr }, { key: 'sb', label: 'SB', get: (x) => x.bat.sb },
        { key: 'rapg', label: 'RA/G', get: (x) => x.r.ra / g(x), show: (x) => (x.r.ra / g(x)).toFixed(2), asc: true },
        { key: 'era', label: 'ERA', get: (x) => x.pit.era, show: (x) => fix(x.pit.era), asc: true },
        { key: 'erap', label: 'ERA+', get: (x) => Math.round((100 * lg.t.era) / x.pit.era) },
        { key: 'k9', label: 'K/9', get: (x) => x.pit.k9, show: (x) => fix(x.pit.k9, 1) },
        { key: 'bb9', label: 'BB/9', get: (x) => x.pit.bb9, show: (x) => fix(x.pit.bb9, 1), asc: true },
      ],
    }).el : h('p', { class: 'cm-sub cm-pad cm-empty' }, 'No games played yet.'));
  }

  // ---------- trends ----------
  function trends() {
    const S = game.season;
    if (!S || !S.games.some((g) => g.s && g.level === 'MLB')) { fill(body, h('p', { class: 'cm-sub cm-pad' }, 'Trends appear once games have been played.')); return; }
    if (!trendClubs) {
      const div = [...divisions().values()].find((ids) => ids.includes(game.orgId)) || [game.orgId];
      trendClubs = [game.orgId, ...div.filter((id) => id !== game.orgId)].slice(0, 4);
    }
    const MEASURES = [['above', 'Games above .500'], ['diff', 'Run differential'], ['pct', 'Win % by month'], ['rpg', 'Runs per game by month'], ['rapg', 'Runs allowed per game by month']];
    const played = S.games.filter((g) => g.s && g.level === 'MLB' && !g.post);
    let chart;
    const city = (id) => W().clubs.get(id).city;
    if (measure === 'above' || measure === 'diff') {
      const days = [...new Set(played.map((g) => g.d))].sort((a, b) => a - b);
      const series = trendClubs.map((id) => {
        let v = 0;
        const byDay = new Map();
        for (const g of played.filter((x) => x.home === id || x.away === id).sort((a, b) => a.d - b.d)) {
          const [us, them] = g.home === id ? [g.s[1], g.s[0]] : [g.s[0], g.s[1]];
          v += measure === 'above' ? (us > them ? 1 : -1) : us - them;
          byDay.set(g.d, v);
        }
        let last = 0;
        return { name: city(id), values: days.map((d) => { if (byDay.has(d)) last = byDay.get(d); return last; }) };
      });
      chart = lineChart({ series, labels: days.map((d) => { const t = fromDayNo(d); return `${t.getDate()} ${MON[t.getMonth() + 1]}`; }), baseline: 0, format: (v) => `${v > 0 ? '+' : ''}${Math.round(v)}` });
    } else {
      const months = MONTHS.filter((m) => played.some((g) => fromDayNo(g.d).getMonth() + 1 === m));
      const series = trendClubs.map((id) => ({
        name: city(id),
        values: months.map((m) => {
          const gs = played.filter((g) => (g.home === id || g.away === id) && fromDayNo(g.d).getMonth() + 1 === m);
          if (!gs.length) return null;
          let w = 0, rs = 0, ra = 0;
          for (const g of gs) { const [us, them] = g.home === id ? [g.s[1], g.s[0]] : [g.s[0], g.s[1]]; if (us > them) w++; rs += us; ra += them; }
          return measure === 'pct' ? w / gs.length : measure === 'rpg' ? rs / gs.length : ra / gs.length;
        }),
      }));
      chart = lineChart({ series, labels: months.map((m) => MON[m]), baseline: measure === 'pct' ? 0.5 : undefined, format: measure === 'pct' ? (v) => v.toFixed(3).replace(/^0/, '') : (v) => v.toFixed(2) });
    }
    const box = (id) => h('label', { class: 'cm-check' }, h('input', {
      type: 'checkbox', checked: trendClubs.includes(id), disabled: !trendClubs.includes(id) && trendClubs.length >= 4,
      onChange: (e) => { trendClubs = e.target.checked ? [...trendClubs, id] : trendClubs.filter((x) => x !== id); render(); },
    }), ` ${city(id)}`);
    fill(body,
      h('div', { class: 'cm-pad filters' }, select(MEASURES, measure, (v) => { measure = v; render(); }, { 'aria-label': 'Measure' }), h('span', { class: 'cm-s' }, 'Up to four clubs')),
      chart,
      h('details', { class: 'cm-pad trend-clubs' }, h('summary', {}, 'Choose clubs'), h('div', { class: 'club-checks' }, W().mlb.map((c) => box(c.id)))));
  }

  render();
  return {
    el: h('div', { style: { display: 'contents' } }, h('div', { class: 'cm-title' }, 'Stats', dataCredit('Data by')), tabs.el, body),
    side: () => clubMenu('stats'), bg: 'stats',
    onShow: render,
  };
}

/** A player's splits this season: the table and a month-by-month chart. Also used on his profile. */
export function splitsView(p, yr = game.season?.year ?? game.year) {
  const sp = p.splits?.[yr];
  if (!sp) return h('p', { class: 'cm-sub cm-pad cm-empty' }, 'No major league splits this season yet.');
  const pit = isPitcher(p);
  const kind = pit ? 'pit' : 'bat';
  const S = sp[kind] || {};
  const rows = [];
  const hand = (k, label) => { const x = handLine(S[k]); if (x?.pa) rows.push({ label, h: x }); };
  const game_ = (k, label) => { const x = gameLine(kind, S[k], yr, k); if (x && (pit ? x.outs : x.pa)) rows.push({ label, g: x }); };
  hand('vsL', pit ? 'v left-handed hitters' : 'v left-handed pitchers');
  hand('vsR', pit ? 'v right-handed hitters' : 'v right-handed pitchers');
  game_('home', 'Home'); game_('away', 'Away');
  for (const m of [3, 4, 5, 6, 7, 8, 9]) game_(`m${m}`, monthName(new Date(yr, m - 1, 1)));
  // one table: the at-bat lines (handedness) show slash lines; game lines add the counting stats
  const t = (x) => x.h || x.g;
  const cols = pit
    ? ['Split', 'IP', 'ERA', 'WHIP', 'K/9', 'PA', 'AVG', 'OBP', 'SLG', 'K%', 'BB%']
    : ['Split', 'G', 'PA', 'H', 'HR', 'RBI', 'AVG', 'OBP', 'SLG', 'OPS', 'K%', 'BB%'];
  const cells = (x) => {
    const s = t(x);
    if (pit) return [x.g ? ipText(s.outs) : '', x.g ? fix(s.era) : '', x.g ? fix(s.whip) : '', x.g ? fix(s.k9, 1) : '', x.h ? s.pa : s.bf,
      x.h ? rate3(s.avg) : '', x.h ? rate3(s.obp) : '', x.h ? rate3(s.slg) : '', pct(s.kPct), pct(s.bbPct)];
    return [x.g ? s.g : '', s.pa, s.h, s.hr, x.g ? s.rbi : '', rate3(s.avg), rate3(s.obp), rate3(s.slg), rate3(s.ops), pct(s.kPct), pct(s.bbPct)];
  };
  const months = [3, 4, 5, 6, 7, 8, 9].filter((m) => { const x = gameLine(kind, S[`m${m}`], yr, 'm'); return x && (pit ? x.outs : x.pa); });
  const val = (m) => { const x = gameLine(kind, S[`m${m}`], yr, 'm'); return pit ? x.era : x.ops; };
  return h('div', {},
    h('div', { class: 'cm-h' }, `${p.first} ${p.last}: ${yr} splits`),
    h('div', { class: 'cm-tblwrap' }, h('table', { class: 'cm-tbl' },
      h('thead', {}, h('tr', {}, cols.map((c, i) => h('th', { class: i ? '' : 'l' }, c)))),
      h('tbody', {}, rows.map((x) => h('tr', {}, h('td', { class: 'l' }, x.label), cells(x).map((v) => h('td', { class: 'y' }, v ?? ''))))))),
    months.length >= 2 ? lineChart({
      title: pit ? 'ERA by month' : 'OPS by month', height: 220,
      series: [{ name: p.last, values: months.map(val) }], labels: months.map((m) => MON[m]),
      format: pit ? (v) => v.toFixed(2) : (v) => v.toFixed(3).replace(/^0/, ''),
    }) : null);
}
