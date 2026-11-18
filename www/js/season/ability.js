// Hidden ability and development (Phase 6, stage 1).
//
// Every player has a current ability (CA) and a potential ability (PA), both 1 to 200 and never shown.
// CA is not stored: it is worked out from the attributes by value() (a grade of 50 is CA 100, 45 is
// about 75, 70 is 200). PA is set once, when the player first exists, and is a ceiling: whether he
// reaches it depends on age, playing time, how hard he works, coaching and injuries. Some players are
// busts (they stall far below it) and some are late bloomers (they get there at 28).
//
// Development runs in small steps: a tick at the end of each month from April to August
// (developMonth, a tenth of a year's development each) and the rest after the World Series
// (developAll, half a year's). Each step changes p.r (what the engine plays and the screens show) and the
// present grades in p.grades (what value() reads) by the same amounts, so the two never drift apart.
//
// Underneath every attribute there is a hidden fraction (p.fx). A step adds to the fraction and only the
// whole points show, so a player can be improving for months before any figure moves, and a flat-looking
// player is not necessarily standing still.
//
// What sets the pace: his age and position (ageing.js), his hidden professionalism and ambition and his
// home life (personality.js), playing time, coaching, and the league's talent budget (budget.js), which
// settles once a winter and keeps the league's depth from drifting.
import { growthMult } from './facilities.js';
import { growthScale, declineScale } from './analytics.js';
import { coachEffect, mindHelp, ensureStaff } from './coaching.js';
import { Rng } from '../core/rng.js';
import { game } from '../state.js';
import { value } from './value.js';
import { extraFor } from './finance.js';
import { isPitcher, seasons } from '../data/world.js';
import { hidden } from './hidden.js';
import { onsetOf, ageProfile } from './ageing.js';
import { lifeMult, lifeTick } from './personality.js';
import { dayNo } from './calendar.js';

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

export const caOf = (p) => clamp(Math.round(100 + 5 * (value(p) - 50)), 1, 200);
/** The grade-scale value that a CA corresponds to. */
export const vOfCa = (ca) => 50 + (ca - 100) / 5;

// ---------- setting potential ----------

// the typical age at each level, to tell whether a player is ahead of his age group
const LEVEL_AGE = { R: 19, A: 21.5, 'A+': 22.5, AA: 24, AAA: 26, MLB: 28 };
// how much a player of this age is expected to improve before he peaks, in value points
const GAIN = { 18: 10, 19: 9, 20: 8, 21: 6.5, 22: 5, 23: 3.8, 24: 2.8, 25: 2, 26: 1.3, 27: 0.8, 28: 0.4 };
const gainAt = (age) => GAIN[clamp(Math.round(age), 18, 28)] ?? (age < 18 ? 10 : 0.1);
const spreadAt = (age) => (age <= 20 ? 4.2 : age <= 22 ? 3.4 : age <= 24 ? 2.6 : age <= 26 ? 1.8 : age <= 28 ? 1.1 : 0.6);

/**
 * Fix a player's hidden potential, and the traits that decide how he gets there. Done once, when a
 * game starts (and for each new player who joins later). The same game seed gives the same players.
 */
export function assignPA(p, rng = new Rng(`pa-${game.manager}-${game.orgId}-${p.id}`)) {
  if (p.fixedPa) { p.pa = p.fixedPa; p.tr = 0; p.ag = -1; return p; } // a hand-made player: his ceiling is set
  const v = value(p);
  const age = p.age ?? 27;
  const future = value(p, { future: true }) - v;
  // the scouts' own projection in the data counts for half; the age curve for the other half
  let gain = (0.5 * gainAt(age) + 0.5 * clamp(future, 0, 12)) * TUNE.gain;
  // young for the level means a higher ceiling
  if (age < 26) gain += clamp(LEVEL_AGE[p.level] - age, -3, 4) * 0.9;
  const peak = v + Math.max(0, gain) + rng.normal(0, spreadAt(age));
  p.pa = clamp(Math.round(100 + 5 * (Math.max(v, peak) - 50)), caOf(p), 200);
  // busts and late bloomers are decided now and never shown
  const bust = age <= 22 ? 0.17 : age <= 24 ? 0.12 : age <= 26 ? 0.06 : 0;
  const late = age <= 25 ? 0.07 : 0;
  const roll = rng.next();
  p.tr = gain > 2 && roll < bust ? 'b' : gain > 2 && roll > 1 - late ? 'l' : 0;
  // how early or late he ages: shifts the start of decline by a few years either side
  p.ag = Math.round(clamp(rng.normal(isPitcher(p) ? -0.5 : 0, 2), -5, 5) * 10) / 10;
  return p;
}

