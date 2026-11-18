// The postseason in the papers. The field and the bracket when it is set; a preview of every series
// with the two clubs side by side, the players to watch and the scouts' odds; a report and box score
// for every game played; the story of each series when it ends, with its MVP; and the champions.
import { announceTitle } from './champions.js';
import { crowdLine } from './crowd.js';
import { game, orgState } from '../state.js';
import { fullName, seasonLine, isPitcher } from '../data/world.js';
import { message } from './inbox.js';
import { headline } from './headlines.js';
import { gameReport, boxScore } from './news.js';
import { tboPlus, tbaMinus } from './tb.js';
import { Rng } from '../core/rng.js';

export const ROUND_NAME = { WC: 'Wild Card Series', DS: 'Division Series', LCS: 'Championship Series', WS: 'World Series' };
const BEST = { WC: 3, DS: 5, LCS: 7, WS: 7 };
const NUMW = ['none', 'one', 'two', 'three', 'four', 'five', 'six', 'seven'];
const W = () => game.world;
const club = (id) => W().orgs.get(id).club;
const city = (id) => club(id).city;
const nick = (id) => (club(id).full ?? `${club(id).city} ${club(id).name}`);
const up = (s) => s.toUpperCase();
const lgShort = (l) => (l.startsWith('American') ? 'AL' : 'NL');
const yr = () => game.season.year;
const pct = (v) => `${Math.round(v * 100)}%`;
const rate = (v) => (v == null ? '-' : v.toFixed(3).replace(/^0/, ''));
const ipText = (outs) => `${Math.floor(outs / 3)}.${outs % 3}`;

/** "ALDS", "NL Wild Card Series", "World Series". */
export function roundLabel(s, long = false) {
  if (s.round === 'WS') return 'World Series';
  if (s.round === 'WC') return `${lgShort(s.league)} Wild Card Series`;
  return long ? `${lgShort(s.league)} ${ROUND_NAME[s.round]}` : `${lgShort(s.league)}${s.round === 'LCS' ? 'CS' : s.round}`;
}
const seriesOf = (rec) => game.season.post?.series.find((x) => x.id === rec.series);
const seedOf = (id) => { for (const s of Object.values(game.season.post.seeds)) { const i = s.indexOf(id); if (i >= 0) return i + 1; } return null; };

/** The games played so far in a series, in order. */
const playedIn = (s) => game.season.games.filter((g) => g.series === s.id && g.s).sort((a, b) => a.d - b.d);
function winsIn(s) {
  const w = { [s.hi]: 0, [s.lo]: 0 };
  for (const g of playedIn(s)) w[g.s[1] > g.s[0] ? g.home : g.away]++;
  return w;
}

// ---------- team figures ----------

function teamLine(id) {
  const o = W().orgs.get(id);
  const bat = { pa: 0, ab: 0, h: 0, b2: 0, b3: 0, hr: 0, bb: 0, sb: 0, hbp: 0, sf: 0 };
  const pit = { outs: 0, h: 0, hr: 0, bb: 0, so: 0, er: 0 };
  for (const p of o.players) {
    const b = seasonLine(p, 'bat', yr(), 'MLB');
    if (b) for (const k of Object.keys(bat)) bat[k] += b[k] || 0;
    const t = seasonLine(p, 'pit', yr(), 'MLB');
    if (t) for (const k of Object.keys(pit)) pit[k] += t[k] || 0;
  }
  const obp = (bat.h + bat.bb + bat.hbp) / Math.max(1, bat.ab + bat.bb + bat.hbp + bat.sf);
  const slg = (bat.h + bat.b2 + 2 * bat.b3 + 3 * bat.hr) / Math.max(1, bat.ab);
  return {
    avg: bat.h / Math.max(1, bat.ab), ops: obp + slg, hr: bat.hr,
    tbo: tboPlus(bat, yr()), tba: tbaMinus({ ...pit, season: yr(), level: 'MLB' }, null, yr()),
    era: pit.outs ? (pit.er * 27) / pit.outs : null, k: pit.so,
  };
}
const pyth = (r) => (r.rs ** 1.83) / Math.max(1, r.rs ** 1.83 + r.ra ** 1.83);
/** The chance the first club wins a best-of-n series, from each club's run differential. */
function seriesOdds(a, b, n) {
  const R = game.season.records;
  const pa = pyth(R.get(a)), pb = pyth(R.get(b));
  const p = (pa * (1 - pb)) / (pa * (1 - pb) + pb * (1 - pa));
  const need = Math.ceil(n / 2);
  // win need games before losing need
  let total = 0;
  for (let l = 0; l < need; l++) total += comb(need - 1 + l, l) * p ** need * (1 - p) ** l;
  return total;
}
const comb = (n, k) => { let r = 1; for (let i = 1; i <= k; i++) r = (r * (n - k + i)) / i; return r; };

