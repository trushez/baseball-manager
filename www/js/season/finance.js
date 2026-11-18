// Money. Every club has an owner with a way of spending (a spender, balanced or careful with money).
// Each winter the owner sets the payroll budget for the coming season, from last year's payroll, how
// the club did and his style, and gives the manager his goals. The budget covers player contracts and
// the money still owed to players who have gone. Computer clubs spend to their budgets too.
import { salaryIn, money } from '../data/world.js';
import { game } from '../state.js';
import { Rng } from '../core/rng.js';
import { arbitrationSalary, priorSalary, askingSalary, value, LEAGUE_MIN } from './value.js';

export const STYLES = {
  spender: { label: 'Big spender', factor: 1.1, words: 'He likes to spend to win and will back a manager who wins.' },
  balanced: { label: 'Balanced', factor: 1.0, words: 'He spends what the club can afford, no more and no less.' },
  cheap: { label: 'Careful with money', factor: 0.88, words: 'He watches every dollar and expects value for what he spends.' },
};

/** Money committed for a season: contracts (numbers only, not arbitration or options still to settle) and money owed to players gone. */
export function committed(orgId, year) {
  const o = game.world.orgs.get(orgId);
  const contracts = o.players.reduce((a, p) => { const s = salaryIn(p, year); return a + (typeof s === 'number' ? s : 0); }, 0);
  const owed = (o.club.otherMoney || []).reduce((a, m) => a + (m.years[year] || 0), 0);
  return { contracts, owed, total: contracts + owed };
}

/** Committed money plus what arbitration and club options are likely to add. */
export function expected(orgId, year) {
  const o = game.world.orgs.get(orgId);
  let extra = 0;
  for (const p of o.players) {
    const s = salaryIn(p, year);
    if (typeof s !== 'string') continue;
    if (/^A\d/.test(s)) extra += arbitrationSalary(p, s, priorSalary(p, year));
    else if (s.includes('opt')) {
      const fixed = p.contract.years.find((y) => y.season === year)?.optSalary;
      if (fixed) extra += fixed;
      else if (value(p) >= 52) extra += Math.max(LEAGUE_MIN, askingSalary(p) * 0.9);
    }
  }
  return committed(orgId, year).total + extra;
}

/** The owner of a club, created the first time he is asked for. */
export function owner(orgId) {
  game.finance ||= {};
  if (!game.finance[orgId]) game.finance[orgId] = makeOwner(orgId);
  return game.finance[orgId];
}

function makeOwner(orgId) {
  const rng = new Rng(`owner-${orgId}-${game.manager}`);
  const clubs = game.world.mlb.slice().sort((a, b) => (b.payroll2026 || 0) - (a.payroll2026 || 0));
  const rank = clubs.findIndex((c) => c.org === orgId);
  const odds = rank < 8 ? { spender: 0.7, balanced: 0.3, cheap: 0 } : rank >= 22 ? { spender: 0, balanced: 0.35, cheap: 0.65 } : { spender: 0.15, balanced: 0.6, cheap: 0.25 };
  return { style: rng.weighted(odds), budget: {}, goals: {} };
}

/** The owner's budget for a season, set the first time it is needed (each winter). */
export function budget(orgId, year = game.year) {
  const own = owner(orgId);
  // only this season's and next season's budgets are ever fixed; a screen asking further ahead gets the estimate and fixes nothing
  if (own.budget[year] == null && year > game.year + 1 && Object.keys(own.budget).length) return budgetOutlook(orgId, year).value;
  if (own.budget[year] == null) setBudget(orgId, year);
  return own.budget[year] + extraFor(orgId, 'payroll', year);
}

/** The owner's budget for a season for display: the real one where it has been set, otherwise last known budget grown at the league's pace (an estimate that is not kept). */
export function budgetOutlook(orgId, year) {
  const own = owner(orgId);
  if (own.budget[year] != null) return { value: own.budget[year] + extraFor(orgId, 'payroll', year), est: false };
  const known = Object.keys(own.budget).map(Number).filter((y) => y < year).sort((a, b) => b - a)[0];
  if (known == null) return { value: budget(orgId, year), est: false };
  return { value: Math.round((own.budget[known] + extraFor(orgId, 'payroll', known)) * (1 + leagueGrowth(year)) ** (year - known) / 5e5) * 5e5, est: true };
}

