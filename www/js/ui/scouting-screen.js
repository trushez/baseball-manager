// Scouting: your scouts, what they are doing, who is available to hire, and the reports they have filed.
// A scout's true judging ability is never shown: you see his wage and a reputation, which is only roughly right.
import { h, fill, toast, cmTabs } from './dom.js';
import { clubMenu } from './menu.js';
import { clubTitle, plink, select as sel } from './club-ui.js';
import { money, fullName } from '../data/world.js';
import { game, userClub } from '../state.js';
import {
  SCOUT_MAX, owedOn, myScouts, scoutBudget, scoutCost, hireScout, releaseScout, assign, cancelAssignment, assignmentText, daysLeft, nations,
  reportText, ageWords, stale, countryOf, drainQueue,
} from '../season/scouting.js';
import { dayNo } from '../season/calendar.js';
import { mainPos } from '../data/world.js';
import { finds, findsOf, signFind, cannotSign, depthWords, findPrice } from '../season/finds.js';
import { scoutBoard } from '../season/draft.js';
import { roomLeft as poolLeft, poolOf, committed } from '../season/amateurs.js';

const rankWords = (pj) => (pj < 80 ? 'Fringe' : pj < 95 ? 'Depth' : pj < 110 ? 'Solid' : pj < 125 ? 'Good' : pj < 145 ? 'Very good' : pj < 165 ? 'Elite' : 'Franchise');
const words = (r) => (r >= 17 ? 'Outstanding' : r >= 14 ? 'Very good' : r >= 11 ? 'Good' : r >= 8 ? 'Average' : r >= 5 ? 'Poor' : 'Very poor');

