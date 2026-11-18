// Injuries: who gets hurt in a game, what it is, and how long it takes. Each player carries a hidden
// proneness (0.6 to 1.7) fixed by his id, so the same players get hurt more often save after save.
import { Rng } from '../core/rng.js';
import { isPitcher, fullName } from '../data/world.js';
import { game } from '../state.js';
import { dayNo } from './calendar.js';

// [name, weight, shortest days, longest days]
const HITTER = [
  ['bruised hand', 22, 1, 4], ['sore back', 10, 2, 8], ['tight hamstring', 9, 2, 6], ['hamstring strain', 13, 12, 35],
  ['oblique strain', 8, 18, 45], ['sprained ankle', 9, 7, 25], ['sprained wrist', 6, 10, 30], ['broken hand', 3, 35, 70],
  ['shoulder strain', 5, 15, 50], ['hip flexor strain', 5, 10, 28], ['concussion', 3, 7, 21], ['calf strain', 6, 10, 30],
  ['knee sprain', 4, 14, 45], ['torn knee ligament', 0.6, 240, 330],
];
const PITCHER = [
  ['blister', 8, 4, 15], ['stiff neck', 6, 1, 5], ['forearm tightness', 12, 15, 40], ['elbow inflammation', 10, 15, 45],
  ['shoulder inflammation', 12, 20, 60], ['lat strain', 6, 40, 90], ['oblique strain', 7, 20, 45], ['back tightness', 6, 5, 20],
  ['hamstring strain', 4, 12, 30], ['torn elbow ligament', 3.5, 60, 90], ['rotator cuff strain', 3, 45, 120],
  ['sore arm', 10, 1, 6],
];

// chance per appearance before proneness and fatigue
const RATE = { hitter: 0.0072, starter: 0.034, reliever: 0.011 };

export function proneness(p) {
  const r = new Rng(`prone-${p.id}`);
  return 0.6 + 1.1 * r.next() ** 1.6;
}

/**
 * Roll for injuries after a game.
 * @param {Rng} rng
 * @param {{p:any, kind:'hitter'|'starter'|'reliever', tired?:number}[]} played
 * @returns {{p:any, type:string, days:number}[]}
 */
export function rollInjuries(rng, played) {
  const out = [];
  for (const { p, kind, tired = 0 } of played) {
    // tiredness raises the risk; for a pitcher worked hard in the days before, sharply
    const chance = RATE[kind] * proneness(p) * (1 + Math.max(0, tired - 60) / (kind === 'hitter' ? 40 : 22)) * (p.age >= 33 ? 1.25 : 1) * (isPitcher(p) && p.r?.dura != null ? Math.exp(-0.012 * (p.r.dura - 50)) : 1);
    if (!rng.chance(chance)) continue;
    const table = isPitcher(p) ? PITCHER : HITTER;
    const [type, , lo, hi] = table[Number(rng.weighted(Object.fromEntries(table.map((t, i) => [i, t[1]]))))];
    out.push({ p, type, days: rng.int(lo, hi) });
  }
  return out;
}

/**
 * Injuries where the medical staff can operate instead of resting him. Rest is quicker or avoids the knife,
 * but risks a setback (risk); surgery takes the days given and seldom goes wrong (opRisk). min: only when the
 * injury is at least this many days. A torn ligament rested and torn again means surgery after all.
 */
export const SURGERY = {
  'torn elbow ligament': { op: 'Tommy John surgery', days: [400, 480], risk: 0.45, opRisk: 0.05, rest: 'rest and a platelet-rich plasma injection' },
  'rotator cuff strain': { op: 'surgery to repair the rotator cuff', days: [240, 330], risk: 0.3, opRisk: 0.06, rest: 'rest and strengthening work' },
  'shoulder inflammation': { min: 40, op: 'arthroscopic surgery on the shoulder', days: [100, 150], risk: 0.28, opRisk: 0.05, rest: 'rest and a cortisone injection' },
  'elbow inflammation': { min: 30, op: 'arthroscopic surgery to clean up the elbow', days: [55, 80], risk: 0.25, opRisk: 0.04, rest: 'rest and anti-inflammatories' },
  'knee sprain': { min: 28, op: 'arthroscopic surgery on the knee', days: [35, 55], risk: 0.22, opRisk: 0.04, rest: 'rest and a brace' },
  'broken hand': { op: 'surgery to pin the bone', days: [38, 50], risk: 0.18, opRisk: 0.03, rest: 'letting the bone heal in a cast' },
};
export const surgeryFor = (inj) => { const s = SURGERY[inj?.type]; return s && !inj.surgery && inj.days >= (s.min || 0) ? s : null; };

