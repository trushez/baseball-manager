// Scouting and the fog (Phase 6, stage 2).
//
// You employ up to six scouts. Each has a judging ability and a judging potential, 1 to 20, which you never
// see: you see his wage and a reputation that is only roughly right. When a scout looks at a player he files
// a report: the attributes as he judged them (wrong by a random amount each time, less wrong the better he
// is), a verdict on the player now in words, and a words-only view of his potential. Nobody's potential is
// ever shown as a number, and the report goes out of date as the player develops.
//
// In fog of war you see exact figures for your own organisation and for everyone in the majors, and nothing
// about attributes for anyone else until a scout has looked. Without it, every present attribute is shown, but
// potential still only comes from reports.
//
// Computer clubs have a scouting quality and the same error model, so they misjudge players too: see believed().
import { Rng } from '../core/rng.js';
import { game, orgState } from '../state.js';
import { value } from './value.js';
import { extraFor } from './finance.js';
import { caOf, BAT_GRADE, PIT_GRADE } from './ability.js';
import { isPitcher, fullName } from '../data/world.js';
import { dayNo } from './calendar.js';
import { message } from './inbox.js';
import { proneness } from './injuries.js';
import { to20 } from '../data/attributes.js';
import { discover, findsTick } from './finds.js';
import { DESTS, destOf } from './geo.js';
import { errorScale } from './analytics.js';

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
export const SCOUT_MAX = 8;
const MONTH = 30;
export const DURATION = { player: 1, search: 30, nation: 365 };

// ---------- the scouts ----------

const FIRSTS = ['Hal', 'Gus', 'Arturo', 'Lenny', 'Ozzie', 'Dutch', 'Rafael', 'Bernie', 'Cal', 'Vic', 'Nestor', 'Hank', 'Marv', 'Otis', 'Luis', 'Stan', 'Felix', 'Roy', 'Chuck', 'Emilio', 'Walt', 'Jorge'];
const LASTS = ['Pruitt', 'Mancini', 'Duffy', 'Quintero', 'Slater', 'Abernathy', 'Ruiz', 'Kessler', 'Moody', 'Brannigan', 'Ortega', 'Fitch', 'Lowry', 'Santana', 'Teague', 'Varga', 'Hobbs', 'Delgado', 'Crane', 'Nolan', 'Peralta', 'Rowe'];
let scoutSeq = 0;
export const scoutWage = (ja, jp) => Math.round((0.15e6 + (ja + jp) * 0.035e6) / 5e4) * 5e4;

/** A scout looking for work. Both abilities 1 to 20; the reputation is what the trade says, not the truth. */
export function makeScout(rng, ja = null, jp = null) {
  const a = ja ?? clamp(Math.round(rng.normal(10, 4)), 1, 20);
  const b = jp ?? clamp(Math.round(rng.normal(10, 4) + (a - 10) * 0.3), 1, 20);
  return {
    id: `s${++scoutSeq}-${rng.int(0, 99999)}`, name: `${rng.pick(FIRSTS)} ${rng.pick(LASTS)}`, ja: a, jp: b,
    wage: scoutWage(a, b), rep: clamp(Math.round((a + b) / 2 + rng.normal(0, 2.2)), 1, 20), assign: null,
  };
}

/** Your scouts: none at first, and a pool of others who are out of work. */
export function initScouts(orgId = game.orgId) {
  const rng = new Rng(`scouts-${game.manager}-${orgId}`);
  game.staff ||= {};
  game.staff[orgId] ||= {};
  game.staff[orgId].scouts = [makeScout(rng, 9, 9)]; // one average scout to start with
  game.staff[orgId].scouts[0].contract = { years: 2, end: game.year + 1 };
  game.knowledge = {};
  game.scoutQueue = [];
  game.scoutLog = [];
  game.finds = null;
  refreshScoutPool(rng);
}

/** Winter: scouts whose contracts have run out are offered a new one (most take it) or go back to the pool. Returns messages. */
export function scoutContractsEnd(rng = new Rng(`scoutrenew-${game.year}-${game.manager}`)) {
  const out = [];
  const mine = myScouts();
  for (const s of [...mine]) {
    if (!s.contract) { s.contract = { years: 1, end: game.year }; continue; }
    if (s.contract.end >= game.year) continue;
    const stay = rng.chance(0.55 + (pullOf() - s.rep) * 0.03);
    if (stay) { s.wage = scoutWage(s.ja, s.jp); s.contract = { years: 2, end: game.year + 1 }; out.push(`${s.name} has signed a new two-year contract at ${(s.wage / 1e6).toFixed(2)}M.`); }
    else { mine.splice(mine.indexOf(s), 1); s.assign = null; delete s.contract; game.scoutPool.push(s); out.push(`${s.name} has left for another club when his contract ran out.`); }
  }
  return out;
}

