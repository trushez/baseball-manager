// Continue: moves the game on day by day, playing every game at every level, until something needs
// you: your game (if you watch your games), an injury to one of your players, an important message,
// or a roster problem you must fix first.
import { ownerWatch } from './finance.js';
import { fullName } from '../data/world.js';
import { game, orgState, autoClub } from '../state.js';
import { dayNo, fromDayNo, addDays, monthName } from './calendar.js';
import { gamesOn, userGameOn, simulateGame, endOfDay } from './sim.js';
import { aiManage, resolveWaivers, rosterProblems, coverNeeded, limits, placeCode, levelWords, syncTeams } from './roster.js';
import { rule5Opening, rule5Day } from './rule5.js';
import { fixAll, adviceMail } from './advice.js';
import { startPostseason, schedulePostDay, afterPostDay } from './postseason.js';
import { message, lastId, since } from './inbox.js';
import { clubReport, teamNotes, orgMonth, logAssist } from './teamreport.js';
import { prospectMonth } from './prospects.js';
import { openingPreview, openingReaction } from './openingday.js';
import { clearUndo } from './undo.js';
import { gameFeats } from './feats.js';
import { analyticsMonth, scoutNews } from './analytics.js';
import { coachingMonth } from './coaching.js';
import { gameHeadlines, leaderHeadlines } from './headlines.js';
import { wireDay } from './wire.js';
import { formWatch, assistantReport } from './form.js';
import { seriesEnd, streakWatch, monthVerdict } from './reactions.js';
import { weeklyMoods } from './moods.js';
import { weeklyGrievances } from './grievances.js';
import { weeklyFlavour, dailyFlavour } from './flavour.js';
import { noteGame, dayNews } from './daily.js';
import { tradeDay } from './trade.js';
import { seasonMarketDay } from './winter.js';
import { deadlineDay, isDeadlineDay } from './deadline.js';
import { repliesDue } from './replies.js';
import { scoutTick } from './scouting.js';
import { developMonth } from './ability.js';
import { announce } from './devnews.js';
import { raceWatch } from './race.js';
import { allStarBreak } from './awards.js';
import { recordWatch } from './history.js';
import { headline } from './headlines.js';
import { mediaQuote } from './media.js';
import { postGame } from './postseason-news.js';
import { resultMessage, maybePreview, weeklyRoundup, farmReport, boxScore } from './news.js';
import { crowdFor } from './crowd.js';
import { draftDay } from './draft.js';
import { jobsDay } from './jobs.js';
import { springDay, springReport } from './spring.js';

const tick = () => new Promise((r) => setTimeout(r, 0));

/** Milliseconds to wait after each day at each Continue pace. */
export const PACE = { fast: 120, normal: 650, slow: 1400 };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * @param {{until?:Date, onDay?:(date:Date)=>void, auto?:boolean, shouldStop?:()=>boolean}} [o] auto: your club is
 *   run by the assistant and nothing stops (used by tests and 'simulate to date'); shouldStop: you pressed Stop
 * @returns {Promise<{stop:string, problems?:string[], game?:any, why?:any[]}>}
 */
