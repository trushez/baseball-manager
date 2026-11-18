// Reports on how your club is getting on: where it ranks in the league in each part of the game, what is working and
// what is not, and who is carrying it. There is little to adjust from day to day in baseball, so the year is read
// through these: a full club report each month and a themed note (lineup, rotation, bullpen, depth) every second week.
import { game, orgState, autoClub } from '../state.js';
import { HIST, line, fullName, isPitcher, mainPos, seasonLine, LEVEL_NAME } from '../data/world.js';
import { placeCode, levelWords } from './roster.js';
import { dayNo, fromDayNo } from './calendar.js';
import { message } from './inbox.js';
import { divisions } from './standings.js';
import { value } from './value.js';
import { budget, expected } from './finance.js';
import { monthVerdict } from './reactions.js';

const W = () => game.world;
const club = (id) => W().orgs.get(id)?.club;
const r3 = (v) => (v == null ? '-' : v.toFixed(3).replace(/^0/, ''));
const r2 = (v) => (v == null ? '-' : v.toFixed(2));
const r1 = (v) => (v == null ? '-' : v.toFixed(1));
const $M = (v) => `$${(v / 1e6).toFixed(1)}M`;
const lc = (t) => t.charAt(0).toLowerCase() + t.slice(1);
const nth = (n) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] || 'th'}`;
const who = (p) => ({ pid: p.id, t: fullName(p) });
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

// ---------- the league's numbers ----------

/** Club totals for the season so far: all hitters, and pitchers split into starters and relievers. */
function totals(year) {
  const z = () => HIST.bat.map(() => 0), zp = () => HIST.pit.map(() => 0);
  const T = new Map();
  const add = (a, row) => { for (let i = 0; i < a.length; i++) a[i] += row[i + 3]; };
  const gi = HIST.pit.indexOf('g'), gsi = HIST.pit.indexOf('gs');
  for (const p of W().list) {
    for (const r of p.hist?.bat || []) {
      if (r[0] !== year || r[1] !== 'MLB') continue;
      if (!T.has(r[2])) T.set(r[2], { bat: z(), sp: zp(), rp: zp() });
      add(T.get(r[2]).bat, r);
    }
    for (const r of p.hist?.pit || []) {
      if (r[0] !== year || r[1] !== 'MLB') continue;
      if (!T.has(r[2])) T.set(r[2], { bat: z(), sp: zp(), rp: zp() });
      add(r[gsi + 3] * 2 >= r[gi + 3] && r[gsi + 3] > 0 ? T.get(r[2]).sp : T.get(r[2]).rp, r);
    }
  }
  const out = new Map();
  for (const [id, t] of T) {
    const all = t.sp.map((v, i) => v + t.rp[i]);
    out.set(id, { bat: line('bat', [year, 'MLB', id, ...t.bat]), sp: line('pit', [year, 'MLB', id, ...t.sp]), rp: line('pit', [year, 'MLB', id, ...t.rp]), pit: line('pit', [year, 'MLB', id, ...all]) });
  }
  return out;
}

/** The areas of the game a club can be ranked in, each with how to read it and what to do when it is poor. */
const AREAS = (R) => [
  { k: 'runs', label: 'Runs scored a game', get: (id) => R(id).rs / R(id).g, fmt: r2, lineup: true, why: 'The lineup is not scoring. A bat from the free agent list or the trade market is the quickest fix, and the lineup screen will show which spot is hurting most.' },
  { k: 'obp', label: 'On-base percentage', get: (id, T) => T(id).bat.obp, fmt: r3, lineup: true, why: 'Too few runners are reaching base. Look for hitters with a good eye when you sign or trade.' },
  { k: 'slg', label: 'Slugging', get: (id, T) => T(id).bat.slg, fmt: r3, lineup: true, why: 'There is not enough power in the lineup. A power bat is what is missing.' },
  { k: 'avg', label: 'Batting average', get: (id, T) => T(id).bat.avg, fmt: r3, lineup: true, why: 'The lineup is not making enough contact. Contact hitters are cheaper than sluggers and fill that gap.' },
  { k: 'hr', label: 'Home runs', get: (id, T) => T(id).bat.hr / R(id).g, fmt: (v) => r2(v), lineup: true, why: 'The home runs are not coming.' },
  { k: 'ra', label: 'Runs allowed a game', get: (id) => R(id).ra / R(id).g, fmt: r2, asc: true, why: 'Too many runs are getting in. Pitching and defence share the blame; the lines below show which.' },
  { k: 'sp', label: 'Starters ERA', get: (id, T) => T(id).sp.era, fmt: r2, asc: true, why: 'The rotation is struggling. A starter is the signing that would change most, and the pitchers note shows who is letting it down.' },
  { k: 'rp', label: 'Bullpen ERA', get: (id, T) => T(id).rp.era, fmt: r2, asc: true, why: 'The bullpen is costing games. Relievers are cheap to add and the free agent list is the place to start.' },
  { k: 'whip', label: 'WHIP', get: (id, T) => T(id).pit.whip, fmt: r2, asc: true, why: 'Too many runners are reaching against your pitchers.' },
  { k: 'k9', label: 'Strikeouts per nine', get: (id, T) => T(id).pit.k9, fmt: r1, why: 'The staff does not miss bats. That leaves more to the defence behind it.' },
  { k: 'unearned', label: 'Unearned runs a game', get: (id, T) => (R(id).ra - T(id).pit.er) / R(id).g, fmt: r2, asc: true, defence: true, why: 'The defence is giving runs away. Check who is playing out of position, and whether a better glove is on the bench.' },
  { k: 'diff', label: 'Run difference a game', get: (id) => (R(id).rs - R(id).ra) / R(id).g, fmt: (v) => (v > 0 ? '+' : '') + r2(v) },
];

/** Where the club ranks, area by area, among the clubs in the league. */
function rankings(me) {
  const year = game.season.year;
  const Rm = game.season.records;
  const ids = [...Rm.keys()].filter((id) => (Rm.get(id).w + Rm.get(id).l) > 0);
  const TT = totals(year);
  const R = (id) => ({ ...Rm.get(id), g: Rm.get(id).w + Rm.get(id).l });
  const T = (id) => TT.get(id);
  const rows = [];
  for (const a of AREAS(R)) {
    const vals = ids.filter((id) => T(id)).map((id) => ({ id, v: a.get(id, T) })).filter((x) => x.v != null && Number.isFinite(x.v));
    vals.sort((x, y) => (a.asc ? x.v - y.v : y.v - x.v));
    const i = vals.findIndex((x) => x.id === me);
    if (i < 0) continue;
    rows.push({ ...a, rank: i + 1, n: vals.length, v: vals[i].v, best: vals[0].v, text: a.fmt(vals[i].v) });
  }
  return { rows, T, R, ids };
}

// ---------- the monthly club report ----------

/** A full report on the club: the record and what it should be, the rankings, strengths and weaknesses, who is carrying it. */
export function clubReport(date, diff = null) {
  const me = game.orgId, c = club(me), s = game.season, r = s.records.get(me);
  const g = r.w + r.l;
  if (g < 12) return;
  const { rows, T } = rankings(me);
  if (rows.length < 6) return;
  const n = rows[0].n, edge = Math.max(3, Math.round(n * 0.2));
  const strong = rows.filter((x) => x.rank <= edge && x.k !== 'diff').sort((a, b) => a.rank - b.rank);
  const weak = rows.filter((x) => x.rank > n - edge && x.k !== 'diff').sort((a, b) => b.rank - a.rank);
  const parts = [];

  // the record, and what the runs say it should be
  const exp = Math.pow(r.rs, 1.83) / (Math.pow(r.rs, 1.83) + Math.pow(r.ra, 1.83));
  const expW = Math.round(exp * g), gap = r.w - expW;
  const pace = Math.round((r.w / g) * 162);
  const div = [...divisions().entries()].find(([, ids]) => ids.includes(me));
  const place = div ? div[1].indexOf(me) + 1 : null;
  let p1 = `${c.city} are ${r.w}-${r.l}, a ${pace}-win pace${place ? `, ${nth(place)} in the ${div[0].replace('American League', 'AL').replace('National League', 'NL')}` : ''}. They have scored ${r.rs} runs and allowed ${r.ra}.`;
  if (Math.abs(gap) >= 3) p1 += gap > 0 ? ` On those runs they should be about ${expW}-${g - expW}: they have won more close games than they have a right to, and that tends to even out.` : ` On those runs they should be about ${expW}-${g - expW}: they have been unlucky in the close ones, and the record should improve if the underlying play holds.`;
  parts.push({ p: p1 });

  // where the club ranks
  parts.push({ p: `Where the club ranks among the ${n} in the league:` });
  parts.push({ head: ['Area', c.name, 'Rank', 'Best in the league'], rows: rows.map((x) => [x.label, x.text, `${nth(x.rank)}${x.rank <= edge ? ' (strength)' : x.rank > n - edge ? ' (weakness)' : ''}`, x.fmt(x.best)]) });

  // close games, extra innings, home and away: the record behind the record
  const cg = closeGames(me);
  if (cg) {
    parts.push({ p: cg.text }, { head: ['Record', 'W-L', 'Pct'], rows: cg.rows });
  }

  // strengths and weaknesses, in words
  if (strong.length) parts.push({ p: `Strengths: ${strong.slice(0, 3).map((x) => `${lc(x.label)} (${x.text}, ${nth(x.rank)})`).join(', ')}.` });
  else parts.push({ p: 'There is no area where the club is among the best in the league yet.' });
  if (weak.length) {
    parts.push({ p: `Weaknesses: ${weak.slice(0, 3).map((x) => `${lc(x.label)} (${x.text}, ${nth(x.rank)})`).join(', ')}.` });
    const seen = new Set();
    const specific = weak.filter((x) => !['ra', 'whip', 'diff'].includes(x.k));
    for (const x of (specific.length ? specific : weak).slice(0, 2)) if (!seen.has(x.why)) { seen.add(x.why); parts.push({ p: x.why }); }
  } else parts.push({ p: 'Nothing is badly wrong anywhere. The job now is to keep it that way.' });

  // who is carrying the club, and who is not
  const st = orgState(me), o = W().orgs.get(me);
  const minPA = Math.max(30, g * 2.6), minOuts = Math.max(30, g * 1.2);
  const act = o.players.filter((p) => st.active.has(p.id));
  const bats = act.filter((p) => !isPitcher(p)).map((p) => ({ p, s: seasonLine(p, 'bat', s.year, 'MLB') })).filter((x) => x.s && x.s.pa >= minPA);
  const arms = act.filter(isPitcher).map((p) => ({ p, s: seasonLine(p, 'pit', s.year, 'MLB') })).filter((x) => x.s && x.s.outs >= minOuts);
  const best = bats.slice().sort((a, b) => b.s.ops - a.s.ops).slice(0, 3), worst = bats.slice().sort((a, b) => a.s.ops - b.s.ops).slice(0, 2).filter((x) => x.s.ops < 0.68);
  const ace = arms.slice().sort((a, b) => a.s.era - b.s.era).slice(0, 3), poor = arms.slice().sort((a, b) => b.s.era - a.s.era).slice(0, 2).filter((x) => x.s.era > 5);
  if (best.length) {
    parts.push({ p: 'Carrying the lineup:' }, { head: ['Player', 'Pos', 'AVG', 'OBP', 'SLG', 'HR'], rows: best.map((x) => [who(x.p), mainPos(x.p), r3(x.s.avg), r3(x.s.obp), r3(x.s.slg), x.s.hr]) });
  }
  if (worst.length) parts.push({ p: 'Struggling at the plate:' }, { head: ['Player', 'Pos', 'AVG', 'OBP', 'SLG', 'HR'], rows: worst.map((x) => [who(x.p), mainPos(x.p), r3(x.s.avg), r3(x.s.obp), r3(x.s.slg), x.s.hr]) });
  if (ace.length) parts.push({ p: 'Best arms:' }, { head: ['Pitcher', 'Role', 'IP', 'ERA', 'WHIP', 'K'], rows: ace.map((x) => [who(x.p), mainPos(x.p), r1(x.s.ip), r2(x.s.era), r2(x.s.whip), x.s.so]) });
  if (poor.length) parts.push({ p: 'Struggling on the mound:' }, { head: ['Pitcher', 'Role', 'IP', 'ERA', 'WHIP', 'K'], rows: poor.map((x) => [who(x.p), mainPos(x.p), r1(x.s.ip), r2(x.s.era), r2(x.s.whip), x.s.so]) });

  // the month, player by player
  if (diff) {
    const mo = monthForm(diff, me);
    if (mo.hot.length || mo.cold.length) parts.push({ p: 'The month, player by player:' });
    if (mo.hot.length) parts.push({ head: ['Best of the month', 'Pos', 'Month'], rows: mo.hot });
    if (mo.cold.length) parts.push({ head: ['Worst of the month', 'Pos', 'Month'], rows: mo.cold });
  }

  // the money
  try {
    const pay = expected(me, s.year), bud = budget(me, s.year);
    parts.push({ p: `The payroll stands at ${$M(pay)} against a budget of ${$M(bud)}${pay > bud ? ': over, which the owner has noticed' : pay > bud * 0.95 ? ': there is almost no room left to add anyone' : `, leaving ${$M(bud - pay)} to spend if the right player appears`}.` });
  } catch { /* the finance books are not ready */ }
  parts.push({ p: monthVerdict() });

  message({ cat: 'club', title: `Club report: ${MONTHS[date.getMonth()]}`, parts, body: `${c.city} are ${r.w}-${r.l}. The full picture of where the club is strong, where it is weak and who is carrying it.` });
}

// ---------- notes every second week ----------

const THEMES = ['lineup', 'rotation', 'bullpen', 'depth'];

/** Called on Mondays: every second Monday, one themed look at the club. */
export function teamNotes() {
  const s = game.season, me = game.orgId;
  if (!s || game.phase !== 'regular') return;
  const r = s.records.get(me), g = r.w + r.l;
  if (g < 14) return;
  s.noteMon = (s.noteMon || 0) + 1;
  if (s.noteMon % 2) return;
  const theme = THEMES[(s.noteN || 0) % THEMES.length];
  s.noteN = (s.noteN || 0) + 1;
  const st = orgState(me), o = W().orgs.get(me), yr = s.year;
  const act = o.players.filter((p) => st.active.has(p.id));
  const { rows } = rankings(me);
  const rank = (k) => rows.find((x) => x.k === k);
  const parts = [];
  let title = '', body = '';

  if (theme === 'lineup') {
    title = 'Lineup report';
    const bats = act.filter((p) => !isPitcher(p)).map((p) => ({ p, s: seasonLine(p, 'bat', yr, 'MLB') })).filter((x) => x.s && x.s.pa >= Math.max(25, g * 1.5)).sort((a, b) => b.s.pa - a.s.pa);
    const ru = rank('runs'), ob = rank('obp'), sl = rank('slg');
    parts.push({ p: ru ? `The lineup scores ${ru.text} runs a game, ${nth(ru.rank)} of ${ru.n}. It gets on base at ${ob?.text ?? '-'} (${ob ? nth(ob.rank) : '-'}) and slugs ${sl?.text ?? '-'} (${sl ? nth(sl.rank) : '-'}).` : 'The lineup has not played enough yet to be ranked.' });
    const babip = (x) => { const d = x.s.ab - x.s.so - x.s.hr + x.s.sf; return d > 0 ? (x.s.h - x.s.hr) / d : null; };
    parts.push({ head: ['Player', 'Pos', 'PA', 'AVG', 'OBP', 'SLG', 'HR', 'BABIP', 'Outlook'], rows: bats.map((x) => {
      const b = babip(x);
      const out = x.s.pa < 80 ? 'Too early' : b >= 0.345 ? 'Running hot, likely to cool' : b != null && b <= 0.255 ? 'Unlucky, due a turn' : x.s.ops >= 0.85 ? 'Producing' : x.s.ops < 0.62 ? 'Struggling' : 'Fair';
      return [who(x.p), mainPos(x.p), x.s.pa, r3(x.s.avg), r3(x.s.obp), r3(x.s.slg), x.s.hr, r3(b), out];
    }) });
    parts.push({ p: 'BABIP is the average on balls put in play. League-wide it settles near .295, so a hitter far above it is probably getting breaks and one far below it is probably not.' });
    body = ru ? `The lineup is ${nth(ru.rank)} in the league in runs scored.` : 'How the hitters are doing.';
  } else if (theme === 'rotation') {
    title = 'Rotation report';
    const arms = st.rotation.map((id) => W().players.get(id)).filter(Boolean).map((p) => ({ p, s: seasonLine(p, 'pit', yr, 'MLB') })).filter((x) => x.s && x.s.outs > 0);
    const sp = rank('sp'), k9 = rank('k9');
    parts.push({ p: sp ? `The starters have a ${sp.text} ERA, ${nth(sp.rank)} of ${sp.n} in the league${k9 ? ` and strike out ${k9.text} per nine (${nth(k9.rank)})` : ''}.` : 'The rotation has not pitched enough yet to be ranked.' });
    parts.push({ head: ['Pitcher', 'GS', 'IP', 'ERA', 'FIP', 'K/9', 'BB/9', 'Outlook'], rows: arms.map((x) => {
      const gap = x.s.era - x.s.fip;
      const out = x.s.ip < 25 ? 'Too early' : gap <= -1 ? 'Lucky so far, expect a rise' : gap >= 1 ? 'Unlucky, better than the ERA' : x.s.era < 3.2 ? 'Excellent' : x.s.era > 5 ? 'Struggling' : 'Fair';
      return [who(x.p), x.s.gs, r1(x.s.ip), r2(x.s.era), r2(x.s.fip), r1(x.s.k9), r1(x.s.bb9), out];
    }) });
    parts.push({ p: 'FIP is what the ERA would be on strikeouts, walks and home runs alone, with the luck taken out. A pitcher whose ERA is well under his FIP has been helped by the defence or by fortune.' });
    body = sp ? `The starters are ${nth(sp.rank)} in the league by ERA.` : 'How the rotation is doing.';
  } else if (theme === 'bullpen') {
    title = 'Bullpen report';
    const arms = act.filter((p) => isPitcher(p) && !st.rotation.includes(p.id)).map((p) => ({ p, s: seasonLine(p, 'pit', yr, 'MLB') })).filter((x) => x.s && x.s.outs > 0).sort((a, b) => b.s.outs - a.s.outs);
    const rp = rank('rp');
    parts.push({ p: rp ? `The bullpen has a ${rp.text} ERA, ${nth(rp.rank)} of ${rp.n} in the league.${rp.rank > rp.n - 6 ? ' It is costing games, and relievers are the cheapest way to fix that.' : rp.rank <= 6 ? ' It is one of the best in baseball, and the starters can hand over a lead with some confidence.' : ''}` : 'The bullpen has not pitched enough yet to be ranked.' });
    parts.push({ head: ['Pitcher', 'Role', 'IP', 'ERA', 'WHIP', 'K/9', 'SV', 'HLD'], rows: arms.map((x) => [who(x.p), st.pen[x.p.id] || mainPos(x.p), r1(x.s.ip), r2(x.s.era), r2(x.s.whip), r1(x.s.k9), x.s.sv, x.s.hld]) });
    const worn = arms.filter((x) => x.s.ip >= g * 0.8);
    if (worn.length) parts.push({ p: `${worn.slice(0, 2).map((x) => fullName(x.p)).join(' and ')} ${worn.length > 1 ? 'have' : 'has'} been used heavily. Arms that pitch this much tend to tire later in the year, which is when a spare reliever helps.` });
    body = rp ? `The bullpen is ${nth(rp.rank)} in the league by ERA.` : 'How the relievers are doing.';
  } else {
    title = 'Depth report';
    const out = [...st.il.keys()].map((id) => W().players.get(id)).filter(Boolean);
    const bench = act.filter((p) => !isPitcher(p)).map((p) => ({ p, s: seasonLine(p, 'bat', yr, 'MLB') })).filter((x) => x.s && x.s.pa >= 15 && x.s.pa < g * 2.6);
    const aaa = o.players.filter((p) => !isPitcher(p) && st.level.get(p.id) === 'AAA' && !st.active.has(p.id)).map((p) => ({ p, s: seasonLine(p, 'bat', yr, 'AAA') })).filter((x) => x.s && x.s.pa >= 60).sort((a, b) => b.s.ops - a.s.ops).slice(0, 3);
    const aaaP = o.players.filter((p) => isPitcher(p) && st.level.get(p.id) === 'AAA' && !st.active.has(p.id)).map((p) => ({ p, s: seasonLine(p, 'pit', yr, 'AAA') })).filter((x) => x.s && x.s.outs >= 45).sort((a, b) => a.s.era - b.s.era).slice(0, 2);
    parts.push({ p: out.length ? `${out.length} ${out.length === 1 ? 'player is' : 'players are'} on the injured list: ${out.slice(0, 5).map(fullName).join(', ')}. Every one of them is a spot someone else has to fill.` : 'Nobody is on the injured list, which is the best kind of depth report.' });
    if (aaa.length || aaaP.length) {
      parts.push({ p: 'Making a case in Triple-A:' }, { head: ['Player', 'Pos', 'Age', 'Triple-A line'], rows: [
        ...aaa.map((x) => [who(x.p), mainPos(x.p), x.p.age, `${r3(x.s.avg)}/${r3(x.s.obp)}/${r3(x.s.slg)}, ${x.s.hr} HR`]),
        ...aaaP.map((x) => [who(x.p), mainPos(x.p), x.p.age, `${r2(x.s.era)} ERA, ${r1(x.s.ip)} IP, ${x.s.so} K`]),
      ] });
      parts.push({ p: 'A good Triple-A line is not the same as being ready for the majors, so look at the attributes and the scout report before you move anyone up.' });
    }
    if (bench.length) parts.push({ p: 'Off the bench:' }, { head: ['Player', 'Pos', 'PA', 'AVG', 'OPS'], rows: bench.slice(0, 4).map((x) => [who(x.p), mainPos(x.p), x.s.pa, r3(x.s.avg), r3(x.s.ops)]) });
    body = 'The injured list, the bench and who is pushing from Triple-A.';
  }
  message({ cat: 'club', title: `${title}: ${r.w}-${r.l}`, body, parts });
}

// ---------- the record behind the record ----------

/** One-run games, extra innings, home and road, the division and the blowouts, from the games played so far. */
function closeGames(me) {
  const games = game.season.games.filter((x) => x.level === 'MLB' && x.s && !x.post);
  const mineG = games.filter((x) => x.home === me || x.away === me);
  if (mineG.length < 12) return null;
  const div = [...divisions().entries()].find(([, ids]) => ids.includes(me));
  const rec = () => ({ w: 0, l: 0 });
  const R = { one: rec(), extra: rec(), home: rec(), road: rec(), div: rec(), big: rec(), shut: rec() };
  const tally = (list, id, into) => {
    for (const x of list) {
      if (x.home !== id && x.away !== id) continue;
      const won = (x.home === id) === (x.s[1] > x.s[0]), m = Math.abs(x.s[1] - x.s[0]);
      const put = (k) => { won ? R_[k].w++ : R_[k].l++; };
      const R_ = into;
      if (m === 1) put('one');
      if (x.inn > 9) put('extra');
      if (x.home === id) put('home'); else put('road');
      if (div && div[1].includes(x.home === id ? x.away : x.home)) put('div');
      if (m >= 5) put('big');
    }
  };
  tally(mineG, me, R);
  // where the one-run record ranks in the league
  const oneRank = (() => {
    const per = new Map();
    for (const x of games) {
      if (Math.abs(x.s[1] - x.s[0]) !== 1) continue;
      const win = x.s[1] > x.s[0] ? x.home : x.away, lose = win === x.home ? x.away : x.home;
      (per.get(win) || per.set(win, rec()).get(win)).w++;
      (per.get(lose) || per.set(lose, rec()).get(lose)).l++;
    }
    const pct = (r) => (r.w + r.l ? r.w / (r.w + r.l) : 0.5);
    const sorted = [...per.entries()].sort((a, b) => pct(b[1]) - pct(a[1]));
    return { rank: sorted.findIndex(([id]) => id === me) + 1, n: sorted.length };
  })();
  const pc = (r) => (r.w + r.l ? r3(r.w / (r.w + r.l)) : '-');
  const row = (label, r) => [label, `${r.w}-${r.l}`, pc(r)];
  let text = '';
  const one = R.one;
  if (one.w + one.l >= 8) {
    const lucky = one.w / (one.w + one.l);
    text = lucky >= 0.62 ? `${one.w}-${one.l} in one-run games (${nth(oneRank.rank)} of ${oneRank.n}). Teams that win this many close ones usually give a few back, unless the bullpen is genuinely good.`
      : lucky <= 0.38 ? `${one.w}-${one.l} in one-run games (${nth(oneRank.rank)} of ${oneRank.n}). That is more bad luck than bad baseball most of the time, though a weak bullpen makes it worse.`
        : `${one.w}-${one.l} in one-run games (${nth(oneRank.rank)} of ${oneRank.n}), about what a team of this standard should expect.`;
  } else text = 'The record behind the record, so far:';
  if (R.extra.w + R.extra.l >= 4 && R.extra.w / (R.extra.w + R.extra.l) <= 0.3) text += ' Extra innings have gone badly, which usually points at the bullpen.';
  const rows = [row('One-run games', R.one), row('Extra innings', R.extra), row('At home', R.home), row('On the road', R.road)];
  if (div) rows.push(row('Against the division', R.div));
  rows.push(row('Games decided by five or more', R.big));
  return { text, rows };
}

// ---------- the month, player by player ----------

/** The best and worst of the month from your active roster, with the month's lines. */
function monthForm(diff, me) {
  const st = orgState(me), o = W().orgs.get(me);
  const hot = [], cold = [];
  const bats = [], arms = [];
  for (const p of o.players) {
    if (!st.active.has(p.id)) continue;
    if (isPitcher(p)) {
      const t = diff(p.id, 't');
      if (t && t[2] >= 24) arms.push({ p, ip: t[2] / 3, era: (t[5] * 27) / t[2], so: t[8], bb: t[7], sv: t[11] || 0 });
    } else {
      const b = diff(p.id, 'b');
      if (b && b[1] >= 40) {
        const [, pa, ab, h, b2, b3, hr, , rbi, bb, , , , hbp, sf] = b;
        const ops = (h + bb + hbp) / Math.max(1, ab + bb + hbp + sf) + (h + b2 + 2 * b3 + 3 * hr) / Math.max(1, ab);
        bats.push({ p, ops, avg: ab ? h / ab : 0, hr, rbi, pa });
      }
    }
  }
  const bl = (x) => `${r3(x.avg)}, ${x.hr} HR, ${x.rbi} RBI (${r3(x.ops)} OPS)`;
  const al = (x) => `${r2(x.era)} ERA in ${r1(x.ip)} IP, ${x.so} K`;
  bats.sort((a, b) => b.ops - a.ops); arms.sort((a, b) => a.era - b.era);
  for (const x of bats.slice(0, 2)) if (x.ops >= 0.8) hot.push([who(x.p), mainPos(x.p), bl(x)]);
  for (const x of arms.slice(0, 2)) if (x.era <= 3.2) hot.push([who(x.p), mainPos(x.p), al(x)]);
  for (const x of bats.slice(-2).reverse()) if (x.ops <= 0.62) cold.push([who(x.p), mainPos(x.p), bl(x)]);
  for (const x of arms.slice(-2).reverse()) if (x.era >= 6) cold.push([who(x.p), mainPos(x.p), al(x)]);
  return { hot, cold };
}

// ---------- the assistant's month, and the farm ----------

/** Called by the assistant each day he moves someone: [{ pid, from, to }]. */
export function logAssist(entries) {
  const s = game.season;
  if (!s || !entries.length) return;
  const d = dayNo(game.date);
  (s.assistLog ||= []).push(...entries.map((e) => ({ ...e, d })));
  if (s.assistLog.length > 400) s.assistLog.splice(0, s.assistLog.length - 400);
}

const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Ratings that moved since last month for the players of one level group: [{p, from, to}]. */
function rateChanges(players, snap, min = 1) {
  const out = [];
  for (const p of players) {
    const was = snap?.[p.id];
    if (was == null) continue;
    const now = Math.round(value(p));
    if (Math.abs(now - was) >= min) out.push({ p, from: was, to: now });
  }
  return out;
}

/** Once a month, after the month's awards: what the assistant did, who moved, and who is making a case on the farm. */
export function orgMonth(date) {
  const s = game.season, me = game.orgId, o = W().orgs.get(me), st = orgState(me);
  if (!s || !o) return;
  const codes = Object.fromEntries(o.players.map((p) => [p.id, placeCode(st, p)]));
  const rates = Object.fromEntries(o.players.map((p) => [p.id, Math.round(value(p))]));
  const was = s.myCodes, wasRates = s.myRates;
  const month = MONTHS[date.getMonth()];
  const ORDER = ['MLB', 'AAA', 'AA', 'A+', 'A', 'R'];
  const name = (c) => (c ? levelWords(c) : 'joined');

  // the assistant's month
  const log = s.assistLog || [];
  if (autoClub() && log.length) {
    const kind = (e) => (e.to === 'MLB' && e.from !== 'IL' ? 'up' : e.from === 'MLB' && e.to !== 'IL' && ORDER.includes(e.to) ? 'down' : e.to === 'IL' ? 'il' : e.from === 'IL' ? 'back' : e.to === 'DFA' ? 'dfa' : e.to === 'FA' ? 'rel' : 'other');
    const n = (k) => log.filter((e) => kind(e) === k).length;
    const bits = [n('up') && `${n('up')} called up`, n('down') && `${n('down')} sent down`, n('il') && `${n('il')} placed on the injured list`, n('back') && `${n('back')} back from the injured list`, n('dfa') && `${n('dfa')} designated for assignment`, n('rel') && `${n('rel')} released`].filter(Boolean);
    const parts = [{ p: `With the assistant running the club, ${month} saw ${log.length} ${log.length === 1 ? 'roster move' : 'roster moves'}${bits.length ? `: ${bits.join(', ')}` : ''}.` }];
    const rows = log.slice(-18).map((e) => {
      const p = W().players.get(e.pid);
      return p ? [MONTH_SHORT[fromDayNo(e.d).getMonth()] + ' ' + fromDayNo(e.d).getDate(), who(p), mainPos(p), name(e.from), name(e.to)] : null;
    }).filter(Boolean);
    parts.push({ head: ['Date', 'Player', 'Pos', 'From', 'To'], rows });
    const up = rateChanges(o.players.filter((p) => codes[p.id] === 'MLB' || codes[p.id] === 'IL'), wasRates).sort((a, b) => (b.to - b.from) - (a.to - a.from));
    const gone = up.filter((x) => x.to > x.from).slice(0, 3), down = up.filter((x) => x.to < x.from).slice(-3).reverse();
    if (gone.length) parts.push({ p: 'Gone up in the majors:' }, { head: ['Player', 'Pos', 'Was', 'Now'], rows: gone.map((x) => [who(x.p), mainPos(x.p), x.from, x.to]) });
    if (down.length) parts.push({ p: 'Gone down in the majors:' }, { head: ['Player', 'Pos', 'Was', 'Now'], rows: down.map((x) => [who(x.p), mainPos(x.p), x.from, x.to]) });
    parts.push({ p: 'Every one of these moves follows the roster rules. The roster screens show where everyone stands now.' });
    message({ cat: 'club', title: `The assistant's month: ${month}`, body: `${log.length} roster moves in ${month}, and who went up and down.`, parts });
  }
  s.assistLog = [];

  // the farm: who moved, who is making a case, who is struggling
  if (was) {
    const moves = o.players.map((p) => ({ p, from: was[p.id], to: codes[p.id] })).filter((x) => x.to && x.from !== x.to && (x.from || x.to !== 'MLB'));
    const gone = Object.keys(was).filter((id) => !(id in codes)).map((id) => ({ p: W().players.get(id), from: was[id] })).filter((x) => x.p);
    const parts = [];
    const rank = (c) => ORDER.indexOf(c);
    const real = moves.filter((x) => x.from && (rank(x.from) > 0 || rank(x.to) > 0 || x.to === 'DFA') && x.to !== 'FA');
    if (real.length || gone.length) {
      parts.push({ p: `${real.length + gone.length} ${real.length + gone.length === 1 ? 'player' : 'players'} moved through the organisation in ${month}.` });
      parts.push({ head: ['Player', 'Pos', 'Age', 'From', 'To'], rows: [...real.slice(0, 14).map((x) => [who(x.p), mainPos(x.p), x.p.age, name(x.from), name(x.to)]), ...gone.slice(0, 4).map((x) => [who(x.p), mainPos(x.p), x.p.age, name(x.from), `left the organisation${x.p.orgId && x.p.orgId !== me ? ` for ${club(x.p.orgId)?.city ?? 'another club'}` : ''}`])] });
    }
    // performance down on the farm
    const yr = s.year, rows = [], hard = [];
    const minor = o.players.filter((p) => ['AAA', 'AA', 'A+', 'A'].includes(codes[p.id]));
    const voice = (lv, text) => ({ q: text, by: `your ${LEVEL_NAME[lv]} ${lv === 'AAA' || lv === 'AA' ? 'manager' : 'coach'}` });
    const cases = [], poor = [];
    for (const p of minor) {
      const lv = codes[p.id];
      if (isPitcher(p)) {
        const l = seasonLine(p, 'pit', yr, lv);
        if (!l || l.outs < 60) continue;
        if (l.era <= 3.0) cases.push({ p, lv, text: `${r2(l.era)} ERA, ${r1(l.ip)} IP, ${l.so} K`, score: 4 - l.era });
        else if (l.era >= 6.2) poor.push({ p, lv, text: `${r2(l.era)} ERA, ${r1(l.ip)} IP, ${l.bb} BB`, score: l.era });
      } else {
        const l = seasonLine(p, 'bat', yr, lv);
        if (!l || l.pa < 90) continue;
        const need = lv === 'AAA' ? 0.84 : lv === 'AA' ? 0.87 : 0.92;
        if (l.ops >= need) cases.push({ p, lv, text: `${r3(l.avg)}/${r3(l.obp)}/${r3(l.slg)}, ${l.hr} HR`, score: l.ops });
        else if (l.ops <= 0.58) poor.push({ p, lv, text: `${r3(l.avg)}/${r3(l.obp)}/${r3(l.slg)}`, score: 1 - l.ops });
      }
    }
    cases.sort((a, b) => b.score - a.score); poor.sort((a, b) => b.score - a.score);
    if (cases.length) {
      parts.push({ p: 'Making a case for a move up:' }, { head: ['Player', 'Pos', 'Age', 'Level', 'Line'], rows: cases.slice(0, 5).map((x) => [who(x.p), mainPos(x.p), x.p.age, LEVEL_NAME[x.lv], x.text]) });
      const c = cases[0];
      const nm = c.p.last;
      parts.push(voice(c.lv, c.lv === 'AAA' ? `${nm} has nothing left to prove at this level. If there is a spot, he is ready for a look.` : c.p.age <= 21 ? `${nm} is young for this level and handling it. I would not rush him, but he is ahead of the plan.` : `${nm} has been the best player in our clubhouse this month. A promotion would reward him and tell the others something.`));
    }
    if (poor.length) {
      parts.push({ p: 'Struggling:' }, { head: ['Player', 'Pos', 'Age', 'Level', 'Line'], rows: poor.slice(0, 4).map((x) => [who(x.p), mainPos(x.p), x.p.age, LEVEL_NAME[x.lv], x.text]) });
      const c = poor[0];
      parts.push(voice(c.lv, isPitcher(c.p) ? `${c.p.last} is fighting the strike zone and the numbers show it. He needs to throw strikes more than he needs a lecture, but a spell at a lower level would not be the end of the world.` : `${c.p.last} is pressing, and the numbers show it. He needs patience and regular at-bats more than he needs a lecture, but a spell at a lower level would not be the end of the world.`));
    }
    // ratings moves down the system
    const rc = rateChanges(minor, wasRates, 2).sort((a, b) => (b.to - b.from) - (a.to - a.from));
    const ups = rc.filter((x) => x.to > x.from).slice(0, 3), downs = rc.filter((x) => x.to < x.from).slice(-2).reverse();
    if (ups.length) parts.push({ p: 'Developing faster than expected:' }, { head: ['Player', 'Pos', 'Age', 'Level', 'Was', 'Now'], rows: ups.map((x) => [who(x.p), mainPos(x.p), x.p.age, LEVEL_NAME[codes[x.p.id]], x.from, x.to]) });
    if (downs.length) parts.push({ p: 'Going backwards:' }, { head: ['Player', 'Pos', 'Age', 'Level', 'Was', 'Now'], rows: downs.map((x) => [who(x.p), mainPos(x.p), x.p.age, LEVEL_NAME[codes[x.p.id]], x.from, x.to]) });
    if (parts.length) message({ cat: 'club', title: `Down on the farm: ${month}`, body: 'Who moved, who is making a case and who is struggling in your minor league clubs.', parts });
  }
  s.myCodes = codes; s.myRates = rates;
}
