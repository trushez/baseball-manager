// The detailed parts of a season chapter: the lineup, the rotation, the fixtures, and October told game by game.
// Everything here is read from what the game kept (season lines, the games list, each postseason game's small box score).
import { game } from '../state.js';
import { fullName, mainPos, isPitcher } from '../data/world.js';
import { clubPlayers } from './review.js';

const P = (id) => game.world.players.get(id);
const city = (id) => game.world.orgs.get(id)?.club.city ?? id;
const nick = (id) => game.world.orgs.get(id)?.club.name ?? city(id);
const the = (id) => `the ${nick(id)}`;
const NUM = ['none', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve'];
export const num = (n) => NUM[n] ?? String(n);
const list = (a) => (a.length <= 1 ? a.join('') : `${a.slice(0, -1).join(', ')} and ${a.at(-1)}`);
const rate = (v) => (v == null ? '.000' : v.toFixed(3).replace(/^0/, ''));
const ip = (outs) => `${Math.floor(outs / 3)}${outs % 3 ? `.${outs % 3}` : ''}`;
const ord = (n) => ['', 'first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth', 'ninth', 'tenth', 'eleventh', 'twelfth'][n] || `${n}th`;
const POSW = { C: 'catcher', '1B': 'first baseman', '2B': 'second baseman', '3B': 'third baseman', SS: 'shortstop', LF: 'left fielder', CF: 'center fielder', RF: 'right fielder', DH: 'designated hitter' };
const ROUND = { WC: 'wild card series', DS: 'division series', LCS: 'league championship series', WS: 'World Series' };

/** Names: the full name the first time in the chapter, the surname after that. */
export function namer() {
  const seen = new Set();
  return (p) => { if (!p) return 'somebody'; const f = seen.has(p.id); seen.add(p.id); return f ? p.last : fullName(p); };
}

/** The finished games of a series from the archive (which keeps no id): the same two clubs, in the postseason, in order. */
export function gamesOfSeries(s) {
  const live = game.season.post?.series.find((x) => x.round === s.round && x.hi === s.hi && x.lo === s.lo);
  const pair = (g) => (g.home === s.hi && g.away === s.lo) || (g.home === s.lo && g.away === s.hi);
  const all = game.season.games.filter((g) => g.post && g.s && (live ? g.series === live.id : pair(g)));
  return all.sort((a, b) => a.d - b.d);
}

/** The small box score of a postseason game; for older saves rebuilt from each player's last ten games. */
export function notes(g) {
  if (g.hl) return g.hl;
  const hl = { b: [], p: [] };
  for (const p of game.world.players.values()) {
    const key = p.orgId === g.home ? 'h' : p.orgId === g.away ? 'a' : null;
    if (!key) continue;
    for (const r of p.gb || []) if (r[0] === g.d && r[2] === 'MLB' && (r[5] >= 2 || r[8] || r[9] >= 2)) hl.b.push([p.id, key, r[3], r[5], r[8], r[9], r[4]]);
    for (const r of p.gp || []) if (r[0] === g.d && r[2] === 'MLB') hl.p.push([p.id, key, r[3], r[4], r[5], r[6], r[7], r[8], r[9], r[11]]);
  }
  return hl;
}

// ---------------- the regular season: lineup, rotation, bullpen ----------------

export function lineupText(orgId, year, nm, winterMan) {
  const rows = clubPlayers(orgId, year).filter((x) => x.kind === 'bat' && x.s.pa >= 250).sort((a, b) => b.s.pa - a.s.pa).slice(0, 9);
  if (rows.length < 4) return '';
  const byOps = rows.slice().sort((a, b) => b.s.ops - a.s.ops);
  const t = [];
  const one = (x) => `${nm(x.p)}${winterMan(x.p)}, the ${POSW[mainPos(x.p)] || 'hitter'}, who hit ${rate(x.s.avg)}/${rate(x.s.obp)}/${rate(x.s.slg)} with ${x.s.hr} home runs and ${x.s.rbi} RBI`;
  t.push(`The lineup was built around ${one(byOps[0])}, and ${one(byOps[1])}.`);
  const rest = byOps.slice(2, 5).map((x) => `${nm(x.p)} (${x.s.hr} HR, ${rate(x.s.ops)} OPS)`);
  if (rest.length) t.push(`Behind them came ${list(rest)}.`);
  const speed = rows.slice().sort((a, b) => b.s.sb - a.s.sb)[0];
  if (speed && speed.s.sb >= 15) t.push(`${nm(speed.p)} was the one who ran, stealing ${speed.s.sb} bases.`);
  const eye = rows.slice().sort((a, b) => b.s.bb - a.s.bb)[0];
  if (eye && eye.s.bb >= 60 && eye !== byOps[0]) t.push(`${nm(eye.p)} drew ${eye.s.bb} walks and made the pitchers work for everything.`);
  const slump = byOps.at(-1);
  if (slump.s.ops < 0.690) t.push(`${nm(slump.p)} was the weak spot, with an OPS of ${rate(slump.s.ops)} over ${slump.s.pa} plate appearances.`);
  return t.join(' ');
}

export function staffText(orgId, year, nm, winterMan) {
  const all = clubPlayers(orgId, year).filter((x) => x.kind === 'pit');
  const sp = all.filter((x) => x.s.gs >= 10).sort((a, b) => b.s.gs - a.s.gs || b.s.outs - a.s.outs).slice(0, 5);
  const t = [];
  if (sp.length >= 3) {
    const top = sp.slice().sort((a, b) => a.s.era - b.s.era);
    const ace = top[0];
    t.push(`The rotation was led by ${nm(ace.p)}${winterMan(ace.p)}, who went ${ace.s.w}-${ace.s.l} with a ${ace.s.era.toFixed(2)} ERA and ${ace.s.so} strikeouts in ${Math.round(ace.s.ip)} innings.`);
    const rest = sp.filter((x) => x !== ace).slice(0, 3).map((x) => `${nm(x.p)} (${x.s.w}-${x.s.l}, ${x.s.era.toFixed(2)})`);
    t.push(`The others were ${list(rest)}${sp.length > 4 ? ', with a fifth starter filling in the gaps' : ''}.`);
    const worst = sp.slice().sort((a, b) => b.s.era - a.s.era)[0];
    if (worst.s.era >= 4.8 && worst !== ace) t.push(`${nm(worst.p)} was the soft spot at ${worst.s.era.toFixed(2)}.`);
  }
  const pen = all.filter((x) => x.s.gs < 5 && x.s.outs >= 30);
  const cl = pen.slice().sort((a, b) => b.s.sv - a.s.sv)[0];
  if (cl && cl.s.sv >= 8) t.push(`In the ninth ${nm(cl.p)} saved ${cl.s.sv} games with a ${cl.s.era.toFixed(2)} ERA.`);
  const set = pen.filter((x) => x !== cl).sort((a, b) => b.s.hld - a.s.hld)[0];
  if (set && set.s.hld >= 12) t.push(`${nm(set.p)} held ${set.s.hld} leads on the way there.`);
  return t.join(' ');
}

// ---------------- the fixtures ----------------

/** How the year went against the rest of the schedule: home and road, extra innings, sweeps, the rivals. */
export function fixturesText(gs, orgId, divRivals, pickFn) {
  const t = [];
  const hw = gs.filter((g) => g.home && g.win).length, hl = gs.filter((g) => g.home && !g.win).length;
  const rw = gs.filter((g) => !g.home && g.win).length, rl = gs.filter((g) => !g.home && !g.win).length;
  if (hw + hl && rw + rl) t.push(`At home they were ${hw}-${hl} and on the road ${rw}-${rl}${Math.abs(hw / (hw + hl) - rw / (rw + rl)) > 0.12 ? ', a gap that said something about how much they leaned on their own park' : ''}.`);
  const ex = gs.filter((g) => g.inn > 9);
  if (ex.length >= 6) t.push(`Extra innings came ${ex.length} times and they won ${ex.filter((g) => g.win).length} of them.`);
  // series against one opponent in a row
  const ser = [];
  for (const g of gs) { const last = ser.at(-1); if (last && last.opp === g.opp && g.d - last.to <= 1) { last.w += g.win ? 1 : 0; last.l += g.win ? 0 : 1; last.to = g.d; } else ser.push({ opp: g.opp, w: g.win ? 1 : 0, l: g.win ? 0 : 1, to: g.d }); }
  const sweeps = ser.filter((s) => s.w >= 3 && s.l === 0), swept = ser.filter((s) => s.l >= 3 && s.w === 0);
  if (sweeps.length || swept.length) t.push(`They swept ${num(sweeps.length)} series${sweeps.length ? `, the first of them against ${the(sweeps[0].opp)}` : ''}, and were swept ${swept.length === 1 ? 'once' : `${num(swept.length)} times`}${swept.length ? `, by ${list([...new Set(swept.map((s) => the(s.opp)))].slice(0, 2))}` : ''}.`);
  const vs = new Map();
  for (const g of gs) { const r = vs.get(g.opp) || { w: 0, l: 0 }; g.win ? r.w++ : r.l++; vs.set(g.opp, r); }
  const riv = divRivals.filter((id) => vs.has(id)).map((id) => ({ id, ...vs.get(id) }));
  if (riv.length) {
    const txt = riv.map((r) => `${r.w}-${r.l} against ${the(r.id)}`);
    t.push(`Inside the division they went ${list(txt)}.`);
  }
  const all = [...vs.entries()].filter(([, r]) => r.w + r.l >= 6).map(([id, r]) => ({ id, ...r }));
  const bane = all.slice().sort((a, b) => a.w / (a.w + a.l) - b.w / (b.w + b.l))[0], feast = all.slice().sort((a, b) => b.w / (b.w + b.l) - a.w / (a.w + a.l))[0];
  if (feast && bane && feast.id !== bane.id && !riv.some((r) => r.id === bane.id && r.id === feast.id)) t.push(`${pickFn(['Nobody was easier to play than', 'The club had its way with', 'The schedule was kindest against'])} ${the(feast.id)}, who lost ${feast.w} of the ${feast.w + feast.l}, while ${the(bane.id)} won ${bane.w} of ${bane.w + bane.l} and were the opponent they could not solve.`);
  return t.join(' ');
}

// ---------------- October, game by game ----------------

const best = (hl, key) => hl.b.filter((x) => x[1] === key).sort((a, b) => (b[4] * 4 + b[5] * 2 + b[3]) - (a[4] * 4 + a[5] * 2 + a[3]))[0];
const hitWords = (x, nm) => {
  const p = P(x[0]), [, , ab, h, hr, rbi] = x;
  const bits = [];
  if (hr) bits.push(hr === 1 ? 'homered' : hr === 2 ? 'hit two home runs' : `hit ${num(hr)} home runs`);
  if (h >= 2 && !(hr && h === hr)) bits.push(`had ${num(h)} hits in ${ab}`);
  if (rbi >= 2) bits.push(`drove in ${num(rbi)}`);
  if (!bits.length) bits.push(h ? 'had a hit' : 'was quiet');
  return `${nm(p)} ${list(bits)}`;
};

/** Every game of one series, as prose from the point of view of the club asking (or neutral when it is not in it). */
export function seriesGames(s, orgId, nm, pick) {
  const gs = gamesOfSeries(s);
  if (!gs.length) return '';
  let hi = 0, lo = 0;
  const out = [];
  gs.forEach((g, i) => {
    const hs = g.s[1], as = g.s[0], homeWon = hs > as;
    const w = homeWon ? g.home : g.away, l = homeWon ? g.away : g.home;
    const wsc = Math.max(hs, as), lsc = Math.min(hs, as);
    if (w === s.hi) hi++; else lo++;
    const hl = notes(g), wk = homeWon ? 'h' : 'a', lk = homeWon ? 'a' : 'h';
    const extra = g.inn > 9 ? ` in ${num(g.inn)} innings` : '';
    const mine = orgId && w === orgId, theirs = orgId && l === orgId;
    const starters = hl.p.filter((x) => x[2] === 1);
    const sw = starters.find((x) => x[1] === wk), sl = starters.find((x) => x[1] === lk);
    const wp = g.w ? P(g.w) : null, lp = g.l ? P(g.l) : null, sp = g.sv ? P(g.sv) : null;
    const where = `at ${game.world.orgs.get(g.home)?.club.venue || city(g.home)}`;
    const n = i + 1;
    const head = i === 0
      ? pick([`Game one, ${where}, went to ${the(w)}, ${wsc}-${lsc}${extra}.`, `${the(w).replace(/^./, (c) => c.toUpperCase())} took the opener ${where}, ${wsc}-${lsc}${extra}.`])
      : pick([`In game ${num(n)}, ${where}, ${the(w)} won ${wsc}-${lsc}${extra}.`, `Game ${num(n)} ${where} went to ${the(w)}, ${wsc}-${lsc}${extra}.`, `${the(w).replace(/^./, (c) => c.toUpperCase())} won game ${num(n)} ${wsc}-${lsc}${extra}, ${where}.`]);
    const R = (n) => (n === 0 ? 'no runs' : n === 1 ? 'one run' : `${num(n)} runs`), Hh = (n) => (n === 1 ? 'one hit' : `${num(n)} hits`);
    const bits = [head];
    // the pitchers
    if (sw && sl) {
      const a = P(sw[0]), b = P(sl[0]);
      if (sl[5] >= 4 && sl[3] < 18) bits.push(`${nm(b)} was gone early, charged with ${num(sl[5])} runs in ${ip(sl[3])} innings, and ${nm(a)} went ${ip(sw[3])} for ${the(w)}, allowing ${Hh(sw[4])} and ${R(sw[5])}.`);
      else if (sw[5] <= 1 && sw[3] >= 18) bits.push(`${nm(a)} was the story, giving up ${R(sw[5])} on ${Hh(sw[4])} over ${ip(sw[3])} innings with ${num(sw[8])} strikeout${sw[8] === 1 ? '' : 's'}, while ${nm(b)} took the loss.`);
      else bits.push(`${nm(a)} started for the winners and went ${ip(sw[3])} innings, and ${nm(b)} lasted ${ip(sl[3])} for the losers.`);
    } else if (wp && lp) bits.push(`${nm(wp)} got the win and ${nm(lp)} took the loss.`);
    if (sp && sw && sp.id !== sw[0]) bits.push(`${nm(sp)} closed it out.`);
    // the bats
    const hero = best(hl, wk), goat = best(hl, lk);
    if (hero) bits.push(`${hitWords(hero, nm)}${mine || !orgId ? '' : ''}.`);
    if (goat && (goat[4] || goat[5] >= 3)) bits.push(`${hitWords(goat, nm)} for ${the(l)}${pick([', and it was not enough', ', but the rest of the lineup gave him no help', ' in a losing effort', ', which made no difference in the end'])}.`);
    // the tally
    const lead = hi === lo ? `The series was level at ${hi}-${lo}` : `${the(hi > lo ? s.hi : s.lo).replace(/^./, (c) => c.toUpperCase())} led ${Math.max(hi, lo)}-${Math.min(hi, lo)}`;
    const last = i === gs.length - 1;
    if (!last) bits.push(`${lead}.`);
    out.push(bits.join(' '));
  });
  return out.join(' ');
}

/** The other series of a round, each one told in a paragraph: who beat whom, and the games one after another. */
export function roundText(series, round, nm, pick, brief = false) {
  const rows = series.filter((s) => s.round === round && s.winner);
  if (!rows.length) return '';
  if (brief) {
    const one = (s) => { const hi = Math.max(s.hiW, s.loW), lo = Math.min(s.hiW, s.loW), n = hi + lo; return `${the(s.winner)} beat ${the(s.winner === s.hi ? s.lo : s.hi)} ${hi}-${lo}${lo === 0 && n >= 2 ? ' in a sweep' : hi === lo + 1 && n >= 3 ? ` in the full ${num(n)} games` : ''}`; };
    const all = rows.map(one);
    return `${(all.length > 1 ? `${all.slice(0, -1).join(', ')} and ${all.at(-1)}` : all[0]).replace(/^./, (c) => c.toUpperCase())}.`;
  }
  return rows.map((s) => {
    const gs = gamesOfSeries(s);
    const win = s.winner, lose = win === s.hi ? s.lo : s.hi;
    const hi = Math.max(s.hiW, s.loW), lo = Math.min(s.hiW, s.loW);
    const bits = gs.map((g, i) => {
      const homeWon = g.s[1] > g.s[0], w = homeWon ? g.home : g.away;
      const sc = `${Math.max(...g.s)}-${Math.min(...g.s)}${g.inn > 9 ? ` in ${num(g.inn)}` : ''}`;
      const hl = notes(g), wk = homeWon ? 'h' : 'a';
      const hero = best(hl, wk);
      const star = hero && (hero[4] || hero[5] >= 3) ? ` as ${nm(P(hero[0]))} ${hero[4] ? (hero[4] === 1 ? 'homered' : 'hit two home runs') : `drove in ${num(hero[5])}`}` : '';
      const first = i === 0 ? pick(['took the opener', 'won the first']) : `won game ${num(i + 1)}`;
      return `${the(w)} ${i === 0 ? first : `won game ${num(i + 1)}`} ${sc}${star}`;
    });
    const head = `${the(win).replace(/^./, (c) => c.toUpperCase())} beat ${the(lose)} ${hi}-${lo}`;
    return `${head}. ${bits.length ? `${bits.join('; ').replace(/^./, (c) => c.toUpperCase())}.` : ''}`;
  }).join(' ');
}

// ---------------- context: last year, the manager, the money, the people ----------------
import { managerCareer } from './history.js';
import { owner } from './finance.js';
import { salaryIn, money } from '../data/world.js';

const POSTWORDS = { Champions: 'won the World Series', WS: 'lost the World Series', LCS: 'went out in the league championship series', DS: 'went out in the division series', WC: 'lost the wild card series' };
const nth = (n) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] || 'th'}`;

/** What happened the year before, and how it ended. */
export function lastYearText(orgId, y, pick) {
  const H = game.history?.[y - 1], c = H?.clubs?.[orgId];
  if (!c) return '';
  const nickN = nick(orgId);
  const t = [];
  const out = c.post ? POSTWORDS[c.post] : null;
  const ser = (H.series || []).filter((x) => x.hi === orgId || x.lo === orgId).sort((a, b) => 'WC DS LCS WS'.indexOf(a.round) - 'WC DS LCS WS'.indexOf(b.round));
  const lastS = ser.at(-1);
  const end = lastS && lastS.winner !== orgId ? ` to ${the(lastS.winner === lastS.hi ? lastS.lo : lastS.hi)}, ${Math.max(lastS.hiW, lastS.loW)}-${Math.min(lastS.hiW, lastS.loW)}` : '';
  if (c.post === 'Champions') t.push(pick([`The ${nickN} had won the World Series the year before, ${c.w}-${c.l} in the regular season, and a championship club has a way of changing the room it plays in.`, `${y - 1} had ended with a parade: ${c.w}-${c.l} and a World Series title for the ${nickN}.`]));
  else if (out) t.push(`The ${nickN} had finished ${nth(c.place)} at ${c.w}-${c.l} in ${y - 1} and then ${out}${end}.`);
  else t.push(`${y - 1} had gone badly enough that nobody at the ${nickN} wanted to talk about it for long: ${c.w}-${c.l}, ${nth(c.place)} in the division${c.gb ? `, ${c.gb} games off the lead` : ''}, and no October.`);
  const lead = (H.leaders || {});
  void lead;
  return t.join(' ');
}

/** The manager's own story so far: how many seasons, where, what they won. */
export function managerText(orgId, y, pick) {
  if (orgId !== game.orgId) return '';
  const rows = managerCareer('you').filter((r) => r.year < y).sort((a, b) => a.year - b.year);
  const name = game.manager || 'The manager';
  const last = name.split(' ').pop();
  if (!rows.length) return `${name} was in his first season in charge of the ${nick(orgId)}, with nothing behind him and everything to prove.`;
  const w = rows.reduce((a, r) => a + r.w, 0), l = rows.reduce((a, r) => a + r.l, 0);
  const titles = rows.filter((r) => r.post === 'Champions').length, pen = rows.filter((r) => r.post === 'Champions' || r.post === 'WS').length;
  const posts = rows.filter((r) => r.post).length;
  const clubs = [...new Set(rows.map((r) => r.org))];
  const here = rows.filter((r) => r.org === orgId);
  const bits = [`${name} came into the season with ${num(rows.length)} year${rows.length === 1 ? '' : 's'} as a manager behind him and a record of ${w}-${l}`];
  if (titles) bits.push(`${titles > 1 ? `${num(titles)} World Series titles` : 'a World Series title'}${pen > titles ? ` and ${num(pen - titles)} more pennant${pen - titles > 1 ? 's' : ''}` : ''}`);
  else if (pen) bits.push(`${num(pen)} pennant${pen > 1 ? 's' : ''} and no title`);
  else if (posts) bits.push(`${num(posts)} trip${posts > 1 ? 's' : ''} to the postseason and nothing deeper`);
  else bits.push('no October to point to');
  let s = `${bits[0]}${bits[1] ? `, with ${bits[1]}` : ''}.`;
  if (clubs.length > 1) s += ` He had managed ${num(clubs.length)} clubs before this one, and he was now in his ${nth(here.length + 1)} year with ${the(orgId)}.`;
  else if (here.length) s += ` This was his ${nth(here.length + 1)} year with ${the(orgId)}, and ${last} knew the clubhouse by now.`;
  return s;
}

/** Payroll, the biggest contracts, and what the owner had allowed. */
export function moneyText(orgId, y, pick) {
  const o = game.world.orgs.get(orgId);
  const rows = o.players.map((p) => ({ p, s: salaryIn(p, y) })).filter((x) => typeof x.s === 'number' && x.s > 0).sort((a, b) => b.s - a.s);
  if (!rows.length) return '';
  const pay = game.cbt?.[orgId]?.[y]?.payroll ?? rows.reduce((a, x) => a + x.s, 0);
  const prev = game.cbt?.[orgId]?.[y - 1]?.payroll;
  const all = Object.entries(game.cbt || {}).map(([id, v]) => [id, v?.[y]?.payroll]).filter(([, v]) => v);
  const rank = all.length ? 1 + all.filter(([, v]) => v > pay).length : null;
  const avg = all.length ? all.reduce((a, [, v]) => a + v, 0) / all.length : null;
  const t = [];
  t.push(`The payroll came to ${money(pay)}${rank ? `, ${nth(rank)} in the majors${avg ? ` against an average of ${money(avg)}` : ''}` : ''}${prev ? `, ${pay >= prev ? 'up' : 'down'} from ${money(prev)} the year before` : ''}.`);
  const big = rows.slice(0, 3).map((x) => `${fullName(x.p)} at ${money(x.s)}`);
  t.push(`The biggest checks went to ${list(big)}.`);
  const tax = game.cbt?.[orgId]?.[y]?.tax;
  if (tax > 0) t.push(`That was over the luxury tax line, and the owner paid ${money(tax)} for it.`);
  const own = owner(orgId), b = own?.budget?.[y];
  if (b) t.push(`${orgId === game.orgId ? 'The owner' : 'Ownership'} had set the budget at ${money(b)}, ${pay > b ? `a figure the club went ${money(pay - b)} past` : `which left ${money(b - pay)} unspent`}.`);
  return t.join(' ');
}

/** One player's history in a sentence or two: his years here, last year, the old awards, the contract. */
export function profile(p, orgId, y, nm) {
  const kind = isPitcher(p) ? 'pit' : 'bat';
  const rows = (p.hist?.[kind] || []).filter((r) => r[1] === 'MLB');
  const yrsHere = new Set(rows.filter((r) => String(r[2]).split('-')[0] === orgId).map((r) => r[0]));
  const before = rows.filter((r) => r[0] === y - 1);
  const t = [];
  const name = nm(p);
  const here = yrsHere.has(y - 1) ? [...yrsHere].filter((v) => v < y).length : 0;
  const s = salaryIn(p, y);
  const yearsLeft = (p.contract?.years || []).filter((r) => r.season >= y).length;
  const parts = [`${name} was ${p.age}`];
  if (here >= 2) parts.push(`in his ${nth(here + 1)} year with the club`);
  else if (here === 0 && rows.length > 1) parts.push(`new to the club after ${num(Math.min(12, rows.filter((r) => r[0] < y).length))} year${rows.filter((r) => r[0] < y).length === 1 ? '' : 's'} elsewhere`);
  if (typeof s === 'number' && s > 0) parts.push(`paid ${money(s)} with ${yearsLeft > 1 ? `${num(yearsLeft)} seasons on the deal` : 'the deal expiring after the year'}`);
  t.push(`${parts[0]}${parts.length > 1 ? `, ${parts.slice(1).join(', ')}` : ''}.`);
  if (before.length) {
    const sum = (i) => before.reduce((a, r) => a + r[i + 3], 0);
    if (kind === 'bat') { const ab = sum(2), h = sum(3), hr = sum(6), rbi = sum(8); if (ab) t.push(`The year before he had hit ${rate(h / ab)} with ${hr} home runs and ${rbi} RBI.`); }
    else { const outs = sum(2), er = sum(5), w = sum(9), l = sum(10); if (outs) t.push(`The year before he had gone ${w}-${l} with a ${((er * 27) / outs).toFixed(2)} ERA.`); }
  }
  const aw = [];
  for (const [yr, A] of Object.entries(game.awards || {})) for (const won of Object.values(A.season || {})) for (const [k, id] of Object.entries(won)) if (id === p.id && /MVP|Cy Young/.test(k) && +yr < y) aw.push(`${k} in ${yr}`);
  if (aw.length) t.push(`He had been named ${list(aw.slice(0, 2))}.`);
  const car = rows.filter((r) => r[0] < y);
  if (kind === 'bat' && car.length >= 4) { const hr = car.reduce((a, r) => a + r[9], 0); if (hr >= 100) t.push(`He came in with ${hr} career home runs.`); }
  if (kind === 'pit' && car.length >= 4) { const w = car.reduce((a, r) => a + r[12], 0); if (w >= 50) t.push(`He came in with ${w} career wins.`); }
  return t.join(' ');
}

/** Where the club's players finished among the league's leaders. */
export function leadersText(orgId, y, nm) {
  const L = game.history?.[y]?.leaders || {};
  const LABEL = { avg: 'batting average', hr: 'home runs', rbi: 'RBI', sb: 'stolen bases', h: 'hits', ops: 'OPS', obp: 'on-base percentage', slg: 'slugging', w: 'wins', era: 'ERA', so: 'strikeouts', sv: 'saves', whip: 'WHIP', k: 'strikeouts' };
  const out = [];
  for (const lg of Object.values(L)) for (const [k, rows] of Object.entries(lg)) {
    rows.forEach(([id, v, org], i) => { if (org === orgId && P(id) && LABEL[k] && i === 0) out.push(`${nm(P(id))} led his league in ${LABEL[k]}, at ${typeof v === 'number' && v < 1 ? rate(v) : v}`); });
  }
  return out.length ? `The league's own tables carried the club's name: ${list(out.slice(0, 3))}.` : '';
}
