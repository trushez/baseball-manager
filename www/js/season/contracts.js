// Contracts and negotiation (Phase 6, stage 3).
//
// Terms you can offer: years, salary a year, a signing bonus (spread over the years), a club, player or
// mutual option for one more year, an opt-out after a given year, and a no-trade clause. A player has an ask
// (what the market would pay him) and a required figure, which is the ask moved by what else he wants, how his
// agent bargains, how you have treated that agent before and his mood. The offer is accepted when what it is
// worth to him in money meets the required figure. A counter says what would do it.
import { Rng } from '../core/rng.js';
import { dayNo } from './calendar.js';
import { game, orgState } from '../state.js';
import { salaryIn, isPitcher, fullName, seasons, serviceYears, fromAbroad } from '../data/world.js';
import { schedule } from './trade.js';
import { value, askingSalary, askingYears, LEAGUE_MIN } from './value.js';
import { agentOf, bumpRel, rel, wantsOf, topWants, testsMarket, WANT_HINT } from './agents.js';
import { room, budget, expected } from './finance.js';

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const roundTo = (v, step) => Math.round(v / step) * step;
const $M = (v) => `$${(v / 1e6).toFixed(v % 1e6 === 0 ? 0 : 2).replace(/0$/, '')}M`;
export const STEP = 250000;
export const MAX_YEARS = 15;
/** The longest deal a player can be offered: nobody signs past about forty. */
export const maxYears = (p) => clamp(41 - (p.age ?? 27), 1, MAX_YEARS);

// ---------- players still under club control ----------

/** A player the club controls for years yet (short of six years of service, not a free agent): a long deal can buy out those years at a fraction of the market price. */
export const underControl = (p) => !!p.contract && !['free agent', 'minor league'].includes(p.contract.status) && serviceYears(p) < 6 && !(fromAbroad(p) && p.contract.status === 'signed');

/**
 * What a year of a deal of this length is worth to him. For a free agent it is his market ask. For a player the club already
 * controls it is the average of what those cheap control years would cost anyway (the pre-arbitration and arbitration run) and the
 * market price for the years after, less a little for the security of a guarantee. So a 21-year-old can be signed for thirteen
 * years at far less than the ask of a free agent with the same ability, and the longer the deal the nearer it moves to market.
 */
export function priceFor(p, years) {
  const market = askingSalary(p);
  if (!underControl(p)) return market;
  const run = schedule(p).map((x) => x.salary);
  const ctl = Math.min(years, run.length);
  let sum = run.slice(0, ctl).reduce((a, b) => a + b, 0);
  for (let i = ctl; i < years; i++) sum += market * (((p.age ?? 27) + i) >= 34 ? Math.max(0.5, 1 - 0.07 * ((p.age ?? 27) + i - 33)) : 1);
  return Math.max(LEAGUE_MIN, Math.min(market, Math.max(0.35 * market, 0.92 * sum / years)));
}
/** The length he looks for. A young star under control is glad of security for as long as the club will give it. */
export function prefYears(p) {
  const base = askingYears(p);
  return underControl(p) && p.age <= 29 && askingSalary(p) >= 6e6 ? Math.max(base, Math.min(10, 34 - p.age)) : base;
}
/** How far these terms are from the length he wants. Longer than he wants is no complaint from a player the club controls. */
const yearsGap = (p, y) => (underControl(p) ? Math.max(0, prefYears(p) - y) : Math.abs(y - askingYears(p)));

// ---------- the contract as stored ----------

export const noExt = () => ({ bonus: 0, opts: [], optOut: null, notrade: 'none' });
/** The extra fields of a contract. Contracts from before stage 3 have none: they read as plain. */
export const extOf = (p) => ({ ...noExt(), ...(p.contract?.ext || {}) });

export const optionWords = (o) => (o.type === 'club' ? 'club option' : o.type === 'player' ? 'player option' : 'mutual option');
export const notradeWords = (n) => (n === 'full' ? 'full no-trade clause' : n === 'partial' ? 'partial no-trade clause' : '');

// ---------- terms ----------

