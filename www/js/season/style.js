// Club style (Phase 7 tactics). A club has three dials, set rarely: how it pitches, how it sets its defence and how it hits.
// None of it is shown as a number. The player sees the dial he chose and, over weeks, what it does to results.
//
//   pitch:   'k' attack the zone and miss bats | 'bal' | 'gb' keep it down and make them hit it on the ground
//   defence: 'inf' infield tight, guard the grounders | 'bal' | 'out' outfield deep, take away the gaps
//   offence: 'pow' swing for damage | 'bal' | 'spd' contact, speed and pressure on the bases
//
// How well the roster suits a style (its fit) is worked out from the players and never shown. Familiarity is how well
// the club has settled into the style: it builds with every game and drops when a dial is changed. What the engine
// reads is the strength of each dial, which is fit times familiarity, and it may be negative: a style the roster
// does not suit hurts a little. Computer clubs choose, and now and then change, their styles the same way.
import { game } from '../state.js';
import { isPitcher } from '../data/world.js';
import { z } from '../engine/model.js';

export const DIALS = {
  pitch: { label: 'Pitching approach', options: [
    ['k', 'Miss bats', 'Attack the zone with the best stuff. More strikeouts, more balls in the air, a few more walks.'],
    ['bal', 'Balanced', 'No set plan. Pitchers pitch to their own strengths.'],
    ['gb', 'Keep it down', 'Work low, pitch to contact and ask the defence to make plays. Fewer strikeouts, more ground balls.'],
  ] },
  defence: { label: 'Defensive set', options: [
    ['inf', 'Infield tight', 'The infield plays in and guards the lines. Ground balls get through less. Balls over the infield fall in more.'],
    ['bal', 'Balanced', 'Standard positioning.'],
    ['out', 'Outfield deep', 'The outfield plays deep and covers the gaps. Fewer extra-base hits. Grounders find more holes.'],
  ] },
  offence: { label: 'Offensive style', options: [
    ['pow', 'Swing for damage', 'Hunt pitches to drive. More power and more strikeouts, less running.'],
    ['bal', 'Balanced', 'Hitters hit their own way.'],
    ['spd', 'Contact and pressure', 'Put the ball in play and run. Fewer strikeouts and more steals, a little less power.'],
  ] },
};
export const DIAL_KEYS = Object.keys(DIALS);
const DIR = { pitch: { k: 1, bal: 0, gb: -1 }, defence: { inf: 1, bal: 0, out: -1 }, offence: { pow: 1, bal: 0, spd: -1 } };
/** Games for a dial changed from scratch to feel settled (familiarity builds about 0.011 a game from 0.2). */
export const GAINS = 0.011;
export const AFTER_CHANGE = 0.2;

const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

/** Make sure a club's state carries a style. Computer clubs choose from their roster; the user's club starts balanced. */
export function ensureStyle(org, st) {
  if (st.style && st.fam) return st;
  st.style = { pitch: 'bal', defence: 'bal', offence: 'bal' };
  st.fam = { pitch: 1, defence: 1, offence: 1 };
  if (org.id !== game.orgId) {
    const f = fits(org, st);
    for (const d of DIAL_KEYS) st.style[d] = bestFor(d, f[d], 0.28);
    st.fam = { pitch: 0.9, defence: 0.9, offence: 0.9 };
  }
  return st;
}

/** The style a roster suits best on one dial, or balanced if nothing suits it clearly. `f` is the dial's fit towards the first direction (+1). */
function bestFor(dial, f, need) {
  const [plus, , minus] = DIALS[dial].options.map((o) => o[0]);
  return f > need ? plus : f < -need ? minus : 'bal';
}

/** Fit of the active roster towards the + direction of each dial, from -1 to 1. Never shown to the user. */
export function fits(org, st) {
  const players = [...st.active].map((id) => org.players.find((p) => p.id === id)).filter(Boolean);
  const arms = players.filter(isPitcher);
  const bats = players.filter((p) => !isPitcher(p));
  const rot = arms.filter((p) => st.rotation?.includes(p.id));
  const pen = arms.filter((p) => !rot.includes(p));
  // pitching: power arms against ground-ball arms, the rotation counting double
  const pk = (p) => 0.5 * z(p.r.stuff) + 0.3 * z(p.r.velocity) + 0.2 * z(p.r.cmd) - 0.7 * z(p.r.pgb) - 0.2 * z(p.r.movement);
  const pitch = clamp(0.9 * mean([...rot, ...rot, ...pen].map(pk)) - 0.12, -1, 1);
  // defence: range and hands of the infield against the outfield, from the lineup the club uses
  const lu = (st.lineupR?.length ? st.lineupR : []).map((s) => ({ p: org.players.find((x) => x.id === s.id), pos: s.pos })).filter((s) => s.p);
  const grp = (set) => mean(lu.filter((s) => set.includes(s.pos)).map((s) => 0.7 * z(s.p.r.range) + 0.3 * z(s.p.r.hands)));
  const defence = lu.length ? clamp(0.9 * (grp(['2B', 'SS', '3B']) - grp(['LF', 'CF', 'RF'])) - 0.30, -1, 1) : 0;
  // offence: power and gap hitters against contact, speed and running
  const top = bats.slice().sort((a, b) => (b.r.contact + b.r.power) - (a.r.contact + a.r.power)).slice(0, 9);
  const pw = mean(top.map((p) => 0.6 * z(p.r.power) + 0.4 * z(p.r.gap ?? p.r.power)));
  const sp = mean(top.map((p) => 0.4 * z(p.r.speed) + 0.3 * z(p.r.contact) + 0.15 * z(p.r.steal) + 0.15 * z(p.r.avoidK)));
  const offence = clamp(0.9 * (pw - sp) - 0.25, -1, 1); // each minus is the league's typical lean in 2027, so a typical club sits near zero
  return { pitch, defence, offence };
}

