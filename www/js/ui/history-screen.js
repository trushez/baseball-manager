// History: a manager's career (yours or any other), the league year by year (the real seasons before the game
// from honours.json, then every season played), a club's history, and the record book.
import { h, fill, cmTabs } from './dom.js';
import { clubMenu } from './menu.js';
import { plink, select } from './club-ui.js';
import { game } from '../state.js';
import { fullName, rate3 } from '../data/world.js';
import { ensureManagers, managerOf, managerCareer, clubSeasons, clubAwards, gameRecords, careerLeaders, MLB_RECORDS } from '../season/history.js';
import { legacy } from '../season/legacy.js';
import { realHonours, AWARD_NAME } from '../data/honours.js';

const W = () => game.world;
const city = (id) => W().orgs.get(id)?.club.city ?? id;
const clubName = (id) => { const c = W().orgs.get(id)?.club; return c ? `${c.full ?? `${c.city} ${c.name}`}` : id; };
const shortDiv = (d) => (d || '').replace('American League', 'AL').replace('National League', 'NL');
const ord = (n) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] || 'th'}`;
const POST = { Champions: 'Won the World Series', WS: 'Lost the World Series', LCS: 'Lost the LCS', DS: 'Lost the Division Series', WC: 'Lost the Wild Card Series' };
const pctT = (w, l) => (w + l ? (w / (w + l)).toFixed(3).replace(/^0/, '') : '-');
const plk = (id, t) => { const p = W().players.get(id); return p ? plink(p, t ?? fullName(p)) : (t ?? ''); };
const fmt = (key, v) => (key === 'avg' ? rate3(v) : key === 'era' ? v.toFixed(2) : String(v));
const tbl = (head, rows, cls = '') => h('div', { class: 'cm-tblwrap' }, h('table', { class: `cm-tbl ${cls}` },
  h('thead', {}, h('tr', {}, head.map((c) => h('th', { class: 'l' }, c)))),
  h('tbody', {}, rows.map((r) => h('tr', { class: r.cls || '' }, (r.cells || r).map((c) => h('td', { class: 'l' }, c)))))));

export function historyScreen(start = 'legacy', arg = null) {
  ensureManagers();
  let tab = start, mgrId = start === 'manager' && arg ? arg : 'you', orgId = start === 'club' && arg ? arg : game.orgId, openYear = null;
  const body = h('div', { class: 'cm-panel grow' });
  const tabs = cmTabs([
    { id: 'legacy', label: 'Your Legacy' }, { id: 'manager', label: 'Managers' }, { id: 'league', label: 'League History' }, { id: 'club', label: 'Club History' }, { id: 'records', label: 'Record Book' },
  ], tab, (id) => { tab = id; render(); });
  const go = (t, a) => { tab = t; if (t === 'manager') mgrId = a; if (t === 'club') orgId = a; tabs.select(t); render(); };
  const mgrLink = (id, text) => h('button', { class: 'pl', onClick: () => go('manager', id) }, text);
  const clubLink = (id, text = clubName(id)) => h('button', { class: 'pl', onClick: () => go('club', id) }, text);

  function render() { ({ legacy: legacyTab, manager, league, club, records })[tab](); }

  // ---------- your legacy ----------
  function legacyTab() {
    const L = legacy();
    if (!L) { fill(body, h('p', { class: 'cm-pad cm-s cm-empty' }, 'Your legacy starts when your first season is over.')); return; }
    const seasonText = (s) => `${s.year}: ${s.w}-${s.l}, ${ord(s.place)}${s.post ? `, ${POST[s.post].toLowerCase()}` : ''}`;
    fill(body,
      h('div', { class: 'cm-h' }, `${game.manager}: your career`),
      h('div', { class: 'cm-pad' }, h('p', { class: 'cm-y' }, L.summary)),
      tbl(['', ''], [
        ['Best season', seasonText(L.best)], ['Worst season', seasonText(L.worst)],
        ['World Series titles', L.titles.length ? L.titles.map((s) => s.year).join(', ') : 'None'], ['Pennants', L.pennants.length ? L.pennants.map((s) => s.year).join(', ') : 'None'],
        ['Division titles', String(L.divs.length)], ['Postseason appearances', String(L.posts.length)], ['Manager of the Year', L.moys.length ? L.moys.map((s) => s.year).join(', ') : 'None'],
      ]),
      L.picks.length ? [h('div', { class: 'cm-h' }, 'Your best draft picks still playing'), tbl(['Player', 'Drafted', 'Value now'], L.picks.map((x) => [plk(x.p.id), `${x.year}, pick ${x.n}`, String(x.v)]))] : null,
      L.wins.length ? [h('div', { class: 'cm-h' }, 'Your best trades'), h('div', { class: 'cm-pad' }, L.wins.map((t) => h('p', {}, t)))] : null,
      L.losses.length ? [h('div', { class: 'cm-h' }, 'The trades you would take back'), h('div', { class: 'cm-pad' }, L.losses.map((t) => h('p', {}, t)))] : null,
      h('div', { class: 'cm-h' }, 'Season stories'),
      h('div', { class: 'cm-pad btnrow' }, [...L.seasons].sort((a, b) => b.year - a.year).map((x) => h('button', { class: 'cm-btn', title: `${x.w}-${x.l}`, onClick: async () => {
        const { seasonReviewScreen } = await import('./season-review.js'); const { nav } = await import('./nav.js'); nav.push(seasonReviewScreen(x.year));
      } }, String(x.year)))),
      h('div', { class: 'cm-pad' }, h('span', { class: 'cm-s' }, 'Each button opens that season\'s written story, awards and review. '), h('button', { class: 'cm-btn', onClick: () => go('club', game.orgId) }, 'Your club\'s all-time leaders')));
  }

  // ---------- a manager ----------
  function manager() {
    const m = game.managers[mgrId] || game.managers.you;
    const career = managerCareer(m.id);
    const now = Object.entries(game.mgrOf).find(([, id]) => id === m.id)?.[0];
    // this season so far, until it is archived
    const S = game.season;
    const live = now && S && !game.history?.[S.year] && ['regular', 'post', 'over'].includes(game.phase) ? S.records.get(now) : null;
    const rows = career.map((c) => ({ cells: [String(c.year), clubLink(c.org, city(c.org)), `${c.w}-${c.l}`, pctT(c.w, c.l), `${ord(c.place)}, ${shortDiv(c.div)}`, POST[c.post] ?? (c.post ? '' : 'Missed the postseason'), [c.moy ? 'Manager of the Year' : '', c.owner ? `Owner: ${c.owner.words.toLowerCase()}` : ''].filter(Boolean).join('. ')], cls: c.post === 'Champions' ? 'hl' : '' }));
    if (live && live.w + live.l) rows.push({ cells: [`${S.year}`, clubLink(now, city(now)), `${live.w}-${live.l}`, pctT(live.w, live.l), 'so far', '', ''], cls: 'cm-s' });
    const w = career.reduce((a, c) => a + c.w, 0), l = career.reduce((a, c) => a + c.l, 0);
    const titles = career.filter((c) => c.post === 'Champions').length, pennants = career.filter((c) => c.post === 'Champions' || c.post === 'WS').length;
    const posts = career.filter((c) => c.post).length, moys = career.filter((c) => c.moy).length;
    // a real manager's Manager of the Year awards before the game
    const realMoy = [];
    for (const [y, by] of Object.entries(realHonours()?.winners || {})) for (const k of ['ALMOY', 'NLMOY']) if (by[k]?.some((x) => x.id === m.mlbId)) realMoy.push(`${y} ${AWARD_NAME[k]}`);
    const others = Object.values(game.managers).filter((x) => x.id !== m.id).sort((a, b) => a.name.localeCompare(b.name));
    fill(body,
      h('div', { class: 'cm-pad filters' }, select([[m.id, m.name], ...others.map((x) => [x.id, `${x.name}${Object.entries(game.mgrOf).find(([, id]) => id === x.id) ? `, ${city(Object.entries(game.mgrOf).find(([, id]) => id === x.id)[0])}` : ''}`])], m.id, (v) => { mgrId = v; render(); }, { 'aria-label': 'Manager' })),
      h('div', { class: 'cm-h' }, `${m.name}${m.user ? ' (you)' : ''}`),
      h('div', { class: 'cm-pad' },
        h('p', {}, now ? `Manager of the ${clubName(now)}${m.since ? ` since ${m.since}` : ''}.` : 'Not managing a club at present.'),
        career.length ? h('p', { class: 'cm-y' }, `${career.length} season${career.length > 1 ? 's' : ''}: ${w}-${l} (${pctT(w, l)}). ${posts ? `${posts} postseason${posts > 1 ? 's' : ''}` : 'No postseasons yet'}${pennants ? `, ${pennants} pennant${pennants > 1 ? 's' : ''}` : ''}${titles ? `, ${titles} World Series title${titles > 1 ? 's' : ''}` : ''}${moys ? `, ${moys}x Manager of the Year` : ''}.`) : h('p', { class: 'cm-s cm-empty' }, 'No completed seasons in the game yet. Each finished season is added here.'),
        realMoy.length ? h('p', {}, `Before the game: ${realMoy.join(', ')}.`) : null),
      rows.length ? tbl(['Season', 'Club', 'W-L', 'Pct', 'Finish', 'Postseason', 'Notes'], rows) : null);
  }

  // ---------- the league, year by year ----------
  function league() {
    const H = game.history || {}, A = game.awards || {};
    const real = realHonours()?.winners || {};
    const byMlb = new Map(W().mlb.map((c) => [c.mlbId, c.id]));
    const years = [...new Set([...Object.keys(H), ...Object.keys(real)].map(Number))].sort((a, b) => b - a);
    const name = (pid) => { const p = W().players.get(pid); return p ? plink(p, fullName(p)) : ''; };
    const rows = years.map((y) => {
      if (H[y]) {
        const s = A[y]?.season || {};
        return { cells: [h('button', { class: 'pl', onClick: () => { openYear = openYear === y ? null : y; render(); } }, String(y)), H[y].champion ? clubLink(H[y].champion, city(H[y].champion)) : '-',
          name(s.AL?.MVP), name(s.NL?.MVP), name(s.AL?.['Cy Young']), name(s.NL?.['Cy Young']), name(s.AL?.['Rookie of the Year']), name(s.NL?.['Rookie of the Year'])], cls: H[y].champion === game.orgId ? 'hl' : '' };
      }
      const r = real[y] || {};
      const nm = (k) => (r[k] || []).map((x) => { const p = W().list.find((q) => q.mlb_id === x.id); return p ? plink(p, x.name) : x.name; });
      const champ = byMlb.get(r.WSMVP?.[0]?.team);
      return { cells: [String(y), champ ? clubLink(champ, city(champ)) : '-', ...['ALMVP', 'NLMVP', 'ALCY', 'NLCY', 'ALROY', 'NLROY'].map((k) => h('span', {}, ...joinNodes(nm(k))))], cls: 'cm-s' };
    });
    if (openYear == null) openYear = Math.max(0, ...Object.keys(H).map(Number)) || null;
    const detail = openYear && H[openYear] ? yearDetail(openYear) : null;
    // the seasons played in the game: who won what, from the division to the World Series
    const gameYears = Object.keys(H).map(Number).sort((a, b) => b - a);
    const names = (y, lg, f) => Object.entries(H[y].clubs).filter(([id, c]) => c.div?.startsWith(lg === 'AL' ? 'American' : 'National') && f(c)).sort((a, b) => a[1].div.localeCompare(b[1].div)).map(([id]) => city(id)).join(', ') || '-';
    const finalOf = (y) => { const ws = (H[y].series || []).find((x) => x.round === 'WS'); if (!ws) return ['-', '']; const w = ws.winner, lo = ws.winner === ws.hi ? ws.lo : ws.hi; const a = Math.max(ws.hiW, ws.loW), b = Math.min(ws.hiW, ws.loW); return [city(lo), `${a}-${b}`]; };
    const results = gameYears.length ? tbl(['Season', 'World Series', 'Runner-up', 'AL division winners', 'NL division winners', 'AL wild cards', 'NL wild cards'],
      gameYears.map((y) => { const [ru, sc] = finalOf(y); return { cells: [h('button', { class: 'pl', onClick: () => { openYear = y; render(); } }, String(y)), H[y].champion ? clubLink(H[y].champion, city(H[y].champion)) : '-', ru ? `${ru} (${sc})` : '-',
        names(y, 'AL', (c) => c.place === 1), names(y, 'NL', (c) => c.place === 1), names(y, 'AL', (c) => c.place > 1 && c.post), names(y, 'NL', (c) => c.place > 1 && c.post)], cls: H[y].champion === game.orgId ? 'hl' : '' }; }), 'compact') : null;
    fill(body,
      gameYears.length ? h('div', { class: 'cm-h' }, 'Seasons in the game') : null, results,
      h('div', { class: 'cm-h' }, 'Champions and award winners'),
      h('div', { class: 'cm-pad cm-s' }, years.some((y) => !H[y]) ? 'Seasons before 2027 are the real ones; click a season played in the game for its tables.' : 'Click a season for its final tables, leaders and award winners. Real seasons before 2027 appear once the honours file is installed (node tools/fetch-honours.js).'),
      years.length ? tbl(['Season', 'Champions', 'AL MVP', 'NL MVP', 'AL Cy Young', 'NL Cy Young', 'AL Rookie', 'NL Rookie'], rows) : h('p', { class: 'cm-pad cm-s' }, 'The first season is still being played.'),
      detail);
  }
  const joinNodes = (arr) => arr.flatMap((x, i) => (i ? [', ', x] : [x]));

  function yearDetail(y) {
    const H = game.history[y], A = game.awards?.[y]?.season || {};
    const out = [h('div', { class: 'cm-h' }, `${y}: ${H.champion ? `${clubName(H.champion)} won the World Series` : ''}`),
      h('div', { class: 'cm-pad' }, h('button', { class: 'cm-btn go', onClick: async () => { const { seasonReviewScreen } = await import('./season-review.js'); const { nav } = await import('./nav.js'); nav.push(seasonReviewScreen(y)); } }, `Open the ${y} season in review`))];
    // the postseason, round by round
    const RN = { WC: 'Wild Card Series', DS: 'Division Series', LCS: 'League Championship Series', WS: 'World Series' };
    const sers = H.series || [];
    if (sers.length) {
      const rows = [];
      for (const r of ['WC', 'DS', 'LCS', 'WS']) for (const x of sers.filter((q) => q.round === r)) {
        const lo = x.winner === x.hi ? x.lo : x.hi, a = Math.max(x.hiW, x.loW), b = Math.min(x.hiW, x.loW);
        rows.push({ cells: [RN[r], x.league ? shortDiv(x.league) : '', clubLink(x.winner, city(x.winner)), `beat ${city(lo)}`, `${a}-${b}`], cls: x.winner === game.orgId || lo === game.orgId ? 'hl' : '' });
      }
      out.push(h('div', { class: 'cm-h' }, `${y} postseason`), tbl(['Round', 'League', 'Winner', '', 'Series'], rows, 'compact'));
    }
    // final tables
    const divs = {};
    for (const [id, c] of Object.entries(H.clubs)) (divs[c.div] ||= []).push([id, c]);
    const DIV_ORDER = ['East', 'Central', 'West'];
    for (const div of Object.keys(divs).sort((a, b) => a.split(' ')[0].localeCompare(b.split(' ')[0]) || DIV_ORDER.indexOf(a.split(' ').at(-1)) - DIV_ORDER.indexOf(b.split(' ').at(-1)))) {
      out.push(tbl([shortDiv(div), 'W', 'L', 'Pct', 'GB', 'Manager', 'Postseason'], divs[div].sort((a, b) => a[1].place - b[1].place).map(([id, c]) => ({
        cells: [clubLink(id, city(id)), String(c.w), String(c.l), pctT(c.w, c.l), c.gb ? (c.gb % 1 ? c.gb.toFixed(1) : String(c.gb)) : '-', c.mgr ? mgrLink(c.mgr, game.managers[c.mgr]?.name ?? '') : '', POST[c.post] ?? ''],
        cls: id === game.orgId ? 'hl' : '' })), 'compact divtbl'));
    }
    // leaders and the other awards
    for (const L of ['AL', 'NL']) {
      const ld = H.leaders?.[L] || {};
      out.push(tbl([`${L} leaders`, 'Leader', 'Club', ''], Object.entries(ld).filter(([, r]) => r.length).map(([k, r]) => [k, plk(r[0][0]), city(r[0][2]), k === 'AVG' || k === 'OPS' ? rate3(r[0][1]) : k === 'ERA' ? r[0][1].toFixed(2) : String(r[0][1])]), 'compact'));
      const aw = A[L] || {};
      const keys = Object.keys(aw).filter((k) => !['MVP', 'Cy Young', 'Rookie of the Year'].includes(k));
      if (keys.length) out.push(tbl([`${L} awards`, 'Winner'], keys.map((k) => [k.replace(/^(Gold Glove|Silver Slugger) ([A-Z0-9]+?)\d?$/, '$1 ($2)'), k === 'Manager of the Year' ? clubLink(aw[k], `${city(aw[k])} (${game.managers[H.clubs[aw[k]]?.mgr]?.name ?? ''})`) : plk(aw[k])]), 'compact'));
    }
    return h('div', { class: 'hist-year' }, out);
  }

  // ---------- a club ----------
  function club() {
    const seasons = clubSeasons(orgId);
    const titles = seasons.filter((s) => s.post === 'Champions').map((s) => s.year);
    const pennants = seasons.filter((s) => s.post === 'Champions' || s.post === 'WS').map((s) => s.year);
    const divTitles = seasons.filter((s) => s.place === 1).map((s) => s.year);
    const real = realHonours()?.winners || {};
    const mlbId = W().orgs.get(orgId)?.club.mlbId;
    const realTitles = Object.entries(real).filter(([, r]) => r.WSMVP?.[0]?.team === mlbId).map(([y]) => y);
    const recs = gameRecords(orgId).filter((r) => r.best);
    const leaders = careerLeaders(3, orgId).filter((x) => x.rows.length);
    const awards = clubAwards(orgId);
    fill(body,
      h('div', { class: 'cm-pad filters' }, select(W().mlb.map((c) => [c.id, `${c.full ?? `${c.city} ${c.name}`}`]), orgId, (v) => { orgId = v; render(); }, { 'aria-label': 'Club' })),
      h('div', { class: 'cm-h' }, clubName(orgId)),
      h('div', { class: 'cm-pad' },
        h('p', {}, `Manager: `, managerOf(orgId) ? mgrLink(managerOf(orgId).id, managerOf(orgId).name) : '-', '.'),
        h('p', { class: 'cm-y' }, [titles.length ? `World Series titles in the game: ${titles.join(', ')}.` : '', pennants.length ? `Pennants: ${pennants.join(', ')}.` : '', divTitles.length ? `Division titles: ${divTitles.join(', ')}.` : ''].filter(Boolean).join(' ') || (seasons.length ? 'No titles yet in the game.' : 'No completed seasons in the game yet.')),
        realTitles.length ? h('p', {}, `Real World Series titles since ${Math.min(...Object.keys(real).map(Number))}: ${realTitles.join(', ')}.`) : null),
      seasons.length ? tbl(['Season', 'Manager', 'W-L', 'Pct', 'Finish', 'Postseason'], seasons.map((s) => ({ cells: [String(s.year), s.mgr ? mgrLink(s.mgr, s.mgrName) : '', `${s.w}-${s.l}`, pctT(s.w, s.l), `${ord(s.place)}${s.place > 1 ? `, ${s.gb} back` : ''}`, POST[s.post] ?? ''], cls: s.post === 'Champions' ? 'hl' : '' }))) : null,
      awards.length ? [h('div', { class: 'cm-h' }, 'Award winners'), tbl(['Season', 'Award', 'Winner'], awards.map(([y, a, id]) => [String(y), a, id ? plk(id) : (game.managers[game.history?.[y]?.clubs[orgId]?.mgr]?.name ?? '')]), 'compact')] : null,
      recs.length ? [h('div', { class: 'cm-h' }, 'Club records (single season, in the game)'), tbl(['Record', 'Holder', 'Season', ''], recs.map((r) => [r.label, plk(r.best[0]), String(r.best[2]), fmt(r.key, r.best[1])]), 'compact')] : null,
      leaders.length ? [h('div', { class: 'cm-h' }, 'Club career leaders (current players, whole careers with the club)'), tbl(['', '1st', '2nd', '3rd'], leaders.map((x) => [x.label, ...[0, 1, 2].map((i) => (x.rows[i] ? h('span', {}, plk(x.rows[i][0]), ` ${x.rows[i][1]}`) : ''))]), 'compact')] : null);
  }

  // ---------- the record book ----------
  function records() {
    const recs = gameRecords();
    const leaders = careerLeaders(5).filter((x) => x.rows.length);
    const row = (r) => {
      const [label, key, v, who, y] = MLB_RECORDS[r.kind].find((x) => x[1] === r.key);
      const broke = r.best && (key === 'era' ? r.best[1] < v : r.best[1] > v);
      return { cells: [label, `${fmt(key, v)}, ${who} (${y})`, r.best ? h('span', {}, plk(r.best[0]), `, ${city(r.best[3])}, ${r.best[2]}`) : '-', r.best ? fmt(key, r.best[1]) : '', broke ? 'NEW RECORD' : ''], cls: broke ? 'hl' : '' };
    };
    fill(body,
      h('div', { class: 'cm-pad cm-s' }, 'Major league single-season records since 1900, and the best seasons in the game. Averages need 502 plate appearances, ERA 162 innings.'),
      h('div', { class: 'cm-h' }, 'Batting'), tbl(['Record', 'Major league record', 'Best in the game', '', ''], recs.filter((r) => r.kind === 'bat').map(row)),
      h('div', { class: 'cm-h' }, 'Pitching'), tbl(['Record', 'Major league record', 'Best in the game', '', ''], recs.filter((r) => r.kind === 'pit').map(row)),
      leaders.length ? [h('div', { class: 'cm-h' }, 'Career leaders among players in the game (whole careers)'), tbl(['', '1st', '2nd', '3rd', '4th', '5th'], leaders.map((x) => [x.label, ...[0, 1, 2, 3, 4].map((i) => (x.rows[i] ? h('span', {}, plk(x.rows[i][0]), ` ${x.rows[i][1]}`) : ''))]), 'compact')] : null);
  }

  render();
  return {
    el: h('div', { style: { display: 'contents' } }, h('div', { class: 'cm-title' }, 'History'), tabs.el, body),
    side: () => clubMenu('history'),
  };
}
