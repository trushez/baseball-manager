// Replies by post. An offer to an agent or a general manager is not answered on the spot: it is sent, and the
// answer arrives as a message a day or two later. Agreed deals stay open for a few days and then lapse.
import { pickLabel } from './picks.js';
import { fullName, money } from '../data/world.js';
import { game } from '../state.js';
import { dayNo, fromDayNo, dateWords } from './calendar.js';
import { message, deliverLater } from './inbox.js';
import './fanfare.js';
import './champions.js';
import { negotiate, termsText } from './contracts.js';
import { market, respond, askPrice, supersedeOffers, windowOpen } from './trade.js';
import { agentOf } from './agents.js';

const today = () => dayNo(game.date);
const hash = (s) => [...s].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 11);

/** Days an agent takes to answer: two, or one when another club is about to sign his client. */
export function contractDelay(p) {
  if (p.nearDeal && p.nearDeal.due - today() <= 2) return 1;
  return 1 + (hash(`${p.id}-${today()}`) % 3 === 0 ? 2 : 1);
}
/** Days a general manager takes: one, sometimes two. */
export const tradeDelay = (org) => 1 + (hash(`${org}-${today()}`) % 4 === 0 ? 1 : 0);

/** The negotiation record for a player, kept in the save so it survives leaving the screen. */
export const negFor = (p) => ((game.negotiations ||= {})[p.id] ||= { rounds: 0, used: [] });
/** Walk away from the talks with a player: the record goes, and the news about them says so. */
export function walkAway(p) {
  const neg = (game.negotiations || {})[p.id];
  if (!neg) return;
  delete game.negotiations[p.id];
  for (const m of game.inbox) if (m.neg === p.id && !m.closed) m.closed = `You walked away from the talks with ${fullName(p)}.`;
}
/** Close the news about talks with a club: you walked away, or the trade was done. */
export function closeTradeTalks(key, text) {
  if (game.market?.talks) delete game.market.talks[key];
  for (const m of game.inbox) if (m.trade === key && !m.closed) m.closed = text;
}
/**
 * The talks about one trade. A club's first deal is kept under its own code ("TB"); a separate deal with the same
 * club, made while the first is still open, under "TB#2", "TB#3" and so on. The news about a deal carries the same key.
 */
export const talksWith = (key) => ((market().talks ||= {})[key] ||= { log: [] });
/** The club a deal's key belongs to. */
export const orgOf = (key) => String(key || '').split('#')[0];
/** Talks that still need something: an offer out, a deal agreed, or their proposal standing. */
export const busyDeal = (key) => { const t = market().talks?.[key]; return !!t && (!!t.pending || !!t.agreed || !!standingCounter(key)); };
/** The keys of the deals open with a club, first deal first. */
export const dealsWith = (org) => Object.keys(market().talks || {}).filter((k) => orgOf(k) === org && (market().talks[k].log?.length || market().talks[k].pending || market().talks[k].agreed)).sort((a, b) => (Number(a.split('#')[1]) || 1) - (Number(b.split('#')[1]) || 1));
/** A key for a new deal with a club: the first one free of open business. */
export function freeDeal(org) {
  for (let i = 1; i < 20; i++) { const k = i === 1 ? org : `${org}#${i}`; if (!busyDeal(k)) return k; }
  return `${org}#${Date.now()}`;
}
/** "the second deal", for a title. */
export const dealName = (key) => { const n = Number(String(key).split('#')[1]) || 1; return n === 1 ? '' : `${['', '', 'second', 'third', 'fourth', 'fifth'][n] || `deal ${n}`} deal`; };

export function waitingText(due) { return `The reply is expected ${due - today() <= 1 ? 'tomorrow' : `on ${dateWords(fromDayNo(due))}`}.`; }

/** Send terms to an agent; the answer comes later. */
export function sendTerms(p, t, lines, ctx) {
  const neg = negFor(p);
  neg.ctx = ctx;
  const due = today() + contractDelay(p);
  neg.pending = { due, terms: { ...t }, lines: [...lines] };
  return due;
}

