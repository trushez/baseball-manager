// The postseason: twelve clubs. Wild Card Series (best of three, all at the higher seed), Division
// Series (best of five), League Championship Series and World Series (best of seven).
import { postseasonVerdict } from './reactions.js';
import { game } from '../state.js';
import { seeds, leagues, pct } from './standings.js';
import { seasonAwards } from './awards.js';
import { writeChronicle } from './chronicle.js';
import { archiveSeason } from './history.js';
import { message } from './inbox.js';
import { fieldNews, seriesOver, championNews, roundNews } from './postseason-news.js';

const ROUNDS = ['WC', 'DS', 'LCS', 'WS'];
export const ROUND_NAME = { WC: 'Wild Card Series', DS: 'Division Series', LCS: 'Championship Series', WS: 'World Series' };
const BEST = { WC: 3, DS: 5, LCS: 7, WS: 7 };
// which games the higher seed hosts
const HOME = { WC: [1, 1, 1], DS: [1, 1, 0, 0, 1], LCS: [1, 1, 0, 0, 0, 1, 1], WS: [1, 1, 0, 0, 0, 1, 1] };

const city = (id) => game.world.orgs.get(id).club.city;
const leagueShort = (l) => (l.startsWith('American') ? 'AL' : 'NL');

export function startPostseason(d) {
  const post = { round: 'WC', start: d, series: [], seeds: {}, champion: null };
  for (const lg of leagues()) {
    const s = seeds(lg);
    post.seeds[lg] = s;
    post.series.push(series('WC', lg, s[2], s[5]), series('WC', lg, s[3], s[4]));
  }
  game.season.post = post;
  fieldNews(post);
}

function series(round, league, hi, lo) {
  return { id: `${round}-${league}-${hi}-${lo}`, round, league, hi, lo, wins: { hi: 0, lo: 0 }, n: 0, winner: null };
}

/** Today's postseason games (created the morning they are played). */
export function schedulePostDay(d) {
  const post = game.season.post;
  if (!post || post.champion || d < post.start) return;
  for (const s of post.series.filter((x) => x.round === post.round && !x.winner)) {
    if (game.season.games.some((g) => g.series === s.id && !g.s)) continue;
    const hiHome = HOME[s.round][s.n] === 1;
    const g = { id: `${game.season.year}-${s.id}-${s.n + 1}`, level: 'MLB', d, post: true, series: s.id,
      home: hiHome ? s.hi : s.lo, away: hiHome ? s.lo : s.hi };
    game.season.games.push(g);
    if (!game.season.byDay.has(d)) game.season.byDay.set(d, []);
    game.season.byDay.get(d).push(g);
  }
}

/** After the day's games: count wins, finish series and rounds. */
export function afterPostDay(d) {
  const post = game.season.post;
  if (!post || post.champion) return;
  for (const g of game.season.byDay.get(d) || []) {
    if (!g.post || !g.s || g.counted) continue;
    g.counted = true;
    const s = post.series.find((x) => x.id === g.series);
    const homeWon = g.s[1] > g.s[0];
    const winner = homeWon ? g.home : g.away;
    s.wins[winner === s.hi ? 'hi' : 'lo']++;
    s.n++;
    const need = Math.ceil(BEST[s.round] / 2);
    if (s.wins.hi === need || s.wins.lo === need) {
      s.winner = s.wins.hi === need ? s.hi : s.lo;
      const loser = s.winner === s.hi ? s.lo : s.hi;
      const mine = s.winner === game.orgId || loser === game.orgId;
      // the story of the series; Continue stops after every series (Game Options), so the postseason can be followed
      if (s.round !== 'WS') seriesOver(s);
      if (mine) postseasonVerdict(s);
    }
  }
  const open = post.series.filter((x) => x.round === post.round && !x.winner);
  if (open.length) return;
  // next round
  const i = ROUNDS.indexOf(post.round);
  if (post.round === 'WS') {
    post.champion = post.series.find((x) => x.round === 'WS').winner;
    championNews(post);
    seasonAwards();
    archiveSeason();
    try { writeChronicle(); } catch (e) { void e; }
    return;
  }
  const next = ROUNDS[i + 1];
  post.round = next;
  post.start = d + 2;
  const R = game.season.records;
  for (const lg of leagues()) {
    const s = post.seeds[lg];
    const won = (round) => post.series.filter((x) => x.round === round && x.league === lg).map((x) => x.winner);
    if (next === 'DS') {
      const wc = post.series.filter((x) => x.round === 'WC' && x.league === lg);
      const w45 = wc.find((x) => x.hi === s[3]).winner, w36 = wc.find((x) => x.hi === s[2]).winner;
      post.series.push(series('DS', lg, s[0], w45), series('DS', lg, s[1], w36));
    }
    if (next === 'LCS') {
      const [a, b] = won('DS');
      const [hi, lo] = s.indexOf(a) < s.indexOf(b) ? [a, b] : [b, a];
      post.series.push(series('LCS', lg, hi, lo));
    }
  }
  if (next === 'WS') {
    const [a, b] = post.series.filter((x) => x.round === 'LCS').map((x) => x.winner);
    const [hi, lo] = pct(R.get(a)) >= pct(R.get(b)) ? [a, b] : [b, a];
    post.series.push(series('WS', 'MLB', hi, lo));
  }
  // the next round's matchups
  roundNews(post, next);
}

