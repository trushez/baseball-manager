// International amateurs: each December a class of teenage prospects from Latin America becomes available. Clubs have
// a pool of signing money; from 1 December to 14 January you bid a bonus for the ones you want, and on 15 January each
// prospect signs with the best offer. Signed players join the Rookie level.
//
// The class is made from the same moulds as the draft and the same seed every time, so a saved game rebuilds it exactly.
// Only the prospects who sign are kept: the rest are dropped on signing day.
import { Rng } from '../core/rng.js';
import { game, orgState, autoClub } from '../state.js';
import { isPitcher, mainPos, fullName, money } from '../data/world.js';
import { value } from './value.js';
import { clubScouting, reportOn, countryOf } from './scouting.js';
import { gmOf } from './gms.js';
import { newPlayer } from './intake.js';
import { message } from './inbox.js';
import { logMove } from './roster.js';

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
export const CLASS_SIZE = 300;
const NATIONS = [['DOM', 0.46], ['VEN', 0.24], ['MEX', 0.10], ['COL', 0.08], ['PAN', 0.06], ['NIC', 0.06]];
const ROOKIE_CAP = 32; // a club with this many at the Rookie level stops bidding

const peakOf = (p) => (p.pa - 100) / 5 + 50;
/** What a prospect asks for: a few hundred thousand for most, millions for the best. */
export const askFor = (p) => Math.round(clamp(150000 * 10 ** ((peakOf(p) - 46) / 11), 60000, 5500000) / 5000) * 5000;

const cache = new Map();
/** The class of a year, made from a fixed seed. Players already signed are the real ones in the world. */
export function classOf(year) {
  const key = `${game.manager}|${year}`;
  if (cache.has(key)) return cache.get(key);
  const W = game.world, pool = game.intakePool || [];
  const rng = new Rng(`intl-${year}-${game.manager}`);
  const out = [];
  if (pool.length) {
    for (let i = 0; i < CLASS_SIZE; i++) {
      const id = `x${year}-${i + 1}`;
      const kind = rng.chance(0.47) ? 'pit' : 'bat';
      const tpls = pool.filter((t) => t.kind === kind);
      const tpl = rng.pick(tpls.length ? tpls : pool);
      let c = rng.next() * 100, acc = 0, code = 'DOM';
      for (const [k, w] of NATIONS) { acc += w * 100; if (c < acc) { code = k; break; } }
      const age = rng.chance(0.65) ? 16 : 17;
      const t2 = { ...tpl, age, r: { ...tpl.r }, grades: JSON.parse(JSON.stringify(tpl.grades)) };
      const d = 12;
      for (const [k, v] of Object.entries(t2.r)) if (typeof v === 'number' && k !== '_e') t2.r[k] = clamp(v - d, 20, 80);
      for (const g of Object.values(t2.grades)) if (Array.isArray(g) && typeof g[0] === 'number') g[0] = clamp(g[0] - d, 20, 80);
      const made = newPlayer(t2, { id: 'INTL' }, year, rng, { id });
      const have = W.players.get(id);
      const p = have || made;
      if (!have) {
        p.team = null; p.club = null; p.orgId = null; p.level = 'R'; p.amateur = true; p.country = code; p.intlYear = year;
        W.players.set(id, p);
      }
      p.ask = askFor(p);
      out.push(p);
    }
  }
  cache.set(key, out);
  return out;
}

/** The state of this year's signing period. */
export function intl() {
  const year = signingYear();
  const s = (game.intl ||= {});
  if (s.year !== year) Object.assign(s, { year, bids: {}, done: false, results: null, noted: {} });
  return s;
}

/** The signing day year: the January 15 that ends the period which opens on 1 December. */
export function signingYear(date = game.date) {
  return date.getMonth() === 11 ? date.getFullYear() + 1 : date.getMonth() === 0 ? date.getFullYear() : date.getFullYear() + (date.getMonth() > 5 ? 1 : 0);
}
const classYear = (y) => y - 1; // the class made on 1 December of the year before

/** True from 1 December to 14 January. */
export function open(date = game.date) {
  const m = date.getMonth(), d = date.getDate();
  return m === 11 || (m === 0 && d < 15);
}

export const prospects = () => (open() ? classOf(classYear(signingYear())) : []).filter((p) => p.amateur);

// ---------- money ----------

const rankOf = (orgId) => game.world.mlb.slice().sort((a, b) => (b.payroll2026 || 0) - (a.payroll2026 || 0)).findIndex((c) => c.org === orgId);
/** A club's signing pool: the smaller payrolls get more, as in real life. */
export const poolOf = (orgId = game.orgId) => Math.round((4.0e6 + (Math.max(0, rankOf(orgId)) / 29) * 2.0e6) / 5e4) * 5e4;
export const committed = () => Object.values(intl().bids).reduce((a, b) => a + b, 0);
export const roomLeft = () => poolOf() - committed() - (game.finds?.spent?.[game.date.getFullYear()] || 0);