/** What the average club paid in a season, once settled (null until the league has a full year on record). */
function leagueNorm(year) {
  const v = game.world.mlb.map((c) => game.cbt?.[c.org]?.[year]?.payroll).filter((x) => x > 0);
  return v.length >= 20 ? v.reduce((a, b) => a + b, 0) / v.length : null;
}
/** How fast the league's payrolls have really been rising: the budget follows it, so yours does not fall behind the market. */
function leagueGrowth(year) {
  const a = leagueNorm(year - 1), b = leagueNorm(year - 2);
  return a && b ? Math.max(0.02, Math.min(0.07, a / b - 1)) : 0.025;
}

/** What a club's market can carry: last known payroll pulled a little toward the league average, grown 2.5% a year, set by the owner's style. */
function marketTarget(orgId, year, own) {
  const mlb = game.world.mlb;
  const mean = mlb.reduce((a, c) => a + (c.payroll2026 || 150e6), 0) / Math.max(1, mlb.length);
  const club = game.world.orgs.get(orgId).club;
  return (0.7 * (club.payroll2026 || mean) + 0.3 * mean) * STYLES[own.style].factor * 1.025 ** (year - 2026);
}

/**
 * Each winter the owner moves the budget from last year's: up for a winning club and for every round it won in October, down for a
 * losing one, a little for inflation and the ground, and part of the way back towards what the club's market can carry, so a big
 * market stays big and a small one stays small. It is never a straight copy of the payroll.
 */
function setBudget(orgId, year) {
  const own = owner(orgId);
  const club = game.world.orgs.get(orgId).club;
  const rng = new Rng(`budget-${orgId}-${year}-${game.manager}`);
  const target = marketTarget(orgId, year, own);
  const prev = own.budget[year - 1] ?? marketTarget(orgId, year - 1, own);
  const h = game.history?.[year - 1]?.clubs?.[orgId];
  const rec = year === 2027 && !h ? club.record2026 : h ? [h.w, h.l] : lastRecord(orgId);
  const pct = rec ? rec[0] / Math.max(1, rec[0] + rec[1]) : 0.5;
  const postBonus = { WC: 0.015, DS: 0.03, LCS: 0.045, WS: 0.06, Champions: 0.08 }[h?.post] || 0;
  const mood = { spender: 0.01, balanced: 0, cheap: -0.01 }[own.style];
  const stadium = game.facilities?.[orgId]?.stadium ?? 10; // a better ground brings in a little more money
  // success adds at most seven points a year on top of the league's own growth, so a winning club does not compound 14% a year for ever
  const success = Math.min(0.07, Math.min(0.04, (pct - 0.5) * 0.3 + mood + 0.002 * (stadium - 10)) + postBonus);
  let b = prev * (1 + leagueGrowth(year) + success) * (0.985 + 0.03 * rng.next());
  b += 0.2 * (target - b);
  b = Math.max(prev * 0.9, Math.min(prev * 1.10, b));
  // a careful owner will not cross the tax line, a balanced one stops at it, a spender may go past it; but the line itself rises
  // slower than the market has, so the ceiling is never below what the typical club has been paying
  const norm = leagueNorm(year - 1);
  // a club that keeps reaching October earns more, and a balanced or careful owner lets the ceiling rise with the crowds and the sponsors
  let run = 0;
  while (run < 8 && game.history?.[year - 1 - run]?.clubs?.[orgId]?.post) run++;
  const boost = 1 + 0.04 * Math.max(0, run - 1);
  if (own.style === 'cheap') b = Math.min(b, Math.max(cbtThreshold(year) - 3e6, norm ? norm * 0.9 : 0) * boost);
  else if (own.style === 'balanced') b = Math.min(b, Math.max(cbtThreshold(year), norm ? norm * 1.05 : 0) * boost);
  // no owner sets a budget below what the club has already promised, arbitration cases and options he will pick up
  if (orgId === game.orgId && game.cbt?.[orgId]?.[year - 1] && Object.keys(game.cbt[orgId]).length >= 3) {
    // from the second year on, an owner takes back part of last year's overspend, and will not simply raise the budget to whatever you have promised
    const spent = game.cbt?.[orgId]?.[year - 1]?.payroll, lastB = own.budget[year - 1] != null ? own.budget[year - 1] + extraFor(orgId, 'payroll', year - 1) : null;
    if (spent && lastB && spent > lastB) {
      const champs = game.history?.[year - 1]?.clubs?.[orgId]?.post === 'Champions' ? 0.5 : 1;
      b -= (spent - lastB) * ({ spender: 0.25, balanced: 0.5, cheap: 0.8 }[own.style] ?? 0.5) * champs;
    }
    b = Math.max(b, Math.min(expected(orgId, year) * 1.02, b * (1 + leeway(orgId, year).frac)));
  } else b = Math.max(b, expected(orgId, year) * 1.02);
  own.budget[year] = Math.round(b / 5e5) * 5e5;
  own.goals[year] = goalsFor(orgId, year);
}

