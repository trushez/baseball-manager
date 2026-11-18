// Jobs. You are one person, general manager and manager together, with a reputation nobody shows you.
// The owner's confidence (reactions.js) now has consequences: grumbling, a public vote of confidence, an
// ultimatum with a date, and the sack. Computer clubs sack their managers too and hire from a pool of
// invented ones with three hidden ratings. Vacancies are open to applications, clubs approach you with
// offers, and out of work the days still pass (an assistant runs the club you left until you are hired).
import { game } from '../state.js';
import { Rng } from '../core/rng.js';
import { dayNo, fromDayNo } from './calendar.js';
import { message } from './inbox.js';
import { owner, ownerLetter } from './finance.js';
import { confidence, confidenceWords } from './reactions.js';
import { ensureManagers, newManager, managerOf, managerCareer } from './history.js';
import { headline } from './headlines.js';

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const $M = (v) => `$${(v / 1e6).toFixed(2).replace(/\.?0+$/, '')}M`;
const city = (id) => game.world.orgs.get(id)?.club.city ?? id;
const full = (id) => { const c = game.world.orgs.get(id)?.club; return c ? (c.full ?? `${c.city} ${c.name}`) : id; };

export const BACKGROUNDS = [
  { id: 'none', label: 'No playing career', rep: 30 },
  { id: 'minor', label: 'Minor league player', rep: 38 },
  { id: 'major', label: 'Major league player', rep: 50 },
  { id: 'star', label: 'All-Star player', rep: 62 },
];
export const SEVERANCE = { none: ['None', 0, 1.2], half: ['Half the contract', 0.5, 1], full: ['The whole contract', 1, 0.85] };
const YEARS_PAY = { 1: 1.1, 2: 1.05, 3: 1, 4: 0.97, 5: 0.95 };

/** Your career state, created on first use. */
export function jobs() {
  game.jobs ||= { rep: 40, prot: 0, contract: null, stage: 0, until: null, jobless: null, vac: {}, pool: [], apps: [], offers: [], log: [], route: false, bg: 'none', earned: 0, idle: 0 };
  return game.jobs;
}
/** Games saved before jobs existed get a career of their own: a middling name and a three year deal. */
export function ensureJobs() {
  if (game.jobs) return;
  jobsInit({ bg: 'minor' });
}
export const jobless = () => !!game.jobs?.jobless;
export const unsackable = () => !!game.settings?.unsackable;

// ---------- standing ----------

/** How big a club is, 0 to 100: its payroll rank and how it has done lately. */
export function stature(orgId) {
  const clubs = game.world.mlb;
  const rank = clubs.slice().sort((a, b) => (b.payroll2026 || 0) - (a.payroll2026 || 0)).findIndex((c) => c.org === orgId);
  const pay = 100 * (1 - Math.max(0, rank) / Math.max(1, clubs.length - 1));
  const recs = [1, 2, 3].map((n) => game.history?.[game.year - n]?.clubs?.[orgId]).filter(Boolean);
  const club = game.world.orgs.get(orgId)?.club;
  const r = recs.length ? recs.map((x) => x.w / (x.w + x.l)).reduce((a, b) => a + b, 0) / recs.length : club?.record2026 ? club.record2026[0] / (club.record2026[0] + club.record2026[1]) : 0.5;
  const form = clamp(((r - 0.38) / 0.24) * 100, 0, 100);
  return Math.round(0.6 * pay + 0.4 * form);
}
/** Wins a club of this size is expected to win. */
export const expectedWins = (orgId) => 68 + 0.26 * stature(orgId);

/** The five weakest organisations, for the career route. */
export function weakestFive() {
  return game.world.mlb.map((c) => [c.org, stature(c.org)]).sort((a, b) => a[1] - b[1]).slice(0, 5).map((x) => x[0]);
}

/** Set up your career at the start of a new game. */
export function jobsInit({ bg = 'none', route = false } = {}) {
  game.jobs = null;
  const J = jobs();
  J.bg = bg; J.route = route;
  J.rep = (BACKGROUNDS.find((b) => b.id === bg)?.rep ?? 30) - (route ? 8 : 0);
  const year = game.year;
  J.contract = startTerms(game.orgId, 3, 'half', year);
  J.log.push({ org: game.orgId, from: dayNo(game.date), year, how: 'appointed' });
  J.prot = dayNo(game.date) + 120;
  ensureManagers();
  topUpPool();
}

// ---------- contracts ----------

