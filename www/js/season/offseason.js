// The turn of the year between seasons. beginWinter closes the season (the year turns over, players age and
// develop, contracts run out, the old retire and the young arrive) and opens the winter, which is then played a
// day at a time with Continue (winter.js: the market, arbitration, the draft picks, the rule 5 draft).
// finishWinter ends it: the computer clubs trim to 40, the schedule is made and Spring Training opens.
import { snapshotYear } from './progress.js';
import { isPitcher, fullName, salaryIn, ageForSeason, fromAbroad } from '../data/world.js';
import { autoOrg, counts, addToForty } from '../club/depth.js';
import { game, orgState } from '../state.js';
import { Rng } from '../core/rng.js';
import { value, askingSalary, askingYears, arbitrationSalary, LEAGUE_MIN } from './value.js';
import { transfer, designate, refreshStaff, resolveWaivers, limits } from './roster.js';
import { headline } from './headlines.js';
import { newSeason } from './sim.js';
import { message, about } from './inbox.js';
import { keyDates, dayNo } from './calendar.js';
import { mediaQuote } from './media.js';
import { room, budget as ownerBudget, expected, committed, ownerLetter, settleTax } from './finance.js';
import { developAll, caOf, changeWords, refreshCoachPool, startOfYear, finishYear } from './ability.js';
import { settleBudget } from './budget.js';
import { announce, whyWords } from './devnews.js';
import { winterTurnover } from './intake.js';
import { reviewStyles } from './style.js';
import { refreshScoutPool, scoutTick } from './scouting.js';
import { hearing } from './arbitration.js';
import { startWinter, runWinter, reSign } from './winter.js';
import { jobsSeasonEnd } from './jobs.js';
import { startSpring } from './spring.js';
import { prunePicks } from './picks.js';

const SEASON_ROW = (p, y) => (p.hist?.bat || []).concat(p.hist?.pit || []).filter((r) => r[0] === y && r[1] === 'MLB');

/**
 * The end of a season and the start of the winter. The year turns over, last season's finals become the
 * figures the screens call "last season", everyone grows a year older and develops, contracts that have
 * run out make players free agents, the old retire and new young players arrive.
 */
