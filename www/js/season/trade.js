// Trading. Every club values a player as the surplus he is expected to give over his contract (what the market
// would pay for his play, less his salary), seen through that club's own scouting, so computer clubs misjudge
// players as you do. The engine enforces the rules (roster limits, no-trade clauses, the calendar); the
// general managers decide whether a deal is good enough, counter, or stop talking.
import { fullName, isPitcher, salaryIn, mainPos, money, serviceYears, fromAbroad } from '../data/world.js';
import { game, orgState } from '../state.js';
import { Rng } from '../core/rng.js';
import { exitVoices, voices } from './media.js';
import { value, askingSalary, arbitrationSalary, priorSalary, LEAGUE_MIN } from './value.js';
import { hypeOf } from './prospects.js';
import { believed, seen, clubScouting, sdPot, reportOn } from './scouting.js';
import { caOf } from './ability.js';
import { dayNo, keyDates, addDays, dateWords } from './calendar.js';
import { budget, expected, budgetRank } from './finance.js';
import { leaving } from './grievances.js';
import { addRumour, moved as rumourMoved, failed as rumourFailed, offered as rumourOffered, leak, rumourDay } from './rumours.js';
import { gmOf, gmPlan, reviewPlans, errScale, dealt, insulted, lockDays } from './gms.js';
import { counts } from '../club/depth.js';
import { transfer, limits, refreshStaff } from './roster.js';
import { headline } from './headlines.js';
import { message, about } from './inbox.js';
import { record } from './ledger.js';

// ---------- state ----------

/** The trade market's state: offers waiting for you, who has stopped talking, trust, and the trades made. */
export const market = () => (game.market ||= { offers: [], nextId: 1, lock: {}, trust: {}, susp: {}, done: [], neg: {}, listed: {} });

import { picksOf, holds, pickValue, pickLabel, movePick } from './picks.js';
const today = () => dayNo(game.date);
const org = (id) => game.world.orgs.get(id);
const P = (id) => game.world.players.get(id);
const mlbClubs = () => game.world.mlb.map((c) => c.org);

// ---------- the calendar ----------

/** Trades are possible from the end of the World Series until the 31 July deadline. */
export function windowOpen(date = game.date) {
  if (game.phase === 'offseason' || game.phase === 'spring') return true;
  if (game.phase === 'regular') return dayNo(date) <= dayNo(keyDates(game.year).deadline);
  return false;
}
export function windowText() {
  if (windowOpen()) return game.phase === 'regular' ? `Trades are open until the deadline on ${dateWords(keyDates(game.year).deadline)}.` : 'Trades are open.';
  return game.phase === 'over' || game.phase === 'post' ? 'Trades are closed until the World Series is over.' : `The trade deadline has passed. Trades reopen after the World Series.`;
}
/** Players signed as free agents cannot be traded until 15 June. */
export const barDay = (year = game.year) => dayNo(new Date(year, 5, 15));
export function markSigned(p) { p.tradeBar = barDay(game.year); }

// ---------- what a contract is worth to him ----------

const curve = (age) => (age <= 22 ? 1.6 : age <= 25 ? 0.9 : age <= 27 ? 0.3 : age <= 30 ? -0.2 : age <= 33 ? -0.9 : -1.6);
function worthSalary(v) {
  const x = Math.max(0, v - 45);
  return x ? Math.min(45e6, 0.9e6 + 1.9e6 * x + 0.09e6 * x * x) : LEAGUE_MIN;
}

/** Salary for one season, whatever form the contract holds it in. */
export function salaryFor(p, season) {
  const s = salaryIn(p, season);
  if (typeof s === 'number') return s;
  if (typeof s === 'string') {
    if (/^A\d/.test(s)) return arbitrationSalary(p, s, priorSalary(p, season));
    if (s.includes('opt')) return p.contract.years.find((y) => y.season === season)?.optSalary ?? askingSalary(p) * 0.9;
  }
  return null;
}

/** Seasons of his contract and club control from this one on: [{ t, season, salary }]. */
export function schedule(p) {
  const s0 = game.year, out = [];
  const ys = (p.contract?.years || []).filter((y) => y.season >= s0).sort((a, b) => a.season - b.season);
  for (const y of ys) {
    if (y.status === 'FA') break;
    // the first year builds on what he was paid before it (settled salaries in his contract), the rest on the year before
    const prior = out.length ? out[out.length - 1].salary : priorSalary(p, y.season);
    const sal = typeof y.status === 'string' && /^A\d/.test(y.status) && y.salary == null ? arbitrationSalary(p, y.status, prior) : salaryFor(p, y.season) ?? LEAGUE_MIN;
    out.push({ t: y.season - s0, season: y.season, salary: sal });
  }
  const st = serviceYears(p);
  // a player short of six years of service stays with his club after his contract, whatever it was called
  const controlled = p.contract?.status !== 'free agent' && st < 6 && !(fromAbroad(p) && p.contract?.status === 'signed');
  if (controlled) {
    const total = p.level === 'MLB' || p.contract?.status === 'arbitration' || p.contract?.status === 'pre-arbitration' || p.contract?.status === 'signed' ? Math.max(1, Math.ceil(6 - st)) : 6;
    while (out.length < Math.min(total, 6)) {
      const t = out.length;
      const arbYear = st + t >= 3;
      const prior = out.length ? out[out.length - 1].salary : priorSalary(p, s0 + t);
      out.push({ t, season: s0 + t, salary: arbYear ? arbitrationSalary(p, `A${Math.min(3, Math.floor(st + t - 2))}`, prior) : LEAGUE_MIN });
    }
  }
  return out;
}

let cacheKey = '';
const wcache = new Map(), bcache = new Map();
const fresh = () => { const k = `${game.year}-${today()}`; if (k !== cacheKey) { cacheKey = k; wcache.clear(); bcache.clear(); } };
const beliefView = (orgId, p) => { fresh(); const k = `${orgId}|${p.id}`; let v = bcache.get(k); if (!v) { v = believed(orgId, p); bcache.set(k, v); } return v; };

const potBelief = (orgId, p) => {
  const sd = orgId === game.orgId ? sdPot(10) : sdPot(clubScouting(orgId)) * (orgId ? 1.2 - 0.4 * gmOf(orgId).numbers : 1);
  return Math.max(caOf(p), Math.round((p.pa ?? caOf(p)) + new Rng(`pb-${orgId}-${p.id}-${game.year}`).normal(0, sd)));
};

/** A club's plan: contending, rebuilding or in between. The GM reviews it on 1 June, 15 July and at the start of the winter. */
export const plan = (orgId) => gmPlan(orgId);

/** The picture of a player a club (or you) works from: his ratings as that viewer believes them. */
function viewFor(orgId, p) {
  if (orgId && orgId !== game.orgId) return beliefView(orgId, p);
  const s = seen(p);
  return s.mode === 'partial' ? null : s.v;
}

/**
 * What a player is worth to a club, in dollars of surplus over his contract and control, from that club's view of
 * him. For you, null when you have not seen him well enough to say.
 */