/** The offer a club makes before you shape it: pay by club size and your name, then years and severance move it. */
export function baseSalary(orgId) { return 0.8e6 + 3.2e6 * (stature(orgId) / 100); }
export function quote(orgId, years, sev) {
  const J = jobs();
  const rep = 0.85 + 0.3 * (J.rep / 100);
  return Math.round((baseSalary(orgId) * rep * (YEARS_PAY[years] ?? 1) * SEVERANCE[sev][2]) / 5e4) * 5e4;
}
function startTerms(orgId, years, sev, year) {
  return { org: orgId, years, sev, salary: quote(orgId, years, sev), endYear: year + years - 1 };
}
/** What you would be paid if the owner sacked you now. */
export function payout() {
  const c = jobs().contract;
  if (!c) return 0;
  const left = clamp(c.endYear - game.year + 1, 1, 3);
  return Math.round(c.salary * left * SEVERANCE[c.sev][1]);
}

// ---------- the pool of managers ----------

const alive = () => new Set(Object.values(game.mgrOf || {}));
/** Keep about 25 unemployed managers on the market. */
export function topUpPool() {
  const J = jobs();
  ensureManagers();
  J.pool = J.pool.filter((id) => game.managers[id] && !alive().has(id));
  let n = 0;
  while (J.pool.length < 25 && n++ < 60) {
    const m = newManager(`${game.year}-${dayNo(game.date)}-${J.pool.length}-${n}`, game.year);
    J.pool.push(m.id);
  }
}
/** Ratings of a manager the game did not make (a real one from the data): fixed from his id. */
export function ratings(m) {
  if (!m.r) { const rng = new Rng(`rate-${m.id}`); m.r = { tac: rng.int(7, 15), han: rng.int(7, 15), dev: rng.int(7, 15) }; }
  if (m.rep == null) m.rep = 30 + new Rng(`rep-${m.id}`).int(0, 30);
  return m.r;
}
export const mgrScore = (m) => { const r = ratings(m); return (r.tac + r.han + r.dev) / 3; };

// ---------- the owner and the sack ----------

const need = 35; // the confidence an ultimatum asks you to win back ("concerned")

/** Each day: the owner's patience. Only you are watched; the computer's managers go at the end of the year. */
function ownerWatch(d) {
  const J = jobs();
  if (J.jobless || unsackable() || d < J.prot) return;
  if (game.phase !== 'regular' && game.phase !== 'post' && game.phase !== 'over') return;
  const c = confidence();
  const club = full(game.orgId);
  if (J.stage >= 3) {
    if (c >= need) {
      J.stage = 0; J.until = null;
      message({ cat: 'club', important: true, stop: true, title: 'The owner steps back from the brink', body: `The recent results have turned the owner round. He no longer expects an answer by the date he gave you, and says he is glad he held his nerve. His confidence in you: ${confidenceWords(c)[0].toLowerCase()}.` });
    } else if (d >= J.until) sack('ultimatum');
    return;
  }
  if (c <= 6) { sack('patience'); return; }
  if (c >= 48 && J.stage) { J.stage = 0; return; }
  if (c < 14 && J.stage < 3) {
    J.stage = 3; J.until = d + 21;
    message({ cat: 'club', important: true, stop: true, title: 'The owner gives you until ' + dateWords(fromDayNo(J.until)),
      body: `He has called you in. The results are not good enough, and he wants his confidence in you back to at least "concerned" by ${dateWords(fromDayNo(J.until))}, three weeks from today. If that does not happen, he will make a change.` });
  } else if (c < 22 && J.stage < 2) {
    J.stage = 2;
    message({ cat: 'club', important: true, stop: true, title: 'The owner backs you, for now',
      body: `The owner told reporters that he has full confidence in you. In baseball those words are seldom good news. The ${club} supporters think he is only buying time.` });
  } else if (c < 32 && J.stage < 1) {
    J.stage = 1;
    message({ cat: 'club', important: true, stop: game.settings.stops.important, title: 'Grumbling in the boardroom',
      body: `Results have not gone the way the owner hoped, and the local papers are asking whether you are the right person for the job. His confidence in you: ${confidenceWords(c)[0].toLowerCase()}.` });
  }
}
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const dateWords = (dt) => `${dt.getDate()} ${MONTHS[dt.getMonth()]}`;