const lastRecord = (orgId) => {
  const h = game.history?.[game.year - 1]?.clubs?.[orgId];
  if (h) return [h.w, h.l];
  const r = game.season?.records.get(orgId);
  return r ? [r.w, r.l] : null;
};

/** Where a club's budget ranks in the majors (1 = biggest). */
export function budgetRank(orgId, year = game.year) {
  const list = game.world.mlb.map((c) => [c.org, budget(c.org, year)]).sort((a, b) => b[1] - a[1]);
  return list.findIndex(([id]) => id === orgId) + 1;
}

/** The owner's goals for the season, in order of importance. */
function goalsFor(orgId, year) {
  const own = owner(orgId);
  const club = game.world.orgs.get(orgId).club;
  // rank by last year's payroll here: budgets for every club may not exist yet
  const rank = game.world.mlb.slice().sort((a, b) => (b.payroll2026 || 0) - (a.payroll2026 || 0)).findIndex((c) => c.org === orgId) + 1;
  const wins = year === 2027 ? club.record2026?.[0] : lastRecord(orgId)?.[0];
  const goals = [];
  if (rank <= 5) goals.push({ id: 'division', text: 'Win the division and go deep into the postseason.' });
  else if (rank <= 12) goals.push({ id: 'playoffs', text: 'Make the postseason.' });
  else if (rank <= 20) goals.push({ id: 'winning', text: 'Finish with a winning record.' });
  else goals.push({ id: 'improve', text: `Win more games than last season (${wins ?? '?'}).`, wins });
  goals.push({ id: 'budget', text: own.style === 'cheap' ? 'Keep the payroll inside the budget. He will not find more money during the season.' : 'Keep the payroll inside the budget.' });
  if (rank > 20) goals.push({ id: 'youth', text: 'Give the young players in the organisation a chance to show what they can do.' });
  return goals;
}

export const goals = (orgId, year = game.year) => { budget(orgId, year); return owner(orgId).goals[year]; };

/** Room left under the budget for a season. */
export const room = (orgId, year = game.year) => budget(orgId, year) - expected(orgId, year);

/** How a goal stands right now, in a few words with a colour. */
export function goalStatus(orgId, g, year = game.year) {
  if (g.id === 'budget') {
    const r = room(orgId, year);
    return r >= 0 ? [`${money(r)} to spare`, 'cm-g'] : [`${money(-r)} over`, 'cm-r'];
  }
  const s = game.season;
  const rec = s?.records.get(orgId);
  if (!rec || !(rec.w + rec.l)) return ['The season has not started', ''];
  const games = rec.w + rec.l;
  const pace = Math.round((rec.w / games) * 162);
  if (g.id === 'winning') return [`${rec.w}-${rec.l}, on course for ${pace} wins`, pace >= 82 ? 'cm-g' : 'cm-r'];
  if (g.id === 'improve') return [`${rec.w}-${rec.l}, on course for ${pace} wins`, pace > (g.wins ?? 0) ? 'cm-g' : 'cm-r'];
  return [`${rec.w}-${rec.l}, on course for ${pace} wins`, pace >= (g.id === 'division' ? 92 : 87) ? 'cm-g' : pace >= 84 ? 'cm-y' : 'cm-r'];
}

/** The owner's letter at the start of a winter. */
export function ownerLetter(orgId, year = game.year) {
  const own = owner(orgId);
  const c = committed(orgId, year);
  const b = budget(orgId, year);
  return [
    `The owner has set the payroll budget for ${year} at ${money(b)}. ${STYLES[own.style].words}`,
    `${money(c.total)} is already committed to contracts and money owed, which leaves ${money(b - c.total)} for re-signing your free agents and anything else you add.`,
    `His goals for the season: ${goals(orgId, year).map((g) => g.text.replace(/\.$/, '').toLowerCase()).join('; ')}.`,
  ].join('\n');
}

