// The winter, played day by day. The season's last game is followed by the development step and the
// turnover of players (offseason.js beginWinter), and then each Continue plays a day of the hot stove:
//
//   2 Nov        the winter opens. Club options and opt-outs are settled. The computer clubs re-sign some of
//                their own free agents; the rest, and any of yours you have not signed, wait for the market.
//   7 Nov        free agency opens to every club. You can talk to anyone from the Free Agents list.
//   1 Dec        tender deadline: the computer clubs let weaker arbitration cases go.
//   6-12 Dec     the Winter Meetings, the busiest week of the market.
//   15 Jan       arbitration figures are filed (settle on the winter screen).
//   1 Feb        hearings are held and the cases settled. The leftovers sign minor league deals.
//   19 Feb       the last day of the winter; Spring Training opens on the 20th.
//
// Each day every free agent worth a roster place has a small chance of signing, higher for the better
// players around the Winter Meetings and for the leftovers at the end. When he signs, the clubs that want
// him (a gain over their own depth, the money, and their own judgement of him) bid, and the best bid wins.
// Your offers carry a deadline: the agent says when his client will decide, and if you have not agreed by
// then and a club has bid, he goes.
import { jobsDay } from './jobs.js';
import { signingStory } from './stories.js';
import { intlDay } from './amateurs.js';
import { postForeign } from './postings.js';
import { scoutContractsEnd, scoutTick } from './scouting.js';
import { fullName, isPitcher, salaryIn, mainPos } from '../data/world.js';
import { game, orgState, autoClub } from '../state.js';
import { Rng } from '../core/rng.js';
import { value, askingSalary, askingYears, arbitrationSalary, LEAGUE_MIN } from './value.js';
import { transfer, refreshStaff, limits, noteMove, designate } from './roster.js';
import { headline } from './headlines.js';
import { message, about, lastId, since } from './inbox.js';
import { dayNo, fromDayNo, addDays, dateWords } from './calendar.js';
import { mediaQuote, exitVoices } from './media.js';
import { room, budget as ownerBudget, ownerWatch } from './finance.js';
import { counts } from '../club/depth.js';
import { markSigned, tradeDay } from './trade.js';
import { clubWouldOffer, makeOffer, decide, qoAmount, noteSigning } from './qualifying.js';
import { noMoney, noteDeal } from './contracts.js';
import { agentOf } from './agents.js';
import { buildWinter } from './facilities.js';
import { startRule5, protectionDay, protectionReminder, rule5Draft } from './rule5.js';
import { repliesDue } from './replies.js';
import { hearing } from './arbitration.js';
import { record } from './ledger.js';
import { contractFor, finishWinter } from './offseason.js';

const money = (v) => `$${(v / 1e6).toFixed(1)}M`;
const roundTo = (v, s) => Math.round(v / s) * s;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

/** The dated events of this winter. `game.year` is the season about to be played. */
export function winterDates(year = game.year) {
  return {
    start: new Date(year - 1, 10, 2),
    open: new Date(year - 1, 10, 7),
    tender: new Date(year - 1, 11, 1),
    meetings: [new Date(year - 1, 11, 6), new Date(year - 1, 11, 12)],
    arbFile: new Date(year, 0, 15),
    hearings: new Date(year, 1, 1),
    end: new Date(year, 1, 19),
  };
}

/** A club's own state of mind about a player: the same truth seen through that club's judgement, stable for the winter. */
const noise = (p, oid) => new Rng(`fa-${game.year}-${p.id}-${oid}`).normal(0, 1.3);

/** How a young player is worth a little more to a club than his rating today, and an old one a little less. */
const ageTilt = (p) => (p.age <= 27 ? (28 - p.age) * 0.25 : p.age >= 32 ? -(p.age - 30) * 0.8 : 0);

// ---------- the start of the winter ----------