/** The day (counted from the injury) a setback strikes, if one is coming. Decided when the injury happens or the treatment changes. */
export function planSetback(p, inj, rng) {
  delete inj.sb;
  const s = SURGERY[inj.type];
  const chance = inj.surgery ? (s?.opRisk ?? 0.05) : s && inj.days >= (s.min || 0) ? s.risk : inj.days >= 15 ? 0.07 : inj.days >= 8 ? 0.03 : 0;
  const done = inj.used || 0; // days already gone when the plan is made
  if (rng.chance(chance * proneness(p) / 1.05)) inj.sb = done + rng.int(Math.round((inj.days - done) * 0.35), Math.round((inj.days - done) * 0.9));
}

/** A new injury: its setback plan, and for a computer club the medical staff's choice of treatment. */
export function startInjury(p, type, days, d, rng, choose = false) {
  const inj = { type, days, since: d };
  p.hurt = (p.hurt || 0) + days; // a long layoff costs some of his ceiling when the year is totted up (ability.js)
  if (choose && surgeryFor(inj) && rng.chance(0.5)) operate(p, inj, d, rng);
  else planSetback(p, inj, rng);
  return inj;
}

/** Surgery: the clock restarts from today with the operation's recovery time. */
export function operate(p, inj, d, rng) {
  const s = SURGERY[inj.type];
  p.hurtKind = 'surgery';
  inj.used = d - inj.since;
  inj.days = inj.used + rng.int(s.days[0], s.days[1]);
  inj.surgery = s.op;
  planSetback(p, inj, rng);
}

/** A setback today: more days out, or a rested ligament torn again and now surgery. Returns words for the news. */
export function setback(p, inj, d, rng) {
  delete inj.sb;
  const s = SURGERY[inj.type];
  inj.setbacks = (inj.setbacks || 0) + 1;
  { const e = p.injuryLog?.at(-1); if (e) { e.setbacks = inj.setbacks; e.days = inj.days; e.text = injuryWords(inj); } }
  if (inj.type === 'torn elbow ligament' && !inj.surgery) {
    operate(p, inj, d, rng);
    delete inj.sb;
    return `the ligament has given way again and he needs ${s.op}. He will be out about ${Math.round((inj.days - inj.used) / 30)} months`;
  }
  const base = inj.days - (inj.used || 0);
  const add = Math.max(5, rng.int(Math.round(base * 0.25), Math.round(base * 0.5)));
  inj.days += add;
  return `he has had a setback${inj.surgery ? ' in his recovery from surgery' : ''} and will need about ${add >= 14 ? `${Math.round(add / 7)} more weeks` : `${add} more days`}`;
}

/** After a long layoff: games in the minors to shake off the rust before he is ready. */
export const rehabGames = (p, inj) => (inj.days < 20 ? 0 : p.kind === 'pit' ? Math.min(5, Math.max(2, Math.round(inj.days / 20))) : Math.min(8, Math.max(3, Math.round(inj.days / 10))));

export const injuryWords = (inj) => {
  if (!inj) return '';
  if (inj.days <= 6) return `${inj.type}, day to day`;
  if (inj.days < 21 && !inj.surgery) return `${inj.type}, out ${Math.round(inj.days / 7) || 1} week${Math.round(inj.days / 7) > 1 ? 's' : ''}`;
  const what = inj.surgery ? `${inj.type}, ${inj.surgery}` : inj.type;
  if (inj.days < 120) return `${what}, out about ${Math.round(inj.days / 7)} weeks`;
  return `${what}, out about ${Math.round(inj.days / 30)} months`;
};

/** Your answer to the doctors' question in the inbox. Returns words for a toast, or why it cannot be done now. */
export function chooseTreatment(m, id) {
  const c = m.choice, p = game.world.players.get(c.pid), inj = p?.injury;
  if (c.picked) return null;
  if (!inj || inj.since !== c.since) return 'He is no longer injured with this.';
  if (id === 'surgery') operate(p, inj, dayNo(game.date), new Rng(`op-${p.id}-${inj.since}-${game.luck}`));
  c.picked = id;
  return id === 'surgery' ? `${fullName(p)} will have ${inj.surgery}: ${injuryWords(inj)}.` : `${fullName(p)} will rest: ${injuryWords(inj)}.`;
}
/** The choice can be made in the first week; after that the doctors have gone ahead with rest. */
export const choiceOpen = (m) => !!m.choice && !m.choice.picked && (game.date.getTime() - m.date) / 864e5 <= 7 && game.world.players.get(m.choice.pid)?.injury?.since === m.choice.since;
