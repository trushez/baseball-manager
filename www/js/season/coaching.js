// Coaching in detail. Each coach has an overall rating, a way of working with the young and with veterans, a gift for
// motivating players, a specialty and a style, and the club's coaches between them decide who improves, in what, and
// how the dressing room feels. You can also give up to six players a training focus. Only the coaches' own figures are
// shown; what they do to a player is worked out here and never listed in numbers.
import { Rng } from '../core/rng.js';
import { game, orgState } from '../state.js';
import { fullName, isPitcher } from '../data/world.js';
import { message } from './inbox.js';
import { levelOf as analyticsLevel } from './analytics.js';
import { makeCoach, COACH_ROLES } from './ability.js';
import { attrLabel } from '../data/attributes.js';

export const STYLES = { old: 'Old school', modern: 'Modern', players: 'Players\' coach' };
export const STYLE_NOTE = {
  old: 'Trusts the eye and the routine. Keeps the clubhouse steady, but will not like a big analytics department.',
  modern: 'Works from data and video. Gets more out of a good analytics group.',
  players: 'Gets on with everyone. The dressing room is happier with him around.',
};
/** What each coach's specialty tilts his players' improvement towards, and its name. */
export const SPECS = {
  hit: { contact: ['Contact and bat control', { contact: 1.5, avoidK: 1.3 }], power: ['Power', { power: 1.5, gap: 1.4 }], eye: ['Plate discipline', { eye: 1.6, sit: 1.3, avoidK: 1.15 }] },
  pit: { stuff: ['Stuff and movement', { stuff: 1.4, movement: 1.4, velocity: 1.2 }], command: ['Command', { control: 1.6, cmd: 1.5, psel: 1.3 }], stamina: ['Stamina and durability', { stamina: 1.5, recov: 1.5, dura: 1.5 }] },
  def: { glove: ['Glove work', { hands: 1.6, posn: 1.4 }], range: ['Range and positioning', { range: 1.6, antic: 1.4, instincts: 1.2 }], arm: ['Arm and throwing', { arm: 1.7 }] },
};
export const ROLE_WHAT = {
  hit: 'Helps your hitters improve, and tilts it towards his specialty.',
  pit: 'Helps your pitchers improve, and tilts it towards his specialty.',
  fit: 'Keeps players healthier and slows the decline of older ones.',
  def: 'Improves fielding in every player, young or old, and slows its decline.',
  mind: 'Lifts the mood of the clubhouse and helps a pitcher who has lost his control find it again.',
  dir: 'Sets how fast players below the majors develop, together with the development level.',
  med: 'Shortens injuries (about 1.5 per cent a rating point either side of 10) and makes the medical report on a player more reliable.',
};
export const FOCUS_MAX = 6;
export const FOCUS_KEYS = {
  bat: ['contact', 'power', 'eye', 'avoidK', 'speed', 'range', 'hands', 'arm'],
  pit: ['stuff', 'movement', 'control', 'velocity', 'stamina'],
};

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const NEUTRAL = { grow: 1, decl: 1, bias: null };

/** Fill in anything an older save or a new role lacks: traits on existing coaches, and coaches for the new roles. */
export function ensureStaff(orgId = game.orgId) {
  const S = game.staff?.[orgId];
  if (!S?.coaches) return S;
  if (orgId === game.orgId && game.coachPool && !game.coachPool.some((c) => c.role === 'med')) game.coachPool.push(...Array.from({ length: 6 }, (_, i) => makeCoach('med', new Rng(`medpool-${game.manager}-${i}`))));
  for (const role of Object.keys(COACH_ROLES)) {
    if (!S.coaches[role]) S.coaches[role] = makeCoach(role, new Rng(`coachfill-${orgId}-${role}-${game.manager}`), 9);
    const c = S.coaches[role];
    if (c.youth == null) {
      const r = new Rng(`coachtraits-${c.id}`);
      Object.assign(c, { youth: clamp(Math.round(c.rating + r.normal(0, 2.5)), 1, 20), vets: clamp(Math.round(c.rating + r.normal(0, 2.5)), 1, 20), motiv: clamp(Math.round(c.rating + r.normal(0, 2.5)), 1, 20) });
      c.style ??= r.weighted({ old: 0.4, modern: 0.35, players: 0.25 });
      c.age ??= 40 + r.int(0, 24);
      if (SPECS[role] && !c.spec) c.spec = r.pick(Object.keys(SPECS[role]));
    }
  }
  return S;
}