/** Called by beginWinter once the new year's contracts are known. */
export function startWinter() {
  const W = game.world;
  buildWinter();
  startRule5();
  game.winter = { on: true, open: false, tender: false, filed: false, settled: false, week: [], signed: [], seenHub: false, last: null };
  const rng = new Rng(`winter-start-${game.year}-${game.orgId}`);
  for (const o of W.orgs.values()) {
    const mine = o.id === game.orgId, st = orgState(o.id);
    for (const p of [...o.players]) {
      // an opt-out taken: he leaves for the market when he is worth clearly more than he is paid
      const y = salaryIn(p, game.year);
      const oo = p.contract?.ext?.optOut;
      if (oo != null && oo === game.year - 1 && typeof y === 'number' && askingSalary(p) > y * 1.15) {
        toMarket(p, 'Free agent (opted out)');
        if (mine) message({ cat: 'club', player: p.id, title: `${fullName(p)} opts out`, body: `${fullName(p)} has used the opt-out in his contract and is a free agent. He is worth more on the market than the ${money(y)} he was due.` });
        continue;
      }
      // club options: picked up when the player is worth more than the option
      if (typeof y === 'string' && y.includes('opt')) {
        const fixed = p.contract.years.find((x) => x.season === game.year)?.optSalary;
        const market = askingSalary(p);
        const exercise = (p.age <= 26 && (p.contract.serviceTime || 0) < 6) || y === 'popt' ? (fixed ?? market * 0.9) >= market * 0.95 : fixed ? market * 0.95 >= fixed : value(p) >= 52;
        if (exercise) {
          const sal = fixed ?? Math.max(LEAGUE_MIN, Math.round(market * 0.9 / 50000) * 50000);
          p.contract.years = p.contract.years.map((x) => (x.season === game.year ? { season: game.year, salary: sal } : x));
          p.contract.status = 'signed';
          if (mine) message({ cat: 'club', player: p.id, title: `Option picked up on ${fullName(p)} (${money(sal)})`, body: `The club has exercised its option on ${fullName(p)} for ${game.year} at ${money(sal)}: he is worth more than that on the open market.` });
        } else {
          toMarket(p, 'Free agent (option declined)');
          if (mine) message({ cat: 'club', player: p.id, title: `Option declined: ${fullName(p)} becomes a free agent`, body: `The club has declined its ${game.year} option on ${fullName(p)}: his form did not justify the money. He is now a free agent.` });
        }
        continue;
      }
      // the computer clubs keep some of their own free agents before the market opens
      if (!mine && st.level.get(p.id) === 'FA') {
        const v = value(p);
        if (clubWouldOffer(p) && makeOffer(p)) {
          if (decide(p)) { p.contract = contractFor(p, p.qo.amount, 1, 'Accepted qualifying offer'); noteDeal(p, p.orgId); reSign(p, { quiet: true }); }
          else toMarket(p, 'Free agent (refused qualifying offer)');
          continue;
        }
        const stay = rng.chance(v >= 55 ? 0.4 : v >= 49 ? 0.35 : 0.15) && room(o.id, game.year) >= askingSalary(p);
        if (stay) reSign(p, { quiet: true });
        else toMarket(p, 'Free agent');
      }
    }
  }
  { const sc = scoutContractsEnd(); if (sc.length) message({ cat: 'club', title: 'Scouts: contracts at the end of the season', body: sc.join('\n') }); }
  message({ cat: 'club', important: true, title: 'The winter begins', body: `Your free agents have until ${dateWords(winterDates().open)} to be re-signed: until then nobody else can talk to them. After that they go on the open market with everyone else. Open the Free Agents list from the menu to talk to a player, or settle your arbitration cases on the winter screen. Press Continue to play the winter day by day.` });
}

/** A player leaves his club for the open market. */
function toMarket(p, text = 'Free agent') {
  if (p.orgId === game.orgId && p.contract?.status !== 'free agent') {
    const non = /non-tendered/.test(text);
    const q = exitVoices(game.orgId, p, non ? 'nonTender' : 'walks');
    if (q.length) message({ cat: 'club', player: p.id, quiet: true, title: non ? `${fullName(p)} non-tendered: the fans react` : `${fullName(p)} leaves: the fans react`,
      body: non ? `${fullName(p)} was released into free agency rather than tendered a contract.` : `${fullName(p)} has left for the open market.`, voices: q });
  }
  transfer(p, null, 'AAA', /non-tendered/.test(text) ? 'nontender' : 'expired');
  p.contract = { ...p.contract, status: 'free agent', years: [], text };
  if (!game.freeAgents.includes(p.id)) game.freeAgents.push(p.id);
}

/**
 * Re-sign one of a club's own free agents at what he asks (a deal you made on the negotiation screen is kept as it is).
 * A major leaguer goes back on the active roster if there is room.
 */
export function reSign(p, { quiet = false } = {}) {
  if (!p.orgId) return signFreeAgent(p); // he had already left for the market (an opt-out, a declined option): signing him again brings him back
  const o = game.world.orgs.get(p.orgId), st = orgState(p.orgId), mine = p.orgId === game.orgId;
  if (p.contract?.status !== 'signed') { p.contract = contractFor(p, askingSalary(p), askingYears(p)); noteDeal(p, p.orgId); }
  st.forty.add(p.id);
  const room_ = mine && p.level === 'MLB' && counts(o, st).active < limits().active && (!isPitcher(p) || counts(o, st).pitchers < limits().pitchers);
  st.level.set(p.id, room_ ? 'MLB' : 'AAA');
  if (room_) st.active.add(p.id);
  if (mine && !quiet) message({ cat: 'club', player: p.id, title: `${fullName(p)} re-signed`, body: `${fullName(p)} has agreed a new deal to stay: ${p.contract.text}.\n${about(p)}` });
}