/** Give every player in the world a potential. Called when a new game starts. */
export function initAbility(players = game.world.list) {
  for (const p of players) if (p.pa == null) assignPA(p);
  // the league as it begins: the budget keeps it near this shape (budget.js)
  game.census = quantilesOf(players.filter((p) => !p.retired).map(caOf));
}
const quantilesOf = (cas) => {
  const s = cas.slice().sort((a, b) => a - b);
  return Array.from({ length: 101 }, (_, i) => s[Math.min(s.length - 1, Math.round((i / 100) * (s.length - 1)))]);
};

// ---------- how an attribute moves ----------

// weights: how far each attribute moves for a given change in overall value, growing and declining
const GROW_BAT = { contact: 1.0, power: 0.95, eye: 0.7, avoidK: 0.9, gap: 0.7, speed: 0.55, steal: 0.35, instincts: 0.5, range: 0.5, hands: 0.45, arm: 0.35, vsfb: 0.5, vsbr: 0.6, sit: 0.5, antic: 0.45, posn: 0.5 };
const DECL_BAT = { contact: 0.8, power: 1.15, eye: 0.85, avoidK: 0.7, gap: 1.0, speed: 0.75, steal: 0.55, instincts: 0.3, range: 1.0, hands: 0.6, arm: 0.55, vsfb: 0.7, vsbr: 0.3, sit: 0.1, antic: 0.2, posn: 0.1 };
const GROW_PIT = { stuff: 1.2, movement: 1.05, control: 0.7, velocity: 0.9, stamina: 1.0, cmd: 1.0, dec: 0.5, psel: 0.6, recov: 0.3, dura: 0.3, fpos: 0.3 };
// a pitcher who loses velocity learns to place what he has: his control holds up or even improves
const DECL_PIT = { stuff: 0.9, movement: 0.65, control: 0.4, velocity: 0.7, stamina: 0.55, cmd: 0.2, dec: 0.9, psel: -0.2, recov: 1.0, dura: 0.9, fpos: 0.5 };
export const BAT_GRADE = { contact: 'Contact', power: 'Power', eye: 'Eye', avoidK: 'Avoid K', speed: 'Speed', steal: 'Stealing', instincts: 'Instincts', arm: 'Arm' };
export const PIT_GRADE = { stuff: 'Stuff', movement: 'Movement', control: 'Control', velocity: 'Velocity', stamina: 'Stamina' };

// Every player grows in his own way: one carries his power, another his contact or his arm. A hidden shape, the same
// for the same player, tilts where his growth goes, and the scouts' projection for each tool tilts it further. Without
// it every young player grew evenly, so once the real players had aged out nobody in the league had a 70 power or a
// 65 contact tool. The overall amount of growth is unchanged: applyChange still moves value by the same total.
const SHAPES = new WeakMap();
export function shapeOf(p) {
  const pit = isPitcher(p);
  let base = SHAPES.get(p);
  if (!base) {
    const rng = new Rng(`shape-${p.id}`);
    base = {};
    for (const k of Object.keys(pit ? GROW_PIT : GROW_BAT)) base[k] = Math.exp(rng.normal(0, 0.4));
    SHAPES.set(p, base);
  }
  // the projection is read fresh each time from the grades as they stand, so a reloaded game grows the same way
  const s = { ...base };
  for (const [k, g] of Object.entries(pit ? PIT_GRADE : BAT_GRADE)) { const e = p.grades?.[g]; if (e && e[1] > e[0]) s[k] *= 1 + Math.min(1, (e[1] - e[0]) / 15); }
  return s;
}
const withShape = (bias, shape) => { const out = { ...shape }; for (const k in bias || {}) out[k] = (out[k] ?? 1) * bias[k]; return out; };

