// A write-up of one pitcher's outing, built from the game's own events, for the inbox when a start is worth a story.
import { Rng } from '../core/rng.js';
import { fullName } from '../data/world.js';

const NUMW = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen', 'twenty'];
const num = (n) => NUMW[n] ?? String(n);
const cap = (s) => s[0].toUpperCase() + s.slice(1);
const plural = (n, w, ws = `${w}s`) => `${num(n)} ${n === 1 ? w : ws}`;
const HITS = new Set(['1B', '2B', '3B', 'HR']);
const ORD = ['', 'first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth', 'ninth', 'tenth', 'eleventh', 'twelfth'];
const ipWords = (outs) => {
  const w = Math.floor(outs / 3), r = outs % 3;
  return r === 0 ? `${num(w)} innings` : `${num(w)}${r === 1 ? ' and one third' : ' and two thirds'} innings`;
};

/** Facts about one pitcher's night, read from the event log. */
export function pitchingFacts(eng, pid) {
  const f = { pa: [], pitches: [], inn: new Map(), firstRunner: null };
  let cur = null, lastInn = null;
  for (const e of eng.events) {
    if (e.type === 'paStart') cur = e.data.pitcherId;
    if (cur !== pid) continue;
    if (e.type === 'pitch') f.pitches.push(e.data);
    if (e.type !== 'paEnd' || e.data.pitcherId !== pid) continue;
    const d = e.data;
    const retired = d.result === 'K' || (d.outsOnPlay || 0) > 0;
    f.pa.push({ inning: e.inning, result: d.result, retired, hit: HITS.has(d.result), looking: !!d.looking, scored: (d.scored || []).length });
    const row = f.inn.get(e.inning) || { outs: 0, k: 0, reach: 0, pa: 0, n: 0 };
    row.pa++; if (retired) row.outs += Math.max(1, d.outsOnPlay || 1); else row.reach++;
    if (d.result === 'K') row.k++;
    f.inn.set(e.inning, row);
    if (!retired && f.firstRunner == null) f.firstRunner = { inning: e.inning, nth: f.pa.length, result: d.result };
    lastInn = e.inning;
  }
  f.last = lastInn;
  // longest run of consecutive batters retired
  let run = 0, best = 0, bestEnd = 0;
  f.pa.forEach((x, i) => { if (x.retired) { run++; if (run > best) { best = run; bestEnd = i; } } else run = 0; });
  f.streak = best; f.streakEnd = bestEnd;
  f.looking = f.pa.filter((x) => x.result === 'K' && x.looking).length;
  f.swinging = f.pa.filter((x) => x.result === 'K' && !x.looking).length;
  f.perfect = [...f.inn.values()].filter((r) => r.outs >= 3 && r.reach === 0 && r.pa === 3).length;
  f.sideK = [...f.inn.entries()].filter(([, r]) => r.k >= 3).map(([i]) => i);
  f.whiffs = f.pitches.filter((x) => x.result === 'swinging').length;
  f.strikes = f.pitches.filter((x) => x.result !== 'ball').length;
  const mix = new Map();
  for (const x of f.pitches) { const m = mix.get(x.pitch) || { n: 0, top: 0, whiff: 0 }; m.n++; m.top = Math.max(m.top, x.mph || 0); if (x.result === 'swinging') m.whiff++; mix.set(x.pitch, m); }
  f.mix = [...mix.entries()].map(([name, m]) => ({ name, ...m })).sort((a, b) => b.n - a.n);
  return f;
}

