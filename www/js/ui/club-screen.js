// Club information: overview, finances and the farm system, for your club or any other.
import { lastRecord, clubSeasons } from '../season/history.js';
import { av, avSort, avShort, avLabel } from './attr-ui.js';
import { h, fill, cmTabs, val, ordinal } from './dom.js';
import { nav } from './nav.js';
import { clubTitle, plink } from './club-ui.js';
import { clubMenu } from './menu.js';
import { sortTable } from './table.js';
import { LEVELS, LEVEL_NAME, isPitcher, money, salaryIn, mainPos, fullName } from '../data/world.js';
import { dateWords, fromDayNo } from '../season/calendar.js';
import { orgState, game, isUserOrg, yearsAhead } from '../state.js';
import { counts, offence, pitchQuality, activePlayers } from '../club/depth.js';
import { budget, committed as committedFor, expected, owner, goals, goalStatus, budgetRank, STYLES } from '../season/finance.js';
import { divisions, pct, gb } from '../season/standings.js';
import { teamTotals, rankOf } from '../season/teamstats.js';
import { confidenceWords } from '../season/reactions.js';
import { seasonLine, rate3, fix } from '../data/world.js';
import { value } from '../season/value.js';
import { taxFor, cbtLine, askOwner, extraFor } from '../season/finance.js';
import { staffCost, staffBudget } from '../season/ability.js';
import { scoutCost, scoutBudget } from '../season/scouting.js';
import { analyticsBudget, analyticsCost } from '../season/analytics.js';
import { toast } from './dom.js';
import { seen } from '../season/scouting.js';
import { lastLine } from './deal-summary.js';