export function worth(orgId, p, o = {}) {
  if (o.view || o.plan) return worthRaw(orgId, p, o);
  fresh();
  const k = `${orgId}|${p.id}`;
  if (wcache.has(k)) return wcache.get(k);
  const w = worthRaw(orgId, p, o);
  wcache.set(k, w);
  return w;
}
function worthRaw(orgId, p, o) {
  const view = o.view ?? viewFor(orgId, p);
  if (!view) return null;
  const sched = schedule(p);
  if (!sched.length) return 0;
  let pa = potBelief(orgId, p);
  // the buzz around a prospect moves what the other clubs will pay, whether or not the talent changed
  let buzz = 1;
  if (orgId && orgId !== game.orgId && !o.view) {
    const hy = hypeOf(p);
    if (hy != null) {
      const lean = 0.8 + (gmOf(orgId).star ?? 0.5) * 0.8; // a GM who loves names pays more for them
      pa += (hy - 50) * 0.9 * errScale() * lean;
      if (hy > 50) buzz = 1 + ((hy - 50) / 50) * 0.45 * errScale() * lean;
    }
  }
  const v0 = value(view), a = p.age;
  const pl = o.plan ?? (orgId ? plan(orgId) : 'middle');
  const ai = orgId && orgId !== game.orgId && !o.view, g = ai ? gmOf(orgId) : null, err = errScale();
  const hype = ai && (p.hon || []).some((h) => String(h).includes(String(game.year - 1)) || String(h).includes(String(game.year)));
  const panic = ai && pl === 'contend' && game.phase === 'regular' && today() > dayNo(keyDates(game.year).deadline) - 12;
  const progress = game.phase === 'regular' && game.season ? Math.min(1, Math.max(0, (today() - game.season.start) / Math.max(1, game.season.end - game.season.start))) : 0;
  let total = 0;
  for (const y of sched) {
    let v;
    if (a < 27) { const target = Math.max(v0, 50 + (pa - 100) / 5); v = v0 + (target - v0) * 0.55 * (g?.love ?? 1) * Math.min(1, y.t / Math.max(2, 27 - a)); }
    else { v = v0; for (let i = 0; i < y.t; i++) v += curve(a + i); if (g && a >= 30) v -= g.ageBias * 0.5 * y.t; }
    let s = worthSalary(v) - y.salary;
    if (ai && p.req?.stage === 'public' && s > 0) s *= 0.85;
    if (y.t === 0) s *= 1 - progress;
    const tilt = pl === 'contend' ? (y.t === 0 ? 1.25 : 0.85) : pl === 'rebuild' ? (y.t === 0 ? 0.7 : 1.15) * (a >= 31 ? 0.8 : 1) : 1;
    // human mistakes: a name or an award winner is overpaid for, and a contender that is slipping panics for the present
    const mistake = (hype && s > 0 ? 1 + g.star * 0.12 * err : 1) * (panic && y.t === 0 ? 1 + 0.3 * g.gamble * err : 1);
    total += (s > 0 ? s * buzz : s) * tilt * mistake * 0.88 ** y.t;
  }
  return Math.round(total);
}

/** What he really is worth, for the record: from the true ratings and potential. */
export const truth = (p) => worth(null, p, { view: p, plan: 'middle' }) ?? 0;

// ---------- the rules ----------

const hash = (s) => [...s].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);

/** Ten years in the majors and five with his club: he may refuse any trade. Whether he does is his choice, made when a club asks. */
/** Ten years in the majors and five with the present club. Years with the club run from the last move that brought him here (a trade resets it), else from when he signed. */
export const tenAndFive = (p) => {
  const join = p.mv?.filter((m) => m.to && m.to === p.orgId).at(-1)?.y;
  return (p.contract?.serviceTime ?? 0) >= 10 && game.year - (join ?? p.contract?.signed ?? game.year) >= 5;
};
/** His answer to a trade that would send him to `to`: words if he refuses, or null. About two in three refuse; the same player gives the same answer to the same club. */
export function vetoes(p, to) {
  if (!tenAndFive(p) || !to || hash(`veto-${p.id}-${to}-${game.year}`) % 3 === 0) return null;
  return `${fullName(p)} has ten years in the majors and five with his club. He has used that right and refuses your trade: he does not want to move to ${org(to).club.city}.`;
}

/** Why a player cannot be traded to this club at all, or null. */
export function blocked(p, to) {
  if (!p.orgId) return `${fullName(p)} is a free agent.`;
  const st = orgState(p.orgId);
  if (st.dfa.has(p.id)) return `${fullName(p)} has been designated for assignment.`;
  if (st.level.get(p.id) === 'FA' || p.contract?.status === 'free agent') return `${fullName(p)}'s contract has run out.`;
  if (p.tradeBar && today() < p.tradeBar) return `${fullName(p)} signed as a free agent and cannot be traded until 15 June.`;
  const nt = p.contract?.ext?.notrade;
  if (nt === 'full') return `${fullName(p)} has a full no-trade clause and will not be moved.`;
  if (nt === 'partial' && to && hash(`${p.id}-${to}`) % 2) return `${fullName(p)} has a no-trade clause that covers ${org(to).club.city}.`;
  return null;
}

/** An offer: { with, give: [ids you send], get: [ids you receive], cash: dollars you pay (negative: you receive) }. */
export function rulesCheck(offer, from = game.orgId, { roster = false, only = null, budget = true, window = true } = {}) {
  const bad = [];
  if (window && !windowOpen()) bad.push(windowText());
  const to = offer.with, a = org(from), b = org(to);
  for (const id of offer.give) { const p = P(id); if (!p || p.orgId !== from) bad.push('A player you offered is no longer with you.'); else { const r = blocked(p, to); if (r) bad.push(r); } }
  for (const id of offer.get) { const p = P(id); if (!p || p.orgId !== to) bad.push('A player you asked for has moved.'); else { const r = blocked(p, from); if (r) bad.push(r); } }
  for (const k of offer.givePicks || []) if (!holds(from, k)) bad.push(`${pickLabel(k)} is no longer yours to trade.`);
  for (const k of offer.getPicks || []) if (!holds(to, k)) bad.push(`${pickLabel(k)} is no longer theirs to trade.`);
  if (!offer.give.length && !offer.get.length && !offer.ptbnl && !offer.givePicks?.length && !offer.getPicks?.length) bad.push('Nobody is in the deal.');
  if (offer.ptbnl) { const debtor = offer.ptbnl.dir === 'get' ? to : from; if (!ptCandidates(debtor, debtor === to ? from : to, offer.ptbnl.cap).length) bad.push(`${org(debtor).club.city} have nobody at the lower levels they could name at that price.`); }
  if (budget && from === game.orgId && offer.give.length + offer.get.length) {
    const im = impact(offer);
    const r = im.rows[0];
    if (r.after > r.budget && r.after > r.now) bad.push(`The deal would take your payroll ${money(r.after - r.budget)} over the owner's budget. Send out more salary or ask him for more money.`);
  }
  const sa = orgState(from), sb = orgState(to);
  const inForty = (st, ids) => ids.filter((id) => st.forty.has(id) && st.il.get(id)?.kind !== 60).length; // the 60-day list does not count
  // a club already over 40 (the winter, before the trim) may not go further over
  const ca = counts(a, sa).forty, cb = counts(b, sb).forty;
  const fa = ca - inForty(sa, offer.give) + inForty(sb, offer.get);
  const fb = cb - inForty(sb, offer.get) + inForty(sa, offer.give);
  if (roster && !game.winter?.on && (from === game.orgId || to !== game.orgId) && fa > 40 && fa > ca) bad.push(`${a.club.city} would have ${fa} players on the 40-man roster.`);
  if (roster && !game.winter?.on && (to === game.orgId || from !== game.orgId) && fb > 40 && fb > cb) bad.push(`${b.club.city} would have ${fb} players on the 40-man roster.`);
  return [...new Set(bad)];
}

