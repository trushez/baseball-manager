// The newspaper side of the game: a report and box score after each of your games, a preview before
// each series, a weekly round-up of the majors, and a monthly report on your farm clubs.
// Messages carry `parts`: paragraphs ({p}), tables ({head, rows}) and box scores ({box}). A table cell
// is text, or { pid, t } for a player's name that opens his profile.
import { crowdLine } from './crowd.js';
import { playerTalk, leagueTalk } from './media.js';
import { fullName, isPitcher, mainPos, positions, seasonLine, LEVEL_NAME } from '../data/world.js';
import { game, orgState } from '../state.js';
import { Rng } from '../core/rng.js';
import { message } from './inbox.js';
import { dayNo, fromDayNo, dateWords } from './calendar.js';
import { divisions, leagues, pct, gb } from './standings.js';
import { probableStarter, userGameOn } from './sim.js';
import { reportLines } from '../narration/report.js';
import { storyContext } from './storyctx.js';

const W = () => game.world;
const club = (id) => W().clubs.get(id);
const city = (id) => club(id)?.city ?? id;
const nick = (id) => { const c = club(id); return c ? `${c.full ?? `${c.city} ${c.name}`}` : id; };
const short = (p) => `${p.first[0]}. ${p.last}`;
const pref = (p, t = p.last) => ({ pid: p.id, t });
const NUM = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve'];
const num = (n) => NUM[n] ?? String(n);
const INN = ['', 'first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth', 'ninth', 'tenth', 'eleventh', 'twelfth', 'thirteenth', 'fourteenth', 'fifteenth'];
const inn = (n) => INN[n] ?? `${n}th`;
const ipWords = (outs) => {
  const ip = Math.floor(outs / 3), r = outs % 3;
  if (!r) return ip === 1 ? 'one inning' : `${num(ip)} innings`;
  if (!ip) return `${r === 1 ? 'a third' : 'two thirds'} of an inning`;
  return `${num(ip)} and ${r === 1 ? 'a third' : 'two thirds'} innings`;
};
const ipText = (outs) => `${Math.floor(outs / 3)}.${outs % 3}`;
const rate = (v) => (v == null ? '' : v.toFixed(3).replace(/^0/, ''));
const on = (k) => game.settings.news?.[k] !== false;
const yr = () => game.season.year;

/** A player's season totals so far (major league games). */
function seasonOf(p, kind) { return seasonLine(p, kind, yr(), 'MLB'); }

// ---------- box score ----------

/** A compact box score from a finished engine game, for the inbox. */
export function boxScore(eng, rec) {
  const first = new Map();
  const sub = new Map();
  for (const e of eng.events) {
    const pid = e.board?.pitcherId;
    if (pid && !first.has(pid)) first.set(pid, e.seq);
    if (e.type === 'sub' && e.data.kind !== 'pitcher') sub.set(e.data.inId, e.data.kind === 'ph' ? 'PH' : e.data.kind === 'pr' ? 'PR' : e.data.pos);
  }
  const out = { away: rec.away, home: rec.home, line: { away: [...eng.linescore.away], home: [...eng.linescore.home] }, rhe: {}, bat: {}, pit: {} };
  for (const key of ['away', 'home']) {
    const side = eng.side[key];
    out.rhe[key] = [eng.score[key], side.hits, side.errors];
    // batters in lineup order, with the players who came in after the starter in each spot
    const slots = side.team.lineup.map((x) => [{ p: x.player, pos: x.pos }]);
    const seen = new Set(side.team.lineup.map((x) => x.player.id));
    for (const e of eng.events) {
      if (e.type !== 'paStart' || seen.has(e.data.batterId)) continue;
      if ((e.half === 'top') !== (key === 'away')) continue;
      const p = side.order.find((o) => o.player.id === e.data.batterId)?.player || [...side.bench, ...side.team.bench].find((x) => x.id === e.data.batterId);
      if (!p) continue;
      seen.add(p.id);
      slots[e.data.order - 1]?.push({ p, pos: sub.get(p.id) || 'PH' });
    }
    out.bat[key] = slots.flat().map(({ p, pos }) => {
      const L = eng.stats.get(p.id) || {};
      return [p.id, short(p), pos, L.AB || 0, L.R || 0, L.H || 0, L.RBI || 0, L.BB || 0, L.K || 0, L.HR || 0];
    });
    const arms = [...eng.stats].filter(([id, L]) => L.BF && [side.team.starter, ...side.team.bullpen].some((p) => p.id === id))
      .sort((a, b) => (first.get(a[0]) ?? 1e9) - (first.get(b[0]) ?? 1e9));
    out.pit[key] = arms.map(([id, L]) => {
      const p = [side.team.starter, ...side.team.bullpen].find((x) => x.id === id);
      const dec = rec.w === id ? 'W' : rec.l === id ? 'L' : rec.sv === id ? 'S' : '';
      return [id, short(p), ipText(L.pOuts), L.pH, L.pR, L.pBB, L.pK, L.pHR, L.pitches, dec];
    });
  }
  return out;
}