/** The terms that would just about do for a player: his ask, with nothing extra. */
/** His asking terms, raised to match a rival offer his agent has quoted (the last reply in the talks). */
/** The rival offer a club has actually put to him in the winter, while its window is open. */
const openRival = (p) => { const r = game.negotiations?.[p.id]?.rival; return r && r.until >= dayNo(game.date) ? r : null; };
export function askWithRival(p, log) {
  const t = askTerms(p);
  const c = [...(log || [])].reverse().find((x) => x.claim)?.claim;
  const rv = openRival(p);
  const salary = Math.max(t.salary, c?.salary ?? 0, rv ? Math.ceil(rv.salary / STEP) * STEP : 0);
  if (!c && !rv) return t;
  return { ...t, years: Math.max(t.years, c?.years ?? 0, rv?.years ?? 0), salary };
}
export function askTerms(p) {
  const y = prefYears(p);
  return { years: y, salary: roundTo(priceFor(p, y), STEP) || LEAGUE_MIN, bonus: 0, defer: 0, option: 'none', optOut: 0, notrade: 'none' };
}

/** Total guaranteed money in terms. */
export const totalOf = (t) => t.salary * t.years + t.bonus;
/** What a year costs on average (the figure the luxury tax and the comparison use). */
export const aavOf = (t) => totalOf(t) / t.years;

// ---------- deferred pay ----------
// A share of each year's salary can be put off and paid in equal instalments over the five seasons after the deal ends. The
// club pays less now and owes the rest later (it stays on that club's books even if the player is traded or released). To
// the player the money is worth less, because it comes late: he counts it at 5 per cent a year.
export const DEFER_YEARS = 5;
export const DEFER_RATE = 0.05;
export const DEFER_SHARES = [0, 0.25, 0.5, 0.75];
/** The amount put off from each year's salary. */
export const deferOf = (t) => (t.defer ? Math.round((t.salary * t.defer) / 25000) * 25000 : 0);
export const deferTotal = (t) => deferOf(t) * t.years;
/** The instalments: [{ season, amount }] for the five seasons after a deal that starts in `from`. */
export function deferPays(t, from) {
  const D = deferTotal(t);
  if (!D) return [];
  const each = Math.floor(D / DEFER_YEARS / 25000) * 25000;
  return Array.from({ length: DEFER_YEARS }, (_, k) => ({ season: from + t.years + k, amount: k === DEFER_YEARS - 1 ? D - each * (DEFER_YEARS - 1) : each }));
}
/** What a dollar of salary is worth to the player when this share of it is deferred (1 with no deferral). */
export function worthFactor(t) {
  const d = t.defer || 0;
  if (!d) return 1;
  let pv = 0;
  for (let i = 0; i < t.years; i++) for (let k = 0; k < DEFER_YEARS; k++) pv += 1 / DEFER_YEARS / (1 + DEFER_RATE) ** (t.years + k - i);
  return 1 - d + (d * pv) / t.years;
}
/** The deal's value to him a year, with deferred money counted at its present value. */
export const aavWorth = (t) => (t.bonus + t.salary * t.years * worthFactor(t)) / t.years;
/** What the club pays in the year the deal starts: salary and bonus share, less the part put off. */
export const cashPerYear = (t) => t.salary + t.bonus / t.years - deferOf(t);

export function termsText(t) {
  const parts = [`${t.years} ${t.years === 1 ? 'year' : 'years'} at ${$M(t.salary)}`];
  if (t.bonus) parts.push(`${$M(t.bonus)} signing bonus`);
  if (t.defer) parts.push(`${Math.round(t.defer * 100)}% of salary deferred (${$M(deferTotal(t))} paid over ${DEFER_YEARS} years after the deal)`);
  if (t.option !== 'none') parts.push(`${t.option} option`);
  if (t.optOut) parts.push(`opt-out after year ${t.optOut}`);
  if (t.notrade !== 'none') parts.push(`${t.notrade} no-trade`);
  return parts.join(', ');
}

// ---------- how a club looks to him ----------

const winPct = (orgId) => {
  const h = game.history?.[game.year - 1]?.clubs?.[orgId];
  if (h) return h.w / Math.max(1, h.w + h.l);
  const r = game.world.orgs.get(orgId)?.club.record2026;
  return r ? r[0] / Math.max(1, r[0] + r[1]) : 0.5;
};

