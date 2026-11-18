// Player attributes on CM's 1 to 20 scale.
//
// The engine plays from each player's ratings (p.r, on the scouts' 20 to 80 scale). The figures you see are
// those same ratings graded against the 2026 major leaguers: the middle of the majors is about 11, the best
// in the game 18 to 20, and minor leaguers fall below. So what you see is exactly what the engine plays.
//
// Ratings the real data can't supply are made here, once per player, from his id (the same every game):
// gap power from his doubles and triples, bunting, arm accuracy, turning two, catchers' blocking, framing and
// throwing, how much he gains or loses against same-handed pitching, and the mental and physical attributes.
// Those are invented but sensible: nudged by age, experience, role and what his record says.
//
// Positions: each player has a familiarity with every position (hidden), from the games he has played there
// and the positions he knows. Played away from his best position he fields worse, by an amount never shown.
import { Rng } from '../core/rng.js';

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const r80 = (v) => clamp(Math.round(v), 20, 80);
const isPit = (p) => p.kind === 'pit';

// ---------- the attributes ----------

/** [key in p.r, label, short label]. split: shown as two numbers, against right-handers / left-handers. */
export const ATTRS = {
  batting: [['contact', 'Contact', 'Con', 1], ['power', 'Power', 'Pow', 1], ['gap', 'Gap Power', 'Gap', 1], ['eye', 'Eye', 'Eye', 1], ['avoidK', 'Avoid Strikeouts', 'AvK', 1], ['bunt', 'Bunting', 'Bnt'], ['vsfb', 'Vs Fastballs', 'VFB'], ['vsbr', 'Vs Breaking Balls', 'VBR'], ['sit', 'Situational Hitting', 'Sit']],
  running: [['speed', 'Speed', 'Spd'], ['steal', 'Stealing', 'Stl'], ['instincts', 'Baserunning', 'BsR']],
  fielding: [['range', 'Range', 'Rng'], ['hands', 'Hands', 'Hnd'], ['arm', 'Arm Strength', 'Arm'], ['acc', 'Arm Accuracy', 'Acc'], ['turn', 'Turning Two', 'DP'], ['antic', 'Anticipation', 'Ant'], ['posn', 'Positioning', 'Pos'], ['fpos', 'Fielding Position', 'FPo']],
  catching: [['block', 'Blocking', 'Blk'], ['framing', 'Framing', 'Frm'], ['cthrow', 'Throwing Out Runners', 'Thr'], ['gcall', 'Game Calling', 'Cal'], ['hpit', 'Handling Pitchers', 'HPi']],
  pitching: [['velocity', 'Velocity', 'Vel'], ['stuff', 'Stuff', 'Stf'], ['movement', 'Movement', 'Mov'], ['control', 'Control', 'Ctl'], ['stamina', 'Stamina', 'Sta'], ['hold', 'Holding Runners', 'Hld'], ['cmd', 'Command', 'Cmd'], ['dec', 'Deception', 'Dec'], ['psel', 'Pitch Selection', 'PSl'], ['recov', 'Recovery', 'Rec'], ['dura', 'Durability', 'Dur']],
  mental: [['comp', 'Composure', 'Cmp'], ['conc', 'Concentration', 'Cnc'], ['det', 'Determination', 'Det'], ['work', 'Work Rate', 'Wor'], ['lead', 'Leadership', 'Ldr'], ['temper', 'Temperament', 'Tmp'], ['prof', 'Professionalism', 'Prf'], ['amb', 'Ambition', 'Amb'], ['cons', 'Consistency', 'Csy'], ['big', 'Big Games', 'Big'], ['adapt', 'Adaptability', 'Adp'], ['team', 'Teamwork', 'Tmw']],
  physical: [['str', 'Strength', 'Str'], ['agi', 'Agility', 'Agi'], ['fit', 'Natural Fitness', 'Fit']],
};
export const SPLIT = new Set(ATTRS.batting.filter((a) => a[3]).map((a) => a[0]));
const LABEL = Object.fromEntries(Object.values(ATTRS).flat().map(([k, l, s]) => [k, [l, s]]));
export const attrLabel = (k) => LABEL[k]?.[0] ?? k;
export const attrShort = (k) => LABEL[k]?.[1] ?? k;