const WAIT = 1e9; // marks an agreement waiting for the trade window

/** Put an offer, or a question about a price, to a general manager. */
export function sendTrade(offer, ask = false) {
  if (!ask) supersedeOffers(offer.with);
  const key = offer.deal || offer.with;
  offer = { ...offer, deal: key };
  const talks = talksWith(key);
  const due = today() + tradeDelay(offer.with);
  talks.last = { give: offer.give.slice(), get: offer.get.slice(), givePicks: (offer.givePicks || []).slice(), getPicks: (offer.getPicks || []).slice(), cash: offer.cash || 0, ptbnl: offer.ptbnl ? { ...offer.ptbnl } : undefined };
  // the counter that stood when this offer went in: if the offer gives what it asked, the club keeps its word
  const was = talks.counter && talks.counter.until >= today() ? talks.counter
    : (() => { const c = [...(talks.log || [])].reverse().find((x) => x.status === 'counter' && x.counter); return c && c.at != null && c.at + 3 >= today() ? { offer: c.counter, until: c.at + 3 } : null; })();
  delete talks.counter;
  talks.pending = { counterWas: was ? { ...was.offer } : null, due, offer: { ...offer, give: offer.give.slice(), get: offer.get.slice(), givePicks: (offer.givePicks || []).slice(), getPicks: (offer.getPicks || []).slice() }, ask };
  return due;
}

/** Everything whose reply is due today or earlier. Called once a day, in the winter and in the season. */
export function repliesDue(date = game.date) {
  const d = dayNo(date);
  deliverLater(date);
  for (const [pid, neg] of Object.entries(game.negotiations || {})) {
    const p = game.world.players.get(pid);
    if (neg.pending && neg.pending.due <= d) contractReply(p, neg);
    if (neg.agreed && neg.agreedUntil != null && neg.agreedUntil < d) {
      neg.agreed = null; neg.agreedUntil = null;
      if (p) message({ cat: 'club', player: p.id, title: `${fullName(p)}: the agreement has lapsed`, body: `You did not complete the deal in time. ${agentOf(p).name} says his client has moved on, and you will have to talk again.`, neg: pid });
    }
  }
  const m = market();
  for (const [key, talks] of Object.entries(m.talks || {})) {
    const org = orgOf(key);
    if (talks.pending && talks.pending.due <= d) tradeReply(key, talks);
    if (talks.agreed && talks.agreed.until >= WAIT && windowOpen(date)) {
      talks.agreed.until = d + 3;
      message({ cat: 'club', important: true, title: `${game.world.clubs.get(org)?.city || org}: trades are open, confirm the deal`, body: 'The trade window has opened. The deal you agreed stands for three days: confirm it before the general manager changes his mind.', trade: key });
    }
    if (talks.agreed && talks.agreed.until < d) {
      talks.agreed = null;
      message({ cat: 'club', title: `${game.world.clubs.get(org)?.city || org}: the offer has lapsed`, body: 'You did not complete the trade in time and the general manager has gone cold.', trade: key });
    }
  }
}