/** The pitching story: three or four paragraphs on the outing, none of it the match report. */
export function pitchFeature(p, eng, rec, S, ctx = {}) {
  const f = pitchingFacts(eng, p.id);
  if (!f.pa.length || !S) return [];
  const rng = new Rng(`pf-${rec.id}-${p.id}`);
  const pick = (...o) => rng.pick(o);
  const outs = S.pOuts, nm = fullName(p), last = p.last;
  const opp = ctx.opp || 'the opposition', home = !!ctx.home;
  const pc = S.pitches || f.pitches.length, pct = pc ? Math.round((100 * f.strikes) / pc) : 0;
  const cg = S.GS && outs >= 27 && !ctx.lostLead;
  const out = [];

  // the headline of the night
  const hits = S.pH, runs = S.pR, bb = S.pBB, k = S.pK;
  let open;
  if (cg && runs === 0) open = `${nm} finished what he started. He took the ball for ${ctx.us || 'his club'} and nobody took it from him, ${ipWords(outs)} without a run against ${opp}, on ${plural(hits, 'hit')}, ${plural(bb, 'walk')} and ${plural(k, 'strikeout')}.`;
  else if (cg) open = `${nm} went the whole way for ${ctx.us || 'his club'}, ${ipWords(outs)} against ${opp} with no bullpen call, and he gave up ${plural(runs, 'run')} on ${plural(hits, 'hit')} while striking out ${num(k)}.`;
  else if (runs === 0) open = `${nm} was untouchable for ${ipWords(outs)} against ${opp}, with ${plural(hits, 'hit')}, ${plural(bb, 'walk')} and ${plural(k, 'strikeout')} to show for a night in which nothing got through to the scoreboard.`;
  else open = `${nm} ${k >= 10 ? 'was overpowering' : 'was sharp'} against ${opp}, ${k >= 6 ? `striking out ${num(k)}` : `working through`} ${k >= 6 ? 'in' : ''} ${ipWords(outs)} and giving up ${plural(runs, 'run')} on ${plural(hits, 'hit')}${k >= 6 ? '' : ` with ${plural(k, 'strikeout')}`}.`.replace(/\s+/g, ' ').replace(' ,', ',');
  out.push(open + (pc ? ` It took him ${pc} pitches, ${pct} per cent of them strikes${cg && pc <= 100 ? ', which is about as economical as a complete game gets' : ''}.` : ''));

  // how the night unfolded
  const bits = [];
  if (f.firstRunner) {
    const fr = f.firstRunner;
    if (fr.nth > 9 && fr.inning >= 4) bits.push(`The first ${home ? 'visitor' : 'home hitter'} to get on base did not manage it until the ${ORD[fr.inning] || `${fr.inning}th`} inning, which means ${last} had retired ${num(fr.nth - 1)} in a row before anyone reached.`);
    else bits.push(`${cap(opp)} did get a runner on in the ${ORD[fr.inning] || `${fr.inning}th`} inning, by way of ${fr.result === 'BB' ? 'a walk' : fr.result === 'HBP' ? 'a hit batter' : fr.result === 'HR' ? 'a home run' : 'a hit'}, but ${last} settled straight back in.`);
  } else bits.push(`${cap(opp)} never put a runner on base, and ${last} was perfect for the night.`);
  if (f.streak >= 8) bits.push(`His longest stretch was ${num(f.streak)} batters in a row retired, the sort of run that has the dugout stop talking about the bases altogether.`);
  if (f.perfect >= 5) bits.push(`${cap(num(f.perfect))} of his innings were over in three batters, with nobody reaching.`);
  else if (f.perfect >= 3) bits.push(`He sent the side down in order in ${num(f.perfect)} of his innings.`);
  if (f.sideK.length) bits.push(`He struck out the side in the ${f.sideK.map((i) => ORD[i] || `${i}th`).join(' and the ')}.`);
  if (bits.length) out.push(bits.join(' '));

  // the strikeouts and the stuff
  const st = [];
  if (k >= 4) st.push(`Of his ${num(k)} strikeouts, ${num(f.swinging)} came with the hitter swinging through and ${num(f.looking)} with the bat on the shoulder${f.looking > f.swinging ? ', which says plenty about how well he was hitting the corners' : f.swinging >= k * 0.8 ? ', which says plenty about how hard the ball was to square up' : ''}.`);
  if (f.mix.length) {
    const a = f.mix[0], b = f.mix[1];
    st.push(`${cap(a.name.toLowerCase())}s made up most of the evening${a.top ? `, topping out at ${a.top} miles an hour` : ''}${b ? `, and he mixed in ${b.n} ${b.name.toLowerCase()}s${b.whiff >= 3 ? ` that drew ${num(b.whiff)} swings and misses` : ''}` : ''}.`);
  }
  if (f.whiffs >= 8) st.push(`In all the hitters swung and missed ${f.whiffs} times, and ${pick('that kind of command rarely goes unnoticed', 'scouts in the stands will have written it down', 'it was the sort of control a manager does not see every week')}.`);
  if (st.length) out.push(st.join(' '));

  // the verdict
  const win = ctx.won;
  const close = pick(
    `${cap(last)} gave ${ctx.us || 'his club'} everything a starter can give, ${win ? 'and the team took the win it had earned from him' : 'and the club has little to show for it, which is no reflection on him'}.`,
    `For ${last} it was ${cg ? 'a full night\'s work, finished properly' : 'a night to remember'}, and ${win ? 'the result matched the pitching' : 'it deserved a better result'}.`,
    `It was a performance that ${pick('earns him a long look', 'the whole rotation will be measured against', 'will be talked about in the clubhouse for a while')}, ${win ? 'and the win is the least he deserved' : 'whatever the final score says'}.`);
  out.push(close);
  return out;
}
