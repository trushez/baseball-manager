// What a player is worth: one number on the 20-80 scale for comparing players of any kind, and the
// salary that value commands. Used by AI clubs for roster moves and waiver claims, and for free agent
// and arbitration salaries.
import { grade, isPitcher, positions, listedPos as mainPos, seasons } from '../data/world.js';
import { offence } from '../club/depth.js';
import { game } from '../state.js';
import { dayNo } from './calendar.js';

const DEF = { C: 0.45, SS: 0.4, CF: 0.35, '2B': 0.3, '3B': 0.3, RF: 0.18, LF: 0.12, '1B': 0.06, DH: 0 };
// regular players at these positions are worth a little more or less than their bat alone suggests
const POS_ADJ = { C: 2, SS: 2, CF: 1.5, '2B': 1, '3B': 1, RF: 0, LF: -0.5, '1B': -1.5, DH: -3 };

export function value(p, { future = false } = {}) {
  const gx = (k) => p.grades?.[k]?.[future ? 1 : 0] ?? 50;
  if (isPitcher(p)) {
    const base = (gx('Stuff') * 1.2 + gx('Movement') + gx('Control')) / 3.2;
    return p.role === 'Starter' ? base + (gx('Stamina') - 50) * 0.15 : base - 4;
  }
  const pos = positions(p)[0] || mainPos(p) || 'DH';
  const off = future ? 0.3 * gx('Power') + 0.25 * gx('Contact') + 0.25 * gx('Eye') + 0.2 * gx('Avoid K') : offence(p);
  return off + (gx('Fielding') - 50) * (DEF[pos] ?? 0) + (POS_ADJ[pos] ?? 0) + (gx('Speed') - 50) * 0.05;
}

export const LEAGUE_MIN = 780000;

/**
 * Value as the market sees it: the scouting grades, moved towards what he has actually done in the
 * majors over the last three seasons (the most recent counting most). A full-time regular's record
 * counts for up to 60%.
 */
export function marketValue(p) {
  const v = value(p);
  const W = { [game.year - 3]: 3, [game.year - 2]: 4, [game.year - 1]: 5 };
  const rows = seasons(p).filter((r) => r.level === 'MLB' && W[r.season]);
  if (isPitcher(p)) {
    let w = 0, f = 0, ip = 0;
    for (const r of rows) if (r.outs && r.fip != null) { const k = W[r.season] * r.outs; w += k; f += k * r.fip; ip += r.outs / 3; }
    if (!w) return v;
    const perf = (p.role === 'Starter' ? 50 : 46) + (4.10 - f / w) * 5;
    return v + Math.min(0.6, ip / (p.role === 'Starter' ? 450 : 180)) * (perf - v);
  }
  let w = 0, o = 0, pa = 0;
  for (const r of rows) if (r.pa && r.ops != null) { const k = W[r.season] * r.pa; w += k; o += k * r.ops; pa += r.pa; }
  if (!w) return v;
  const perf = 50 + (o / w - 0.715) * 70; // the bat only: fielding and position stay as graded
  return v + Math.min(0.6, pa / 1500) * (perf - offence(p));
}

/**
 * Salary a free agent asks for, per season. Calibrated on the contracts in the game's data: a league
 * average regular (50) asks about $12M, a 55 about $28M, a star $45M. Players who are well paid now
 * don't ask for much less unless they are getting old.
 */
export function askingSalary(p) {
  const v = marketValue(p);
  const ageCut = p.age >= 36 ? 0.55 : p.age >= 33 ? 0.8 : 1;
  const x = Math.max(0, v - 45);
  let s = x ? (0.9e6 + 1.9e6 * x + 0.09e6 * x * x) * ageCut : LEAGUE_MIN;
  const now = p.contract?.aav;
  if (now && p.age < 33 && p.contract?.status !== 'minor league') s = Math.max(s, now * 0.6);
  s *= 1 - lateCut(p);
  return Math.round(Math.min(45e6, Math.max(LEAGUE_MIN, s)) / 50000) * 50000;
}

/**
 * A free agent still unsigned after the winter drops his price a little every day (1% a day from 19 February, to a
 * cut of 65%), because nobody can afford to sit out the season. Only players without a club are affected.
 */
export function lateCut(p) {
  if (p.orgId && !game.freeAgents?.includes(p.id)) return 0;
  const d = game.date;
  if (!d || !game.year) return 0;
  const end = new Date(game.year, 1, 19);
  const days = dayNo(d) - dayNo(end);
  return days > 0 && game.freeAgents?.includes(p.id) ? Math.min(0.65, days * 0.01) : 0;
}

/** Years a free agent of this age and value looks for. */
export function askingYears(p) {
  const v = marketValue(p);
  if (p.age >= 35 || v < 47) return 1;
  if (p.age >= 32) return v >= 56 ? 3 : v >= 50 ? 2 : 1;
  if (p.age >= 30) return v >= 58 ? 5 : v >= 53 ? 4 : v >= 50 ? 3 : 2;
  return v >= 58 ? 7 : v >= 54 ? 5 : v >= 50 ? 4 : 2;
}

/**
 * Arbitration salary: a share of the open-market value that grows with each year of eligibility.
 * Relievers without the closer's job earn less (arbitration pays for innings and saves), raises are
 * limited by what he earned before, and salaries rarely go down.
 */
/** What he was paid last season: his latest settled salary in the contract rows, else the figure in a one-year deal's text ("1 y/$2.53M (26)"), else the recorded pay. */
export function lastPaid(p) {
  const c = p.contract || {};
  const rows = (c.years || []).filter((x) => typeof x.salary === 'number' && x.salary > 0 && x.season <= game.year).sort((a, b) => a.season - b.season);
  if (rows.length) return rows[rows.length - 1].salary;
  const m = /^(?:[^:]*: )?1 y\/\$([\d.]+)([Mk])/.exec(c.text || '');
  if (m) return Number(m[1]) * (m[2] === 'M' ? 1e6 : 1e3);
  return c.paid2026 || c.aav || 0;
}

export function arbitrationSalary(p, year, prior) {
  const share = { A1: 0.18, A2: 0.3, A3: 0.42, A4: 0.52 }[year] ?? 0.3;
  // `prior` is the salary of the season before when projecting several years ahead, so the run only goes up
  const prev = (prior >= LEAGUE_MIN ? prior : 0) || lastPaid(p) || LEAGUE_MIN;
  let s = askingSalary(p) * share * (isPitcher(p) && p.role !== 'Starter' && p.role !== 'Closer' ? 0.6 : 1);
  if (year !== 'A1') s = Math.min(s, prev * 3 + 3e6);
  return Math.round(Math.max(LEAGUE_MIN * 1.3, s, prev * 1.05) / 25000) * 25000;
}

/** The salary of the season before `season`, following the arbitration years so each estimate builds on the last. */
export function priorSalary(p, season) {
  let prior = 0;
  for (const y of (p.contract?.years || []).slice().sort((a, b) => a.season - b.season)) {
    if (y.season >= season) break;
    if (typeof y.salary === 'number') prior = y.salary;
    else if (typeof y.status === 'string' && /^A\d/.test(y.status)) prior = arbitrationSalary(p, y.status, prior);
  }
  return prior;
}
