// The written game report, from the same lines and the same story-watching as the radio call: the key
// run-scoring plays in past tense, then the stories of the game (a debut, a milestone, a pitcher who
// lost the plate). Works on any finished engine game, watched or simulated.
import { LINES } from './lines.js';
import { StoryWatch } from './story.js';
import { Rng } from '../core/rng.js';

const NUM = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];
const ORD = ['', 'first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth', 'ninth', 'tenth', 'eleventh', 'twelfth', 'thirteenth', 'fourteenth', 'fifteenth'];
const WHAT = { '1B': 'single', '2B': 'double', '3B': 'triple', SF: 'sacrifice fly', GO: 'groundout', FO: 'fly ball', BB: 'bases-loaded walk', HBP: 'hit by pitch', FC: 'fielder\'s choice', SAC: 'sacrifice bunt', LO: 'line drive', PO: 'pop-up' };
const FIELD = { L: 'left', C: 'centre', R: 'right' };

/**
 * @param {any} eng finished engine game
 * @param {{ teams:{away:any, home:any}, players:Map<string,any>, story?:any, seed:string, mentioned?:Set<string> }} o
 * @returns {{ moments:string[], stories:string[] }}
 */
export function reportLines(eng, { teams, players, story = {}, seed, mentioned = new Set() }) {
  const rng = new Rng(`report-${seed}`);
  const name = (id, full) => {
    const p = players.get(id);
    if (!p) return 'a pinch runner';
    if (full || !mentioned.has(id)) { mentioned.add(id); return `${p.first} ${p.last}`; }
    return p.last;
  };
  const fill = (t, vars) => t.replace(/\{(\w+)\}/g, (m, k) => {
    const lower = k.toLowerCase();
    if (['bat', 'pit', 'run'].includes(lower) && vars[lower] != null) return players.has(vars[lower]) ? name(vars[lower]) : vars[lower];
    return vars[k] ?? m;
  });
  const pick = (id) => {
    const pool = LINES[id].lines.filter((l) => l.r);
    let r = rng.next() * pool.reduce((a, l) => a + (l.w || 1), 0);
    for (const l of pool) { r -= l.w || 1; if (r < 0) return l.r; }
    return pool[0].r;
  };
  const sentence = (t) => `${t.charAt(0).toUpperCase()}${t.slice(1)}.`;

  // run-scoring plays, and the one that put the winners ahead for good
  const plays = [];
  let lead = 0, decisive = null;
  const winKey = eng.score.home > eng.score.away ? 'home' : 'away';
  const watch = new StoryWatch({ teams, ctx: story });
  const stories = [];
  for (const e of eng.events) {
    for (const s of watch.see(e)) if (s.report && LINES[s.id]?.lines.some((l) => l.r)) stories.push({ ...s, seq: e.seq });
    if (e.type !== 'paEnd' && e.type !== 'wildPitch') continue;
    const runs = e.data.scored?.length || 0;
    const now = Math.sign(e.board.score.home - e.board.score.away);
    if (runs && e.type === 'paEnd') {
      const side = e.half === 'top' ? 'away' : 'home';
      const play = { e, side, runs, result: e.data.result, imp: runs * 2 + (e.data.result === 'HR' ? 3 : 0) + (e.inning >= 7 ? 1 : 0) };
      plays.push(play);
      if (now !== lead && now === (winKey === 'home' ? 1 : -1)) decisive = play;
    }
    lead = now;
  }
  if (decisive) decisive.imp += 10;
  const chosen = plays.filter((p) => p.result !== 'E' && p.result !== 'DP').sort((a, b) => b.imp - a.imp).slice(0, 3).sort((a, b) => a.e.seq - b.e.seq);
  const walkOff = eng.events.some((e) => e.type === 'halfEnd' && e.data.walkOff);
  const moments = chosen.map((p) => {
    const e = p.e, d = e.data;
    const vars = { bat: d.batterId, pit: d.pitcherId, inn: ORD[e.inning] || `${e.inning}th`, field: FIELD[d.dir] || 'centre', runsWord: NUM[p.runs], city: teams[p.side].city, what: WHAT[d.result] || 'hit' };
    if (d.result === 'HR') vars.what = p.runs === 4 ? 'grand slam' : p.runs > 1 ? `${NUM[p.runs]}-run homer` : 'home run';
    let id;
    if (p === decisive && walkOff && e === eng.events.filter((x) => x.type === 'paEnd').at(-1)) id = 'WALK_OFF';
    else if (d.result === 'HR') id = p.runs === 4 ? 'HR_SLAM' : p.runs > 1 ? 'HR_MULTI' : 'HR_SOLO';
    else if (p === decisive) id = 'GO_AHEAD';
    else { id = 'RBI'; vars.runsWord = p.runs === 1 ? 'a run' : `${NUM[p.runs]} runs`; }
    let t = fill(pick(id), vars);
    if (p === decisive && id.startsWith('HR')) t += `, and ${teams[p.side].city} never trailed again`;
    return sentence(t);
  });

  // stories, the most remarkable first, one per player
  const seen = new Set();
  const told = stories.sort((a, b) => (b.weight || 1) - (a.weight || 1)).filter((s) => {
    const who = s.vars.bat || s.vars.pit || s.id;
    if (seen.has(who)) return false;
    seen.add(who);
    return true;
  }).slice(0, 3).sort((a, b) => a.seq - b.seq)
    .map((s) => sentence(fill(pick(s.id), { ...s.vars, inn: s.vars.inn || '', nWord: s.vars.nWord ?? NUM[s.vars.n] ?? s.vars.n })));
  return { moments, stories: told };
}