/**
 * The strengths the engine reads for one club: { pitch: {d, q}, defence: {d, q}, offence: {d, q} } where d is the
 * direction (+1, 0, -1) and q the quality, fit towards that direction times familiarity. Balanced dials have d = 0.
 */
export function strengths(org, st) {
  ensureStyle(org, st);
  const f = fits(org, st);
  const out = {};
  for (const d of DIAL_KEYS) {
    const dir = DIR[d][st.style[d]] ?? 0;
    const fit = dir * f[d];
    out[d] = { d: dir, q: dir ? clamp(fit, -1, 1) * (0.3 + 0.7 * (st.fam[d] ?? 1)) : 0 };
  }
  return out;
}

/** The user changes a dial. Familiarity with the new setting starts low. */
export function setDial(st, dial, value) {
  if (!st.style || st.style[dial] === value) return false;
  st.style[dial] = value;
  st.fam[dial] = AFTER_CHANGE;
  st.styleChanged = { ...(st.styleChanged || {}), [dial]: game.date?.getTime?.() ?? 0 };
  return true;
}

/** One game played at MLB level: the club settles a little further into its style. */
export function settle(st) {
  if (!st.fam) return;
  for (const d of DIAL_KEYS) st.fam[d] = Math.min(1, (st.fam[d] ?? 1) + GAINS);
}

/**
 * The winter review for computer clubs: if the roster now suits another approach clearly better than the current
 * one, a patient club may switch. Returns the clubs that switched, for news.
 */
export function reviewStyles(rng) {
  const out = [];
  for (const o of game.world.orgs.values()) {
    if (o.id === game.orgId) continue;
    const st = game.orgStates.get(o.id);
    if (!st) continue;
    ensureStyle(o, st);
    const f = fits(o, st);
    for (const d of DIAL_KEYS) {
      const dir = DIR[d][st.style[d]] ?? 0;
      const current = dir * f[d];
      const best = bestFor(d, f[d], 0.28);
      const bestFit = (DIR[d][best] ?? 0) * f[d];
      if (best !== st.style[d] && bestFit - current > 0.3 && rng.chance(0.5)) {
        st.style[d] = best; st.fam[d] = AFTER_CHANGE;
        out.push({ org: o.id, dial: d, to: best });
      }
    }
  }
  return out;
}

// ---------- how it is going ----------
// The evidence the user can read: the club's numbers for the things each dial touches, against the league. The fit itself stays hidden.

const babipAgainst = (l) => { const d = l.bf - l.so - l.bb - l.hr; return d > 0 ? (l.h - l.hr) / d : null; };
const perG = (v, g) => (g ? v / g : null);

/** Words for how settled a dial is. */
export function settledWords(fam) {
  const left = Math.ceil((1 - fam) / GAINS);
  return fam >= 0.97 ? 'settled in' : fam >= 0.75 ? `nearly settled (about ${left} more games)` : fam >= 0.45 ? `getting used to it (about ${left} more games)` : `only just started on it (about ${left} games to settle)`;
}

/**
 * Per dial: how settled it is, and rows of { label, mine, lg, rank, better } for the numbers it should move.
 * `totals` is teamTotals() for the season. Returns null for a dial when the club has played too few games.
 */
export function styleReport(orgId, totals, ids) {
  const o = game.world.orgs.get(orgId), st = game.orgStates.get(orgId);
  const t = totals.get(orgId);
  if (!st?.fam) return null;
  const games = t ? Math.round(t.pit.outs / 27) : 0;
  if (!t || games < 15) return { games, early: true };
  const get = (f) => ids.map((id) => ({ id, v: totals.get(id) ? f(totals.get(id)) : null })).filter((e) => e.v != null);
  const row = (label, f, fmt, lowGood = false) => {
    const all = get(f), mine = f(t);
    const sorted = all.slice().sort((a, b) => (lowGood ? a.v - b.v : b.v - a.v));
    const rank = sorted.findIndex((e) => e.id === orgId) + 1;
    const lg = all.reduce((a, e) => a + e.v, 0) / Math.max(1, all.length);
    return { label, mine: fmt(mine), lg: fmt(lg), rank, of: all.length, hi: rank <= Math.ceil(all.length / 4), lo: rank > all.length - Math.ceil(all.length / 4) };
  };
  const pct = (v) => `${(v * 100).toFixed(1)}%`, d2 = (v) => v.toFixed(2), d3 = (v) => v.toFixed(3).replace(/^0/, '');
  const g = (x) => Math.max(1, x.pit.outs / 27);
  return {
    games,
    pitch: [row('Strikeout rate', (x) => x.pit.kPct, pct), row('Walk rate', (x) => x.pit.bbPct, pct, true), row('Home runs allowed per game', (x) => x.pit.hr / g(x), d2, true), row('Runs allowed per game (earned)', (x) => x.pit.er / g(x), d2, true)],
    defence: [row('Average on balls in play against', (x) => babipAgainst(x.pit), d3, true), row('Hits allowed per game', (x) => x.pit.h / g(x), d2, true)],
    offence: [row('Strikeout rate', (x) => x.bat.kPct, pct, true), row('Home runs per game', (x) => x.bat.hr / g(x), d2), row('Steals per game', (x) => x.bat.sb / g(x), d2), row('Runs per game', (x) => x.bat.r / g(x), d2)],
  };
}