const mine = (p) => p.orgId === game.orgId && game.staff?.[game.orgId]?.coaches;

/**
 * What your coaches do to one player's development: a growth multiplier, a decline multiplier and, for growth, a tilt
 * of which attributes move. Neutral for every other club (theirs follow their budget, see staffFor).
 */
export function coachEffect(p, winter = false) {
  if (!mine(p)) return NEUTRAL;
  const S = ensureStaff();
  const pit = isPitcher(p), age = p.age ?? 27, majors = p.level === 'MLB';
  const lead = S.coaches[pit ? 'pit' : 'hit'];
  const fld = S.coaches.def;
  const young = age <= 24, old = age >= 31;
  // working with the young or with veterans, by whichever coach looks after this kind of player
  let grow = young ? 0.88 + 0.012 * lead.youth : 1;
  let decl = old ? 1.1 - 0.01 * lead.vets : 1;
  // style: a modern coach with a real analytics department finds more, an old school one finds less
  const lv = analyticsLevel();
  if (lead.style === 'modern' && lv >= 2) grow *= 1 + 0.01 * Math.min(lv, 4);
  if (lead.style === 'old' && lv >= 4) grow *= 0.98;
  // the development director, for those below the majors
  if (!majors) grow *= 0.88 + 0.012 * S.coaches.dir.rating;
  const bias = {};
  const spec = SPECS[pit ? 'pit' : 'hit']?.[lead.spec];
  if (spec && majors) for (const [k, f] of Object.entries(spec[1])) bias[k] = 1 + (f - 1) * clamp(lead.rating / 12, 0.3, 1.5);
  if (!pit) {
    const fs = SPECS.def[fld.spec];
    const fieldK = ['range', 'hands', 'arm', 'antic', 'posn'];
    const base = 0.7 + 0.03 * fld.rating;
    for (const k of fieldK) bias[k] = (bias[k] ?? 1) * base;
    if (fs) for (const [k, f] of Object.entries(fs[1])) bias[k] = (bias[k] ?? 1) * (1 + (f - 1) * clamp(fld.rating / 12, 0.3, 1.5));
    decl *= 1.12 - 0.012 * fld.rating; // gloves hold up
  }
  if (p.focus) bias[p.focus] = (bias[p.focus] ?? 1) * 1.7;
  return { grow, decl, bias: Object.keys(bias).length ? bias : null };
}

/** How much more a pitcher gets back of his control each winter after the yips, from the mental coach. */
export const mindHelp = (p) => (mine(p) ? Math.round((ensureStaff().coaches.mind.rating - 10) / 4) : 0);

/** A weekly nudge to a player's mood from the coaches: motivation, a players' coach, an old school one against analytics. */
export function moodLift(p) {
  if (!mine(p)) return 0;
  const S = ensureStaff();
  let x = (S.coaches.mind.motiv - 10) / 40;
  const lv = analyticsLevel();
  for (const c of Object.values(S.coaches)) {
    if (c.style === 'players') x += 0.12;
    if (c.style === 'old' && lv >= 4) x -= 0.12;
  }
  return x;
}

// ---------- training focus ----------

export const focusOf = (orgId = game.orgId) => game.world.orgs.get(orgId).players.filter((p) => p.focus);
export const focusKeys = (p) => FOCUS_KEYS[isPitcher(p) ? 'pit' : 'bat'];
export function setFocus(p, key) {
  if (p.orgId !== game.orgId) return 'He is not yours.';
  if (!focusKeys(p).includes(key)) return 'That is not something he can work on.';
  if (!p.focus && focusOf().length >= FOCUS_MAX) return `No: your coaches can only give ${FOCUS_MAX} players extra attention.`;
  p.focus = key;
  return `${fullName(p)} will work mostly on ${attrLabel(key).toLowerCase()}.`;
}
export function clearFocus(p) { delete p.focus; return `${fullName(p)} is back to the normal programme.`; }