// ---------- the game report ----------

const VERB = { '1B': 'singled', '2B': 'doubled', '3B': 'tripled', HR: 'homered', BB: 'drew a walk', IBB: 'was walked', HBP: 'was hit by a pitch', SF: 'hit a sacrifice fly', GO: 'grounded out', FO: 'flied out', PO: 'popped out', LO: 'lined out', DP: 'grounded into a double play', K: 'struck out' };

/** The report after one of your games: a few paragraphs and the box score. */
export function gameReport(rec, eng, neutral = false) {
  const rng = new Rng(`recap-${rec.id}`);
  const [a, hm] = rec.s;
  const winKey = hm > a ? 'home' : 'away', loseKey = winKey === 'home' ? 'away' : 'home';
  const winId = rec[winKey], loseId = rec[loseKey];
  const us = rec.home === game.orgId ? 'home' : 'away';
  const won = !neutral && winKey === us;
  const P = (id) => W().players.get(id);
  const hi = Math.max(a, hm), lo = Math.min(a, hm);
  const venue = club(rec.home).venue;
  const extra = rec.inn > 9 ? ` in ${num(rec.inn)} innings` : '';
  const recOf = (id) => { const r = game.season.records.get(id); return r ? `${r.w}-${r.l}` : ''; };

  const walkOff = eng.events.some((e) => e.type === 'halfEnd' && e.data.walkOff);

  // the star of the game on the winning side
  const score = (L) => (L.H || 0) + (L['2B'] || 0) + 2 * (L['3B'] || 0) + 3 * (L.HR || 0) + (L.RBI || 0) + 0.6 * (L.R || 0) + 0.4 * (L.BB || 0);
  const winBats = eng.side[winKey].team.lineup.map((x) => x.player).concat(eng.side[winKey].team.bench)
    .filter((p) => eng.stats.get(p.id)?.PA).sort((x, y) => score(eng.stats.get(y.id)) - score(eng.stats.get(x.id)));
  const star = winBats[0];
  const starLine = (p) => {
    const L = eng.stats.get(p.id);
    const bits = [`went ${num(L.H)} for ${num(L.AB)}`];
    const xb = [];
    if (L.HR) xb.push(L.HR === 1 ? 'a home run' : `${num(L.HR)} home runs`);
    if (L['2B']) xb.push(L['2B'] === 1 ? 'a double' : `${num(L['2B'])} doubles`);
    if (L['3B']) xb.push('a triple');
    if (xb.length) bits.push(`with ${xb.join(' and ')}`);
    if (L.RBI) bits.push(`${xb.length ? ', ' : ' '}and drove in ${L.RBI === 1 ? 'a run' : `${num(L.RBI)} runs`}`);
    return bits.slice(0, xb.length ? 2 : 1).join(' ') + (L.RBI ? bits[bits.length - 1] : '');
  };

  const pitLine = (id, kind) => {
    const p = P(id); const L = eng.stats.get(id);
    if (!p || !L) return '';
    const s = seasonOf(p, 'pit');
    const rec2 = s ? ` (${s.w}-${s.l})` : '';
    const runs = L.pR === 0 ? 'kept them off the board' : L.pR === 1 ? 'allowed one run' : `allowed ${num(L.pR)} runs`;
    const who = mentioned.has(id) ? p.last : (mentioned.add(id), fullName(p));
    if (!L.pOuts) return `${who}${rec2} ${kind === 'L' ? 'took the loss' : kind === 'W' ? 'got the win' : 'pitched'} without getting anybody out.`;
    return `${who}${rec2} ${runs} over ${ipWords(L.pOuts)}${L.pK >= 5 ? `, striking out ${num(L.pK)}` : ''}${kind === 'W' ? ' for the win' : kind === 'L' ? ' and took the loss' : ''}.`;
  };

  const paras = [];
  // the most runs the winner trailed by
  let ra = 0, rh = 0, back = 0;
  for (let i = 0; i < Math.max(eng.linescore.away.length, eng.linescore.home.length); i++) {
    ra += eng.linescore.away[i] || 0; if (winKey === 'home') back = Math.max(back, ra - rh);
    rh += eng.linescore.home[i] || 0; if (winKey === 'away') back = Math.max(back, rh - ra);
  }
  const W_ = nick(winId), L_ = nick(loseId), w_ = city(winId), l_ = city(loseId);
  let leadIns = won
    ? [`${W_} beat ${L_} ${hi}-${lo}${extra} at ${venue}.`, `It finished ${hi}-${lo} to ${w_}${extra}, a win over ${l_} at ${venue}.`,
      `${w_} took this one ${hi}-${lo}${extra} against ${L_}.`, `A ${hi}-${lo} win for ${W_}${extra}${rec.home === loseId ? `, beating ${l_} on their own field` : ` at ${venue}`}.`,
      `${W_} got the better of ${l_}, ${hi}-${lo}${extra}.`]
    : [`${W_} beat ${L_} ${hi}-${lo}${extra} at ${venue}.`, `${l_} went down ${hi}-${lo}${extra} to ${W_} at ${venue}.`,
      `${L_} lost ${hi}-${lo}${extra} to ${w_}.`, `No luck for ${l_}: ${W_} won ${hi}-${lo}${extra} at ${venue}.`,
      `${w_} beat ${l_} ${hi}-${lo}${extra}, and ${l_} have some thinking to do.`];
  if (hi + lo >= 15) leadIns = [`A slugfest at ${venue}: ${W_} outscored ${L_} ${hi}-${lo}${extra}.`, `The pitchers will want to forget this one. ${w_} won ${hi}-${lo}${extra} over ${l_}.`, `Runs everywhere at ${venue}, and ${w_} had more of them: ${hi}-${lo}${extra} against ${l_}.`];
  else if (hi <= 2 && rec.inn <= 9) leadIns = [`A pitchers' duel at ${venue} went to ${W_}, ${hi}-${lo} over ${L_}.`, `Runs were hard to come by, and ${w_} found just enough of them to beat ${l_} ${hi}-${lo}.`, `${w_} won a tight, low-scoring game against ${l_}, ${hi}-${lo}.`];
  else if (hi - lo === 1) leadIns.push(`${w_} held on to edge ${l_} ${hi}-${lo}${extra}.`, `One run was the difference: ${W_} ${hi}, ${L_} ${lo}${extra}.`, `${w_} survived a nervous finish to beat ${l_} ${hi}-${lo}${extra}.`);
  if (rec.inn >= 11) leadIns = [`${W_} outlasted ${L_} ${hi}-${lo} in ${num(rec.inn)} innings at ${venue}.`, `It took ${num(rec.inn)} innings, but ${w_} beat ${l_} ${hi}-${lo} in the end.`, `A marathon at ${venue}: ${num(rec.inn)} innings before ${w_} put away ${l_}, ${hi}-${lo}.`];
  let first = rng.pick(leadIns);
  if (back >= 3) first = rng.pick([`${W_} came from ${num(back)} runs down to beat ${L_} ${hi}-${lo}${extra}.`, `${l_} led by ${num(back)} and still lost: ${W_} fought back to win ${hi}-${lo}${extra}.`, `A comeback at ${venue}. ${w_} trailed by ${num(back)} before beating ${l_} ${hi}-${lo}${extra}.`]);
  if (walkOff) first = rng.pick([`${nick(rec.home)} won it in their last turn at bat, ${hi}-${lo}${extra}, against ${nick(rec.away)}.`, `A walk-off at ${venue}: ${nick(rec.home)} beat ${nick(rec.away)} ${hi}-${lo}${extra} with the winning run in the bottom of the ${inn(rec.inn)}.`, `${city(rec.away)} could not close it out. ${nick(rec.home)} won ${hi}-${lo}${extra} on the last swing of the night.`]);
  if (hi - lo >= 8) first = rng.pick([`${W_} ran away with it, ${hi}-${lo} over ${L_}${extra}.`, `${l_} were outplayed from start to finish, beaten ${hi}-${lo} by ${W_}.`, `It was a rout: ${W_} ${hi}, ${L_} ${lo}.`]);
  if (lo === 0) first = rng.pick([`${W_} shut out ${L_} ${hi}-0${extra} at ${venue}.`, `${l_} never got on the board. ${W_} won ${hi}-0${extra}.`, `Not a run for ${l_}, who lost ${hi}-0${extra} to ${W_}.`]);
  const starIntro = (p) => rng.pick([`${fullName(p)} ${starLine(p)}.`, `${fullName(p)} led the way: he ${starLine(p)}.`, `The star was ${fullName(p)}, who ${starLine(p)}.`]);
  paras.push(first + (star ? ` ${starIntro(star)}` : ''));

  // the key plays and the stories of the game, from the same lines as the radio call
  const mentioned = new Set(star ? [star.id] : []);
  const told = reportLines(eng, {
    teams: { away: club(rec.away), home: club(rec.home) }, players: W().players, seed: rec.id, mentioned,
    story: storyContext(rec, { after: true, eng }),
  });
  if (told.moments.length) paras.push(told.moments.join(' '));
  if (told.stories.length) paras.push(told.stories.join(' '));

  const pitch = [];
  if (rec.w) pitch.push(pitLine(rec.w, 'W'));
  if (rec.l) pitch.push(pitLine(rec.l, 'L'));
  if (rec.sv) { const p = P(rec.sv); const s = p && seasonOf(p, 'pit'); if (p) pitch.push(`${fullName(p)} got the last outs for his ${s ? ordinalWord(s.sv) : 'first'} save.`); }
  if (pitch.length) paras.push(pitch.join(' '));

  // home runs, with season totals
  const hrs = [];
  for (const key of ['away', 'home']) for (const [id, L] of eng.stats) {
    if (!L.HR) continue;
    const p = P(id);
    if (!p || p.orgId !== club(rec[key]).org || ![...eng.side[key].team.lineup.map((x) => x.player), ...eng.side[key].team.bench].some((x) => x.id === id)) continue;
    const s = seasonOf(p, 'bat');
    hrs.push(`${p.last}${L.HR > 1 ? ` ${L.HR}` : ''} (${s?.hr ?? L.HR})`);
  }
  if (hrs.length) paras.push(`Home runs: ${hrs.join(', ')}.`);

  // streaks and the table
  const r = game.season.records.get(game.orgId);
  const run = r?.last?.match(/(W+|L+)$/)?.[0] || '';
  const tail = [];
  if (!rec.post && !neutral) {
    tail.push(`${city(game.orgId)} are ${recOf(game.orgId)}`);
    if (run.length >= 3) tail.push(run[0] === 'W' ? `winners of ${num(run.length)} straight` : `losers of ${num(run.length)} in a row`);
    const div = [...divisions().entries()].find(([, ids]) => ids.includes(game.orgId));
    if (div) {
      const place = div[1].indexOf(game.orgId);
      const g = gb(game.season.records.get(div[1][0]), r);
      const lead = div[1][1] ? gb(r, game.season.records.get(div[1][1])) : 0;
      tail.push(place === 0 ? `first in the ${shortDiv(div[0])}${div[1][1] ? (lead > 0 ? `, ${gbWords(lead)} clear` : `, level with ${city(div[1][1])}`) : ''}` : g > 0 ? `${gbWords(g)} behind ${city(div[1][0])} in the ${shortDiv(div[0])}` : `level with ${city(div[1][0])} at the top of the ${shortDiv(div[0])}`);
    }
    paras.push(`${tail.join(', ')}.`);
  }
  return paras;
}