// ---------- evaluation by a general manager ----------

const sum = (ids, f) => ids.reduce((x, id) => x + f(P(id)), 0);

/** The deal from a club's side: what it receives less what it sends, in its own judgement. Cash is money it receives. */
// Only so many players can play. A pile of useful players is worth less than the sum of them to the club that takes
// them in: the best piece counts in full and each one after him a little less, and every player beyond the number it
// sends back takes a roster place a minimum-salary player would fill for nothing. Without this, four ordinary players
// bought any club's best one.
const DEPTH = [1, 0.8, 0.6, 0.45, 0.35];
export const ROSTER_PLACE = 2e6;
export function received(orgId, gets, sends) {
  const ws = gets.map((id) => worth(orgId, P(id)) ?? 0);
  const plus = ws.filter((w) => w > 0).sort((a, b) => b - a);
  let v = plus.reduce((a, w, i) => a + w * (DEPTH[i] ?? 0.3), 0) + ws.filter((w) => w <= 0).reduce((a, w) => a + w, 0);
  v -= Math.max(0, gets.length - sends.length) * ROSTER_PLACE;
  return v;
}

export function evaluate(orgId, sends, gets, cash = 0, pt = null, picks = null) {
  // a player to be named later is worth less than his cap to the club that receives him (it cannot be sure who it gets), and costs the club that owes him a little under it
  const ptIn = pt && pt.dir === 'give' ? pt.cap * PT_RECV : 0, ptOut = pt && pt.dir === 'get' ? pt.cap * PT_SEND : 0;
  const pl = orgId ? plan(orgId) : 'middle';
  const gain = received(orgId, gets, sends) + ptIn + (picks?.get || []).reduce((a, k) => a + pickValue(k, pl), 0);
  const pride = orgId && orgId !== game.orgId ? 1 + gmOf(orgId).pride * errScale() : 1.04; // he overrates his own players
  const loss = sum(sends, (p) => (worth(orgId, p) ?? 0) * pride) + ptOut * pride + (picks?.send || []).reduce((a, k) => a + pickValue(k, pl) * pride, 0);
  return { recv: gain, send: loss, gain: gain - loss + cash - payrollPenalty(orgId, sends, gets) };
}

const margin = (orgId, send, listed) => {
  const diff = { easy: 0.6, realistic: 1, hard: 1.5 }[game.settings?.difficulty || 'realistic'];
  return (1.5e6 + 0.06 * Math.max(0, send)) * diff * (orgId === game.orgId ? 1 : gmOf(orgId).hard) * (listed ? 0.5 : 1);
};

/** Payroll after a trade: a club that would go well over its budget values the deal less. */
function payrollPenalty(orgId, sends, gets) {
  const y = game.year;
  const delta = sum(gets, (p) => salaryFor(p, y) ?? 0) - sum(sends, (p) => salaryFor(p, y) ?? 0);
  const over = expected(orgId, y) + delta - budget(orgId, y) * 1.04;
  return over > 0 && delta > 0 ? Math.min(over, delta) * 0.8 : 0;
}

/** A club's reasons for not moving a player at all. */
function untouchable(orgId, p) {
  const o = org(orgId), st = orgState(orgId);
  if (plan(orgId) === 'contend' && game.phase === 'regular' && game.date.getMonth() >= 5 && p.level === 'MLB') {
    const peers = o.players.filter((x) => st.active.has(x.id) && isPitcher(x) === isPitcher(p)).sort((a, b) => value(b) - value(a));
    if (peers.slice(0, 2).some((x) => x.id === p.id)) return `${o.club.city} are in the race and will not sell ${fullName(p)}.`;
  }
  return null;
}

// ---------- the answer to your offer ----------

const roundTo = (v, s) => Math.round(v / s) * s;

/** Players of yours a club might ask for, with what each is worth to it. */
function askPool(orgId, offer) {
  const me = org(game.orgId);
  const st = orgState(game.orgId), tight = counts(me, st).forty + offer.get.filter((id) => orgState(orgId).forty.has(id)).length > 40;
  // when your 40-man roster is full he asks for players who free a place
  return me.players.filter((p) => !offer.give.includes(p.id) && !blocked(p, orgId) && (!tight || st.forty.has(p.id))).map((p) => ({ p, w: worth(orgId, p) ?? 0 })).filter((x) => x.w > 0).sort((a, b) => a.w - b.w);
}

/** Players to add to cover a shortfall: the smallest who covers it, else the biggest and go round again. */
function fillGap(orgId, offer, deficit) {
  const pool = askPool(orgId, offer), add = [];
  let left = deficit;
  for (let i = 0; i < 3 && left > 0; i++) {
    const fit = pool.find((x) => x.w >= left && !add.includes(x.p.id));
    const pick = fit || [...pool].reverse().find((x) => !add.includes(x.p.id));
    if (!pick) break;
    add.push(pick.p.id); left -= pick.w;
  }
  return left > 0 ? null : add;
}

const names = (ids) => ids.map((id) => fullName(P(id))).join(', ');

/**
 * Put an offer to a general manager. Returns { status: 'accept'|'counter'|'refuse'|'wait'|'blocked', text, counter, problems }.
 * Counters change what you give, or ask for cash. Each answer uses some of his patience.
 */
