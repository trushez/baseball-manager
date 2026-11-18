// The sidebar menu on every club screen, CM style: Continue at the top, then your desk, your club and
// the screens you use most.
import { nav } from './nav.js';
import { game, userClub, orgState } from '../state.js';
import { settleStaffNotes } from '../club/depth.js';
import { unread } from '../season/inbox.js';
import { dateWords } from '../season/calendar.js';
import { fromDayNo } from '../season/calendar.js';

const pendingOffers = () => (game.market?.offers || []).filter((o) => o.status === 'open').length;

function continueSub() {
  if (game.jobs?.jobless) return 'out of work';
  if (game.phase === 'offseason') return game.winter?.on ? `the winter, ${dateWords(game.date)}` : 'to the winter';
  if (game.phase === 'spring') return game.season ? `Opening Day ${dateWords(fromDayNo(game.season.start))}` : '';
  if (game.phase === 'over') return 'begin the winter';
  if (game.phase === 'post') return 'postseason';
  return '';
}

/** @param {string} [here] which item is the current screen */
export function clubMenu(here) {
  const go = (key, open) => async () => {
    const screen = await open();
    // clicking the section you are already in reopens it fresh (back to its first tab) instead of doing nothing
    if (key === here && nav.replace) nav.replace(screen); else nav.push(screen);
  };
  const club = userClub();
  try { settleStaffNotes(orgState()); } catch { /* no club yet */ }
  const n = unread();
  const sub = (label, key, open, extra = {}) => ({ label, key, on: key === here, onClick: go(key, open), ...extra });
  const jobsSub = game.jobs?.jobless ? 'out of work' : game.jobs?.offers?.length ? `offers (${game.jobs.offers.length})` : 'contract, vacancies, offers';
  const tx = (tab) => async () => (await import('./transfers-screen.js')).transfersScreen(tab);
  // children open as a pop-out list beside the button, as in CM 01/02
  const team = [
    sub('Overview', 'club', async () => (await import('./club-screen.js')).clubScreen(game.orgId)),
    sub('Squad', 'squad', async () => (await import('./squad-screen.js')).squadScreen(game.orgId)),
    sub('Injuries', 'injuries', async () => (await import('./injuries-screen.js')).injuriesScreen()),
    sub('Tactics', 'tactics', async () => (await import('./club-tactics.js')).clubTactics()),
    sub('Fixtures', 'fixtures', async () => (await import('./fixtures-screen.js')).fixturesScreen()),
    sub('Finances', 'finances', async () => (await import('./finance-screen.js')).financeScreen()),
    sub('Staff', 'staff', async () => (await import('./staff-screen.js')).staffScreen()),
  ];
  const mlb = [
    sub('Standings', 'league', async () => (await import('./fixtures-screen.js')).fixturesScreen('standings')),
    sub('Leaderboards', 'league', async () => (await import('./fixtures-screen.js')).fixturesScreen('leaders')),
    sub('Stats', 'stats', async () => (await import('./stats-screen.js')).statsScreen()),
    sub('History', 'history', async () => (await import('./history-screen.js')).historyScreen()),
    sub('Jobs', 'jobs', async () => (await import('./jobs-screen.js')).jobsScreen(), { hl: !!game.jobs?.offers?.length }),
  ];
  const transfers = [
    ['Free Agents', 'fa'], ['Waiver Wire', 'waiver'], ['Rule 5', 'rule5'], ['Draft', 'draft'], ['International', 'intl'], ['Transfer List', 'list'], ['Offers', 'offers'], ['Transfer History', 'moves'],
  ].map(([l, t]) => ({ label: l, on: false, hl: t === 'offers' && pendingOffers() > 0, onClick: async () => nav.push(await tx(t)()) }));
  const scouting = [
    { label: 'Shortlist', onClick: async () => nav.push(await tx('short')()) },
    sub('Prospects', 'prospects', async () => (await import('./prospects-screen.js')).prospectsScreen()),
    sub('Scouts', 'scouting', async () => (await import('./scouting-screen.js')).scoutingScreen()),
    sub('Analytics', 'analytics', async () => (await import('./analytics-screen.js')).analyticsScreen()),
  ];
  const options = [['General', 'general'], ['When Continue stops', 'stops'], ['Running the club', 'club'], ['News', 'news'], ['Save and load', 'saves'], ['Photographs', 'photos']]
    .map(([label, id]) => ({ label, onClick: async () => { const screen = (await import('./options-screen.js')).optionsScreen(id); if (here === 'options' && nav.replace) nav.replace(screen); else nav.push(screen); } }));
  options.push({ label: 'How to Play', onClick: async () => (await import('./tutorial.js')).openTutorial() });
  options.push({ label: 'Manual', onClick: async () => { const screen = (await import('./manual-screen.js')).manualScreen(); if (here === 'options' && nav.replace) nav.replace(screen); else nav.push(screen); } });
  options.push({ label: 'Quit Game', onClick: async () => (await import('./app-guards.js')).quitGame() });
  const inGroup = (kids) => kids.some((k) => k.on);
  return [
    { label: 'Continue Game', hl: true, big: true, onClick: async () => (await import('./continue.js')).doContinue() },
    { label: game.manager, short: n ? `News (${n})` : 'News', hl: n > 0, on: here === 'inbox', onClick: go('inbox', async () => (await import('./inbox-screen.js')).inboxScreen()) },
    { label: `${club.full ?? `${club.city} ${club.name}`}`, on: inGroup(team), children: team },
    { label: 'MLB', on: inGroup(mlb), hl: !!game.jobs?.offers?.length, children: mlb },
    { label: 'Transfers', on: here === 'transfers', hl: pendingOffers() > 0, children: transfers },
    { label: 'Scouting', on: inGroup(scouting), children: scouting },
    { label: 'Find', on: here === 'find', onClick: go('find', async () => (await import('./search-screen.js')).searchScreen()) },
    { label: 'Clubs', on: here === 'clubs', onClick: go('clubs', async () => (await import('./clubs-screen.js')).clubsScreen()) },
    { label: 'Game Options', on: here === 'options', children: options },
  ];
}
