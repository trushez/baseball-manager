// Jobs: your contract and the owner's view, offers waiting for you, vacancies you can apply for, your
// applications, your career so far, and who has been sacked and hired around the league.
import { h, fill, toast } from './dom.js';
import { nav } from './nav.js';
import { clubTitle, select } from './club-ui.js';
import { clubMenu } from './menu.js';
import { game, userClub } from '../state.js';
import { dayNo, fromDayNo } from '../season/calendar.js';
import { confidenceWords } from '../season/reactions.js';
import { jobs, vacancies, apply, takeJob, quote, stature, SEVERANCE, careerRows } from '../season/jobs.js';

const $M = (v) => `$${(v / 1e6).toFixed(2).replace(/\.?0+$/, '')}M`;
const club = (id) => game.world.orgs.get(id)?.club;
const name = (id) => { const c = club(id); return c ? (c.full ?? `${c.city} ${c.name}`) : id; };
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const dateOf = (n) => { const d = fromDayNo(n); return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`; };
export const sizeWords = (s) => (s >= 75 ? 'A leading club' : s >= 55 ? 'A strong club' : s >= 35 ? 'A middling club' : 'A small club');

export function jobsScreen() {
  const area = h('div', { class: 'cm-panel grow' });
  const J = jobs();
  const picks = new Map(); // offer club -> { years, sev }

  function draw() {
    const d = dayNo(game.date);
    const out = [];
    // where you stand
    if (J.jobless) {
      out.push(h('p', { class: 'cm-pad cm-r' }, `You have been out of work since ${dateOf(J.jobless.since)}. The days go by while an assistant runs ${name(J.jobless.org)}. Apply for a vacancy below, or wait for a club to call.`));
    } else if (J.contract) {
      const [cw, cc] = confidenceWords();
      out.push(h('table', { class: 'cm-tbl info' }, h('tbody', {},
        [['Club', name(game.orgId)], ['Contract', `${J.contract.years} ${J.contract.years === 1 ? 'year' : 'years'} from ${J.contract.endYear - J.contract.years + 1}, ${$M(J.contract.salary)} a year, running to ${J.contract.endYear}`],
          ['Severance', SEVERANCE[J.contract.sev][0]], ['The owner', h('span', { class: cc }, cw)]]
          .map(([k, v]) => h('tr', {}, h('td', { class: 'l cm-s' }, k), h('td', { class: 'l y' }, v))))));
      if (game.settings.unsackable) out.push(h('p', { class: 'cm-s cm-pad' }, 'Unsackable is switched on in Game Options: the owner cannot dismiss you.'));
    }
    // offers
    if (J.offers.length) {
      out.push(h('div', { class: 'cm-h' }, 'Offers'));
      out.push(h('table', { class: 'cm-tbl' }, h('thead', {}, h('tr', {}, ['Club', 'Size', 'Years', 'Severance', 'Pay a year', 'Open until', ''].map((c, i) => h('th', { class: i < 2 || i === 6 ? 'l' : '' }, c)))),
        h('tbody', {}, J.offers.map((o) => {
          const p = picks.get(o.org) || { years: 3, sev: 'half' };
          picks.set(o.org, p);
          const pay = h('td', { class: 'y' }, $M(quote(o.org, p.years, p.sev)));
          const upd = () => fill(pay, $M(quote(o.org, p.years, p.sev)));
          return h('tr', {}, h('td', { class: 'l' }, name(o.org)), h('td', { class: 'l cm-s' }, sizeWords(stature(o.org))),
            h('td', {}, select([[1, '1 year'], [2, '2 years'], [3, '3 years'], [4, '4 years'], [5, '5 years']], p.years, (v) => { p.years = Number(v); upd(); }, { class: 'cm-sel' })),
            h('td', {}, select(Object.entries(SEVERANCE).map(([k, v]) => [k, v[0]]), p.sev, (v) => { p.sev = v; upd(); }, { class: 'cm-sel' })),
            pay, h('td', {}, dateOf(o.expires)),
            h('td', { class: 'l' }, h('button', { class: 'cm-btn go', onClick: () => accept(o.org, p) }, J.jobless ? 'Accept' : 'Leave and accept'),
              h('button', { class: 'cm-btn', onClick: () => { J.offers = J.offers.filter((x) => x !== o); toast(`You turned ${name(o.org)} down.`); draw(); } }, 'Decline')));
        }))));
      out.push(h('p', { class: 'cm-s cm-pad' }, 'Longer deals and a bigger severance clause mean more security and less pay each year. Your owner cannot stop you leaving.'));
    }
    // vacancies
    const vac = vacancies();
    out.push(h('div', { class: 'cm-h' }, 'Vacancies'));
    out.push(vac.length ? h('table', { class: 'cm-tbl' }, h('thead', {}, h('tr', {}, ['Club', 'Size', 'Open since', ''].map((c, i) => h('th', { class: i === 1 || i === 0 || i === 3 ? 'l' : '' }, c)))),
      h('tbody', {}, vac.map((v) => h('tr', {}, h('td', { class: 'l' }, name(v.org)), h('td', { class: 'l cm-s' }, sizeWords(v.stature)), h('td', {}, dateOf(v.since)),
        h('td', { class: 'l' }, v.offer ? h('span', { class: 'cm-g' }, 'They have made you an offer') : v.applied ? h('span', { class: 'cm-s' }, 'Applied, waiting to hear') : v.rejected ? h('span', { class: 'cm-s' }, 'They said no')
          : h('button', { class: 'cm-btn', onClick: () => { const e = apply(v.org); toast(e || `You applied to ${name(v.org)}. They will answer within a week.`); draw(); } }, 'Apply')))))) : h('p', { class: 'cm-s cm-pad cm-empty' }, 'No club is looking for a manager just now. Vacancies open through the year, mostly after the season ends.'));
    // career
    const rows = careerRows();
    out.push(h('div', { class: 'cm-h' }, 'Your career'));
    out.push(h('table', { class: 'cm-tbl' }, h('thead', {}, h('tr', {}, ['Date', 'Club', ''].map((c) => h('th', { class: 'l' }, c)))),
      h('tbody', {}, rows.map((r) => h('tr', {}, h('td', { class: 'l' }, dateOf(r.from)), h('td', { class: 'l' }, name(r.org)),
        h('td', { class: 'l cm-s' }, r.how === 'appointed' ? 'Appointed' : r.how === 'sacked' ? `Sacked${r.pay ? `, paid out ${$M(r.pay)}` : ''}` : 'Resigned'))))));
    // around the league
    const moves = J.log.filter((x) => x.how === 'fired' || x.how === 'hired').slice(-12).reverse();
    if (moves.length) {
      out.push(h('div', { class: 'cm-h' }, 'Around the league'));
      out.push(h('table', { class: 'cm-tbl' }, h('tbody', {}, moves.map((r) => h('tr', {}, h('td', { class: 'l cm-s' }, dateOf(r.from)), h('td', { class: 'l' }, name(r.org)), h('td', { class: 'l' }, r.how === 'fired' ? `Sacked ${r.who}` : `Appointed ${r.who}`))))));
    }
    fill(area, out);
  }

  async function accept(org, p) {
    const e = takeJob(org, p.years, p.sev);
    if (e) { toast(e); draw(); return; }
    const { inboxScreen } = await import('./inbox-screen.js');
    nav.reset(inboxScreen());
    toast(`You are the manager of ${name(org)}.`);
  }

  return { el: h('div', { style: { display: 'contents' } }, clubTitle(userClub(), 'Jobs'), area), side: () => clubMenu('jobs'), onShow: draw };
}