/** Change one attribute by a whole number of points, in p.r and in the matching present grade. */
function bump(p, k, d) {
  if (!d || p.r?.[k] == null) return;
  const before = p.r[k];
  // a fastball fades with age but a major leaguer never has none: velocity bottoms out well above the scale's floor
  p.r[k] = clamp(before + d, k === 'velocity' ? 32 : 20, 80);
  const real = p.r[k] - before;
  if (!real) return;
  const shift = (g) => { const e = p.grades?.[g]; if (e) e[0] = clamp(e[0] + real, 20, 80); };
  if (isPitcher(p)) { if (PIT_GRADE[k]) shift(PIT_GRADE[k]); } else if (BAT_GRADE[k]) shift(BAT_GRADE[k]);
  // fielding is graded as one figure: range and hands each carry half of it
  if (!isPitcher(p) && (k === 'range' || k === 'hands')) { const e = p.grades?.Fielding; if (e) e[0] = clamp(e[0] + real / 2, 20, 80); }
}

/**
 * Add x points to an attribute's hidden fraction and return the whole points that come out. The fraction
 * starts anywhere between -0.5 and +0.5 (the same for the same player) so players do not all tick over
 * on the same month, and nothing is ever lost: the running total is exact.
 */
function carry(p, k, x) {
  const fx = (p.fx ||= {});
  if (fx[k] == null) fx[k] = new Rng(`fx-${p.id}-${k}`).next() - 0.5;
  const t = fx[k] + x;
  const d = Math.trunc(t);
  fx[k] = t - d;
  return d;
}

/** Move a player's value by about dv points, spread over his attributes. Returns the value actually moved. */
export function applyChange(p, dv, rng, events = {}, bias = null) {
  const pit = isPitcher(p);
  const table = pit ? (dv >= 0 ? GROW_PIT : DECL_PIT) : dv >= 0 ? GROW_BAT : DECL_BAT;
  const mag = Math.abs(dv);
  // first pass on the fractional amounts, to see how far value moves, then scale to hit dv
  const keys = Object.keys(table).filter((k) => p.r?.[k] != null);
  // the sign of a weight carries the direction: DECL_PIT.control is negative, so a falling pitcher gains control
  const raw = Object.fromEntries(keys.map((k) => [k, (dv >= 0 ? 1 : -1) * mag * table[k] * (bias?.[k] ?? 1)]));
  const v0 = value(p);
  const trial = { ...p, grades: JSON.parse(JSON.stringify(p.grades)), r: { ...p.r } };
  const trialBump = (k, d) => {
    const e = trial.grades;
    const g = pit ? PIT_GRADE[k] : BAT_GRADE[k];
    if (g && e[g]) e[g][0] = clamp(e[g][0] + d, 20, 80);
    if (!pit && (k === 'range' || k === 'hands') && e.Fielding) e.Fielding[0] = clamp(e.Fielding[0] + d / 2, 20, 80);
  };
  for (const k of keys) trialBump(k, raw[k]);
  const moved = value(trial) - v0;
  const scale = Math.abs(moved) > 0.05 && Math.sign(moved) === Math.sign(dv) ? clamp(dv / moved, 0.4, 2.5) : 1;
  for (const k of keys) bump(p, k, carry(p, k, raw[k] * scale));
  if (p.pitchGrades) {
    const d = carry(p, 'pg', (raw.stuff || 0) * scale * 0.8);
    for (const e of Object.values(p.pitchGrades)) e[0] = clamp(e[0] + d, 20, 80);
  }
  // the future grade never sits below the present one
  for (const e of Object.values(p.grades || {})) if (e[1] < e[0]) e[1] = e[0];
  return value(p) - v0;
}

// ---------- the steps ----------

const RATE = { 18: 0.38, 19: 0.36, 20: 0.34, 21: 0.32, 22: 0.30, 23: 0.27, 24: 0.24, 25: 0.21, 26: 0.18, 27: 0.15, 28: 0.12, 29: 0.10 };
const rateAt = (age) => RATE[clamp(Math.round(age), 18, 29)] ?? (age < 18 ? 0.4 : 0.06);
/** A month's share of a year's development, and what is left for the winter (September, then the offseason). */
export const MONTH_SHARE = 0.1, WINTER_SHARE = 0.5;
/** The dials, in one place so tools/sim-development.js can try other settings. */
export const TUNE = { month: MONTH_SHARE, winter: WINTER_SHARE, growth: 1.2, gain: 0.9 };

