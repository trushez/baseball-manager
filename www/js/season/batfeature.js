// A write-up of one hitter's night, built from the game's event log: what he did at each plate appearance, the swing that
// mattered most and how the night will look in the record book. It stands in for the match report in the inbox story.
import { Rng } from '../core/rng.js';
import { fullName } from '../data/world.js';

const NUMW = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve'];
const num = (n) => NUMW[n] ?? String(n);
const cap = (s) => s[0].toUpperCase() + s.slice(1);
const ORD = ['', 'first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth', 'ninth', 'tenth', 'eleventh', 'twelfth'];
const ord = (i) => ORD[i] || `${i}th`;
const HIT = new Set(['1B', '2B', '3B', 'HR']);
const OUTS = new Set(['K', 'GO', 'FO', 'LO', 'PO', 'DP', 'FC', 'SF', 'SAC', 'BUNT_OUT', 'LDP']);
const SIDE = { L: 'to left', C: 'to centre', R: 'to right' };

/** Every plate appearance he had, with the situation he walked into and what it did to the score. */
export function battingFacts(eng, bid) {
  const pas = [];
  let start = null, pitches = 0;
  for (const e of eng.events) {
    if (e.type === 'paStart' && e.data.batterId === bid) { start = e; pitches = 0; continue; }
    if (start && e.type === 'pitch') pitches++;
    if (e.type !== 'paEnd' || e.data.batterId !== bid) continue;
    const b = start?.board || e.board;
    const bat = e.half === 'top' ? 'away' : 'home', fld = bat === 'away' ? 'home' : 'away';
    const before = b.score[bat] - b.score[fld];
    const after = e.board.score[bat] - e.board.score[fld];
    pas.push({
      inning: e.inning, result: e.data.result, bip: e.data.bip, dir: e.data.dir, pitcherId: e.data.pitcherId, pitches,
      scored: (e.data.scored || []).length, outs: b.outs, on: b.bases.filter(Boolean).length, risp: !!(b.bases[1] || b.bases[2]), full: b.bases.every(Boolean),
      before, after, balls: e.board.balls, strikes: e.board.strikes, bat,
    });
    start = null;
  }
  const steals = eng.events.filter((e) => e.type === 'steal' && e.data.runnerId === bid && e.data.success).length;
  return { pas, steals };
}

function did(pa, rng) {
  const side = SIDE[pa.dir] || '';
  const hr = pa.scored;
  switch (pa.result) {
    case '1B': return pa.bip === 'GB' ? rng.pick(['bounced a single through the infield', 'found a hole in the infield for a single']) : pa.bip === 'FB' ? 'dropped a single into the outfield' : rng.pick([`lined a single ${side}`.trim(), 'ripped a single']);
    case '2B': return rng.pick([`doubled ${side}`.trim(), `lined a double ${side}`.trim(), 'hit a double into the gap']);
    case '3B': return `tripled ${side}`.trim();
    case 'HR': return hr >= 4 ? 'hit a grand slam' : hr === 3 ? `hit a three-run homer ${side}`.trim() : hr === 2 ? `hit a two-run homer ${side}`.trim() : `homered ${side}`.trim();
    case 'BB': return 'drew a walk';
    case 'HBP': return 'was hit by a pitch';
    case 'K': return 'struck out';
    case 'DP': case 'LDP': return 'grounded into a double play';
    case 'SF': return 'hit a sacrifice fly';
    case 'SAC': case 'BUNT_OUT': return 'bunted';
    case 'LO': return 'lined out';
    case 'PO': return 'popped out';
    case 'FO': return 'flied out';
    case 'E': return 'reached on an error';
    case 'FC': return 'reached on a fielder\'s choice';
    default: return 'grounded out';
  }
}