/** Would he play, there? 1 for a regular, down to 0.25 for a spare. */
function roleScore(p, orgId) {
  const org = game.world.orgs.get(orgId);
  const mine = org.players.filter((x) => x !== p && x.level === 'MLB' && isPitcher(x) === isPitcher(p) && (isPitcher(p) ? (x.role === 'Starter') === (p.role === 'Starter') : true));
  const better = mine.filter((x) => value(x) > value(p)).length;
  const slots = isPitcher(p) ? (p.role === 'Starter' ? 5 : 8) : 9;
  return better < slots - 1 ? 1 : better < slots + 2 ? 0.6 : 0.25;
}

/** How each of the nine things looks, 0 to 1, for these terms at this club. 0.5 is neutral. */
export function scores(p, orgId, t) {
  const last = [...seasons(p)].reverse().find((r) => r.level === 'MLB');
  const home = ['Dominican Republic', 'Venezuela', 'Cuba', 'Puerto Rico', 'Panama', 'Colombia', 'Mexico'].includes(p.country) ? ['MIA', 'TEX', 'NYM', 'NYY', 'HOU', 'LAD', 'TB'].includes(orgId) : false;
  return {
    money: clamp(aavWorth(t) / Math.max(1, priceFor(p, t.years)), 0, 1.6) / 1.6,
    years: clamp(1 - yearsGap(p, t.years) / 5, 0, 1),
    role: roleScore(p, orgId),
    contender: clamp(0.5 + (winPct(orgId) - 0.5) * 4, 0, 1),
    region: home ? 0.85 : 0.5,
    manager: 0.5,
    history: p.orgId === orgId ? 0.85 : last?.club === orgId ? 0.7 : 0.45,
    notrade: t.notrade === 'full' ? 1 : t.notrade === 'partial' ? 0.7 : 0.2,
    optout: t.option === 'player' || t.optOut ? 1 : 0.3,
  };
}

// ---------- what he requires ----------

/** The figure a year he needs to see, for this club and these terms. Hidden from the player; the agent hints at it. */
export function required(p, orgId, t, { lineBonus = 0, mood = true } = {}) {
  const ask = priceFor(p, t.years);
  const agent = agentOf(p);
  const w = wantsOf(p), s = scores(p, orgId, t);
  let pull = 0;
  // a clause or opt-out you put on the table is something you chose to give, so it counts for more than a general hint
  for (const k of Object.keys(w)) if (k !== 'money') pull += w[k] * 2 * (s[k] - 0.5) * (k === 'notrade' || k === 'optout' ? 1.8 : 1);
  let f = 1 - 0.34 * pull;
  f += ((agent.tough - 10) / 10) * 0.06;
  f -= (rel(agent) / 100) * 0.08;
  if (agent.loyal === orgId) f -= 0.03;
  if (mood && p.orgId === orgId && p.mood != null) f += ((60 - p.mood) / 60) * 0.05;
  if (t.option === 'club') f += 0.03;
  f -= lineBonus;
  return Math.max(LEAGUE_MIN, ask * clamp(f, 0.75, 1.3));
}

// ---------- the talk ----------

export const LINES = {
  role: { label: 'Promise him an everyday role', want: 'role', promise: true },
  contender: { label: 'Point to the club\'s chances', want: 'contender' },
  history: { label: 'Remind him what the club has done for him', want: 'history' },
  region: { label: 'Talk about the city and what it offers', want: 'region' },
  manager: { label: 'Talk up your record', want: 'manager' },
};

const STYLE_LINES = {
  hardball: { accept: 'Fine. My client will take it.', counter: 'That is not close, but we can talk.', refuse: 'You are wasting my time.' },
  smooth: { accept: 'I think we can make this work. He will be glad to sign.', counter: 'We are not far apart. Here is what would do it.', refuse: 'I do not think this is the right fit.' },
  quiet: { accept: 'He will sign.', counter: 'Closer. This is what he needs.', refuse: 'No.' },
  media: { accept: 'Great news for the club and the fans. He is in.', counter: 'He loves the club, but the numbers have to work. Here is where we are.', refuse: 'Frankly, I was expecting something more serious.' },
};