/** The coaching and development an organisation gives: 1 to 20 for each coach, and a level for the minors. */
export function staffFor(orgId) {
  const S = game.staff?.[orgId];
  if (S?.coaches) { ensureStaff(orgId); return { hit: S.coaches.hit.rating, pit: S.coaches.pit.rating, fit: S.coaches.fit.rating, dev: S.dev, def: S.coaches.def.rating, mind: S.coaches.mind.rating, dir: S.coaches.dir.rating, med: S.coaches.med.rating }; }
  // computer clubs: coaching follows the budget, with a little noise that is the same every year
  const rank = game.world.mlb.slice().sort((a, b) => (b.payroll2026 || 0) - (a.payroll2026 || 0)).findIndex((c) => c.org === orgId);
  const rng = new Rng(`staff-${orgId}`);
  const base = 15 - (rank / 29) * 8;
  return { hit: clamp(Math.round(base + rng.normal(0, 2)), 4, 18), pit: clamp(Math.round(base + rng.normal(0, 2)), 4, 18),
    fit: clamp(Math.round(base + rng.normal(0, 2)), 4, 18), dev: rank < 10 ? 'high' : rank < 20 ? 'normal' : 'low', def: 10, mind: 10, dir: 10, med: clamp(Math.round(base + rng.normal(0, 2)), 4, 18) };
}

// ---------- your coaches ----------

export const COACH_ROLES = { hit: 'Hitting coach', pit: 'Pitching coach', fit: 'Fitness coach', def: 'Defence coach', mind: 'Mental coach', dir: 'Development director', med: 'Head physician' };
export const DEV_LEVELS = { low: { label: 'Low', cost: 1e6 }, normal: { label: 'Normal', cost: 3e6 }, high: { label: 'High', cost: 6e6 } };
export const coachWage = (rating) => Math.round((0.3e6 + rating * 0.09e6) / 5e4) * 5e4;
let coachSeq = 0;
const FIRSTS = ['Dave', 'Mike', 'Tom', 'Ray', 'Jim', 'Carl', 'Luis', 'Pat', 'Hector', 'Walt', 'Gene', 'Rick', 'Tony', 'Sam', 'Ed', 'Bill', 'Manny', 'Doug'];
const LASTS = ['Hollis', 'Brandt', 'Kowal', 'Reyes', 'Dunne', 'Marsh', 'Okafor', 'Lindgren', 'Pruitt', 'Salas', 'Tierney', 'Vance', 'Whitlock', 'Yoder', 'Cardoza', 'Grimes', 'Haddad', 'Ibarra'];

/** A coach looking for work: a rating from 3 to 19, a wage that follows it, and the traits that set how he works. */
export function makeCoach(role, rng, rating = null) {
  const r = rating ?? clamp(Math.round(rng.normal(10, 3.5)), 3, 19);
  const t = (sd = 2.5) => clamp(Math.round(r + rng.normal(0, sd)), 1, 20);
  const c = { id: `c${++coachSeq}-${rng.int(0, 99999)}`, role, name: `${rng.pick(FIRSTS)} ${rng.pick(LASTS)}`, rating: r, wage: coachWage(r),
    youth: t(), vets: t(), motiv: t(), style: rng.weighted({ old: 0.4, modern: 0.35, players: 0.25 }), age: 38 + rng.int(0, 26) };
  const specs = { hit: ['contact', 'power', 'eye'], pit: ['stuff', 'command', 'stamina'], def: ['glove', 'range', 'arm'] }[role];
  if (specs) c.spec = rng.pick(specs);
  return c;
}

/** Start your staff: three average coaches and a normal development level, and a pool of others. */
export function initStaff(orgId = game.orgId) {
  const rng = new Rng(`coaches-${game.manager}-${orgId}`);
  game.staff ||= {};
  game.staff[orgId] = { coaches: Object.fromEntries(Object.keys(COACH_ROLES).map((r) => [r, makeCoach(r, rng, 10 + rng.int(-1, 1))])), dev: 'normal' };
  refreshCoachPool(rng);
}

