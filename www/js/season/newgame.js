// A new career: the one place that turns a freshly loaded world into a game ready for its first winter.
// The New Game screen calls it with the manager and club chosen; the simulation tools call it too, so
// they always start from the same state as a real game.
import { game, resetGame, orgState } from '../state.js';
import '../club/depth.js'; // sets up the clubs' rosters (registers itself with state.js)
import { applySetup } from './setup.js';
import { initAbility, initStaff } from './ability.js';
import { initScouts } from './scouting.js';
import { initIntake } from './intake.js';
import { message } from './inbox.js';
import { ensureManagers } from './history.js';
import { jobsInit } from './jobs.js';
import { realHonours } from '../data/honours.js';
import { facilities } from './facilities.js';
import { budget, ownerLetter } from './finance.js';
import { startWinter } from './winter.js';

/**
 * Start a career. Uses game.world, game.manager, game.orgId and the New Game choices already set
 * (game.startBg, game.startRoute); everything else starts blank. quiet: no welcome letters; winter: false
 * leaves the winter unopened, for tools that go straight to Spring Training.
 */
export function startCareer({ quiet = false, settings = null, winter = true } = {}) {
  const { world, defaultData, manager, orgId, startBg, startRoute } = game;
  // the options set before the start (a challenge's difficulty, say) carry into the career
  const kept = { ...game.settings };
  resetGame({ world, defaultData, manager, orgId, startBg, startRoute });
  Object.assign(game.settings, kept);
  if (settings) Object.assign(game.settings, settings);
  // real-world facts the roster data can't hold (long injuries and the like)
  try { if (world.setup) applySetup(world, world.setup); } catch (e) { console.warn('setup.json not applied', e); }
  // hidden potential for every player, and the moulds for the young players who arrive each winter
  initAbility();
  initStaff();
  initScouts();
  initIntake();
  // every club's assistant sets up its roster now, so all levels and lineups are consistent from day one
  for (const id of world.orgs.keys()) orgState(id);
  ensureManagers();
  jobsInit({ bg: startBg, route: startRoute });
  const club = world.orgs.get(orgId).club;
  const before = realHonours()?.managers?.[orgId]?.name;
  if (!quiet) message({
    cat: 'club', important: true, title: `Welcome to the ${club.full ?? `${club.city} ${club.name}`}`,
    body: `The board welcomes ${manager} as manager${before ? `, taking over from ${before}` : ''}. The 2026 season is over and the winter lies ahead: look over the squad, then press Continue Game to decide on your free agents and go to Spring Training.`,
  });
  for (const id of world.orgs.keys()) if (world.mlb.some((c) => c.org === id)) facilities(id);
  // every owner sets his budget for 2027; yours writes to you
  for (const id of world.orgs.keys()) budget(id, 2027);
  if (!quiet) message({ cat: 'club', important: true, title: 'A letter from the owner: the 2027 budget', body: ownerLetter(game.orgId, 2027) });
  if (winter) startWinter();
  if (!quiet) message({
    cat: 'club', important: true, title: 'How to Play',
    body: 'If you are new to the game, or to baseball, How to Play walks you through it in short lessons: what to do each time Continue stops, the rules on the field, the roster rules, how contracts work and why young players are cheap, how to build a squad within the budget, and what each part of the year asks of you. It opens with a page on your own club as it stands today. You will find it under Game Options at any time.',
  });
}
