// Probability model. Every function takes 20-80 grades (converted to z = (grade - 50) / 10)
// and returns probabilities. All tuning constants live in C so calibration can adjust them in one place.

export const C = {
  // chance the pitch ends up in the strike zone, by count [balls][strikes]
  zone: [
    [0.495, 0.445, 0.335],
    [0.545, 0.475, 0.385],
    [0.595, 0.525, 0.435],
    [0.675, 0.615, 0.545],
  ],
  // batter swing rates at pitches in the zone and out of it, by count
  zoneSwing: [
    [0.50, 0.70, 0.86],
    [0.62, 0.74, 0.87],
    [0.62, 0.76, 0.88],
    [0.14, 0.72, 0.90],
  ],
  chase: [
    [0.21, 0.33, 0.42],
    [0.26, 0.34, 0.44],
    [0.26, 0.36, 0.46],
    [0.04, 0.32, 0.48],
  ],
  zoneContact: 0.907,
  chaseContact: 0.668,
  foulShareZone: 0.50,
  foulShareChase: 0.61,
  calledStrikeOutside: 0.055, // borderline pitches out of the zone called strikes
  ballCalledInZone: 0.10,    // borderline pitches in the zone called balls
  hbpPerOutsidePitch: 0.0062,
  wildPitchPerPitch: 0.0032,

  // batted balls: ground ball, line drive, fly ball, pop up
  bb: { GB: 0.43, LD: 0.21, FB: 0.26, PU: 0.10 },
  hitRate: { GB: 0.250, LD: 0.690, FB: 0.135, PU: 0.018 },
  hrOnFB: 0.145,
  hrOnLD: 0.018,
  errorPerBIP: 0.012,

  // running
  stealAttemptPerPitch: 0.021,
  stealSuccess: 0.74,
  dpOnGB: 0.42,

  // pitcher fatigue
  starterLimitBase: 75,  // pitch count where a 50-stamina starter starts to tire
  relieverLimitBase: 24,
  fatiguePerPitch: 1 / 18, // z lost per pitch beyond the limit
  maxFatigue: 2.2,
  timesThroughBonus: 0.12, // batter z bonus per time through the order after the second
  around: 0.6, // how far the strike zone shrinks per unit of fear when the pitcher can work around a hitter

  // how strongly grades move outcomes; tuned so the spread of players matches MLB
  batterScale: 0.8, // set against real 2024-26 players (was 0.6 with generated leagues)
  pitcherScale: 0.9,
};

export const z = (g) => ((g ?? 50) - 50) / 10;

// The best hitters in the real data reach about 65 contact and 72 power, and the model is set against them. A
// player who develops beyond the best real ones gains half as much from each point past that, so a 78 is a
// generational hitter rather than a .400 hitter with seventy home runs.
export const KNEE = { contact: 68, power: 72, eye: 74, avoidK: 74 };
export const zk = (g, knee) => { const v = z(g), k = (knee - 50) / 10; return v > k ? k + (v - k) * 0.5 : v; };
const logit = (p) => Math.log(p / (1 - p));
const sig = (x) => 1 / (1 + Math.exp(-x));
/** Shift a probability on the log-odds scale. */
export const shift = (p, dx) => sig(logit(Math.min(0.999, Math.max(0.001, p))) + dx);

/** Platoon adjustment to batter z: same hand hurts, opposite hand helps. */
export function platoon(bats, throws) {
  if (bats === 'S') return 0.05;
  return bats === throws ? -0.14 : 0.14;
}

/**
 * Effective matchup for one plate appearance. Batter and pitcher are engine players (ratings in .r).
 * fatigue is z subtracted from the pitcher's stuff, movement and control.
 */