// ---------- the luxury tax (the Competitive Balance Tax) ----------
//
// Thresholds and rates are those of the 2022-26 agreement as published by MLB (threshold $244M in 2026; 20%
// on the amount over in a club's first year over, 30% in the second and 50% from the third; surcharges of 12% on
// the part 20 to 40 million over, 42.5% (45% for a repeat payor) on the part 40 to 60 over, and 60% beyond that).
// That agreement ends in December 2026, so from 2027 the game carries the thresholds forward at 2% a year until
// the new terms are known. Payroll for the tax is the club's committed and expected pay for the season.
export const CBT_2026 = 244e6;
export const cbtThreshold = (year) => Math.round((CBT_2026 * 1.02 ** (year - 2026)) / 5e5) * 5e5;

/** How many seasons in a row, before this one, a club has paid the tax. */
export function cbtStreak(orgId, year) {
  let n = 0;
  while (game.cbt?.[orgId]?.[year - 1 - n]?.tax > 0) n++;
  return n;
}

/** The tax on a payroll: { threshold, over, tax, rate, streak }. */
export function taxFor(orgId, year, payroll = expected(orgId, year)) {
  const threshold = cbtThreshold(year);
  const over = Math.max(0, payroll - threshold);
  const streak = cbtStreak(orgId, year);
  if (!over) return { threshold, over: 0, tax: 0, rate: 0, streak };
  const rate = streak >= 2 ? 0.5 : streak === 1 ? 0.3 : 0.2;
  const band = (lo, hi) => Math.max(0, Math.min(over, hi) - lo);
  const tax = over * rate + band(20e6, 40e6) * 0.12 + band(40e6, 60e6) * (streak ? 0.45 : 0.425) + band(60e6, Infinity) * 0.6;
  return { threshold, over, tax: Math.round(tax), rate, streak };
}

/** One line for a screen: where a payroll stands against the line. */
export function cbtLine(orgId, year, payroll, t = taxFor(orgId, year, payroll)) {
  return t.over
    ? `${money(t.over)} over the ${money(t.threshold)} line: a tax of ${money(t.tax)} (${Math.round(t.rate * 100)}% rate${t.streak ? `, ${t.streak + 1}${['nd', 'rd', 'th'][Math.min(2, t.streak - 1)]} year running` : ''})`
    : `${money(t.threshold - payroll)} under the ${money(t.threshold)} line`;
}

/** At the end of a season: record who went over, and tell the owner's manager what it cost. */
export function settleTax(orgId, year, payroll) {
  const t = taxFor(orgId, year, payroll);
  ((game.cbt ||= {})[orgId] ||= {})[year] = { payroll, tax: t.tax };
  // owners who watch their money mind the bill, and you carry it
  const own = owner(orgId);
  if (orgId === game.orgId && t.tax > 0 && own.style !== 'spender') own.conf = Math.max(0, (own.conf ?? 60) - (own.style === 'cheap' ? 6 : 3));
  return t;
}

// ---------- asking the owner for more money ----------

export const LINES = { payroll: 'payroll', staff: 'staff', scouting: 'scouting', analytics: 'analytics' };
/** Extra money the owner has granted for a season on a line. */
export const extraFor = (orgId, line, year = game.year) => owner(orgId).extra?.[line]?.[year] || 0;

/**
 * Ask the owner for more on one line. He decides from his style, his confidence in you and how the team has done.
 * Returns { granted, text }. Pushing (asking again within two months) costs a little confidence.
 */
