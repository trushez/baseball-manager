// Negotiating a contract: your terms on one side, the agent's reply on the other, and what it does to the
// payroll underneath. Used for re-signing your free agents, extensions and, later, signings and trades.
import { dealVoices } from '../season/media.js';
import { announceBlockbuster } from '../season/fanfare.js';
import { h, fill, toast, holdable } from './dom.js';
import { nav } from './nav.js';
import { clubMenu } from './menu.js';
import { clubTitle, plink, select } from './club-ui.js';
import { money, fullName, mainPos, salaryIn } from '../data/world.js';
import { game, userClub } from '../state.js';
import { askTerms, askWithRival, negotiate, conclude, impact, termsText, totalOf, aavOf, aavWorth, deferOf, deferTotal, cashPerYear, DEFER_SHARES, DEFER_YEARS, LINES, STEP, extOf, maxSalary, maxYears } from '../season/contracts.js';
import { agentOf, relWords, topWants } from '../season/agents.js';
import { message } from '../season/inbox.js';
import { taxFor, cbtLine, budget, expected } from '../season/finance.js';
import { lastLine } from './deal-summary.js';
import { askingSalary, LEAGUE_MIN } from '../season/value.js';
import { setDeadline, interestIn, reSign, signFreeAgent } from '../season/winter.js';
import { negFor, sendTerms, waitingText, walkAway } from '../season/replies.js';
import { dateWords, dayNo, fromDayNo } from '../season/calendar.js';

const pm = (v) => money(v, { short: false });

/**
 * @param {object} p the player
 * @param {{extension?:boolean, onDone?:Function, how?:string}} opts
 */
const LVN = { MLB: 'Majors', AAA: 'AAA', AA: 'AA', 'A+': 'High-A', A: 'A', R: 'Rookie' };

/** Sign the agreed terms: the contract, the announcement and the news item. Shared by the screen and the news button. */
export function concludeSigning(p, agreed, ctx = {}, onDone = null) {
  const extension = !!ctx.extension, agent = agentOf(p);
  const text = conclude(p, game.orgId, agreed, { extension, how: ctx.how || (extension ? 'Extended' : 'Re-signed') });
  message({ cat: 'club', player: p.id, title: `${fullName(p)}: ${text}`, body: `${fullName(p)} has signed: ${termsText(agreed)}.\n\nAgent: ${agent.name}.`,
    voices: dealVoices(game.orgId, p, { salary: agreed.salary, years: agreed.years }) });
  toast(`${fullName(p)} has signed.`);
  if (onDone) onDone(p);
  else if (ctx.kind === 'resign' && p.orgId) reSign(p);
  else if (ctx.kind === 'free' || (ctx.kind === 'resign' && !p.orgId) || (!extension && !p.orgId)) { signFreeAgent(p); announceBlockbuster(game.orgId, p, { salary: agreed.salary, years: agreed.years }); }
  delete game.negotiations[p.id];
  for (const m of game.inbox) if (m.neg === p.id && !m.closed) m.closed = `${fullName(p)} signed: ${termsText(agreed)}.`;
}

