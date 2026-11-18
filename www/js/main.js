// Entry point: load the database, then the new-game screen. Starting a game opens your club.
import { createShell } from './ui/shell.js';
import { h } from './ui/dom.js';
import { nav } from './ui/nav.js';
import { loadWorld, listSets } from './data/world.js';
import { game, dayName, shortDate } from './state.js';
import './club/depth.js';
import { startScreen } from './ui/start-screen.js';
import { clubMenu } from './ui/menu.js';

import { splash } from './ui/splash.js';
import { installErrorHandling } from './ui/errors.js';
import { applyLayout } from './ui/layout.js';
applyLayout(); // fill the window, or the centred column chosen in Game Options
import { installAppGuards } from './ui/app-guards.js';

installErrorHandling();
import('./brand.js').then((b) => b.installBranding()); // the game's own league and award names with the fictional players
installAppGuards();

const app = document.getElementById('app');
const splashDone = splash(); // the logos play over the load, and can be clicked through
app.replaceChildren(h('div', { class: 'loading' }, 'Loading players...'));

try {
  game.world = await loadWorld('data/');
} catch (e) {
  const dev = /^(localhost|127\.)/.test(location.hostname);
  app.replaceChildren(h('div', { class: 'loading' }, `The player database could not be loaded (${e.message}). ${dev ? 'Run "npm run db" and reload.' : 'Reinstall the game to repair it.'}`));
  throw e;
}

game.defaultData = game.world.dataInfo;

createShell(app, { day: () => dayName(), date: () => shortDate(), menu: () => clubMenu(), org: () => game.orgId, club: () => (game.orgId ? game.world.orgs.get(game.orgId)?.club : null) });
import('./ui/mobile.js').then((m) => { m.watchTables(app); m.watchTabs(app); }).catch(() => {});

const begin = async () => {
  await (await import('./season/newgame.js')).startCareer();
  const { inboxScreen } = await import('./ui/inbox-screen.js');
  nav.reset(inboxScreen());
};
const sets = await listSets('data/');
nav.reset(startScreen(begin, sets));
// the title screen sits over the New Game screen until the player chooses a way in
await splashDone;
const { titleScreen } = await import('./ui/title-screen.js');
titleScreen({ newGame: () => nav.reset(startScreen(begin, sets)) });