/** Each winter a new set of coaches is out of work. */
export function refreshCoachPool(rng = new Rng(`pool-${game.year}-${game.manager}`)) {
  game.coachPool = Object.keys(COACH_ROLES).flatMap((role) => Array.from({ length: 6 }, () => makeCoach(role, rng)));
}

/** What your staff costs a year, and what the owner allows for it. */
export function staffCost(orgId = game.orgId) {
  const S = game.staff?.[orgId];
  if (!S?.coaches) return 0;
  ensureStaff(orgId);
  return Object.values(S.coaches).reduce((a, c) => a + c.wage, 0) + DEV_LEVELS[S.dev].cost;
}
export function staffBudget(orgId = game.orgId) {
  const rank = game.world.mlb.slice().sort((a, b) => (b.payroll2026 || 0) - (a.payroll2026 || 0)).findIndex((c) => c.org === orgId);
  return Math.round((11e6 + (1 - rank / 29) * 6e6) / 5e5) * 5e5 + extraFor(orgId, 'staff');
}

/** Hire a coach from the pool in place of the one you have. Returns words, or an error string starting with "No". */
export function hireCoach(id) {
  const S = game.staff[game.orgId];
  const c = game.coachPool.find((x) => x.id === id);
  if (!c) return 'No such coach.';
  const old = S.coaches[c.role];
  const cost = staffCost() - old.wage + c.wage;
  if (cost > staffBudget()) return `No: that would take the staff to ${(cost / 1e6).toFixed(1)}M against a budget of ${(staffBudget() / 1e6).toFixed(1)}M.`;
  S.coaches[c.role] = c;
  game.coachPool = game.coachPool.filter((x) => x !== c);
  if (!old.interim) game.coachPool.push(old);
  return `${c.name} is your new ${COACH_ROLES[c.role].toLowerCase()}, replacing ${old.name}.`;
}

export function setDevLevel(level) {
  const S = game.staff[game.orgId];
  const cost = staffCost() - DEV_LEVELS[S.dev].cost + DEV_LEVELS[level].cost;
  if (cost > staffBudget()) return `No: that would take the staff to ${(cost / 1e6).toFixed(1)}M against a budget of ${(staffBudget() / 1e6).toFixed(1)}M.`;
  S.dev = level;
  return `The minor league development level is now ${DEV_LEVELS[level].label.toLowerCase()}.`;
}

const DEV = { low: 0.88, normal: 1, high: 1.12 };

const FULL = (p) => (isPitcher(p) ? (p.role === 'Starter' ? 400 : 170) : 450);

/**
 * Playing time, 0 to 1: a full-time player is 1. For a season still under way, `progress` is how much of
 * it has gone, and the figure leans towards a regular's 0.7 until there is enough to judge by.
 */
function usage(p, year, progress = 1) {
  let raw = 0;
  for (const s of seasons(p)) if (s.season === year) raw += isPitcher(p) ? (s.outs || 0) : (s.pa || 0);
  const full = FULL(p);
  if (progress >= 1) return raw / full;
  const k = 0.12 * full;
  return (raw + 0.7 * k) / (progress * full + k);
}

/**
 * One step of one player's development. `year` is the season in question. `share` is the part of a year's
 * development this step carries (1 = all of it). Returns { dv, event } where event is a short code for a
 * rare thing that happened to him (for the news), or null.
 */