// ---------- the market ----------

/** Players on the open market, in value order. */
export const marketPlayers = () => game.freeAgents.map((id) => game.world.players.get(id)).filter((p) => p && !p.retired).sort((a, b) => value(b) - value(a));

/** Is the market open to everyone today? */
export const marketOpen = () => !!game.winter?.open;

/** One day's cache of each club's money and need, so the market stays fast. */
let DAY = { n: -1, room: new Map(), nth: new Map() };
function today() {
  const n = dayNo(game.date);
  if (DAY.n !== n) DAY = { n, room: new Map(), nth: new Map() };
  return DAY;
}
/** What a computer club can still spend: the room in the owner's budget, and a little more, because owners stretch for a player they want. */
export const MARKET = { flex: Number(globalThis.process?.env?.FLEX ?? 0.5), price: Number(globalThis.process?.env?.PRICE ?? 0.8) };
const roomOf = (oid) => { const d = today(); if (!d.room.has(oid)) d.room.set(oid, room(oid, game.year) + MARKET.flex * ownerBudget(oid, game.year)); return d.room.get(oid); };
/** The value of the club's eleventh (hitter) or twelfth (pitcher) best man on the 40: what a signing has to beat. */
function nthOf(oid, pit) {
  const d = today(), k = `${oid}${pit ? 'p' : 'h'}`;
  if (!d.nth.has(k)) {
    const st = orgState(oid);
    const same = [...st.forty].map((x) => game.world.players.get(x)).filter((x) => x && isPitcher(x) === pit).sort((a, b) => value(b) - value(a));
    const nth = same[pit ? 11 : 10];
    d.nth.set(k, nth ? value(nth) : 40);
  }
  return d.nth.get(k);
}

/** The clubs that would sign him now, best bid first: { oid, gain }. Never your club. */
export function bidders(p, salary = askingSalary(p)) {
  const out = [];
  for (const o of game.world.orgs.values()) {
    if (o.id === game.orgId) continue;
    if (roomOf(o.id) < salary) continue;
    const gain = value(p) + ageTilt(p) + noise(p, o.id) - nthOf(o.id, isPitcher(p));
    if (gain > 1.5) out.push({ oid: o.id, gain });
  }
  return out.sort((a, b) => b.gain - a.gain);
}

/** The chance per day that a free agent of this value signs, by the stage of the winter. */
function hazard(v, date) {
  const d = winterDates();
  const meetings = date >= d.meetings[0] && date <= d.meetings[1];
  const late = date >= d.arbFile;
  const end = date >= d.hearings;
  const tier = v >= 56 ? [0.012, 0.1, 0.035, 0.1] : v >= 52 ? [0.02, 0.09, 0.04, 0.1] : v >= 48 ? [0.03, 0.07, 0.04, 0.1] : [0.01, 0.04, 0.04, 0.12];
  return end ? tier[3] : late ? tier[2] : meetings ? tier[1] : date < d.meetings[0] ? tier[0] : tier[2];
}

/** A club signs a free agent. Returns the contract text. */
function sign(p, oid, salary, years, why = 'Signed as a free agent') {
  const o = game.world.orgs.get(oid);
  transfer(p, oid, 'MLB', 'signed');
  p.contract = contractFor(p, salary, years, why);
  noteDeal(p, oid);
  noteMove(p, p.contract.text);
  markSigned(p);
  noteSigning(p, oid);
  orgState(oid).forty.add(p.id);
  const d = today();
  d.room.set(oid, roomOf(oid) - salary);
  d.nth.delete(`${oid}${isPitcher(p) ? 'p' : 'h'}`);
  const v = value(p);
  const city = o.club.city;
  const line = `${fullName(p)} signs with ${city}: ${p.contract.text.split(': ')[1]}`;
  game.winter.week.push({ v, line, pid: p.id, city, terms: p.contract.text.split(': ')[1] });
  record('sign', p, oid, null, { terms: p.contract.text.split(': ')[1] });
  game.winter.signed.push(p.id);
  if (v >= 54) {
    headline(`${fullName(p).toUpperCase()} SIGNS WITH ${city.toUpperCase()}`);
    if (v >= 58) {
      const q = mediaQuote(oid, 'signing', { p, level: p.age >= 33 ? 'old' : 'big' });
      void q; // the league's signings are no longer mailed out; the Rumour recap and the Free Agents list carry them
    }
  }
  signingStory(p, oid, { salary, years });
  if (game.shortlist?.has(p.id)) message({ cat: 'club', player: p.id, title: `${fullName(p)} has signed with ${city}`, body: `${line}.\nHe was on your shortlist.` });
  return p.contract.text;
}

