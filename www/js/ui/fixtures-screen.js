// Fixtures and tables: your schedule and results, every score, the standings, the wild card race,
// league leaders and the postseason.
import { lastRecord } from '../season/history.js';
import { dataCredit } from './credit.js';
import { h, fill, cmTabs } from './dom.js';
import { clubMenu } from './menu.js';
import { plink, select } from './club-ui.js';
import { isPitcher, rate3, fix, ipText } from '../data/world.js';
import { game } from '../state.js';
import { dayNo, fromDayNo, monthName } from '../season/calendar.js';
import { divisions, wildCard, leagues, pct, gb } from '../season/standings.js';
import { ROUND_NAME } from '../season/postseason.js';
import { teamTotals } from '../season/teamstats.js';
import { sortTable } from './table.js';
import { boxView } from './box-view.js';
import { teamOdds, chanceText } from '../season/odds.js';
import { awardOdds } from '../season/awards.js';
import { crowdLine, clubAtmosphere } from '../season/crowd.js';

const LEAGUE_TABS = ['standings', 'wc', 'odds', 'teams', 'leaders', 'post'];

/** Your fixtures and the day's scores; with a league tab as `start`, the League screen instead. */
export function fixturesScreen(start = 'fixtures') {
  let tab = start;
  const isLeague = LEAGUE_TABS.includes(start);
  const body = h('div', { class: 'cm-panel grow' });
  const tabs = cmTabs(isLeague
    ? [{ id: 'standings', label: 'Standings' }, { id: 'wc', label: 'Wild Card' }, { id: 'odds', label: 'Odds' }, { id: 'teams', label: 'Team Stats' }, { id: 'leaders', label: 'Leaders' }, { id: 'post', label: 'Postseason' }]
    : [{ id: 'fixtures', label: 'Fixtures' }, { id: 'scores', label: 'Scores' }],
  tab, (id) => { tab = id; render(); });
  const W = game.world;
  const city = (id) => W.clubs.get(id)?.city ?? id;
  const fullClub = (id) => { const c = W.clubs.get(id); return c ? (c.full ?? `${c.city} ${c.name}`) : id; };
  let month = null, scoreDay = null, leaderLeague = 'MLB', viewing = null;

  function render() {
    if (!game.season) {
      if (tab === 'standings') { lastYear(); return; }
      fill(body, h('p', { class: 'cm-sub cm-pad' }, isLeague ? `The ${game.year} tables start when the season does. The Standings tab shows how ${game.year - 1} finished.` : 'The schedule is made when Spring Training opens.'));
      return;
    }
    if (viewing) { scorecard(viewing); return; }
    body.classList.toggle('blk-all', tab === 'teams' || tab === 'post');
    ({ fixtures, scores, standings, wc, odds, teams, leaders, post })[tab]();
  }

  /** The final scorecard of one finished game. */
  function scorecard(g) {
    const pn = (id) => { const p = W.players.get(id); return p ? plink(p, `${p.first[0]}. ${p.last}`) : ''; };
    const [a, hm] = g.s;
    const rnd = g.post ? ROUND_NAME[g.series?.split('-')[0]] : '';
    fill(body,
      h('div', { class: 'cm-pad btnrow' }, h('button', { class: 'cm-btn', onClick: () => { viewing = null; render(); } }, '◀ Back')),
      h('div', { class: 'cm-h' }, `${fullClub(g.away)} ${a}, ${fullClub(g.home)} ${hm}${g.inn > 9 ? ` (${g.inn} innings)` : ''}`),
      h('p', { class: 'cm-sub cm-pad' }, `${fromDayNo(g.d).toDateString()}${rnd ? `, ${rnd}` : ''}. W: `, pn(g.w), '. L: ', pn(g.l), g.sv ? ['. S: ', pn(g.sv)] : null, '.'),
      g.att ? h('p', { class: 'cm-pad' }, crowdLine(g)) : null,
      g.box ? boxView(g.box) : h('p', { class: 'cm-sub cm-pad' }, 'Full scorecards are kept for your games and the postseason. This one keeps the final score and the pitching decisions.'));
  }
  const open = (g) => { viewing = g; render(); };

  /** In the winter: how last season finished. */
  function lastYear() {
    const byDiv = new Map();
    for (const c of W.mlb) { if (!byDiv.has(c.division)) byDiv.set(c.division, []); byDiv.get(c.division).push(c); }
    const order = (d) => ['East', 'Central', 'West'].findIndex((x) => d.endsWith(x));
    const cols = [...new Set([...byDiv.keys()].map((d) => d.split(' ').slice(0, 2).join(' ')))].sort().map((lg) => [...byDiv.keys()].filter((d) => d.startsWith(lg)).sort((x, y) => order(x) - order(y)));
    const block = (div) => {
      const list = byDiv.get(div).filter((c) => lastRecord(c)).sort((a, b) => lastRecord(b)[0] - lastRecord(a)[0]);
      const lead = list[0] ? lastRecord(list[0]) : null;
      return [h('div', { class: 'cm-h' }, `${div}, ${game.year - 1} final`), h('div', { class: 'cm-tblwrap' }, h('table', { class: 'cm-tbl' },
        h('thead', {}, h('tr', {}, ['', 'Club', 'W', 'L', 'Pct', 'GB'].map((c, i) => h('th', { class: i === 1 ? 'l' : '' }, c)))),
        h('tbody', {}, list.map((c, i) => {
          const [w, l] = lastRecord(c);
          const b = ((lead[0] - w) + (l - lead[1])) / 2;
          return h('tr', { class: c.org === game.orgId ? 'now' : '' }, h('td', { class: 'num' }, i + 1), h('td', { class: 'l' }, `${c.full ?? `${c.city} ${c.name}`}`),
            h('td', { class: 'y' }, w), h('td', { class: 'y' }, l), h('td', {}, (w / (w + l)).toFixed(3).replace(/^0/, '')), h('td', {}, b ? b.toFixed(1) : '-'));
        }))))];
    };
    fill(body, h('div', { class: 'st-grid' }, cols.map((divs) => h('div', { class: 'st-col' }, divs.map(block)))));
  }

  /** Every club's batting and pitching this season. */
  function teams() {
    const T = teamTotals(game.season.year);
    const rows = W.mlb.map((c) => ({ c, r: game.season.records.get(c.id), ...(T.get(c.id) || {}) })).filter((x) => x.bat);
    const g = (x) => Math.max(1, x.r.w + x.r.l);
    fill(body, rows.length ? sortTable({
      rows, sort: 'rpg',
      rowClass: (x) => (x.c.org === game.orgId ? 'now' : ''),
      cols: [
        { key: 'club', label: 'Club', left: true, get: (x) => `${x.c.full ?? `${x.c.city} ${x.c.name}`}` },
        { key: 'wl', label: 'W-L', get: (x) => pct(x.r), show: (x) => `${x.r.w}-${x.r.l}` },
        { key: 'rpg', label: 'R/G', get: (x) => x.r.rs / g(x), show: (x) => (x.r.rs / g(x)).toFixed(2), title: 'Runs scored per game' },
        { key: 'avg', label: 'AVG', get: (x) => x.bat.avg, show: (x) => rate3(x.bat.avg) },
        { key: 'obp', label: 'OBP', get: (x) => x.bat.obp, show: (x) => rate3(x.bat.obp) },
        { key: 'slg', label: 'SLG', get: (x) => x.bat.slg, show: (x) => rate3(x.bat.slg) },
        { key: 'hr', label: 'HR', get: (x) => x.bat.hr }, { key: 'sb', label: 'SB', get: (x) => x.bat.sb },
        { key: 'rapg', label: 'RA/G', get: (x) => x.r.ra / g(x), show: (x) => (x.r.ra / g(x)).toFixed(2), asc: true, title: 'Runs allowed per game' },
        { key: 'era', label: 'ERA', get: (x) => x.pit.era, show: (x) => fix(x.pit.era), asc: true },
        { key: 'whip', label: 'WHIP', get: (x) => x.pit.whip, show: (x) => fix(x.pit.whip), asc: true },
        { key: 'k9', label: 'K/9', get: (x) => x.pit.k9, show: (x) => fix(x.pit.k9, 1) },
        { key: 'sv', label: 'SV', get: (x) => x.pit.sv },
      ],
    }).el : h('p', { class: 'cm-sub cm-pad cm-empty' }, 'No games played yet.'));
  }

  function fixtures() {
    const mine = game.season.games.filter((g) => g.level === 'MLB' && (g.home === game.orgId || g.away === game.orgId)).sort((a, b) => a.d - b.d);
    const months = [...new Set(mine.filter((g) => !g.post).map((g) => fromDayNo(g.d).getMonth()))];
    if (month == null) month = months.includes(game.date.getMonth()) ? game.date.getMonth() : months[0];
    let w = 0, l = 0;
    const recAfter = new Map();
    for (const g of mine) { if (!g.s || g.post) continue; if ((g.home === game.orgId) === (g.s[1] > g.s[0])) w++; else l++; recAfter.set(g, `${w}-${l}`); }
    const shown = mine.filter((g) => !g.post && fromDayNo(g.d).getMonth() === month);
    const name = (id) => { const p = W.players.get(id); return p ? plink(p, `${p.first[0]}. ${p.last}`) : ''; };
    const at = clubAtmosphere(game.orgId);
    const crowd = at.games
      ? `Around the club: ${at.words}. ${at.avg.toLocaleString('en-GB')} a game at home so far, ${Math.round(at.avg / at.cap * 100)}% of a ${at.cap.toLocaleString('en-GB')}-seat ground.`
      : 'Around the club: the fans are waiting for the first home game.';
    if (month === 'post') { postGames(); return; }
    fill(body,
      h('div', { class: 'cm-pad btnrow', style: { justifyContent: 'center' } }, months.map((m) => h('button', { class: 'cm-btn', 'aria-pressed': String(m === month), onClick: () => { month = m; render(); } }, monthName(new Date(2000, m, 1)))),
        h('button', { class: 'cm-btn', 'aria-pressed': 'false', onClick: () => { month = 'post'; render(); } }, 'Postseason')),
      h('p', { class: 'cm-pad cm-y' }, crowd),
      h('div', { class: 'cm-tblwrap' }, h('table', { class: 'cm-tbl' },
        h('thead', {}, h('tr', {}, ['Date', '', 'Opponent', 'Result', 'Win', 'Loss', 'Save', 'Crowd', 'Record'].map((c, i) => h('th', { class: i !== 3 && i !== 7 && i !== 8 ? 'l' : '' }, c)))),
        h('tbody', {}, shown.map((g) => {
          const home = g.home === game.orgId;
          const opp = home ? g.away : g.home;
          let res = '', cls = '';
          if (g.s) {
            const [us, them] = home ? [g.s[1], g.s[0]] : [g.s[0], g.s[1]];
            res = `${us > them ? 'W' : 'L'} ${us}-${them}${g.inn > 9 ? ` (${g.inn})` : ''}`; cls = us > them ? 'cm-g' : 'cm-r';
          }
          return h('tr', { class: g.d === dayNo(game.date) ? 'now' : '', style: g.s ? { cursor: 'pointer' } : {}, title: g.s ? 'Open the final scorecard' : '', onClick: g.s ? () => open(g) : null },
            h('td', { class: 'l' }, fromDayNo(g.d).toDateString().slice(0, 10)), h('td', { class: 'l cm-s' }, home ? 'v' : 'at'), h('td', { class: 'l' }, city(opp)),
            h('td', { class: cls }, res),
            h('td', { class: 'l' }, g.s ? name(g.w) : ''), h('td', { class: 'l' }, g.s ? name(g.l) : ''), h('td', { class: 'l' }, g.s && g.sv ? name(g.sv) : ''),
            h('td', { class: 'cm-s' }, g.att ? g.att.toLocaleString('en-GB') : ''),
            h('td', {}, recAfter.get(g) || ''));
        })))));
  }

  /** Every postseason game, whoever played it, with the rounds still to come marked as such. */
  function postGames() {
    const P = game.season.post;
    const months = [...new Set(game.season.games.filter((g) => g.level === 'MLB' && !g.post).map((g) => fromDayNo(g.d).getMonth()))];
    const name = (id) => { const p = W.players.get(id); return p ? plink(p, `${p.first[0]}. ${p.last}`) : ''; };
    const rounds = ['WC', 'DS', 'LCS', 'WS'];
    const all = game.season.games.filter((g) => g.post).sort((a, b) => a.d - b.d || a.id.localeCompare(b.id));
    const sections = rounds.map((r) => {
      const gs = all.filter((g) => g.series?.startsWith(`${r}-`));
      const sr = P?.series.filter((s) => s.round === r) || [];
      return h('div', {}, h('div', { class: 'cm-h' }, ROUND_NAME[r]),
        gs.length ? h('div', { class: 'cm-tblwrap' }, h('table', { class: 'cm-tbl' }, h('tbody', {}, gs.map((g) => {
          const s = sr.find((x) => x.id === g.series);
          const no = gs.filter((x) => x.series === g.series).indexOf(g) + 1;
          return h('tr', { class: g.home === game.orgId || g.away === game.orgId ? 'now' : '', style: g.s ? { cursor: 'pointer' } : {}, onClick: g.s ? () => open(g) : null },
            h('td', { class: 'l' }, fromDayNo(g.d).toDateString().slice(0, 10)), h('td', { class: 'l cm-s' }, `Game ${no}`),
            h('td', { class: 'l' }, city(g.away)), h('td', { class: 'y' }, g.s ? g.s[0] : ''), h('td', { class: 'l' }, city(g.home)), h('td', { class: 'y' }, g.s ? g.s[1] : ''),
            h('td', { class: 'l cm-s' }, g.s ? (g.inn > 9 ? `Final (${g.inn})` : 'Final') : 'To play'),
            h('td', { class: 'l' }, g.s ? name(g.w) : ''), h('td', { class: 'cm-s' }, g.att ? g.att.toLocaleString('en-GB') : ''));
        })))) : h('p', { class: 'cm-sub cm-pad' }, P?.series.some((s) => s.round === r) ? 'No games played yet.' : 'To be decided.'));
    });
    fill(body,
      h('div', { class: 'cm-pad btnrow', style: { justifyContent: 'center' } }, months.map((m) => h('button', { class: 'cm-btn', 'aria-pressed': 'false', onClick: () => { month = m; render(); } }, monthName(new Date(2000, m, 1)))),
        h('button', { class: 'cm-btn', 'aria-pressed': 'true' }, 'Postseason')),
      sections);
  }

  function scores() {
    const played = game.season.games.filter((g) => g.level === 'MLB' && g.s).map((g) => g.d);
    if (scoreDay == null) scoreDay = played.length ? Math.max(...played) : dayNo(game.date);
    const day = game.season.byDay.get(scoreDay) || [];
    const mlb = day.filter((g) => g.level === 'MLB');
    const affs = new Set(Object.values(W.orgs.get(game.orgId).affiliates).map((t) => t.id));
    const farm = day.filter((g) => g.level !== 'MLB' && (affs.has(g.home) || affs.has(g.away)));
    const row = (g) => h('tr', { style: g.s && g.level === 'MLB' ? { cursor: 'pointer' } : {}, onClick: g.s && g.level === 'MLB' ? () => open(g) : null }, h('td', { class: 'l' }, g.level === 'MLB' ? '' : g.level), h('td', { class: 'l' }, city(g.away)), h('td', { class: 'y' }, g.s ? g.s[0] : ''),
      h('td', { class: 'l' }, city(g.home)), h('td', { class: 'y' }, g.s ? g.s[1] : ''), h('td', { class: 'l cm-s' }, g.s ? (g.inn > 9 ? `Final (${g.inn})` : 'Final') : 'To play'));
    fill(body,
      h('div', { class: 'cm-pad btnrow', style: { justifyContent: 'center', alignItems: 'center' } },
        h('button', { class: 'cm-btn', onClick: () => { scoreDay--; render(); } }, '◀ Day before'),
        h('b', { class: 'cm-y' }, fromDayNo(scoreDay).toDateString()),
        h('button', { class: 'cm-btn', onClick: () => { scoreDay++; render(); } }, 'Day after ▶')),
      h('div', { class: 'cm-tblwrap' }, h('table', { class: 'cm-tbl' }, h('tbody', {}, mlb.length ? mlb.map(row) : h('tr', {}, h('td', { class: 'l cm-s' }, 'No major league games.'))))),
      farm.length ? [h('div', { class: 'cm-h' }, 'Your farm clubs'), h('div', { class: 'cm-tblwrap' }, h('table', { class: 'cm-tbl' }, h('tbody', {}, farm.map(row))))] : null);
  }

  function table(ids, title, base, cut = 0) {
    const R = game.season.records;
    const lead = base ?? R.get(ids[0]);
    return [h('div', { class: 'cm-h' }, title), h('div', { class: 'cm-tblwrap' }, h('table', { class: 'cm-tbl' },
      h('thead', {}, h('tr', {}, ['', 'Club', 'W', 'L', 'Pct', 'GB', 'Home', 'Away', 'Div', 'RS', 'RA', 'Diff', 'Last 10'].map((c, i) => h('th', { class: i === 1 ? 'l' : '' }, c)))),
      h('tbody', {}, ids.map((id, i) => {
        const r = R.get(id);
        const b = gb(lead, r);
        const l10 = [...r.last];
        return h('tr', { class: `${id === game.orgId ? 'now' : ''}${cut && i === cut - 1 ? ' cut' : ''}` },
          h('td', { class: 'num' }, i + 1), h('td', { class: 'l' }, fullClub(id)), h('td', { class: 'y' }, r.w), h('td', { class: 'y' }, r.l),
          h('td', {}, pct(r).toFixed(3).replace(/^0/, '')), h('td', {}, b > 0 ? b.toFixed(1) : b < 0 ? `+${(-b).toFixed(1)}` : '-'),
          h('td', {}, `${r.hw}-${r.hl}`), h('td', {}, `${r.aw}-${r.al}`), h('td', {}, `${r.dw}-${r.dl}`), h('td', {}, r.rs), h('td', {}, r.ra),
          h('td', { class: r.rs - r.ra >= 0 ? 'cm-g' : 'cm-r' }, r.rs - r.ra > 0 ? `+${r.rs - r.ra}` : r.rs - r.ra),
          h('td', {}, `${l10.filter((x) => x === 'W').length}-${l10.filter((x) => x === 'L').length}`));
      }))))];
  }

  function standings() {
    const order = (d) => ['East', 'Central', 'West'].findIndex((x) => d.endsWith(x));
    fill(body, h('div', { class: 'st-grid' }, leagues().map((lg) => h('div', { class: 'st-col' }, [...divisions(lg).entries()].sort((x, y) => order(x[0]) - order(y[0])).map(([div, ids]) => table(ids, div)), (() => { const w = wildCard(lg); return w.length >= 3 ? table(w.slice(0, 5), `${lg} Wild Card (top three qualify)`, game.season.records.get(w[2]), 3) : null; })()))));
  }

  function odds() {
    const o = teamOdds(400);
    if (!o) { fill(body, h('p', { class: 'cm-sub cm-pad' }, 'The odds close when the regular season ends. The Postseason tab has the bracket.')); return; }
    const hot = (x) => (x >= 0.9 ? 'cm-g' : x < 0.05 ? 'cm-s' : '');
    const awards = awardOdds(60);
    fill(body,
      h('div', { class: 'cm-pad cm-s' }, 'Each club\'s rest of the schedule is played out 400 times, using its roster and how it has played so far. Proj. W is the average final win total; Bye is a top-two seed in its league.'),
      h('div', { class: 'cm-tblwrap' }, h('table', { class: 'cm-tbl' },
        h('thead', {}, h('tr', {}, [['', 0], ['Club', 1], ['W-L', 0], ['Proj. W', 0], ['Division', 0], ['Playoffs', 0], ['Bye', 0], ['World Series', 0]].map(([c, l]) => h('th', { class: l ? 'l' : '' }, c)))),
        h('tbody', {}, o.map((x, i) => h('tr', { class: x.id === game.orgId ? 'now' : '' },
          h('td', { class: 'num' }, i + 1), h('td', { class: 'l' }, fullClub(x.id)), h('td', {}, `${x.now.w}-${x.now.l}`), h('td', { class: 'y' }, x.wins.toFixed(1)),
          h('td', { class: hot(x.div) }, chanceText(x.div)), h('td', { class: hot(x.playoff) }, chanceText(x.playoff)), h('td', {}, chanceText(x.bye)), h('td', { class: 'y' }, chanceText(x.title))))))),
      awards.length ? [h('div', { class: 'cm-h' }, 'Award races: the chance each player wins if the vote were held today'),
        awards.map((a) => h('div', { class: 'cm-tblwrap' }, h('table', { class: 'cm-tbl' },
          h('thead', {}, h('tr', {}, [`${a.L} ${a.award}`, 'Chance', 'Season'].map((c, i) => h('th', { class: i === 0 || i === 2 ? 'l' : '' }, c)))),
          h('tbody', {}, a.top.map((t) => h('tr', {}, h('td', { class: 'l' }, plink(t.p)), h('td', { class: 'y' }, chanceText(t.chance)), h('td', { class: 'l cm-s' }, t.line)))))))] : null);
  }

  function wc() {
    fill(body, leagues().map((lg) => {
      const ids = wildCard(lg);
      return h('div', { class: 'st-col wide' }, table(ids, `${lg} wild card (top three qualify)`, game.season.records.get(ids[2]), 3));
    }));
  }

  function leaders() {
    const yr = game.season.year;
    const games = Math.max(1, ...[...game.season.records.values()].map((r) => r.w + r.l));
    const players = W.list.filter((p) => p.orgId && (leaderLeague === 'MLB' || W.orgs.get(p.orgId)?.club.league === leaderLeague));
    const sum = (p, kind) => {
      const rows = p.hist?.[kind]?.filter((r) => r[0] === yr && r[1] === 'MLB');
      if (!rows?.length) return null;
      const t = rows[0].slice(3).map(() => 0);
      for (const r of rows) r.slice(3).forEach((v, i) => { t[i] += v; });
      return t;
    };
    const bats = [], arms = [];
    for (const p of players) {
      const b = sum(p, 'bat');
      if (b && b[1] > 0) {
        const [g, pa, ab, hh, b2, b3, hr, r, rbi, bb, so, sb, cs, hbp, sf] = b;
        const obp = (hh + bb + hbp) / Math.max(1, ab + bb + hbp + sf), slg = (hh + b2 + 2 * b3 + 3 * hr) / Math.max(1, ab);
        bats.push({ p, pa, avg: hh / Math.max(1, ab), hr, rbi, sb, obp, ops: obp + slg, q: pa >= games * 3.1 });
      }
      const t = sum(p, 'pit');
      if (t && t[2] > 0 && isPitcher(p)) {
        const [g, gs, outs, bf, hh, er, hr, bb, so, w, l, sv] = t;
        arms.push({ p, era: (er * 27) / outs, w, so, sv, whip: ((hh + bb) * 3) / outs, outs, q: outs >= games * 3 });
      }
    }
    const top = (list, key, n, asc = false, qual = false) => list.filter((x) => !qual || x.q).sort((a, b) => (asc ? a[key] - b[key] : b[key] - a[key])).slice(0, n);
    const box = (title, list, fmt) => h('div', { class: 'leader' }, h('div', { class: 'cm-h' }, title),
      h('table', { class: 'cm-tbl' }, h('colgroup', {}, h('col', { class: 'c-n' }), h('col'), h('col', { class: 'c-c' }), h('col', { class: 'c-v' })), h('tbody', {}, list.map((x, i) => h('tr', { class: x.p.orgId === game.orgId ? 'now' : '' },
        h('td', { class: 'num' }, i + 1), h('td', { class: 'l' }, plink(x.p, `${x.p.first[0]}. ${x.p.last}`)), h('td', { class: 'l cm-s' }, game.world.orgs.get(x.p.orgId)?.club.abbr || ''), h('td', { class: 'y' }, fmt(x)))))));
    fill(body,
      h('div', { class: 'cm-pad', style: { textAlign: 'center' } }, select([['MLB', 'Both leagues'], ...leagues().map((l) => [l, l])], leaderLeague, (v) => { leaderLeague = v; render(); })),
      h('div', { class: 'leaders' },
        box('Batting average', top(bats, 'avg', 10, false, true), (x) => rate3(x.avg)),
        box('Home runs', top(bats, 'hr', 10), (x) => x.hr),
        box('Runs batted in', top(bats, 'rbi', 10), (x) => x.rbi),
        box('OPS', top(bats, 'ops', 10, false, true), (x) => rate3(x.ops)),
        box('Stolen bases', top(bats, 'sb', 10), (x) => x.sb),
        box('Earned run average', top(arms, 'era', 10, true, true), (x) => fix(x.era)),
        box('Wins', top(arms, 'w', 10), (x) => x.w),
        box('Strikeouts', top(arms, 'so', 10), (x) => x.so),
        box('Saves', top(arms, 'sv', 10), (x) => x.sv),
        box('WHIP', top(arms, 'whip', 10, true, true), (x) => fix(x.whip))),
      h('p', { class: 'cm-sub cm-pad' }, `Rate leaders need 3.1 plate appearances or 1 inning per team game (${games} played).`));
  }

  function post() {
    const P = game.season.post;
    if (!P) { fill(body, h('p', { class: 'cm-sub cm-pad' }, 'The postseason starts after the last day of the regular season. Twelve clubs qualify: three division winners and three wild cards in each league.')); return; }
    const rounds = ['WC', 'DS', 'LCS', 'WS'];
    fill(body, rounds.filter((r) => P.series.some((s) => s.round === r)).map((r) => [
      h('div', { class: 'cm-h' }, ROUND_NAME[r]),
      h('table', { class: 'cm-tbl info' }, h('tbody', {}, P.series.filter((s) => s.round === r).map((s) => h('tr', { class: s.hi === game.orgId || s.lo === game.orgId ? 'now' : '' },
        h('td', { class: 'l' }, city(s.hi)), h('td', { class: 'y' }, s.wins.hi), h('td', { class: 'y' }, s.wins.lo), h('td', { class: 'l' }, city(s.lo)),
        h('td', { class: 'l cm-c' }, s.winner ? `${city(s.winner)} win` : 'In progress'),
        h('td', { class: 'l' }, s.mvp && game.world.players.get(s.mvp) ? [h('span', { class: 'cm-s' }, 'MVP '), plink(game.world.players.get(s.mvp))] : '')))))]),
    P.champion ? h('div', { class: 'cm-h', style: { fontSize: '20px' } }, `${fullClub(P.champion)}: ${game.season.year} champions`) : null);
  }

  render();
  return {
    el: h('div', { style: { display: 'contents' } }, h('div', { class: 'cm-title' }, isLeague ? 'Major League Baseball' : 'Fixtures and Scores', isLeague ? dataCredit('Data by') : null), tabs.el, body),
    side: () => clubMenu(isLeague ? 'league' : 'fixtures'), bg: isLeague ? 'league' : 'fixtures',
    onShow: render,
  };
}