function contractReply(p, neg) {
  const pend = neg.pending;
  delete neg.pending;
  const entry = neg.log?.find((x) => x.sentOn === pend.due) ?? neg.log?.at(-1);
  if (!p || (p.orgId && p.orgId !== game.orgId && !game.freeAgents.includes(p.id) && !neg.ctx?.extension)) {
    if (p) message({ cat: 'club', player: p.id, title: `${fullName(p)} has signed elsewhere`, body: `${agentOf(p).name} calls to say his client signed with ${game.world.clubs.get(p.orgId)?.city || 'another club'} before he could answer you.` });
    delete game.negotiations[p?.id];
    return;
  }
  let r = negotiate(p, game.orgId, pend.terms, { lines: pend.lines, extension: !!neg.ctx?.extension });
  // another club has a better offer on the table: the agent will not take less than it unless you have given his client a reason to
  const rv = neg.rival && neg.rival.until >= today() ? neg.rival : null;
  if (rv) {
    const c = game.world.orgs.get(rv.oid)?.club.city ?? 'the other club';
    const theirs = rv.salary * rv.years, ours = pend.terms.salary * pend.terms.years + (pend.terms.bonus || 0);
    const persuaded = (pend.lines || []).length > 0;
    const short = ours < theirs * (persuaded ? 0.95 : 1);
    if (short && r.status === 'accept') {
      const match = { ...pend.terms, years: Math.max(pend.terms.years, rv.years), salary: Math.ceil(Math.max(pend.terms.salary, theirs / Math.max(pend.terms.years, rv.years)) / 1e5) * 1e5 };
      r = { status: 'counter', terms: match, text: `${agentOf(p).name}: "We would like to come to you, but ${c} are offering more: about ${money(rv.salary)} a year over ${rv.years} ${rv.years === 1 ? 'year' : 'years'}. Match that and he is yours${persuaded ? '. What you said has helped, but not by that much' : ', or give him a better reason than money to choose you'}."` };
    } else if (!short && r.status !== 'accept' && r.status !== 'wait' && pend.terms.salary >= rv.salary * 0.9) {
      // you have matched or beaten the other club, which is what he was told to hold out for
      r = { status: 'accept', text: `${agentOf(p).name}: "That is as good as what ${c} put on the table, and he would rather come to you. We have a deal."` };
    } else if (short && r.status !== 'accept') {
      r = { ...r, text: `${r.text} ${agentOf(p).name} adds: "Remember ${c} are offering about ${money(rv.salary)} a year over ${rv.years} ${rv.years === 1 ? 'year' : 'years'}. You need at least to match that, or convince him to come to you."` };
    }
  }
  if (entry) Object.assign(entry, r, { sent: false });
  else (neg.log ||= []).push({ ...r, you: termsText(pend.terms) });
  if (r.status === 'accept') { neg.agreed = { ...pend.terms }; neg.agreedUntil = today() + 4; }
  // another club is waiting on his answer: a reply that is not an agreement gives you two more days to come back, not none
  let more = '';
  if (neg.rival && r.status !== 'accept' && neg.rival.until < today() + 2) {
    neg.rival.until = today() + 2; neg.deadline = neg.rival.until;
    more = `\n\nThe other offer is still on the table, but his agent will hold it until ${dateWords(fromDayNo(neg.rival.until))}.`;
  }
  const words = { accept: 'agreed', counter: 'a counter offer', refuse: 'turned down', wait: 'he will not talk yet' }[r.status];
  message({
    cat: 'club', important: true, stop: true, player: p.id, neg: p.id,
    title: `${fullName(p)}: ${words}`,
    body: `${r.text}\n\nYou offered ${termsText(pend.terms)}.${r.status === 'accept' ? '\n\nThe agreement stands for four days. Open the talks to complete the signing.' : r.status === 'counter' ? '\n\nHe is waiting for your answer.' : ''}${more}`,
  });
}

/** An offer in a sentence: who you send and who you get. */
function dealWords(o) {
  const names = (ids, picks = []) => ([...ids.map((id) => fullName(game.world.players.get(id))), ...picks.map((k) => pickLabel(k))].join(', ') || 'nobody');
  return `you send ${names(o.give, o.givePicks)}${o.cash ? (o.cash > 0 ? ` and $${(o.cash / 1e6).toFixed(1)}M in cash` : `, they send $${(-o.cash / 1e6).toFixed(1)}M in cash`) : ''}; you get ${names(o.get, o.getPicks)}.`;
}

