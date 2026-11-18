// Match screen, driven live by the engine. The engine produces events; the narrator turns them into lines;
// this screen shows each line, then updates the board a beat later. Manager commands from the tactics
// screen go to the engine and take effect before the next pitch.
import { av, avSort, avShort, avLabel } from './attr-ui.js';
import { h, fill, cmTabs, val, ordinal } from './dom.js';
import { nav } from './nav.js';
import { pl, readableOn } from './player-screen.js';
import { tacticsScreen } from './tactics-screen.js';
import { Game } from '../engine/game.js';
import { Narrator } from '../narration/renderer.js';
import { toEngineTeam } from '../club/engine-team.js';
import { game as G } from '../state.js';
import { seasonLine, lastSeason } from '../data/world.js';
import { tboPlus, tbaMinus } from '../season/tb.js';
import { h2hWords } from '../season/h2h.js';

const BEAT_MS = 600;   // the board trails the words by this much at normal speed
const LINE_MS = 2400;  // a standard line holds this long at normal speed (scaled by each line's hold)
const SPEEDS = [[1, 'Normal'], [2, 'Fast'], [4, 'Very fast'], [8, 'Fastest']];

/**
 * @param {{away:any, home:any, venue:string, date:string, facts:any, otherGames:any[], standings:any[],
 *          playersById:Map<string,any>, seed?:string}} data
 */
