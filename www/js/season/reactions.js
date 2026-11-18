// The owner's reactions. His confidence in you (0-100) moves with results set against his goals. After
// a notable series he says so: one sentence from a grid of the result (a sweep, a series won or lost,
// being swept) by the occasion (your natural rival, a division rival, a contender, anyone else), in
// the voice of his style. Long losing runs and the month's form against his goals also move him.
import { game } from '../state.js';
import { owner, goals, goalStatus, STYLES } from './finance.js';
import { message } from './inbox.js';
import { RIVALS } from './schedule.js';
import { seeds, divisions, leagues } from './standings.js';
import { Rng } from '../core/rng.js';
import { voices } from './media.js';
const ROUND_NAME = { WC: 'Wild Card Series', DS: 'Division Series', LCS: 'Championship Series', WS: 'World Series' };

export const confidence = (orgId = game.orgId) => { const o = owner(orgId); return o.conf ?? 60; };
export function confidenceWords(c = confidence()) {
  if (c >= 85) return ['Delighted', 'cm-g'];
  if (c >= 68) return ['Pleased', 'cm-g'];
  if (c >= 50) return ['Satisfied', ''];
  if (c >= 35) return ['Concerned', 'cm-y'];
  if (c >= 20) return ['Unhappy', 'cm-r'];
  return ['Losing patience', 'cm-r'];
}
function move(delta) {
  const o = owner(game.orgId);
  const before = o.conf ?? 60;
  o.conf = Math.max(0, Math.min(100, Math.round(before + delta)));
  return { before, after: o.conf };
}

// result -> occasion -> sentences. {opp} the other club, {w}-{l} the series, {owner} "The owner"
const GRID = {
  sweep: {
    rival: ['{owner} is thrilled with the sweep of {opp}. Nothing pleases the city more than beating them.', 'A sweep of {opp}, our oldest rivals. {owner} has called to say well done.'],
    division: ['{owner} is delighted with the sweep of {opp}. Those are the games that win divisions.', 'Sweeping a division rival is exactly what {owner} wants to see.'],
    contender: ['{owner} was impressed by the sweep of {opp}, one of the better clubs in the league.'],
    any: ['{owner} is pleased with the sweep of {opp}.'],
  },
  won: {
    rival: ['{owner} enjoyed taking the series from {opp}, {w} games to {l}.'],
    division: ['{owner} is happy with the series win over {opp}, a division rival.'],
    contender: ['Taking a series from {opp} has pleased {owner}.'],
    any: [],
  },
  lost: {
    rival: ['{owner} hates losing to {opp}, and he has said so. {w}-{l} in the series.', 'Losing the series to {opp} has not gone down well with {owner}.'],
    division: ['{owner} is disappointed to drop a series to {opp}, a division rival.'],
    contender: [],
    any: [],
  },
  swept: {
    rival: ['Swept by {opp}. {owner} has asked to see you.', '{owner} is furious after being swept by {opp}, of all clubs.'],
    division: ['{owner} is unhappy after being swept by {opp}. Those games count twice in a division race.'],
    contender: ['{owner} is concerned after a sweep at the hands of {opp}.'],
    any: ['{owner} is unhappy to be swept by {opp}.', 'Being swept by {opp} has worried {owner}.'],
  },
};
const POINTS = { sweep: 4, won: 2, split: 0, lost: -2, swept: -4 };
const WEIGHT = { rival: 1.5, division: 1.3, contender: 1.2, any: 1 };