/** A club is about to sign him: the news goes out, and the deal is done a day or two later unless you step in. */
function closeToDeal(p, oid, salary, years, date) {
  const v = value(p), c = game.world.orgs.get(oid).club;
  const days = v >= 56 ? 2 : 1;
  p.nearDeal = { oid, salary, years, due: dayNo(date) + days };
  const mine = !!game.shortlist?.has(p.id);
  const big = v >= 56;
  if (mine) message({
    cat: 'club', important: big, stop: game.settings.stops.important, player: p.id,
    title: `${c.city} close to signing ${fullName(p)}`,
    body: `${c.city} are reported close to agreeing a deal with ${fullName(p)} (${p.age}, ${mainPos(p)}): about ${money(salary)} a year over ${years} ${years === 1 ? 'year' : 'years'}. It could be done ${days === 1 ? 'tomorrow' : 'in two days'}.${mine ? '\nHe is on your shortlist.' : ''}\nIf you want him, you have until then to make an offer from the Transfers screen: his agent will answer you more quickly while another club is about to sign him.`,
  });
}


/** The talks you have open with a player, if any: an offer in the post, an agreement, or rounds already played. */
const inTalks = (p) => { const n = game.negotiations?.[p.id]; return n && (n.pending || n.agreed || n.log?.length) ? n : null; };

/**
 * A rival is about to sign a player you are talking to. Instead of losing him silently, the agent calls: another club
 * has made an offer, and you have until a stated day to go back in. An agreement you already have stands for its
 * four days. Returns the day the signing is held until, or null if the rival may sign him now.
 */
export function holdForUser(p, oid, salary, years, date) {
  const neg = inTalks(p);
  if (!neg) return null;
  const today = dayNo(date);
  if (neg.agreed && neg.agreedUntil != null && neg.agreedUntil >= today) return neg.agreedUntil + 1; // your agreement stands
  if (neg.rival) {
    // an answer from his agent still on its way holds the other club off until it has come, and you have had a day to reply
    if (neg.pending && neg.pending.due >= today) { neg.rival.until = Math.max(neg.rival.until, neg.pending.due + 1); neg.deadline = neg.rival.until; }
    return neg.rival.until > today ? neg.rival.until : null; // the warning has been given; the window is open or used up
  }
  const until = Math.max(today + 2, (neg.pending?.due ?? 0) + 1);
  neg.rival = { oid, salary, years, until };
  neg.deadline = until;
  const c = game.world.orgs.get(oid).club.city;
  message({
    cat: 'club', important: true, stop: true, player: p.id, neg: p.id,
    title: `${fullName(p)}: ${c} have made an offer`,
    body: `${agentOf(p).name} has called. "${c} have made ${fullName(p)} an offer: about ${money(salary)} a year over ${years} ${years === 1 ? 'year' : 'years'}. That is better than what we have from you. If you want him, you need at least to match it, or convince him he should come to you rather than go to them. I will hold them off until ${dateWords(fromDayNo(until))}. After that he signs with ${c}."\n\nOpen the talks: their offer is set out there, with a button to match it.`,
  });
  return until;
}

/** Deals reported earlier that are now due. */
function finishDeals(date) {
  for (const p of marketPlayers()) {
    const n = p.nearDeal;
    if (!n || n.due > dayNo(date)) continue;
    if (!game.freeAgents.includes(p.id)) { delete p.nearDeal; continue; }
    const held = holdForUser(p, n.oid, n.salary, n.years, date);
    if (held) { n.due = held; continue; } // you are in talks: he waits for your answer a little longer
    delete p.nearDeal;
    const c = game.world.orgs.get(n.oid).club;
    if (roomOf(n.oid) < n.salary) { continue; }
    sign(p, n.oid, n.salary, n.years);
  }
}