// ---------- what the coaches say, and what happens to them ----------

const VOICE = {
  old: (n, who) => `"${who} has the right stuff in the bones. You keep doing the basic things and the rest comes," says ${n}.`,
  modern: (n, who) => `"The video and the tracking say ${who} is changing in the right ways, and I would not trust my eye over that," says ${n}.`,
  players: (n, who) => `"${who} is happy here and that is half of it. A man who wants to come to work gets better," says ${n}.`,
};
const pick = (rng, a) => a[rng.int(0, a.length - 1)];

/** Monthly: what each lead coach thinks of his players, a coach leaving, a coach clash. */
export function coachingMonth() {
  const S = ensureStaff();
  if (!S || !game.season) return;
  const rng = new Rng(`coaching-${game.year}-${game.date.getMonth()}-${game.manager}`);
  const o = game.world.orgs.get(game.orgId), st = orgState(game.orgId);
  const pool = o.players.filter((p) => !p.retired && ['MLB', 'AAA', 'AA'].includes(st.level.get(p.id) || 'MLB'));
  const lines = [];
  for (const role of ['hit', 'pit']) {
    const c = S.coaches[role];
    const group = pool.filter((p) => isPitcher(p) === (role === 'pit'));
    const up = group.filter((p) => (p.dvYear || 0) > 0.8).sort((a, b) => b.dvYear - a.dvYear)[0];
    const flat = group.filter((p) => (p.age ?? 30) <= 25 && (p.dvYear || 0) < -0.2 && p.level === 'MLB')[0];
    if (up) lines.push({ p: `${COACH_ROLES[role]} ${c.name}: ${VOICE[c.style](c.name, fullName(up))}`, pid: up.id });
    else if (flat) lines.push({ p: `${COACH_ROLES[role]} ${c.name} is worried about ${fullName(flat)}, who has stopped moving forward. A change in routine, or a focus, might help.`, pid: flat.id });
  }
  const f = focusOf();
  if (f.length) lines.push({ p: `On the extra work: ${f.map((p) => `${fullName(p)} (${attrLabel(p.focus).toLowerCase()})`).join(', ')}.` });
  if (lines.length) message({ cat: 'club', title: 'The coaches\' report', parts: lines });

  // a rival wants one of your good coaches
  const good = Object.entries(S.coaches).filter(([, c]) => c.rating >= 13 && !c.interim);
  if (good.length && rng.next() < 0.1) {
    const [role, c] = good[rng.int(0, good.length - 1)];
    const rival = game.world.mlb.filter((x) => x.org !== game.orgId)[rng.int(0, 28)];
    if (rival && rng.next() < 0.5) {
      S.coaches[role] = { ...makeCoach(role, rng, 5), name: `Interim ${c.name.split(' ').pop()}`, interim: true };
      ensureStaff();
      message({ cat: 'club', title: `${rival.city} hire ${c.name}`, body: `${c.name}, your ${COACH_ROLES[role].toLowerCase()}, has taken the same job with ${rival.city} for more money. A coach from the staff has stepped in until you find a replacement, and he will be the first to tell you he is not the answer. Hire from the staff screen.` });
    }
  }
  // a coach retires
  const aged = Object.entries(S.coaches).filter(([, c]) => (c.age ?? 40) >= 63 && !c.interim);
  if (aged.length && rng.next() < 0.06) {
    const [role, c] = aged[0];
    S.coaches[role] = { ...makeCoach(role, rng, 5), name: `Interim ${c.name.split(' ').pop()}`, interim: true };
    ensureStaff();
    message({ cat: 'club', title: `${c.name} retires`, body: `${c.name} has told you he is done, after more years in uniform than he will say. He leaves the staff a notebook for every pitcher and hitter he ever coached. A caretaker takes over until you hire someone.` });
  }
}