/** The owner sacks you. */
export function sack(why = 'patience') {
  const J = jobs();
  if (J.jobless) return;
  const org = game.orgId;
  const pay = payout();
  J.earned += pay;
  J.rep = clamp(J.rep - (dayNo(game.date) - J.log.at(-1).from < 365 ? 9 : 6), 0, 100);
  J.log.push({ org, from: dayNo(game.date), year: game.year, how: 'sacked', pay });
  J.stage = 0; J.until = null; J.offers = []; J.apps = [];
  J.jobless = { since: dayNo(game.date), org };
  J.idle = 0;
  J.contract = null;
  // the club hires someone at once, from the market
  const pick = bestFor(org, new Rng(`interim-${org}-${dayNo(game.date)}`));
  if (pick) game.mgrOf[org] = pick.id;
  else delete game.mgrOf[org];
  ensureManagers();
  topUpPool();
  headline(`${full(org).toUpperCase()} SACK ${game.manager.toUpperCase()}`, true);
  const words = why === 'ultimatum' ? 'The date the owner gave you has passed and the results have not changed.' : 'The owner has lost patience with the results.';
  message({ cat: 'club', important: true, stop: true, title: 'You have been sacked',
    body: `${words} ${managerOf(org)?.name ?? 'Someone else'} takes over at ${full(org)}.\n${pay ? `Your contract pays out ${$M(pay)}.` : 'Your contract carried no severance, so there is nothing to collect.'}\nYou are out of work. Clubs will notice vacancies as they come up: look under Jobs, apply, and wait for offers. The days keep passing while you wait, and your reputation will slip if you are out for long. An assistant runs ${city(org)} in the meantime.` });
}

// ---------- computer managers ----------

/** Choose the manager a club would hire from the market. */
function bestFor(org, rng) {
  const J = jobs();
  const st = stature(org);
  const cands = J.pool.map((id) => game.managers[id]).filter(Boolean);
  if (!cands.length) return null;
  const scored = cands.map((m) => ({ m, s: mgrScore(m) * 1.5 - Math.abs((m.rep ?? 40) - st) * 0.25 + rng.next() * 3 }));
  scored.sort((a, b) => b.s - a.s);
  const pick = scored[0].m;
  J.pool = J.pool.filter((id) => id !== pick.id);
  pick.since = game.year;
  return pick;
}

/** A computer club sacks its manager: he goes to the market and the post opens. */
function fireManager(org, why) {
  const J = jobs();
  const m = managerOf(org);
  if (!m || m.user || m.id === 'you') return;
  m.rep = clamp((m.rep ?? 40) - 6, 0, 100);
  delete game.mgrOf[org];
  J.pool.push(m.id);
  J.vac[org] = { since: dayNo(game.date), why, delay: new Rng(`vac-${org}-${game.year}-${dayNo(game.date)}`).int(8, 35) };
  J.log.push({ org, from: dayNo(game.date), year: game.year, how: 'fired', who: m.name });
  message({ cat: 'league', quiet: true, title: `${city(org)} sack ${m.name}`, body: `${full(org)} have dismissed their manager ${m.name}${why ? `, ${why}` : ''}. The job is open.` });
}

/** A club's manager appoints, filling a vacancy from the market. */
function fillVacancy(org) {
  const J = jobs();
  const pick = bestFor(org, new Rng(`fill-${org}-${dayNo(game.date)}`));
  if (!pick) return;
  game.mgrOf[org] = pick.id;
  delete J.vac[org];
  J.log.push({ org, from: dayNo(game.date), year: game.year, how: 'hired', who: pick.name });
  message({ cat: 'league', quiet: true, title: `${city(org)} appoint ${pick.name}`, body: `${full(org)} have named ${pick.name} (${pick.age}) as their new manager.` });
}

/** After the season: every computer club weighs its manager's year. Returns the clubs that changed hands. */
function reviewManagers(last) {
  const H = game.history?.[last];
  if (!H) return [];
  const J = jobs();
  const rng = new Rng(`review-${last}-${game.manager}`);
  const out = [];
  const rows = Object.entries(H.clubs).filter(([org]) => org !== game.orgId && game.mgrOf[org] && game.mgrOf[org] !== 'you');
  for (const [org, r] of rows) {
    const gap = r.w - expectedWins(org);
    const m = managerOf(org);
    const young = J.log.some((x) => x.org === org && x.how === 'hired' && x.year >= last); // appointed during the season: given more time
    let p = gap <= -14 ? 0.75 : gap <= -9 ? 0.4 : gap <= -5 ? 0.12 : 0.01;
    if (young) p *= 0.5;
    if (r.post === 'Champions') p = 0;
    if (out.length < 7 && rng.chance(p)) { fireManager(org, gap <= -5 ? `after a ${r.w}-${r.l} season` : ''); out.push(org); }
  }
  return out;
}

// ---------- the season's end ----------