/** The attribute groups a player shows, in order. */
export function groupsFor(p) {
  if (isPit(p)) return ['pitching', 'fielding', 'mental', 'physical'];
  if (p.rPitch) return ['batting', 'running', 'pitching', 'fielding', 'mental', 'physical'];
  return p.pos === 'C' || (p.played?.C ?? 0) >= 20 ? ['batting', 'running', 'fielding', 'catching', 'mental', 'physical'] : ['batting', 'running', 'fielding', 'mental', 'physical'];
}

// ---------- making the missing ratings ----------

/** Fill in the ratings the data lacks. Called for every player when the world is built. */
export function enrich(p) {
  const r = (p.r ||= {});
  if (r._e) return p;
  const rng = new Rng(`attrs-${p.id}`);
  const n = (sd) => rng.normal(0, sd);
  const age = p.age ?? 27;
  const svc = p.contract?.serviceTime ?? 0;
  const mlb = p.level === 'MLB';
  if (!isPit(p)) {
    // the data has a real arm only for catchers, and one fielding figure for both range and hands:
    // other arms come from the position he plays (and a little from his range), hands spread round his range
    const main = Object.entries(p.played || {}).sort((a, b) => b[1] - a[1])[0]?.[0] || p.pos;
    if (r.arm === 50 && main !== 'C') r.arm = r80(({ RF: 57, SS: 56, '3B': 55, CF: 53, C: 52, '2B': 47, LF: 46, '1B': 43, DH: 42 }[main] ?? 48) + (r.range - 50) * 0.2 + n(7));
    if (r.hands === r.range) r.hands = r80(r.range + ({ '1B': 4, '2B': 2, SS: 1, CF: -2, LF: -3, RF: -2, DH: -5 }[main] ?? 0) + n(5));
  }
  if (isPit(p)) {
    // stamina from how deep he went per start last season, when he started; a listed starter is never a one-inning arm
    const st = p.stats || {};
    if ((st.gs ?? 0) >= 5 && st.ip) {
      const outs = Math.floor(st.ip) * 3 + Math.round((st.ip % 1) * 10);
      const perStart = Math.min(7, (outs / 3) / Math.max(st.gs, (st.g ?? st.gs) * 0.6 + st.gs * 0.4));
      r.stamina = Math.max(r.stamina ?? 20, r80(28 + (perStart - 3) * 11));
    }
    if (p.role === 'Starter') r.stamina = Math.max(r.stamina ?? 20, 42);
  }
  const fld = (r.range + r.hands + r.arm) / 3 - 50;
  // how good a player he is, for the mental nudges: the better players tend to be the harder workers
  const q = isPit(p) ? ((r.stuff ?? 45) + (r.control ?? 45)) / 2 - 50 : ((r.contact ?? 45) + (r.power ?? 45) + (r.eye ?? 45)) / 3 - 50;

  if (!isPit(p)) {
    // gap power from his doubles and triples per at-bat, held towards the league rate on a small record
    let ab = 0, xb = 0;
    for (const row of p.hist?.bat || []) { ab += row[5]; xb += row[7] + row[8]; }
    const rate = (xb + 0.052 * 200) / (ab + 200);
    r.gap = r80(50 + ((rate - 0.052) / 0.011) * 10 + n(3));
    r.bunt = r80(44 + (r.speed - 50) * 0.35 + (r.contact - 50) * 0.25 - (r.power - 50) * 0.3 + n(8));
    // how much he gains against opposite-handed pitching (and loses against same-handed)
    r.plat = clamp(p.bats === 'S' ? rng.normal(0.4, 0.15) : rng.normal(p.bats === 'L' ? 1.1 : 0.9, 0.35), 0.1, 2);
  }
  r.acc = r80(50 + (r.arm - 50) * 0.3 + (r.hands - 50) * 0.3 + n(8));
  r.turn = r80(50 + (r.hands - 50) * 0.45 + (r.range - 50) * 0.25 + n(8));
  if (!isPit(p) && (p.pos === 'C' || (p.played?.C ?? 0) >= 20)) {
    r.block = r80(50 + fld * 0.4 + n(9));
    r.framing = r80(50 + fld * 0.3 + n(9));
    r.cthrow = r80(r.arm * 0.7 + 15 + n(6));
  } else {
    r.block = r80(30 + n(5)); r.framing = r80(30 + n(5)); r.cthrow = r80(28 + n(5));
  }

  // mental: a sensible spread, nudged by what we know about him
  const vet = clamp(svc, 0, 12);
  const oneClub = (() => { const clubs = new Set((p.hist?.bat || p.hist?.pit || []).filter((x) => x[1] === 'MLB').map((x) => x[2])); return clubs.size === 1 && vet >= 5; })();
  r.lead = r80(44 + vet * 1.1 + (age >= 30 ? 3 : 0) + (oneClub ? 5 : 0) + (mlb ? 2 : -2) + n(8));
  r.det = r80(50 + (mlb ? 3 : 0) + (age >= 32 && mlb ? 3 : 0) + q * 0.4 + n(8));
  r.work = r80(50 + (mlb ? 2 : 0) + q * 0.35 + n(8));
  r.comp = r80(48 + vet * 0.6 + (mlb ? 2 : -1) + q * 0.3 + n(8));
  r.conc = r80(48 + vet * 0.5 + (mlb ? 2 : -1) + q * 0.25 + n(8));
  r.temper = r80(50 + (age >= 30 ? 3 : -1) + n(10));
  // the best major leaguers don't get there without application
  if (mlb && q >= 3) { r.det = Math.max(r.det, 52); r.work = Math.max(r.work, 52); }

  // physical
  const lbs = p.weight || 205;
  r.str = r80(isPit(p) ? 50 + (r.velocity - 50) * 0.4 + (lbs - 210) * 0.25 + n(7) : 50 + (r.power - 50) * 0.5 + (lbs - 205) * 0.3 + n(7));
  r.agi = r80(isPit(p) ? 50 - (lbs - 215) * 0.15 + n(8) : 50 + (r.speed - 50) * 0.5 + (r.range - 50) * 0.3 + n(6));
  // a player who plays every day is fit: games (or innings) last season count
  const last = p.stats || {};
  const busy = isPit(p) ? ((last.ip ?? 60) - 90) * 0.06 : ((last.g ?? 90) - 110) * 0.07;
  r.fit = r80(54 - Math.max(0, age - 30) * 1.0 + (age < 25 ? 2 : 0) + clamp(busy, -4, 5) + n(6));
  if (mlb) r.fit = Math.max(r.fit, 40);
  enrichExtra(p);
  r._e = 1;
  return p;
}