export function beginWinter() {
  const last = game.season?.year ?? game.year;
  const W = game.world;
  // last season's finals, in the fields the club screens already read
  const H = game.history?.[last];
  for (const c of W.mlb) {
    const r = H?.clubs?.[c.id];
    if (r) c.record2026 = [r.w, r.l];
    c.payroll2026 = committed(c.org, last).total;
    const tx = settleTax(c.org, last, c.payroll2026);
    if (c.org === game.orgId && tx.tax > 0) message({ cat: 'club', title: `Luxury tax: ${money(tx.tax)} for ${last}`, body: `Your ${last} payroll of ${money(c.payroll2026)} was ${money(tx.over)} over the ${money(tx.threshold)} line, so the club owes ${money(tx.tax)} in luxury tax (${Math.round(tx.rate * 100)}% on the part over, plus surcharges). It comes out of the owner's pocket, and he will have noticed.` });
  }
  jobsSeasonEnd(last);
  game.year = last + 1;
  game.date = new Date(game.year - 1, 10, 2);
  // a year older: a player's age is the season he is about to play minus his birth year
  for (const p of W.list) p.age = ageForSeason(p, game.year);
  // the wear of the year wiped (service time is counted day by day in the season, on the active roster and the injured list)
  for (const p of W.list) {
    p.fat = 0; p.plog = []; delete p.rust; delete p.rehab;
  }
  // development, then the old retire and the farm refills
  const events = developAll(last);
  refreshCoachPool();
  refreshScoutPool();
  const turnover = winterTurnover(game.year);
  // the league's talent budget settles once the old have gone and the young have arrived
  settleBudget();
  finishYear();
  prunePicks();
  snapshotYear(last);
  // Super Two: of the players with between two and three years of service, the top 22 per cent by service time are
  // arbitration eligible a year early and then have four years of arbitration instead of three
  const twos = [...W.orgs.values()].flatMap((o) => o.players).filter((p) => !p.retired && (p.contract?.serviceTime ?? 0) >= 2 && (p.contract?.serviceTime ?? 0) < 3 && p.contract?.status === 'pre-arbitration').map((p) => p.contract.serviceTime).sort((a, b) => b - a);
  const superTwoCut = twos.length >= 5 ? twos[Math.max(0, Math.floor(twos.length * 0.22) - 1)] : Infinity;
  // contracts that have run out
  for (const o of W.orgs.values()) {
    const st = orgState(o.id);
    for (const p of o.players) {
      const c = p.contract;
      if (!c?.years?.length || c.status === 'minor league' || c.status === 'free agent') continue;
      const y = c.years.find((x) => x.season === game.year);
      // pre-arbitration and arbitration players stay with their clubs: the club renews them
      // a player short of six years of service cannot reach the market whatever his contract said, at any age: his club keeps him and he goes to arbitration
      const abroad = fromAbroad(p) && c.status === 'signed'; // a Japanese or Korean signing reaches the market when his deal ends
      const young = !y && (c.serviceTime || 0) < 6 && !p.retired && !abroad;
      if (!y && (c.status === 'pre-arbitration' || c.status === 'arbitration' || young) && (c.serviceTime || 0) < 6 && !abroad) {
        const st2 = c.superTwo || (c.status === 'pre-arbitration' && (c.serviceTime || 0) >= superTwoCut && (c.serviceTime || 0) < 3);
        const arb = c.status === 'arbitration' || (c.serviceTime || 0) >= 3 || st2;
        const n = st2 ? Math.floor((c.serviceTime || 2) - 1) : Math.floor((c.serviceTime || 3) - 2);
        const row = arb ? { season: game.year, status: `A${Math.min(st2 ? 4 : 3, Math.max(1, n))}` } : { season: game.year, salary: LEAGUE_MIN };
        p.contract = { ...c, status: arb ? 'arbitration' : young ? 'pre-arbitration' : c.status, years: [...c.years, row], ...(st2 ? { superTwo: true } : {}),
          ...(arb ? {} : { aav: row.salary, text: `Pre-arbitration: 1 y/${money(row.salary)} (${String(game.year).slice(2)})` }) };
        if (st2 && !c.superTwo && o.id === game.orgId) message({ cat: 'club', player: p.id, title: `${fullName(p)} qualifies as a Super Two`, body: `${fullName(p)} has ${Math.floor(c.serviceTime)} years of service, enough to be among the most experienced players below three years. He is eligible for arbitration a year early and will have four years of it instead of three, so he will cost more sooner.` });
        continue;
      }
      if (!y || y.status === 'FA') {
        p.contract = { ...c, status: 'free agent' };
        st.level.set(p.id, 'FA'); st.forty.delete(p.id); st.active.delete(p.id); st.il.delete(p.id);
      }
    }
  }
  // lineups that name players who are gone are rebuilt by the assistant
  const mine = W.orgs.get(game.orgId), st = orgState();
  const gone = (id) => !mine.players.some((p) => p.id === id) || st.level.get(id) === 'FA';
  if ([...st.lineupR, ...st.lineupL].some((s) => gone(s.id)) || st.rotation.some(gone)) {
    for (const id of [...st.active]) if (gone(id)) st.active.delete(id);
    refreshStaff(mine, st);
  }
  game.season = null;
  game.phase = 'offseason';
  for (const c of W.mlb) c.avgAge2026 = Math.round((W.orgs.get(c.org).players.filter((p) => p.level === 'MLB').reduce((a, p) => a + (p.age || 27), 0) / Math.max(1, W.orgs.get(c.org).players.filter((p) => p.level === 'MLB').length)) * 10) / 10;
  winterNews(events, turnover);
  message({ cat: 'club', important: true, title: `A letter from the owner: the ${game.year} budget`, body: ownerLetter(game.orgId, game.year) });
  startWinter();
}

/** What the winter's development means to you: your players' progress, and the stories around the league. */
function winterNews(events, turnover) {
  const mine = game.world.orgs.get(game.orgId).players.filter((p) => p.dvLast != null && p.level !== undefined);
  const movers = mine.filter((p) => Math.abs(p.dvLast) >= 1.2).sort((a, b) => Math.abs(b.dvLast) - Math.abs(a.dvLast)).slice(0, 12);
  const parts = [{ p: `A year has gone by and everyone in your organisation is a year older. Here is how the biggest movers have changed over the year, and what lay behind it.` }];
  if (movers.length) parts.push({ head: ['Player', 'Age', 'Level', 'Over the year', 'Why'], rows: movers.map((p) => [{ pid: p.id, t: fullName(p) }, p.age, p.level, changeWords(p.dvLast), whyWords(p) || '-']) });
  else parts.push({ p: 'Nobody in the organisation changed much.' });
  const retired = turnover.retired.filter((p) => p.orgId === undefined);
  message({ cat: 'club', important: true, title: `The ${game.year} season: how your players developed`, parts });
  const lead = announce(events);
  if (lead.length || turnover.retired.length) {
    const big = turnover.retired.filter((p) => (p.contract?.serviceTime || 0) >= 8).slice(0, 5);
    const body = [lead.join('\n'), big.length ? `Retired: ${big.map((p) => `${fullName(p)} (${p.age})`).join(', ')}.` : ''].filter(Boolean).join('\n');
    if (body) message({ cat: 'league', title: `Around the league: the winter's talking points`, body });
  }
}