/**
 * Put terms to an agent. Returns { status, terms, text, claim }:
 *   status 'accept' | 'counter' | 'refuse' | 'wait' (he will not talk),
 *   terms: the counter, when there is one; text: what the agent says; claim: a rival offer he mentions.
 * @param {string[]} lines the chosen lines said in this round (keys of LINES)
 */
export function negotiate(p, orgId, t, { lines = [], extension = false } = {}) {
  const agent = agentOf(p);
  const style = STYLE_LINES[agent.style];
  const rng = new Rng(`neg-${p.id}-${orgId}-${game.date.getTime()}-${t.years}-${t.salary}-${t.bonus}`);
  const neg = ((game.negotiations ||= {})[p.id] ||= { rounds: 0, used: [] });
  neg.rounds++;
  if (extension && p.orgId === orgId && testsMarket(p)) {
    return { status: 'wait', text: `${agent.name}: "He wants to see what the market looks like before he talks about a new deal. Ask again after the season."` };
  }
  // a line that matches something he cares about moves the agent once
  const top = topWants(p, 3);
  let lineBonus = 0;
  const said = [];
  for (const k of lines) {
    const L = LINES[k];
    if (!L || neg.used.includes(k)) continue;
    neg.used.push(k);
    if (top.includes(L.want)) { lineBonus += 0.04; said.push(k); }
    if (L.promise) (game.promises ||= []).push({ pid: p.id, kind: k === 'role' ? 'time' : k, date: game.date.getTime(), orgId });
  }
  const need = required(p, orgId, t, { lineBonus });
  const have = aavWorth(t);
  const askAgain = (n, yrs = t.years) => ({ ...t, salary: roundTo(Math.ceil(n / worthFactor({ ...t, years: yrs }) / STEP) * STEP, STEP) });
  // a rival offer the agent mentions, true three times in four
  let claim = null;
  // only a free agent has other clubs bidding: a player under contract, in arbitration or in his last year can only accept or refuse
  const open = !p.orgId || game.freeAgents.includes(p.id);
  if (open && value(p) >= 50 && have < need && rng.chance(0.5)) {
    const rivals = game.world.mlb.map((c) => c.org).filter((id) => id !== orgId && id !== game.orgId);
    const club = rng.pick(rivals);
    const truth = rng.next() < 0.5 + agent.honest / 40; // from about 0.55 (honest 2) to 1 (honest 20), 0.75 for an average agent
    const sal = roundTo(need * (truth ? 1.0 : 1.12), STEP);
    claim = { club, years: clamp(t.years + (rng.chance(0.5) ? 1 : 0), 1, MAX_YEARS), salary: sal, truth };
  }
  // a want is only mentioned when the answer can speak to it: the wish for security is not voiced over a counter that keeps the term as it was
  const pref0 = prefYears(p);
  const wantsLonger = top.slice(0, 2).includes('years') && pref0 > t.years;
  const hintKeys = top.filter((k) => k !== 'years' || wantsLonger);
  const hints = hintKeys.slice(0, 1).map((k) => WANT_HINT[k]);
  // say what the clauses on the table are worth to him, so a change is never met with the same words
  const clauses = [t.notrade !== 'none' ? (t.notrade === 'full' ? 'full no-trade clause' : 'partial no-trade clause') : null, t.optOut || t.option === 'player' ? 'opt-out' : null].filter(Boolean);
  let clauseText = '';
  if (clauses.length) {
    const bare = required(p, orgId, { ...t, notrade: 'none', optOut: 0, option: t.option === 'player' ? 'none' : t.option }, { lineBonus });
    const d = bare - need;
    clauseText = d >= 50000 ? ` (The ${clauses.join(' and ')} takes about ${$M(d)} a year off what he needs.)` : ` (The ${clauses.join(' and ')} does little for him.)`;
  }
  const clubName = (id) => game.world.clubs.get(id)?.city || id;
  const claimText = claim ? ` "${clubName(claim.club)} have come to us with ${claim.years} ${claim.years === 1 ? 'year' : 'years'} at ${$M(claim.salary)}."` : '';
  if (have >= need * 0.995) {
    neg.agreed = { ...t };
    const gain = have > need * 1.12 ? 2 : 0;
    if (gain) bumpRel(agent, gain);
    return { status: 'accept', terms: t, text: `${agent.name}: "${style.accept}"${clauseText}` };
  }
  if (have >= need * 0.86) {
    const counter = askAgain(need - (t.bonus / t.years));
    // a player far from his preferred length gets that put back to him too
    const pref = prefYears(p);
    if (yearsGap(p, t.years) >= 3) counter.years = pref;
    else if (wantsLonger) counter.years = Math.min(pref, t.years + 2); // he asks for the security he wants
    if (counter.years !== t.years) counter.salary = askAgain(need - t.bonus / counter.years, counter.years).salary;
    // an agent who has just quoted a rival offer does not then counter below it
    if (claim && counter.salary < claim.salary) counter.salary = claim.salary;
    const rv = openRival(p);
    if (rv && counter.salary < rv.salary) counter.salary = Math.ceil(rv.salary / STEP) * STEP;
    return { status: 'counter', terms: counter, text: `${agent.name}: "${style.counter}"${claimText} ${hints.join(' ')}${clauseText}`.trim(), claim };
  }
  // an offer that insults him costs you with his agent
  if (have < need * 0.6) bumpRel(agent, -3);
  return { status: 'refuse', text: `${agent.name}: "${style.refuse}"${claimText} ${hints.join(' ')}${clauseText}`.trim(), claim };
}