export function askOwner(line, amount, orgId = game.orgId, year = game.year) {
  const own = owner(orgId);
  const now = game.date.getTime();
  const what0 = { payroll: 'the payroll budget', staff: 'the staff budget', scouting: 'the scouting budget', analytics: 'the analytics budget' }[line];
  // one answer per line: granted or refused, he does not take the same question again for two months (asking again does not re-roll it)
  const told = (own.answered ||= {})[line];
  if (told && now - told < 60 * 864e5 && now >= told) {
    own.conf = Math.max(0, (own.conf ?? 60) - 1);
    const back = new Date(told + 60 * 864e5);
    return { granted: false, text: `The owner has already given you his answer on ${what0}. He will not discuss it again until ${back.toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}, and he does not like being pushed.` };
  }
  own.answered[line] = now;
  const recent = own.lastAsk && now - own.lastAsk < 60 * 864e5;
  const rng = new Rng(`ask-${orgId}-${line}-${now}-${amount}-${own.asks || 0}`);
  const conf = own.conf ?? 60;
  const rec = lastRecord(orgId);
  const pct = rec ? rec[0] / Math.max(1, rec[0] + rec[1]) : 0.5;
  const base = { spender: 0.6, balanced: 0.38, cheap: 0.14 }[own.style];
  const size = line === 'payroll' ? amount / 20e6 : amount / 2e6; // 20M of payroll or 2M elsewhere is a big ask
  const p = Math.max(0.02, Math.min(0.92, base + (conf - 50) / 100 * 0.5 + (pct - 0.5) * 0.6 - size * 0.2 - (recent ? 0.2 : 0)));
  own.asks = (own.asks || 0) + 1; own.lastAsk = now;
  const what = { payroll: 'the payroll budget', staff: 'the staff budget', scouting: 'the scouting budget', analytics: 'the analytics budget' }[line];
  if (rng.next() < p) {
    const x = (own.extra ||= {})[line] ||= {};
    x[year] = (x[year] || 0) + amount;
    return { granted: true, text: `The owner agrees to add ${money(amount)} to ${what} for ${year}. ${own.style === 'spender' ? '"Win with it," he says.' : own.style === 'cheap' ? '"This is not something I do twice," he says.' : '"Make it count," he says.'}` };
  }
  if (recent) own.conf = Math.max(0, (own.conf ?? 60) - 2);
  return { granted: false, text: `The owner turns down your request for ${money(amount)} more on ${what}.${recent ? ' He does not like being asked again so soon.' : ''}` };
}


// ---------- the owner's verdict when the payroll runs far over the budget ----------
//
// Signing past the budget is allowed (the owner's consent is only asked for the money, not each deal), but when the bill grows
// well beyond it he has to choose: let it stand, which costs some of his confidence and is likelier from a spender, a winning
// club and a manager he trusts, or put his foot down and set a date by which the payroll must be back under the budget.
// Miss the date and he loses faith in you.
import { message } from './inbox.js';
import { dayNo, fromDayNo, dateWords } from './calendar.js';

/**
 * How far over the budget an owner will let a club go, as a share of the budget: his style sets it, a title in the last two years
 * widens it (back to back, a good deal more), and so does his confidence in the manager. Past it no argument works.
 */
export function leeway(orgId, year = game.year) {
  const own = owner(orgId);
  let frac = { spender: 0.15, balanced: 0.08, cheap: 0.03 }[own.style] ?? 0.08;
  const H = (y) => game.history?.[y]?.clubs?.[orgId]?.post;
  const t1 = H(year - 1) === 'Champions', t2 = H(year - 2) === 'Champions';
  let why = '';
  if (t1 && t2) { frac += 0.2; why = 'back-to-back champions'; }
  else if (t1) { frac += 0.1; why = 'the reigning champions'; }
  else if (H(year - 1) === 'WS') { frac += 0.04; why = 'last year\'s pennant winners'; }
  else if (H(year - 1)) frac += 0.01;
  frac += Math.max(-0.03, Math.min(0.05, ((own.conf ?? 60) - 60) / 400));
  return { frac: Math.max(0.01, frac), why };
}

const gap = (orgId, year) => expected(orgId, year) - budget(orgId, year);
const bigOver = (orgId, year) => Math.max(15e6, 0.1 * budget(orgId, year));