export function respond(offer, { enquiry = false } = {}) {
  const m = market(), to = offer.with, c = org(to).club;
  // the owner's budget is checked when you confirm, not while the other club is only talking
  const probs = rulesCheck(offer, game.orgId, { budget: false, window: false }); // talks go on while trades are closed; the deal completes when the window opens
  if (probs.length) return { status: 'blocked', text: probs[0], problems: probs };
  if ((m.lock[to] || 0) > today()) return { status: 'wait', text: `${c.city}${/s$/.test(c.city) ? "'" : "'s"} general manager will not take your call until ${dateWords(new Date(game.date.getFullYear(), game.date.getMonth(), game.date.getDate() + (m.lock[to] - today())))}.` };
  for (const id of offer.get) { const r = untouchable(to, P(id)); if (r) return { status: 'refuse', text: r }; }
  // a player with ten and five can refuse to move, whichever way he is going
  for (const id of offer.get) { const r = vetoes(P(id), game.orgId); if (r) return { status: 'refuse', text: r }; }
  for (const id of offer.give) { const r = vetoes(P(id), to); if (r) return { status: 'refuse', text: r }; }
  const e = evaluate(to, offer.get, offer.give, offer.cash || 0, ptFor(offer), { send: offer.getPicks || [], get: offer.givePicks || [] }); // he sends what you ask for and receives what you offer
  const listed = offer.get.some((id) => P(id).listed);
  const need = margin(to, e.send, listed);
  const neg = (m.neg[to] ||= { rounds: 0 });
  if (e.gain >= need) {
    neg.rounds = 0;
    return { status: 'accept', text: `${c.city}${/s$/.test(c.city) ? "'" : "'s"} general manager: "We have a deal. That works for us."` , eval: e };
  }
  // an offer far below what he wants is an insult
  if ((offer.give.length || offer.givePicks?.length) && e.send > 3e6 && e.recv < e.send * 0.6) {
    m.lock[to] = today() + lockDays(to, 3); insulted(to);
    if (new Rng(`leak-${to}-${today()}-${offer.get.join()}`).chance(0.3)) leak(offer, c.city);
    return { status: 'refuse', text: `${c.city}${/s$/.test(c.city) ? "'" : "'s"} general manager: "That is not a serious offer. Call me when you are ready to talk properly."`, eval: e };
  }
  neg.rounds++;
  if (neg.rounds > 4) { neg.rounds = 0; m.lock[to] = today() + lockDays(to, 5); return { status: 'wait', text: `${c.city}${/s$/.test(c.city) ? "'" : "'s"} general manager: "We have been round this enough. Give it a few days."` }; }
  const deficit = need - e.gain;
  const add = fillGap(to, offer, deficit);
  if (add) return { status: 'counter', text: `${c.city}${/s$/.test(c.city) ? "'" : "'s"} general manager: "Close. We would do it if you added ${names(add)}."`, counter: { ...offer, give: [...offer.give, ...add] }, eval: e };
  // a pick of yours that closes the gap: the smallest that covers it
  { const mine = picksOf(game.orgId).filter((k) => !(offer.givePicks || []).includes(k)).map((k) => ({ k, v: pickValue(k, plan(to)) })).filter((x) => x.v >= deficit).sort((a, b) => a.v - b.v)[0];
    if (mine && deficit >= 0.5e6) return { status: 'counter', text: `${c.city}${/s$/.test(c.city) ? "'" : "'s"} general manager: "Close. We would do it if you added your ${pickLabel(mine.k)}."`, counter: { ...offer, givePicks: [...(offer.givePicks || []), mine.k] }, eval: e }; }
  if (!offer.ptbnl && deficit >= 1e6 && deficit <= 14e6 && ptCandidates(game.orgId, to, deficit / PT_RECV).length) {
    const cap = Math.max(500000, roundTo(deficit / PT_RECV, 250000));
    return { status: 'counter', text: `${c.city}${/s$/.test(c.city) ? "'" : "'s"} general manager: "Close. We would do it if you also send a player to be named later, a prospect worth up to ${money(cap)}."`, counter: { ...offer, ptbnl: { dir: 'give', cap } }, eval: e };
  }
  const ask = roundTo(deficit, 250000);
  if (ask <= 25e6) return { status: 'counter', text: `${c.city}${/s$/.test(c.city) ? "'" : "'s"} general manager: "We would need ${money(ask)} in cash to make it work."`, counter: { ...offer, cash: (offer.cash || 0) + ask }, eval: e };
  return { status: 'refuse', text: `${c.city}${/s$/.test(c.city) ? "'" : "'s"} general manager: "I cannot make that work, and you have nothing I want enough to close the gap."`, eval: e };
}

/** What it would take: the price a club names for the players you ask about, with nothing from you yet. */
export function askPrice(orgId, getIds) {
  return respond({ with: orgId, give: [], get: getIds, cash: 0 }, { enquiry: true });
}

// ---------- doing it ----------

/** Move the players. The caller has checked the rules. */
export function execute(offer, from = game.orgId) {
  const to = offer.with, m = market();
  const moves = [
    ...offer.give.map((id) => [P(id), from, to]),
    ...offer.get.map((id) => [P(id), to, from]),
  ];
  const e = { youGive: truthSum(offer.give), youGet: truthSum(offer.get) };
  wcache.clear(); bcache.clear();
  for (const [p, a, b] of moves) {
    record('trade', p, b, a, { swap: moves.filter((x) => x[0] !== p && x[2] === a).map((x) => x[0].id) });
    const ost = orgState(a), wasForty = ost.forty.has(p.id), il = ost.il.get(p.id);
    const level = p.level === 'MLB' || il ? 'MLB' : p.level;
    delete p.listed;
    transfer(p, b, level, 'trade', { sw: moves.filter((x) => x[0] !== p && x[2] === a).map((x) => x[0].id), cash: offer.cash || undefined, pt: offer.ptbnl ? 1 : undefined });
    rumourMoved(p.id, b);
    const nst = orgState(b), no = org(b);
    if (wasForty) nst.forty.add(p.id);
    if (il) nst.il.set(p.id, il);
    else if (level === 'MLB') {
      const room = counts(no, nst).active < limits().active && (!isPitcher(p) || counts(no, nst).pitchers < limits().pitchers);
      if (room) nst.active.add(p.id); else { nst.level.set(p.id, 'AAA'); p.level = 'AAA'; p.team = `${b}-AAA`; p.club = game.world.clubs.get(p.team) || no.club; }
    }
  }
  for (const k of offer.givePicks || []) movePick(k, to);
  for (const k of offer.getPicks || []) movePick(k, from);
  if (offer.cash) {
    const pay = offer.cash > 0 ? from : to, get = offer.cash > 0 ? to : from, amt = Math.abs(offer.cash);
    const y = game.year;
    (org(pay).club.otherMoney ||= []).push({ name: 'Cash in a trade', note: `sent to ${org(get).club.city}`, years: { [y]: amt } });
    (org(get).club.otherMoney ||= []).push({ name: 'Cash in a trade', note: `from ${org(pay).club.city}`, years: { [y]: -amt } });
  }
  if (offer.ptbnl) {
    const debtor = (offer.ptbnl.dir === 'get') === (from === game.orgId) ? to : from; // who owes the player
    if (from === game.orgId || to === game.orgId) {
      const rng = new Rng(`ptbnl-${today()}-${debtor}-${offer.ptbnl.cap}`);
      (m.ptbnl ||= []).push({ debtor, other: debtor === to ? from : to, cap: offer.ptbnl.cap, due: today() + rng.int(25, 150), made: today() });
    }
  }
  for (const id of [from, to]) { const o = org(id), st = orgState(id); refreshStaff(o, st); }
  const edge = e.youGet - e.youGive;
  if (from === game.orgId) { dealt(to, edge); for (const [p, a] of moves) if (a === game.orgId) leaving(p); }
  m.lock[to] = 0; delete m.neg[to];
  voidStale();
  // talks with other clubs that counted on a player who has just moved are over, and their mail says so
  const gone = new Set([...offer.give, ...offer.get]);
  const own = offer.deal || to; // the deal being done is closed by its caller; other deals, with this club too, fall if they counted on these players
  for (const [org2, tk] of Object.entries(m.talks || {})) {
    if (org2 === own) continue;
    const d = tk.agreed?.offer || tk.pending?.offer;
    const hit = d && [...(d.give || []), ...(d.get || [])].filter((id) => gone.has(id));
    if (!hit?.length) continue;
    delete m.talks[org2];
    const text = `That deal is off: ${names(hit)} ${hit.length === 1 ? 'is' : 'are'} no longer available after your trade with ${org(to).club.city}.`;
    for (const mm of game.inbox) if (mm.trade === org2 && !mm.closed) { mm.closed = text; mm.read = true; }
  }
  m.done.push({ date: game.date.getTime(), a: from, b: to, give: offer.give.slice(), get: offer.get.slice(), givePicks: offer.givePicks?.slice(), getPicks: offer.getPicks?.slice(), cash: offer.cash || 0, truth: edge });
  if (m.done.length > 300) m.done.shift();
  return e;
}
const truthSum = (ids) => sum(ids, (p) => truth(p));