/** The hitter, starter and closer to watch on a club. */
function toWatch(id) {
  const o = W().orgs.get(id), st = orgState(id);
  const here = o.players.filter((p) => st.active.has(p.id) && !p.injury);
  const hit = here.filter((p) => !isPitcher(p)).map((p) => ({ p, s: seasonLine(p, 'bat', yr(), 'MLB') })).filter((x) => x.s?.pa >= 150)
    .map((x) => ({ ...x, v: tboPlus(x.s, yr()) })).sort((a, b) => b.v - a.v)[0];
  const arms = here.filter(isPitcher).map((p) => ({ p, s: seasonLine(p, 'pit', yr(), 'MLB') })).filter((x) => x.s);
  const ace = arms.filter((x) => x.s.gs >= 8).map((x) => ({ ...x, v: tbaMinus(x.s, x.p, yr()) })).sort((a, b) => a.v - b.v)[0];
  const closer = arms.filter((x) => x.s.sv >= 5).sort((a, b) => b.s.sv - a.s.sv)[0];
  return { hit, ace, closer };
}

// ---------- the field ----------

/** When the field is set: the seeds in each league, and what it means for you. */
export function fieldNews(post) {
  const R = game.season.records;
  const me = game.orgId;
  const parts = [{ p: `The regular season is over and twelve clubs go on. In each league the top two division winners have a bye to the Division Series, while the third division winner and the three Wild Cards play a best-of-three Wild Card Series, every game at the higher seed. After that it is best of five, then best of seven in the Championship Series and the World Series.` }];
  for (const [lg, seeds] of Object.entries(post.seeds)) {
    parts.push({ head: [`${lgShort(lg)} seed`, 'Club', 'W-L', 'Run diff', 'Last 10', 'Starts in'], rows: seeds.map((id, i) => {
      const r = R.get(id);
      const l10 = r.last.slice(-10);
      return [String(i + 1), nick(id), `${r.w}-${r.l}`, `${r.rs - r.ra > 0 ? '+' : ''}${r.rs - r.ra}`, `${[...l10].filter((c) => c === 'W').length}-${[...l10].filter((c) => c === 'L').length}`, i < 2 ? 'Division Series (bye)' : 'Wild Card Series'];
    }) });
    parts.push({ p: `${lgShort(lg)} Wild Card Series: ${city(seeds[2])} v ${city(seeds[5])}, ${city(seeds[3])} v ${city(seeds[4])}. ${city(seeds[0])} wait for the ${city(seeds[3])}-${city(seeds[4])} winner; ${city(seeds[1])} for the ${city(seeds[2])}-${city(seeds[5])} winner.` });
  }
  headline('THE POSTSEASON FIELD IS SET');
  message({ cat: 'league', important: true, quiet: true, title: 'The postseason field is set', parts });

  // your club
  const seed = seedOf(me);
  const r = R.get(me);
  if (seed) {
    const lg = Object.keys(post.seeds).find((l) => post.seeds[l].includes(me));
    const s = post.seeds[lg];
    const opp = { 3: s[5], 4: s[4], 5: s[3], 6: s[2] }[seed];
    message({ cat: 'club', important: true, quiet: true, title: `${city(me)} are in the postseason`,
      parts: [
        { p: `${nick(me)} finish ${r.w}-${r.l} and go into the postseason as the number ${seed} seed in the ${lgShort(lg)}.` },
        { p: seed <= 2 ? `That is worth a bye: no Wild Card Series, a few days to rest the pitching staff, and home advantage in the Division Series against the winner of ${seed === 1 ? `${city(s[3])} and ${city(s[4])}` : `${city(s[2])} and ${city(s[5])}`}.`
          : `First comes the Wild Card Series against ${nick(opp)}, best of three, ${seed === 3 || seed === 4 ? 'every game at home' : `every game in ${city(opp)}`}. Lose two and the season is over.` },
        { p: 'The postseason rosters are the active roster: set your rotation and bullpen for short series, where the top three starters and the best relievers carry the load.' },
      ] });
  } else {
    const lg = club(me).league;
    const last = post.seeds[lg]?.[5];
    const lr = last && R.get(last);
    const gb = lr ? ((lr.w - r.w) + (r.l - lr.l)) / 2 : null;
    message({ cat: 'club', important: true, quiet: true, title: `${city(me)} miss the postseason`,
      parts: [
        { p: `${nick(me)} finish ${r.w}-${r.l} and will not play in October.${lr ? ` The last place went to ${city(last)} at ${lr.w}-${lr.l}, ${gb > 0 ? `${gb % 1 ? gb.toFixed(1) : NUMW[gb] ?? gb} game${gb === 1 ? '' : 's'} better` : 'on the tie-breakers'}.` : ''}` },
        { p: 'The postseason goes on without you. Its news will keep arriving here, and the winter follows.' },
      ] });
  }
  for (const s of post.series.filter((x) => x.round === 'WC')) seriesPreview(s);
}