/** Once a day for your club: has the payroll run far enough over the budget for the owner to decide, and has an order come due? */
export function ownerWatch(d = game.date) {
  const orgId = game.orgId;
  if (!orgId || !game.world?.orgs.get(orgId) || game.phase === 'over' || game.phase === 'setup') return;
  const own = owner(orgId);
  const year = game.year;
  const over = gap(orgId, year);
  const day = dayNo(d);
  // an order is standing: satisfied, or due
  if (own.cut && !own.cut.done && own.cut.year === year) {
    if (over <= 0.5e6) {
      own.cut.done = 'met';
      own.conf = Math.min(100, (own.conf ?? 60) + 2);
      message({ cat: 'club', important: true, title: 'The owner is satisfied with the payroll', body: `The payroll is back inside the ${money(budget(orgId, year))} budget, and the owner has withdrawn his order. He expects it to stay there.` });
    } else if (day >= own.cut.due) {
      own.cut.done = 'missed';
      own.conf = Math.max(0, (own.conf ?? 60) - 12);
      message({ cat: 'club', important: true, stop: game.settings?.stops?.important, title: 'The owner: you ignored my order',
        body: `The date has passed and the payroll is still ${money(over)} over the budget of ${money(budget(orgId, year))}. The owner told you plainly what he wanted, and he has lost patience. He will not discuss the payroll again this season, and he will remember it when he judges your work.` });
    }
    return;
  }
  if (own.review && own.review.year === year && day - own.review.day < 45) return;
  if (own.cut?.done === 'missed' && own.cut.year === year) return;
  // a winter payroll is still a guess until the tender deadline passes; the owner waits until mid November
  if (game.phase === 'offseason' && d < new Date(year - 1, 10, 15)) return;
  if (over < bigOver(orgId, year)) return;
  ownerVerdict(orgId, year, over, d, own);
}

function ownerVerdict(orgId, year, over, d, own) {
  const rng = new Rng(`verdict-${orgId}-${year}-${dayNo(d)}-${game.manager}`);
  const b = budget(orgId, year);
  const rec = game.season?.records.get(orgId);
  const pct = rec && rec.w + rec.l >= 20 ? rec.w / (rec.w + rec.l) : (lastRecord(orgId)?.[0] ?? 81) / 162;
  const conf = own.conf ?? 60;
  const t = taxFor(orgId, year, expected(orgId, year));
  let p = { spender: 0.72, balanced: 0.42, cheap: 0.1 }[own.style] + (conf - 50) / 100 * 0.5 + (pct - 0.5) * 0.8 - (over / b) * 0.9;
  if (t.over && own.style !== 'spender') p -= 0.15;
  p = Math.max(0.03, Math.min(0.9, p));
  const lw = leeway(orgId, year);
  const tooFar = over / b > lw.frac; // past what he will ever allow, whoever the manager is
  if (tooFar) p = 0;
  else if (lw.why) p = Math.min(0.95, p + 0.2);
  own.review = { year, day: dayNo(d) };
  const need = Math.ceil(over / 5e5) * 5e5;
  if (rng.next() < p) {
    const x = ((own.extra ||= {}).payroll ||= {});
    x[year] = (x[year] || 0) + need;
    own.conf = Math.max(0, conf - (own.style === 'cheap' ? 5 : own.style === 'balanced' ? 3 : 1));
    const words = own.style === 'spender' ? '"We are here to win. Make sure it shows," he says.' : own.style === 'cheap' ? '"I do not like it, and I will not do it again," he says.' : '"I am trusting you with this," he says.';
    message({ cat: 'club', important: true, stop: game.settings?.stops?.important, title: 'The owner lets the payroll stand',
      body: `The payroll has reached ${money(expected(orgId, year))}, ${money(over)} over the ${money(b)} budget. The owner has weighed it up and decided to allow it: the budget for ${year} is raised by ${money(need)}. ${words}${t.over ? ` The luxury tax bill is ${money(t.tax)}, and he is aware of it.` : ''} He will expect results in return.` });
  } else {
    const due = own.cut = { year, due: game.phase === 'offseason' ? dayNo(new Date(year, 2, 20)) : dayNo(d) + 30, over, issued: dayNo(d) };
    own.conf = Math.max(0, conf - 2);
    message({ cat: 'club', important: true, stop: game.settings?.stops?.important, title: 'The owner puts his foot down',
      body: `The payroll has reached ${money(expected(orgId, year))}, ${money(over)} over the ${money(b)} budget, and the owner will not allow it.${tooFar ? ` He will stretch to ${Math.round(lw.frac * 100)}% over the budget for a club like yours${lw.why ? ` (you are ${lw.why})` : ''}, and this is ${Math.round(over / b * 100)}%.` : ''} He wants it brought back inside the budget by ${dateWords(fromDayNo(due.due))}. Trade or release players, or let the arbitration cases go, but the figure on the Finances tab has to come down by ${money(over)}. If it has not by then, he will count it against you.` });
  }
}