// ---------- what an agreement does to the books ----------

/** The seasons a new contract fills, from `from`, with the club's option year (status only) at the end. */
export function yearsFor(t, from) {
  const bonusShare = t.bonus / t.years, put = deferOf(t);
  const ys = [];
  for (let i = 0; i < t.years; i++) ys.push({ season: from + i, salary: Math.round((t.salary + bonusShare - put) / 25000) * 25000, ...(put ? { deferred: put } : {}) });
  if (t.option !== 'none') ys.push({ season: from + t.years, status: t.option === 'player' ? 'popt' : 'opt', optSalary: Math.round(t.salary / 25000) * 25000 });
  return ys;
}

/** The first season a new deal covers. In the winter it is the coming season, in the season it starts after this one. */
export const startSeason = (extension) => (game.phase === 'offseason' || game.phase === 'spring' || !extension ? game.year : game.year + 1);

/** Keep a line of the contract he is on in his history (once per deal): the year, the club, the kind of deal and its terms. */
export function noteDeal(p, orgId) {
  const c = p.contract;
  if (!c || !c.signed) return;
  const list = (p.deals ||= []);
  const last = list.at(-1);
  // a free agent's last contract has lost its text, but still has the year and the yearly pay
  if (c.status === 'free agent' || !c.text) { if (c.aav && !list.some((d) => d.y === c.signed)) list.push({ y: c.signed, org: orgId || null, text: '', kind: 'Last contract', aav: c.aav, total: 0, from: null, to: null, bonus: 0, ext: null, draft: null }); return; }
  if (last && last.y === c.signed && last.text === c.text) { if (orgId && !last.org) last.org = orgId; return; }
  // the draft or the international signing is his first deal, a minor league one; every later contract keeps the draft record but is not a draft signing
  const firstDeal = /minor league/i.test(c.text || '') && !c.aav;
  const ys = (c.years || []).filter((y) => y.status !== 'FA').map((y) => y.season).filter((s) => s >= c.signed); // an extension keeps the earlier years in the same list: they belong to the earlier deal
  // the seasons the deal covers, from its text ("6 y/$140M (22-27)") when it names them: the year list may hold only the seasons still to come
  const spans = [...(c.text || '').matchAll(/\((\d\d)(?:-(\d\d))?\)/g)].map((m) => [2000 + Number(m[1]), 2000 + Number(m[2] ?? m[1])]);
  const total = (c.years || []).reduce((a, y) => a + (typeof y.salary === 'number' ? y.salary : 0), 0) + (c.bonus || 0);
  list.push({ y: c.signed, on: game.date ? game.date.getFullYear() : c.signed, org: orgId || p.orgId || null, text: c.text, kind: /^([A-Za-z-]+( [A-Za-z]+)?):/.exec(c.text)?.[1] || (firstDeal && c.draft ? 'Drafted' : firstDeal && c.intl ? 'International signing' : 'Contract'), aav: c.aav || 0, total: Math.round(total), from: spans.length ? Math.min(...spans.map((x) => x[0])) : ys[0] ?? null, to: spans.length ? Math.max(...spans.map((x) => x[1])) : ys.at(-1) ?? null, bonus: c.bonus || c.ext?.bonus || 0, ys: (c.years || []).filter((y) => y.season >= c.signed).map((y) => [y.season, typeof y.salary === 'number' ? y.salary : (y.status || '')]), ext: c.ext ? { opts: (c.ext.opts || []).map((o) => ({ season: o.season, type: o.type })), notrade: c.ext.notrade || null, optOut: c.ext.optOut || null } : null, draft: firstDeal ? c.draft || null : null });
  if (list.length > 25) list.shift();
}