/** White or near-black text, whichever reads better on a club's main colour. */
function readable(hex) {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex || '');
  if (!m) return '#fff';
  const [r, g, b] = [m[1], m[2], m[3]].map((x) => parseInt(x, 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.4 ? '#111' : '#fff';
}

export function matchScreen(data) {
  const { away, home } = data;
  const user = home.user ? home : away;
  const opp = user === home ? away : home;
  const userKey = user === home ? 'home' : 'away';
  const teams = { away, home };
  const engineTeams = { away: toEngineTeam(away), home: toEngineTeam(home) };
  const P = data.playersById;

  let game, narr, lines, shown, scorers, pbp, timer, gameNo = 0;
  let reported = false;
  let speedIdx = Math.min(G.settings?.commSpeed ?? 0, SPEEDS.length - 1), playing = true, keyOnly = false, resumeOnShow = false, pending = [], lastSideKey = '';
  let view = 'overview';

  // ---------- frame ----------
  const el = {};
  const teamBar = (t, side) => h('div', { class: `mx-team mx-${side}`, '--kit-a': t.kitA, '--kit-b': readable(t.kitA) },
    h('span', { class: 'nm' }, h('span', { class: 'full' }, `${t.full ?? `${t.city} ${t.name}`}`), h('span', { class: 'ab' }, t.abbr)),
    el[`${side}Score`] = h('span', { class: 'sc' }));
  el.awayBar = teamBar(away, 'away');
  el.homeBar = teamBar(home, 'home');

  const top = cmTabs([
    { id: 'overview', label: 'Match Overview' }, { id: 'stats', label: 'Match Stats' },
    { id: 'box', label: 'Box Score' }, { id: 'pbp', label: 'Play by Play' },
  ], view, (id) => { view = id; bottom.select(''); renderBody(); });
  const bottom = cmTabs([
    { id: 'oppStats', label: `${opp.city} Stats` }, { id: 'scores', label: 'Latest Scores' },
    { id: 'table', label: 'Standings' }, { id: 'userStats', label: `${user.city} Stats` },
  ], '', (id) => { view = id; top.select(''); renderBody(); });

  // on a phone each row is a drop-down; with nothing chosen in it, it says what it holds
  top.el.dataset.mlabel = 'Match';
  bottom.el.dataset.mlabel = 'More';
  el.body = h('div', { class: 'cm-panel grow' });
  const root = h('div', { style: { display: 'contents' } },
    h('div', { class: 'mx-head' }, el.awayBar, el.homeBar),
    ...(window.innerWidth <= 700 ? [top.el, bottom.el, el.body] : [top.el, el.body, bottom.el]), // on a phone both drop-downs share one row
    h('div', { class: 'mx-venue' }, data.venue));

  el.ov = {
    state: h('div', { class: 'mx-state' }),
    awaySc: h('div', { class: 'a' }), homeSc: h('div', { class: 'h' }),
    count: h('div', { class: 'mx-count' }), diamond: diamond(),
    comm: h('div', { class: 'mx-comm', 'aria-live': 'polite' }, el.commText = h('div', { class: 't' })),
    matchup: h('div', { class: 'mx-cards' }),
    pending: h('div', { class: 'mx-matchup cm-y' }),
    wp: h('div', { class: 'bar' }),
  };
  const ov = h('div', { class: 'mx-ov' },
    el.ov.state,
    h('div', { class: 'mx-infoline' }, h('span', {}, data.date), h('span', {}, data.facts.game)),
    h('div', { class: 'mx-scorers' }, el.ov.awaySc, h('div', { class: 'mx-sit' }, el.ov.count, el.ov.diamond.svg), el.ov.homeSc),
    // the commentary sits in the middle of the screen, with the matchup under it
    h('div', { class: 'mx-mid' }, el.ov.comm, el.ov.matchup, el.ov.pending),
    h('div', { class: 'mx-foot' },
      h('div', { class: 'mx-wp' }, h('span', { class: 'lbl' }, 'Win chance'), el.ov.wp),
      h('div', { class: 'mx-facts' },
        h('span', {}, 'Plate umpire: ', h('span', {}, data.facts.umpire)),
        h('span', {}, 'Attendance: ', h('span', {}, data.facts.attendance)),
        h('span', {}, 'Weather: ', h('span', {}, data.facts.weather)))));

  // ---------- live helpers ----------
  const player = (id) => P.get(id);
  const battingKey = () => (shown.half === 'top' ? 'away' : 'home');
  const sideIds = (key) => {
    const s = game.side[key];
    return new Set([...s.team.lineup.map((x) => x.player.id), ...s.team.bench.map((p) => p.id), s.team.starter.id, ...s.team.bullpen.map((p) => p.id)]);
  };
  const L = (id) => game.stats.get(id);
  const ip = (outs) => `${Math.floor(outs / 3)}.${outs % 3}`;
  const finished = () => game.over && !lines.length;

  function batLine(id) {
    const x = L(id);
    if (!x || !x.PA) return '';
    const parts = [`${x.H}-${x.AB}`];
    if (x.HR) parts.push(x.HR > 1 ? `${x.HR} HR` : 'HR');
    if (x['3B']) parts.push('3B');
    if (x['2B']) parts.push(x['2B'] > 1 ? `${x['2B']} 2B` : '2B');
    if (x.RBI) parts.push(`${x.RBI} RBI`);
    if (x.BB) parts.push(x.BB > 1 ? `${x.BB} BB` : 'BB');
    if (x.K) parts.push(x.K > 1 ? `${x.K} K` : 'K');
    return parts.join(', ');
  }

  // ---------- the pitcher and the batter ----------
  /** His season so far in the majors, or his last season if he has not played this year. */
  function seasonOf(id, kind) {
    const wp = G.world?.players.get(id);
    if (!wp) return null;
    const yr = G.season?.year;
    const now = yr && seasonLine(wp, kind, yr, 'MLB');
    if (now && (kind === 'bat' ? now.pa : now.outs)) return { s: now, yr, wp };
    const last = lastSeason(wp, kind);
    return last ? { s: last, yr: last.season, wp } : null;
  }
  const kv = (k, v, cls = '') => h('div', { class: 'kv' }, h('span', { class: 'k' }, k), h('span', { class: `v ${cls}` }, v));
  function pitcherCard(p) {
    const x = L(p.id) || {};
    const ss = seasonOf(p.id, 'pit');
    const s = ss?.s;
    const tba = s && ss.s.outs ? tbaMinus(s, ss.wp, ss.yr, s.level.includes('/') ? 'MLB' : s.level) : null;
    const t = teams[battingKey() === 'home' ? 'away' : 'home'];
    return h('div', { class: 'mx-card', style: { borderTopColor: t.kitA } },
      h('div', { class: 'hd' }, 'Pitching', h('span', {}, t.city)),
      h('div', { class: 'nm' }, pl(p), h('span', { class: 'hand' }, ` ${p.throws}HP`)),
      kv('Today', `${ip(x.pOuts || 0)} IP, ${x.pH || 0} H, ${x.pR || 0} R, ${x.pER || 0} ER, ${x.pBB || 0} BB, ${x.pK || 0} K`),
      kv('Pitches', String(shown.pitchCount), 'big'),
      s ? kv(`${ss.yr}`, `${s.w}-${s.l}, ${s.era != null ? s.era.toFixed(2) : '-'} ERA, ${Math.floor(s.outs / 3)} IP, ${s.so} K${s.sv ? `, ${s.sv} SV` : ''}`) : kv('Season', 'No record'),
      tba != null ? kv('TBA9-', String(tba), tba <= 100 ? 'cm-g' : 'cm-r') : null);
  }
  function batterCard(b, p) {
    const side = game.side[battingKey()];
    const i = side.order.findIndex((o) => o.player.id === b.id);
    const pos = side.order[i]?.pos || b.pos;
    const ss = seasonOf(b.id, 'bat');
    const s = ss?.s;
    const tbo = s ? tboPlus(s, ss.yr, s.level.includes('/') ? 'MLB' : s.level) : null;
    const meet = h2hWords(b.id, p.id);
    const mine = b.team?.user || p.team?.user;
    const t = teams[battingKey()];
    const r3 = (v) => (v == null ? '-' : v.toFixed(3).replace(/^0/, ''));
    return h('div', { class: 'mx-card', style: { borderTopColor: t.kitA } },
      h('div', { class: 'hd' }, 'At bat', h('span', {}, `${i >= 0 ? `${i + 1}. ` : ''}${pos}`)),
      h('div', { class: 'nm' }, pl(b), h('span', { class: 'hand' }, ` bats ${b.bats === 'S' ? 'both' : b.bats === 'L' ? 'left' : 'right'}`)),
      kv('Today', batLine(b.id) || 'First time up'),
      s ? kv(`${ss.yr}`, `${r3(s.avg)} / ${r3(s.obp)} / ${r3(s.slg)}, ${s.hr} HR, ${s.rbi} RBI`) : kv('Season', 'No record'),
      tbo != null ? kv('TBO9+', String(tbo), tbo >= 100 ? 'cm-g' : 'cm-r') : null,
      mine ? kv(`v ${p.last}`, meet || 'First meeting') : null);
  }

  // ---------- rendering ----------
  function render() {
    const bt = teams[battingKey()];
    root.style.setProperty('--bat-a', bt.kitA);
    // the second colour only when it reads on the first (Seattle's teal on navy does not): otherwise white or black
    root.style.setProperty('--bat-b', readableOn(bt.kitA, bt.kitB));
    // the fielding side (a strikeout is theirs) and the side in front (the end of the game flashes in the winners' colours)
    const ft = teams[battingKey() === 'home' ? 'away' : 'home'];
    root.style.setProperty('--fld-a', ft.kitA); root.style.setProperty('--fld-b', ft.kitB);
    const lead = shown.score.home === shown.score.away ? bt : shown.score.home > shown.score.away ? home : away;
    root.style.setProperty('--lead-a', lead.kitA); root.style.setProperty('--lead-b', lead.kitB);
    el.awayScore.textContent = shown.score.away;
    el.homeScore.textContent = shown.score.home;
    el.awayBar.classList.toggle('bat', battingKey() === 'away' && !finished());
    el.homeBar.classList.toggle('bat', battingKey() === 'home' && !finished());
    if (view === 'overview') renderOverview();
    else if (view === 'stats' || view === 'box') renderBody();
    // the sidebar only changes with the inning, half or the end of the game; rebuilding it on every pitch would swallow clicks at the fast speeds
    const sideKey = `${shown.inning}-${shown.half}-${finished()}-${playing}`;
    if (sideKey !== lastSideKey) { lastSideKey = sideKey; nav.refreshSide(); }
  }

  function renderOverview() {
    const o = el.ov;
    const half = shown.half === 'top' ? 'Top' : 'Bottom';
    o.state.textContent = finished() ? 'Final'
      : shown.outs >= 3 ? `End of the ${half.toLowerCase()} of the ${ordinal(shown.inning)}` : `${half} of the ${ordinal(shown.inning)}`;
    const nm = (n, id) => { const q = id && G.world?.players.get(id); return q ? pl(q, n) : n; };
    fill(o.awaySc, scorers.away.map(([n, i, id]) => h('div', {}, nm(n, id), h('span', { class: 'inn' }, i))));
    fill(o.homeSc, scorers.home.map(([n, i, id]) => h('div', {}, h('span', { class: 'inn' }, i), nm(n, id))));
    const pips = (n, max, cls) => Array.from({ length: max }, (_, i) => h('i', { class: `mx-pip ${i < n ? cls : ''}` }));
    // the count, big enough to follow at a glance
    fill(o.count,
      h('div', { class: 'mx-crow' }, h('span', { class: 'lbl' }, 'Balls'), h('span', { class: 'pips' }, pips(Math.min(shown.balls, 3), 3, 'b'))),
      h('div', { class: 'mx-crow' }, h('span', { class: 'lbl' }, 'Strikes'), h('span', { class: 'pips' }, pips(Math.min(shown.strikes, 2), 2, 's'))),
      h('div', { class: 'mx-crow' }, h('span', { class: 'lbl' }, 'Outs'), h('span', { class: 'pips' }, pips(Math.min(shown.outs, 3), 3, 'o'))));
    o.diamond.set(shown.bases.map(Boolean));
    const b = player(shown.batterId), p = player(shown.pitcherId);
    fill(o.matchup, pitcherCard(p), batterCard(b, p));
    const plan = game.side[userKey]?.planned && game.side[userKey].pen.find((x) => x.id === game.side[userKey].planned);
    o.pending.textContent = [pending.length ? `Before the next pitch: ${pending.join('; ')}` : '', plan ? `Next inning: ${plan.last} takes the mound` : ''].filter(Boolean).join('. ');
    const pHome = winChance(shown);
    fill(o.wp,
      h('i', { style: { width: `${(1 - pHome) * 100}%`, background: away.kitA, color: readable(away.kitA) } }, `${Math.round((1 - pHome) * 100)}%`),
      h('i', { style: { width: `${pHome * 100}%`, background: home.kitA, color: readable(home.kitA) } }, `${Math.round(pHome * 100)}%`));
    if (el.body.firstChild !== ov) fill(el.body, ov);
  }

  function renderBody() {
    if (view === 'overview') return renderOverview();
    const B = el.body;
    if (view === 'stats') {
      const sum = (key) => {
        const ids = sideIds(key), t = { PA: 0, AB: 0, H: 0, '2B': 0, '3B': 0, HR: 0, RBI: 0, BB: 0, HBP: 0, K: 0, SB: 0, CS: 0, GDP: 0, pitches: 0, pOuts: 0, pH: 0, pR: 0, pER: 0, pBB: 0, pK: 0, pHR: 0, BF: 0 };
        for (const [id, x] of game.stats) if (ids.has(id)) for (const k of Object.keys(t)) t[k] += x[k] || 0;
        t.runs = game.score[key];
        t.errors = game.side[key].errors;
        t.lob = game.side[key].lob;
        t.avg = t.AB ? t.H / t.AB : 0;
        const pa = t.AB + t.BB + t.HBP;
        t.obp = pa ? (t.H + t.BB + t.HBP) / pa : 0;
        t.slg = t.AB ? (t.H + t['2B'] + 2 * t['3B'] + 3 * t.HR) / t.AB : 0;
        return t;
      };
      const a = sum('away'), hm = sum('home');
      const r3 = (v) => v.toFixed(3).replace(/^0/, '');
      const rows = [['Runs', 'runs'], ['Hits', 'H'], ['Doubles', '2B'], ['Triples', '3B'], ['Home runs', 'HR'], ['RBI', 'RBI'], ['Walks', 'BB'], ['Strikeouts', 'K'], ['Stolen bases', 'SB'], ['Caught stealing', 'CS'], ['Grounded into double play', 'GDP'], ['Batting average', 'avg', r3], ['On-base percentage', 'obp', r3], ['Slugging', 'slg', r3], ['Pitches thrown', 'pitches'], ['Errors', 'errors'], ['Left on base', 'lob']];
      // on a phone the middle column holds one line, so the long names have short forms
      const SHORT = { 'Stolen bases': 'Steals', 'Caught stealing': 'Caught', 'Grounded into double play': 'Into DP', 'Batting average': 'Average', 'On-base percentage': 'On base', 'Pitches thrown': 'Pitches', 'Left on base': 'Left on' };
      const bar = (name, k, fmt = (v) => v) => {
        const tot = a[k] + hm[k] || 1;
        return h('div', { class: 'mx-st' },
          h('span', { class: 'v' }, fmt(a[k])), h('div', { class: 'bar a' }, h('i', { style: { width: `${(a[k] / tot) * 100}%`, background: away.kitA } })),
          h('span', { class: 'l' }, h('span', { class: 'adv-long' }, name), h('span', { class: 'adv-short' }, SHORT[name] || name)),
          h('div', { class: 'bar' }, h('i', { style: { width: `${(hm[k] / tot) * 100}%`, background: home.kitA } })), h('span', { class: 'v' }, fmt(hm[k])));
      };
      const ipOf = (o) => `${Math.floor(o / 3)}.${o % 3}`;
      const club = (t) => h('td', { class: 'l' }, h('b', {}, t.abbr));
      const tbl = (title, head, cells) => h('div', { class: 'mx-team-tbl' }, h('div', { class: 'cm-h' }, title),
        h('div', { class: 'cm-tblwrap' }, h('table', { class: 'cm-tbl' },
          h('thead', {}, h('tr', {}, ['', ...head].map((c, i) => h('th', { class: i ? '' : 'l' }, c)))),
          h('tbody', {}, h('tr', {}, club(away), cells(a).map((v) => h('td', {}, v))), h('tr', {}, club(home), cells(hm).map((v) => h('td', {}, v)))))));
      fill(B, h('div', { class: 'mx-stats' },
        h('div', { class: 'mx-st mx-st-head' }, h('span', { class: 'v' }, away.abbr), h('span'), h('span'), h('span'), h('span', { class: 'v' }, home.abbr)),
        rows.map(([n, k, f]) => bar(n, k, f))),
        tbl('Batting', ['PA', 'AB', 'R', 'H', '2B', '3B', 'HR', 'RBI', 'BB', 'K', 'SB', 'CS', 'AVG', 'OBP', 'SLG'], (t) => [t.PA, t.AB, t.runs, t.H, t['2B'], t['3B'], t.HR, t.RBI, t.BB, t.K, t.SB, t.CS, r3(t.avg), r3(t.obp), r3(t.slg)]),
        tbl('Pitching', ['IP', 'BF', 'H', 'R', 'ER', 'ERA', 'BB', 'K', 'HR', 'Pitches', 'Pitches/BF'], (t) => [ipOf(t.pOuts), t.BF, t.pH, t.pR, t.pER, t.pOuts ? ((t.pER * 27) / t.pOuts).toFixed(2) : '-', t.pBB, t.pK, t.pHR, t.pitches, t.BF ? (t.pitches / t.BF).toFixed(2) : '']));
    } else if (view === 'box') {
      fill(B, h('div', { class: 'mx-split' }, ['away', 'home'].map(boxTable)));
    } else if (view === 'pbp') {
      el.pbpList = h('ul', { class: 'mx-pbp' }, [...pbp].reverse().map(pbpItem));
      fill(B, el.pbpList);
    } else if (view === 'oppStats' || view === 'userStats') {
      fill(B, squadTable(view === 'oppStats' ? opp : user));
    } else if (view === 'scores') {
      fill(B, h('div', { class: 'cm-tblwrap' }, h('table', { class: 'cm-tbl' },
        h('thead', {}, h('tr', {}, h('th', { class: 'l' }, 'Away'), h('th', {}, ''), h('th', { class: 'l' }, 'Home'), h('th', {}, ''), h('th', { class: 'l' }, 'Status'))),
        h('tbody', {}, data.otherGames.map((g) => h('tr', {},
          h('td', { class: 'l' }, g[0]), h('td', { class: 'y' }, g[1]), h('td', { class: 'l' }, g[2]), h('td', { class: 'y' }, g[3]), h('td', { class: 'l cm-c' }, g[4])))))));
    } else if (view === 'table') {
      fill(B, h('div', { class: 'cm-h' }, data.standingsTitle || 'Division'), h('div', { class: 'cm-tblwrap' }, h('table', { class: 'cm-tbl' },
        h('thead', {}, h('tr', {}, ['', 'Club', 'W', 'L', 'Pct', 'GB', 'Last 10'].map((c, i) => h('th', { class: i === 1 ? 'l' : '' }, c)))),
        h('tbody', {}, data.standings.map((r, i) => h('tr', { class: r[0] === user.city ? 'now' : '' },
          h('td', { class: 'num' }, i + 1), h('td', { class: 'l' }, r[0]), r.slice(1).map((c) => h('td', {}, c))))))));
    }
  }

  function boxTable(key) {
    const t = teams[key], s = game.side[key];
    const pool = new Map([s.team.starter, ...s.team.bullpen].map((p) => [p.id, p]));
    const pitchers = [...s.used].map((id) => pool.get(id)).filter(Boolean); // in the order they came into the game
    return h('div', {},
      h('div', { class: 'cm-h', '--kit-a': t.kitA }, h('i'), `${t.full ?? `${t.city} ${t.name}`}`,
        h('span', { class: 'cm-s', style: { marginLeft: 'auto', fontWeight: 'normal', fontSize: '12px' } }, game.linescore[key].join(' '))),
      h('div', { class: 'cm-tblwrap' }, h('table', { class: 'cm-tbl' },
        h('thead', {}, h('tr', {}, ['', 'Batting', 'Pos', 'AB', 'H', 'R', 'RBI', 'BB', 'K'].map((c, i) => h('th', { class: i === 1 || i === 2 ? 'l' : '' }, c)))),
        h('tbody', {}, s.order.map((o, i) => {
          const x = L(o.player.id) || {};
          return h('tr', { class: battingKey() === key && o.player.id === shown.batterId && shown.outs < 3 ? 'now' : '' },
            h('td', { class: 'num' }, i + 1), h('td', { class: 'l' }, pl(o.player)), h('td', { class: 'l' }, o.pos),
            [x.AB, x.H, x.R, x.RBI, x.BB, x.K].map((v) => h('td', {}, v ?? 0)));
        })))),
      h('div', { class: 'cm-tblwrap' }, h('table', { class: 'cm-tbl' },
        h('thead', {}, h('tr', {}, ['Pitching', 'IP', 'H', 'R', 'ER', 'ERA', 'BB', 'K', 'HR', 'Pitches'].map((c, i) => h('th', { class: i ? '' : 'l' }, c)))),
        h('tbody', {}, pitchers.map((p) => {
          const x = L(p.id) || {};
          return h('tr', {}, h('td', { class: 'l' }, pl(p)), h('td', {}, ip(x.pOuts || 0)), [x.pH, x.pR, x.pER].map((v) => h('td', {}, v ?? 0)), h('td', {}, x.pOuts ? (((x.pER || 0) * 27) / x.pOuts).toFixed(2) : '-'), [x.pBB, x.pK, x.pHR, x.pitches].map((v) => h('td', {}, v ?? 0)));
        })))));
  }

  function squadTable(t) {
    return h('div', { class: 'cm-tblwrap' }, h('table', { class: 'cm-tbl' },
      h('thead', {}, h('tr', {}, ['', 'Player', 'Pos', 'B', 'AVG', 'OBP', 'SLG', 'HR', 'Today', 'Con', 'Pow', 'Eye', 'Spd', 'Def'].map((c, i) => h('th', { class: i === 1 || i === 2 || c === 'Today' ? 'l' : '' }, c)))),
      h('tbody', {}, [...t.lineup, ...t.bench].map((p, i) => h('tr', {},
        h('td', { class: 'num' }, i < 9 ? i + 1 : 'B'), h('td', { class: 'l' }, pl(p)), h('td', { class: 'l' }, p.pos), h('td', {}, p.bats),
        h('td', {}, p.avg), h('td', {}, p.obp), h('td', {}, p.slg), h('td', {}, p.hr), h('td', { class: 'l cm-y' }, batLine(p.id)),
        ['Contact', 'Power', 'Eye', 'Speed', 'Fielding'].map((k) => h('td', {}, p.r ? av(p, k) : '-')))))));
  }

  // ---------- playback ----------
  const pbpCls = (l) => (['run', 'hr', 'end'].includes(l.cls) ? 'run' : l.key ? 'key' : l.cls === 'setup' ? 'setup' : '');

  const pbpItem = (r) => h('li', {}, h('span', { class: 'when' }, r.when), h('span', { class: r.cls }, r.text));
  /** Add a line to the play by play; when the tab is open it goes on top without redrawing (the scroll stays put). */
  function addPbp(r) {
    pbp.push(r);
    if (view === 'pbp' && el.pbpList?.isConnected) el.pbpList.prepend(pbpItem(r));
  }

  function say(l) {
    el.ov.comm.className = `mx-comm ${l.cls === 'pitch' ? 'build' : l.cls || ''}`;
    el.commText.textContent = l.text;
    addPbp({ when: l.when, text: l.text, cls: pbpCls(l), setup: l.cls === 'setup' });
  }

  function applyBoard(l) {
    if (l.scorer) scorers[l.scorer.side].push([l.scorer.label, ordinal(l.scorer.inning), l.scorer.pid]);
    if (l.board) {
      for (const side of ['away', 'home']) if (l.board.score[side] !== shown.score[side]) flashScore(side);
      shown = l.board;
    }
    if (!game.commands.length) pending = [];
    render();
  }

  function flashScore(side) {
    const s = el[`${side}Score`];
    s.classList.add('scored');
    setTimeout(() => s.classList.remove('scored'), 2400);
  }

  const speed = () => SPEEDS[speedIdx][0];

  /** Ask the engine for more. In Highlights mode, run ahead to the end of the at-bat so we know what mattered. */
  /** With the bullpen in your hands, the game stops when the computer would have gone to the pen, and leaves the call to you. */
  let penWarned = new Set();
  function penCheck() {
    if (!G.settings?.manualBullpen || game.over || game.fieldingKey !== userKey || game.balls || game.strikes) return false;
    const s = game.side[userKey], p = s.outing.player;
    const key = `${p.id}-${Math.floor(s.outing.pc / 12)}-${game.outs === 0 ? game.inning : 0}`;
    if (penWarned.has(key) || !game.pullAdvice(userKey, game.outs === 0)) return false;
    penWarned.add(key);
    const why = s.outing.runs >= 3 ? `has given up ${s.outing.runs} runs` : `has thrown ${s.outing.pc} pitches`;
    playing = false;
    clearTimeout(timer);
    el.ov.comm.className = 'mx-comm big';
    el.commText.textContent = `Your pitching coach looks over: ${p.last} ${why}. Open Tactics to make a change, or press Resume to leave him in.`;
    nav.refreshSide();
    return true;
  }
  function refill() {
    if (game.over) return;
    if (penCheck()) return;
    if (!keyOnly) { lines.push(...narr.render(game.step())); return; }
    for (;;) {
      const ev = game.step();
      lines.push(...narr.render(ev));
      if (game.over || ev.some((e) => e.type !== 'pitch' && e.type !== 'paStart')) return;
    }
  }

  function tick() {
    clearTimeout(timer);
    if (!playing) return;
    // lines we are not going to show (filtered or silent) still move the board, in order
    for (;;) {
      if (!lines.length) refill();
      if (!lines.length) { if (!playing) return; finish(); return; }
      const l = lines[0];
      if (l.text && (keyOnly ? l.key : !l.keyIntro)) break;
      lines.shift();
      if (l.text && !l.keyIntro) addPbp({ when: l.when, text: l.text, cls: pbpCls(l), setup: l.cls === 'setup' });
      applyBoard(l);
    }
    const l = lines.shift();
    say(l);
    const hold = (l.hold ?? 1) * LINE_MS;
    timer = setTimeout(() => {
      applyBoard(l);
      timer = setTimeout(tick, Math.max(150, hold - BEAT_MS) / speed());
    }, BEAT_MS / speed());
  }

  /** Record the result once, the moment the game is over: whichever way you leave the screen. */
  function report() {
    if (!finished() || reported || !data.onFinish) return;
    reported = true;
    data.onFinish(game);
    nav.refreshSide();
  }

  function finish() {
    playing = false;
    report();
    render();
  }

  function setPlaying(on) {
    playing = on;
    clearTimeout(timer);
    if (on) tick();
    nav.refreshSide();
  }

  function skipToEnd() {
    // you cannot make the pitching changes when the rest of the game is played at once, so the assistant makes them
    // (otherwise a starter you were going to relieve would be left in to the end)
    if (game.manualPen?.[userKey]) game.setManualPen(userKey, false);
    for (let guard = 0; guard < 60 && !finished(); guard++) skipHalf();
  }

  function skipHalf() {
    clearTimeout(timer);
    if (!lines.length) refill();
    // the half-inning being played (or the next one, if we sit between halves)
    const target = lines[0]?.when;
    let last = null;
    while (target) {
      if (!lines.length) { if (game.over) break; lines.push(...narr.render(game.step())); continue; }
      const l = lines[0];
      if (l.when !== target) break; // the next half starts here
      lines.shift();
      if (l.text && !l.keyIntro) { addPbp({ when: l.when, text: l.text, cls: pbpCls(l), setup: l.cls === 'setup' }); last = l; }
      applyBoard(l);
    }
    if (last) {
      el.ov.comm.className = `mx-comm ${last.cls === 'pitch' ? 'build' : last.cls}`;
      el.commText.textContent = last.text;
    }
    playing = !finished();
    report();
    if (playing) timer = setTimeout(tick, LINE_MS / speed());
    render();
  }

  function newGame() {
    clearTimeout(timer);
    gameNo++;
    game = new Game({ away: engineTeams.away, home: engineTeams.home, seed: `${data.seed ?? 'demo'}-${gameNo}`, userSide: userKey, autoUser: true, extraRunner: data.extraRunner ?? true, env: data.env ?? null });
    game.setManualPen(userKey, !!G.settings?.manualBullpen);
    penWarned = new Set();
    const g = game;
    narr = new Narrator({
      seed: game.seed, players: P, teams, venue: data.venue.split(',')[0], weather: data.facts.weather, story: data.story,
      attendance: data.facts.attendance, year: G.season?.year,
      ctx: {
        fielder: (side, pos) => g.side[side].fielders[pos],
        order: (side) => g.side[side].order,
        today: (id) => g.stats.get(id),
        lob: (side) => g.side[side].lob,
        meet: (b, p) => h2hWords(b, p),
      },
    });
    lines = [];
    scorers = { away: [], home: [] };
    pbp = [];
    pending = [];
    shown = game.board();
    playing = true;
    render();
    timer = setTimeout(tick, 300);
  }

  const toEngineCmd = (cmd) => ({
    pitch: { type: 'pitch', playerId: cmd.player?.id }, visit: { type: 'visit' }, ibb: { type: 'ibb' },
    inf: { type: 'infield', mode: cmd.mode }, steal: { type: 'steal' }, bunt: { type: 'bunt' }, hitRun: { type: 'hitRun' },
    def: { type: 'def', inId: cmd.inId, outId: cmd.outId }, ph: { type: 'ph', playerId: cmd.playerId },
  })[cmd.id];

  const tactics = () => {
    const s = game.side[userKey];
    const club = {
      city: user.city,
      get bullpen() { return s.pen; },
      get bench() { return s.bench; },
      get lineup() { return s.order.map((o) => { o.player.pos = o.pos; return o.player; }); },
    };
    const queue = pending.map((t) => ({ text: t }));
    return tacticsScreen({
      club, queue,
      getState: () => ({ pitchCount: s.outing.pc, bases: game.bases.map(Boolean), outs: game.outs }),
      getBlock: () => (game.pitchChangeWaits(userKey) ? null : game.pitchChangeBlock(userKey, { midOk: true })),
      getWait: () => (game.pitchChangeWaits(userKey) ? game.pitchChangeBlock(userKey, { midOk: true }) : null),
      getMid: () => !!(game.balls || game.strikes) && game.fieldingKey === userKey,
      getManual: () => !!G.settings?.manualBullpen,
      setManual: (on) => { G.settings.manualBullpen = on; game.setManualPen(userKey, on); },
      getPitcher: () => game.fielding.pitcher,
      getPitched: () => {
        const arms = (key) => { const t = game.side[key]; return [t.team.starter, ...t.team.bullpen].filter((x) => t.used.has(x.id)).map((x) => ({ p: x, now: t.pitcher === x, L: game.stats.get(x.id) || {} })); };
        const other = userKey === 'home' ? 'away' : 'home';
        return { mine: arms(userKey), theirs: arms(other), theirCity: game.side[other].team.city ?? game.side[other].team.name ?? 'Opponent' };
      },
      getBatter: () => game.batter,
      userBatting: () => game.battingKey === userKey,
      onQueue: (cmd) => {
        const c = toEngineCmd(cmd);
        if (!c) return;
        game.command(userKey, c);
        pending.push(cmd.text);
        queue.push({ text: cmd.text });
      },
    });
  };

  newGame();
  // Result Only: play the whole game at once and open on the box score
  if (data.instant) {
    clearTimeout(timer);
    skipToEnd();
    view = 'box'; top.select('box'); renderBody();
  }

  const goOn = () => { clearTimeout(timer); finish(); data.onDone(); };
  return {
    el: root,
    bg: 'match',
    // a season game: once it starts there is no going back, only Continue when it is over
    locked: !!data.onDone,
    canContinue: () => finished(),
    onContinue: () => { if (finished()) goOn(); },
    /** The Space bar during the game: pause and resume; once it is over, Continue. */
    space: () => { if (finished()) { if (data.onDone) goOn(); } else setPlaying(!playing); return true; },
    /** Result Only on a match already under way: play the rest at once and show the box score. */
    toEnd: () => { clearTimeout(timer); skipToEnd(); view = 'box'; top.select('box'); renderBody(); },
    dateBox: () => [h('span', { class: 'big' }, finished() ? 'F' : shown.inning), '\u00a0', finished() ? 'Final' : shown.half === 'top' ? 'Top' : 'Bottom'],
    side: () => [
      finished()
        ? (data.onDone ? { label: 'Continue', hl: true, onClick: goOn } : { label: 'New Game', hl: true, onClick: newGame })
        : { label: playing ? 'Pause Match' : 'Resume Match', hl: !playing, onClick: () => setPlaying(!playing) },
      { label: `${user.city} Tactics`, hl: true, disabled: finished(), onClick: () => nav.push(tactics()) },
      { label: `${opp.city} Lineup`, onClick: () => { view = 'oppStats'; top.select(''); bottom.select('oppStats'); renderBody(); } },
      { label: 'Commentary Speed', sub: SPEEDS[speedIdx][1], onClick: () => { speedIdx = (speedIdx + 1) % SPEEDS.length; if (G.settings) G.settings.commSpeed = speedIdx; nav.refreshSide(); } },
      { label: 'Highlights', sub: keyOnly ? 'On' : 'Off', on: keyOnly, onClick: () => { keyOnly = !keyOnly; nav.refreshSide(); } },
      { label: 'Skip Half Inning', disabled: finished(), onClick: skipHalf },
      data.onFinish ? { label: 'Skip to End', disabled: finished(), onClick: skipToEnd } : null,
    ],
    // CM pauses the match when you leave the match screen; it carries on when you come back
    onHide: () => { report(); resumeOnShow = playing && !finished(); if (playing) { playing = false; clearTimeout(timer); } },
    onShow: () => {
      if (view === 'overview') fill(el.body, ov);
      render();
      if (resumeOnShow) { resumeOnShow = false; playing = true; timer = setTimeout(tick, BEAT_MS / speed()); }
    },
  };
}

/** Rough home win chance from score, inning and outs. Replaced by a proper win expectancy table later. */
function winChance(s) {
  const diff = s.score.home - s.score.away;
  const done = (s.inning - 1) * 2 + (s.half === 'bottom' ? 1 : 0) + Math.min(s.outs, 3) / 3;
  const weight = 0.35 + (Math.min(done, 18) / 18) * 1.4;
  return 1 / (1 + Math.exp(-diff * weight - 0.08));
}

function diamond() {
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 40 37');
  svg.setAttribute('class', 'mx-diamond');
  const base = (x, y) => {
    const r = document.createElementNS(NS, 'rect');
    r.setAttribute('x', x); r.setAttribute('y', y); r.setAttribute('width', 9); r.setAttribute('height', 9);
    r.setAttribute('transform', `rotate(45 ${x + 4.5} ${y + 4.5})`);
    r.setAttribute('class', 'mx-base');
    svg.append(r);
    return r;
  };
  const path = document.createElementNS(NS, 'path');
  path.setAttribute('d', 'M20 34 L31.5 20.5 L20 8.5 L8.5 20.5 Z');
  path.setAttribute('class', 'mx-paths');
  svg.append(path);
  const plate = document.createElementNS(NS, 'path');
  plate.setAttribute('d', 'M17.5 31 h5 v2 l-2.5 2.5 l-2.5 -2.5 z');
  plate.setAttribute('class', 'mx-plate');
  svg.append(plate);
  const b1 = base(27, 16), b2 = base(15.5, 4), b3 = base(4, 16);
  return {
    svg,
    set([f, s, t]) {
      b1.classList.toggle('on', f); b2.classList.toggle('on', s); b3.classList.toggle('on', t);
      svg.setAttribute('aria-label', `Runners: ${[f && 'first', s && 'second', t && 'third'].filter(Boolean).join(', ') || 'none'}`);
    },
  };
}
