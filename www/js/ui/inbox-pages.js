// The page a news item is about, so a message with information in it can open that page. Matched on the title,
// first match wins. Each entry: [pattern, button label, loader for the screen].
import { nav } from './nav.js';

const tx = (tab) => async () => (await import('./transfers-screen.js')).transfersScreen(tab);
const fx = (tab) => async () => (await import('./fixtures-screen.js')).fixturesScreen(tab);

const PAGES = [
  [/^How to Play$/, 'How to Play', async () => { (await import('./tutorial.js')).openTutorial('now'); return null; }],
  [/^Scouting: .* in |has finished in|has a hunch|retires|leaves for|take your head of analytics|hire /, 'Scouts', async () => (await import('./scouting-screen.js')).scoutingScreen()],
  [/Analytics|analytics/, 'Analytics', async () => (await import('./analytics-screen.js')).analyticsScreen()],
  [/Prospect rankings|Down on the farm/, 'Prospects', async () => (await import('./prospects-screen.js')).prospectsScreen()],
  [/Luxury tax|owner|chairman|budget/i, 'Finances', async () => (await import('./finance-screen.js')).financeScreen()],
  [/Rule 5/, 'Rule 5', tx('rule5')],
  [/draft/i, 'Draft', tx('draft')],
  [/Cuba|defector|international/i, 'International', tx('intl')],
  [/Waivers|claim for/, 'Waiver wire', tx('waiver')],
  [/offer|Leak|Last day|trade deadline|deadline:/i, 'Offers', tx('offers')],
  [/Single-A is over|designated|Your assistant suggests|Your assistant protected|Your lineup changed|rotation has an open/, 'Squad', async () => (await import('./squad-screen.js')).squadScreen((await import('../state.js')).game.orgId)],
  [/awards|All-Star|retired number|Hall of Fame/i, 'History', async () => (await import('./history-screen.js')).historyScreen()],
  [/division|standings|Playoff|Game \d|Series|preview:|Wild Card/i, 'Standings', fx('standings')],
  [/Scores from|review:|Club report|assistant's month|season: how your players|Welcome to|Spring Training|Around the camps/, 'Club overview', async () => (await import('./club-screen.js')).clubScreen((await import('../state.js')).game.orgId)],
  [/Your holiday|out of work|Back in/, 'Jobs', async () => (await import('./jobs-screen.js')).jobsScreen()],
];

/** The page button for a message, or null when its title matches none. */
export function pageFor(m) {
  const hit = PAGES.find(([re]) => re.test(m.title || ''));
  return hit ? { label: `Open ${hit[1]}`, open: async () => { const s = await hit[2](); if (s) nav.push(s); } } : null;
}