/**
 * The second set of ratings (Phase 6): pitch-type hitting, situational hitting, fielding reads, command,
 * deception, recovery and durability, the catcher's calling, and the character traits. Made once per player
 * from his id and the ratings he already has, centred so the league average is unchanged. Safe to call again:
 * it only fills what is missing (used on old saves).
 */
export function enrichExtra(p) {
  const r = p.r;
  if (!r || r.prof != null) return p;
  const rng = new Rng(`attrs2-${p.id}`);
  const n = (sd) => rng.normal(0, sd);
  const age = p.age ?? 27;
  const vet = clamp(p.contract?.serviceTime ?? 0, 0, 12);
  const g = (k, d = 50) => (r[k] ?? d) - 50;
  // the character traits keep the draws the hidden attributes always used, so nobody changes
  const h = new Rng(`hidden-${p.id}`);
  r.cons = r80(h.normal(50 + (age < 24 ? -4 : age > 30 ? 3 : 0), 10));
  r.big = r80(h.normal(50, 10));
  r.prof = r80(h.normal(50 + (age > 30 ? 3 : 0), 11));
  r.amb = r80(h.normal(52 - (age > 31 ? 4 : 0), 11));
  r.adapt = r80(h.normal(50, 11));
  r.team = r80(50 + g('lead') * 0.3 + n(10));
  if (!isPit(p)) {
    r.vsfb = r80(50.9 + g('power') * 0.35 + g('contact') * 0.1 + n(9));
    r.vsbr = r80(50.5 + g('eye') * 0.3 + g('contact') * 0.2 + n(9));
    r.sit = r80(50 + g('contact') * 0.3 + g('avoidK') * 0.2 + g('eye') * 0.1 + vet * 0.5 - 0.4 + n(8));
    r.antic = r80(50 + g('range') * 0.3 + g('conc') * 0.2 + vet * 0.5 - 1.3 + n(8));
    r.posn = r80(50 + g('conc') * 0.2 + vet * 0.8 - 1.8 + n(8));
    const cat = p.pos === 'C' || (p.played?.C ?? 0) >= 20;
    r.gcall = r80(cat ? 50 + g('conc') * 0.3 + vet * 1.0 - 3 + n(9) : 30 + n(5));
    r.hpit = r80(cat ? 50 + g('lead') * 0.3 + vet * 0.8 - 3 + n(9) : 30 + n(5));
  } else {
    r.cmd = r80(50.4 + g('control') * 0.6 + n(8));
    r.dec = r80(51.1 + g('movement') * 0.3 + g('stuff') * 0.2 - g('velocity') * 0.1 + n(9));
    r.psel = r80(50 + g('stuff') * 0.1 + g('control') * 0.1 + vet * 0.8 - 1.7 + n(8));
    r.recov = r80(49.8 + g('fit') * 0.3 + (age < 27 ? 2 : age > 33 ? -3 : 0) + n(9));
    r.dura = r80(53.8 + g('stamina') * 0.3 + g('fit') * 0.3 + n(9));
    r.fpos = r80(49.4 + g('agi') * 0.3 + n(10));
  }
  return p;
}

