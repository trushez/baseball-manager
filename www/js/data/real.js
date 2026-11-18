// Builds playable clubs from the real-player database (game/data/players.json and teams.json).
// Picks a lineup by position, a five-man rotation and a bullpen. Where a club is short, because the
// stats-only database has few relievers, it fills the gap with replacement-level generated players.
import { Rng } from '../core/rng.js';
import { makeHitter, makePitcher } from './generate.js';

// Which fielding positions each listed position can cover, best fit first. The stats-only database
// lists '2B' for anyone in the 2B/3B/CF bracket and 'RF' for corner outfielders.
const CAN_PLAY = {
  C: ['C'], '1B': ['1B'], '2B': ['2B', '3B', 'CF', 'SS'], '3B': ['3B', '1B', '2B'], SS: ['SS', '2B', '3B'],
  LF: ['LF', 'RF', '1B'], CF: ['CF', 'LF', 'RF'], RF: ['RF', 'LF', '1B'], OF: ['LF', 'CF', 'RF'], IF: ['2B', '3B', 'SS'], DH: [],
};
const FIELD = ['C', 'SS', 'CF', '2B', '3B', 'RF', 'LF', '1B'];

const bat = (p) => p.r.contact + p.r.power + p.r.eye + p.r.avoidK + 0.3 * p.r.speed;
const arm = (p) => p.r.stuff + p.r.movement + p.r.control;

function name(p) { return { ...p, first: p.first ?? '', last: p.last ?? '' }; }

/** Club in the same shape as generate.js makeTeam, ready for gameTeam(). */
export function buildClub(teamInfo, allPlayers, seed = 'fill') {
  const rng = new Rng(`${seed}-${teamInfo.id}`);
  const mine = allPlayers.filter((p) => p.team === teamInfo.id).map(name);
  const hitters = mine.filter((p) => p.kind === 'bat').sort((a, b) => bat(b) - bat(a));
  const pitchers = mine.filter((p) => p.kind === 'pit').sort((a, b) => arm(b) - arm(a));

  // fill each field position with the best hitter who can play it, scarce positions first
  const used = new Set();
  const lineup = [];
  for (const pos of FIELD) {
    const p = hitters.find((h) => !used.has(h.id) && (h.pos === pos || (CAN_PLAY[h.pos] || []).includes(pos)));
    const pick = p ?? makeHitter(rng, pos, 42);
    used.add(pick.id);
    lineup.push({ player: { ...pick, pos }, pos });
  }
  const dh = hitters.find((h) => !used.has(h.id)) ?? makeHitter(rng, 'DH', 42);
  used.add(dh.id);
  lineup.push({ player: { ...dh, pos: 'DH' }, pos: 'DH' });

  const bench = hitters.filter((h) => !used.has(h.id)).slice(0, 4);
  while (bench.length < 4) bench.push(makeHitter(rng, ['C', 'SS', 'CF', '1B'][bench.length], 42));

  // batting order as in generate.js: best on-base types first, power in the middle
  const score = (x) => x.player.r.contact + x.player.r.eye + x.player.r.power;
  const s = [...lineup].sort((a, b) => score(b) - score(a));
  const order = [s[2], s[1], s[0], s[3], s[4], s[5], s[6], s[7], s[8]];

  const starters = pitchers.filter((p) => p.role === 'Starter');
  const relievers = pitchers.filter((p) => p.role !== 'Starter');
  const rotation = starters.slice(0, 5);
  while (rotation.length < 5) rotation.push(makePitcher(rng, 'Starter', 42));
  relievers.push(...starters.slice(5));
  const roles = ['Closer', 'Setup', 'Matchup', 'Middle', 'Middle', 'Middle', 'Long', 'Long'];
  const bullpen = roles.map((role, i) => (relievers[i] ? { ...relievers[i], role } : makePitcher(rng, role, 44)));

  return {
    id: teamInfo.id, city: teamInfo.city, full: teamInfo.full, name: teamInfo.name, abbr: teamInfo.abbr, kitA: teamInfo.kitA, kitB: teamInfo.kitB,
    acc: teamInfo.kitA, lineup: order.map((x) => ({ player: x.player, pos: x.pos })), bench, rotation, bullpen,
    filled: lineup.filter((x) => !mine.some((m) => m.id === x.player.id)).length,
  };
}

/** Every major league club from the database. */
export function buildLeague(teams, players, seed) {
  return teams.filter((t) => t.level === 'MLB').map((t) => buildClub(t, players, seed));
}