/** The news when you make a trade. */
export function announceUser(offer) {
  const to = offer.with, c = org(to).club, me = org(game.orgId).club;
  const ga = offer.get.map((id) => P(id)), gv = offer.give.map((id) => P(id));
  const star = [...ga, ...gv].sort((a, b) => value(b) - value(a))[0];
  headline(`${me.city.toUpperCase()} TRADE WITH ${c.city.toUpperCase()}: ${fullName(star).toUpperCase()}`, true);
  message({
    cat: 'club', important: true, title: `Trade completed with ${c.city}`, ids: [...offer.give, ...offer.get], got: offer.get.slice(),
    parts: [{ p: `You have sent ${[...(gv.length ? [names(offer.give)] : []), ...(offer.givePicks || []).map((k) => pickLabel(k))].join(', ') || 'nobody'} to ${c.city} and received ${[...(ga.length ? [names(offer.get)] : []), ...(offer.getPicks || []).map((k) => pickLabel(k))].join(', ') || 'nobody'}${offer.cash ? (offer.cash > 0 ? `, and you pay ${money(offer.cash)}` : `, and they pay you ${money(-offer.cash)}`) : ''}.${offer.ptbnl ? (offer.ptbnl.dir === 'get' ? ` ${c.city} will also send you a player to be named later, a prospect worth up to ${money(offer.ptbnl.cap)}, within the next few months.` : ` You will also send ${c.city} a player to be named later, worth up to ${money(offer.ptbnl.cap)}, within the next few months. Your assistant will choose one who is not among your best prospects.`) : ''}` },
      ...ga.slice(0, 3).map((p) => ({ p: about(p), pid: p.id }))],
    voices: [...exitVoices(game.orgId, gv.sort((a, b) => value(b) - value(a))[0] || star, 'tradedAway').slice(0, 1), ...voices(game.orgId, 'tradedFor', { p: ga.sort((a, b) => value(b) - value(a))[0] || star }, 0).filter(() => ga.length && value(ga[0]) >= 52)],
  });
}

// ---------- the other clubs trade with each other ----------

function watch(p, title, body) {
  if (game.shortlist?.has(p.id)) message({ cat: 'club', player: p.id, important: true, stop: game.settings.stops?.important, title, body: `${body}\nHe is on your shortlist.` });
}

function leagueTrade(a, b, give, get, why) {
  const ca = org(a).club, cb = org(b).club;
  const ps = [...give, ...get].map(P);
  const star = ps.sort((x, y) => value(y) - value(x))[0];
  execute({ with: b, give, get, cash: 0 }, a);
  for (const id of give) watch(P(id), `${fullName(P(id))} traded to ${cb.city}`, `${ca.city} have traded ${fullName(P(id))} to ${cb.city} for ${names(get)}.`);
  for (const id of get) watch(P(id), `${fullName(P(id))} traded to ${ca.city}`, `${cb.city} have traded ${fullName(P(id))} to ${ca.city} for ${names(give)}.`);
  const big = value(star) >= 54;
  if (big) headline(`${fullName(star).toUpperCase()} TRADED TO ${(get.includes(star.id) ? ca : cb).city.toUpperCase()}`);
  if (big) message({ cat: 'league', quiet: false, title: `${ca.city} and ${cb.city} make a trade`, body: `${ca.city} send ${names(give)} to ${cb.city} for ${names(get)}. ${why}`, headline: big ? `${fullName(star)} traded` : undefined });
}

const trialsPer = (date) => {
  const d = dayNo(date), dl = dayNo(keyDates(game.year).deadline);
  if (game.phase === 'regular') {
    if (d > dl) return 0;
    if (d === dl) return 25;
    if (d > dl - 12) return 4;
    return 0.8;
  }
  const mo = date.getMonth(), day = date.getDate();
  if (mo === 11 && day >= 6 && day <= 12) return 9;
  if (mo === 10) return 2;
  if (mo === 11 || mo === 0) return 1.5;
  return 1;
};

/** In the last year of his contract. */
// (a player the club keeps through arbitration is not a rental: the years it controls him count)
const expiring = (p) => schedule(p).length <= 1;

/** One attempt at a deal between two computer clubs: a selling club moves a veteran for prospects. */
function attempt(rng) {
  const clubs = mlbClubs().filter((id) => id !== game.orgId);
  const plans = new Map(clubs.map((id) => [id, plan(id)]));
  const sellers = clubs.filter((id) => plans.get(id) !== 'contend'), buyers = clubs.filter((id) => plans.get(id) !== 'rebuild');
  if (!sellers.length || !buyers.length) return false;
  const s = rng.pick(sellers), b = rng.pick(buyers.filter((x) => x !== s));
  if (!b) return false;
  const so = org(s), bo = org(b), sst = orgState(s), bst = orgState(b);
  // near the deadline a club out of the race sells the star in the last year of his deal for a couple of young players
  const nearDl = game.phase === 'regular' && dayNo(keyDates(game.year).deadline) - today() <= 14;
  const cand = so.players.filter((p) => p.level === 'MLB' && !blocked(p, b) && value(p) >= 47 && (p.listed || p.age >= 28 || (nearDl && plans.get(s) === 'rebuild' && expiring(p))) && !untouchable(s, p)).sort(() => rng.next() - 0.5).slice(0, 4);
  if (!cand.length) return false;
  const bActive = bo.players.filter((p) => bst.active.has(p.id));
  for (const x of cand) {
    const peers = bActive.filter((p) => isPitcher(p) === isPitcher(x)).map((p) => value(believedV(b, p))).sort((p, q) => p - q);
    const vx = value(believedV(b, x));
    if (peers.length && vx < peers[Math.floor(peers.length * 0.5)] + 1) continue; // he would not help the buyer
    const pay = bo.players.filter((p) => !blocked(p, s) && (p.level !== 'MLB' || value(p) < 47)).sort((p, q) => (q.pa ?? 0) - (p.pa ?? 0)).slice(0, 25).map((p) => ({ p, ws: worth(s, p) ?? 0, wb: worth(b, p) ?? 0 })).filter((q) => q.ws > 0).sort((p, q) => q.ws - p.ws);
    const wx_b = worth(b, x) ?? 0, wx_s = worth(s, x) ?? 0;
    if (wx_b <= 0) continue;
    for (const q of pay.slice(0, 12)) {
      const one = [q];
      const packs = [one, ...pay.slice(0, 12).filter((r) => r !== q).slice(0, 2).map((r) => [q, r])];
      // a star for a handful of prospects: the seller takes the players its buyer can best spare, up to four, and only now and then
      if (q === pay[0] && (value(x) >= 53 || expiring(x)) && rng.chance(0.6)) {
        const need = wx_s * 1.1 + 1.5e6;
        const spare = pay.filter((z) => z.wb < wx_b * 0.6).sort((m, n) => (n.ws / (n.wb + 1e5)) - (m.ws / (m.wb + 1e5)));
        const want = value(x) >= 58 && rng.chance(0.5) ? 4 : rng.chance(0.65) ? 3 : 2;
        const take = []; let got = 0;
        for (const z of spare) { if (take.length >= want || got >= need) break; take.push(z); got += z.ws; }
        if (take.length < 2 || got < need) { /* no package of that size is enough */ } else packs.unshift(take);
      }
      for (const pkg of packs) {
        const give = pkg.map((z) => z.p.id), eb = evaluate(b, give, [x.id]), es = evaluate(s, [x.id], give);
        if (eb.gain < margin(b, eb.send) || es.gain < margin(s, es.send, x.listed)) continue;
        const offer = { with: s, give, get: [x.id], cash: 0 };
        if (rulesCheck(offer, b, { roster: true }).length) continue;
        const why = plans.get(s) === 'rebuild' ? `${org(s).club.city} are building for the future and get ${pkg.length > 1 ? 'young players' : 'a young player'} for him.` : '';
        // many deals are known before they are done: the story gets out, and the deal is finished a day or two later
        if (rng.chance(0.5) && windowOpen()) {
          const m = market(), id = `d${m.nextId++}`;
          (m.pending ||= []).push({ id, buyer: b, seller: s, give, get: [x.id], why, due: today() + rng.int(1, 3) });
          if (rng.chance(0.75)) addRumour({ pid: x.id, from: s, to: b, real: true, dealId: id, rng });
          return true;
        }
        leagueTrade(b, s, give, [x.id], why);
        return true;
      }
    }
  }
  return false;
}
const believedV = (orgId, p) => beliefView(orgId, p);