// ---------- the 1 to 20 scale ----------

let SCALE = null;

/** Set the scale from the major leaguers of the starting season. Called once when the world is built. */
export function calibrate(players) {
  const keys = Object.values(ATTRS).flat().map((a) => a[0]);
  SCALE = {};
  for (const k of keys) {
    const pit = ATTRS.pitching.some((a) => a[0] === k) || k === 'fpos';
    const bat = [...ATTRS.batting, ...ATTRS.running].some((a) => a[0] === k);
    const field = (ATTRS.fielding.some((a) => a[0] === k) && k !== 'fpos') || ATTRS.catching.some((a) => a[0] === k);
    // pitching against pitchers; batting, running and fielding against position players; the rest against all
    const pool = players.filter((p) => p.level === 'MLB' && p.r?.[k] != null && (pit ? isPit(p) : bat || field ? !isPit(p) : true));
    const catchers = ATTRS.catching.some((a) => a[0] === k);
    const vals = (catchers ? pool.filter((p) => p.pos === 'C') : pool).map((p) => p.r[k]).sort((a, b) => a - b);
    if (!vals.length) { SCALE[k] = [50, 10]; continue; }
    const mid = vals[Math.floor(vals.length / 2)];
    const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
    const sd = Math.sqrt(vals.reduce((a, b) => a + (b - mean) ** 2, 0) / vals.length);
    SCALE[k] = [mid, Math.max(4, sd)];
  }
  // each pitch, against every pitch thrown in the majors
  const pv = players.filter((p) => p.level === 'MLB').flatMap((p) => Object.values(p.pitchGrades || {}).map((x) => x[0])).sort((a, b) => a - b);
  const pm = pv.reduce((a, b) => a + b, 0) / Math.max(1, pv.length);
  SCALE._pitch = [pv[Math.floor(pv.length / 2)] ?? 48, Math.max(4, Math.sqrt(pv.reduce((a, b) => a + (b - pm) ** 2, 0) / Math.max(1, pv.length)))];
}

/** A 20 to 80 rating as a 1 to 20 figure, against the scale for its attribute. */
export function to20(v, k) {
  const [mid, sd] = SCALE?.[k] ?? [50, 10];
  return clamp(Math.round(12.5 + (3.3 * (v - mid)) / sd), 1, 20);
}

/** One attribute, 1 to 20. Split attributes come back as [against right-handers, against left-handers]. */
const PITCH_KEYS = new Set(ATTRS.pitching.map((a) => a[0]));
export function attr(p, k) {
  // a two-way player keeps his pitching ratings apart
  const v = (PITCH_KEYS.has(k) && p.rPitch ? p.rPitch : p.r)?.[k];
  if (v == null) return null;
  if (SPLIT.has(k) && !isPit(p)) {
    // the engine's platoon edge for this hitter, in rating points
    const edge = (0.14 * (p.r.plat ?? 1) * 10) / 0.8 * (k === 'eye' ? 0.4 : k === 'avoidK' ? 0.5 : 1);
    const vsR = p.bats === 'R' ? v - edge : p.bats === 'L' ? v + edge : v + edge * 0.3;
    const vsL = p.bats === 'L' ? v - edge : p.bats === 'R' ? v + edge : v + edge * 0.3;
    return [to20(vsR, k), to20(vsL, k)];
  }
  return to20(v, k);
}

/** The figure for one of his pitches, 1 to 20. */
export const pitch20 = (v) => to20(v, '_pitch');