/** The hitter's story: three or four paragraphs, none of them the match report. */
export function batFeature(p, eng, rec, S, ctx = {}) {
  const f = battingFacts(eng, p.id);
  if (!f.pas.length || !S) return [];
  const rng = new Rng(`bf-${rec.id}-${p.id}`);
  const pick = (...o) => rng.pick(o);
  const nm = fullName(p), last = p.last, us = ctx.us || 'his club', opp = ctx.opp || 'the other side';
  const vs = (pa) => ctx.name?.(pa.pitcherId) || null;
  const hits = f.pas.filter((x) => HIT.has(x.result));
  const out = [];

  // the night in a sentence
  const nh = S.H, ab = S.AB;
  const kinds = [];
  if (S.HR) kinds.push(S.HR === 1 ? 'a home run' : `${num(S.HR)} home runs`);
  if (S['3B']) kinds.push(S['3B'] === 1 ? 'a triple' : `${num(S['3B'])} triples`);
  if (S['2B']) kinds.push(S['2B'] === 1 ? 'a double' : `${num(S['2B'])} doubles`);
  const extra = kinds.length ? ` with ${kinds.join(' and ')}` : '';
  const rbi = S.RBI ? `, driving in ${S.RBI === 1 ? 'a run' : num(S.RBI)}` : '';
  let open;
  if (nh === ab && ab >= 4) open = `${nm} could not make an out. He went ${num(nh)} for ${num(ab)}${extra}${rbi} for ${us} against ${opp}, and by the end of it the pitchers had run out of answers.`;
  else if (S.HR >= 3) open = `${nm} had the kind of night that gets talked about for years: ${num(S.HR)} home runs for ${us} against ${opp}${rbi}.`;
  else if (nh >= 3) open = `${nm} was in everything for ${us} against ${opp}, going ${num(nh)} for ${num(ab)}${extra}${rbi}.`;
  else if (S.HR) open = `${nm} made his mark for ${us} against ${opp}, going ${num(nh)} for ${num(ab)}${extra}${rbi}.`;
  else open = `${nm} did the damage for ${us} against ${opp}, going ${num(nh)} for ${num(ab)}${extra}${rbi}.`;
  out.push(open);

  // plate appearance by plate appearance, as running sentences
  let lastWho = null;
  const clause = (pa) => {
    const who = HIT.has(pa.result) ? vs(pa) : null;
    const tail = who && who !== lastWho ? ` off ${who}` : '';
    if (who) lastWho = who;
    const sit = pa.result === 'HR' && pa.before < 0 && pa.after > 0 ? ' to put his side in front' : pa.result === 'HR' && pa.before < 0 && pa.after === 0 ? ' to tie it' : '';
    return `${did(pa, rng)}${tail} in the ${ord(pa.inning)}${sit}`;
  };
  const shown = f.pas.length <= 5 ? f.pas : f.pas.filter((x) => HIT.has(x.result) || x.result === 'BB');
  if (shown.length) {
    const cl = shown.map(clause);
    const first = cl.slice(0, 3), rest = cl.slice(3);
    let text = `He ${first.join(', then ')}.`;
    if (rest.length) text += ` ${pick('Later he', 'After that he', 'Before the night was out he')} ${rest.join(', then ')}.`;
    out.push(`${text}${f.pas.length > 5 ? ` He came to the plate ${num(f.pas.length)} times in all.` : ''}`);
  }

  // the swing that mattered
  const key = [...f.pas].filter((x) => x.scored > 0).sort((a, b) => ((b.risp || b.result === 'HR' ? 1 : 0) + (b.outs === 2 ? 1 : 0) + (b.before <= 0 && b.after > 0 ? 3 : 0) + (b.before < 0 && b.after === 0 ? 2 : 0) + b.scored * 0.5) - ((a.risp || a.result === 'HR' ? 1 : 0) + (a.outs === 2 ? 1 : 0) + (a.before <= 0 && a.after > 0 ? 3 : 0) + (a.before < 0 && a.after === 0 ? 2 : 0) + a.scored * 0.5))[0];
  const bits = [];
  if (key) {
    const where = key.result === 'HR' && key.scored > 1 ? null : key.full ? 'with the bases loaded' : key.outs === 2 && key.risp ? 'with two outs and a runner in scoring position' : key.risp ? 'with a runner in scoring position' : null;
    const swing = key.before <= 0 && key.after > 0 ? `The swing that mattered was in the ${ord(key.inning)}, when ${last} ${did(key, rng)}${where ? ` ${where}` : ''} and put ${us} in front.`
      : key.before < 0 && key.after === 0 ? `The swing that mattered was in the ${ord(key.inning)}, when ${last} ${did(key, rng)}${where ? ` ${where}` : ''} to tie the game.`
        : where ? `His biggest moment came in the ${ord(key.inning)}, when he ${did(key, rng)} ${where}.` : null;
    if (swing) bits.push(swing);
  }
  const long = [...f.pas].sort((a, b) => b.pitches - a.pitches)[0];
  if (long && long.pitches >= 8 && (HIT.has(long.result) || long.result === 'BB')) bits.push(`In the ${ord(long.inning)} he saw ${num(long.pitches)} pitches from ${vs(long) || 'the pitcher'} before he ${did(long, rng)}.`);
  if (f.steals >= 2) bits.push(`He also stole ${num(f.steals)} bases, which kept the defence guessing all night.`);
  if (bits.length) out.push(bits.join(' '));

  // how it reads
  const quiet = f.pas.filter((x) => x.result === 'K').length, walks = f.pas.filter((x) => x.result === 'BB').length;
  const verdict = nh === ab && ab >= 4 ? pick(`Nobody who watched ${last} that night would have wanted to pitch to him, and it showed in how carefully the late innings went.`, `It was the sort of night a hitter waits a whole season for, and ${last} did not waste a swing of it.`)
    : S.HR >= 2 ? pick(`Two swings were enough to decide the evening, and both of them were hit hard.`, `${cap(last)} got ahead of the baseball twice and did not miss it.`)
      : quiet === 0 && nh >= 2 ? pick(`He never struck out, and every at-bat came with a plan that worked.`, walks ? `He never struck out and made the pitchers work for everything, and it paid off.` : `He put the ball in play every time up, and the other side paid for it.`)
        : pick(`${cap(last)} gave ${us} exactly what a lineup needs from its middle, and ${ctx.won ? 'the win followed' : 'it deserved better than the result'}.`, `It was a night that ${ctx.won ? 'the whole clubhouse will remember fondly' : 'will be little comfort in the loss, though it should be remembered'}.`);
  out.push(verdict);
  return out;
}