export function scoutingScreen() {
  const body = h('div', { class: 'cm-panel grow' });
  let open = null; // the scout being given an assignment
  let tab = 'hub';
  const form = { mode: 'nation', country: '', kind: 'any', hand: '', young: true };

  function render() {
    drainQueue(); // a free scout never sits idle while a player waits
    const mine = myScouts();
    const cost = scoutCost(), budget = scoutBudget();
    const head = h('table', { class: 'cm-tbl info' }, h('tbody', {},
      [['Scouting budget', money(budget)], ['Spent on scouts', money(cost)], ['Scouts', `${mine.length} of ${SCOUT_MAX}`],
        ['Left', h('span', { class: budget - cost < 0 ? 'cm-r' : 'cm-g' }, money(budget - cost))]]
        .map(([k, v]) => h('tr', {}, h('td', { class: 'l cm-s' }, k), h('td', { class: 'l y' }, v)))));

    const rows = mine.map((s) => h('tr', { class: open === s.id ? 'sel' : '' },
      h('td', { class: 'l' }, s.name), h('td', { class: 'l' }, words(s.rep)), h('td', {}, money(s.wage)), h('td', {}, s.contract ? `to ${s.contract.end}` : '-'),
      h('td', { class: 'l' }, s.assign ? `${assignmentText(s.assign)} (${daysLeft(s.assign)} days)` : h('span', { class: 'cm-s' }, 'Idle')),
      h('td', {},
        s.assign ? h('button', { class: 'cm-btn', onClick: () => { toast(cancelAssignment(s)); render(); } }, 'Stop') : h('button', { class: 'cm-btn go', onClick: () => { open = open === s.id ? null : s.id; render(); } }, open === s.id ? 'Close' : 'Assign'),
        ' ', h('button', { class: 'cm-btn', title: owedOn(s) > 0 ? `You would still owe ${money(owedOn(s))}` : '', onClick: () => { toast(releaseScout(s.id)); if (open === s.id) open = null; render(); } }, 'Release'))));

    const scout = mine.find((s) => s.id === open);
    const countries = [['', 'Anywhere'], ...nations().map((n) => [n, n])];
    const panel = scout && h('div', { class: 'cm-pad filters' },
      h('div', { class: 'cm-h' }, `Send ${scout.name}`),
      h('span', { class: 'btnrow' }, [['nation', 'Cover a country or region'], ['search', 'Search for a type of player']].map(([k, l]) => h('button', { class: `cm-btn${form.mode === k ? ' go' : ''}`, onClick: () => { form.mode = k; render(); } }, l))),
      form.mode === 'nation'
        ? [h('p', { class: 'cm-s' }, 'He lives there for the season. Each week he hears of local youngsters you could sign into your development complex, and the longer he stays and the better he is the more he turns up. A region is many countries at once, so a boy in one of them is easy to miss. Each month he also files a report on two players already in the system. Most of the game\'s talent is in the seven countries listed first; if you do not sign someone he finds, another club may.'),
          sel(nations().map((n) => [n, n]), form.country || nations()[0], (v) => { form.country = v; }),
          h('button', { class: 'cm-btn go', onClick: () => { toast(assign(scout, { type: 'nation', country: form.country || nations()[0] })); open = null; render(); } }, 'Send him')]
        : [h('p', { class: 'cm-s' }, 'A month of looking, then he files his three best matches. Those he reports on are the ones he thinks will become the best players, which depends on how good he is.'),
          sel([['any', 'Any player'], ['bat', 'Hitter'], ['pit', 'Pitcher']], form.kind, (v) => { form.kind = v; }),
          sel([['', 'Either hand'], ['L', 'Left-handed'], ['R', 'Right-handed']], form.hand, (v) => { form.hand = v; }),
          sel(countries, form.country, (v) => { form.country = v; }),
          h('label', { class: 'cm-s' }, h('input', { type: 'checkbox', checked: form.young, onChange: (e) => { form.young = e.target.checked; } }), ' Young players only (22 or under)'),
          h('button', { class: 'cm-btn go', onClick: () => { toast(assign(scout, { type: 'search', spec: { kind: form.kind, hand: form.hand, country: form.country, young: form.young } })); open = null; render(); } }, 'Start the search')],
      h('p', { class: 'cm-s' }, 'To look at one player, open his profile and choose Request scouting from the Action menu.'));

    const pool = mine.length < SCOUT_MAX && h('div', {},
      h('div', { class: 'cm-h' }, 'Scouts looking for work'),
      h('table', { class: 'cm-tbl' }, h('thead', {}, h('tr', {}, ['Name', 'Reputation', 'Wage', ''].map((c, i) => h('th', { class: i < 2 ? 'l' : '' }, c)))),
        h('tbody', {}, (game.scoutPool || []).slice().sort((a, b) => b.rep - a.rep).map((s) => h('tr', {},
          h('td', { class: 'l' }, s.name), h('td', { class: 'l' }, words(s.rep)), h('td', {}, money(s.wage)),
          h('td', {}, [1, 2, 3].map((y) => h('button', { class: 'cm-btn go', title: `${y} year${y > 1 ? 's' : ''}`, onClick: () => { toast(hireScout(s.id, y)); render(); } }, `Hire ${y}y`))))))),
      h('p', { class: 'cm-s cm-pad' }, 'Reputation is what the trade thinks of a scout. It is usually close to the truth, not always, and a poor scout is poor in his judgement of what a player is now, of what he will become, or both.'));

    const queue = (game.scoutQueue || []).map((id) => game.world.players.get(id)).filter(Boolean);
    const ids = [...new Set((game.scoutLog || []).slice().reverse())].slice(0, 25);
    const reports = ids.map((id) => ({ p: game.world.players.get(id), rep: game.knowledge?.[id] })).filter((x) => x.p && x.rep);
    const overview = [
      h('div', { class: 'cm-h' }, 'Budget'), head,
      h('div', { class: 'cm-h' }, 'Your scouts'),
      mine.length ? h('table', { class: 'cm-tbl' }, h('thead', {}, h('tr', {}, ['Name', 'Reputation', 'Wage', 'Contract', 'Doing', ''].map((c, i) => h('th', { class: i === 2 || i === 3 ? '' : 'l' }, c)))), h('tbody', {}, rows))
        : h('p', { class: 'cm-s cm-pad cm-empty' }, 'You have no scouts. Hire one below.'),
      panel, queue.length ? h('p', { class: 'cm-s cm-pad' }, `Waiting for a free scout: ${queue.map(fullName).join(', ')}.`) : null,
      pool,
      h('div', { class: 'cm-h' }, 'Reports'),
      reports.length ? h('table', { class: 'cm-tbl' }, h('thead', {}, h('tr', {}, ['Player', 'Age', 'Report', 'By', 'When'].map((c, i) => h('th', { class: i === 1 ? '' : 'l' }, c)))),
        h('tbody', {}, reports.map(({ p, rep }) => h('tr', { class: stale(rep) ? 'cm-s' : '' }, h('td', { class: 'l' }, plink(p)), h('td', {}, p.age), h('td', { class: 'l' }, reportText(p, rep).replace(`${fullName(p)} `, '')), h('td', { class: 'l cm-s' }, rep.scout), h('td', { class: 'l cm-s' }, ageWords(rep))))))
        : h('p', { class: 'cm-s cm-pad cm-empty' }, 'No reports yet. Send a scout somewhere, or ask for a look at a player from his profile.')];
    const tabs = cmTabs([{ id: 'hub', label: 'Hub' }, { id: 'all', label: 'Scouts and Reports' }, ...mine.map((x) => ({ id: x.id, label: x.name.split(' ')[1] || x.name }))], mine.some((x) => x.id === tab) || tab === 'hub' ? tab : 'all', (id) => { tab = id; open = null; render(); });
    const sc = mine.find((x) => x.id === tab);
    fill(body, tabs.el, ...(tab === 'hub' ? hubPage(mine, reports, render, (id) => { tab = id; open = null; render(); }) : sc ? scoutPage(sc, panel, render, (id) => { open = id; render(); }) : overview));
  }
  render();
  return { el: h('div', { style: { display: 'contents' } }, clubTitle(userClub(), 'Scouting'), body), side: () => clubMenu('scouting') };
}

