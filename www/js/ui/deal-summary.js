// A compact review of the players in a trade: who, where, how they have done lately, what they cost and what he is worth.
import { h } from './dom.js';
import { plink, clink } from './club-ui.js';
import { keyAttrs } from './attr-ui.js';
import { game } from '../state.js';
import { lastSeason, isPitcher, mainPos, money } from '../data/world.js';
import { worthText, salaryFor, impact } from '../season/trade.js';
import { cbtLine, taxFor } from '../season/finance.js';
import { moodWords } from '../season/moods.js';

const r3 = (v) => (v == null ? '-' : v.toFixed(3).replace(/^0/, ''));
const LV = { MLB: 'Majors', AAA: 'AAA', AA: 'AA', 'A+': 'High-A', A: 'A', R: 'Rookie' };

/** One line on how he did in his latest season. */
export function lastLine(p) {
  const s = lastSeason(p);
  if (!s) return 'No record yet';
  if (isPitcher(p)) return `${s.season}: ${Math.round(s.ip)} IP, ${s.era?.toFixed(2) ?? '-'} ERA, ${s.so} K, ${s.bb} BB${s.sv ? `, ${s.sv} SV` : ''}`;
  return `${s.season}: ${r3(s.avg)} / ${r3(s.ops)} OPS, ${s.hr} HR in ${s.pa} PA`;
}

/** A table for one side of a deal. `ids` are player ids. */
export function dealSummary(ids, title) {
  const ps = ids.map((id) => game.world.players.get(id)).filter(Boolean);
  if (!ps.length) return null;
  return h('div', {},
    title ? h('div', { class: 'cm-h' }, title) : null,
    h('div', { class: 'cm-tblwrap' }, h('table', { class: 'cm-tbl' },
      h('thead', {}, h('tr', {}, ['Player', 'Club', 'Pos', 'Age', 'Level', 'Latest season', 'Pay', 'Contract', 'Value'].map((c, i) => h('th', { class: i === 0 || i === 1 || i === 5 || i === 7 ? 'l' : '' }, c)))),
      h('tbody', {}, ps.map((p) => {
        const pay = salaryFor(p, game.year);
        return h('tr', {}, h('td', { class: 'l tr-who' }, plink(p), h('div', {}, keyAttrs(p))), h('td', { class: 'l' }, p.orgId && game.world.orgs.has(p.orgId) ? clink(p.orgId, game.world.orgs.get(p.orgId).club.name) : 'Free agent'),
          h('td', {}, mainPos(p)), h('td', {}, p.age), h('td', {}, LV[p.level] || p.level || ''), h('td', { class: 'l' }, lastLine(p)),
          h('td', {}, pay != null ? money(pay) : ''), h('td', { class: 'l cm-s' }, (p.contract?.text || '').replace(/^[^:]*: /, '')), h('td', { class: 'y' }, worthText(p)));
      })))));
}

const signed = (v) => `${v >= 0 ? '+' : '-'}${money(Math.abs(v))}`;

/** What a deal does to your payroll, in words and by season. `offer` is { with, give, get, cash } from your side. */
export function payrollEffect(offer) {
  const im = impact(offer);
  const [a, b, c] = im.rows;
  const d = a.after - a.now;
  const lead = Math.abs(d) < 5e4 ? `Your ${a.year} payroll stays at ${money(a.now)}.`
    : `Your ${a.year} payroll goes ${d > 0 ? 'up' : 'down'} by ${money(Math.abs(d))}, from ${money(a.now)} to ${money(a.after)}.`;
  const room = a.budget - a.after;
  const over = room < 0 ? ` That is ${money(-room)} over the owner's budget of ${money(a.budget)}.` : ` The owner's budget is ${money(a.budget)}, so you would have ${money(room)} of room.`;
  const tax = taxFor(game.orgId, a.year, a.after);
  return h('div', { class: 'cm-pad' },
    h('div', { class: 'cm-h' }, 'What it does to your payroll'),
    h('p', { class: room < 0 ? 'cm-r' : '' }, lead + over),
    h('table', { class: 'cm-tbl info' },
      h('thead', {}, h('tr', {}, ['', 'Now', 'After the deal', 'Change'].map((x, i) => h('th', { class: i ? '' : 'l' }, x)))),
      h('tbody', {}, im.rows.map((r) => h('tr', {}, h('td', { class: 'l' }, String(r.year)), h('td', {}, money(r.now)), h('td', { class: r.after > r.budget ? 'cm-r' : 'y' }, money(r.after)), h('td', {}, Math.abs(r.after - r.now) < 5e4 ? '-' : signed(r.after - r.now)))),
        h('tr', {}, h('td', { class: 'l cm-s' }, 'Luxury tax'), h('td', { colspan: 3, class: 'l y' }, cbtLine(game.orgId, a.year, a.after, tax))))));
}
