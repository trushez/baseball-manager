// The end of a career and the arrival of new ones. Each winter old and weak players retire, the farm moves up
// to fill the gaps, and new young players join Single-A where the draft (draft.js), the international market
// (amateurs.js) and the scouts' finds (finds.js) have not filled a club. They are drawn from the kind of young
// player the game started with, so the talent in the league holds steady over the years.
import { Rng } from '../core/rng.js';
import { game, autoClub } from '../state.js';
import { LEVELS, isPitcher } from '../data/world.js';
import { freshName } from '../data/generate.js';
import { value } from './value.js';
import { assignPA, caOf } from './ability.js';
import { enrich } from '../data/attributes.js';
import { initCensus } from './budget.js';
import { repertoire } from '../data/repertoire.js';

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const MINORS = ['AAA', 'AA', 'A+', 'A', 'R'];
/** How many the Rookie level holds, by kind. It fills from international signings, not from the intake moulds. */
export const ROOKIE_TARGET = { pit: 12, bat: 13 };

/** The young players the game began with, kept as moulds for new arrivals. */
export function makeIntakePool() {
  const young = game.world.list.filter((p) => p.level === 'A' && (p.age ?? 30) <= 22 && p.r && p.grades);
  return young.slice(0, 600).map((p) => ({
    kind: p.kind, role: p.role, pos: p.pos, age: p.age, bats: p.bats, throws: p.throws, height: p.height, weight: p.weight,
    r: { ...p.r }, grades: JSON.parse(JSON.stringify(p.grades)), pitchGrades: p.pitchGrades ? JSON.parse(JSON.stringify(p.pitchGrades)) : undefined,
    played: p.played ? { ...p.played } : undefined, pitchTypes: p.pitchTypes,
  }));
}

let counter = 0;
/** A new player's id. The counter starts again after a load, so it steps past any id already taken. */
function freshId(year) {
  let id;
  do id = `i${year}-${++counter}`; while (game.world.players.has(id));
  return id;
}
export const PIT_BOOST = 6;
const PIT_BOOST_KEYS = ['stuff', 'movement', 'control', 'velocity'];
/** One new young player from a mould, with a fresh name, small differences and a potential of his own. */
// every full name in the world, kept as players arrive, so a new player never shares a name with anyone already here
const NAMES = new WeakMap();
function takenNames() {
  const w = game.world;
  let t = NAMES.get(w);
  if (!t) { t = new Set([...w.players.values()].map((p) => `${p.first} ${p.last}`)); NAMES.set(w, t); }
  return t;
}

export function newPlayer(tpl, org, year, rng, opt = {}) {
  const jit = (v) => clamp(Math.round(v + rng.normal(0, 2.5)), 20, 80);
  const shift = {};
  const r = {};
  for (const [k, v] of Object.entries(tpl.r)) {
    if (k === '_e' || typeof v !== 'number') { r[k] = v; continue; }
    shift[k] = jit(v) - v;
    r[k] = jit(v);
  }
  // the moulds are the pitchers and hitters the game began with in Single-A, and the pitchers there rate well below the
  // hitters, far more than they do in the majors. Left alone, new arrivals pull the majors towards hitters.
  if (tpl.kind === 'pit' && !opt.noBoost) for (const k of PIT_BOOST_KEYS) if (typeof r[k] === 'number') { shift[k] += clamp(r[k] + PIT_BOOST, 20, 80) - r[k]; r[k] = clamp(r[k] + PIT_BOOST, 20, 80); }
  const grades = JSON.parse(JSON.stringify(tpl.grades));
  const GR = { contact: 'Contact', power: 'Power', eye: 'Eye', avoidK: 'Avoid K', speed: 'Speed', steal: 'Stealing', instincts: 'Instincts', arm: 'Arm', stuff: 'Stuff', movement: 'Movement', control: 'Control', velocity: 'Velocity', stamina: 'Stamina' };
  for (const [k, g] of Object.entries(GR)) if (grades[g] && shift[k] != null && tpl.r[k] != null) { grades[g][0] = clamp(r[k], 20, 80); grades[g][1] = Math.max(grades[g][0], clamp(grades[g][1] + shift[k], 20, 80)); }
  const age = tpl.age;
  const team = `${org.id}-A`;
  const p = {
    id: opt.id ?? freshId(year), ...freshName(rng, takenNames()), bats: tpl.bats, throws: tpl.throws, pos: tpl.pos,
    born: `${year - age}-${String(rng.int(1, 6)).padStart(2, '0')}-${String(rng.int(1, 28)).padStart(2, '0')}`, age, country: 'USA',
    height: tpl.height, weight: tpl.weight, level: 'A', on_40: false, kind: tpl.kind, role: tpl.role, sample: 0, grades, r, team,
    contract: { status: 'minor league', text: 'Minor league contract', serviceTime: 0, options: 3, aav: 0, years: [] },
    hist: {}, played: tpl.played ? { ...tpl.played } : undefined,
  };
  if (tpl.pitchGrades) p.pitchGrades = repertoire(p); // a repertoire of his own, not a copy of the mould's
  p.club = game.world.clubs.get(team);
  p.orgId = org.id;
  p.gen = true;
  delete p.r._e;
  enrich(p);
  assignPA(p, new Rng(`pa-new-${p.id}-${game.manager}`));
  return p;
}