// ---------- previews ----------

export function seriesPreview(s) {
  const R = game.season.records;
  const mine = s.hi === game.orgId || s.lo === game.orgId;
  const n = BEST[s.round];
  const a = teamLine(s.hi), b = teamLine(s.lo);
  const ra = R.get(s.hi), rb = R.get(s.lo);
  const odds = seriesOdds(s.hi, s.lo, n);
  const fav = odds >= 0.5 ? s.hi : s.lo, favOdds = Math.max(odds, 1 - odds);
  // the season series between them
  const met = game.season.games.filter((g) => g.level === 'MLB' && !g.post && g.s && [g.home, g.away].includes(s.hi) && [g.home, g.away].includes(s.lo));
  const hiWon = met.filter((g) => (g.s[1] > g.s[0] ? g.home : g.away) === s.hi).length;
  const rng = new Rng(`pv-${s.id}`);
  const label = roundLabel(s, true);
  const opener = rng.pick([
    `${nick(s.hi)} (${ra.w}-${ra.l}) meet ${nick(s.lo)} (${rb.w}-${rb.l}) in the ${label}, best of ${NUMW[n]}.`,
    `The ${label} brings together ${nick(s.hi)} and ${nick(s.lo)}: best of ${NUMW[n]}, with ${city(s.hi)} at home in ${s.round === 'WC' ? 'every game' : 'the first two games and any decider'}.`,
    `Best of ${NUMW[n]} for a place in the ${s.round === 'WS' ? 'record books' : 'next round'}: ${nick(s.hi)} against ${nick(s.lo)}.`,
  ]);
  const h2h = met.length ? `They met ${NUMW[met.length] ?? met.length} times in the regular season and ${hiWon === met.length - hiWon ? 'split them' : `${city(hiWon > met.length - hiWon ? s.hi : s.lo)} won ${Math.max(hiWon, met.length - hiWon)} of them`}.` : 'They did not meet in the regular season.';
  const why = [];
  if (a.tbo != null && b.tbo != null && Math.abs(a.tbo - b.tbo) >= 5) why.push(`${city(a.tbo > b.tbo ? s.hi : s.lo)} have the better lineup (team TBO9+ ${Math.max(a.tbo, b.tbo)} against ${Math.min(a.tbo, b.tbo)})`);
  if (a.tba != null && b.tba != null && Math.abs(a.tba - b.tba) >= 5) why.push(`${city(a.tba < b.tba ? s.hi : s.lo)} the stronger pitching (team TBA9- ${Math.min(a.tba, b.tba)} against ${Math.max(a.tba, b.tba)})`);
  const scouts = `The scouts make ${city(fav)} ${favOdds >= 0.65 ? 'clear favourites' : favOdds >= 0.55 ? 'favourites' : 'the slightest of favourites'}, ${pct(favOdds)} to win the series.`;
  const watch = (id) => {
    const t = toWatch(id);
    return [t.hit ? { pid: t.hit.p.id, t: `${fullName(t.hit.p)}: ${rate(t.hit.s.avg)}, ${t.hit.s.hr} HR, TBO9+ ${t.hit.v}` } : '-',
      t.ace ? { pid: t.ace.p.id, t: `${fullName(t.ace.p)}: ${t.ace.s.w}-${t.ace.s.l}, ${t.ace.s.era.toFixed(2)} ERA, TBA9- ${t.ace.v}` } : '-',
      t.closer ? { pid: t.closer.p.id, t: `${fullName(t.closer.p)}: ${t.closer.s.sv} saves` } : '-'];
  };
  const wa = watch(s.hi), wb = watch(s.lo);
  const parts = [
    { p: `${opener} ${h2h}` },
    { p: `${why.length ? `${why.join(', and ')}. ` : 'There is little between them on paper. '}${scouts}` },
    { head: ['', `${city(s.hi)} (${seedOf(s.hi) ?? ''})`, `${city(s.lo)} (${seedOf(s.lo) ?? ''})`], rows: [
      ['Record', `${ra.w}-${ra.l}`, `${rb.w}-${rb.l}`],
      ['Runs scored', ra.rs, rb.rs], ['Runs allowed', ra.ra, rb.ra],
      ['Home / road', `${ra.hw}-${ra.hl} / ${ra.aw}-${ra.al}`, `${rb.hw}-${rb.hl} / ${rb.aw}-${rb.al}`],
      ['Team AVG / OPS', `${rate(a.avg)} / ${rate(a.ops)}`, `${rate(b.avg)} / ${rate(b.ops)}`],
      ['Home runs', a.hr, b.hr],
      ['Team TBO9+', a.tbo ?? '-', b.tbo ?? '-'], ['Team TBA9-', a.tba ?? '-', b.tba ?? '-'],
      ['Team ERA', a.era?.toFixed(2) ?? '-', b.era?.toFixed(2) ?? '-'],
      ['Best hitter', wa[0], wb[0]], ['Ace', wa[1], wb[1]], ['Closer', wa[2], wb[2]],
      ['Chance to win', pct(odds), pct(1 - odds)],
    ] },
  ];
  message({ cat: mine ? 'club' : 'league', important: mine, quiet: true, title: `${roundLabel(s)} preview: ${city(s.hi)} v ${city(s.lo)}`, parts });
  if (s.round !== 'WS') headline(`${up(roundLabel(s))}: ${up(city(s.hi))} V ${up(city(s.lo))}`, mine);
}