export function refreshScoutPool(rng = new Rng(`scoutpool-${game.year}-${game.manager}`)) {
  game.scoutPool = Array.from({ length: 16 }, () => makeScout(rng));
}

export const myScouts = () => game.staff?.[game.orgId]?.scouts || [];
export const scoutBudget = (orgId = game.orgId) => {
  const rank = game.world.mlb.slice().sort((a, b) => (b.payroll2026 || 0) - (a.payroll2026 || 0)).findIndex((c) => c.org === orgId);
  return Math.round((2.5e6 + (1 - rank / 29) * 3.5e6) / 5e4) * 5e4 + extraFor(orgId, 'scouting');
};
export const scoutCost = (orgId = game.orgId) => (game.staff?.[orgId]?.scouts || []).reduce((a, s) => a + s.wage, 0);

/** How much of a club's pull a scout needs: the bigger clubs get the better scouts. 6 for the poorest club to 16 for the richest. */
export const pullOf = (orgId = game.orgId) => {
  const rank = game.world.mlb.slice().sort((a, b) => (b.payroll2026 || 0) - (a.payroll2026 || 0)).findIndex((c) => c.org === orgId);
  return 6 + (1 - rank / 29) * 10;
};
/** Money still owed on a contract if he goes now: his wage for each season after this one. */
export const owedOn = (s) => Math.max(0, (s.contract?.end ?? game.year) - game.year) * s.wage;

export function hireScout(id, years = 2) {
  const mine = myScouts();
  const s = (game.scoutPool || []).find((x) => x.id === id);
  if (!s) return 'No such scout.';
  if (mine.length >= SCOUT_MAX) return `No: you already employ ${SCOUT_MAX} scouts.`;
  if (scoutCost() + s.wage > scoutBudget()) return `No: that would take scouting to ${(( scoutCost() + s.wage) / 1e6).toFixed(2)}M against a budget of ${(scoutBudget() / 1e6).toFixed(2)}M.`;
  if (s.rep > pullOf() + 4) return `${s.name} turns you down: he wants to work for a bigger club.`;
  game.scoutPool = game.scoutPool.filter((x) => x !== s);
  s.contract = { years, end: game.year + years - 1 };
  mine.push(s);
  const q = drainQueue(); // a player waiting for a free scout goes to the new man
  return `${s.name} is now one of your scouts, on ${years === 1 ? 'a one-year deal' : `a ${years}-year deal`}.${q ? ` ${q}` : ''}`;
}

export function releaseScout(id) {
  const mine = myScouts();
  const i = mine.findIndex((x) => x.id === id);
  if (i < 0) return 'No such scout.';
  const [s] = mine.splice(i, 1);
  s.assign = null;
  const owed = owedOn(s);
  if (owed > 0) for (let y = game.year + 1; y <= s.contract.end; y++) (game.world.orgs.get(game.orgId).club.otherMoney ||= []).push({ name: s.name, note: 'scout released', years: { [y]: s.wage } });
  delete s.contract;
  game.scoutPool.push(s);
  return `${s.name} has left.${owed > 0 ? ` You still owe him ${(owed / 1e6).toFixed(2)}M over the rest of his contract.` : ''}`;
}

// ---------- how wrong a scout is ----------

/** Standard deviation of his error on each attribute, in 20 to 80 points: about 4 for a 1, under 1 for a 20. */
export const sdAttr = (ja) => 4.2 - (3.4 * (clamp(ja, 1, 20) - 1)) / 19;
/** And on potential, in ability points (1 to 200): wider, and it is what lets a poor scout back a bust. */
export const sdPot = (jp) => 28 - (22 * (clamp(jp, 1, 20) - 1)) / 19;

const nonRating = (k) => k.startsWith('_') || k === 'plat';
function noisy(r, sd, rng) {
  if (!r) return r;
  const out = {};
  for (const [k, v] of Object.entries(r)) out[k] = typeof v === 'number' && !nonRating(k) ? clamp(Math.round(v + rng.normal(0, sd)), 20, 80) : v;
  return out;
}