/** Call at the end of each day: if your series ended today, the owner reacts. */
export function seriesEnd(d) {
  const S = game.season;
  if (!S || game.phase !== 'regular') return;
  const me = game.orgId;
  const mine = S.games.filter((g) => g.level === 'MLB' && !g.post && (g.home === me || g.away === me));
  const today = mine.find((g) => g.d === d && g.s);
  if (!today) return;
  const opp = today.home === me ? today.away : today.home;
  const next = mine.filter((g) => g.d > d).sort((a, b) => a.d - b.d)[0];
  if (next && (next.home === opp || next.away === opp) && next.d - d <= 1) return; // the series goes on
  // the games of this series, back from today
  const series = [];
  for (const g of mine.filter((x) => x.d <= d && x.s).sort((a, b) => b.d - a.d)) {
    if (g.home !== opp && g.away !== opp) break;
    if (series.length && series.at(-1).d - g.d > 1) break;
    series.push(g);
  }
  const w = series.filter((g) => (g.home === me) === (g.s[1] > g.s[0])).length, l = series.length - w;
  const result = l === 0 && w >= 3 ? 'sweep' : w === 0 && l >= 3 ? 'swept' : w > l ? 'won' : l > w ? 'lost' : 'split';
  const occasion = occasionOf(opp);
  const { before, after } = move(POINTS[result] * WEIGHT[occasion] * styleTilt(result));
  const lines = GRID[result]?.[occasion] || [];
  const banded = confidenceWords(before)[0] !== confidenceWords(after)[0];
  if (!lines.length && !banded) return;
  // the owner speaks up after a sweep either way, a rival series or a change in how he sees you; an ordinary series passes without a word
  if (!banded && result !== 'sweep' && result !== 'swept' && occasion !== 'rival') return;
  const rng = new Rng(`owner-${S.year}-${d}`);
  const city = game.world.clubs.get(opp).city;
  const text = lines.length ? rng.pick(lines).replaceAll('{opp}', city).replace('{w}', w).replace('{l}', l).replaceAll('{owner}', 'the owner') : '';
  const said = text ? text.charAt(0).toUpperCase() + text.slice(1) : '';
  message({
    cat: 'club', title: `The owner on the ${city} series`,
    body: [said, banded ? `His confidence in you is now: ${confidenceWords(after)[0].toLowerCase()}.` : ''].filter(Boolean).join(' '),
  });
}

/** A careful owner feels losses more; a big spender expects wins and is less moved by them. */
function styleTilt(result) {
  const style = owner(game.orgId).style;
  const bad = result === 'lost' || result === 'swept';
  if (style === 'cheap') return bad ? 1.2 : 1;
  if (style === 'spender') return bad ? 1.1 : 0.8;
  return 1;
}

function occasionOf(opp) {
  const me = game.orgId;
  if (RIVALS.some(([a, b]) => (a === me && b === opp) || (a === opp && b === me))) return 'rival';
  const mine = [...divisions().values()].find((ids) => ids.includes(me));
  if (mine?.includes(opp)) return 'division';
  const lg = game.world.orgs.get(opp).club.league;
  if (leagues().includes(lg) && seeds(lg).includes(opp)) return 'contender';
  return 'any';
}

/** A losing run of six or more, once per run. */
export function streakWatch() {
  const r = game.season?.records.get(game.orgId);
  const run = r?.last?.match(/L+$/)?.[0]?.length || 0;
  const o = owner(game.orgId);
  if (run >= 6 && !o.warned) {
    o.warned = true;
    move(-4);
    message({ cat: 'club', important: true, stop: game.settings.stops.important, title: 'The owner wants to talk',
      body: `${['', '', '', '', '', '', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve'][run] || run} straight defeats. The owner has asked for a meeting to hear how you mean to turn it round. His confidence: ${confidenceWords()[0].toLowerCase()}.`, voices: voices(game.orgId, 'losing', { n: run }, 0.7) });
  }
  if (run === 0) o.warned = false;
}

/** At the end of each month: the owner weighs the season so far against his goals. */
export function monthVerdict() {
  const goal = goals(game.orgId, game.season.year)[0];
  const [, cls] = goalStatus(game.orgId, goal, game.season.year);
  const budget = goals(game.orgId, game.season.year).find((g) => g.id === 'budget');
  const [, bcls] = budget ? goalStatus(game.orgId, budget, game.season.year) : ['', 'cm-g'];
  const delta = (cls === 'cm-g' ? 3 : cls === 'cm-y' ? 0 : -3) + (bcls === 'cm-r' ? -2 : 0);
  const { after } = move(delta);
  const [words] = confidenceWords(after);
  const tone = cls === 'cm-g' ? 'is happy with how the season is going' : cls === 'cm-y' ? 'thinks the club is roughly where it should be' : 'expected more by now';
  return `The owner ${tone}${bcls === 'cm-r' ? ', and he has noticed the payroll is over budget' : ''}. His confidence in you: ${words.toLowerCase()}.`;
}

/** After a postseason series of yours. */
export function postseasonVerdict(series) {
  const won = series.winner === game.orgId;
  const { after } = move(won ? 6 : -1);
  const round = ROUND_NAME[series.round];
  message({ cat: 'club', title: won ? `The owner on the ${round}` : 'The owner on the season',
    body: `${won ? `The owner is thrilled to get through the ${round}.` : series.round === 'WS' ? 'Losing the World Series hurts, but the owner is proud of the run.' : `Going out in the ${round} hurts, but the owner is proud of the run.`} His confidence in you: ${confidenceWords(after)[0].toLowerCase()}.` });
}