// ---------- each game ----------

/** After every postseason game: the series so far, the report and the box score. */
export function postGame(rec, eng) {
  const s = seriesOf(rec);
  if (!s) return;
  const mine = rec.home === game.orgId || rec.away === game.orgId;
  addPerf(s, rec, eng);
  const games = playedIn(s);
  const no = games.indexOf(rec) + 1;
  const w = winsIn(s);
  const need = Math.ceil(BEST[s.round] / 2);
  const [a, hm] = rec.s;
  const winner = hm > a ? rec.home : rec.away, loser = winner === rec.home ? rec.away : rec.home;
  const lead = w[s.hi] === w[s.lo] ? null : w[s.hi] > w[s.lo] ? s.hi : s.lo;
  const hiW = Math.max(w[s.hi], w[s.lo]), loW = Math.min(w[s.hi], w[s.lo]);
  const over = hiW === need;
  const state = over ? `${city(winner)} win the series ${hiW}-${loW}` : lead ? `${city(lead)} lead ${hiW}-${loW}` : `series level at ${hiW}-${loW}`;
  const label = roundLabel(s);
  const rng = new Rng(`pg-${rec.id}`);
  let head;
  if (over) head = `${up(city(winner))} ${s.round === 'WS' ? 'WIN THE WORLD SERIES' : `TAKE THE ${up(label)}`}`;
  else if (hiW === need - 1 && loW === need - 1) head = rng.pick([`${up(label)} GOES THE DISTANCE: ${up(city(winner))} FORCE A DECIDER`, `IT ALL COMES DOWN TO ONE GAME: ${up(city(s.hi))} V ${up(city(s.lo))}`]);
  else if (lead === winner && hiW === need - 1) head = rng.pick([`${up(city(winner))} ONE WIN FROM ${s.round === 'WS' ? 'THE TITLE' : 'THE NEXT ROUND'}`, `${up(city(loser))} ON THE BRINK`]);
  else if (lead && lead !== winner) head = `${up(city(winner))} HIT BACK: ${up(city(lead))} LEAD ${hiW}-${loW}`;
  else if (!lead) head = `${up(city(winner))} LEVEL THE ${up(label)} AT ${hiW}-${loW}`;
  else head = rng.pick([`${up(city(winner))} TAKE ${hiW}-${loW} LEAD IN ${up(label)}`, `${up(city(winner))} BEAT ${up(city(loser))} ${Math.max(a, hm)}-${Math.min(a, hm)} IN GAME ${no}`]);

  const parts = [];
  const before = `${label} Game ${no}. ${over ? `${nick(winner)} win the series ${hiW}-${loW}${s.round === 'WS' ? ' and are champions of baseball' : ` and go on to the ${nextRoundName(s)}`}.` : lead ? `${city(lead)} now lead the series ${hiW}-${loW}${hiW === need - 1 ? `, one win from ${s.round === 'WS' ? 'the title' : 'going through'}` : ''}.` : `The series is level at ${hiW}-${loW}.`}`;
  parts.push({ p: before });
  for (const t of gameReport(rec, eng)) parts.push({ p: t });
  if (rec.att) parts.push({ p: `${city(rec.home)}: ${crowdLine(rec)}` });
  parts.push({ box: rec.box || boxScore(eng, rec) });
  // the next game
  if (!over) {
    parts.push({ p: `Game ${no + 1} is ${s.round === 'WC' ? 'tomorrow' : 'next'}${hiW === need - 1 && loW === need - 1 ? ', and the loser goes home' : ''}.` });
  }
  message({ cat: mine ? 'result' : 'league', important: mine, title: `${label} Game ${no}: ${city(rec.away)} ${a}, ${city(rec.home)} ${hm} (${state})`, headline: head, parts, won: mine ? winner === game.orgId : undefined });
  // the box scores of other clubs' games are kept for the latest 30 only
  const boxed = game.inbox.filter((m) => m.cat === 'league' && m.parts?.some((x) => x.box));
  for (const m of boxed.slice(0, Math.max(0, boxed.length - 30))) m.parts = m.parts.filter((x) => !x.box);
}
const nextRoundName = (s) => ({ WC: 'Division Series', DS: 'Championship Series', LCS: 'World Series' }[s.round]);