export function matchup(batter, pitcher, { fatigue = 0, tto = 1, park = 1, lev = 1, catcher = null, strikes = 0, third = false, outs = 0, fx = null, hitF = 1 } = {}) {
  const b = batter.r, p = pitcher.r;
  // the platoon edge, larger or smaller for each hitter; composure tells in the tight spots late on
  const pl = platoon(batter.bats, pitcher.throws) * (b.plat ?? 1) + Math.max(0, tto - 2) * C.timesThroughBonus;
  const tight = lev >= 1.8 ? 0.08 : 0;
  const bc = tight * z(b.comp), pc = tight * z(p.comp);
  const B = C.batterScale, P = C.pitcherScale;
  // what the batter does against this pitcher's mix, and with a run to drive in or two strikes against him
  const ars = arsenal(pitcher);
  const vs = ars.fb * z(b.vsfb) + ars.br * z(b.vsbr) + ars.off * 0.5 * (z(b.vsfb) + z(b.vsbr));
  const sit = (third && outs < 2 ? 0.07 : 0) * z(b.sit);
  const sit2 = strikes === 2 ? 0.06 * z(b.sit) : 0;
  const hp = z(catcher?.r.hpit);
  const m = {
    contact: B * zk(b.contact, KNEE.contact) + pl + bc + 0.10 * vs + sit,
    power: B * zk(b.power, KNEE.power) + pl + bc + 0.08 * vs,
    gap: z(b.gap ?? b.power),
    eye: B * zk(b.eye, KNEE.eye),
    avoidK: B * zk(b.avoidK, KNEE.avoidK) + pl * 0.5 + sit2,
    bgb: z(b.gb),
    pull: z(b.pull),
    speed: z(b.speed),
    stuff: P * z(p.stuff) - fatigue + pc,
    movement: P * z(p.movement) - fatigue,
    control: P * z(p.control) - fatigue * 1.2 + 0.04 * hp,
    cmd: z(p.cmd) - fatigue * 0.5,
    dec: z(p.dec) - fatigue * 0.5,
    seq: 0.6 * z(p.psel) + 0.4 * z(catcher?.r.gcall),
    hp,
    pgb: z(p.pgb),
    park,
    hitF,
  };
  // club style (season/style.js): d is the direction of the dial, q how well it works (fit times familiarity, may be negative)
  const sp = fx?.pit, so = fx?.off;
  if (sp?.d > 0) { m.stuff += 0.40 * sp.q; m.control -= 0.10 * sp.q; m.pgb -= 0.25 * sp.q; }
  else if (sp?.d < 0) { m.pgb += 1.0 * sp.q; m.stuff -= 0.07 * sp.q; m.control += 0.12 * sp.q; }
  if (so?.d > 0) { m.power += 0.12 * so.q; m.contact -= 0.06 * so.q; m.avoidK -= 0.10 * so.q; }
  else if (so?.d < 0) { m.contact += 0.30 * so.q; m.avoidK += 0.25 * so.q; m.power -= 0.10 * so.q; }
  m.sdef = fx?.def?.d ? fx.def : null;
  // how much a pitcher fears this hitter: nothing for most, a lot for the few who can hurt him with one swing
  m.fear = Math.max(0, 0.6 * B * zk(b.power, KNEE.power) + 0.4 * B * zk(b.contact, KNEE.contact) - 0.6);
  m.hand = batter.bats === 'S' ? 'opp' : batter.bats === pitcher.throws ? 'same' : 'opp';
  return m;
}

// ---------- the pitch ----------

// How each pitch changes the ball in play: a sinker or a splitter is beaten into the ground, a high four-seamer
// is hit in the air. Measured against the pitcher's own mix, so his groundball rating still sets his overall rate.
const PITCH_GB = { Sinker: 0.7, Splitter: 0.45, Changeup: 0.25, Cutter: 0.15, Curveball: 0.05, Slider: -0.05, Sweeper: -0.15, 'Four-seam': -0.4 };
const FAST = /four|sinker|cutter|fastball/i, OFF = /change|split|circle|screw/i;
const kind = (n) => (FAST.test(n) ? 'fb' : OFF.test(n) ? 'off' : 'br');
const USE = { fb: 0.52, br: 0.32, off: 0.16 };

/** A pitcher's mix, worked out once per match copy: each pitch's share, grade, and the averages the edges are measured from. */
export function mixOf(pitcher) {
  if (pitcher._mix) return pitcher._mix;
  const src = pitcher.pitches && Object.keys(pitcher.pitches).length ? pitcher.pitches : { 'Four-seam': 50, Slider: 50, Changeup: 50 };
  const names = Object.keys(src);
  const by = { fb: [], br: [], off: [] };
  for (const n of names) by[kind(n)].push(n);
  const kinds = Object.keys(by).filter((k) => by[k].length);
  const tot = kinds.reduce((a, k) => a + USE[k], 0);
  const share = {};
  for (const k of kinds) { const w = by[k].map((_, i) => (i === 0 ? 1.6 : 1)); const sw = w.reduce((a, x) => a + x, 0); by[k].forEach((n, i) => { share[n] = (USE[k] / tot) * (w[i] / sw); }); }
  const grade = Object.fromEntries(names.map((n) => [n, typeof src[n] === 'number' ? src[n] : src[n]?.[0] ?? 50]));
  const mean = names.reduce((a, n) => a + share[n] * grade[n], 0);
  const gb = names.reduce((a, n) => a + share[n] * (PITCH_GB[n] ?? 0), 0);
  return (pitcher._mix = { names, share, grade, mean, gb, kind: Object.fromEntries(names.map((n) => [n, kind(n)])) });
}