/** A single figure for an attribute, the split ones averaged (for sorting and short tables). */
export function attrValue(p, k) {
  const a = attr(p, k);
  return Array.isArray(a) ? Math.round((a[0] * 2 + a[1]) / 3) : a;
}

/** Overall defence at his best position, 1 to 20. */
export function defence(p) {
  if (isPit(p)) return null;
  const c = p.pos === 'C';
  const ks = c ? ['block', 'framing', 'cthrow', 'hands'] : ['range', 'hands', 'arm', 'acc'];
  return Math.round(ks.reduce((a, k) => a + attr(p, k), 0) / ks.length);
}

// ---------- positions ----------

const FIELD = ['C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF'];
const LISTED = { OF: ['LF', 'CF', 'RF'], IF: ['2B', '3B', 'SS'], UT: ['2B', '3B', 'SS', 'LF', 'RF'] };
// what knowing one position gives you at another (familiarity, 1 to 20)
const RELATED = {
  SS: { '2B': 15, '3B': 14, '1B': 10, LF: 8, RF: 8, CF: 7 },
  '2B': { SS: 10, '3B': 11, '1B': 11, LF: 9, RF: 8 },
  '3B': { '1B': 13, SS: 9, '2B': 10, LF: 9, RF: 9 },
  '1B': { '3B': 7, LF: 8, RF: 7 },
  CF: { LF: 16, RF: 15, '1B': 7 },
  LF: { RF: 14, CF: 9, '1B': 10 },
  RF: { LF: 15, CF: 9, '1B': 10 },
  C: { '1B': 11, '3B': 7 },
};

/** How well he knows a position, 1 to 20 (hidden). */
export function familiarity(p, pos) {
  if (pos === 'DH') return 20;
  if (isPit(p)) return pos === 'P' ? 20 : 2;
  const played = p.played || {};
  const best = Object.entries(played).sort((a, b) => b[1] - a[1])[0]?.[0];
  const listed = LISTED[p.pos] || [p.pos];
  const g = played[pos] || 0;
  let f = pos === best || listed.includes(pos) || g >= 150 ? 20 : g >= 60 ? 18 : g >= 20 ? 16 : g >= 5 ? 13 : 0;
  if (f < 20) {
    for (const from of FIELD) {
      const known = from === best || listed.includes(from) ? 20 : (played[from] || 0) >= 60 ? 18 : (played[from] || 0) >= 20 ? 16 : 0;
      if (known >= 16) f = Math.max(f, Math.round((RELATED[from]?.[pos] ?? 5) * (known / 20)));
    }
  }
  if (pos === 'C' && f < 13) f = Math.min(f, 2); // nobody catches without having caught
  return clamp(f, 1, 20);
}

/** What playing a position costs him in fielding ratings (20 to 80 points), from his familiarity. */
export function fieldingAt(p, pos, r = p.r) {
  const gap = 20 - familiarity(p, pos);
  if (!gap) return r;
  const out = { ...r };
  const cut = (k, f) => { if (out[k] != null) out[k] = Math.max(20, out[k] - gap * f); };
  cut('range', 1.0); cut('hands', 0.7); cut('arm', 0.35); cut('acc', 0.6); cut('turn', 0.9);
  if (pos === 'C') { cut('block', 1.4); cut('framing', 1.2); cut('cthrow', 1.0); }
  return out;
}

/** The positions he plays, best first, as a CM-style string: "SS/2B", "OF (CF/RF)", "1B/OF (LF/RF)". */
export function posString(p) {
  if (isPit(p)) return p.role === 'Starter' ? 'SP' : p.role === 'Closer' ? 'RP (CL)' : 'RP';
  const ok = FIELD.map((pos) => [pos, familiarity(p, pos), p.played?.[pos] || 0]).filter(([, f]) => f >= 16)
    .sort((a, b) => b[1] - a[1] || (b[0] === p.pos) - (a[0] === p.pos) || b[2] - a[2]).map(([pos]) => pos);
  if (!ok.length) return 'DH';
  const of = ok.filter((x) => ['LF', 'CF', 'RF'].includes(x));
  const inf = ok.filter((x) => !of.includes(x));
  const parts = [...inf];
  if (of.length >= 2) parts.push(`OF (${of.join('/')})`);
  else if (of.length) parts.push(of[0]);
  // keep his best position first
  if (of.length >= 2 && of.includes(ok[0])) parts.unshift(parts.pop());
  return parts.join('/');
}