/** The ratings someone with this judging ability would believe a player has. */
export function judge(p, ja, rng, orgId = game.orgId) {
  const sd = sdAttr(ja) * errorScale(orgId); // the club's analytics narrow every judgement a little
  return {
    r: noisy(p.r, sd, rng),
    rPitch: p.rPitch ? noisy(p.rPitch, sd, rng) : undefined,
    pitchGrades: p.pitchGrades ? Object.fromEntries(Object.entries(p.pitchGrades).map(([k, e]) => [k, [clamp(Math.round(e[0] + rng.normal(0, sd)), 20, 80), e[1]]])) : undefined,
  };
}

const viewCache = new WeakMap();
/** A player as a report or a belief shows him: his own record with the judged ratings laid over it. */
export function viewOf(p, rep) {
  const hit = viewCache.get(rep);
  if (hit && hit.p === p) return hit.v;
  const v = Object.create(p);
  v.r = rep.r; v.rPitch = rep.rPitch; if (rep.pitchGrades) v.pitchGrades = rep.pitchGrades;
  // the present grades value() reads move by the same amount the judged ratings differ from the real ones
  const g = JSON.parse(JSON.stringify(p.grades || {}));
  const map = isPitcher(p) ? PIT_GRADE : BAT_GRADE;
  for (const [k, name] of Object.entries(map)) {
    if (g[name] && rep.r?.[k] != null && p.r?.[k] != null) g[name][0] = clamp(g[name][0] + rep.r[k] - p.r[k], 20, 80);
  }
  if (!isPitcher(p) && g.Fielding && rep.r?.range != null) g.Fielding[0] = clamp(g.Fielding[0] + ((rep.r.range - p.r.range) + (rep.r.hands - p.r.hands)) / 2, 20, 80);
  v.grades = g;
  viewCache.set(rep, { p, v });
  return v;
}

// ---------- words ----------

const POT = [
  [60, 'is unlikely ever to play in the major leagues'],
  [80, 'could become a fringe major leaguer'],
  [95, 'has the potential to become a useful major leaguer'],
  [110, 'has the potential to become a solid major league regular'],
  [125, 'has the potential to become a very good player'],
  [145, 'has the potential to become an All-Star'],
  [165, 'has the potential to become one of the best players in the game'],
  [Infinity, 'could become a superstar'],
];
export const potentialWords = (pa) => { const x = Number(pa); return (POT.find(([max]) => x < max) || POT[Number.isFinite(x) ? POT.length - 1 : 3])[1]; };

/** What the club already has: the median value of your active players of his kind. */
function benchmark(p) {
  const st = orgState();
  const vs = game.world.orgs.get(game.orgId).players.filter((x) => st.active.has(x.id) && isPitcher(x) === isPitcher(p)).map((x) => value(x)).sort((a, b) => a - b);
  return vs.length ? vs[Math.floor(vs.length / 2)] : 50;
}
export function verdictWords(v, b) {
  const d = v - b;
  return d >= 6 ? 'would be an outstanding signing' : d >= 3 ? 'would be a good signing' : d >= -1 ? 'would be a useful signing' : d >= -5 ? 'would only be a depth signing' : 'is not good enough for your club';
}

/** The sentence a report gives about a player. */
const OWN = { 'would be an outstanding signing': 'is one of the best players you have', 'would be a good signing': 'is a good player for your club', 'would be a useful signing': 'is a useful player for your club', 'would only be a depth signing': 'is depth for your club' };
export function reportText(p, rep) {
  const verdict = p.orgId === game.orgId ? OWN[rep.verdict] || rep.verdict : rep.verdict;
  return `${fullName(p)} ${verdict}. He ${rep.pot}${rep.near ? ', and is close to it now' : ''}.`;
}

// ---------- looking at a player ----------

/** A scout looks at a player. Returns the report; the caller files it. */
export function look(scout, p, rng = new Rng(`look-${scout.id}-${p.id}-${dayNo(game.date)}-${game.knowledge ? Object.keys(game.knowledge).length : 0}`)) {
  const j = judge(p, scout.ja, rng);
  const rep = { ...j, date: dayNo(game.date), scoutId: scout.id, scout: scout.name, age: p.age, ja: scout.ja, jp: scout.jp };
  const view = viewOf(p, rep);
  rep.verdict = verdictWords(value(view), benchmark(p));
  rep.pj = clamp(Math.round((p.pa ?? caOf(p)) + rng.normal(0, sdPot(scout.jp))), 1, 200); // his guess at the ceiling; never shown
  rep.pj = Math.max(rep.pj, caOf(view));
  rep.pot = potentialWords(rep.pj);
  rep.near = rep.pj - caOf(view) < 8;
  return rep;
}