export function clubScreen(orgId) {
  const o = game.world.orgs.get(orgId);
  const st = orgState(orgId);
  const club = o.club;
  const body = h('div', { class: 'cm-panel grow' });
  let tab = 'overview';
  const tabs = cmTabs([{ id: 'overview', label: 'Overview' }, { id: 'finance', label: 'Finances' }, { id: 'farm', label: 'Farm System' }, { id: 'history', label: 'History' }, { id: 'squad', label: 'Squad' }],
    tab, async (id) => {
      if (id === 'squad') { tabs.select(tab); nav.push((await import('./squad-screen.js')).squadScreen(orgId)); return; }
      tab = id; render();
    });

  function render() {
    if (tab === 'overview') fill(body, overview());
    if (tab === 'finance') fill(body, finances());
    if (tab === 'farm') fill(body, farm());
    if (tab === 'history') fill(body, clubHistory());
  }

  /** Every season played in the game: record, finish, manager, October, and the titles, for any club. */
  function clubHistory() {
    const seasons = clubSeasons(orgId);
    const POSTW = { Champions: 'Won the World Series', WS: 'Lost the World Series', LCS: 'Lost the Championship Series', DS: 'Lost the Division Series', WC: 'Lost the Wild Card Series' };
    const pct = (w, l) => (w + l ? (w / (w + l)).toFixed(3).replace(/^0/, '') : '-');
    const yrs = (f) => seasons.filter(f).map((x) => x.year);
    const titles = yrs((x) => x.post === 'Champions'), pennants = yrs((x) => x.post === 'Champions' || x.post === 'WS'), divs = yrs((x) => x.place === 1), posts = yrs((x) => x.post);
    const w = seasons.reduce((a, x) => a + x.w, 0), l = seasons.reduce((a, x) => a + x.l, 0);
    const live = game.season?.records.get(orgId);
    const rows = seasons.slice().sort((a, b) => b.year - a.year);
    const ord = (n) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] || 'th'}`;
    const best = seasons.length ? seasons.reduce((a, x) => (x.w > a.w ? x : a)) : null, worst = seasons.length ? seasons.reduce((a, x) => (x.w < a.w ? x : a)) : null;
    const sum = [];
    if (seasons.length) {
      sum.push(`${seasons.length} season${seasons.length > 1 ? 's' : ''} in the game: ${w}-${l} (${pct(w, l)}).`);
      sum.push(`${posts.length ? `${posts.length} postseason${posts.length > 1 ? 's' : ''} (${posts.join(', ')})` : 'No postseason yet'}${divs.length ? `, division titles ${divs.join(', ')}` : ''}${pennants.length ? `, pennants ${pennants.join(', ')}` : ''}${titles.length ? `, World Series titles ${titles.join(', ')}` : ''}.`);
      if (seasons.length > 1) sum.push(`Best year ${best.year} at ${best.w}-${best.l}; worst ${worst.year} at ${worst.w}-${worst.l}.`);
    } else sum.push('No completed seasons in the game yet. Each finished season is added here.');
    return h('div', { class: 'cm-pad' },
      h('div', { class: 'cm-h' }, club.full ?? `${club.city} ${club.name}`),
      h('p', {}, sum.join(' ')),
      live && live.w + live.l ? h('p', { class: 'cm-s' }, `${game.season.year} so far: ${live.w}-${live.l}.`) : null,
      rows.length ? h('div', { class: 'cm-tblwrap' }, h('table', { class: 'cm-tbl' },
        h('thead', {}, h('tr', {}, ['Season', 'Manager', 'W-L', 'Pct', 'Finish', 'Postseason', 'Runs'].map((c) => h('th', { class: 'l' }, c)))),
        h('tbody', {}, rows.map((x) => h('tr', { class: x.post === 'Champions' ? 'hl' : '' }, [String(x.year), x.mgrName || '', `${x.w}-${x.l}`, pct(x.w, x.l), `${ord(x.place)}${x.place > 1 && x.gb ? `, ${x.gb} back` : ''}`, POSTW[x.post] || (x.post ? '' : 'Missed the postseason'), x.rs != null ? `${x.rs}-${x.ra}` : ''].map((c) => h('td', { class: 'l' }, c))))))) : null,
      h('p', { class: 'cm-pad' }, h('button', { class: 'cm-btn', onClick: async () => nav.push((await import('./history-screen.js')).historyScreen('club', orgId)) }, 'Open the full club history (awards, records, leaders)')));
  }

  function overview() {
    const c = counts(o, st);
    const act = activePlayers(o, st);
    const S = game.season;
    const r = S?.records.get(orgId);
    const live = r && r.w + r.l > 0;
    const info = [
      ['League', club.league], ['Division', club.division], ['Ballpark', club.venue],
      [`${game.year - 1} record`, (() => { const r = lastRecord(club); return r ? `${r[0]}-${r[1]}` : ''; })()],
      ['Owner', STYLES[owner(orgId).style].label],
      [`${game.year} budget`, `${money(budget(orgId))} (${ordinal(budgetRank(orgId))} in the majors)`],
      [`${game.year} payroll`, `${money(committedFor(orgId, game.year).total)} committed`],
      [`${game.year} projected payroll`, `~${money(expected(orgId, game.year))} with arbitration and options`],
      ['Active roster', `${c.active} / 26`], ['40-man roster', `${c.forty} / 40${c.forty > 40 ? ' (over the limit)' : ''}`], ['Players in the organisation', o.players.length],
    ];
    const blocks = [];
    if (live) {
      const div = [...divisions().entries()].find(([, ids]) => ids.includes(orgId));
      const place = div[1].indexOf(orgId);
      const behind = gb(S.records.get(div[1][0]), r);
      const run = r.last.match(/(W+|L+)$/)?.[0] || '';
      const l10 = [...r.last];
      const season = [
        ['Record', `${r.w}-${r.l} (${pct(r).toFixed(3).replace(/^0/, '')})`],
        ['Division', `${ordinal(place + 1)} in the ${div[0].replace('American League', 'AL').replace('National League', 'NL')}${place ? `, ${behind.toFixed(1)} games behind` : behind < 0 ? '' : ''}`],
        ['Last 10', `${l10.filter((x) => x === 'W').length}-${l10.filter((x) => x === 'L').length}${run.length >= 2 ? `, ${run.length} ${run[0] === 'W' ? 'wins' : 'losses'} in a row` : ''}`],
        ['Home / away', `${r.hw}-${r.hl} / ${r.aw}-${r.al}`],
        ['Runs', `${r.rs} scored, ${r.ra} allowed (${r.rs - r.ra >= 0 ? '+' : ''}${r.rs - r.ra})`],
      ];
      // where the club ranks in its league
      const T = teamTotals(S.year);
      const ids = game.world.mlb.filter((x) => x.league === club.league).map((x) => x.id);
      const g = (id) => { const q = S.records.get(id); return Math.max(1, q.w + q.l); };
      const rk = (get, asc) => { const n = rankOf(orgId, ids, get, asc); return n ? `${ordinal(n)} of ${ids.length}` : ''; };
      const t = T.get(orgId);
      const ranks = t ? [
        ['Runs per game', (r.rs / g(orgId)).toFixed(2), rk((id) => S.records.get(id).rs / g(id))],
        ['Batting average', rate3(t.bat.avg), rk((id) => T.get(id)?.bat.avg)],
        ['On-base plus slugging', rate3(t.bat.ops), rk((id) => T.get(id)?.bat.ops)],
        ['Home runs', t.bat.hr, rk((id) => T.get(id)?.bat.hr)],
        ['Runs allowed per game', (r.ra / g(orgId)).toFixed(2), rk((id) => S.records.get(id).ra / g(id), true)],
        ['Earned run average', fix(t.pit.era), rk((id) => T.get(id)?.pit.era, true)],
        ['Strikeouts per nine', fix(t.pit.k9, 1), rk((id) => T.get(id)?.pit.k9)],
      ] : [];
      blocks.push(h('div', {}, h('div', { class: 'cm-h' }, `${S.year} season`), h('table', { class: 'cm-tbl info' }, h('tbody', {}, season.map(([k, v]) => h('tr', {}, h('td', { class: 'l cm-s' }, k), h('td', { class: 'l y' }, v)))))),
        ranks.length ? h('div', {}, h('div', { class: 'cm-h' }, `Rank in the ${club.league}`), h('table', { class: 'cm-tbl info' }, h('tbody', {}, ranks.map(([k, v, n]) => h('tr', {}, h('td', { class: 'l cm-s' }, k), h('td', { class: 'y' }, v), h('td', { class: 'l' }, n)))))) : null);
    }
    // the best players: this season's stats once it is under way, otherwise their attributes
    const gp = live ? r.w + r.l : 0;
    let best;
    if (live) {
      const bats = o.players.filter((p) => !isPitcher(p)).map((p) => ({ p, s: seasonLine(p, 'bat', S.year, 'MLB') })).filter((x) => x.s && x.s.pa >= gp * 2).sort((a, b) => b.s.ops - a.s.ops).slice(0, 5);
      const arms = o.players.filter(isPitcher).map((p) => ({ p, s: seasonLine(p, 'pit', S.year, 'MLB') })).filter((x) => x.s && x.s.outs >= gp).sort((a, b) => a.s.era - b.s.era).slice(0, 5);
      const tbl = (title, cols, list, row) => h('div', {}, h('div', { class: 'cm-h' }, title), h('table', { class: 'cm-tbl' },
        h('thead', {}, h('tr', {}, h('th', { class: 'l' }, ''), cols.map((x) => h('th', {}, x)))),
        h('tbody', {}, list.map((x) => h('tr', {}, h('td', { class: 'l' }, plink(x.p)), row(x.s).map((v) => h('td', { class: 'y' }, v)))))));
      best = h('div', {},
        tbl('Best hitters this season', ['AVG', 'HR', 'RBI', 'OPS'], bats, (s) => [rate3(s.avg), s.hr, s.rbi, rate3(s.ops)]),
        tbl('Best pitchers this season', ['IP', 'ERA', 'K', 'W-L'], arms, (s) => [Math.floor(s.outs / 3), fix(s.era), s.so, `${s.w}-${s.l}`]));
    } else {
      const hitters = act.filter((p) => !isPitcher(p)).sort((a, b) => offence(b) - offence(a)).slice(0, 5);
      const arms = act.filter(isPitcher).sort((a, b) => pitchQuality(b) - pitchQuality(a)).slice(0, 5);
      const bestG = (title, list, keys) => h('div', {},
        h('div', { class: 'cm-h' }, title),
        h('table', { class: 'cm-tbl' }, h('tbody', {}, list.map((p) => h('tr', {},
          h('td', { class: 'l' }, plink(p)), h('td', { class: 'l cm-s' }, mainPos(p)), keys.map((k) => h('td', {}, av(p, k))))))));
      best = h('div', {}, bestG('Best hitters (Contact, Power, Eye)', hitters, ['Contact', 'Power', 'Eye']), bestG('Best pitchers (Stuff, Movement, Control)', arms, ['Stuff', 'Movement', 'Control']));
    }
    // two columns that stack on their own, so the right-hand tables are not pushed down to line up with the left
    return h('div', { class: 'club-ov' },
      h('div', { class: 'club-col' },
      h('div', {}, h('div', { class: 'cm-h' }, 'Club'), h('table', { class: 'cm-tbl info' }, h('tbody', {}, info.map(([k, v]) => h('tr', {}, h('td', { class: 'l cm-s' }, k), h('td', { class: 'l y' }, v)))))),
        ...blocks.slice(1)),
      h('div', { class: 'club-col' }, ...blocks.slice(0, 1), best));
  }

  /** The four budget lines and a way to ask the owner for more. */
  function linesPanel(left, payroll) {
    const y = game.year;
    const tax = taxFor(orgId, y, payroll);
    const box = h('div', {});
    const draw = () => {
      const lines = [
        ['Payroll', budget(orgId, y), payroll, 'payroll', [5e6, 10e6, 20e6]],
        ['Staff: coaches and development', staffBudget(), staffCost(), 'staff', [5e5, 1e6]],
        ['Scouting', scoutBudget(), scoutCost(), 'scouting', [5e5, 1e6]],
        ['Analytics', analyticsBudget(), analyticsCost(), 'analytics', [5e5, 1e6]],
        ['Signing money (international)', 0, 0, null, []],
      ];
      fill(box,
        h('div', { class: 'cm-h' }, 'Budget lines'),
        h('table', { class: 'cm-tbl' }, h('thead', {}, h('tr', {}, ['Line', 'Budget', 'Committed', 'Left', 'Ask the owner for more'].map((c, i) => h('th', { class: i === 0 || i === 4 ? 'l' : '' }, c)))),
          h('tbody', {}, lines.map(([name, b, s, key, asks]) => h('tr', {}, h('td', { class: 'l' }, name), h('td', {}, money(b)), h('td', {}, money(s)),
            h('td', { class: b - s < 0 ? 'cm-r' : 'cm-g' }, b - s < 0 ? `${money(s - b)} over` : money(b - s)),
            h('td', { class: 'l' }, key ? asks.map((a) => h('button', { class: 'cm-btn', onClick: () => { const r = askOwner(key, a); toast(r.text); draw(); } }, `+${money(a)}`)) : h('span', { class: 'cm-s' }, 'comes with the international signings')))))),
        h('p', { class: 'cm-s cm-pad' }, `Luxury tax: ${cbtLine(orgId, y, payroll, tax)}. The owner decides what to give from his style, his confidence in you and how the team has done. Asking again too soon, or too often, costs you a little with him.`));
    };
    draw();
    return box;
  }

  function finances() {
    const committed = yearsAhead().map((y) => o.players.reduce((a, p) => { const s = salaryIn(p, y); return a + (typeof s === 'number' ? s : 0); }, 0));
    const other = yearsAhead().map((y) => (club.otherMoney || []).reduce((a, m) => a + (m.years[y] || 0), 0));
    const arb = yearsAhead().map((y) => o.players.filter((p) => /^A\d/.test(String(salaryIn(p, y) ?? ''))).length);
    const opts = yearsAhead().map((y) => o.players.filter((p) => String(salaryIn(p, y) ?? '').includes('opt')).length);
    const fa = o.players.filter((p) => salaryIn(p, game.year) === 'FA');
    const row = (label, vals, fmt = money, cls = 'y') => h('tr', {}, h('td', { class: 'l' }, label), vals.map((v) => h('td', { class: cls }, fmt(v))));
    const big = o.players.filter((p) => typeof salaryIn(p, game.year) === 'number' && salaryIn(p, game.year) > 1e6);
    const own = owner(orgId);
    const b = budget(orgId, game.year);
    const c27 = committedFor(orgId, game.year);
    const pending = expected(orgId, game.year) - c27.total; // arbitration and options not settled yet
    const left = b - c27.total - pending;
    return h('div', {},
      h('div', { class: 'cm-h' }, `The owner: ${STYLES[own.style].label.toLowerCase()}`),
      h('div', { class: 'cm-pad' },
        h('p', { class: 'cm-sub' }, STYLES[own.style].words),
        h('table', { class: 'cm-tbl info' }, h('tbody', {},
          [...(isUserOrg(orgId) ? [['Confidence in you', h('span', { class: confidenceWords()[1] }, confidenceWords()[0])]] : []),
            [`${game.year} budget`, `${money(b)} (${ordinal(budgetRank(orgId))} biggest in the majors)`],
            ['Committed', `${money(c27.contracts)} in contracts${c27.owed ? ` and ${money(c27.owed)} owed to players gone` : ''}`],
            ...(pending > 0 ? [['Still to settle', `${money(pending)} estimated for arbitration cases and club options`]] : []),
            ['Left to spend', h('span', { class: left < 0 ? 'cm-r' : 'cm-g' }, left < 0 ? `${money(-left)} over the budget` : money(left))],
            ...(isUserOrg(orgId) && own.cut && own.cut.year === game.year && !own.cut.done ? [["The owner's order", h('span', { class: 'cm-r' }, `Payroll must be back inside the budget by ${dateWords(fromDayNo(own.cut.due))}`)]] : []),
          ].map(([k, v]) => h('tr', {}, h('td', { class: 'l cm-s' }, k), h('td', { class: 'l y' }, v))))),
        h('div', { class: 'cm-h', style: { marginTop: '8px' } }, `His goals for ${game.year}`),
        h('table', { class: 'cm-tbl info' }, h('tbody', {}, goals(orgId, game.year).map((g) => {
          const [txt, cls] = goalStatus(orgId, g, game.year);
          return h('tr', {}, h('td', { class: 'l y' }, g.text), h('td', { class: `l ${cls}` }, g.id === 'youth' ? '' : txt));
        })))),
      isUserOrg(orgId) ? linesPanel(left, expected(orgId, game.year)) : null,
      h('div', { class: 'cm-h' }, 'Money committed'),
      h('div', { class: 'cm-tblwrap' }, h('table', { class: 'cm-tbl' },
        h('thead', {}, h('tr', {}, h('th', { class: 'l' }, ''), yearsAhead().map((y) => h('th', {}, y)))),
        h('tbody', {},
          row('Player contracts', committed),
          row('Money owed to players gone', other),
          row('Total committed', committed.map((v, i) => v + other[i])),
          row('Players due arbitration', arb, (v) => v || '', ''),
          row('Options to decide', opts, (v) => v || '', '')))),
      h('p', { class: 'cm-s cm-pad' }, `${game.year - 1 <= 2026 ? `${game.year - 1} payroll was ${money(club.payroll2026)}` : `${game.year} payroll so far is ${money(committedFor(orgId, game.year).total)} committed, about ${money(expected(orgId, game.year))} once arbitration and options are settled`}. Arbitration salaries are settled in the off-season. ${fa.length} player${fa.length === 1 ? '' : 's'} become free agents: ${fa.map(fullName).join(', ') || 'none'}.`),
      h('div', { class: 'cm-h' }, 'Contracts'),
      sortTable({
        rows: big, sort: `y${game.year}`,
        cols: [
          { key: 'name', label: 'Player', left: true, get: (p) => p.last, show: (p) => plink(p) },
          { key: 'text', label: 'Contract', left: true, get: (p) => p.contract.text || '' },
          ...yearsAhead().map((y) => ({ key: `y${y}`, label: String(y), get: (p) => { const s = salaryIn(p, y); return typeof s === 'number' ? s : null; }, show: (p) => money(salaryIn(p, y)) })),
        ],
      }).el);
  }

  function farm() {
    const R = game.season;
    const recOf = (lv, t) => {
      const r = lv === 'MLB' ? R?.records?.get(t?.id) : R?.minorRecords?.get(t?.id);
      if (r && r.w + r.l > 0) return { w: r.w, l: r.l, now: true };
      const y = game.history?.[game.year - 1]?.clubs?.[t?.org ?? t?.id];
      return lv === 'MLB' && y?.w != null ? { w: y.w, l: y.l, now: false } : null;
    };
    const rows = LEVELS.map((lv) => {
      const t = lv === 'MLB' ? club : o.affiliates[lv];
      const players = o.players.filter((p) => (lv === 'MLB' ? st.active.has(p.id) : !st.active.has(p.id) && st.level.get(p.id) === lv));
      const prospects = players.filter((p) => p.age <= 24 && seen(p).mode !== 'partial').sort((a, b) => topFuture(b) - topFuture(a)).slice(0, 4);
      const pit = players.filter(isPitcher).length;
      const age = players.length ? players.reduce((a, p) => a + p.age, 0) / players.length : null;
      return { lv, t, players, prospects, pit, hit: players.length - pit, age, forty: players.filter((p) => st.forty.has(p.id)).length, hurt: players.filter((p) => p.injury || st.il.has(p.id)).length, rec: recOf(lv, t) };
    });
    const heads = ['Level', 'Club', 'League', 'Record', 'Players', 'Hit / Pit', 'Avg age', 'On 40', 'Hurt', 'Best young players'];
    const levels = h('div', { class: 'cm-tblwrap' }, h('table', { class: 'cm-tbl fm-tbl' },
      h('thead', {}, h('tr', {}, heads.map((c, i) => h('th', { class: `${i < 3 || i === 9 ? 'l' : ''}${[2, 4, 5, 6, 7, 8].includes(i) ? ' m-low' : ''}` }, c)))),
      h('tbody', {}, rows.map((r) => h('tr', {},
        h('td', { class: 'l' }, LEVEL_NAME[r.lv]), h('td', { class: 'l y' }, r.t ? `${r.t.full ?? `${r.t.city} ${r.t.name}`}` : ''), h('td', { class: 'l cm-s' }, r.t?.league || ''),
        h('td', { title: r.rec && !r.rec.now ? 'Last season' : '' }, r.rec ? `${r.rec.w}-${r.rec.l}` : ''),
        h('td', {}, r.players.length), h('td', {}, r.players.length ? `${r.hit} / ${r.pit}` : ''), h('td', {}, r.age != null ? r.age.toFixed(1) : ''),
        h('td', {}, r.lv === 'MLB' ? '' : r.forty || ''), h('td', { class: r.hurt ? 'cm-y' : '' }, r.hurt || ''),
        h('td', { class: 'l' }, !r.prospects.length && r.players.length ? h('span', { class: 'cm-s' }, 'not scouted') : null, r.prospects.map((p, i) => [i ? ', ' : '', plink(p, `${p.first[0]}. ${p.last}`), h('span', { class: 'cm-s' }, ` (${p.age})`)])))))));
    // the best prospects across every level, with what he is now, what he could be and how he did last year
    const top = o.players.filter((p) => p.age <= 25 && seen(p).mode !== 'partial').sort((a, b) => topFuture(b) - topFuture(a)).slice(0, 15);
    const lvName = (p) => LEVEL_NAME[p.level === 'MLB' || st.active.has(p.id) ? 'MLB' : st.level.get(p.id)] || '';
    const prosp = sortTable({
      rows: top, sort: 'fut',
      cols: [
        { key: 'name', label: 'Player', left: true, get: (p) => p.last, show: (p) => plink(p) },
        { key: 'pos', label: 'Pos', left: true, get: (p) => mainPos(p), show: (p) => h('b', { class: 'cm-y' }, mainPos(p)) },
        { key: 'age', label: 'Age', get: (p) => p.age, asc: true },
        { key: 'lv', label: 'Level', left: true, get: (p) => LEVELS.indexOf(st.active.has(p.id) ? 'MLB' : st.level.get(p.id)), asc: true, show: lvName },
        { key: 'now', label: 'Now', get: (p) => Math.round(value(seen(p).v)) },
        { key: 'fut', label: 'Future', get: (p) => topFuture(p), show: (p) => h('b', { class: 'y' }, Math.round(topFuture(p))) },
        { key: 'st', label: 'Roster', left: true, get: (p) => (st.forty.has(p.id) ? 0 : 1), asc: true, show: (p) => (st.forty.has(p.id) ? h('b', { class: 'tag40' }, '40-man') : h('span', { class: 'cm-s' }, 'Minor deal')) },
        { key: 'last', label: 'Last season', left: true, get: (p) => '', show: (p) => h('span', { class: 'cm-s' }, lastLine(p)) },
      ],
    }).el;
    return h('div', { style: { display: 'contents' } }, levels, h('div', { class: 'cm-h' }, 'Top prospects in the system'), prosp);
  }

  render();
  return {
    el: h('div', { style: { display: 'contents' } }, clubTitle(club, `${club.full ?? `${club.city} ${club.name}`}`), tabs.el, body),
    side: () => clubMenu(isUserOrg(orgId) ? 'club' : null), bg: 'club', bgOrg: orgId,
  };
}

const topFuture = (p) => value(seen(p).v, { future: true });