export async function continueGame(o = {}) {
  if (game.phase === 'offseason') return { stop: 'offseason' };
  if (game.phase === 'over') return { stop: 'over' };
  const waiting = held.filter((m) => !m.read);
  held = [];
  if (!o.auto && waiting.length) return { stop: 'message', why: waiting };
  if (game.phase === 'spring' && !o.auto && dayNo(game.date) < game.season.start) {
    // camp is played a day at a time: trades, scouting and the computer clubs go on, spring numbers pile up, and the press reports each Monday
    const open = game.season.start, first = lastId();
    for (let guard = 0; guard < 80 && dayNo(game.date) < open; guard++) {
      const d = dayNo(game.date);
      springDay(d);
      closeDay(d);
      o.onDay?.(game.date);
      if (dayNo(game.date) >= open) { springReport(true); openingPreview(); }
      else if (game.date.getDay() === 1) springReport();
      const stops = since(first).filter((m) => m.stop);
      if (stops.length) return { stop: 'message', why: stops };
      // camp goes one day at a time, like the winter and the season: each Continue is one day (a set date, or the assistant running the club, still runs on)
      if (!o.until && !autoClub()) return { stop: 'date' };
      const wait = (PACE[game.settings.pace || 'normal'] ?? 300) / 3;
      if (wait) await sleep(wait); else if (guard % 3 === 2) await tick();
      if (o.shouldStop?.()) return { stop: 'user' };
    }
    return { stop: 'date' };
  }
  if (game.phase === 'spring') {
    if (o.auto || autoClub()) assistantDay(game.world.orgs.get(game.orgId), orgState(), !o.auto);
    const problems = rosterProblems(game.world.orgs.get(game.orgId), orgState()).filter((x) => !/must have/.test(x));
    const hurt0 = o.auto || autoClub() ? [] : coverNeeded(game.world.orgs.get(game.orgId), orgState());
    if (hurt0.length) return { stop: 'cover', players: hurt0.map((p) => p.id) };
    if (problems.length && !o.auto && !autoClub()) return { stop: 'required', problems };
    resolveWaivers(true);
    rule5Opening(o.auto || autoClub());
    clearUndo();
    game.date = fromDayNo(game.season.start);
    game.phase = 'regular';
    openingPreview();
    const opening = message({ cat: 'club', important: true, title: 'Opening Day', body: `The ${game.season.year} season starts today.` });
    weeklyRoundup(); // takes the first snapshot for next week's round-up
    weeklyMoods(); weeklyGrievances();
    maybePreview(game.season.start);
    if (!o.auto) return { stop: 'message', why: [opening] };
  }
  const firstMsg = lastId();
  for (let guard = 0; guard < 400; guard++) {
    const d = dayNo(game.date);
    if (game.phase === 'over') return { stop: 'over' };
    const me = game.world.orgs.get(game.orgId), st = orgState();
    const assistant = o.auto || autoClub(); // the assistant runs your club
    if (assistant) assistantDay(me, st, !o.auto);
    // an injured player on the active roster: nothing goes on until you have sorted out his cover (the Injury Centre
    // puts the lineup right too, so this comes before the other roster problems)
    const hurt = assistant ? [] : coverNeeded(me, st);
    if (hurt.length) return { stop: 'cover', players: hurt.map((p) => p.id) };
    const problems = rosterProblems(me, st);
    if (problems.length && !assistant) return { stop: 'required', problems };
    // deadline day: Continue stops once to open the deadline room, where the day plays out hour by hour
    if (!assistant && isDeadlineDay() && !(game.dl?.year === game.year && game.dl.t >= 16 * 60)) { (game.deadlineSeen ||= {})[game.year] = true; return { stop: 'deadline' }; }
    if (game.phase === 'post') schedulePostDay(d);
    const mine = userGameOn(d);
    if (mine && !assistant) return { stop: 'match', game: mine };
    playDay(d);
    closeDay(d);
    if (!assistant) adviceMail(me, st);
    o.onDay?.(game.date);
    const stops = o.auto ? [] : since(firstMsg).filter((m) => m.stop);
    if (stops.length) return { stop: 'message', why: stops };
    if (o.until && game.date >= o.until) return { stop: 'date' };
    // a watchable pace (Game Options), and you can stop it at any time
    const wait = o.wait ?? (o.auto ? 0 : PACE[game.settings.pace || 'normal'] ?? 300);
    if (wait) await sleep(wait); else if (guard % 3 === 2) await tick();
    if (o.shouldStop?.()) return { stop: 'user' };
  }
  return { stop: 'date' };
}

/**
 * The assistant running your club for a day: every roster problem fixed under the rules (injured
 * players to the injured list, call-ups, the 40-man roster trimmed), the active roster filled, and a
 * note in your inbox of each move he made.
 */
function assistantDay(o, st, tell) {
  const before = new Map(o.players.map((p) => [p.id, placeCode(st, p)]));
  const { done } = fixAll(o, st);
  aiManage(o, st);
  // aiManage moves are not listed by fixAll: find them by comparing where everyone is now
  const moved = o.players.filter((p) => before.get(p.id) !== placeCode(st, p))
    .map((p) => `${fullName(p)}: ${levelWords(before.get(p.id)) || 'free agency'} to ${levelWords(placeCode(st, p)) || 'free agency'}`);
  if (tell && moved.length) {
    logAssist(o.players.filter((p) => before.get(p.id) !== placeCode(st, p)).map((p) => ({ pid: p.id, from: before.get(p.id) || null, to: placeCode(st, p) || 'FA' })));
    // a release or a designation is worth knowing about the day it happens; everything else waits for the monthly summary
    const serious = o.players.filter((p) => before.get(p.id) !== placeCode(st, p) && ['DFA', 'FA'].includes(placeCode(st, p) || 'FA'));
    if (serious.length) message({ cat: 'club', title: `Your assistant ${serious.length === 1 ? 'designated a player' : 'designated players'} for assignment`, body: `With the assistant running the club, he made these moves today:\n${moved.join('\n')}` });
  }
}