/** The year turns: your reputation and the owner move on, and the computer clubs review their managers. */
export function jobsSeasonEnd(last) {
  const J = jobs();
  const H = game.history?.[last];
  const mine = H?.clubs?.[game.orgId];
  if (mine && !J.jobless) {
    const gap = mine.w - expectedWins(game.orgId);
    const PO = { WC: 1, DS: 2.5, LCS: 4, WS: 6, Champions: 10 };
    let delta = gap / 5 + (PO[mine.post] ?? 0);
    const moy = managerCareer('you').find((x) => x.year === last)?.moy;
    if (moy) delta += 2;
    delta = clamp(delta, -8, 14);
    if (delta > 0) delta *= 1 - J.rep / 150;
    J.rep = clamp(J.rep + delta, 0, 100);
    // a new year: the owner's mood drifts back to the middle
    const o = owner(game.orgId);
    o.conf = Math.round((o.conf ?? 60) * 0.7 + 60 * 0.3);
    J.stage = 0; J.until = null;
  }
  if (J.jobless) J.rep = clamp(J.rep - 2, 0, 100);
  reviewManagers(last);
  topUpPool();
}

// ---------- the market: vacancies, applications, offers ----------

const held = (org) => J_apps(org) || J_offers(org);
const J_apps = (org) => jobs().apps.some((a) => a.org === org && a.status === 'pending');
const J_offers = (org) => jobs().offers.some((o) => o.org === org);

/** Vacancies you could apply for, with how they stand. */
export function vacancies() {
  const J = jobs();
  return Object.entries(J.vac).map(([org, v]) => ({ org, since: v.since, stature: stature(org), applied: J.apps.some((a) => a.org === org && a.status === 'pending'), offer: J.offers.find((o) => o.org === org) ?? null, rejected: J.apps.some((a) => a.org === org && a.status === 'rejected') }))
    .sort((a, b) => b.stature - a.stature);
}

/** Apply for a vacancy. The club answers in three to seven days. Returns a reason it cannot be done, or null. */
export function apply(org) {
  const J = jobs();
  if (!J.vac[org]) return 'The job is no longer open.';
  if (J.apps.some((a) => a.org === org && a.status === 'pending')) return 'You have already applied.';
  if (J.apps.filter((a) => a.status === 'pending').length >= 3) return 'You already have three applications waiting. Wait for answers first.';
  const day = dayNo(game.date);
  J.apps.push({ org, day, due: day + new Rng(`app-${org}-${day}`).int(3, 7), status: 'pending' });
  return null;
}

function makeOffer(org, how) {
  const J = jobs();
  const day = dayNo(game.date);
  J.offers.push({ org, day, expires: day + 10, how });
  message({ cat: 'club', important: true, stop: true, jobOffer: org, title: `${city(org)} want to talk to you`,
    body: how === 'application' ? `${full(org)} have looked at your application and would like to offer you the job. The terms are on the Jobs screen and the offer stands for ten days.` : `${full(org)}'s owner has approached you about the manager's job. The terms are on the Jobs screen and the offer stands for ten days.${J.jobless ? '' : ' You can say no, or you can go, and your owner cannot stop you.'}` });
}

/** What the club makes of the people it has approached or who have applied, and who it appoints, each day. */
function marketDay(d) {
  const J = jobs();
  const rng = new Rng(`market-${d}-${game.manager}`);
  // applications
  for (const a of J.apps) {
    if (a.status !== 'pending' || a.due > d) continue;
    if (!J.vac[a.org]) { a.status = 'closed'; continue; }
    const score = J.rep - stature(a.org) + rng.int(-9, 9) + (J.jobless ? 6 : 0);
    if (score >= -10) { a.status = 'offered'; makeOffer(a.org, 'application'); }
    else {
      a.status = 'rejected';
      message({ cat: 'club', title: `${city(a.org)} have gone elsewhere`, body: `${full(a.org)} thanked you for your application, but they are looking for someone with a bigger name.` });
    }
  }
  J.offers = J.offers.filter((o) => { if (o.expires < d || !J.vac[o.org]) { return false; } return true; });
  J.apps = J.apps.filter((a) => a.status === 'pending' || d - a.due < 60);
  // the computer clubs fill vacancies unless you are in talks
  for (const [org, v] of Object.entries(J.vac)) {
    if (held(org)) continue;
    if (d - v.since >= v.delay) fillVacancy(org);
  }
  // clubs approach you, on Mondays
  if (fromDayNo(d).getDay() === 1) {
    const live = J.offers.length;
    const mine = J.jobless ? -1 : stature(game.orgId);
    if (live < 2 && d > J.prot - 60) {
      const cands = Object.keys(J.vac).filter((org) => !held(org) && stature(org) <= J.rep + 6 && (J.jobless || stature(org) >= mine + 5) && !J.apps.some((a) => a.org === org && a.status === 'rejected'));
      if (cands.length && rng.chance(J.jobless ? 0.6 : 0.2)) makeOffer(rng.pick(cands), 'approach');
    }
  }
  // out of work: months go by, a name fades, and a job always turns up in the end
  if (J.jobless) {
    J.idle++;
    if (J.idle > 45 && J.idle % 30 === 0) J.rep = clamp(J.rep - 1, 0, 100);
    if (J.idle === 40 && !Object.keys(J.vac).length) { const worst = game.world.mlb.map((c) => [c.org, stature(c.org)]).filter(([o]) => o !== game.orgId && game.mgrOf[o] !== 'you').sort((a, b) => a[1] - b[1])[0]; if (worst) fireManager(worst[0], 'after a poor run'); }
    if (J.idle >= 70 && !J.offers.length && !J.apps.some((a) => a.status === 'pending')) {
      const low = Object.keys(J.vac).sort((a, b) => stature(a) - stature(b))[0];
      if (low) makeOffer(low, 'approach');
    }
  }
  // mid-season, a club at the bottom may lose patience
  const dt = fromDayNo(d);
  if (game.phase === 'regular' && ((dt.getMonth() === 5 && dt.getDate() === 1) || (dt.getMonth() === 7 && dt.getDate() === 15))) midSeasonFirings(d, rng);
}