const ordinalWord = (n) => (['zeroth', 'first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth', 'ninth', 'tenth'][n] ?? `${n}${n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] || 'th'}`);
const gbWords = (g) => (g === 0.5 ? 'half a game' : g === 1 ? 'one game' : `${g % 1 ? g.toFixed(1) : num(g)} games`);
const shortDiv = (d) => d.replace('American League', 'AL').replace('National League', 'NL');

/** The message after one of your games. */
export function resultMessage(rec, eng) {
  const [a, hm] = rec.s;
  const won = (rec.home === game.orgId) === (hm > a);
  const name = (id) => { const p = W().players.get(id); return p ? short(p) : ''; };
  const decisions = `W: ${name(rec.w)}. L: ${name(rec.l)}.${rec.sv ? ` S: ${name(rec.sv)}.` : ''}`;
  const parts = [];
  if (eng && on('recaps')) {
    for (const t of gameReport(rec, eng)) parts.push({ p: t });
    if (rec.att) parts.push({ p: `${city(rec.home)}: ${crowdLine(rec)}` });
    parts.push({ box: rec.box || boxScore(eng, rec) });
  } else parts.push({ p: `${won ? 'Win' : 'Loss'}. ${decisions}` });
  // what the radio, the papers and the fans are saying about our players, when there is something to say
  const ours = eng ? [...eng.stats.keys()].map((id) => W().players.get(id)).filter((p) => p && p.orgId === game.orgId) : [];
  const talk = playerTalk(game.orgId, ours);
  // filed in the Games tab, already read: the Continue bar and the match screen have shown the score
  message({ cat: 'result', minor: true, title: `${city(rec.away)} ${a}, ${city(rec.home)} ${hm}${rec.inn > 9 ? ` (${rec.inn} innings)` : ''}`, body: `${won ? 'Win' : 'Loss'}. ${decisions}`, parts, won, voices: talk.length ? talk : undefined });
  // box scores are large: keep them on the most recent 40 results only
  const results = game.inbox.filter((m) => m.cat === 'result' && m.parts?.some((x) => x.box));
  for (const m of results.slice(0, Math.max(0, results.length - 40))) m.parts = m.parts.filter((x) => !x.box);
}