/** Deals the computer clubs agreed a day or two ago are finished, if they still stand. */
function finishPending() {
  const m = market();
  if (!m.pending?.length) return;
  const due = m.pending.filter((d) => d.due <= today());
  m.pending = m.pending.filter((d) => d.due > today());
  for (const d of due) {
    const ok = [...d.give].every((id) => P(id)?.orgId === d.buyer) && d.get.every((id) => P(id)?.orgId === d.seller);
    const offer = { with: d.seller, give: d.give, get: d.get, cash: 0 };
    if (!ok || rulesCheck(offer, d.buyer, { roster: true }).length) { rumourFailed(d.id); continue; }
    leagueTrade(d.buyer, d.seller, d.give, d.get, d.why);
  }
}

/** Each day: the computer clubs trade, list players and make you offers. */
export function tradeDay(date = game.date) {
  reviewPlans(date);
  ptbnlDay();
  if (!windowOpen(date)) return;
  finishPending();
  shopDay();
  rumourDay(date);
  const rng = new Rng(`trade-${dayNo(date)}-${game.year}-${game.orgId}`);
  const n = trialsPer(date);
  const tries = Math.floor(n) + (rng.chance(n - Math.floor(n)) ? 1 : 0);
  for (let i = 0; i < tries; i++) attempt(rng);
  if (date.getDay() === 1) relist(rng);
  offersToYou(rng, date);
  remindOffers();
  expireOffers();
}

/** A burst of deadline-day business, run by the deadline screen as the clock moves: the computer clubs trade and may call you. */
export function deadlineTick(rng) {
  if (!windowOpen()) return;
  finishPending();
  for (let i = 0; i < 2; i++) attempt(rng);
  offersToYou(rng, game.date, 4);
  expireOffers();
}

/** The transfer list: selling clubs list veterans, and the list is refreshed weekly. */
function relist(rng) {
  const m = market();
  for (const id of mlbClubs()) {
    if (id === game.orgId) continue;
    const o = org(id);
    for (const p of o.players) if (p.listed && p.listed.by === id && (dayNo(game.date) - p.listed.on > 30 || rng.chance(0.15))) delete p.listed;
    if (plan(id) !== 'rebuild') continue;
    const have = o.players.filter((p) => p.listed?.by === id).length;
    if (have >= 2) continue;
    const pick = o.players.filter((p) => p.level === 'MLB' && p.age >= 29 && value(p) >= 48 && !blocked(p, null)).sort(() => rng.next() - 0.5)[0];
    if (pick) { pick.listed = { by: id, on: dayNo(game.date) }; watch(pick, `${fullName(pick)} is on the transfer list`, `${o.club.city} have made ${fullName(pick)} available. Clubs that want him can make an offer.`); }
  }
  m.listedAt = dayNo(game.date);
}

/** The players on the transfer list, yours and everyone else's. */
export const listedPlayers = () => game.world.list.filter((p) => p.listed && p.orgId);

// ---------- shopping a player around ----------

/** Put a player of yours to every club. They answer over the next one to three days: the best few make offers. Returns text for a toast. */
export function shopPlayer(p) {
  const m = market(), day = today();
  if (p.orgId !== game.orgId) return 'He is not your player.';
  if (!windowOpen()) return windowText();
  const why = blocked(p, null);
  if (why) return why;
  if (m.shopped?.[p.id] != null && day - m.shopped[p.id] < 10) return 'You shopped him around recently. Give the clubs ten days.';
  const rng = new Rng(`shop-${p.id}-${day}-${game.manager}`);
  const rows = [];
  for (const b of mlbClubs()) {
    if (b === game.orgId || m.lock?.[b] || blocked(p, b)) continue;
    const bo = org(b);
    const wt = (worth(b, p) ?? 0) * Math.max(0.65, Math.min(1, 0.97 / gmOf(b).hard));
    const due = day + 1 + rng.int(0, 2);
    if (wt < 2e6) { rows.push({ club: b, due, give: [], out: 0 }); continue; }
    const cap = wt > 25e6 && rng.chance(0.35) ? 4 : wt > 10e6 && rng.chance(0.4) ? 3 : 2; // how many players they might send
    const pay = bo.players.filter((x) => !blocked(x, game.orgId)).map((x) => ({ p: x, w: worth(b, x) ?? 0 })).filter((x) => x.w > 0 && x.w <= wt * 0.9).sort((a, c) => c.w - a.w);
    const give = []; let out = 0;
    for (const x of pay) { if (give.length < cap && out + x.w <= wt * 0.9) { give.push(x.p.id); out += x.w; if (out > wt * 0.6) break; } }
    if (!give.length || rulesCheck({ with: b, give: [p.id], get: give, cash: 0 }, game.orgId).length) { rows.push({ club: b, due, give: [], out: 0 }); continue; }
    rows.push({ club: b, due, give, out });
  }
  // only the best half dozen make a proper offer
  const keep = new Set(rows.filter((r) => r.give.length).sort((a, c) => c.out - a.out).slice(0, 6).map((r) => r.club));
  for (const r of rows) if (!keep.has(r.club)) r.give = [];
  (m.shopped ||= {})[p.id] = day; // only once it has worked, so a failure never locks him out
  (m.shop ||= []).push({ pid: p.id, day, rows });
  return 'Word is out that he is available. The clubs will reply over the next few days.';
}

/** The replies to a player you have shopped around, as they fall due. */
function shopDay() {
  const m = market(), day = today();
  if (!m.shop?.length) return;
  for (const sh of m.shop) {
    const p = P(sh.pid);
    if (!p || p.orgId !== game.orgId) { sh.rows = []; continue; }
    for (const r of sh.rows.filter((x) => !x.done && x.due <= day)) {
      r.done = true;
      if (!r.give.length) continue;
      const give = r.give.filter((id) => P(id)?.orgId === r.club);
      if (!give.length || rulesCheck({ with: r.club, give: [p.id], get: give, cash: 0 }, game.orgId, { roster: true, only: 'to' }).length) { r.give = []; continue; }
      const real = { id: m.nextId++, from: r.club, send: give, want: [p.id], date: day, expires: day + 5, status: 'open' };
      m.offers.push(real);
      rumourOffered(p.id, r.club);
      const bo = org(r.club);
      message({ cat: 'club', important: true, stop: true, title: `${bo.club.city} offer ${names(give)} for ${fullName(p)}`, offer: real.id, player: p.id,
        body: `${bo.club.city} answered the call about ${fullName(p)}. They would send ${names(give)}. The offer stands until ${dateWords(fromDay(real.expires))}.` });
    }
    if (sh.rows.every((x) => x.done)) {
      const offered = sh.rows.filter((x) => x.give.length).length;
      message({ cat: 'club', title: `${fullName(p)}: ${offered ? `${offered} club${offered === 1 ? '' : 's'} made an offer` : 'nobody made an offer'}`, player: p.id,
        body: offered ? `You put ${fullName(p)} out to every club. ${offered} made an offer, and the rest were not interested at a price that works for them. The offers are in your news and under Transfers, Offers.` : `You put ${fullName(p)} out to every club and nobody would pay enough. Try again in a few weeks, or lower your sights.` });
      sh.finished = true;
    }
  }
  m.shop = m.shop.filter((x) => !x.finished && x.rows.length);
}