function midSeasonFirings(d, rng) {
  const S = game.season;
  for (const [org, r] of S.records) {
    if (org === game.orgId || game.mgrOf[org] === 'you' || !game.mgrOf[org]) continue;
    const g = r.w + r.l;
    if (g < 50) continue;
    const pace = (r.w / g) * 162;
    if (pace < expectedWins(org) - 16 && rng.chance(0.35)) fireManager(org, `with the club ${r.w}-${r.l}`);
  }
}

// ---------- taking a job ----------

/** Accept a club's offer with the terms you chose. The season goes on the same day with your new club. */
export function takeJob(org, years, sev) {
  const J = jobs();
  const offer = J.offers.find((o) => o.org === org);
  if (!offer || !J.vac[org]) return 'The offer has been withdrawn.';
  const old = game.orgId;
  const day = dayNo(game.date);
  const wasJobless = !!J.jobless;
  if (!wasJobless) {
    // leaving: the old club hires from the market
    J.rep = clamp(J.rep - 2, 0, 100);
    J.log.push({ org: old, from: day, year: game.year, how: 'left' });
    const pick = bestFor(old, new Rng(`left-${old}-${day}`));
    if (pick) game.mgrOf[old] = pick.id; else delete game.mgrOf[old];
    message({ cat: 'league', quiet: true, title: `${city(old)} lose their manager`, body: `${game.manager} has left ${full(old)} for ${full(org)}. ${pick ? `${pick.name} replaces ${game.manager}.` : ''}` });
  }
  // the new club
  delete J.vac[org];
  game.orgId = org;
  game.mgrOf[org] = 'you';
  J.jobless = null; J.idle = 0; J.stage = 0; J.until = null;
  J.offers = []; J.apps = [];
  J.contract = startTerms(org, years, sev, game.year);
  J.prot = day + 120;
  J.log.push({ org, from: day, year: game.year, how: 'appointed' });
  const o = owner(org);
  o.conf = 60; o.warned = false;
  // what belonged to the old job stays with it
  game.negotiations = {}; game.promises = []; game.draftPlan = null; game.planReview = null; game.scoutQueue = [];
  if (game.market?.offers) game.market.offers = game.market.offers.filter((x) => x.status !== 'open');
  game.compareWith = null;
  game.settings.autoPlay = false;
  ensureManagers();
  headline(`${full(org).toUpperCase()} APPOINT ${game.manager.toUpperCase()}`, true);
  message({ cat: 'club', important: true, title: `Welcome to ${full(org)}`,
    body: `${full(org)} have named ${game.manager} as their manager. Contract: ${years} ${years === 1 ? 'year' : 'years'} at ${$M(J.contract.salary)} a year, with severance of ${SEVERANCE[sev][0].toLowerCase()}. The roster, the staff and the scouts are what you find here.\n${ownerLetter(org, game.year)}` });
  return null;
}

/** Daily: the owner's patience, the market, the pool. Call at the end of each day. */
export function jobsDay(date = game.date) {
  if (!game.jobs) return;
  const d = dayNo(date);
  marketDay(d);
  ownerWatch(d);
}

/** Your career as rows for the Jobs screen. */
export function careerRows() {
  const J = jobs();
  return J.log.filter((x) => x.how === 'appointed' || x.how === 'sacked' || x.how === 'left');
}