// ---------- series preview ----------

/** Called each morning: a preview when a new series starts today. */
export function maybePreview(d) {
  if (!on('previews') || !game.season || game.phase === 'over') return;
  const g = userGameOn(d);
  if (!g || g.post) return; // postseason series have their own previews
  const opp = g.home === game.orgId ? g.away : g.home;
  const mine = game.season.games.filter((x) => x.level === 'MLB' && (x.home === game.orgId || x.away === game.orgId));
  const prev = mine.filter((x) => x.d < d).sort((x, y) => y.d - x.d)[0];
  if (prev && (prev.home === opp || prev.away === opp) && d - prev.d <= 1) return;
  // a preview for the first series, for division rivals and for the last two months; other series just play
  const rival = [...divisions().values()].some((ids) => ids.includes(opp) && ids.includes(game.orgId));
  if (prev && !rival && fromDayNo(d).getMonth() < 7) return;
  const series = [];
  for (let k = d; k < d + 7; k++) { const x = mine.find((y) => y.d === k); if (!x || (x.home !== opp && x.away !== opp)) break; series.push(x); }
  previewMessage(g, opp, series);
}

function previewMessage(g, opp, series) {
  const R = game.season.records;
  const r = R.get(opp) || { w: 0, l: 0, rs: 0, ra: 0, last: '' };
  const home = g.home === game.orgId;
  const n = series.length;
  const parts = [];
  const div = [...divisions().entries()].find(([, ids]) => ids.includes(opp));
  const place = div ? div[1].indexOf(opp) : -1;
  const games = r.w + r.l;
  let p1 = home ? `${nick(opp)} come to ${club(game.orgId).venue} for ${n === 1 ? 'one game' : `${num(n)} games`}, starting ${dateWords(fromDayNo(g.d))}.`
    : `${city(game.orgId)} go to ${club(opp).venue} for ${n === 1 ? 'one game' : `${num(n)} games`} with ${nick(opp)}, starting ${dateWords(fromDayNo(g.d))}.`;
  if (g.post) p1 = `${nick(opp)} next, in the postseason.`;
  if (games) {
    const l10 = [...(r.last || '')];
    const w10 = l10.filter((x) => x === 'W').length;
    const placeWords = place === 0 ? `lead the ${shortDiv(div[0])}` : div ? `are ${ordinalWord(place + 1)} in the ${shortDiv(div[0])}, ${gbWords(gb(R.get(div[1][0]), r))} back` : '';
    p1 += ` They are ${r.w}-${r.l} and ${placeWords}. They have won ${num(w10)} of their last ${num(l10.length)}, scoring ${(r.rs / games).toFixed(1)} runs a game and allowing ${(r.ra / games).toFixed(1)}.`;
  }
  // this season's meetings
  const met = game.season.games.filter((x) => x.s && !x.post && x.level === 'MLB' && ((x.home === opp && x.away === game.orgId) || (x.away === opp && x.home === game.orgId)));
  if (met.length) {
    const w = met.filter((x) => (x.home === game.orgId) === (x.s[1] > x.s[0])).length;
    p1 += ` The season series stands ${w}-${met.length - w}${w > met.length - w ? ' in your favour' : w < met.length - w ? ' to them' : ''}.`;
  }
  parts.push({ p: p1 });

  // probable starters: today from the rotation, the rest in rotation order
  const starters = (orgId) => {
    const st = orgState(orgId);
    const first = probableStarter(orgId, 'MLB', g.d);
    const rot = st.rotation.map((id) => W().players.get(id)).filter(Boolean);
    const i = Math.max(0, rot.findIndex((p) => p.id === first?.id));
    return series.map((_, k) => (k === 0 ? first : rot[(i + k) % rot.length]) || null);
  };
  const theirs = starters(opp), ours = starters(game.orgId);
  const pline = (p) => { if (!p) return '-'; const s = seasonOf(p, 'pit'); return s?.outs ? `${s.w}-${s.l}, ${s.era.toFixed(2)}` : 'no starts yet'; };
  parts.push({
    head: ['Game', city(opp), '', city(game.orgId), ''],
    rows: series.map((x, k) => [dateWords(fromDayNo(x.d)), theirs[k] ? pref(theirs[k], short(theirs[k])) : '-', pline(theirs[k]), ours[k] ? pref(ours[k], short(ours[k])) : '-', pline(ours[k])]),
  });

  // their players to watch
  const o = W().orgs.get(opp), st = orgState(opp);
  const act = o.players.filter((p) => st.active.has(p.id));
  const bats = act.filter((p) => !isPitcher(p)).map((p) => ({ p, s: seasonOf(p, 'bat') })).filter((x) => x.s && x.s.pa >= Math.max(10, games * 2));
  const watch = [];
  const best = bats.sort((x, y) => y.s.ops - x.s.ops)[0];
  if (best) watch.push(`${fullName(best.p)} (${rate(best.s.avg)}, ${best.s.hr} HR, ${rate(best.s.ops)} OPS) is the bat to watch.`);
  const power = bats.filter((x) => x !== best).sort((x, y) => y.s.hr - x.s.hr)[0];
  if (power && power.s.hr >= 3) watch.push(`${fullName(power.p)} has ${power.s.hr} home runs.`);
  const closerId = Object.entries(st.pen || {}).find(([, role]) => role === 'Closer')?.[0];
  const closer = closerId && W().players.get(closerId);
  if (closer) { const s = seasonOf(closer, 'pit'); watch.push(`${fullName(closer)} closes${s?.sv ? ` (${s.sv} save${s.sv === 1 ? '' : 's'}, ${s.era.toFixed(2)} ERA)` : ''}.`); }
  const hurt = o.players.filter((p) => st.il.has(p.id) && p.contract?.aav >= 10e6);
  if (hurt.length) watch.push(`They are without ${hurt.map(fullName).join(' and ')}, on the injured list.`);
  if (watch.length) parts.push({ p: watch.join(' ') });
  message({ cat: 'preview', minor: true, title: `Preview: ${home ? `${city(opp)} at ${city(game.orgId)}` : `${city(game.orgId)} at ${city(opp)}`}${n > 1 ? `, ${num(n)} games` : ''}`, parts, date: fromDayNo(g.d).getTime() });
}