export function listPlayer(p) { p.listed = { by: game.orgId, on: today(), mine: true }; }
export function unlist(p) { delete p.listed; }

// ---------- offers made to you ----------

function offersToYou(rng, date, boost = 1) {
  const m = market();
  const mine = org(game.orgId).players;
  const listed = mine.filter((p) => p.listed?.mine);
  const open = m.offers.filter((o) => o.status === 'open').length;
  if (open >= 3) return;
  const chance = ((game.phase === 'regular' ? 0.06 : 0.1) + listed.length * 0.12) * boost;
  if (!rng.chance(chance)) return;
  const clubs = mlbClubs().filter((id) => id !== game.orgId && !m.lock[id]);
  const b = rng.pick(clubs), bo = org(b);
  const pool = listed.length && rng.chance(0.7) ? listed : mine.filter((p) => !blocked(p, b) && worth(b, p) > 4e6);
  const target = pool.length ? rng.pick(pool) : null;
  if (!target || target.orgId !== game.orgId || blocked(target, b)) return;
  const wt = worth(b, target) ?? 0;
  if (wt < 3e6) return;
  // he pays in his own players, adding until he is about as generous as he can be and still gain
  const pay = bo.players.filter((p) => !blocked(p, game.orgId)).map((p) => ({ p, w: worth(b, p) ?? 0 })).filter((x) => x.w > 0 && x.w <= wt * 0.9).sort((a, c) => c.w - a.w);
  const give = [];
  let out = 0;
  const cap = wt > 25e6 && rng.chance(0.35) ? 4 : wt > 10e6 && rng.chance(0.4) ? 3 : 2;
  for (const x of pay) { if (give.length < cap && out + x.w <= wt * 0.9) { give.push(x.p.id); out += x.w; if (out > wt * 0.6) break; } }
  if (!give.length) return;
  const offer = { with: b, give: [target.id], get: give, cash: 0 };
  if (rulesCheck(offer, game.orgId, { roster: true, only: 'to' }).length) return;
  // from his side: he gives `give` and receives the target
  const real = { id: m.nextId++, from: b, send: give, want: [target.id], date: today(), expires: today() + 3, status: 'open' };
  m.offers.push(real);
  rumourOffered(target.id, b);
  message({
    cat: 'club', important: true, stop: true, title: `${bo.club.city} make an offer for ${fullName(target)}`, offer: real.id,
    body: `${bo.club.city}${/s$/.test(bo.club.city) ? "'" : "'s"} general manager has called about ${fullName(target)}. He is offering ${names(give)}. The offer stands until ${dateWords(fromDay(real.expires))}. You can answer it from Transfers.`,
  });
}
const fromDay = (n) => addDays(game.date, n - today());

/** On the last day an offer to you stands, Continue stops once more so it does not run out unseen. */
function remindOffers() {
  voidStale();
  for (const o of market().offers) {
    if (o.status !== 'open' || o.warned || o.expires > today()) continue;
    o.warned = true;
    const bo = org(o.from), t = o.want.map(P).filter(Boolean);
    message({ cat: 'club', important: true, stop: true, offer: o.id, title: `Last day: ${bo.club.city}'s offer for ${t.length ? fullName(t[0]) : 'your player'}`,
      body: `${bo.club.city}'s offer for ${names(o.want)} runs out tonight. They are offering ${names(o.send)}. Accept it, turn it down, or let it lapse.` });
  }
}

/** Once an offer is settled its mail is stale: the last-day reminder goes, and the first letter is marked read. */
function settleMail(o) {
  for (let i = game.inbox.length - 1; i >= 0; i--) if (game.inbox[i].offer === o.id && /^Last day:/.test(game.inbox[i].title || '')) game.inbox.splice(i, 1);
  for (const m of game.inbox) if (m.offer === o.id) m.read = true;
}

/** Would the club making an offer to you end up further over the 40-man limit than it is now? Such a deal can never be completed. */
function cannotFit(o) {
  return false; // a computer club's roster is its own business: it trims itself, so its 40-man limit never blocks you
  const st = orgState(o.from), mine = orgState(game.orgId);
  const inForty = (s2, ids) => ids.filter((id) => s2.forty.has(id) && s2.il.get(id)?.kind !== 60).length;
  const c = counts(org(o.from), st).forty;
  const after = c - inForty(st, o.send) + inForty(mine, o.want);
  return after > 40 && after > c;
}
/** An offer for a player who is no longer yours, from a club that no longer has what it offered, or that its club could not fit on its 40-man roster, is dead. */
const stale = (o) => o.want.some((id) => P(id)?.orgId !== game.orgId) || o.send.some((id) => P(id)?.orgId !== o.from) || cannotFit(o);
/** After any deal, offers that involved a player who has now moved are withdrawn at once. */
function voidStale() {
  for (const o of market().offers) if (o.status === 'open' && stale(o)) { o.status = 'withdrawn'; settleMail(o); }
}
function expireOffers() {
  voidStale();
  for (const o of market().offers) {
    if (o.status !== 'open') continue;
    if (o.expires < today()) { o.status = 'expired'; settleMail(o); }
  }
}

/** Accept an offer made to you. Returns an error text or null. */
export function acceptOffer(id) {
  const o = market().offers.find((x) => x.id === id);
  if (!o || o.status !== 'open') return 'That offer is no longer open.';
  if (stale(o)) { o.status = 'withdrawn'; settleMail(o); return 'That offer is no longer open: a player has moved or their club has no room for the deal.'; }
  const offer = { with: o.from, give: o.want, get: o.send, cash: 0 };
  const probs = rulesCheck(offer, game.orgId, { roster: true });
  if (probs.length) return probs[0];
  execute(offer);
  o.status = 'accepted'; settleMail(o);
  announceUser(offer);
  return null;
}
/** You have answered a club with a counter proposal: its own offers to you are replaced by the new talks. */
export function supersedeOffers(org) {
  for (const o of market().offers) if (o.status === 'open' && o.from === org) { o.status = 'countered'; settleMail(o); }
}
export function declineOffer(id) { const o = market().offers.find((x) => x.id === id); if (o) { o.status = 'declined'; settleMail(o); } }
/** Take an offer made to you into the offer screen as the start of your own. */
export const offerAsMine = (id) => { const o = market().offers.find((x) => x.id === id); return o ? { with: o.from, give: o.want, get: o.send, cash: 0 } : null; };

// ---------- the impact on your books ----------