/** One day of free agency among the computer clubs. */
function marketDay(date, rng) {
  finishDeals(date);
  const d = winterDates();
  const progress = date >= d.arbFile ? clamp((dayNo(date) - dayNo(d.arbFile)) / 35, 0, 1) : 0;
  const pool = marketPlayers().filter((p) => value(p) >= 44);
  for (const p of pool) {
    if (!game.freeAgents.includes(p.id)) continue; // signed earlier today by an offer deadline
    const neg = game.negotiations?.[p.id];
    const due = neg?.deadline != null && neg.deadline <= dayNo(date);
    if (!due && !rng.chance(hazard(value(p), date))) continue;
    const ask = askingSalary(p);
    const bids = bidders(p, ask * MARKET.price);
    if (!bids.length) { if (due) { neg.deadline = null; message({ cat: 'club', player: p.id, title: `${fullName(p)}: the deadline passes`, body: `His agent says no club has met his terms and he is still talking. You have more time.` }); } continue; }
    const top = bids[0];
    const fac = (MARKET.price + 0.05 * Math.min(5, bids.length - 1) + rng.next() * 0.08) * (1 - 0.12 * progress);
    const salary = Math.max(LEAGUE_MIN, roundTo(ask * fac, 50000));
    if (roomOf(top.oid) < salary) continue;
    const years = clamp(askingYears(p) + (rng.chance(0.25) ? 1 : rng.chance(0.2) ? -1 : 0), 1, 8);
    // a player you are talking to is not lost silently: his agent tells you and gives you a day or two to go back in
    const heldUntil = holdForUser(p, top.oid, salary, years, date);
    if (heldUntil) { p.nearDeal = { oid: top.oid, salary, years, due: heldUntil }; continue; }
    // a notable player is reported close to a deal first; you have a day or two to step in
    if (!due && value(p) >= 50 && !p.nearDeal) { closeToDeal(p, top.oid, salary, years, date); continue; }
    sign(p, top.oid, salary, years);
    delete p.nearDeal;
    if (due) {
      const c = game.world.orgs.get(top.oid).club.city;
      message({ cat: 'club', important: true, stop: game.settings.stops.important, player: p.id, title: `${fullName(p)} signs with ${c}`, body: `You did not agree terms by his deadline and ${c} offered ${money(salary)} a year over ${years} ${years === 1 ? 'year' : 'years'}. He has taken it.` });
      delete game.negotiations[p.id];
    }
  }
}

/** The leftovers sign minor league deals with spring invitations, from 1 February. */
function minorDeals(rng) {
  const left = marketPlayers().filter((p) => value(p) >= 38);
  for (const p of left) {
    if (!rng.chance(0.18)) continue;
    const clubs = [...game.world.orgs.values()].filter((o) => o.id !== game.orgId).sort((a, b) => a.players.length - b.players.length).slice(0, 12);
    if (!clubs.length) return;
    const o = rng.pick(clubs);
    transfer(p, o.id, 'AAA', 'minor');
    p.contract = { ...p.contract, status: 'minor league', years: [], text: 'Minor league contract, spring invitation' };
    if (value(p) >= 47) game.winter.week.push({ v: value(p), pid: p.id, city: o.club.city, terms: 'minor league deal, spring training invite', line: `${fullName(p)} agrees a minor league deal with ${o.club.city} and an invitation to spring training` });
  }
}

/**
 * After the winter the market keeps moving: asking prices fall each day (see lateCut), so clubs with room sign the
 * better men who are left, and the rest take minor league deals. By the middle of the season only fringe players remain.
 */
export function seasonMarketDay(date) {
  if (!game.winter || game.winter.on || !game.freeAgents?.length) return;
  const rng = new Rng(`season-market-${game.year}-${dayNo(date)}-${game.manager}`);
  for (const p of marketPlayers()) {
    if (!game.freeAgents.includes(p.id)) continue;
    const v = value(p);
    let signed = false;
    if (v >= 44 && rng.chance(0.12)) {
      const ask = askingSalary(p);
      const top = bidders(p, ask)[0];
      if (top && roomOf(top.oid) >= ask) {
        sign(p, top.oid, ask, clamp(askingYears(p), 1, 3));
        signed = true;
        const st = orgState(top.oid), o = game.world.orgs.get(top.oid);
        if (st.forty.size > 40) {
          const low = [...st.forty].map((x) => game.world.players.get(x)).filter((x) => x && x.id !== p.id).sort((a, b) => value(a) - value(b))[0];
          if (low) designate(o, st, low);
        }
      }
    }
    // nobody wants him in the majors at any price he will accept: he takes a minor league deal rather than sit out the year
    if (!signed && v >= 30 && date >= new Date(game.year, 2, 5) && rng.chance(0.1)) {
      const clubs = [...game.world.orgs.values()].filter((o) => o.id !== game.orgId).sort((a, b) => a.players.length - b.players.length).slice(0, 12);
      if (!clubs.length) return;
      const o = rng.pick(clubs);
      transfer(p, o.id, 'AAA', 'minor');
      p.contract = { ...p.contract, status: 'minor league', years: [], text: 'Minor league contract' };
    }
  }
}