/** Which pitch comes next: his mix, moved by the count (fastballs when he must throw a strike, his best pitch to finish a hitter) and by how good each pitch is. */
export function choosePitch(rng, pitcher, balls, strikes) {
  const mx = mixOf(pitcher);
  const behind = balls >= 2 && balls > strikes, finish = strikes === 2;
  const w = {};
  for (const n of mx.names) {
    const edge = (mx.grade[n] - mx.mean) / 10;
    let x = mx.share[n] * Math.exp((finish ? 0.5 : 0.25) * edge);
    if (behind && mx.kind[n] === 'fb') x *= 1.8;
    if (finish && mx.kind[n] !== 'fb') x *= 1.5;
    w[n] = x;
  }
  return rng.weighted(w);
}

/** The matchup for one pitch: a pitch better than his average is harder to hit, and the right pitch for the hitter's side works better. */
export function withPitch(m, pitcher, name) {
  const mx = mixOf(pitcher);
  const edge = ((mx.grade[name] ?? mx.mean) - mx.mean) / 10;
  const k = mx.kind[name] ?? 'fb';
  // a breaking ball is best against a hitter on the same side, a changeup or splitter against the other
  const side = m.hand === 'same' ? (k === 'br' ? 0.12 : k === 'off' ? -0.12 : 0) : (k === 'off' ? 0.12 : k === 'br' ? -0.06 : 0);
  return { ...m, stuff: m.stuff + 0.35 * edge + side, movement: m.movement + 0.2 * edge, pgb: m.pgb + 1.2 * ((PITCH_GB[name] ?? 0) - mx.gb) };
}

/** The share of a pitcher's pitches that are fastballs, breaking balls and offspeed, from his mix (same weights the game uses to pick a pitch). */
export function arsenal(pitcher) {
  if (pitcher._ars) return pitcher._ars;
  const mx = mixOf(pitcher), out = { fb: 0, br: 0, off: 0 };
  for (const n of mx.names) out[mx.kind[n]] += mx.share[n];
  return (pitcher._ars = out);
}

/** One pitch. Returns 'ball' | 'called' | 'swinging' | 'foul' | 'inplay' | 'hbp', plus whether it was in the zone. */
export function pitchOutcome(rng, m, balls, strikes, { framing = 0, approach = 0, zone = 0, around = 0 } = {}) {
  // around: how free the pitcher is to work around a dangerous hitter (first base open, nothing to lose by a walk)
  const inZone = rng.chance(shift(C.zone[balls][strikes], 0.18 * m.control + 0.04 * approach - C.around * (m.fear || 0) * around));
  if (!inZone && rng.chance(C.hbpPerOutsidePitch * Math.exp(-0.25 * m.control))) return { result: 'hbp', inZone };

  const swingP = inZone
    ? shift(C.zoneSwing[balls][strikes], 0.06 * m.eye + 0.15 * approach)
    : shift(C.chase[balls][strikes], -0.36 * m.eye + 0.15 * m.stuff + 0.10 * approach + 0.08 * m.seq);

  if (!rng.chance(swingP)) {
    if (inZone) return { result: rng.chance(shift(C.ballCalledInZone, -0.2 * framing - zone)) ? 'ball' : 'called', inZone };
    return { result: rng.chance(shift(C.calledStrikeOutside, 0.25 * framing + zone)) ? 'called' : 'ball', inZone };
  }

  const contactP = shift(inZone ? C.zoneContact : C.chaseContact,
    0.22 * m.contact + 0.20 * m.avoidK - 0.34 * m.stuff - 0.06 * m.movement - 0.10 * m.dec - 0.04 * m.seq);
  if (!rng.chance(contactP)) return { result: 'swinging', inZone };

  // weak contact from chased pitches is fouled off more often
  const foulP = inZone ? C.foulShareZone : C.foulShareChase;
  if (rng.chance(strikes === 2 ? foulP + 0.09 : foulP)) return { result: 'foul', inZone };
  return { result: 'inplay', inZone };
}

/**
 * Ball in play. Returns { type, dir, hit: null|'1B'|'2B'|'3B'|'HR', error: bool, fielderPos }.
 * def: function(pos) => fielder's engine player (for range, hands, arm).
 */