// ---------- the week in the majors ----------


const diffOf = (now, snap, id, k) => { const a = now.get(id)?.[k], z = snap?.get(id)?.[k]; return a ? a.map((v, i) => v - (z?.[i] || 0)) : null; };
const opsOf = (b) => { const [, , ab, h, b2, b3, hr, , , bb, , , , hbp, sf] = b; return (h + bb + hbp) / Math.max(1, ab + bb + hbp + sf) + (h + b2 + 2 * b3 + 3 * hr) / Math.max(1, ab); };

/** Every second Monday: how your division has gone over the fortnight, and where the other divisions stand. */
export function weeklyRoundup() {
  const s = game.season;
  const recSnap = s.weekRec;
  const first = !recSnap;
  s.weekN = (s.weekN || 0) + 1;
  if (first || s.weekN % 2) { if (first) s.weekRec = snapRecords(s); return; }
  s.weekRec = snapRecords(s);
  if (!on('weekly')) return;
  const div = [...divisions().entries()].find(([, ids]) => ids.includes(game.orgId));
  if (!div) return;
  const ids = div[1];
  const lead = s.records.get(ids[0]);
  const fort = (id) => { const r = s.records.get(id), z = recSnap.get(id) || { w: 0, l: 0 }; return { w: r.w - z.w, l: r.l - z.l }; };
  const rows = ids.map((id) => {
    const r = s.records.get(id), f = fort(id);
    return [id === game.orgId ? `${nick(id)} (you)` : nick(id), `${r.w}-${r.l}`, id === ids[0] ? '-' : gbWords(gb(lead, r)).replace(' games', '').replace('one game', '1').replace('half a game', '0.5'), `${f.w}-${f.l}`];
  });
  const hot = ids.slice().sort((a, b) => (fort(b).w - fort(b).l) - (fort(a).w - fort(a).l))[0];
  const me = fort(game.orgId);
  const parts = [
    { p: `${shortDiv(div[0])}: ${nick(ids[0])} lead the division${ids[1] ? `, ${gbWords(gb(lead, s.records.get(ids[1])))} clear of ${city(ids[1])}` : ''}. ${hot === game.orgId ? 'You' : city(hot)} had the best fortnight in the division at ${fort(hot).w}-${fort(hot).l}. Your own fortnight: ${me.w}-${me.l}.` },
    { head: ['Club', 'Record', 'GB', 'Last two weeks'], rows },
  ];
  // the other divisions, in a line each
  const others = [];
  for (const lg of leagues()) {
    for (const [d, dids] of divisions(lg)) {
      if (d === div[0]) continue;
      const l = s.records.get(dids[0]);
      others.push([shortDiv(d), nick(dids[0]), `${l.w}-${l.l}`, dids[1] ? `${gbWords(gb(l, s.records.get(dids[1])))} over ${city(dids[1])}` : '']);
    }
  }
  parts.push({ head: ['Elsewhere', 'Leader', 'Record', 'Lead'], rows: others });
  message({ cat: 'league', quiet: true, title: `The division: ${city(ids[0])} lead the ${shortDiv(div[0])}`, parts });
}