/** One scout's page: what he is doing, how well he knows the place, and everyone he has turned up, best first. */
function scoutPage(s, panel, render, onSend) {
  const list = findsOf(s.id).slice().sort((a, b) => (game.knowledge[b.p.id]?.pj ?? 0) - (game.knowledge[a.p.id]?.pj ?? 0));
  const now = dayNo(game.date);
  const country = s.assign?.type === 'nation' ? s.assign.country : null;
  const depth = country ? finds().depth[country] || 0 : 0;
  const seenN = finds().seen[s.id] || 0;
  const info = h('table', { class: 'cm-tbl info' }, h('tbody', {},
    [['Doing', s.assign ? `${assignmentText(s.assign)} (${daysLeft(s.assign)} days left)` : 'Idle'],
      ['Reputation', words(s.rep)], ['Wage', money(s.wage)],
      country ? ['Knows the place', depthWords(depth)] : null,
      ['Players he has brought you', `${seenN}`], ['Waiting to be signed', `${list.length}`],
      ['Signing money left this year', money(Math.max(0, poolLeft()))]].filter(Boolean)
      .map(([k, v]) => h('tr', {}, h('td', { class: 'l cm-s' }, k), h('td', { class: 'l y' }, v)))));
  const controls = h('div', { class: 'cm-pad' },
    s.assign ? h('button', { class: 'cm-btn', onClick: () => { toast(cancelAssignment(s)); render(); } }, 'Bring him home')
      : h('button', { class: 'cm-btn go', onClick: () => { onSend(s.id); } }, 'Send him somewhere'));
  const rows = list.map((x, i) => {
    const p = x.p, rep = game.knowledge[p.id], why = cannotSign(x), left = Math.max(0, x.expires - now);
    return h('tr', {},
      h('td', {}, `${i + 1}`), h('td', { class: 'l' }, plink(p)), h('td', {}, p.age), h('td', {}, mainPos(p)), h('td', { class: 'l' }, countryOf(p)),
      h('td', { class: 'l y' }, rep ? rankWords(rep.pj) : '-'), h('td', { class: 'l' }, rep ? rep.pot : ''),
      h('td', {}, money(findPrice(p))), h('td', { class: left < 15 ? 'cm-r' : '' }, `${left}d`),
      h('td', {}, h('button', { class: 'cm-btn go', title: why || 'Sign him to your Rookie level', disabled: !!why, onClick: () => { const [ok, t] = signFind(p.id); toast(t); render(); } }, 'Sign')));
  });
  const blocked = list.filter((x) => cannotSign(x));
  const spentOnFinds = Object.values(finds().spent || {}).length ? (finds().spent[game.date.getFullYear()] || 0) : 0;
  const whyNot = blocked.length
    ? h('p', { class: 'cm-s cm-pad' }, `${blocked.length === list.length ? 'None of them can be signed right now' : `${blocked.length} of them cannot be signed right now`}. ${[...new Set(blocked.map((x) => (/pool/.test(cannotSign(x)) ? 'Your signing pool is too low for what they ask' : cannotSign(x))))].join(' ')} This year's pool is ${money(poolOf())}: ${money(committed())} is promised in international bids and ${money(spentOnFinds)} has gone on players your scouts found, leaving ${money(Math.max(0, poolLeft()))}. The pool refills each year; bids you have not yet won can be withdrawn on the International page to free the money.`)
    : null;
  return [
    h('div', { class: 'cm-h' }, s.name), info, controls, panel,
    h('div', { class: 'cm-h' }, 'Players he has seen'),
    list.length ? h('table', { class: 'cm-tbl' }, h('thead', {}, h('tr', {}, ['#', 'Player', 'Age', 'Pos', 'From', 'Ranking', 'Report', 'Asks', 'Left', ''].map((c, i) => h('th', { class: [1, 4, 5, 6].includes(i) ? 'l' : '' }, c)))), h('tbody', {}, rows))
      : h('p', { class: 'cm-s cm-pad' }, country ? `${s.name} has not turned anyone up yet. The longer he stays in ${country} the more people he gets to know, and the better he is the more he brings you.` : 'Send him to a country and he will start bringing you young players you can sign into your development complex. Send a better scout, or leave him longer, and more people are available.'),
    whyNot,
    h('p', { class: 'cm-s cm-pad' }, 'The ranking is his opinion of how good the player can become, and it is only as good as he is. A find who is not signed within about three months goes to another club. A signing costs a token bonus from your international pool.'),
  ];
}