/** Write an agreed deal on to the player. Returns the contract text. */
export function conclude(p, orgId, t, { extension = false, how = 'Signed' } = {}) {
  const from = startSeason(extension && game.phase !== 'offseason' && game.phase !== 'spring');
  const keep = extension ? (p.contract?.years || []).filter((y) => y.season < from) : [];
  const ys = [...keep, ...yearsFor(t, from)];
  const last = from + t.years - 1;
  p.contract = {
    ...p.contract, status: 'signed', signed: from, years: ys, aav: Math.round(aavOf(t)),
    text: `${how}: ${t.years} y/${$M(totalOf(t))} (${String(from).slice(2)}${t.years > 1 ? `-${String(last).slice(2)}` : ''})${t.option !== 'none' ? ` + ${t.option} option` : ''}${t.defer ? `, ${$M(deferTotal(t))} deferred` : ''}`,
    ext: {
      bonus: t.bonus, deferred: t.defer ? { per: deferOf(t), pays: deferPays(t, from), org: orgId } : null, notrade: t.notrade, optOut: t.optOut ? from + t.optOut - 1 : null,
      opts: t.option === 'none' ? [] : [{ season: from + t.years, type: t.option, salary: ys.at(-1).optSalary, buyout: Math.round(ys.at(-1).optSalary * 0.1 / 25000) * 25000 }],
    },
  };
  if (orgId && t.defer) {
    const club = game.world.orgs.get(orgId)?.club;
    if (club) for (const x of deferPays(t, from)) (club.otherMoney ||= []).push({ name: `${p.last}, ${p.first}`, note: `deferred pay from his ${from} contract`, years: { [x.season]: x.amount }, deferred: true });
  }
  noteDeal(p, orgId);
  if (orgId) bumpRel(agentOf(p), 1);
  delete (game.negotiations ||= {})[p.id];
  return p.contract.text;
}

// ---------- the effect on the club's money ----------

/**
 * What a deal would do to a club's payroll for the year it starts: committed now, with the deal, against the budget.
 * `replace` is the salary this player already has for that year (an extension replaces it).
 */
/** The most a deal can pay a year: what is left in the owner's budget after the bonus and everything already committed. Zero when there is nothing left. */
export function maxSalary(orgId, p, t, { extension = false } = {}) {
  const base = impact(orgId, p, { ...t, salary: 0 }, { extension });
  return Math.max(0, Math.floor(base.roomAfter / (1 - (t.defer || 0)) / STEP) * STEP);
}
/** Why you cannot open talks about a contract at all: no money left under the budget. */
export function noMoney(orgId = game.orgId, year = game.year) {
  return budget(orgId, year) - expected(orgId, year) < LEAGUE_MIN ? 'There is no money left in the owner\'s budget. Ask him for more from Finances, or clear salary first.' : null;
}

export function impact(orgId, p, t, { extension = false } = {}) {
  const year = extension && game.phase === 'regular' ? game.year + 1 : game.year;
  const now = expected(orgId, year);
  const own = extension && p.orgId === orgId ? salaryIn(p, year) : null;
  const replace = typeof own === 'number' ? own : 0;
  const adds = cashPerYear(t);
  const after = now - replace + adds;
  const b = budget(orgId, year);
  return { year, now, after, budget: b, roomBefore: b - now, roomAfter: b - after, delta: after - now, total: totalOf(t), seasons: t.years, deferred: deferTotal(t), pays: deferPays(t, year) };
}