// ---------- the dated events ----------

function openMarket() {
  game.winter.open = true;
  const o = game.world.orgs.get(game.orgId), st = orgState();
  // your own free agents you did not sign go on the market
  for (const p of o.players.filter((x) => x.qo?.status === 'offered' && st.level.get(x.id) === 'FA')) {
    if (decide(p)) {
      p.contract = contractFor(p, p.qo.amount, 1, 'Accepted qualifying offer');
      reSign(p, { quiet: true });
      message({ cat: 'club', player: p.id, title: `${fullName(p)} accepts your qualifying offer`, body: `${fullName(p)} will stay for ${game.year} at ${money(p.qo.amount)}, one year.` });
    } else message({ cat: 'club', player: p.id, title: `${fullName(p)} turns down your qualifying offer`, body: `${fullName(p)} has refused the ${money(p.qo.amount)} offer and goes on the market. If he signs with another club, you receive a compensation pick after the first round of the ${game.year} draft.` });
  }
  const lost = o.players.filter((p) => st.level.get(p.id) === 'FA' && p.contract?.status !== 'signed');
  for (const p of lost) {
    toMarket(p, 'Free agent');
    message({ cat: 'club', player: p.id, title: `${fullName(p)} goes on the market`, body: `You did not sign ${fullName(p)} in time, so he is a free agent and every club can bid for him. You can still talk to him from the Free Agents list.`, quiet: true });
  }
  for (const p of o.players.filter((x) => st.level.get(x.id) === 'FA' && x.contract?.status === 'signed')) reSign(p, { quiet: true });
  postForeign();
  const top = marketPlayers().slice(0, 6);
  message({
    cat: 'league', important: true, stop: game.settings.stops.important, title: 'Free agency opens',
    parts: [{ p: `Free agency is open to every club. ${marketPlayers().length} players are available. You can talk to any of them from the Free Agents list in the menu. The best of them:` },
      { head: ['Player', 'Age', 'Position', 'Asks'], rows: top.map((p) => [{ pid: p.id, t: fullName(p) }, p.age, p.pos || (isPitcher(p) ? 'P' : '-'), `${money(askingSalary(p))} x ${askingYears(p)}`]) }],
  });
}

function tenderDay() {
  game.winter.tender = true;
  let n = 0;
  for (const o of game.world.orgs.values()) {
    if (o.id === game.orgId) continue;
    for (const p of [...o.players]) {
      const y = salaryIn(p, game.year);
      if (typeof y !== 'string' || !/^A\d/.test(y)) continue;
      // a club will not pay arbitration money for a player who is not worth it
      if ((arbitrationSalary(p, y) > askingSalary(p) * 1.15 || value(p) < 45) && !(p.age <= 26 && value(p) >= 50)) { toMarket(p, 'Free agent (non-tendered)'); n++; }
    }
  }
  const mine = game.world.orgs.get(game.orgId).players.filter((p) => /^A\d/.test(String(salaryIn(p, game.year) ?? '')));
  message({
    cat: 'club', important: true, stop: game.settings.stops.important, title: 'The tender deadline',
    parts: [{ p: `Today is the deadline to tender contracts to your players who are eligible for arbitration. ${n} players have been non-tendered by other clubs and are now free agents. Your own arbitration cases are below: to let one go, release him from the Squad screen.` },
      mine.length ? { head: ['Player', 'Year', 'Estimated salary'], rows: mine.map((p) => [{ pid: p.id, t: fullName(p) }, String(salaryIn(p, game.year)), money(arbitrationSalary(p, salaryIn(p, game.year)))]) } : { p: 'You have nobody in arbitration this winter.' }],
  });
}

function arbitrationFiled() {
  game.winter.filed = true;
  message({ cat: 'club', important: true, stop: game.settings.stops.important, title: 'Arbitration figures are filed', body: `Players and clubs have filed their figures. You can settle with each of your arbitration cases from the winter screen before hearings begin on ${dateWords(winterDates().hearings)}. Any case you leave goes to a hearing.` });
}