export function battedBall(rng, m, batterHand, inZone, def) {
  // batted-ball type
  const gbShift = 0.045 * m.bgb + 0.045 * m.pgb - 0.02 * m.power;
  const w = {
    GB: C.bb.GB + gbShift,
    LD: C.bb.LD + 0.012 * m.contact,
    FB: C.bb.FB - gbShift * 0.7 + 0.015 * m.power,
    PU: C.bb.PU - gbShift * 0.3 - 0.01 * m.contact + (inZone ? 0 : 0.03),
  };
  const type = rng.weighted(w);

  // direction: pull side depends on handedness
  const pullP = 0.40 + 0.06 * m.pull;
  const r = rng.next();
  const side = r < pullP ? 'pull' : r < pullP + 0.33 ? 'centre' : 'oppo';
  const pullLeft = batterHand !== 'L'; // right-handed batters pull to left field
  const dir = side === 'centre' ? 'C' : (side === 'pull') === pullLeft ? 'L' : 'R';

  const fielderPos = pickFielder(rng, type, dir);
  const f = def(fielderPos);
  // a pitcher fielding a ball relies on his fielding position as much as his legs
  const range = fielderPos === 'P' ? 0.5 * z(f?.r.range) + 0.5 * z(f?.r.fpos) : z(f?.r.range), hands = z(f?.r.hands);
  const read = 0.06 * z(f?.r.antic) + 0.05 * z(f?.r.posn);

  if (type === 'FB' && rng.chance(hrCap(C.hrOnFB * m.park * Math.exp(0.42 * m.power - 0.30 * m.movement - 0.10 * m.cmd + (side === 'pull' ? 0.25 : -0.15))))) {
    return { type, dir, hit: 'HR', error: false, fielderPos };
  }
  if (type === 'LD' && rng.chance(C.hrOnLD * m.park * Math.exp(0.40 * m.power))) {
    return { type, dir, hit: 'HR', error: false, fielderPos };
  }

  const qual = 0.12 * m.contact + 0.08 * m.power - 0.12 * m.movement - 0.07 * m.cmd;
  // the defensive set: tight infield takes away grounders and gives up flies, a deep outfield the reverse
  const sd = m.sdef;
  const set = !sd ? 0 : sd.d > 0 ? (type === 'GB' ? -0.22 : type === 'PU' ? 0 : 0.10) * sd.q : (type === 'GB' ? 0.12 : type === 'PU' ? 0 : -0.17) * sd.q;
  const hitP = shift(C.hitRate[type], qual + (type === 'GB' ? 0.10 * m.speed : 0) - 0.16 * range - read + set + (m.hitF && m.hitF !== 1 ? Math.log(m.hitF) * 1.5 : 0));
  if (rng.chance(hitP)) {
    return { type, dir, hit: extraBases(rng, type, m, dir, sd && sd.d < 0 ? -0.20 * sd.q : 0), error: false, fielderPos };
  }
  // errors: sure hands, an accurate arm and a mind on the job
  if (type !== 'PU' && rng.chance(C.errorPerBIP * Math.exp(-0.25 * hands - 0.12 * z(f?.r.acc) - 0.06 * z(f?.r.conc)))) {
    return { type, dir, hit: null, error: true, fielderPos };
  }
  return { type, dir, hit: null, error: false, fielderPos };
}

/** Past about one fly ball in four, more power adds less: the best real hitters top out near a third. */
const hrCap = (p) => (p <= 0.25 ? p : 0.25 + (p - 0.25) * 0.45);

function extraBases(rng, type, m, dir, deep = 0) {
  const gap = 0.15 * m.power + 0.25 * (m.gap ?? m.power) + deep;
  if (type === 'GB') return rng.chance(shift(0.066, gap)) ? '2B' : '1B';
  if (type === 'PU') return '1B';
  if (type === 'LD') {
    const t = rng.next();
    const p2 = shift(0.255, gap), p3 = shift(0.024, 0.4 * m.speed);
    return t < p3 ? '3B' : t < p3 + p2 ? '2B' : '1B';
  }
  // fly ball that falls in
  const p3 = shift(dir === 'C' || dir === 'R' ? 0.07 : 0.04, 0.45 * m.speed);
  const p2 = shift(0.395, gap);
  const t = rng.next();
  return t < p3 ? '3B' : t < p3 + p2 ? '2B' : '1B';
}

function pickFielder(rng, type, dir) {
  if (type === 'GB') {
    const options = { L: ['3B', '3B', 'SS'], C: ['SS', '2B', 'P'], R: ['2B', '1B', '1B'] }[dir];
    return rng.pick(options);
  }
  if (type === 'PU') return rng.pick({ L: ['3B', 'SS', 'LF'], C: ['SS', '2B', 'C'], R: ['1B', '2B', 'RF'] }[dir]);
  return { L: 'LF', C: 'CF', R: 'RF' }[dir];
}
