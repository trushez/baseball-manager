// The last look before a deal is made: the whole deal set out on one screen, and a second Confirm, so a single
// stray click never signs a player or completes a trade.
import { h } from './dom.js';
import { game } from '../state.js';
import { fullName, money } from '../data/world.js';
import { termsText, cashPerYear, startSeason } from '../season/contracts.js';
import { expected, budget } from '../season/finance.js';
import { pickLabel } from '../season/picks.js';
import { dealSummary, payrollEffect } from './deal-summary.js';

/** A large box with the deal in it. Resolves true on Confirm, false on Cancel, Escape or a click outside. */
function dealBox(title, lead, parts, ok) {
  return new Promise((resolve) => {
    const close = (v) => { box.remove(); document.removeEventListener('keydown', key); resolve(v); };
    const key = (e) => { if (e.key === 'Escape') close(false); };
    const okBtn = h('button', { class: 'cm-btn go big', onClick: () => close(true) }, ok);
    const box = h('div', { class: 'dlg-back', onClick: (e) => { if (e.target === box) close(false); } },
      h('div', { class: 'dlg deal-dlg', role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
        h('div', { class: 'cm-title' }, title),
        h('div', { class: 'dlg-body' }, h('p', { class: 'deal-lead' }, lead), parts),
        h('div', { class: 'dlg-btns' }, h('button', { class: 'cm-btn big', onClick: () => close(false) }, 'Cancel'), okBtn)));
    document.body.append(box);
    document.addEventListener('keydown', key);
    box.querySelector('.cm-btn')?.focus(); // Cancel first, so Enter on its own does not make the deal
  });
}

/** A signing: who he is, the terms in full, what he costs each year and what it does to the payroll. */
export function confirmSigning(p, t, ctx = {}) {
  // the same first season the contract itself will use
  const start = startSeason(!!ctx.extension && game.phase !== 'offseason' && game.phase !== 'spring');
  const cost = cashPerYear(t);
  const total = t.salary * t.years + (t.bonus || 0);
  const seasons = [start, start + 1, start + 2].filter((y) => y < start + t.years);
  const rows = seasons.map((y) => {
    // an extension or a new deal for your own player replaces what he was due that year
    const had = p.orgId === game.orgId ? (p.contract?.years?.find((x) => x.season === y)?.salary ?? 0) : 0;
    const now = expected(game.orgId, y), after = now - (typeof had === 'number' ? had : 0) + cost, cap = budget(game.orgId, y);
    return h('tr', {}, h('td', { class: 'l' }, String(y)), h('td', {}, money(now)), h('td', { class: after > cap ? 'cm-r' : 'y' }, money(after)), h('td', {}, money(cap)));
  });
  return dealBox(`Confirm: ${fullName(p)}`, `${ctx.extension ? 'Extend' : 'Sign'} ${fullName(p)} on these terms? Nothing is signed until you press Confirm.`, [
    dealSummary([p.id], null),
    h('table', { class: 'cm-tbl info deal-terms' }, h('tbody', {},
      h('tr', {}, h('td', { class: 'l cm-s' }, 'Terms'), h('td', { class: 'l y' }, termsText(t))),
      h('tr', {}, h('td', { class: 'l cm-s' }, 'Seasons'), h('td', { class: 'l' }, t.years === 1 ? String(start) : `${start} to ${start + t.years - 1}`)),
      h('tr', {}, h('td', { class: 'l cm-s' }, 'Total value'), h('td', { class: 'l' }, money(total))),
      h('tr', {}, h('td', { class: 'l cm-s' }, 'Cost to the club a year'), h('td', { class: 'l' }, money(cost))))),
    rows.length ? h('div', {}, h('div', { class: 'cm-h' }, 'Your payroll'),
      h('table', { class: 'cm-tbl info' }, h('thead', {}, h('tr', {}, ['', 'Now', 'With him', 'Budget'].map((x, i) => h('th', { class: i ? '' : 'l' }, x)))), h('tbody', {}, rows))) : null,
  ], 'Confirm the signing');
}

/** A trade: both sides player by player, the picks and money, and what it does to the payroll. */
export function confirmTrade(o) {
  const club = game.world.orgs.get(o.with)?.club;
  const name = club?.full ?? club?.name ?? 'them';
  const picks = (ks) => (ks || []).map((k) => pickLabel(k)).join(', ');
  const extra = [];
  if (o.givePicks?.length) extra.push(`You send ${picks(o.givePicks)}.`);
  if (o.getPicks?.length) extra.push(`You get ${picks(o.getPicks)}.`);
  if (o.cash) extra.push(o.cash > 0 ? `You pay ${name} ${money(o.cash)}.` : `${name} pay you ${money(-o.cash)}.`);
  if (o.ptbnl) extra.push(o.ptbnl.dir === 'give' ? `You owe a player to be named later, worth up to ${money(o.ptbnl.cap)}.` : `They owe you a player to be named later, worth up to ${money(o.ptbnl.cap)}.`);
  return dealBox(`Confirm the trade with ${name}`, 'This completes the trade. Nothing changes hands until you press Confirm.', [
    dealSummary(o.get || [], 'You get'),
    dealSummary(o.give || [], 'You send'),
    extra.length ? h('div', { class: 'cm-pad' }, extra.map((x) => h('p', {}, x))) : null,
    payrollEffect(o),
  ], 'Confirm the trade');
}

/** Another club's offer for your players, seen from your side, before it is accepted. */
export async function confirmOffer(id) {
  const { offerAsMine } = await import('../season/trade.js');
  const o = offerAsMine(id);
  return o ? confirmTrade(o) : true;
}

/** "We would do it if you added him": the summary of their terms, and on Confirm the trade is done. Returns true when it was. */
export async function acceptCounter(org, { quiet = false } = {}) {
  const { standingCounter, takeCounter } = await import('../season/replies.js');
  const { concludeTrade } = await import('../season/trade.js');
  const { toast } = await import('./dom.js');
  const c = standingCounter(org);
  if (!c) { toast('Their proposal has lapsed. Make them a new offer.'); return false; }
  if (!(await confirmTrade(c.offer))) return false;
  const r = takeCounter(org);
  if (r.error) { toast(r.error); return false; }
  if (r.waiting) { toast('Agreed. Trades are closed, so it completes when they open.'); return true; }
  const why = concludeTrade(r.offer);
  if (why) toast(why); else if (!quiet) toast('The trade is done.');
  return !why;
}

/** The players and picks their counter adds to your side, in words ("Ludwig Espinoza", "your 2028 second-round pick"). */
export function counterAdds(c, last) {
  const names = (c.give || []).filter((id) => !(last?.give || []).includes(id)).map((id) => fullName(game.world.players.get(id)));
  const picks = (c.givePicks || []).filter((k) => !(last?.givePicks || []).includes(k)).map((k) => `your ${pickLabel(k)}`);
  const all = [...names, ...picks];
  return all.length > 1 ? `${all.slice(0, -1).join(', ')} and ${all.at(-1)}` : all[0] || '';
}