const snapRecords = (s) => new Map([...s.records].map(([id, r]) => [id, { w: r.w, l: r.l }]));

// ---------- the farm report ----------

/** Once a month: how each of your minor league clubs is doing, and who is playing well. */
export function farmReport(date) {
  if (!on('farm')) return;
  const o = W().orgs.get(game.orgId), st = orgState();
  const rows = [];
  for (const lv of ['AAA', 'AA', 'A+', 'A', 'R']) {
    const t = o.affiliates[lv];
    if (!t) continue;
    const r = game.season.minorRecords.get(t.id);
    const here = o.players.filter((p) => st.level.get(p.id) === lv && !st.active.has(p.id));
    const games = r ? r.w + r.l : 0;
    const bat = here.filter((p) => !isPitcher(p)).map((p) => ({ p, s: seasonLine(p, 'bat', yr(), lv) })).filter((x) => x.s && x.s.pa >= Math.max(20, games * 2.5)).sort((a, b) => b.s.ops - a.s.ops)[0];
    const arm = here.filter(isPitcher).map((p) => ({ p, s: seasonLine(p, 'pit', yr(), lv) })).filter((x) => x.s && x.s.outs >= Math.max(30, games * 1.5)).sort((a, b) => a.s.era - b.s.era)[0];
    rows.push([LEVEL_NAME[lv], `${t.full ?? `${t.city} ${t.name}`}`, r ? `${r.w}-${r.l}` : '',
      bat ? pref(bat.p, `${short(bat.p)} (${bat.p.age})`) : '-', bat ? `${rate(bat.s.avg)}, ${bat.s.hr} HR, ${rate(bat.s.ops)} OPS` : '',
      arm ? pref(arm.p, `${short(arm.p)} (${arm.p.age})`) : '-', arm ? `${arm.s.era.toFixed(2)} ERA, ${ipText(arm.s.outs)} IP, ${arm.s.so} K` : '']);
  }
  if (!rows.length) return;
  message({
    cat: 'club', title: `Farm report: ${date.toLocaleString('en-GB', { month: 'long' })}`,
    parts: [{ p: 'Your scouts on the minor league clubs, with the best hitter and pitcher at each level this season.' },
      { head: ['Level', 'Club', 'W-L', 'Best hitter', '', 'Best pitcher', ''], rows }],
  });
}