export function developPlayer(p, year, rng, o = {}) {
  const share = o.share ?? 1;
  const winter = o.winter ?? share >= 0.5;
  const age = p.age ?? 27;
  const v = value(p);
  const peakV = vOfCa(p.pa ?? caOf(p));
  const staff = staffFor(p.orgId);
  const pit = isPitcher(p);
  const ce = coachEffect(p);
  const coach = (p.level === 'MLB' ? 0.93 + 0.012 * (pit ? staff.pit : staff.hit) : DEV[staff.dev] ?? 1) * growthMult(p.orgId, p.level === 'MLB') * growthScale(p.orgId) * ce.grow;
  const u = usage(p, year, o.progress ?? 1);
  if (winter) p._u = u;
  const time = 0.78 + 0.42 * clamp(u || 0.7, 0, 1);
  const hid = hidden(p);
  // determination and work rate are what he shows; professionalism and ambition are what he is
  const work = 1 + ((p.r?.det ?? 50) - 50 + ((p.r?.work ?? 50) - 50)) / 400 + (hid.professionalism - 50) / 300 + (hid.ambition - 50) / 400;
  const sd = Math.sqrt(share);
  let event = null;
  let dv;
  const onset = onsetOf(p);
  if (age < onset) {
    let rate = rateAt(age) * TUNE.growth;
    if (pit && age >= 23) rate *= 1.35;
    if (p.tr === 'b') rate *= 0.3;
    else if (p.tr === 'l') rate *= age < 23 ? 0.5 : age <= 29 ? 1.6 : 1;
    const year_dv = Math.max(0, peakV - v) * rate * time * coach * work * lifeMult(p);
    dv = year_dv * share + rng.normal(0, age < 25 ? 1 : 0.5) * sd;
    if (dv > 0) dv = Math.min(dv, Math.max(0, peakV + 2 - v));
  } else {
    // the legs go first, and a player who is unfit or does not look after himself goes faster
    const fit = (1.08 - 0.012 * staff.fit) * declineScale(p.orgId) * ce.decl;
    const care = 1 + (50 - hid.professionalism) / 250 + (50 - (p.r?.fit ?? 50)) / 300;
    dv = (-(0.3 + 0.32 * (age - onset)) * ageProfile(p).st * (pit ? 0.6 : 1) * fit * care) * share + rng.normal(0, 0.4) * sd;
  }
  // rare events: remembered, not routine. The chances are for a whole year, so a step carries its share.
  const r = rng.next() / share;
  if (pit && r < 0.0045 + (age >= 33 ? 0.004 : 0)) { event = 'velocity'; dv -= 1.5; p.pa = Math.max(caOf(p) - 5, (p.pa ?? 100) - 12); bump(p, 'velocity', -rng.int(3, 6)); bump(p, 'stuff', -rng.int(3, 6)); }
  else if (pit && age >= 21 && r < 0.0070) { event = 'yips'; bump(p, 'control', -rng.int(8, 14)); p.yips = 1; }
  else if (age >= 25 && age <= 29 && r < 0.0140) { event = 'late'; p.pa = clamp((p.pa ?? 100) + rng.int(12, 25), 1, 200); dv += 1.5; }
  else if (age >= 22 && age <= 30 && r < 0.0240) { event = 'breakout'; dv += 2; }
  else if (age >= 24 && r < 0.0280) { event = 'collapse'; dv -= 2.5; p.pa = Math.max(caOf(p), (p.pa ?? 100) - 10); }
  if (event) p.ev = event;
  if (winter) {
    // a pitcher who lost his control partly gets it back the year after
    if (p.yips === 1 && event !== 'yips') { bump(p, 'control', rng.int(3, 6) + mindHelp(p)); p.yips = 0; }
    // a long injury costs some of the ceiling and, for the arm, some velocity
    if ((p.hurt || 0) >= 120) {
      p.pa = Math.max(caOf(p), (p.pa ?? 100) - rng.int(4, 14));
      if (pit && p.hurtKind === 'surgery') bump(p, 'velocity', -rng.int(1, 3));
      p.hurtLong = true;
    }
    p.hurt = 0; p.hurtKind = undefined;
    drift(p, rng);
  }
  const moved = applyChange(p, dv, rng, {}, dv >= 0 ? withShape(ce.bias, shapeOf(p)) : null);
  p.dvYear = (p.dvYear || 0) + moved;
  // never above the ceiling (a little noise allowed) and the ceiling never below what he is
  const ca = caOf(p);
  if (ca > (p.pa ?? ca)) p.pa = Math.min(200, ca);
  return { dv: moved, event };
}

/**
 * Character moves slowly: young players mature and get more professional, ambition fades after thirty, and
 * a player's teamwork and consistency grow with years in the game. A point at a time, once a year.
 */
