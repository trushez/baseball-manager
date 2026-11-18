// Default manager decisions, used for AI clubs and for the user's club when it is left on autopilot.
import { C, z } from './model.js';

/** Pitch count at which this pitcher starts to tire. */
export function pitchLimit(outing, team) {
  const st = z(outing.player.r.stamina) * 10;
  const hook = HOOK[team?.instr?.hook] ?? 0;
  return (outing.starter ? C.starterLimitBase + 1.5 * st : C.relieverLimitBase + 0.6 * st) + (outing.starter ? hook : hook / 2);
}

// Team instructions set in the club's tactics screen. Missing instructions mean 'normal'.
const HOOK = { quick: -12, normal: 0, long: 12 };
const RUNNING = { conservative: 0.45, normal: 1, aggressive: 1.8 };

/**
 * Should the fielding side change pitchers? Called before each batter, and between innings
 * (betweenInnings: true) for the side about to take the field.
 */
export function shouldPull(g, s, { betweenInnings = false } = {}) {
  const o = s.outing;
  if (!s.pen.length) return false;
  const limit = pitchLimit(o, s.team);
  const runners = g.bases.filter(Boolean).length;
  const ownKey = s === g.side.home ? 'home' : 'away';
  const lead = g.score[ownKey] - g.score[ownKey === 'home' ? 'away' : 'home'];

  // batters he has put on, a fair guide to how much trouble he is in (outs are the only way a batter is not on)
  const reached = o.bf - o.outs;
  const close = Math.abs(lead) <= 3, late = g.inning >= 7;
  const risk = runners >= 2 || (runners >= 1 && g.bases[2]);

  if (o.starter) {
    if (o.pc >= limit + 8) return true;
    if (o.runs >= 5) return true;
    if (o.runs >= 4 && runners >= 1) return true;
    if (o.pc >= limit && (runners >= 1 || betweenInnings)) return true;
    // in trouble with the game still in the balance: go to the pen before it gets away
    if (g.inning >= 5 && o.runs >= 3 && risk && close) return true;
    if (g.inning >= 6 && close && risk && o.pc >= limit - 12) return true;
    if (g.inning >= 6 && o.pc >= limit - 5 && runners >= 1 && reached >= o.outs) return true;
    // third time through with the game close and the starter fading
    if (betweenInnings && late && close && o.pc >= limit - 18) return true;
    // a lead of one to three runs after eight: the closer's inning, whatever the count
    if (betweenInnings && g.inning >= 9 && lead >= 1 && lead <= 3 && o.pc >= limit - 30) return true;
    return false;
  }
  // relievers: usually one inning, longer for long men and blowouts
  if (o.pc >= limit + 7) return true;
  if (o.runs >= 2 && runners >= 1) return true;
  if (o.runs >= 1 && risk && late && close) return true;
  if (reached >= 3 && risk && o.outs < 3) return true;
  if (betweenInnings && o.outs >= 3) {
    const role = o.player.role;
    // a postseason closer brought in for the eighth finishes the game if he can
    if (role === 'Closer' && s.team.post && o.outs < 6 && o.pc < limit + 5 && lead >= 0) return false;
    if (role === 'Starter' && o.pc < limit) return false; // a starter in relief can go longer
    if (role === 'Long' && o.pc < limit + 5) return false;
    if (Math.abs(lead) >= 6 && o.pc < limit) return false;
    return true;
  }
  return false;
}

/** Even with the user in charge, the pitching coach will not let a pitcher go far past exhaustion. */
export function mustPull(s) {
  return s.pen.length > 0 && s.outing.pc >= pitchLimit(s.outing, s.team) + 45;
}

/** Pick the reliever for the situation. */
export function pickReliever(g, s) {
  const ownKey = s === g.side.home ? 'home' : 'away';
  const lead = g.score[ownKey] - g.score[ownKey === 'home' ? 'away' : 'home'];
  const inn = g.inning;
  const post = !!s.team.post;
  // the closer is kept for the ninth (the eighth in the postseason): a save, or a tie at home or in extra innings
  const closerSpot = inn >= (post ? 8 : 9) && ((lead >= 1 && lead <= 3) || (lead === 0 && (ownKey === 'home' || inn >= 10)));
  // the computer goes to a rested arm first; a tired one only when nobody rested is left, and never an exhausted or
  // unavailable one or a starter who isn't rested while anyone else can pitch
  const rested = (p) => p.status === 'Rested' || p.status == null;
  const usable = (p) => p.status !== 'Unavailable' && p.status !== 'Exhausted' && (p.role !== 'Starter' || p.status === 'Rested');
  return choose(s.pen.filter(rested), closerSpot, inn, lead, post)
    ?? choose(s.pen.filter(usable), closerSpot, inn, lead, post)
    ?? s.pen.find((p) => p.status !== 'Unavailable') ?? s.pen[0] ?? null;
}