/** Each player's work in a series, for the MVP. */
function addPerf(s, rec, eng) {
  s.perf ||= {};
  for (const key of ['away', 'home']) {
    const t = eng.side[key].team;
    for (const p of [...t.lineup.map((x) => x.player), ...t.bench, t.starter, ...t.bullpen]) {
      const L = p && eng.stats.get(p.id);
      if (!L || (!L.PA && !L.BF)) continue;
      const x = (s.perf[p.id] ||= { c: rec[key], ab: 0, h: 0, hr: 0, rbi: 0, r: 0, bb: 0, xb: 0, outs: 0, ph: 0, er: 0, k: 0, w: 0, sv: 0 });
      x.ab += L.AB || 0; x.h += L.H || 0; x.hr += L.HR || 0; x.rbi += L.RBI || 0; x.r += L.R || 0; x.bb += L.BB || 0;
      x.xb += (L['2B'] || 0) + 2 * (L['3B'] || 0);
      x.outs += L.pOuts || 0; x.ph += L.pH || 0; x.er += L.pR || 0; x.k += L.pK || 0;
      if (rec.w === p.id) x.w++;
      if (rec.sv === p.id) x.sv++;
    }
  }
}
function mvp(s) {
  const score = (x) => x.h + x.xb + 3 * x.hr + x.rbi + 0.6 * x.r + 0.4 * x.bb + (x.outs ? x.outs / 3 - 2.2 * x.er + 0.4 * x.k + 2 * x.w + 1.5 * x.sv : 0);
  const best = Object.entries(s.perf || {}).filter(([, x]) => x.c === s.winner).sort((a, b) => score(b[1]) - score(a[1]))[0];
  if (!best) return null;
  const [id, x] = best;
  const p = W().players.get(id);
  if (!p) return null;
  const line = x.outs >= 9 && x.ab < 6
    ? `${x.w ? `${x.w}-0, ` : ''}${ipText(x.outs)} innings, ${x.er} runs, ${x.k} strikeouts${x.sv ? `, ${x.sv} save${x.sv > 1 ? 's' : ''}` : ''}`
    : `${x.h} for ${x.ab}${x.hr ? `, ${x.hr} home run${x.hr > 1 ? 's' : ''}` : ''}, ${x.rbi} RBI`;
  return { p, line };
}