/** Play every game of the day not yet played. */
export function playDay(d) {
  for (const g of gamesOn(d)) {
    if (g.s) continue;
    const res = simulateGame(g);
    afterGame(g, res);
  }
}

/** The news from one finished game: headlines, your result, the postseason story. */
function afterGame(g, res) {
  noteGame(g, res);
  if (g.level !== 'MLB') return;
  Object.assign(g, (({ att, cap, mood }) => ({ att, cap, mood }))(crowdFor(g)));
  // the full scorecard is kept for your games and the postseason; the rest keep the line score
  if (g.post || g.home === game.orgId || g.away === game.orgId) g.box = boxScore(res, g);
  gameHeadlines(g, res);
  gameFeats(g, res);
  if (g.post) postGame(g, res); // every postseason game gets its own report
  else if (g.home === game.orgId || g.away === game.orgId) { resultMessage(g, res); openingReaction(g, res); }
}
/** After your own game: the rest of the day, then the next morning. */
export function finishUserDay(g, engineGame) {
  const first = lastId();
  afterGame(g, engineGame);
  const d = dayNo(game.date);
  playDay(d);
  closeDay(d);
  // an offer or a reply that came in as the day closed still stops the next Continue
  held = since(first).filter((m) => m.stop);
}
let held = [];

/** The end of a day and the start of the next: health, rest, the computer clubs, waivers, dates. */
export function closeDay(d) {
  dayNews(d);
  scoutTick(d);
  endOfDay(d);
  scoutNews(d);
  if (game.phase === 'regular') { seriesEnd(d); streakWatch(); dailyFlavour(); leaderHeadlines(); raceWatch(d); recordNews(); formWatch(d); assistantReport(d); }
  const mine = orgState();
  if (mine.dfaFrom) mine.dfaFrom = {}; // designations can no longer be cancelled
  clearUndo();
  for (const o of game.world.orgs.values()) if (o.id !== game.orgId) aiManage(o, orgState(o.id));
  ownerWatch(game.date);
  wireDay();
  resolveWaivers();
  if (game.phase === 'spring' || game.phase === 'regular') seasonMarketDay(game.date);
  if (game.phase === 'regular') rule5Day(d);
  syncTeams();
  if (game.phase === 'regular' || game.phase === 'spring') tradeDay(game.date);
  deadlineDay(game.date);
  repliesDue(game.date);
  jobsDay(game.date);
  if (game.phase === 'post') afterPostDay(d);
  const next = addDays(game.date, 1);
  if (game.phase === 'regular') {
    if (next.getMonth() !== game.date.getMonth()) { monthEnd(game.date); analyticsMonth(); coachingMonth(); if (game.date.getMonth() >= 3 && game.date.getMonth() <= 7) announce(developMonth(game.date)); }
    // the All-Star break: the teams named and the game played on the first day without games
    if (next.getMonth() === 6 && next.getDate() >= 12 && next.getDate() <= 16 && !gamesOn(dayNo(next)).some((g) => g.level === 'MLB')) allStarBreak();
    if (next.getMonth() === 6 && next.getDate() >= 6 && game.phase === 'regular') draftDay(next);
    if (next.getMonth() === 8 && next.getDate() === 1) {
      message({ cat: 'club', important: true, stop: game.settings.stops.important, title: 'Rosters expand to 28', body: `From today the active roster can hold 28 players, 14 of them pitchers. You must carry ${limits(next).active}.` });
    }
    if (d >= game.season.end && !gamesOn(d).some((g) => !g.s)) {
      game.phase = 'post';
      startPostseason(d + 2);
    }
  }
  if (game.phase === 'post' && game.season.post?.champion) {
    game.phase = 'over';
    message({ cat: 'club', important: true, stop: true, title: 'The season is over', body: 'The World Series is over. Press Continue to begin the winter: contracts expire, free agency opens and the new year starts.' });
  }
  game.date = next;
  // the morning papers
  if (game.phase === 'regular' || game.phase === 'post') {
    if (next.getDay() === 1 && game.phase === 'regular') { weeklyRoundup(); weeklyMoods(); weeklyGrievances(); weeklyFlavour(); teamNotes(); }
    maybePreview(dayNo(next));
  }
}

// ---------- records ----------

