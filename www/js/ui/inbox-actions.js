// Things you can do straight from a message, without going to the screen that normally does them:
// answer a trade offer, put terms to a player's agent, and make the roster moves a message is about.
import { h, toast } from './dom.js';
import { nav } from './nav.js';
import { game, org, orgState } from '../state.js';
import { fullName } from '../data/world.js';
import { moveLabel, plan, preview } from '../season/advice.js';
import { doSteps } from './plan-panel.js';
import { rosterAction } from './roster-action.js';
import { acceptCounter, counterAdds } from './confirm-deal.js';
import { market, acceptOffer, declineOffer, concludeTrade } from '../season/trade.js';
import { sendTerms, negFor, waitingText, talksWith, walkAway, standingCounter, orgOf } from '../season/replies.js';
import { askWithRival, maxSalary, termsText, noMoney } from '../season/contracts.js';
import { cannotSign } from '../season/winter.js';
import { talkTo, fine } from '../season/flavour.js';
import { dayNo, dateWords, fromDayNo } from '../season/calendar.js';
import { retire } from '../season/intake.js';
import { ilDaysLeft } from '../season/roster.js';

const btn = (label, onClick, cls = 'cm-btn') => h('button', { class: cls, onClick }, label);

/** The action buttons for a message. `again` redraws the message afterwards. */
export function inboxActions(m, p, again) {
  const out = [];
  // a trade offer from another club
  if (m.offer) {
    const o = market().offers.find((x) => x.id === m.offer);
    if (o?.status === 'open') {
      out.push(btn('Accept the offer', async () => { const { confirmOffer } = await import('./confirm-deal.js'); if (!(await confirmOffer(o.id))) return; const e = acceptOffer(o.id); if (e) toast(e); again(); }, 'cm-btn go'));
      out.push(btn('Reject the offer', () => { declineOffer(o.id); again(); }));
    } else if (o) out.push(h('span', { class: 'cm-s' }, `This offer was ${o.status}.`));
  }
  // a club wants you as its manager
  if (m.jobOffer) {
    const live = game.jobs?.offers?.some((x) => x.org === m.jobOffer);
    if (live) out.push(btn('Look at the offer', async () => { const { jobsScreen } = await import('./jobs-screen.js'); nav.push(jobsScreen()); }, 'cm-btn go'));
    else out.push(h('span', { class: 'cm-s' }, 'This offer is no longer open.'));
  }
  // the assistant proposes who to release when Single-A is over its size
  if (m.release) {
    const live = m.release.map((id) => game.world.players.get(id)).filter((q) => q && !q.retired && q.orgId === game.orgId);
    if (m.closed) out.push(h('span', { class: 'cm-s' }, m.closed));
    else if (live.length) {
      out.push(btn(`Release ${live.length === 1 ? 'him' : `all ${live.length}`}`, () => { for (const q of live) retire(q); m.closed = `You released ${live.length === 1 ? 'him' : `all ${live.length}`}.`; toast(m.closed); again(); }, 'cm-btn go'));
      out.push(btn('Keep them for now', () => { m.closed = 'You kept them for now.'; again(); }));
    } else out.push(h('span', { class: 'cm-s' }, 'Nobody on this list is still with the club.'));
  }
  // a player the coaches say is not working
  if (m.disc) {
    const q = game.world.players.get(m.disc);
    if (q?.disc?.state) out.push(h('span', { class: 'cm-s' }, q.disc.text));
    else if (q && q.orgId === game.orgId) {
      out.push(btn('Have a word with him', () => { toast(talkTo(q)); again(); }, 'cm-btn go'));
      out.push(btn('Fine him a week\'s wages', () => { toast(fine(q)); again(); }));
    }
  }
  // a player whose contract is on his mind: the talks, straight from the message
  if (m.contractTalk && p && p.orgId === game.orgId && p.contract?.status && !['minor league', 'free agent'].includes(p.contract.status)) {
    out.push(btn('Negotiate a new contract', async () => { nav.push((await import('./negotiate-screen.js')).negotiateScreen(p, { extension: true })); }, 'cm-btn go'));
  }
  // news about one of your injured players: straight to the injured list
  if (m.cat === 'injury' && p && p.orgId === game.orgId) {
    if (p.injury && (orgState().active.has(p.id) || orgState().il.has(p.id) || orgState().forty.has(p.id))) out.push(btn('Injury Centre', async () => { nav.push((await import('./cover-screen.js')).coverScreen(p)); }, 'cm-btn go'));
    // fit again and off the list's minimum stay: bringing him back is the Injury Centre's job, who goes down included
    if (!p.injury && orgState().il.has(p.id) && ilDaysLeft(orgState(), p) === 0) out.push(btn('Injury Centre', async () => { nav.push((await import('./cover-screen.js')).coverScreen(p)); }, 'cm-btn go'));
  }
  // roster moves for the player the message is about
  // (an injury mail has only View player and the Injury Centre: the moves are made there)
  if (p && p.orgId === game.orgId && !(m.neg && m.closed) && m.cat !== 'injury') {
    const o = org(), st = orgState();
    const done = new Set();
    // the whole plan is worked out at once, so a replacement can be called up before the injured player has been moved: the button makes the earlier moves first
    const steps = plan(o, st);
    steps.forEach((s, i) => {
      if (s.p.id !== p.id || (s.a.type === 'il' && !m.advice) || (s.a.type === 'activate' && orgState().il.has(p.id))) return;
      done.add(s.a.type + (s.a.to || '') + (s.a.kind || ''));
      out.push(btn(i ? `${moveLabel(p, s.a)} (moves 1 to ${i + 1})` : moveLabel(p, s.a), async () => { if (await doSteps(o, st, steps, i + 1)) again(); }, s.must ? 'cm-btn go' : 'cm-btn'));
    });
    const up = { type: 'move', to: 'MLB' }, down = { type: 'move', to: 'AAA' };
    const inMajors = st.active.has(p.id), onForty = st.forty.has(p.id);
    if (!inMajors && !st.il.has(p.id) && !done.has('moveMLB') && !preview(o, st, p, up).error) out.push(btn(moveLabel(p, up), async () => { if (await rosterAction(o, st, p, up)) again(); }));
    if (inMajors && onForty && (m.advice || m.cat === 'injury') && !done.has('moveAAA') && !preview(o, st, p, down).error) out.push(btn(moveLabel(p, down), async () => { if (await rosterAction(o, st, p, down)) again(); }));
  }
  // put terms to a free agent's agent, or to your own player's
  const np = m.neg ? game.world.players.get(m.neg) : p && game.winter?.on && game.freeAgents.includes(p.id) ? p : null;
  if (np && m.closed) { if (!m.neg) out.push(h('span', { class: 'cm-s' }, m.closed)); }
  else if (np && !(np.orgId !== game.orgId && cannotSign(np))) {
    const own = np.orgId === game.orgId;
    const neg = negFor(np);
    const walk = () => out.push(btn('Walk away', () => { walkAway(np); again(); }));
    const rivalOpen = !!neg.rival && neg.rival.until >= dayNo(game.date);
    // the message is a snapshot; this line says where the talks stand now
    const latest = neg.log?.[neg.log.length - 1];
    // only an offer made after the message arrived: an entry the other side has already answered is what the message itself reports
    if (latest?.sent) out.push(h('div', { class: 'cm-s', style: { width: '100%' } }, `Since this arrived: you offered ${latest.you}. ${latest.sent ? latest.text : latest.status === 'counter' && latest.terms ? `He countered with ${termsText(latest.terms)}.` : latest.status === 'accept' ? 'He agreed.' : latest.status === 'refuse' ? 'He turned it down.' : ''}`.trim()));
    if (neg.pending) out.push(h('span', { class: 'cm-s' }, `Your new terms are with his agent. ${waitingText(neg.pending.due)}${rivalOpen ? ' His other offer stands until ' + dateWords(fromDayNo(neg.rival.until)) + '.' : ''}`));
    else if (neg.agreed) {
      const ctx = neg.ctx || { extension: false, how: own ? 'Re-signed' : 'Signed as a free agent', kind: own ? 'resign' : 'free' };
      out.push(btn('Confirm deal', async () => {
        const { confirmSigning } = await import('./confirm-deal.js');
        if (!(await confirmSigning(np, neg.agreed, ctx))) return;
        (await import('./negotiate-screen.js')).concludeSigning(np, neg.agreed, ctx); again();
      }, 'cm-btn go'));
    }
    else {
      const last = neg.log?.[neg.log.length - 1];
      const countered = last?.status === 'counter' && last.terms;
      const t = countered ? { ...last.terms } : askWithRival(np, neg.log);
      out.push(btn(`Offer ${countered ? 'his counter terms' : 'his asking terms'} (${termsText(t)})`, () => {
        if (noMoney() || maxSalary(game.orgId, np, t) < t.salary) { toast('The owner\'s budget does not stretch to that. Open the talks to find terms.'); return; }
        const ctx = neg.ctx || { extension: false, how: own ? 'Re-signed' : 'Signed as a free agent', kind: own ? 'resign' : 'free' };
        const due = sendTerms(np, t, [], ctx);
        (neg.log ||= []).push({ you: termsText(t), status: 'sent', sent: true, sentOn: due, text: `Sent to his agent. ${waitingText(due)}` });
        toast(`Terms sent for ${fullName(np)}.`);
        again();
      }, 'cm-btn go'));
    }
    if (neg.pending || neg.agreed || neg.log?.length) walk();
  }
  // a counter proposal that still stands: add what they asked for and the trade is done
  const sc = m.trade && !m.closed ? standingCounter(m.trade) : null;
  if (sc) {
    const adds = counterAdds(sc.offer, talksWith(m.trade).last);
    out.push(btn(adds ? `Add ${adds} and complete the trade` : 'Accept their terms and complete the trade', async () => { if (await acceptCounter(m.trade, { quiet: true })) { m.closed = m.closed || 'You accepted their terms.'; } again(); }, 'cm-btn go'));
  }
  // a trade the other club has agreed to
  const tw = m.trade && !m.closed && talksWith(m.trade);
  if (tw?.agreed) {
    out.push(btn('Confirm trade', async () => {
      const { confirmTrade } = await import('./confirm-deal.js');
      const deal = { with: orgOf(m.trade), ...(tw.agreed.offer || tw.agreed), deal: m.trade };
      if (!(await confirmTrade(deal))) return;
      const why = concludeTrade(deal);
      toast(why || 'The trade is done.');
      again();
    }, 'cm-btn go'));
  }
  return out;
}
