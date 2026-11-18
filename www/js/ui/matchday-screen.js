// Match day: today's game, the probable starters, and whether you watch it or take the result.
import { envFor } from '../season/ballpark.js';
import { h, fill, toast } from './dom.js';
import { nav } from './nav.js';
import { clubTitle, plink } from './club-ui.js';
import { clubMenu } from './menu.js';
import { lastSeason, fix, ipText, seasonLine, isPitcher, HIST, line } from '../data/world.js';
import { game, org, orgState, longDate } from '../state.js';
import { prepareGame, recordGame, simulateGame, gamesOn, probableStarter, daysRest, expectedLineup, armStatus, pitchesOn } from '../season/sim.js';
import { finishUserDay } from '../season/advance.js';
import { rosterProblems } from '../season/roster.js';
import { storyContext } from '../season/storyctx.js';
import { divisions, pct, gb } from '../season/standings.js';
import { lineupProblems, playerIn, ROLE_LIST } from '../club/depth.js';
import { matchScreen } from './match-screen.js';
import { playersMap } from '../club/match.js';
import { ROUND_NAME } from '../season/postseason.js';
import { Rng } from '../core/rng.js';

const UMPIRES = ['Dale Fenwick', 'Russ Albright', 'Hal Pruett', 'Gene Ostrowski', 'Tom Whitacre', 'Carl Mendes', 'Ray Kessler', 'Lou Barrows', 'Ned Calloway', 'Art Benning'];
const SKIES = ['Clear', 'Clear', 'Partly cloudy', 'Overcast', 'Warm and still', 'Breezy'];