/** A major league record falling, or a player chasing one late in the season. */
function recordNews() {
  for (const x of recordWatch()) {
    const p = x.p, mine = p.orgId === game.orgId;
    const up = (t) => t.toUpperCase();
    const city = game.world.orgs.get(p.orgId).club.city;
    if (x.broken) {
      headline(`RECORD! ${up(p.last)} PASSES ${up(x.holder)}: ${x.v} ${up(x.label)}`, mine);
      const q = mediaQuote(p.orgId, 'record', { p, ...x });
      message({ cat: mine ? 'club' : 'league', important: true, stop: mine && game.settings.stops.important, player: p.id, quiet: true,
        title: `${fullName(p)} breaks the record: ${x.v} ${x.label.toLowerCase()}`,
        parts: [{ p: `${fullName(p)} of ${city} has the major league record for ${x.label.toLowerCase()} in a season: ${x.v}, passing the ${x.rec} of ${x.holder} in ${x.ry}. ${game.season.records.get(p.orgId) ? `There are still games left for ${city} to add to it.` : ''}` }, ...(q ? [q] : [])] });
    } else {
      headline(`${up(p.last)} CHASING ${up(x.holder)}: ${x.v} ${up(x.label)} AND COUNTING`, mine);
    }
  }
}

// ---------- monthly awards ----------

/** Player and Pitcher of the Month in each league, and your club's month. */
function monthEnd(date) {
  const yr = game.season.year;
  const snap = game.season.monthSnap || new Map();
  const now = new Map();
  for (const p of game.world.list) {
    const b = sumRows(p, 'bat', yr), t = sumRows(p, 'pit', yr);
    if (b || t) now.set(p.id, { b, t });
  }
  const diff = (id, k) => { const a = now.get(id)?.[k], z = snap.get(id)?.[k]; return a ? a.map((v, i) => v - (z?.[i] || 0)) : null; };
  const leagues = [...new Set(game.world.mlb.map((c) => c.league))];
  const lines = [];
  for (const lg of leagues) {
    let bestH = null, bestP = null;
    for (const [id] of now) {
      const p = game.world.players.get(id);
      if (!p?.club || game.world.orgs.get(p.orgId)?.club.league !== lg) continue;
      const b = diff(id, 'b');
      if (b && b[1] >= 70) {
        const [, , ab, h, b2, b3, hr, , , bb, , , , hbp, sf] = b;
        const ops = (h + bb + hbp) / Math.max(1, ab + bb + hbp + sf) + (h + b2 + 2 * b3 + 3 * hr) / Math.max(1, ab);
        if (!bestH || ops > bestH.v) bestH = { p, v: ops, line: `${hr} HR, ${(ops).toFixed(3)} OPS` };
      }
      const t = diff(id, 't');
      if (t && t[2] >= 75) { // 25 innings
        const era = (t[5] * 27) / t[2];
        if (!bestP || era < bestP.v) bestP = { p, v: era, line: `${(t[2] / 3).toFixed(0)} IP, ${era.toFixed(2)} ERA, ${t[8]} K` };
      }
    }
    const short = lg.startsWith('American') ? 'AL' : 'NL';
    if (bestH) lines.push(`${short} Player of the Month: ${fullName(bestH.p)} (${bestH.p.club.city}), ${bestH.line}`);
    if (bestP) lines.push(`${short} Pitcher of the Month: ${fullName(bestP.p)} (${bestP.p.club.city}), ${bestP.line}`);
  }
  if (lines.length) message({ cat: 'league', important: false, title: `${monthName(date)} awards`, body: lines.join('\n') });
  farmReport(date);
  clubReport(date, diff);
  orgMonth(date);
  prospectMonth(date);
  const r = game.season.records.get(game.orgId);
  const prev = game.season.monthRec || { w: 0, l: 0 };
  message({ cat: 'club', important: true, stop: game.settings.stops.important, title: `${monthName(date)} review: ${r.w - prev.w}-${r.l - prev.l} for the month, ${r.w}-${r.l} overall`, body: monthVerdict() });
  game.season.monthRec = { w: r.w, l: r.l };
  game.season.monthSnap = now;
}

function sumRows(p, kind, yr) {
  const rows = p.hist?.[kind]?.filter((r) => r[0] === yr && r[1] === 'MLB');
  if (!rows?.length) return null;
  const out = rows[0].slice(3).map(() => 0);
  for (const r of rows) r.slice(3).forEach((v, i) => { out[i] += v; });
  return out;
}