export function bid(p, amount) {
  const s = intl();
  if (!open()) return 'The signing period is not open.';
  if (!p.amateur) return 'He is not in this year\'s class.';
  amount = Math.round(amount / 5000) * 5000;
  const had = s.bids[p.id] || 0;
  if (amount < p.ask * 0.85) return `${fullName(p)} will not sign for less than about ${money(Math.round(p.ask * 0.85), { short: false })}.`;
  if (committed() - had + amount > poolOf()) return `Your signing pool is ${money(poolOf())}; this leaves too little.`;
  s.bids[p.id] = amount;
  return null;
}
export const withdraw = (p) => { delete intl().bids[p.id]; };

// ---------- the assistant's list ----------

/** The prospects the assistant would bid on, best value for the money first, until the pool is nearly spent. */
export function assistantList() {
  const q = scoutQuality();
  const rows = prospects().map((p) => {
    const rep = reportOn(p);
    const ceiling = rep?.pj != null ? (rep.pj - 100) / 5 + 50 : peakOf(p) + new Rng(`ast-${p.id}-${game.manager}`).normal(0, 9 - 0.38 * q);
    return { p, ceiling, bid: Math.round(p.ask * 1.05 / 5000) * 5000 };
  }).sort((a, b) => b.ceiling - a.ceiling);
  const out = [];
  let left = poolOf();
  const need = { pit: 0, bat: 0 };
  for (const r of rows) {
    if (out.length >= 14 || left < 60000) break;
    if (r.bid > left || r.ceiling < 48) continue;
    if ((need[isPitcher(r.p) ? 'pit' : 'bat']) >= 9) continue;
    out.push(r); left -= r.bid; need[isPitcher(r.p) ? 'pit' : 'bat']++;
  }
  return out;
}
export function placeAssistant() {
  const s = intl();
  s.bids = {};
  for (const r of assistantList()) s.bids[r.p.id] = r.bid;
  return Object.keys(s.bids).length;
}
function scoutQuality() {
  const sc = game.staff?.[game.orgId]?.scouts || [];
  return sc.length ? clamp(sc.reduce((a, x) => a + x.ja, 0) / sc.length + (sc.length - 1) * 0.7, 5, 18) : 5;
}

// ---------- signing day ----------

export function sign(p, orgId, bonus, year) {
  const W = game.world, o = W.orgs.get(orgId);
  logMove(p, 'intl', null, orgId, { bonus, country: p.country });
  p.orgId = orgId; p.team = `${orgId}-R`; p.club = W.clubs.get(p.team); p.level = 'R';
  delete p.amateur;
  p.contract = { status: 'minor league', text: 'Minor league contract', serviceTime: 0, options: 3, aav: 0, years: [], bonus, signed: year, intl: true };
  W.list.push(p); o.players.push(p);
  orgState(orgId).level.set(p.id, 'R');
  if (orgId === game.orgId) p.wasMine = true;
}

/** Every club's offers, the winners, the money. Returns the results record. */
export function resolve(date = game.date) {
  const s = intl();
  if (s.done) return s.results;
  const year = date.getFullYear();
  const cls = classOf(classYear(s.year)).filter((p) => p.amateur);
  const offers = new Map(); // pid -> [{org, offer}]
  const add = (pid, org, offer) => { if (!offers.has(pid)) offers.set(pid, []); offers.get(pid).push({ org, offer }); };
  for (const [pid, amount] of Object.entries(s.bids)) add(pid, game.orgId, amount);
  const W = game.world;
  for (const o of W.orgs.values()) {
    if (o.id === game.orgId) continue;
    const rng = new Rng(`intlbid-${o.id}-${s.year}-${game.manager}`);
    const q = clubScouting(o.id), sd = 9 - 0.38 * q;
    const roomR = ROOKIE_CAP - o.players.filter((p) => p.level === 'R').length;
    if (roomR <= 0) continue;
    const view = cls.map((p) => { const v = peakOf(p) + new Rng(`iv-${o.id}-${p.id}-${game.manager}`).normal(0, sd) + (gmOf(o.id).love - 1) * 6; return { p, v, pick: v - 4 * Math.log10(p.ask / 150000) + new Rng(`ip-${o.id}-${p.id}-${game.manager}`).normal(0, 4) }; }).sort((a, b) => b.pick - a.pick);
    let left = poolOf(o.id), n = 0;
    for (const x of view) {
      if (n >= Math.min(16, roomR) || left < 60000) break;
      const offer = Math.round(x.p.ask * (0.95 + 0.25 * gmOf(o.id).gamble * rng.next() + 0.1 * rng.next()) / 5000) * 5000;
      if (offer > left * 0.3 || x.v < 40) continue; // no one player takes most of the pool
      add(x.p.id, o.id, offer); left -= offer; n++;
    }
  }
  const results = [];
  const mine = { signed: [], lost: [] };
  const stature = (org) => 1 + 0.04 * (1 - Math.max(0, rankOf(org)) / 29);
  for (const p of cls) {
    const list = offers.get(p.id) || [];
    const rng = new Rng(`intlwin-${p.id}-${game.manager}`);
    const scored = list.map((x) => ({ ...x, sc: x.offer * stature(x.org) * (1 + rng.normal(0, 0.03)) })).sort((a, b) => b.sc - a.sc);
    const win = scored[0];
    if (win && win.offer >= p.ask * 0.85) {
      const row = { pid: p.id, name: fullName(p), pos: mainPos(p), age: p.age, country: p.country, org: win.org, bonus: win.offer, ask: p.ask, peak: Math.round(peakOf(p)) };
      sign(p, win.org, win.offer, date.getFullYear());
      results.push(row);
      if (win.org === game.orgId) mine.signed.push(row);
      const my = list.find((x) => x.org === game.orgId);
      if (my && win.org !== game.orgId) mine.lost.push({ ...row, mine: my.offer });
    } else {
      const my = list.find((x) => x.org === game.orgId);
      if (my) mine.lost.push({ pid: p.id, name: fullName(p), pos: mainPos(p), org: null, bonus: 0, mine: my.offer });
      W.players.delete(p.id);
    }
  }
  s.done = true;
  s.results = { top: results.sort((a, b) => b.bonus - a.bonus).slice(0, 12), mine, count: results.length, year };
  cache.delete(`${game.manager}|${classYear(s.year)}`);
  return s.results;
}