const money = (v) => `$${(v / 1e6).toFixed(1)}M`;

/** Your players whose contracts have run out, with what each would ask to stay. */
export function yourFreeAgents() {
  const o = game.world.orgs.get(game.orgId), st = orgState();
  return o.players.filter((p) => st.level.get(p.id) === 'FA').map((p) => ({ p, salary: askingSalary(p), years: askingYears(p) }))
    .sort((a, b) => value(b.p) - value(a.p));
}

export function contractFor(p, salary, years, how = 'Re-signed') {
  const ys = [];
  for (let i = 0; i < years; i++) ys.push({ season: game.year + i, salary });
  return { ...p.contract, status: 'signed', signed: game.year, years: ys, aav: salary, text: `${how}: ${years} y/${money(salary * years)} (${String(game.year).slice(2)}${years > 1 ? `-${String(game.year + years - 1).slice(2)}` : ''})` };
}

/**
 * The whole winter in one step: the days are played at once. `keep` is the set of your free agents you re-sign
 * (a deal made on the negotiation screen counts as kept). Used by tests and the simulations; in the game the
 * winter is played with Continue (winter.js).
 */
export function goToSpringTraining(keep = new Set()) {
  if (!game.winter?.on) startWinter();
  const st = orgState();
  for (const p of game.world.orgs.get(game.orgId).players) if (st.level.get(p.id) === 'FA' && (keep.has(p.id) || p.contract?.status === 'signed')) reSign(p);
  resolveWaivers(true); // anyone you designated this winter goes through waivers now
  runWinter();
}

/** What a computer club thinks a player is worth keeping on its 40: today's ability, a share of what he will grow into, and a cost for age. */
const keepScore = (p) => value(p) + (p.age <= 25 ? 0.4 * Math.max(0, value(p, { future: true }) - value(p)) : 0) - (p.age >= 32 ? (p.age - 31) * 1.1 : 0);

/** The last step of the winter: the computer clubs get down to 40, the season is made, Spring Training opens. */
export function finishWinter() {
  const world = game.world;
  game.winter.on = false;
  game.date = new Date(game.year, 1, 19);

  // AI clubs get down to 40 and set their rosters for the spring
  for (const o of world.orgs.values()) {
    if (o.id === game.orgId) continue;
    let st = orgState(o.id);
    // young players who have outgrown the minors are added to the 40, ahead of the weakest old hand on it
    for (let guard = 0; guard < 4; guard++) {
      const ups = o.players.filter((p) => !st.forty.has(p.id) && !p.retired && p.age <= 25 && ['AAA', 'AA'].includes(p.level) && p.contract?.status !== 'free agent').sort((a, b) => keepScore(b) - keepScore(a));
      const low = [...st.forty].map((x) => world.players.get(x)).filter(Boolean).sort((a, b) => keepScore(a) - keepScore(b))[0];
      if (!ups[0] || !low || keepScore(ups[0]) <= keepScore(low) + 1) break;
      addToForty(st, ups[0]);
      if (counts(o, st).forty > 40) designate(o, st, low);
    }
    for (let guard = 0; guard < 30 && counts(o, st).forty > 40; guard++) {
      const cut = [...st.forty].map((x) => world.players.get(x)).filter(Boolean).sort((a, b) => keepScore(a) - keepScore(b))[0];
      designate(o, st, cut);
    }
    // keep the club's 40-man roster; pick the active roster again
    const fresh = autoOrg(o, { forty: st.forty, dfa: st.dfa });
    for (const k of ['style', 'fam', 'styleChanged']) if (st[k]) fresh[k] = st[k]; // the club's style carries over the winter
    game.orgStates.set(o.id, fresh);
    st = fresh;
    refreshStaff(o, st);
  }

  reviewStyles(new Rng(`styles-${game.year}-${game.manager}`)); // computer clubs may change approach to suit their roster
  resolveWaivers(true); // and the players the computer clubs cut to get down to 40
  game.season = newSeason(game.year);
  startOfYear(); // the arrows on your players are measured from here
  startSpring(); // spring numbers start from nothing
  game.phase = 'spring';
  game.date = keyDates(game.year).spring;
  scoutTick(dayNo(game.date)); // the winter's assignments finish while you wait
  const c = counts(game.world.orgs.get(game.orgId), orgState());
  message({
    cat: 'club', important: true, title: 'Spring Training opens',
    body: `Pitchers and catchers report. Opening Day is ${game.season ? 'Thursday 25 March' : ''}. Before then your active roster needs 26 players and your 40-man roster no more than 40 (it has ${c.forty}).`,
  });
}