// ---------- each series ----------

/** When a series ends: the story of it, game by game, and its MVP. */
export function seriesOver(s) {
  const loser = s.winner === s.hi ? s.lo : s.hi;
  const mine = s.winner === game.orgId || loser === game.orgId;
  const games = playedIn(s);
  const w = winsIn(s);
  const score = `${w[s.winner]}-${w[loser]}`;
  const rng = new Rng(`so-${s.id}`);
  // how it went: a sweep, from behind, the distance
  let run = { [s.winner]: 0, [loser]: 0 }, worst = 0;
  for (const g of games) { run[g.s[1] > g.s[0] ? g.home : g.away]++; worst = Math.max(worst, run[loser] - run[s.winner]); }
  const need = Math.ceil(BEST[s.round] / 2);
  const label = roundLabel(s, true);
  let story;
  if (w[loser] === 0) story = rng.pick([`${nick(s.winner)} swept ${nick(loser)} out of the ${label}, ${score}.`, `It was over quickly: ${nick(s.winner)} won the ${label} without losing a game, ${score} against ${city(loser)}.`]);
  else if (worst >= 2) story = `${nick(s.winner)} came back from ${worst === 2 && need === 3 ? 'two games down' : `${worst} games down`} to beat ${nick(loser)} ${score} in the ${label}, one of the great escapes.`;
  else if (w[loser] === need - 1) story = rng.pick([`${nick(s.winner)} won the ${label} in the deciding game, ${score} over ${nick(loser)}.`, `All the way to the last game, and ${nick(s.winner)} came through: ${score} against ${city(loser)} in the ${label}.`]);
  else story = rng.pick([`${nick(s.winner)} beat ${nick(loser)} ${score} to take the ${label}.`, `${nick(s.winner)} were too good for ${city(loser)}, winning the ${label} ${score}.`]);
  const m = mvp(s);
  if (m && !s.mvp) {
    s.mvp = m.p.id;
    // the honours list keeps the championship series and the World Series; the earlier rounds' MVPs are named in the news and the bracket
    if (s.round === 'LCS' || s.round === 'WS') (m.p.hon ||= []).push(`${game.season.year} ${s.round === 'WS' ? 'World Series' : `${s.league.startsWith('American') ? 'AL' : 'NL'}CS`} MVP`);
  }
  const parts = [{ p: story }];
  if (m) parts.push({ p: `${fullName(m.p)} was the series MVP: ${m.line}.` });
  parts.push({ head: ['Game', 'Score', 'Winner', 'Winning pitcher'], rows: games.map((g, i) => {
    const win = g.s[1] > g.s[0] ? g.home : g.away;
    const wp = W().players.get(g.w);
    return [String(i + 1), `${city(g.away)} ${g.s[0]}, ${city(g.home)} ${g.s[1]}${g.inn > 9 ? ` (${g.inn})` : ''}`, city(win), wp ? { pid: wp.id, t: fullName(wp) } : '-'];
  }) });
  if (s.round !== 'WS') parts.push({ p: s.winner === game.orgId ? `On to the ${nextRoundName(s)}.` : loser === game.orgId ? `The season is over for the ${nick(loser)}.` : `${city(s.winner)} go on to the ${nextRoundName(s)}; ${city(loser)}'s season is over.` });
  if (m) headline(`${up(m.p.last)} NAMED ${up(roundLabel(s))} MVP`, mine);
  if (s.round === 'WS') return { parts, m };
  message({ cat: mine ? 'club' : 'league', important: mine, stop: game.settings.stops.postseason !== false, quiet: true,
    title: `${city(s.winner)} beat ${city(loser)} ${score} in the ${s.round === 'WS' ? 'World Series' : roundLabel(s, true)}`, parts });
  return { parts, m };
}