/** Hearings: every arbitration case is settled. Yours use the figure you agreed, or go to a hearing. */
function settleArbitration() {
  game.winter.settled = true;
  for (const o of game.world.orgs.values()) {
    const mine = o.id === game.orgId;
    for (const p of o.players) {
      const y = salaryIn(p, game.year);
      if (typeof y !== 'string' || !/^A\d/.test(y)) continue;
      let sal = arbitrationSalary(p, y), how = 'settled before a hearing';
      if (mine) {
        const set = game.arbSettled?.[p.id];
        if (set) sal = set;
        else {
          const h = hearing(p, y);
          sal = h.salary; how = h.won === 'player' ? 'won his hearing' : 'lost his hearing';
          p.mood = Math.max(0, (p.mood ?? 60) - (h.won === 'player' ? 3 : 8));
        }
      }
      p.contract.years = p.contract.years.map((x) => (x.season === game.year ? { season: game.year, salary: sal } : x));
      p.contract.status = 'signed';
      p.contract.aav = sal; p.contract.signed = game.year;
      p.contract.text = `Arbitration: 1 y/${money(sal)} (${String(game.year).slice(2)})`;
      noteDeal(p, o.id);
      if (mine) message({ cat: 'club', player: p.id, title: `${fullName(p)}: arbitration, ${how} (${money(sal)})`, body: `${fullName(p)} has ${how} and will be paid ${money(sal)} in ${game.year}, his ${y === 'A1' ? 'first' : y === 'A2' ? 'second' : y === 'A3' ? 'third' : 'fourth'} year of arbitration.` });
    }
  }
}

/** "4 y, $34.3M a year, $137.0M total (28-31)": the years, the yearly pay and the whole deal. */
function termsLine(x) {
  const p = x.pid && game.world.players.get(x.pid), ys = p?.contract?.years;
  if (!ys?.length || /minor league/.test(x.terms || '')) return x.terms ?? '';
  const total = ys.reduce((a, y) => a + (y.salary || 0), 0) + (p.contract.bonus || 0);
  const ages = (x.terms || '').match(/\([^)]*\)\s*$/)?.[0];
  return `${ys.length} y, ${money(total / ys.length)} a year, ${money(total)} total${ages ? ` ${ages}` : ''}`;
}

function digest() {
  const w = game.winter.week.sort((a, b) => b.v - a.v);
  if (!w.length) return;
  game.winter.week = [];
  const top = w.slice(0, 15), short = game.shortlist || new Set();
  const left = w.length - top.length;
  const open = marketPlayers().length;
  message({
    cat: 'league', quiet: true, title: `Free agency: the week's signings (${w.length})`,
    parts: [
      { p: `${w.length} ${w.length === 1 ? 'player' : 'players'} signed this week, the most valuable first. ${open} ${open === 1 ? 'is' : 'are'} still on the market.` },
      { head: ['Player', 'Signed with', 'Terms'], rows: top.map((x) => [x.pid ? { pid: x.pid, t: `${fullName(game.world.players.get(x.pid))}${short.has(x.pid) ? ' (your shortlist)' : ''}` } : x.line, x.city ?? '', termsLine(x)]) },
      ...(left > 0 ? [{ p: `And ${left} more, mostly depth and minor league deals.` }] : []),
    ],
  });
}

/** Everything that happens on one day of the winter. */
/** A player who has signed a new deal with you but is still outside the club (the deal was confirmed after he had gone to the market): bring him in. */
export function healStranded() {
  for (const p of game.world.list) {
    if (p.orgId || p.retired || p.contract?.status !== 'signed' || !/^(Re-signed|Signed)/.test(p.contract.text || '') || !game.freeAgents.includes(p.id)) continue;
    if (!p.contract.years?.some((y) => y.season >= game.year)) continue;
    signFreeAgent(p);
    message({ cat: 'club', player: p.id, title: `${fullName(p)} has joined the club`, body: `${fullName(p)} agreed a deal with you (${p.contract.text}) after he had left for the market. He has now been added to the club.` });
  }
}

export function winterDay(date) {
  healStranded();
  const d = winterDates();
  const rng = new Rng(`winter-day-${game.year}-${dayNo(date)}-${game.manager}`);
  const same = (a) => dayNo(a) === dayNo(date);
  if (same(d.open)) openMarket();
  if (game.winter.open) marketDay(date, rng);
  if (same(new Date(d.tender.getFullYear(), 10, 20))) protectionReminder();
  if (same(d.tender)) { protectionDay(); tenderDay(); }
  if (same(d.meetings[1])) rule5Draft();
  if (same(d.arbFile)) arbitrationFiled();
  if (same(d.hearings)) settleArbitration();
  if (date >= d.hearings && game.winter.open) minorDeals(rng);
  if (date.getDay() === 1 && game.winter.open) digest();
  tradeDay(date);
  intlDay(date);
  repliesDue(date);
  scoutTick(dayNo(date)); // scouts work through the winter: player looks, searches and the countries they cover
  jobsDay(date);
  ownerWatch(date); // the owner reads the payroll in the winter too, from the middle of November
}