/** Matches started and not yet finished, by game id: going back and watching again returns to the same match. */
const LIVE = new Map();
/** Which stats the lineups and bullpens show in a postseason game; kept while you stay in the playoffs. */
let SCOPE = 'reg';
export function matchDayScreen(g) {
  const W = game.world;
  const home = W.clubs.get(g.home), away = W.clubs.get(g.away);
  const me = org();
  const opp = g.home === game.orgId ? away : home;
  // worked out afresh each time the screen is shown, so changes made in Tactics or Squad show here
  let sp, oppHand, problems;
  const facts = () => {
    sp = { away: probableStarter(g.away, 'MLB', g.d), home: probableStarter(g.home, 'MLB', g.d) };
    oppHand = (g.home === game.orgId ? sp.away : sp.home)?.throws === 'L' ? 'L' : 'R';
    problems = lineupProblems(oppHand === 'L' ? orgState().lineupL : orgState().lineupR, me, orgState());
  };
  facts();
  const rec = (id) => { const r = game.season.records.get(id); return r ? `${r.w}-${r.l}` : ''; };
  const spLine = (p) => {
    if (!p) return 'to be decided';
    const s = lastSeason(p, 'pit'), r = daysRest(p, g.d);
    return [plink(p), ` (${p.throws}HP)`, s?.outs ? `, ${s.season}: ${ipText(s.outs)} IP, ${fix(s.era)} ERA` : '',
      r < 4 ? h('span', { class: 'cm-r' }, ` (${r === 3 ? 'short rest' : `only ${r} day${r === 1 ? '' : 's'}' rest: exhausted`})`) : ''];
  };
  const series = g.post ? game.season.post.series.find((s) => s.id === g.series) : null;

  // one match per game: going Back and pressing Watch again returns to the same match, and a game
  // already played is never played again (it used to be, and the second result overwrote the first)
  // the match lives as long as the game is unfinished, whichever Match Day screen opens it
  let match = LIVE.get(g.id) || null;
  async function done() { const { inboxScreen } = await import('./inbox-screen.js'); nav.reset(inboxScreen()); }

  function watch(instant = false) {
    if (g.s) { toast(`This game has been played: ${away.city} ${g.s[0]}, ${home.city} ${g.s[1]}.`); done(); return; }
    if (match) { nav.push(match); if (instant) match.toEnd(); return; }
    // the same rules as Continue: no game with an illegal roster (over 40, too many active, an injured starter)
    const problems = rosterProblems(org(), orgState());
    if (problems.length) {
      toast(problems[0]);
      import('./required-screen.js').then(({ requiredScreen }) => nav.push(requiredScreen()));
      return;
    }
    const prep = prepareGame(g);
    const rng = new Rng(`facts-${g.id}`);
    const env = envFor(g);
    const division = [...divisions().entries()].find(([, ids]) => ids.includes(game.orgId));
    const lead = game.season.records.get(division[1][0]);
    const standings = division[1].map((id) => {
      const r = game.season.records.get(id);
      const b = gb(lead, r);
      return [W.orgs.get(id).club.city, r.w, r.l, pct(r).toFixed(3).replace(/^0/, ''), b ? b.toFixed(1) : '-', r.last ? `${[...r.last].filter((x) => x === 'W').length}-${[...r.last].filter((x) => x === 'L').length}` : ''];
    });
    const city = (id) => W.clubs.get(id).city;
    const others = gamesOn(g.d).filter((x) => x.level === 'MLB' && x !== g).map((x) => [city(x.away), x.s ? x.s[0] : '', city(x.home), x.s ? x.s[1] : '', x.s ? 'Final' : 'Later']);
    match = matchScreen({
      away: prep.away, home: prep.home, extraRunner: !g.post, env,
      venue: `${home.venue}, ${home.city}`, date: longDate(),
      facts: {
        umpire: env.umpire ?? rng.pick(UMPIRES), attendance: (rng.int(22, 45) * 1000 + rng.int(0, 999)).toLocaleString('en-US'),
        weather: env.weather ?? `${rng.pick(SKIES)}, ${rng.int(12, 29)}°C`,
        game: g.post ? `${ROUND_NAME[series.round]}, game ${series.n + 1}` : `Regular season, game ${played() + 1} of 162`,
      },
      otherGames: others, standings, standingsTitle: division[0],
      playersById: playersMap(prep.away, prep.home), seed: `${g.id}-${game.luck}`, instant, story: storyContext(g),
      onFinish: (eng) => { if (g.s) return; recordGame(prep, eng); finishUserDay(g, eng); import('./continue.js').then((m) => m.safeAutosave()); },
      onDone: done,
    });
    LIVE.clear(); // only today's game can be in progress
    LIVE.set(g.id, match);
    nav.push(match);
  }

  // Result Only: the game is played in an instant and the match screen opens on the final box score
  const quick = () => watch(true);

  const played = () => game.season.games.filter((x) => x.level === 'MLB' && !x.post && x.s && (x.home === game.orgId || x.away === game.orgId)).length;
  const club = me.club;
  const panel = h('div', { class: 'cm-panel grow cm-pad matchday' });
  function draw() {
    facts();
    const yr = game.season.year;
    const rate = (v) => (v == null ? '' : v.toFixed(3).replace(/^0/, ''));
    // regular season (as before), the whole postseason so far, or only this series
    const scope = series ? SCOPE : 'reg';
    const scoped = (p, kind) => {
      const rows = (p.ps?.[kind] || []).filter((r) => r[0] === yr && (scope === 'post' || r[1] === series.round));
      if (!rows.length) return null;
      const sum = [yr, '', ''];
      HIST[kind].forEach((_, i) => sum.push(rows.reduce((a, r) => a + r[i + 3], 0)));
      return line(kind, sum);
    };
    const batLine = (p) => {
      if (scope !== 'reg') { const x = scoped(p, 'bat'); return x?.pa ? [rate(x.avg), x.hr, rate(x.ops)] : ['', '', '']; }
      const c = seasonLine(p, 'bat', yr, 'MLB'), x = c && c.pa >= 40 ? c : lastSeason(p, 'bat') || c; return x?.pa ? [rate(x.avg), x.hr, rate(x.ops)] : ['', '', ''];
    };
    const armLine = (p) => {
      if (scope !== 'reg') { const x = scoped(p, 'pit'); return x?.outs ? [fix(x.era), ipText(x.outs)] : ['', '']; }
      const c = seasonLine(p, 'pit', yr, 'MLB'), x = c && c.outs >= 15 ? c : lastSeason(p, 'pit') || c; return x?.outs ? [fix(x.era), ipText(x.outs)] : ['', ''];
    };
    const handOf = (side) => (side === 'home' ? sp.away : sp.home)?.throws === 'L' ? 'L' : 'R'; // the hand of the starter that side faces
    /** One club's column: its record, starter, lineup against the other starter, and bullpen. */
    const column = (side) => {
      const club = side === 'home' ? home : away, mine = club.id === game.orgId;
      const o = W.orgs.get(club.org ?? club.id), st = orgState(o.id), hand = handOf(side), starter = sp[side];
      const rows = mine
        ? (problems.length ? expectedLineup(o, st, hand) : (hand === 'L' ? st.lineupL : st.lineupR).map((x) => ({ p: playerIn(o, x.id), pos: x.pos })).filter((x) => x.p))
        : expectedLineup(o, st, hand);
      const pen = [...st.active].map((id) => playerIn(o, id)).filter((p) => p && isPitcher(p) && !p.injury && !st.rotation.includes(p.id) && p.id !== starter?.id)
        .sort((a, b) => ROLE_LIST.indexOf(st.pen[a.id] || 'Middle') - ROLE_LIST.indexOf(st.pen[b.id] || 'Middle'));
      const cls = { Rested: 'cm-g', Tired: 'cm-y', Unavailable: 'cm-r' };
      const th = (c, i) => h('th', { class: i === 0 ? 'l' : '' }, c);
      return h('div', { class: 'md-col' },
        h('div', { class: 'cm-h' }, `${club.city} (${rec(club.id)})`),
        h('table', { class: 'cm-tbl info' }, h('tbody', {}, h('tr', {}, h('td', { class: 'l cm-s' }, 'Starter'), h('td', { class: 'l y' }, starter ? [plink(starter), ` (${starter.throws}HP)`] : 'to be decided'),
          h('td', {}, starter ? (() => { const [e, ip] = armLine(starter); return e ? `${e} ERA, ${ip} IP` : ''; })() : ''),
          h('td', {}, starter && daysRest(starter, g.d) < 4 ? h('span', { class: 'cm-r' }, `${daysRest(starter, g.d)}d rest`) : '')))),
        h('div', { class: 'cm-sub md-sub' }, mine ? `Your lineup v ${hand === 'L' ? 'LHP' : 'RHP'}` : `Likely lineup v ${hand === 'L' ? 'LHP' : 'RHP'}`),
        mine && problems.length ? h('div', { class: 'cm-r md-note' }, `${problems[0]} The assistant will fill it.`) : null,
        h('table', { class: 'cm-tbl md-lu' }, h('thead', {}, h('tr', {}, ['#', 'Pos', 'Player', 'AVG', 'HR', 'OPS'].map((c, i) => h('th', { class: i === 2 ? 'l' : '' }, c)))),
          h('tbody', {}, rows.map((x, i) => h('tr', {}, h('td', {}, i + 1), h('td', { class: 'y' }, x.pos), h('td', { class: 'l' }, plink(x.p, x.p.last)), batLine(x.p).map((c) => h('td', {}, c)))))),
        h('div', { class: 'cm-sub md-sub' }, 'Bullpen: role, ERA, pitches in the last three days, and how fresh'),
        h('table', { class: 'cm-tbl md-pen' }, h('thead', {}, h('tr', {}, ['Pitcher', 'Role', 'ERA', 'Last 3 days', 'Status'].map(th))),
          h('tbody', {}, pen.map((p) => { const st2 = armStatus(p, g.d); const last = [1, 2, 3].map((k) => pitchesOn(p, g.d - k)); return h('tr', {}, h('td', { class: 'l' }, plink(p, p.last)), h('td', { class: 'cm-s' }, st.pen[p.id] || 'Middle'), h('td', {}, armLine(p)[0]), h('td', {}, last.map((n) => n || '-').join(' · ')), h('td', { class: cls[st2] || '' }, st2 === 'Unavailable' ? 'Exhausted' : st2)); }))));
    };
    fill(panel,
      h('div', { class: 'cm-h' }, `${away.full ?? `${away.city} ${away.name}`} at ${home.full ?? `${home.city} ${home.name}`}`),
      h('div', { class: 'cm-sub' }, `${longDate()}, ${home.venue}${series ? `. ${ROUND_NAME[series.round]}, game ${series.n + 1}: ${W.clubs.get(series.hi).city} ${series.wins.hi}, ${W.clubs.get(series.lo).city} ${series.wins.lo}` : ''}`),
      h('div', { class: 'cm-pad btnrow', style: { justifyContent: 'center', margin: '6px 0' } },
        h('button', { class: 'cm-btn go big', onClick: () => watch() }, 'Watch the Game'),
        h('button', { class: 'cm-btn big', onClick: quick }, 'Result Only'),
        h('button', { class: 'cm-btn big', onClick: async () => nav.push((await import('./club-tactics.js')).clubTactics(oppHand === 'L' ? 'lineupL' : 'lineupR')) }, 'Change Lineup'),
        h('button', { class: 'cm-btn big', onClick: async () => nav.push((await import('./club-tactics.js')).clubTactics('pitching')) }, 'Pitching Staff'),
        h('button', { class: 'cm-btn big', onClick: async () => nav.push((await import('./club-tactics.js')).clubTactics('depth')) }, 'Depth Chart')),
      series ? h('div', { class: 'cm-pad btnrow', style: { justifyContent: 'center', margin: '2px 0' } },
        h('span', { class: 'cm-s' }, 'Stats shown:'),
        [['reg', 'Regular season'], ['post', 'Postseason'], ['series', `This series (${ROUND_NAME[series.round]})`]].map(([id, label]) =>
          h('button', { class: 'cm-btn', 'aria-pressed': String(SCOPE === id), onClick: () => { SCOPE = id; draw(); } }, label))) : null,
      h('div', { class: 'md-cols' }, column('away'), column('home')),
      h('p', { class: 'cm-sub' }, 'Changes you make in Tactics or Squad before the first pitch are used in the game. The other club\'s lineup is how its assistant would set it today. You can turn off stopping for your games in Game Options.'));
  }
  draw();
  return {
    el: h('div', { style: { display: 'contents' } }, clubTitle(club, 'Match Day'), panel),
    onShow: draw,
    space: () => { watch(); return true; },
    side: () => clubMenu(null), bg: 'matchday',
  };
}