function drift(p, rng) {
  const r = p.r;
  if (!r || r.prof == null) return;
  const age = p.age ?? 27;
  const step = (k, mean) => { const d = Math.round(mean + rng.normal(0, 0.6)); if (d) r[k] = clamp(r[k] + d, 20, 80); };
  if (age < 26) { step('prof', 0.7); step('cons', 0.6); step('adapt', 0.4); step('team', 0.3); }
  else if (age <= 31) { step('prof', 0.1); step('cons', 0.2); step('team', 0.15); }
  else { step('amb', -0.5); step('cons', 0.1); }
  if (age >= 30) step('big', 0.1);
}

/** The end of a month in season: a tenth of a year's development for everyone. Returns the events for the news. */
export function developMonth(date = game.date) {
  if (!TUNE.month) return [];
  const S = game.season;
  const progress = clamp((dayNo(date) - S.start) / Math.max(1, S.end - S.start), 0.05, 1);
  const rng = new Rng(`devmonth-${S.year}-${dayNo(date)}-${game.manager}-${game.orgId}`);
  const events = [];
  for (const p of game.world.list) {
    if (p.retired) continue;
    const before = caOf(p);
    const { event } = developPlayer(p, S.year, new Rng(`${dayNo(date)}-${p.id}-${rng.int(0, 1e6)}`), { share: TUNE.month, winter: false, progress });
    if (event) events.push({ p, event, before, after: caOf(p) });
  }
  lifeTick();
  return events;
}

/** After the World Series: the rest of the year's development. Returns the events for the news. */
export function developAll(year) {
  const events = [];
  const rng = new Rng(`develop-${year}-${game.manager}-${game.orgId}`);
  for (const p of game.world.list) {
    if (p.retired) continue;
    const before = caOf(p);
    const { event } = developPlayer(p, year, new Rng(`${year}-${p.id}-${rng.int(0, 1e6)}`), { share: TUNE.winter, winter: true });
    if (event) events.push({ p, event, before, after: caOf(p) });
  }
  lifeTick();
  return events;
}

/** Spring training: last year's figures become the ones the arrows are measured from, and the year's tally starts again. */
export function startOfYear() {
  for (const p of game.world.list) {
    p.dvYear = 0; delete p.ev; delete p.bud; delete p.hurtLong;
    if (p.orgId === game.orgId || game.shortlist?.has(p.id)) p.r0 = { ...p.r }; else delete p.r0;
  }
}

/** Once the winter's development and the league budget are done: the year's change for each player, and for yours, why. */
export function finishYear() {
  for (const p of game.world.list) {
    if (p.retired) continue;
    p.dvLast = Math.round((p.dvYear || 0) * 10) / 10;
    if (p.orgId === game.orgId || game.shortlist?.has(p.id)) p.dvWhy = reasonsFor(p); else delete p.dvWhy;
  }
}

/** The one or two things that most explain how a player's year went. Codes; devnews.js has the words. */
function reasonsFor(p) {
  const dv = p.dvYear || 0, age = p.age ?? 27, hid = hidden(p);
  const out = [];
  if (p.ev) out.push(p.ev);
  if (dv >= 1.2) {
    if (p.bud?.d > 0.5) out.push(`b:${p.bud.why}`);
    if (age <= 23) out.push('young');
    if ((p._u ?? 0) >= 0.85) out.push('playing');
    if (hid.professionalism >= 60) out.push('work');
    const S = staffFor(p.orgId);
    if (p.level === 'MLB' ? (p.kind === 'pit' ? S.pit : S.hit) >= 13 : S.dev === 'high') out.push('coach');
  } else if (dv <= -1.2) {
    if (p.hurtLong) out.push('injury');
    if (age >= onsetOf(p)) out.push('age');
    if (p.bud?.d < -0.5) out.push(`b:${p.bud.why}`);
    if (p._u != null && p._u < 0.45) out.push('usage');
    if (hid.professionalism < 42) out.push('effort');
  }
  return [...new Set(out)].slice(0, 2);
}

/** A word for how a player changed over the year, from the change in value points. */
export function changeWords(dv) {
  if (dv >= 3) return 'a big step forward';
  if (dv >= 1.2) return 'better';
  if (dv > -1.2) return 'much the same';
  if (dv > -3) return 'a little worse';
  return 'a lot worse';
}