/** The reliever for the situation from one pool of arms, or null when the pool is empty. */
function choose(fresh, closerSpot, inn, lead, post) {
  const byRole = (role) => fresh.find((p) => p.role === role);
  if (closerSpot && byRole('Closer')) return byRole('Closer');
  const noCloser = fresh.filter((p) => p.role !== 'Closer');
  if (!noCloser.length) return byRole('Closer') ?? null;
  const pick = (role) => noCloser.find((p) => p.role === role);
  const relief = noCloser.filter((p) => p.role !== 'Starter');
  if (inn >= 8 && lead >= -1 && lead <= 3) return pick('Setup') ?? pick('Matchup') ?? best(relief.length ? relief : noCloser);
  // early trouble: a long man, or in the postseason a rested starter
  if (inn <= 5) return pick('Long') ?? (post ? pick('Starter') : null) ?? best(relief.length ? relief : noCloser, ['Setup']);
  if (Math.abs(lead) >= 5) return pick('Long') ?? worst(relief.length ? relief : noCloser, ['Setup']);
  return best(relief.length ? relief : noCloser, ['Setup']) ?? best(noCloser);
}

const quality = (p) => (p.r.stuff ?? 50) + (p.r.control ?? 50) + (p.r.movement ?? 50);
function best(list, avoid = []) {
  const pool = list.filter((p) => !avoid.includes(p.role));
  return (pool.length ? pool : list).slice().sort((a, b) => quality(b) - quality(a))[0];
}
function worst(list, avoid = []) {
  const pool = list.filter((p) => !avoid.includes(p.role));
  return (pool.length ? pool : list).slice().sort((a, b) => quality(a) - quality(b))[0];
}

/** Chance the batting side sends the runner from first on this pitch. */
export function stealAttemptChance(g, runner) {
  const ownKey = g.battingKey;
  const diff = g.score[ownKey] - g.score[ownKey === 'home' ? 'away' : 'home'];
  if (diff <= -4 || diff >= 5) return 0;
  if (g.outs === 2 && g.strikes === 2 && g.balls === 3) return 0;
  const talent = 0.85 * z(runner.r.steal) + 0.55 * z(runner.r.speed);
  const policy = RUNNING[g.side[ownKey].team.instr?.running] ?? 1;
  const so = g.side[ownKey].team.sx?.offence; // contact-and-pressure clubs run more, power clubs less
  return C.stealAttemptPerPitch * Math.exp(talent) * policy * (so?.d ? Math.exp(-0.5 * so.d * so.q) : 1);
}

const bat = (p) => (z(p.r.contact) + z(p.r.power) + z(p.r.eye)) / 3;

/** Should the fielding side walk this batter on purpose? Late, close, first base open, a runner in scoring position. */
export function wantsIntentionalWalk(g, s) {
  const policy = s.team.instr?.ibb ?? 'normal';
  if (policy === 'never' || g.bases[0] || !(g.bases[1] || g.bases[2]) || g.outs === 2 && !g.bases[2]) return false;
  const ownKey = s === g.side.home ? 'home' : 'away';
  const lead = g.score[ownKey] - g.score[ownKey === 'home' ? 'away' : 'home'];
  if (g.inning < (policy === 'often' ? 6 : 8) || Math.abs(lead) > 1) return false;
  const b = g.batting;
  const here = bat(b.order[b.idx].player), next = bat(b.order[(b.idx + 1) % 9].player);
  return policy === 'often' ? here > 0.5 && here - next > 0.4 : here > 1.0 && here - next > 0.8;
}

/** Should the batting side bunt the runner over? Only weak hitters, none out, late and close. */
export function wantsSacrifice(g, s) {
  const policy = s.team.instr?.bunting ?? 'normal';
  if (policy === 'never' || g.outs > 0 || g.bases[2] || !(g.bases[0] || g.bases[1])) return false;
  const ownKey = s === g.side.home ? 'home' : 'away';
  const lead = g.score[ownKey] - g.score[ownKey === 'home' ? 'away' : 'home'];
  if (g.inning < 7 || lead < -1 || lead > 0) return false;
  const b = g.batter;
  return bat(b) < (policy === 'often' ? -0.3 : -0.9) && (b.r.bunt ?? 45) >= 40;
}