/** The champions. */
export function championNews(post) {
  const ws = post.series.find((x) => x.round === 'WS');
  const champ = post.champion, loser = champ === ws.hi ? ws.lo : ws.hi;
  const mine = champ === game.orgId;
  const { parts: wsParts, m } = seriesOver(ws);
  const r = game.season.records.get(champ);
  const path = post.series.filter((x) => x.winner && (x.hi === champ || x.lo === champ)).map((x) => {
    const opp = x.hi === champ ? x.lo : x.hi;
    const w = winsIn(x);
    return [roundLabel(x, true), nick(opp), `Won ${w[champ]}-${w[opp]}`];
  });
  const rng = new Rng(`champ-${game.season.year}`);
  const parts = [
    { p: mine ? rng.pick([
      `The ${nick(champ)} are champions of baseball. ${game.manager} has done it: from ${r.w}-${r.l} in the regular season to the last out of the World Series, and the city will not sleep tonight.`,
      `World champions. The ${nick(champ)} beat ${nick(loser)} to win the ${game.season.year} World Series, and the players carry ${game.manager} off the field.`,
    ]) : `The ${nick(champ)} have won the ${game.season.year} World Series, beating ${nick(loser)}. They were ${r.w}-${r.l} in the regular season.` },
    ...wsParts,
    { p: `${city(champ)}'s road to the title:` },
    { head: ['Round', 'Opponent', 'Result'], rows: path },
  ];
  if (mine) parts.push({ p: 'There will be a parade through the city, and the owner has already called to offer his congratulations. Enjoy it: the winter will come soon enough.' });
  if (mine || loser === game.orgId) announceTitle({ champ, loser, mvp: m?.p.id });
  headline(`${up(city(champ))} ARE WORLD CHAMPIONS`, mine);
  if (m) headline(`${up(m.p.last)} IS WORLD SERIES MVP`, mine);
  message({ cat: mine ? 'club' : 'league', important: true, stop: true, quiet: true,
    title: mine ? `WORLD CHAMPIONS! ${nick(champ)} win the ${game.season.year} World Series` : `${nick(champ)} win the ${game.season.year} World Series`, parts });
}

/** At the start of each round: the bracket so far and a preview of each series. */
export function roundNews(post, next) {
  const ups = post.series.filter((x) => x.round === next);
  const mine = ups.some((x) => x.hi === game.orgId || x.lo === game.orgId);
  const rows = post.series.filter((x) => x.winner).map((x) => {
    const w = winsIn(x);
    const loser = x.winner === x.hi ? x.lo : x.hi;
    return [roundLabel(x, true), `${city(x.winner)} beat ${city(loser)}`, `${w[x.winner]}-${w[loser]}`];
  });
  const what = next === 'WS' ? 'The World Series' : `The ${ROUND_NAME[next]}s`;
  message({ cat: mine ? 'club' : 'league', quiet: true, title: `${what}: ${ups.map((x) => `${city(x.hi)} v ${city(x.lo)}`).join(', ')}`,
    parts: [
      { p: `${what} start${ups.length === 1 ? 's' : ''} in two days, best of ${NUMW[BEST[next]]}. ${ups.map((x) => `${city(x.hi)} have home advantage against ${city(x.lo)}.`).join(' ')}` },
      { p: 'The postseason so far:' },
      { head: ['Round', 'Series', 'Games'], rows },
    ] });
  headline(next === 'WS' ? `THE WORLD SERIES: ${up(city(ups[0].hi))} V ${up(city(ups[0].lo))}` : `${up(ROUND_NAME[next])}S SET`, mine);
  for (const s of ups) seriesPreview(s);
}