/** What a deal does to you: payroll for this and the next two seasons, rosters, depth and risks. */
export function impact(offer) {
  const me = game.orgId, o = org(me), st = orgState(me);
  const years = [game.year, game.year + 1, game.year + 2];
  const gives = offer.give.map(P), gets = offer.get.map(P);
  const rows = years.map((y) => {
    const now = expected(me, y);
    const out = gives.reduce((a, p) => a + (salaryFor(p, y) ?? 0), 0), inn = gets.reduce((a, p) => a + (salaryFor(p, y) ?? 0), 0);
    const cash = y === game.year ? (offer.cash || 0) : 0;
    return { year: y, now, after: now - out + inn + cash, budget: budget(me, y) };
  });
  const forty = counts(o, st).forty - gives.filter((p) => st.forty.has(p.id)).length + gets.filter((p) => orgState(offer.with).forty.has(p.id)).length;
  const lineup = gives.filter((p) => st.lineupR.some((s) => s.id === p.id) || st.rotation.includes(p.id));
  const risks = [];
  if (rows[0].after > rows[0].budget) risks.push(`The payroll would be ${money(rows[0].after - rows[0].budget)} over the owner's budget for ${game.year}.`);
  const prospects = gives.filter((p) => p.level !== 'MLB' && (p.pa ?? 0) >= 120);
  for (const p of prospects) risks.push(`${fullName(p)} is one of your better prospects.`);
  const stars = gives.filter((p) => p.level === 'MLB' && value(p) >= 55);
  for (const p of stars) risks.push(`The fans will not like losing ${fullName(p)}.`);
  const holes = lineup.map((p) => `${fullName(p)} (${mainPos(p)}) is in your ${isPitcher(p) ? 'rotation' : 'lineup'} and would need replacing.`);
  return { rows, forty, holes, risks, control: [...gives, ...gets].map((p) => ({ p, years: schedule(p).length })) };
}

/** The assistant's plain view of a deal, advice only. */
export function advice(offer, res) {
  const gives = offer.give.map(P), gets = offer.get.map(P);
  const mine = gives.reduce((a, p) => a + (worth(game.orgId, p) ?? 0), 0) + (offer.givePicks || []).reduce((a, k) => a + pickValue(k, plan(game.orgId)), 0), his = gets.reduce((a, p) => a + (worth(game.orgId, p) ?? 0), 0) + (offer.getPicks || []).reduce((a, k) => a + pickValue(k, plan(game.orgId)), 0);
  if (!gives.length && !gets.length && !offer.ptbnl && !offer.givePicks?.length && !offer.getPicks?.length) return '';
  const pt = offer.ptbnl ? (offer.ptbnl.dir === 'get' ? 1 : -1) * offer.ptbnl.cap * 0.65 : 0;
  const d = his - mine - (offer.cash || 0) + pt;
  const unknown = gets.some((p) => worth(game.orgId, p) == null);
  if (unknown) return 'You have not seen some of these players closely. Ask a scout to look at them before you agree.';
  if (d > 10e6) return 'On what your scouts see, this is clearly in your favour. If the other club does not agree, it may be seeing something you do not.';
  if (d > 0) return 'Slightly in your favour on what you can see.';
  if (d > -6e6) return 'Close to even.';
  return 'On your numbers you are giving up more than you get.';
}

/** Worth in the viewer's money for the screens: "$12M", "?" when unseen. */
export const worthText = (p) => { const w = worth(game.orgId, p); return w == null ? '?' : (w < 0 ? '-' : '') + money(Math.abs(w)); };

/** Conclude an agreed deal: false and a reason if the rules stop it, else true. Shared by the trade screen and the news button. */
export function concludeTrade(agreed) {
  agreed = agreed?.offer || agreed; // the talks keep the deal as { offer, until }; either form will do
  const probs = rulesCheck(agreed);
  if (probs.length) return probs[0];
  execute(agreed);
  announceUser(agreed);
  const key = agreed.deal || agreed.with;
  delete game.market.talks[key];
  for (const m of game.inbox) if (m.trade === key && !m.closed) m.closed = `The trade with ${game.world.orgs.get(agreed.with)?.club.city ?? 'the club'} was done.`;
  return null;
}

// ---------- a player to be named later ----------
//
// One side sends a prospect later, to be named by the club that owes him, from the players at the lower levels. The
// deal sets only how much he may be worth ("a prospect worth up to X"); the club names him between one and five
// months on, and the clubs settle for cash if it has nobody to name. It is computed: nobody chooses, so a named
// player is whoever the club's own view puts closest to two thirds of the cap.

export const PT_RECV = 0.6;  // what the receiver counts it as, of the cap
export const PT_SEND = 0.7;  // what the club that owes him counts it as
const ptFor = (offer) => (offer.ptbnl ? offer.ptbnl : null);

/** Who the debtor club could name: minor leaguers off the 40-man roster, tradable, worth no more than the cap to it. */
export function ptCandidates(debtor, to, cap) {
  const o = org(debtor), st = orgState(debtor);
  const mineOwed = debtor === game.orgId;
  const ok = o.players.filter((p) => p.level !== 'MLB' && !p.amateur && !st.forty.has(p.id) && !st.dfa.has(p.id) && (p.age ?? 20) >= 18 && !blocked(p, to));
  const rated = ok.map((p) => ({ p, w: worth(debtor, p) ?? 0 })).filter((x) => x.w > 0 && x.w <= cap);
  // you keep your best: a player of yours with a ceiling this high is passed over while anyone else will do
  const spare = mineOwed ? rated.filter((x) => (x.p.pa ?? 0) < 140) : rated;
  return (spare.length ? spare : rated).map((x) => x.p);
}

function ptNamed(debtor, other, cap, rng) {
  const cands = ptCandidates(debtor, other, cap).map((p) => ({ p, w: worth(debtor, p) ?? 0 }));
  if (!cands.length) return null;
  const target = cap * 0.65;
  cands.sort((a, b) => Math.abs(a.w - target) - Math.abs(b.w - target) || a.p.age - b.p.age);
  return cands[Math.min(cands.length - 1, rng.chance(0.3) ? 1 : 0)].p;
}

/** Each day: players to be named later come due. */
export function ptbnlDay() {
  const m = market();
  if (!m.ptbnl?.length) return;
  const now = today();
  const due = m.ptbnl.filter((x) => x.due <= now);
  if (!due.length) return;
  m.ptbnl = m.ptbnl.filter((x) => x.due > now);
  for (const x of due) {
    const mineOwed = x.debtor === game.orgId;
    const rng = new Rng(`ptbnl-name-${x.debtor}-${x.other}-${x.made}-${x.cap}`);
    const city = org(mineOwed ? x.other : x.debtor).club.city;
    const p = ptNamed(x.debtor, x.other, x.cap, rng);
    if (p && !blocked(p, x.other)) {
      execute(mineOwed ? { with: x.other, give: [p.id], get: [], cash: 0 } : { with: x.debtor, give: [], get: [p.id], cash: 0 });
      message({
        cat: 'club', important: true, player: p.id, title: mineOwed ? `Player to be named later: ${fullName(p)} goes to ${city}` : `Player to be named later: ${city} send ${fullName(p)}`,
        parts: [{ p: mineOwed ? `Your side of the deal with ${city} is settled. Your assistant has named ${fullName(p)}, ${p.age}, from your minor league system, as the player to be named later.` : `${city} have named ${fullName(p)}, ${p.age}, as the player to be named later in your deal. He joins your minor league system.` }, { p: about(p) }],
      });
    } else {
      const amt = Math.max(250000, roundTo(x.cap * 0.3, 250000));
      execute({ with: mineOwed ? x.other : x.debtor, give: [], get: [], cash: mineOwed ? amt : -amt });
      message({ cat: 'club', title: `Player to be named later: settled for cash`, body: mineOwed ? `${city} agreed to take ${money(amt)} instead, since you had nobody to name.` : `${city} had nobody they could name, so they have paid you ${money(amt)} instead.` });
    }
  }
}