export function negotiateScreen(p, opts = {}) {
  const orgId = game.orgId;
  const neg = negFor(p);
  if (opts.extension !== undefined || opts.how || opts.kind) neg.ctx = { extension: !!opts.extension, how: opts.how, kind: opts.kind };
  const ctx = neg.ctx || {};
  const extension = !!ctx.extension;
  const agent = agentOf(p);
  let t = neg.draft ? { ...neg.draft } : askWithRival(p, neg.log);
  // a player on a deal already starts his extension from what he earns
  if (extension) { t.salary = Math.max(t.salary, 0); }
  const log = (neg.log ||= []); // the rounds so far, kept with the negotiation
  let agreed = neg.agreed || null;
  const usedNow = () => new Set([...(neg.used || []), ...(neg.pending?.lines || [])]);
  // when another club has made an offer, the agent takes a new one from you in place of the one still waiting
  const rivalOpen = () => !!neg.rival && neg.rival.until >= dayNo(game.date);
  const picked = new Set();
  const body = h('div', { class: 'cm-panel grow' });
  const marketLine = () => {
    if (!game.winter?.on || !game.freeAgents.includes(p.id)) return null;
    const dl = setDeadline(p);
    return h('p', { class: 'cm-s cm-pad' }, `${interestIn(p)}${dl ? ` His agent wants an answer by ${dateWords(dl)}, and will take the best offer after that.` : ''}`);
  };

  /** Another club's offer, in the agent's words, set against your terms: match it, or give him a reason to choose you. */
  const rivalBox = () => {
    if (!rivalOpen()) return null;
    const rv = neg.rival, club = game.world.orgs.get(rv.oid)?.club;
    const name = club?.city ?? 'Another club';
    const theirs = rv.salary * rv.years, ours = t.salary * t.years + (t.bonus || 0);
    const gap = Math.round((theirs - ours) / Math.max(1, t.years) / 1e5) * 1e5;
    const where = ours >= theirs ? h('div', { class: 'cm-g' }, `Your terms are worth as much as theirs, or more: ${pm(ours)} against ${pm(theirs)}.`)
      : h('div', { class: 'cm-r' }, `Your terms are ${pm(theirs - ours)} short of theirs in all (about ${pm(gap)} a year). Match them, or win him over with what you say to him below.`);
    const match = h('button', { class: 'cm-btn go', onClick: () => { t = { ...t, years: rv.years, salary: Math.min(cap(), Math.ceil(rv.salary / 1e5) * 1e5) }; if (t.optOut >= t.years) t.optOut = 0; neg.draft = { ...t }; render(); } }, `Match their offer: ${rv.years} ${rv.years === 1 ? 'year' : 'years'} at ${pm(Math.ceil(rv.salary / 1e5) * 1e5)}`);
    return h('div', { class: 'neg-rival' },
      h('div', { class: 'neg-rival-h' }, `${name} have made an offer`),
      h('p', {}, `${agent.name}: "${name} are offering ${fullName(p)} about ${pm(rv.salary)} a year over ${rv.years} ${rv.years === 1 ? 'year' : 'years'}. If you want him, you need at least to match that, or give him a reason to come to you rather than go to them. I will hold them off until ${dateWords(fromDayNo(rv.until))}. After that he signs with them."`),
      where, h('div', { class: 'btnrow' }, match));
  };

  const cap = () => Math.max(LEAGUE_MIN, maxSalary(orgId, p, t, { extension }));
  const set = (k, v) => { t = { ...t, [k]: v }; if (k === 'years' && t.optOut >= t.years) t.optOut = 0; t.salary = Math.min(t.salary, cap()); neg.draft = { ...t }; render(); };

  function stepper(label, key, step, lo, hi, show) {
    return h('div', { class: 'neg-row' }, h('span', { class: 'k' }, label),
      h('span', { class: 'v' },
        // at the end of its range a button is greyed out, so a press that cannot change anything does not look broken
        h('button', { class: 'cm-btn', disabled: t[key] <= lo, ...holdable(() => set(key, Math.max(lo, t[key] - step))) }, '−'),
        h('b', { class: 'y' }, show(t[key])),
        h('button', { class: 'cm-btn', disabled: t[key] >= hi, ...holdable(() => set(key, Math.min(hi, t[key] + step))) }, '+')));
  }
  const pick = (label, key, options) => h('div', { class: 'neg-row' }, h('span', { class: 'k' }, label), h('span', { class: 'v' }, select(options, t[key], (v) => set(key, isNaN(Number(v)) ? v : Number(v)))));

  function render() {
    if (t.salary > cap()) t.salary = cap();
    const im = impact(orgId, p, t, { extension });
    const tax = taxFor(orgId, im.year, im.after);
    const controls = h('div', { class: 'neg-grid' },
      stepper('Years', 'years', 1, 1, maxYears(p), (v) => String(v)),
      stepper('Salary a year', 'salary', STEP, 780000, cap(), (v) => pm(v)),
      stepper('Signing bonus', 'bonus', 1e6, 0, 40e6, (v) => (v ? pm(v) : 'None')),
      pick('Deferred pay', 'defer', DEFER_SHARES.map((d) => [d, d ? `${Math.round(d * 100)}% of salary` : 'None'])),
      pick('Option year', 'option', [['none', 'None'], ['club', 'Club option'], ['player', 'Player option'], ['mutual', 'Mutual option']]),
      pick('Opt-out', 'optOut', [[0, 'None'], ...Array.from({ length: Math.max(0, t.years - 1) }, (_, i) => [i + 1, `After year ${i + 1}`])]),
      pick('No-trade clause', 'notrade', [['none', 'None'], ['partial', 'Partial'], ['full', 'Full']]));

    const lines = h('div', { class: 'neg-lines' }, Object.entries(LINES).map(([k, L]) => h('button', {
      class: `cm-btn${picked.has(k) ? ' go' : ''}`, disabled: usedNow().has(k), title: usedNow().has(k) ? 'Already said' : '',
      onClick: () => { if (picked.has(k)) picked.delete(k); else picked.add(k); render(); },
    }, L.label)));

    // the cost year by year over the length of the deal
    const replace = extension && p.orgId === orgId && typeof salaryIn(p, im.year) === 'number' ? salaryIn(p, im.year) : 0;
    const perYear = cashPerYear(t), put = deferOf(t);
    const years = Array.from({ length: t.years }, (_, i) => {
      const y = im.year + i, bud = budget(orgId, y), after = expected(orgId, y) - (i === 0 ? replace : 0) + perYear;
      return h('tr', {}, h('td', { class: 'l' }, String(y)), h('td', {}, pm(perYear)), h('td', { class: 'cm-s' }, put ? `+${pm(put)} put off` : ''), h('td', { class: after > bud ? 'cm-r' : 'y' }, pm(after)), h('td', {}, pm(bud)));
    });
    // the instalments that come due after the deal ends
    const later = im.pays.map((x) => {
      const bud = budget(orgId, x.season), after = expected(orgId, x.season) + x.amount;
      return h('tr', { class: 'cm-s' }, h('td', { class: 'l' }, String(x.season)), h('td', {}, pm(x.amount)), h('td', {}, 'deferred pay due'), h('td', { class: after > bud ? 'cm-r' : '' }, pm(after)), h('td', {}, pm(bud)));
    });
    const costs = h('table', { class: 'cm-tbl info' },
      h('thead', {}, h('tr', {}, ['Year', 'He costs', '', 'Payroll after', 'Budget'].map((c, i) => h('th', { class: i ? '' : 'l' }, c)))),
      h('tbody', {}, years, later,
        h('tr', {}, h('td', { class: 'l cm-s' }, 'Guaranteed'), h('td', { colspan: 4, class: 'l y' }, `${pm(totalOf(t))} over ${t.years} ${t.years === 1 ? 'year' : 'years'}`)),
        put ? h('tr', {}, h('td', { class: 'l cm-s' }, 'Deferred'), h('td', { colspan: 4, class: 'l y' }, `${pm(deferTotal(t))} of it is paid ${im.pays[0].season} to ${im.pays.at(-1).season}, about ${pm(im.pays[0].amount)} a year. You pay ${pm(perYear)} a year now instead of ${pm(perYear + put)}. He values the deal at ${pm(aavWorth(t))} a year, not ${pm(aavOf(t))}, because the money comes late.`)) : null,
        h('tr', {}, h('td', { class: 'l cm-s' }, 'Luxury tax'), h('td', { colspan: 4, class: 'l y' }, cbtLine(orgId, im.year, im.after, tax)))));

    const last = log.at(-1);
    const say = last ? h('div', { class: `neg-say ${last.status}` }, h('div', { class: 'cm-s' }, `You: ${last.you}`), h('div', {}, last.text),
      last.status === 'counter' ? h('button', { class: 'cm-btn', onClick: () => { t = { ...last.terms }; neg.draft = { ...t }; render(); } }, `Use his terms: ${termsText(last.terms)}`) : null)
      : h('p', { class: 'cm-s cm-pad' }, 'Set your terms, then make an offer.');

    fill(body,
      h('div', { class: 'cm-h' }, `${fullName(p)}`),
      h('p', { class: 'cm-s cm-pad' }, `${mainPos(p)}, age ${p.age}, ${LVN[p.level] || p.level || ''}. ${lastLine(p)}. Agent ${agent.name} (${relWords(agent)}); he would ask about ${pm(askingSalary(p))} a year.`),
      marketLine(),
      rivalBox(),
      h('div', { class: 'neg-two' },
        h('div', {}, h('div', { class: 'cm-h' }, 'Your offer'), controls, h('div', { class: 'cm-s cm-pad' }, `The most you can offer a year is ${pm(cap())}.`)),
        h('div', {}, h('div', { class: 'cm-h' }, 'What it does to the payroll'), costs, say)),
      lines,
      h('div', { class: 'cm-pad btnrow' },
        agreed ? h('button', { class: 'cm-btn go big', onClick: done }, `Confirm deal: ${termsText(agreed)}`) : neg.pending && !rivalOpen() ? h('button', { class: 'cm-btn big', disabled: true }, `Waiting for his reply (${waitingText(neg.pending.due).replace('The reply is expected ', '').replace('.', '')})`) : h('button', { class: 'cm-btn go big', onClick: offer }, neg.pending ? 'Replace my offer with this one' : 'Make the offer'),
        h('button', { class: 'cm-btn', onClick: () => { if (neg.pending || neg.agreed || log.length) { walkAway(p); toast(`You have walked away from ${fullName(p)}.`); } nav.back(); } }, 'Walk away')));
  }

  function offer() {
    if (neg.pending && !rivalOpen()) { toast('You are waiting for his reply.'); return; }
    const chosen = [...picked];
    const due = sendTerms(p, t, chosen, { extension, how: ctx.how, kind: ctx.kind });
    picked.clear();
    log.push({ you: `${termsText(t)}${chosen.length ? ` (${chosen.map((k) => LINES[k].label.toLowerCase()).join('; ')})` : ''}`, status: 'sent', sent: true, sentOn: due, text: `Sent to ${agent.name}. ${waitingText(due)}` });
    neg.agreed = null; agreed = null;
    // the terms are with the agent and there is nothing more to do here: back to where you came from, with a note of what was sent
    toast(`Terms sent to ${agent.name} for ${fullName(p)}. ${waitingText(due)}`);
    nav.leave();
  }

  async function done() {
    const { confirmSigning } = await import('./confirm-deal.js');
    if (!(await confirmSigning(p, agreed, { ...ctx, extension }))) return;
    concludeSigning(p, agreed, { ...ctx, extension }, opts.onDone); nav.back();
  }

  render();
  return { el: h('div', { style: { display: 'contents' } }, clubTitle(userClub(), `Contract: ${fullName(p)}`), body), side: () => clubMenu(null) };
}