function tradeReply(key, talks) {
  const org = orgOf(key);
  const pend = talks.pending;
  delete talks.pending;
  let r = pend.ask ? askPrice(org, pend.offer.get) : respond(pend.offer);
  // "we would do it if you added him": an offer that gives everything they asked for is accepted, not met with a new demand
  if (!pend.ask && r.status !== 'accept' && r.status !== 'blocked' && meetsCounter(pend.offer, pend.counterWas)) {
    const c = game.world.clubs.get(org);
    r = { status: 'accept', text: `${c?.city ?? org}${/s$/.test(c?.city ?? '') ? "'" : "'s"} general manager: "That is what we asked for. You have a deal."` };
  }
  const entry = talks.log.find((x) => x.sentOn === pend.due) ?? talks.log.at(-1);
  if (entry) Object.assign(entry, r, { sent: false, at: today() });
  else talks.log.push({ ...r, you: '', at: today() });
  if (r.status === 'accept') talks.agreed = { offer: pend.offer, until: windowOpen() ? today() + 3 : WAIT }; // with trades closed the deal stands until the window opens
  // "we would do it if you added him": their word stands for three days, and taking it completes the trade
  if (r.status === 'counter' && r.counter && !pend.ask) talks.counter = { offer: { ...r.counter, with: org, deal: key }, until: today() + 3 };
  else delete talks.counter;
  const city = game.world.clubs.get(org)?.city || org;
  message({
    cat: 'club', important: true, stop: game.settings.stops.replies !== false, trade: key,
    title: `${city}${dealName(key) ? ` (${dealName(key)})` : ''}: ${{ accept: 'they agree to the trade', counter: 'a counter proposal', refuse: 'they turn it down', wait: 'they are not talking', blocked: 'the trade cannot be done' }[r.status]}`,
    body: `${pend.ask ? 'You asked what it would take to get ' + pend.offer.get.map((id) => fullName(game.world.players.get(id))).join(', ') + '.' : 'You offered: ' + dealWords(pend.offer)}\n\n${r.text}${r.status === 'accept' ? (windowOpen() ? '\n\nThe deal stands for three days. Open the talks to complete it.' : `\n\nTrades are closed, so nothing can be completed yet. The deal stands, and you will have three days to confirm it once trades open.`) : talks.counter ? '\n\nTheir word stands for three days: accept their terms here or in the talks and the trade is done.' : ''}`,
  });
}

/** Their counter proposal, while it stands: { offer, until } or null. */
export function standingCounter(key) {
  const t = market().talks?.[key];
  if (!t || t.pending || t.agreed) return null;
  // a save made before counters were kept: the last reply in the talks, if it was a counter in the last three days
  const last = t.log?.at(-1);
  const c = t.counter || (last?.status === 'counter' && last.counter && last.at != null ? { offer: { ...last.counter, with: orgOf(key), deal: key }, until: last.at + 3 } : null);
  return c && c.until >= today() ? c : null;
}

/** Take their counter proposal. With trades open it is done at once (the caller confirms first); with them closed it stands as an agreement until they open. */
export function takeCounter(key) {
  const c = standingCounter(key), tk = talksWith(key);
  if (!c) return { error: 'Their proposal has lapsed. Make them a new offer.' };
  delete tk.counter;
  if (!windowOpen()) { tk.agreed = { offer: c.offer, until: WAIT }; return { waiting: true }; }
  tk.agreed = { offer: c.offer, until: today() + 3 };
  return { offer: c.offer };
}

/** Does an offer give at least what a counter proposal asked for, and ask for no more in return? */
export function meetsCounter(o, c) {
  if (!o || !c) return false;
  const has = (a, b) => (b || []).every((x) => (a || []).includes(x));
  return has(o.give, c.give) && has(o.givePicks, c.givePicks)
    && has(c.get, o.get) && has(c.getPicks, o.getPicks)
    && (o.cash || 0) >= (c.cash || 0)
    && JSON.stringify(o.ptbnl || null) === JSON.stringify(c.ptbnl || null);
}
