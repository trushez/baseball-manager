// Agents and what players want (Phase 6, stage 3).
//
// There are 25 invented agents in eight agencies (seven are the agency names already in the contract data,
// the eighth is a pool of independents). Three are super-agents who represent many stars. Each has a
// toughness, an honesty (how often he bluffs about rival offers), a loyalty to one club or none, and a style.
// Every player belongs to one agent. Your relationship with each agent is hidden, from -100 to 100, moves with
// how you deal, and carries from one client to the next.
//
// Every player also has hidden weights over nine things he cares about. The agent drops hints.
import { Rng } from '../core/rng.js';
import { game } from '../state.js';
import { value } from './value.js';
import { serviceYears, fromAbroad } from '../data/world.js';

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

export const AGENCIES = ['Boras Corp.', 'Wasserman', 'CAA', 'Excel', 'ISE', 'Ballengee', 'Octagon', 'Independent'];
const SIZE = { 'Boras Corp.': 3, Wasserman: 4, CAA: 4, Excel: 3, ISE: 3, Ballengee: 2, Octagon: 2, Independent: 4 };
const STYLES = ['hardball', 'smooth', 'quiet', 'media'];
const FIRSTS = ['Dennis', 'Barry', 'Craig', 'Lou', 'Irwin', 'Seth', 'Marcus', 'Ari', 'Glenn', 'Paul', 'Rick', 'Alan', 'Joel', 'Victor', 'Ned', 'Howard', 'Greg', 'Tomas', 'Darius', 'Evan', 'Carlos', 'Phil', 'Raul', 'Kenny', 'Mitch'];
const LASTS = ['Hargrove', 'Feldman', 'Okonkwo', 'Strand', 'Villanueva', 'Pollack', 'Rourke', 'Haas', 'Delacroix', 'Whitaker', 'Moreno', 'Lindqvist', 'Brandt', 'Castellano', 'Yates', 'Goldberg', 'Mahoney', 'Estrada', 'Kincaid', 'Novak', 'Padilla', 'Sterling', 'Tran', 'Vaughn', 'Wexler'];

let cache = null;
/** The 25 agents. The same in every game; only your relationships with them change. */
export function allAgents() {
  if (cache) return cache;
  const rng = new Rng('agents-v1');
  const clubs = [...game.world.mlb].map((c) => c.org);
  const out = [];
  let i = 0;
  for (const agency of AGENCIES) {
    for (let k = 0; k < SIZE[agency]; k++) {
      const sup = k === 0 && ['Boras Corp.', 'CAA', 'Wasserman'].includes(agency);
      out.push({
        id: `ag${++i}`, name: `${FIRSTS[i - 1]} ${LASTS[(i * 7) % LASTS.length]}`, agency, super: sup,
        tough: clamp(Math.round(rng.normal(sup ? 15 : 10, 3)), 1, 20), honest: clamp(Math.round(rng.normal(11, 4)), 1, 20),
        loyal: rng.chance(0.25) && clubs.length ? rng.pick(clubs) : null, style: rng.pick(STYLES),
      });
    }
  }
  cache = out;
  return out;
}
export const resetAgents = () => { cache = null; };

/** Which of the seven named agencies a contract's agent field points to, else Independent. */
function agencyOf(p) {
  const a = String(p.contract?.agent || '');
  return AGENCIES.slice(0, 7).find((x) => a.toLowerCase().includes(x.toLowerCase().split(' ')[0])) || null;
}

/** A player's agent, the same every game. Stars tend to go to the super-agents. */
export function agentOf(p) {
  const rng = new Rng(`agent-${p.id}`);
  const list = allAgents();
  let agency = agencyOf(p);
  if (!agency) {
    const star = value(p) >= 55;
    if (star && rng.chance(0.55)) agency = rng.pick(list.filter((a) => a.super)).agency;
    else agency = rng.weighted(Object.fromEntries(AGENCIES.map((a) => [a, a === 'Independent' ? 3 : SIZE[a]])));
  }
  const pool = list.filter((a) => a.agency === agency);
  const id = rng.weighted(Object.fromEntries(pool.map((a) => [a.id, a.super ? 3 : 1])));
  return pool.find((a) => a.id === id);
}

// ---------- your relationship with agents ----------

export const rel = (agent) => game.agentRel?.[agent.id] ?? 0;
export function bumpRel(agent, d) {
  game.agentRel ||= {};
  game.agentRel[agent.id] = clamp(Math.round((game.agentRel[agent.id] ?? 0) + d), -100, 100);
}
export function relWords(agent) {
  const r = rel(agent);
  return r >= 60 ? 'Warm' : r >= 25 ? 'Friendly' : r > -25 ? 'Neutral' : r > -60 ? 'Cool' : 'Hostile';
}

// ---------- what a player wants ----------

export const WANTS = ['money', 'years', 'role', 'contender', 'region', 'manager', 'history', 'notrade', 'optout'];
export const WANT_HINT = {
  money: 'He wants to be paid what he is worth.',
  years: 'He wants security: a long contract.',
  role: 'He wants to play every day.',
  contender: 'He wants to win: a club that is going somewhere.',
  region: 'He would like to be somewhere that feels like home.',
  manager: 'He wants to play for a manager with a name.',
  history: 'He feels he owes the club, or the club owes him.',
  notrade: 'He wants to know he will not be moved: a no-trade clause.',
  optout: 'He wants a way out if it goes well: an opt-out.',
};

/** The hidden weights, summing to 1. */
export function wantsOf(p) {
  const rng = new Rng(`wants-${p.id}`);
  const age = p.age ?? 27, v = value(p);
  const w = {};
  for (const k of WANTS) w[k] = 0.4 + rng.next() * 1.2;
  w.money += 1.2;
  const amb = p.r?.amb ?? 50; // the ambitious want a bigger role and a winner
  w.role += Math.max(0, (amb - 50) / 40); w.contender += Math.max(0, (amb - 50) / 60); w.money += Math.max(0, (50 - amb) / 80);
  if (age < 26) w.role += 0.8;
  if (age >= 31) { w.years += 0.9; w.contender += 0.6; }
  if (v >= 56) { w.optout += 0.7; w.notrade += 0.6; w.money += 0.5; }
  if (p.country && !['USA', 'Canada'].includes(p.country)) w.region += 0.4;
  const s = Object.values(w).reduce((a, b) => a + b, 0);
  for (const k of WANTS) w[k] /= s;
  return w;
}

/** What he cares about most after money, strongest first. */
export const topWants = (p, n = 2) => Object.entries(wantsOf(p)).filter(([k]) => k !== 'money').sort((a, b) => b[1] - a[1]).slice(0, n).map(([k]) => k);

/** Whether he wants to test free agency rather than talk: mostly the best players with a year to go. */
export function testsMarket(p) {
  const v = value(p);
  const left = (p.contract?.years || []).filter((y) => y.season >= game.year).length;
  if (left > 1) return false;
  // a player the club still controls through arbitration has no market to test, however good he is
  const c = p.contract || {};
  if (c.status !== 'free agent' && !(fromAbroad(p) && c.status === 'signed') && serviceYears(p) + Math.max(1, left) < 6) return false;
  const chance = v >= 58 ? 0.6 : v >= 54 ? 0.4 : v >= 50 ? 0.15 : 0;
  return new Rng(`testfa-${p.id}-${game.year}`).chance(chance);
}