function file(p, rep) {
  (game.knowledge ||= {})[p.id] = rep;
  (game.scoutLog ||= []).push(p.id);
  if (game.scoutLog.length > 200) game.scoutLog.shift();
}

// ---------- what you can see ----------

export const fogOn = () => !!game.settings?.fog;

/**
 * Anyone who has played in the majors, or was ever on your own roster, is known to everybody: his attributes show in full
 * wherever he is now. The fog is for the minor leaguers and amateurs nobody has watched.
 */
export function known(p) {
  if (p.wasMine) return true;
  if ((p.contract?.serviceTime ?? 0) > 0) return true;
  return [...(p.hist?.bat || []), ...(p.hist?.pit || [])].some((r) => r[1] === 'MLB');
}

/**
 * What the screens may show of this player's attributes: { mode: 'exact', v: p }, { mode: 'report', v, rep },
 * or { mode: 'partial', v: p } (see `shown`). Report views are used whenever there is a report and he is not otherwise exact.
 */
export function seen(p) {
  if (p.orgId === game.orgId && game.orgId) p.wasMine = true; // once yours, always known
  if (!fogOn() || p.orgId === game.orgId || p.level === 'MLB' || known(p)) return { mode: 'exact', v: p };
  const rep = game.knowledge?.[p.id];
  return rep ? { mode: 'report', v: viewOf(p, rep), rep } : { mode: 'partial', v: p };
}

/**
 * In the fog an unscouted player is half known: about half of his attributes can be seen, and which half is settled
 * by his id, so it is random from one player to the next but does not change when you look again.
 */
export function shown(p, k) {
  let x = 2166136261;
  for (const c of `${p.id}|${k}`) { x ^= c.charCodeAt(0); x = Math.imul(x, 16777619); }
  x ^= x >>> 15; x = Math.imul(x, 2246822519); x ^= x >>> 13;
  return (x >>> 0) % 100 < 50;
}

/** The report on a player, if any. */
export const reportOn = (p) => game.knowledge?.[p.id] || null;

const STAFF = { id: 'staff', name: 'Your coaching staff', ja: 19, jp: 13 };
/**
 * Your own players need no scout: the coaches see them every day. An instant report, as good as a very good scout's,
 * redrawn once a month so it keeps up with him. It is not filed, so it never shows up in the scouts' list.
 */
export function ownReport(p) {
  const month = `${game.date.getFullYear()}-${game.date.getMonth()}`;
  if (p._own?.month === month) return p._own.rep;
  const rep = look(STAFF, p, new Rng(`own-${p.id}-${month}`));
  Object.defineProperty(p, '_own', { value: { month, rep }, enumerable: false, configurable: true, writable: true });
  return rep;
}
/** The report on him: the filed one, or for your own players the coaches' instant one when nothing newer is filed. */
export function reportFor(p) {
  const rep = reportOn(p);
  if (p.orgId !== game.orgId || !game.orgId) return rep;
  return rep && dayNo(game.date) - rep.date <= 30 ? rep : ownReport(p);
}

/** How old a report is, in words. */
export function ageWords(rep) {
  const days = dayNo(game.date) - rep.date;
  return days < 2 ? 'today' : days < 14 ? `${days} days ago` : days < 60 ? `${Math.round(days / 7)} weeks ago` : days < 700 ? `${Math.round(days / 30)} months ago` : 'over a year ago';
}
export const stale = (rep) => dayNo(game.date) - rep.date > 365;

// ---------- assignments ----------

export const CODES = { DOM: 'Dominican Republic', VEN: 'Venezuela', CUB: 'Cuba', MEX: 'Mexico', PUR: 'Puerto Rico', PAN: 'Panama', COL: 'Colombia', JPN: 'Japan', USA: 'USA', CAN: 'Canada', KOR: 'South Korea', NIC: 'Nicaragua', TWN: 'Taiwan' };
export const countryOf = (p) => { const c = CODES[p.country] || p.country || 'USA'; return c === 'Republic of Korea' ? 'South Korea' : c; };

/** The places you can send a scout: seven countries, and the regions that cover the rest. */
export const nations = () => DESTS.slice();