// ---------- the calendar ----------

/** Called each day through the winter. */
export function intlDay(date) {
  const m = date.getMonth(), d = date.getDate();
  if (open(date)) classOf(classYear(signingYear(date))); // keeps the class in the world after a load, for scouting and links
  if (m === 11 && d === 1) {
    const s = intl();
    if (s.noted.open) return;
    s.noted.open = true;
    const cls = classOf(classYear(s.year));
    message({ cat: 'club', important: true, stop: game.settings?.stops?.important, title: 'International signing period: the class is open',
      parts: [{ p: `${cls.length} teenage prospects from the Dominican Republic, Venezuela, Mexico and elsewhere can sign with any club on 15 January. Your signing pool is ${money(poolOf(), { short: false })}. Under Transfers, International you can read what your scouts say, set a bonus for each player you want, or ask the assistant for its list. Each player signs with the best offer, which counts the bonus a little ahead of the club's standing. Anyone who wants less than he is offered does not drop below about 85% of what he asks.` },
        { p: 'Your scouts can see them if you send one to the country. Without a scout you only see about half of what a prospect can do, and nothing of what he will become.' }] });
    return;
  }
  if (m === 0 && d === 14) {
    const s = intl();
    if (s.noted.eve || s.done) return;
    s.noted.eve = true;
    const n = Object.keys(s.bids).length;
    message({ cat: 'club', important: true, stop: game.settings?.stops?.important, title: 'Signing day is tomorrow',
      body: n ? `You have bids on ${n} prospects, ${money(committed(), { short: false })} of your ${money(poolOf(), { short: false })} pool. Change them under Transfers, International before tomorrow.` : `You have not bid on anyone. Tomorrow the class signs with other clubs. Open Transfers, International to bid, or let the assistant place its list.` });
    return;
  }
  if (autoClub() && m === 0 && d === 10) {
    const s = intl();
    if (!s.done && !Object.keys(s.bids).length) placeAssistant();
  }
  if (m === 0 && d === 15) {
    const s = intl();
    if (s.done) return;
    const res = resolve(date);
    const mine = res.mine;
    const rows = (a) => a.map((r) => [{ pid: r.pid, t: r.name }, r.pos, String(r.age), countryOf({ country: r.country }), money(r.bonus, { short: false })]);
    const parts = [{ p: `${res.count} of the class signed today. ${mine.signed.length ? `You signed ${mine.signed.length}.` : 'You signed nobody.'}` }];
    if (mine.signed.length) parts.push({ head: ['Your signings', 'Pos', 'Age', 'From', 'Bonus'], rows: rows(mine.signed) });
    if (mine.lost.length) parts.push({ p: `You lost out on ${mine.lost.length}.` }, { head: ['Lost', 'Went to', 'Winning bonus', 'Your bid'], rows: mine.lost.slice(0, 8).map((r) => [{ pid: r.pid, t: r.name }, r.org ? game.world.orgs.get(r.org)?.club.city : 'Nobody, he did not sign', r.org ? money(r.bonus, { short: false }) : '', money(r.mine, { short: false })]) });
    parts.push({ head: ['The biggest bonuses', 'Pos', 'Age', 'From', 'Bonus'], rows: res.top.slice(0, 8).map((r) => [{ pid: r.pid, t: `${r.name} (${game.world.orgs.get(r.org)?.club.city})` }, r.pos, String(r.age), countryOf({ country: r.country }), money(r.bonus, { short: false })]) });
    message({ cat: 'club', important: true, stop: game.settings?.stops?.important, title: 'Signing day: the international class', parts });
  }
}