/** Who retires this winter. Age and a weak bat or arm decide it; the very old always go. */
function retires(p, rng) {
  const v = value(p), age = p.age ?? 27;
  if (age >= 43) return true;
  if (p.level === 'MLB' || p.contract?.status === 'signed' || p.contract?.status === 'arbitration') {
    return (age >= 41 && v < 62 && rng.chance(0.6)) || (age >= 38 && v < 54 && rng.chance(0.7)) || (age >= 35 && v < 46 && rng.chance(0.5));
  }
  // minor leaguers and free agents: a weak player who has stopped improving gives up sooner
  return (age >= 34 && v < 47 && rng.chance(0.6)) || (age >= 30 && v < 42 && rng.chance(0.45)) || (age >= 28 && v < 38 && rng.chance(0.3));
}

/** Remove a player from the game's rosters. He stays in world.players so old records still name him. */
export function retire(p) {
  const W = game.world;
  const o = p.orgId && W.orgs.get(p.orgId);
  if (o) {
    o.players.splice(o.players.indexOf(p), 1);
    const st = game.orgStates.get(o.id);
    if (st) { st.level.delete(p.id); st.forty.delete(p.id); st.active.delete(p.id); st.il.delete(p.id); st.dfa.delete(p.id); }
  }
  p.retired = true; p.team = null; p.orgId = null; p.club = null;
  const i = W.list.indexOf(p);
  if (i >= 0) W.list.splice(i, 1);
  game.freeAgents = (game.freeAgents || []).filter((id) => id !== p.id);
}

/** How many of each kind a level should hold, taken from the organisation as it stands. Kept for the whole game. */
export function shape(o) {
  const t = {};
  for (const lv of LEVELS) t[lv] = { pit: 0, bat: 0 };
  for (const p of o.players) if (t[p.level]) t[p.level][isPitcher(p) ? 'pit' : 'bat']++;
  t.R = { ...ROOKIE_TARGET };
  return t;
}

/**
 * The winter shuffle for one organisation: retirements, then each minor league level promotes from the
 * one below to refill, and Single-A takes new arrivals.
 */