export function assignmentText(a) {
  if (!a) return 'Idle';
  if (a.type === 'player') { const p = game.world.players.get(a.target); return `Watching ${p ? fullName(p) : 'a player'}`; }
  if (a.type === 'nation') return `Covering ${a.country}`;
  const s = a.spec;
  const who = s.kind === 'bat' ? 'bat' : s.kind === 'pit' ? 'pitcher' : 'player';
  const hand = s.hand === 'L' ? 'left-handed ' : s.hand === 'R' ? 'right-handed ' : '';
  return `Searching: ${s.young ? 'young ' : ''}${hand}${who}${s.country ? ` in ${s.country}` : ''}`;
}
export const daysLeft = (a) => Math.max(0, a.end - dayNo(game.date));

/** Candidates for a search or a sweep: people you cannot see already, who match what you asked for. */
function candidates(spec, skipIds = new Set()) {
  const now = dayNo(game.date);
  const amateurs = [...game.world.players.values()].filter((p) => p.amateur);
  return [...game.world.list, ...amateurs].filter((p) => {
    if (p.retired || p.orgId === game.orgId || p.level === 'MLB' || skipIds.has(p.id)) return false;
    const rep = game.knowledge?.[p.id];
    if (rep && now - rep.date < 365) return false;
    if (spec.unsigned && (p.orgId || !p.amateur)) return false;
    if (spec.country && destOf(countryOf(p)) !== spec.country) return false;
    if (spec.kind === 'bat' && isPitcher(p)) return false;
    if (spec.kind === 'pit' && !isPitcher(p)) return false;
    if (spec.hand && (isPitcher(p) ? p.throws : p.bats) !== spec.hand) return false;
    if (spec.young && (p.age ?? 30) > 22) return false;
    return true;
  });
}

/** The ones a scout would recommend: those he thinks have the best ceilings, with his own noise. */
function recommend(scout, pool, n, rng) {
  return pool.map((p) => ({ p, s: (p.pa ?? caOf(p)) + rng.normal(0, sdPot(scout.jp)) })).sort((a, b) => b.s - a.s).slice(0, n).map((x) => x.p);
}

function freeScout() { return myScouts().find((s) => !s.assign); }

export function assign(scout, a) {
  const now = dayNo(game.date);
  scout.assign = { ...a, start: now, end: now + DURATION[a.type], next: now + MONTH };
  return `${scout.name}: ${assignmentText(scout.assign)}.`;
}
export function cancelAssignment(scout) { scout.assign = null; const q = drainQueue(); return q ? `${scout.name} has stopped. ${q}` : `${scout.name} is free.`; }

/** Is a scout on him now (or is he waiting in the queue)? The words for the report tab, or null. */
export function scoutingStatus(p) {
  const s = myScouts().find((x) => x.assign?.type === 'player' && x.assign.target === p.id);
  if (s) { const d = daysLeft(s.assign); return `${s.name} is watching ${fullName(p)}. His report is due ${d <= 1 ? 'within a day' : `in about ${d} days`}.`; }
  const q = game.scoutQueue?.indexOf(p.id);
  return q >= 0 ? `${fullName(p)} is in your scouts' queue (number ${q + 1}). They will get to him when one is free.` : null;
}

/** Ask for a look at one player: the first free scout takes him, otherwise he waits in the queue. */
export function requestScouting(p) {
  if (!myScouts().length) return 'You have no scouts. Hire one on the Scouting screen.';
  if (myScouts().some((s) => s.assign?.type === 'player' && s.assign.target === p.id) || game.scoutQueue?.includes(p.id)) return `Your scouts are already on ${fullName(p)}.`;
  const s = freeScout();
  if (s) return assign(s, { type: 'player', target: p.id });
  (game.scoutQueue ||= []).push(p.id);
  return `All your scouts are busy: ${fullName(p)} is in the queue.`;
}

function summary(p, rep) {
  const top = (isPitcher(p) ? ['stuff', 'movement', 'control', 'velocity'] : ['contact', 'power', 'eye', 'speed']).map((k) => `${k} ${viewAttr(p, rep, k)}`).join(', ');
  return `${reportText(p, rep)} (${top})`;
}
const viewAttr = (p, rep, k) => (rep.r?.[k] == null ? '-' : to20(rep.r[k], k));

