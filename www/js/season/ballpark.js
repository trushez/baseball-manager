// Ballparks, weather and umpires. Each major league game is played in its home club's park on a day with its own
// weather and behind a plate umpire with his own strike zone. All three are worked out from the game's id, so they
// are the same every time the game is looked at and nothing is saved.
import { Rng } from '../core/rng.js';
import { fromDayNo } from './calendar.js';

// [home run factor, hit factor, roof, climate]. Factors are around 1: 1.10 means ten per cent more home runs (or
// balls in play falling in) than a typical park. Climate: N cold spring, S warm, C cool all summer (coast), D dome.
const PARKS = {
  AZ: [1.00, 1.02, true, 'S'], ATL: [1.05, 1.00, false, 'S'], ATH: [1.04, 1.02, false, 'S'], BAL: [1.00, 0.99, false, 'N'],
  BOS: [0.97, 1.07, false, 'N'], CHC: [1.00, 1.00, false, 'N'], CWS: [1.08, 0.98, false, 'N'], CIN: [1.22, 1.01, false, 'N'],
  CLE: [0.92, 0.99, false, 'N'], COL: [1.14, 1.12, false, 'N'], DET: [0.95, 1.00, false, 'N'], HOU: [1.02, 1.00, true, 'S'],
  KC: [0.88, 1.03, false, 'N'], LAA: [1.05, 0.97, false, 'S'], LAD: [1.10, 0.99, false, 'S'], MIA: [0.88, 1.00, true, 'S'],
  MIL: [1.04, 0.99, true, 'N'], MIN: [1.02, 1.01, false, 'N'], NYM: [0.95, 0.98, false, 'N'], NYY: [1.10, 0.99, false, 'N'],
  PHI: [1.10, 1.00, false, 'N'], PIT: [0.85, 1.00, false, 'N'], SD: [0.94, 0.98, false, 'C'], SF: [0.84, 0.98, false, 'C'],
  SEA: [0.93, 0.97, true, 'C'], STL: [0.92, 1.00, false, 'N'], TB: [0.94, 0.98, true, 'S'], TEX: [1.02, 1.00, true, 'S'],
  TOR: [1.05, 1.00, true, 'N'], WSH: [1.00, 1.00, false, 'N'],
};
// the average of the thirty is brought to exactly 1 so the league as a whole is not changed
const MEAN = (i) => Object.values(PARKS).reduce((a, p) => a + p[i], 0) / Object.keys(PARKS).length;
const NORM = [MEAN(0), MEAN(1)];
// mean daily high by month (March to October) for each climate, in degrees C
const TEMPS = { N: [8, 13, 19, 24, 27, 26, 21, 13], S: [18, 22, 26, 30, 32, 32, 28, 23], C: [14, 15, 17, 19, 20, 21, 20, 17] };
const SKIES = ['Clear', 'Clear', 'Partly cloudy', 'Partly cloudy', 'Overcast', 'Breezy'];

/** Plate umpires: invented, each with a zone that is a little wide or a little tight, the same every season. */
export const UMPIRES = ['Dale Fenwick', 'Russ Albright', 'Hal Pruett', 'Gene Ostrowski', 'Tom Whitacre', 'Carl Mendes', 'Ray Kessler', 'Lou Barrows', 'Ned Calloway', 'Art Benning',
  'Walt Hargrove', 'Vic Dellinger', 'Stan Okoro', 'Phil Tarrant', 'Marv Sandoval', 'Bud Lachance', 'Otis Reinholt', 'Frank Deveraux', 'Joel Marchetti', 'Wes Brannigan'];
/** How wide his zone runs: below 0 is tight, above 0 is wide. About a quarter of a standard deviation on the log-odds scale. */
export const zoneOf = (name) => new Rng(`ump-${name}`).normal(0, 0.28);

/** Park, weather and umpire for a game record. Minor league games get a neutral park and no weather effect. */
export function envFor(rec) {
  const base = { hr: 1, hit: 1, zone: 0, weather: null, umpire: null, temp: null, roof: false, name: null };
  if (!rec || rec.level !== 'MLB') return base;
  const P = PARKS[rec.home];
  const rng = new Rng(`env-${rec.id}`);
  const umpire = UMPIRES[Math.floor(rng.next() * UMPIRES.length)];
  const zone = zoneOf(umpire);
  if (!P) return { ...base, umpire, zone };
  const month = fromDayNo(rec.d).getMonth(); // 2 (March) to 9 (October)
  const mean = TEMPS[P[3]][Math.min(7, Math.max(0, month - 2))];
  let temp = Math.round(mean + rng.normal(0, 3.5));
  let sky = SKIES[Math.floor(rng.next() * SKIES.length)];
  let wx = P[2] ? 'Roof closed' : sky;
  if (P[2]) temp = 22;
  // warmth carries the ball: about three quarters of a per cent more home runs for each degree above 21
  const carry = P[2] ? 1 : Math.exp(0.0075 * (temp - 21));
  return { hr: (P[0] / NORM[0]) * carry, hit: P[1] / NORM[1], zone, weather: `${wx}, ${temp}°C`, umpire, temp, roof: P[2], name: wx };
}