/**
 * Play the winter forward. Stops at a message that needs you (unless auto), or at the date asked for.
 * At the end of the winter Spring Training opens.
 * @param {{until?:Date, onDay?:(d:Date)=>void, auto?:boolean, shouldStop?:()=>boolean, sleep?:(ms:number)=>Promise<void>}} [o]
 */
export async function continueWinter(o = {}) {
  const first = lastId();
  const end = winterDates().end;
  let quiet = 0;
  for (let guard = 0; guard < 400; guard++) {
    if (game.date > end) break;
    winterDay(game.date);
    o.onDay?.(game.date);
    game.date = addDays(game.date, 1);
    const stops = o.auto ? [] : since(first).filter((m) => m.stop);
    if (stops.length) return { stop: 'message', why: stops };
    if (o.until && game.date >= o.until) return { stop: 'date' };
    // running the club yourself, the winter goes almost a day at a time: Continue pauses whenever something
    // came in for you (a reply, an offer, a signing, a rival's move on your list) and otherwise every third day
    if (!o.auto && !autoClub() && game.settings.stops?.winterDays !== false) {
      const fresh = since(first).filter((m) => m.cat !== 'league' || m.player || m.trade);
      if (fresh.length || ++quiet >= 3) return { stop: 'date' };
    }
    if (o.sleep) await o.sleep();
    if (o.shouldStop?.()) return { stop: 'user' };
  }
  if (game.date > end) {
    finishWinter();
    return { stop: 'message', why: since(first).filter((m) => m.important).slice(-1) };
  }
  return { stop: 'date' };
}

/** Play the whole winter at once, as the old single step did. Used by tests and the simulations. */
export function runWinter() {
  const end = winterDates().end;
  while (game.date <= end) { winterDay(game.date); game.date = addDays(game.date, 1); }
  finishWinter();
}

// ---------- your signings ----------

/** Why you cannot sign him now, or null. */
export function cannotSign(p) {
  // before the opening day you get a head start: no rival club can bid yet, so talk to anyone and sign him if he agrees
  return noMoney();
}

/** The deal is done on the negotiation screen: he joins your club. */
export function signFreeAgent(p) {
  delete p.nearDeal;
  if (p.orgId === game.orgId) { reSign(p); return; }
  const o = game.world.orgs.get(game.orgId), st = orgState();
  const lvl = value(p) >= 47 ? 'MLB' : 'AAA';
  transfer(p, game.orgId, lvl, 'signed');
  markSigned(p);
  noteSigning(p, game.orgId);
  st.forty.add(p.id);
  const ok = lvl === 'MLB' && counts(o, st).active < limits().active && (!isPitcher(p) || counts(o, st).pitchers < limits().pitchers);
  if (ok) st.active.add(p.id);
  headline(`${fullName(p).toUpperCase()} SIGNS WITH ${o.club.city.toUpperCase()}`, true);
  { const y0 = p.contract?.years?.[0]; signingStory(p, game.orgId, { salary: y0?.salary ?? p.contract?.aav ?? 0, years: p.contract?.years?.length ?? 1 }, true); }
  record('sign', p, game.orgId, null, { terms: p.contract.text.split(': ')[1] });
  game.winter.week.push({ v: value(p), pid: p.id, city: o.club.city, terms: p.contract.text.split(': ')[1], line: `${fullName(p)} signs with ${o.club.city}: ${p.contract.text.split(': ')[1]}` });
  refreshStaff(o, st);
}

/** What the market looks like for a player you are talking to: how many clubs are after him. */
export function interestIn(p) {
  const n = bidders(p).length;
  return n === 0 ? 'No club has shown much interest.' : n === 1 ? 'One club is interested.' : n <= 3 ? `${n} clubs are interested.` : `Many clubs are after him (${n}).`;
}

/** Called when you open talks with a free agent a club wants: he gives you a deadline. */
export function setDeadline(p) {
  if (!game.freeAgents.includes(p.id) || !game.winter?.open) return null;
  const neg = ((game.negotiations ||= {})[p.id] ||= { rounds: 0, used: [] });
  if (neg.deadline == null && bidders(p).length) neg.deadline = dayNo(game.date) + 4;
  return neg.deadline != null ? fromDayNo(neg.deadline) : null;
}