/** Once a day: assignments that have run their course file their reports, nation sweeps file monthly. */
export function scoutTick(d = dayNo(game.date)) {
  const rng = new Rng(`scouttick-${d}-${game.manager}`);
  for (const s of myScouts()) {
    const a = s.assign;
    if (!a) continue;
    if (a.type === 'nation') {
      a.wk ??= a.start + 7;
      let brought = 0;
      while (a.wk <= d && a.wk <= a.end) { brought += discover(s, a.country, rng).length; a.wk += 7; }
      if (brought) (game.finds.heard ||= {})[s.id] = (game.finds.heard[s.id] || 0) + brought;
      while (a.next <= d && a.next <= a.end) {
        const pool = candidates({ country: a.country, unsigned: true });
        const picks = recommend(s, pool, 2, rng);
        for (const p of picks) file(p, look(s, p, rng));
        const heard = game.finds?.heard?.[s.id] || 0;
        if (game.finds?.heard) game.finds.heard[s.id] = 0;
        const mine = (game.finds?.list || []).filter((x) => x.scoutId === s.id).length;
        const tail = heard ? `\n\nOn the ground he has also come across ${heard} young player${heard === 1 ? '' : 's'} you could sign; ${mine} ${mine === 1 ? 'is' : 'are'} on his list now. Open his page under Scouting to see them ranked.` : '';
        if (picks.length || heard) message({ cat: 'club', player: picks[0]?.id, title: `Scouting: ${s.name} in ${a.country}`, body: `${s.name}'s report from ${a.country}:\n\n${picks.map((p) => summary(p, game.knowledge[p.id])).join('\n\n')}${tail}` });
        a.next += MONTH;
      }
      if (d >= a.end) { s.assign = null; message({ cat: 'club', title: `${s.name} has finished in ${a.country}`, body: `${s.name} has covered ${a.country} for the season and is free for a new assignment.` }); }
    } else if (d >= a.end) {
      if (a.type === 'player') {
        const p = game.world.players.get(a.target);
        if (p && !p.retired) {
          const rep = look(s, p, rng); file(p, rep);
          message({ cat: 'club', player: p.id, title: `Scouting: ${fullName(p)}`, body: `${s.name} has watched ${fullName(p)}.\n\n${summary(p, rep)}` });
        }
      } else {
        const pool = candidates(a.spec);
        const picks = recommend(s, pool, 3, rng);
        for (const p of picks) file(p, look(s, p, rng));
        message({
          cat: 'club', player: picks[0]?.id, title: `Scouting: ${s.name}'s search is complete`,
          body: picks.length ? `${assignmentText(a)}.\n\n${s.name} recommends:\n\n${picks.map((p) => summary(p, game.knowledge[p.id])).join('\n\n')}` : `${assignmentText(a)}.\n\n${s.name} found nobody he would put his name to. Try a wider search.`,
        });
      }
      s.assign = null;
    }
  }
  findsTick(d);
  drainQueue();
}

/** The players waiting in the queue go to whichever scouts are free, at once. Returns the words for what happened. */
export function drainQueue() {
  const out = [];
  while (game.scoutQueue?.length) {
    const sc = freeScout();
    if (!sc) break;
    const p = game.world.players.get(game.scoutQueue.shift());
    if (p && !p.retired) out.push(assign(sc, { type: 'player', target: p.id }));
  }
  return out.join(' ');
}

// ---------- medicals ----------

/** A medical is reliable: his true state now, and in words how likely he is to be hurt (never the number). */
export function medical(p) {
  const doc = game.staff?.[game.orgId]?.coaches?.med?.rating ?? 10;
  const pr = proneness(p) * Math.exp(new Rng(`med-${p.id}-${game.year}`).normal(0, (20 - doc) * 0.025));
  const risk = pr >= 1.5 ? 'a high risk of injury' : pr >= 1.15 ? 'a slightly higher risk of injury than most' : pr >= 0.85 ? 'an average risk of injury' : 'a low risk of injury';
  const now = p.injury ? `He is injured and will be out for about ${Math.max(0, p.injury.days - (dayNo(game.date) - p.injury.since))} more days.` : 'He is fit.';
  return { text: `${now} The doctors rate him as having ${risk}.`, risk, fit: !p.injury };
}

// ---------- what computer clubs believe ----------

/** A computer club's scouting quality, 8 to 18, from its payroll rank. */
export function clubScouting(orgId) {
  const rank = game.world.mlb.slice().sort((a, b) => (b.payroll2026 || 0) - (a.payroll2026 || 0)).findIndex((c) => c.org === orgId);
  return clamp(Math.round(18 - (Math.max(0, rank) / 29) * 10), 8, 18);
}

/** What a club believes about a player: the real ratings plus noise that is the same all year and differs between clubs. */
export function believed(orgId, p) {
  const rep = judge(p, clubScouting(orgId), new Rng(`belief-${orgId}-${p.id}-${game.year}`), orgId);
  return viewOf(p, rep);
}
