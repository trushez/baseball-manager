// Turns an organisation's roster decisions into the team a match is played with. Players are copied,
// so a match can set today's position, fatigue and ratings without touching the database records.
import { lastRecord } from '../season/history.js';
import { isPitcher, positions, lastSeason, rate3, fix, ipText } from '../data/world.js';
import { activeHitters, activePitchers, playerIn } from './depth.js';
import { dayRatings } from '../season/hidden.js';
import { fieldingAt } from '../data/attributes.js';
import { moodShift } from '../season/moods.js';
import { strengths } from '../season/style.js';


/** Ratings lost to a long run of games without a day off. */
function tiredBy(p) {
  const f = p.fat || 0;
  return f > 85 ? 5 : f > 70 ? 3 : f > 55 ? 1 : 0;
}

/** Match copy of a player with the figures the match screen and commentary read. */
export function matchCopy(p, team, extra = {}) {
  const c = { ...p, ...extra, team };
  // the day's form, the big-game factor and mood (season games only)
  if (team.day != null) c.r = dayRatings(p, c.r, { day: team.day, big: team.big, mood: moodShift(p) });
  if (isPitcher(p)) {
    const s = lastSeason(p, 'pit');
    Object.assign(c, {
      era: s?.ip ? fix(s.era) : '', ip: s ? ipText(s.outs) : '', k9: s?.ip ? fix(s.k9, 1) : '', bb9: s?.ip ? fix(s.bb9, 1) : '',
      whip: s?.ip ? fix(s.whip) : '', g: s?.g ?? 0, status: extra.status || 'Rested', last3: extra.last3 ?? 0, vsL: '', vsR: '',
      pitches: Object.fromEntries(Object.entries(p.pitchGrades || {}).map(([k, v]) => [k, v[0]])),
    });
    if (c.status === 'Tired') c.r = { ...c.r, stuff: c.r.stuff - 4, control: c.r.control - 3, stamina: c.r.stamina - 10 };
    // sent out exhausted: he will not be himself (and runs a much higher risk of injury)
    // back from a long injury and not yet sharp
    if (p.rust) { const r = Math.min(8, p.rust * 1.6); c.r = { ...c.r, control: c.r.control - r, stuff: c.r.stuff - r * 0.6, movement: c.r.movement - r * 0.5 }; }
    if (c.status === 'Exhausted') c.r = { ...c.r, stuff: c.r.stuff - 10, control: c.r.control - 8, movement: c.r.movement - 6, velocity: (c.r.velocity ?? 50) - 6, stamina: c.r.stamina - 25 };
  } else {
    const s = lastSeason(p, 'bat');
    Object.assign(c, {
      avg: s?.ab ? rate3(s.avg) : '', obp: s?.ab ? rate3(s.obp) : '', slg: s?.ab ? rate3(s.slg) : '',
      hr: s?.hr ?? 0, rbi: s?.rbi ?? 0, pa: s?.pa ?? 0, vsL: '', vsR: '', season: s?.season,
    });
    const t = tiredBy(p);
    if (t) c.r = { ...c.r, contact: c.r.contact - t, power: c.r.power - t, speed: c.r.speed - t, range: c.r.range - t };
    if (p.rust) { const r = Math.min(8, p.rust * 1.1); c.r = { ...c.r, contact: c.r.contact - r, eye: c.r.eye - r * 0.6, avoidK: (c.r.avoidK ?? 50) - r * 0.7, power: c.r.power - r * 0.4 }; }
  }
  return c;
}

/**
 * A team in the shape the match screen and engine use, from its parts.
 * @param {any} club  club record (city, name, colours)
 * @param {{lineup:{p:any,pos:string}[], bench:any[], starter:any, pen:{p:any, role:string, status?:string, last3?:number}[], instr?:any, user?:boolean, record?:string}} parts
 */
export function teamFrom(club, parts) {
  const team = {
    id: club.id, city: club.city, full: club.full, name: club.name, abbr: club.abbr, kitA: club.kitA, kitB: club.kitB, acc: club.kitB,
    record: parts.record ?? '', user: !!parts.user, instr: { ...(parts.instr || {}) }, sx: parts.sx,
    day: parts.day, big: !!parts.big, post: !!parts.post,
  };
  team.lineup = parts.lineup.map(({ p, pos }) => {
    // away from his best position he fields worse, by how well he knows the position (never shown)
    return matchCopy(p, team, { pos, r: fieldingAt(p, pos) });
  });
  team.bench = parts.bench.map((p) => matchCopy(p, team, { pos: p.pos }));
  team.pitcher = matchCopy(parts.starter, team, { role: 'Starter', today: null, status: parts.starterStatus || 'Rested' });
  team.bullpen = parts.pen.map((x) => matchCopy(x.p, team, { role: x.role, status: x.status, last3: x.last3 }));
  return team;
}

/**
 * The club as set in its tactics: lineup against this starter's hand, bench, starter, bullpen roles.
 * The season builds its own teams in season/sim.js.
 */
export function matchTeam(org, st, { oppHand = 'R', starterIdx = 0, user = false } = {}) {
  const club = org.club;
  const lineup = (oppHand === 'L' ? st.lineupL : st.lineupR).map(({ id, pos }) => ({ p: playerIn(org, id), pos }));
  const inLineup = new Set(lineup.map((s) => s.p.id));
  const starterId = st.rotation[starterIdx % st.rotation.length];
  const pen = activePitchers(org, st).filter((p) => p.id !== starterId && !st.rotation.includes(p.id))
    .map((p) => ({ p, role: st.pen[p.id] || 'Middle' }));
  for (const id of st.rotation) if (id !== starterId) pen.push({ p: playerIn(org, id), role: 'Long', status: 'Unavailable' });
  return teamFrom(club, {
    lineup, bench: activeHitters(org, st).filter((p) => !inLineup.has(p.id)), starter: playerIn(org, starterId), pen,
    instr: st.instr, sx: strengths(org, st), user, record: (() => { const r = lastRecord(club); return r ? `${r[0]}-${r[1]}` : ''; })(),
  });
}

/** Map of id -> player for the match screen's player cards and the narrator. */
export function playersMap(...teams) {
  const m = new Map();
  for (const t of teams) for (const p of [...t.lineup, ...t.bench, t.pitcher, ...t.bullpen]) m.set(p.id, p);
  return m;
}