/** Everything in one place: what needs doing, the latest reports, who is waiting to be signed and the draft board. */
function hubPage(mine, reports, render, goTab) {
  const idle = mine.filter((s) => !s.assign);
  const ending = mine.filter((s) => s.contract && s.contract.end <= game.year);
  const waiting = finds().list.slice().sort((a, b) => a.expires - b.expires);
  const now = dayNo(game.date);
  const soon = waiting.filter((x) => x.expires - now < 15);
  const todo = [];
  if (!mine.length) todo.push('You have no scouts. Hire one from the Scouts and Reports tab.');
  if (idle.length) todo.push(`${idle.length === 1 ? idle[0].name + ' has' : idle.length + ' scouts have'} nothing to do: ${idle.map((s) => s.name).join(', ')}.`);
  if (ending.length) todo.push(`${ending.map((s) => s.name).join(', ')} ${ending.length === 1 ? 'is' : 'are'} in the last year of ${ending.length === 1 ? 'his' : 'their'} contract.`);
  if (soon.length) todo.push(`${soon.length} international ${soon.length === 1 ? 'find' : 'finds'} will be lost to other clubs within two weeks.`);
  const board = scoutBoard(8);
  const tbl = (head, rows) => h('table', { class: 'cm-tbl' }, h('thead', {}, h('tr', {}, head.map((c, i) => h('th', { class: i < 2 ? 'l' : '' }, c)))), h('tbody', {}, rows));
  return [
    h('div', { class: 'cm-h' }, 'Needs attention'),
    h('div', { class: 'cm-pad' }, todo.length ? todo.map((t) => h('p', {}, t)) : h('p', { class: 'cm-s cm-empty' }, 'Nothing needs doing: every scout is busy and nothing is about to be lost.')),
    h('div', { class: 'cm-h' }, `Your scouts (${mine.length} of ${SCOUT_MAX}, ${money(scoutCost())} of ${money(scoutBudget())})`),
    mine.length ? tbl(['Scout', 'Doing', 'Contract'], mine.map((s) => h('tr', {}, h('td', { class: 'l' }, h('button', { class: 'pl', onClick: () => goTab(s.id) }, s.name)), h('td', { class: 'l' }, s.assign ? `${assignmentText(s.assign)} (${daysLeft(s.assign)} days)` : 'Idle'), h('td', {}, s.contract ? `to ${s.contract.end}` : '-')))) : null,
    h('div', { class: 'cm-h' }, 'International finds waiting to be signed'),
    waiting.length ? tbl(['#', 'Player', 'Age', 'Pos', 'From', 'Asks', 'Left', ''], waiting.slice(0, 8).map((x, i) => {
      const p = x.p, why = cannotSign(x), left = Math.max(0, x.expires - now);
      return h('tr', {}, h('td', {}, String(i + 1)), h('td', { class: 'l' }, plink(p)), h('td', {}, p.age), h('td', {}, mainPos(p)), h('td', { class: 'l' }, countryOf(p)), h('td', {}, money(findPrice(p))), h('td', { class: left < 15 ? 'cm-r' : '' }, `${left}d`),
        h('td', {}, h('button', { class: 'cm-btn go', title: why || 'Sign him to your Rookie level', disabled: !!why, onClick: () => { const [ok, t] = signFind(p.id); toast(t); render(); } }, 'Sign')));
    })) : h('p', { class: 'cm-s cm-pad cm-empty' }, 'None. Scouts sent to a country bring back young players you can sign for your Rookie level.'),
    h('div', { class: 'cm-h' }, 'Latest reports'),
    reports.length ? tbl(['Player', 'Age', 'Report'], reports.slice(0, 5).map(({ p, rep }) => h('tr', {}, h('td', { class: 'l' }, plink(p)), h('td', {}, p.age), h('td', { class: 'l' }, reportText(p, rep).replace(`${fullName(p)}: `, ''))))) : h('p', { class: 'cm-s cm-pad cm-empty' }, 'No reports yet. Send a scout somewhere, or ask for a look at a player from his profile.'),
    h('div', { class: 'cm-h' }, 'Draft board: the players your scouts like most'),
    board.length ? tbl(['#', 'Player', 'Pos', 'Age', 'From'], board.map((p, i) => h('tr', {}, h('td', {}, String(i + 1)), h('td', { class: 'l' }, fullName(p)), h('td', {}, mainPos(p)), h('td', {}, p.age), h('td', { class: 'l' }, p.hs ? 'High school' : 'College'))))
      : h('p', { class: 'cm-s cm-pad cm-empty' }, 'The draft has been held for this year. The next board appears after the new year begins.'),
    h('p', { class: 'cm-s cm-pad' }, 'The Prospects screen in the menu has the national Top 100 and each club\'s list; the Draft tab under Transfers sets your approach.'),
  ];
}
