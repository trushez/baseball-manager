// A season in review: everything the screen shows for one finished year, worked out from what the game already keeps
// (each player's season lines, game.history, the awards). Nothing here is stored again, so it works for any past year.
import { game } from '../state.js';
import { isPitcher, line, HIST, fullName, mainPos } from '../data/world.js';
import { tboPlus, tbaMinus } from './tb.js';

const W = () => game.world;

/** Years that can be reviewed, newest first: every archived season. */
export const reviewYears = () => Object.keys(game.history || {}).map(Number).sort((a, b) => b - a);

/** One player's lines for a year at one club (and in the majors or the minors): { p, kind, s } or null. */
function lineFor(p, kind, year, orgId, minors) {
  const rows = (p.hist?.[kind] || []).filter((r) => r[0] === year && (minors ? r[1] !== 'MLB' : r[1] === 'MLB') && String(r[2]).split('-')[0] === orgId);
  if (!rows.length) return null;
  const sum = [year, [...new Set(rows.map((r) => r[1]))].join('/'), rows.map((r) => r[2]).join('/')];
  HIST[kind].forEach((_, i) => sum.push(rows.reduce((a, r) => a + r[i + 3], 0)));
  return line(kind, sum);
}

/** Everyone who played for a club's major league team (or its minor league clubs) in a year, with his lines and his TB index. */
export function clubPlayers(orgId, year, { minors = false } = {}) {
  const out = [];
  const lvl = (s) => String(s.level).split('/')[0];
  for (const p of W().players.values()) {
    const kind = isPitcher(p) ? 'pit' : 'bat';
    const s = lineFor(p, kind, year, orgId, minors);
    if (!s) continue;
    const level = minors ? lvl(s) : 'MLB';
    const idx = kind === 'bat' ? tboPlus(s, year, level) : tbaMinus(s, p, year, level);
    out.push({ p, kind, s, idx, level, good: idx != null && (kind === 'bat' ? idx : 200 - idx) });
  }
  return out;
}

const enough = (x, minors) => (x.kind === 'bat' ? x.s.pa >= (minors ? 150 : 200) : x.s.outs >= (minors ? 120 : 150));
const best = (rows, kind, n, minors) => rows.filter((x) => x.kind === kind && x.good != null && enough(x, minors)).sort((a, b) => b.good - a.good).slice(0, n);
const worst = (rows, kind, minors) => rows.filter((x) => x.kind === kind && x.good != null && enough(x, minors)).sort((a, b) => a.good - b.good)[0] || null;

const wordsWins = (d) => (d === 0 ? 'the same number of wins as the year before' : `${Math.abs(d)} ${Math.abs(d) === 1 ? 'win' : 'wins'} ${d > 0 ? 'more' : 'fewer'} than the year before`);
const nth = (n) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] || 'th'}`;
const POST = { Champions: 'won the World Series', WS: 'lost the World Series', LCS: 'went out in the league championship series', DS: 'went out in the division series', WC: 'lost the wild card series' };

/** The numbers and the words for one club's year. */
export function clubYear(orgId, year) {
  const H = game.history?.[year];
  const c = H?.clubs?.[orgId];
  if (!c) return null;
  const prev = game.history?.[year - 1]?.clubs?.[orgId];
  const city = W().orgs.get(orgId).club.city;
  const mlb = clubPlayers(orgId, year), mi = clubPlayers(orgId, year, { minors: true });
  const bat = best(mlb, 'bat', 3), pit = best(mlb, 'pit', 3);
  const dud = [worst(mlb, 'bat'), worst(mlb, 'pit')].filter(Boolean).sort((a, b) => a.good - b.good)[0] || null;
  const prospects = [...best(mi, 'bat', 3, true), ...best(mi, 'pit', 3, true)].sort((a, b) => b.good - a.good).slice(0, 4);
  const diff = c.rs - c.ra;
  const pyth = c.rs && c.ra ? (c.rs ** 1.83) / (c.rs ** 1.83 + c.ra ** 1.83) : 0.5;
  const luck = Math.round((c.w - pyth * (c.w + c.l)));
  const awards = [];
  for (const lg of Object.values(game.awards?.[year]?.season || {})) for (const [k, v] of Object.entries(lg)) {
    const pl = W().players.get(v);
    if (pl && pl.hist && mlb.some((x) => x.p === pl)) awards.push([k, pl]);
    else if (k === 'Manager of the Year' && v === orgId) awards.push([k, null]);
  }
  return { H, c, prev, city, mlb, mi, bat, pit, dud, prospects, diff, luck, awards, pyth, wl: `${c.w}-${c.l}`, place: c.place, post: c.post };
}

/** A few lines on the year, written from the figures so each season reads differently. */
export function storyLines(orgId, year) {
  const Y = clubYear(orgId, year);
  if (!Y) return [];
  const { c, prev, city, bat, pit, dud, prospects, diff, luck, H } = Y;
  const out = [];
  const div = String(c.div || '').replace('American League', 'AL').replace('National League', 'NL');
  const swing = prev ? c.w - prev.w : null;
  const post = Y.post ? POST[Y.post] : null;
  const head = c.place === 1
    ? `${city} won the ${div} with a record of ${Y.wl}${post ? ` and ${post}` : ''}.`
    : post ? `${city} finished ${nth(c.place)} in the ${div} at ${Y.wl} but still reached October, and ${post}.`
      : c.place <= 2 && c.gb < 5 ? `${city} were in the ${div} race until late, finishing ${nth(c.place)} at ${Y.wl}, ${c.gb} games back.`
        : `${city} finished ${nth(c.place)} in the ${div} at ${Y.wl}, ${c.gb} games off the lead.`;
  out.push(head);
  if (swing != null) out.push(`That is ${wordsWins(swing)}.${Math.abs(swing) >= 10 ? (swing > 0 ? ' A big step forward.' : ' A year to forget, and questions to answer.') : ''}`);
  out.push(`They scored ${c.rs} and allowed ${c.ra}, a difference of ${diff >= 0 ? '+' : ''}${diff}.${Math.abs(luck) >= 4 ? (luck > 0 ? ` That run difference says they were about ${luck} wins better off than they should have been, so expect some regression.` : ` That run difference says they should have won about ${-luck} more games, so they were a little unlucky.`) : ''}`);
  if (bat[0]) out.push(`${fullName(bat[0].p)} was the best bat, hitting ${bat[0].s.avg.toFixed(3).replace(/^0/, '')} with ${bat[0].s.hr} home runs (TBO9+ ${bat[0].idx}).`);
  if (pit[0]) out.push(`${fullName(pit[0].p)} led the pitchers with a ${pit[0].s.era.toFixed(2)} ERA over ${pit[0].s.ip.toFixed(0)} innings (TBA9- ${pit[0].idx}).`);
  if (dud && dud.good < 90) out.push(`${fullName(dud.p)} was the biggest disappointment: ${dud.kind === 'bat' ? `an OPS of ${dud.s.ops.toFixed(3).replace(/^0/, '')} over ${dud.s.pa} plate appearances` : `${dud.s.era >= 8 && dud.s.era < 9 ? 'an' : 'a'} ${dud.s.era.toFixed(2)} ERA over ${dud.s.ip.toFixed(0)} innings`}.`);
  if (prospects[0]) out.push(`Down on the farm, ${fullName(prospects[0].p)} (${prospects[0].level}) stood out and is worth watching.`);
  void H;
  return out;
}

export const posOf = (p) => (isPitcher(p) ? (p.role === 'Starter' ? 'SP' : 'RP') : mainPos(p));
