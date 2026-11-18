// Arbitration as a process. For each case the player files a figure and the club files a lower one. You can
// settle anywhere between the two before the hearing; if you do not, a panel picks whichever figure is closer
// to what players of his record are worth, and the player is left sore either way, more so if he loses.
import { Rng } from '../core/rng.js';
import { game } from '../state.js';
import { arbitrationSalary, LEAGUE_MIN } from './value.js';

const r25 = (v) => Math.round(v / 25000) * 25000;

/** The two filed figures and what the panel would think he is worth. `yr` is 'A1' to 'A4'. */
export function figures(p, yr) {
  const worth = arbitrationSalary(p, yr);
  const prev = p.contract?.aav || LEAGUE_MIN;
  const player = r25(Math.max(worth * 1.15, prev * 1.1));
  const club = r25(Math.max(prev * 1.0, worth * 0.85, LEAGUE_MIN));
  return { worth, player: Math.max(player, club + 25000), club };
}

/** Figures you can settle at, from the club's to the player's in steps. */
export function settlePoints(p, yr) {
  const f = figures(p, yr);
  return [0, 0.25, 0.5, 0.75, 1].map((x) => r25(f.club + (f.player - f.club) * x));
}

/** The panel's decision. Returns { salary, won: 'player' | 'club' }. */
export function hearing(p, yr) {
  const f = figures(p, yr);
  const rng = new Rng(`hearing-${p.id}-${game.year}`);
  const view = f.worth * (1 + rng.normal(0, 0.06));
  const playerWins = Math.abs(f.player - view) < Math.abs(f.club - view);
  return { salary: playerWins ? f.player : f.club, won: playerWins ? 'player' : 'club' };
}