export function refill(o, target, year, rng, report) {
  // daily call-ups and send-downs move a player in the club's own state, not in p.level (see K21), so the
  // level a player is really at comes from there
  const ost = game.orgStates.get(o.id);
  const at = (p) => (ost?.level.get(p.id) ?? p.level);
  for (const p of [...o.players]) {
    if (p.level === 'MLB' && game.orgStates.get(o.id)?.forty.has(p.id) && p.contract?.status === 'signed' && (p.age ?? 0) < 39) continue;
    if (retires(p, rng)) { report.retired.push(p); retire(p); }
  }
  // Rookie level players who have outgrown it move up to Single-A
  for (const p of o.players) if (at(p) === 'R' && !p.retired && (p.age ?? 0) >= 20) { p.level = 'A'; p.team = `${o.id}-A`; p.club = game.world.clubs.get(p.team); ost?.level.set(p.id, 'A'); report.moved++; }
  for (let i = 0; i < MINORS.length; i++) {
    const lv = MINORS[i], below = MINORS[i + 1];
    if (lv === 'R') continue; // signings fill it
    for (const kind of ['pit', 'bat']) {
      const have = () => o.players.filter((p) => at(p) === lv && !p.retired && (isPitcher(p) ? 'pit' : 'bat') === kind);
      const arrive = () => {
        const tpls = (game.intakePool || []).filter((t) => t.kind === kind);
        if (!tpls.length) return false;
        const p = newPlayer(rng.pick(tpls), o, year, rng);
        game.world.players.set(p.id, p);
        game.world.list.push(p);
        o.players.push(p);
        game.orgStates.get(o.id)?.level.set(p.id, 'A');
        report.arrived++;
        return true;
      };
      let guard = 0;
      while (have().length < (target[lv]?.[kind] ?? 0) && guard++ < 80) {
        if (below) {
          // the best candidate below: ability plus a bonus for youth (the ones moving fastest)
          const pool = o.players.filter((p) => at(p) === below && !p.retired && (isPitcher(p) ? 'pit' : 'bat') === kind && !(game.orgStates.get(o.id)?.forty.has(p.id)) && (below !== 'R' || (p.age ?? 0) >= 18));
          if (!pool.length) {
            if (lv !== 'A') break;
            arrive(); continue; // nobody coming up from the Rookie level: a new arrival fills the place
          }
          pool.sort((a, b) => (value(b) + (24 - b.age) * 0.8) - (value(a) + (24 - a.age) * 0.8));
          const up = pool[0];
          up.level = lv; up.team = `${o.id}-${lv}`; up.club = game.world.clubs.get(up.team);
          const st = game.orgStates.get(o.id);
          st?.level.set(up.id, lv);
          report.moved++;
        } else arrive();
      }
    }
  }
  // Single-A over its size (promotions from the Rookie level): the weakest go
  for (const kind of ['pit', 'bat']) {
    const have = o.players.filter((p) => at(p) === 'A' && !p.retired && (isPitcher(p) ? 'pit' : 'bat') === kind && !ost?.forty.has(p.id));
    const over = have.length - (target.A?.[kind] ?? 999);
    if (over > 0 && !(o.id === game.orgId && !autoClub())) for (const p of have.sort((a, b) => (value(a) + (24 - (a.age ?? 22)) * 0.8) - (value(b) + (24 - (b.age ?? 22)) * 0.8)).slice(0, over)) { (report.released ||= []).push(p); retire(p); }
  }
}

/** The whole league, after the year's ageing and development. Returns counts and the retired. */
export function winterTurnover(year) {
  const rng = new Rng(`intake-${year}-${game.manager}-${game.orgId}`);
  const report = { retired: [], arrived: 0, moved: 0 };
  for (const o of game.world.orgs.values()) refill(o, (game.targets ||= {})[o.id] ||= shape(o), year, rng, report);
  // free agents nobody wants who have lost it
  for (const id of [...(game.freeAgents || [])]) {
    const p = game.world.players.get(id);
    if (p && retires(p, rng)) { report.retired.push(p); retire(p); }
  }
  return report;
}

/** At the start of a game: the moulds for new arrivals, and the shape of every organisation's pyramid. */
export function initIntake() {
  game.intakePool = makeIntakePool();
  liftMinorPitchers();
  game.targets = {};
  for (const o of game.world.orgs.values()) game.targets[o.id] = shape(o);
}

// The game's pitchers in the minors rate far below its hitters at the same level (the gap is 2.7 points in the majors but
// 4.8 in Triple-A, 6.5 in Double-A, 7.6 in High-A and 9.6 in Single-A), so as they came up to replace retiring pitchers the
// majors slid towards hitters: scoring went from 4.3 to 5.6 runs a game in nine seasons. Bring each level's gap to the majors'.
const LIFT = { AAA: 2, AA: 3.8, 'A+': 4.9, A: 6.9 };
export function liftMinorPitchers() {
  if (game.world.pitLift) return;
  game.world.pitLift = true;
  const GR = { stuff: 'Stuff', movement: 'Movement', control: 'Control', velocity: 'Velocity' };
  for (const p of game.world.list) {
    const d = LIFT[p.level];
    if (!d || p.kind !== 'pit' || !p.r) continue;
    for (const [k, g] of Object.entries(GR)) {
      if (typeof p.r[k] === 'number') p.r[k] = clamp(Math.round(p.r[k] + d), 20, 80);
      if (p.grades?.[g]) { p.grades[g][0] = clamp(Math.round(p.grades[g][0] + d), 20, 80); p.grades[g][1] = Math.max(p.grades[g][0], clamp(Math.round(p.grades[g][1] + d), 20, 80)); }
    }
    if (p.pa != null) p.pa = Math.min(200, Math.round(p.pa + 5 * d));
  }
  initCensus(); // the league budget measures against the league as it now begins
}
