// Prospects: a national Top 100 and a top 30 for every club, published by an outlet with its own scouts (so it is sometimes
// wrong), each prospect with the outlet's words on his potential, an arrival year and a risk word. Hype is the buzz around a
// player: a hot start or a jump in the rankings raises it, and the computer clubs pay for it whether or not the talent changed.
import { game } from '../state.js';
import { Rng } from '../core/rng.js';
import { HIST, isPitcher, mainPos, fullName, seasonLine, LEVEL_NAME } from '../data/world.js';
import { caOf } from './ability.js';
import { potentialWords, reportOn } from './scouting.js';
import { message } from './inbox.js';
import { headline } from './headlines.js';
import { outlets } from './media.js';

const W = () => game.world;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const nth = (n) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] || 'th'}`;
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export const OUTLET = { name: 'Diamond Digest', host: 'Walt Ferraro' };
const DIST = { MLB: 0, AAA: 1, AA: 2, 'A+': 3, A: 4, R: 5 };
const EXPECT_AGE = { MLB: 26, AAA: 24.8, AA: 23.5, 'A+': 22.3, A: 21, R: 19.8 };

const state = () => (game.prospects ||= { at: null, list: [], prev: {}, hype: {}, org: {} });

/** What he has done in the majors: at-bats and innings. A prospect has under 130 at-bats and under 50 innings. */
export function careerMLB(p) {
  let ab = 0, outs = 0;
  const ai = 3 + HIST.bat.indexOf('ab'), oi = 3 + HIST.pit.indexOf('outs');
  for (const r of p.hist?.bat || []) if (r && r[1] === 'MLB') ab += r[ai] || 0;
  for (const r of p.hist?.pit || []) if (r && r[1] === 'MLB') outs += r[oi] || 0;
  return { ab, ip: outs / 3 };
}

export function isProspect(p) {
  if (!p || p.retired || !p.orgId || !(p.level in DIST) || (p.age ?? 30) > 26) return false;
  const c = careerMLB(p);
  return c.ab < 130 && c.ip < 50;
}

/** How well he is doing for his level this season, about -2 to +2. */
function performance(p) {
  const y = game.season?.year;
  if (!y || !game.season?.games?.length) return 0;
  if (isPitcher(p)) {
    const l = seasonLine(p, 'pit', y, p.level);
    return l && l.outs >= 60 ? clamp((4.2 - l.era) / 1.1, -2, 2) : 0;
  }
  const l = seasonLine(p, 'bat', y, p.level);
  return l && l.pa >= 80 ? clamp((l.ops - 0.72) / 0.1, -2, 2) : 0;
}

/** The outlet's own view of his potential: the truth with an error that is fixed for the year, so the list can be wrong. */
export function outletPotential(p) {
  const y = game.season?.year ?? game.year;
  const rng = new Rng(`outlet-${p.id}-${y}`);
  return clamp(Math.round((p.pa ?? caOf(p) + 25) + rng.normal(0, 17)), 40, 200);
}

const outletScore = (p) => {
  const age = (EXPECT_AGE[p.level] - (p.age ?? 22)) * 3;
  return 0.62 * outletPotential(p) + 0.25 * caOf(p) + clamp(age, -9, 9) + performance(p) * 3.5;
};

/** Risk from low to extreme: far from the majors, a long way short of his ceiling, or old for his level. */
export function riskWord(p) {
  const gap = Math.max(0, outletPotential(p) - caOf(p));
  const score = DIST[p.level] * 1.1 + gap / 18 + Math.max(0, (p.age ?? 22) - EXPECT_AGE[p.level]) * 0.8;
  return score < 3 ? 'low' : score < 5 ? 'moderate' : score < 7 ? 'high' : 'extreme';
}

/** The year he should arrive, or 'now'. */
export function arrival(p) {
  const gap = Math.max(0, 100 - caOf(p));
  const years = clamp(Math.round(gap / 16 + DIST[p.level] * 0.6 - 0.4), 0, 6);
  return years <= 0 ? 'now' : (game.season?.year ?? game.year) + years;
}

// ---------- the lists ----------

/** Rebuild the national list and every club's top 30, and move the hype. Runs once a month and when asked. */
export function refreshProspects(force = false) {
  const S = state();
  const y = game.season?.year ?? game.year, m = game.date.getMonth();
  if (!force && S.at && S.at.year === y && S.at.month === m) return S;
  const pool = W().list.filter(isProspect).map((p) => ({ p, score: outletScore(p) })).sort((a, b) => b.score - a.score);
  S.prev = Object.fromEntries(S.list.map((x) => [x.pid, x.rank]));
  S.list = pool.slice(0, 100).map((x, i) => ({ pid: x.p.id, rank: i + 1, score: Math.round(x.score) }));
  S.org = {};
  const seen = new Map();
  for (const x of pool) {
    const id = x.p.orgId, n = (seen.get(id) || 0) + 1;
    seen.set(id, n);
    if (n <= 30) (S.org[id] ||= []).push({ pid: x.p.id, rank: n });
  }
  // hype: the rank sets a level, play moves it, and it settles part of the way to wherever that points
  S.hypeWas = { ...S.hype };
  const rankOf = Object.fromEntries(S.list.map((x) => [x.pid, x.rank]));
  for (const { p } of pool) {
    const r = rankOf[p.id];
    const base = r ? (r <= 10 ? 74 : r <= 30 ? 64 : 54) : (S.org[p.orgId] || []).some((x) => x.pid === p.id) ? 42 : 28;
    const jump = r && S.prev[p.id] ? clamp((S.prev[p.id] - r) / 6, -8, 8) : r && !S.prev[p.id] && Object.keys(S.prev).length ? 6 : 0;
    const target = clamp(base + performance(p) * 8 + jump, 0, 100);
    const was = S.hype[p.id] ?? base;
    S.hype[p.id] = Math.round(was + (target - was) * 0.5);
  }
  // hype for players who have left the lists decays
  const live = new Set(pool.map((x) => x.p.id));
  for (const id of Object.keys(S.hype)) if (!live.has(id)) delete S.hype[id];
  S.at = { year: y, month: m };
  return S;
}

export const hypeOf = (p) => state().hype[p.id] ?? null;
export const hypeWords = (h) => (h == null ? '-' : h >= 80 ? 'Phenomenon' : h >= 65 ? 'Big buzz' : h >= 50 ? 'Talked about' : h >= 35 ? 'Quiet' : 'Unknown');

/** Everything shown about one prospect: his rank, club rank, the outlet's words, your scouts' words, arrival, risk, hype. */
export function prospectInfo(p) {
  const S = refreshProspects();
  const nat = S.list.find((x) => x.pid === p.id);
  const org = (S.org[p.orgId] || []).find((x) => x.pid === p.id);
  if (!nat && !org) return null;
  const rep = reportOn(p);
  return {
    rank: nat?.rank ?? null, orgRank: org?.rank ?? null, move: nat && S.prev[p.id] ? S.prev[p.id] - nat.rank : 0,
    outlet: potentialWords(outletPotential(p)), yours: rep?.pj != null ? potentialWords(rep.pj) : null,
    eta: arrival(p), risk: riskWord(p), hype: hypeOf(p),
  };
}

export const nationalList = () => refreshProspects().list.map((x) => ({ ...x, p: W().players.get(x.pid), move: refreshProspects().prev[x.pid] ? refreshProspects().prev[x.pid] - x.rank : null })).filter((x) => x.p);
export const clubList = (orgId) => (refreshProspects().org[orgId] || []).map((x) => ({ ...x, p: W().players.get(x.pid) })).filter((x) => x.p);

// ---------- the monthly news ----------

/** The first of each month in season: the lists are published, with the risers and fallers and your own names. */
export function prospectMonth(date) {
  const S = refreshProspects(true);
  if (S.list.length < 20) return;
  const me = game.orgId, month = MONTHS[date.getMonth()];
  const nat = nationalList();
  const city = (id) => W().orgs.get(id)?.club.city ?? '';
  const row = (x) => [x.rank, { pid: x.p.id, t: fullName(x.p) }, city(x.p.orgId), mainPos(x.p), x.p.age, LEVEL_NAME[x.p.level], x.move ? (x.move > 0 ? `up ${x.move}` : `down ${-x.move}`) : '-'];
  const parts = [{ p: `${OUTLET.name}'s list of the best prospects in baseball is out for ${month}. The outlet has its own scouts and sometimes gets it wrong, so treat it as one view among several.` },
    { head: ['#', 'Prospect', 'Club', 'Pos', 'Age', 'Level', 'Move'], rows: nat.slice(0, 10).map(row) }];
  const risers = nat.filter((x) => x.move >= 12).sort((a, b) => b.move - a.move).slice(0, 3);
  const fallers = nat.filter((x) => x.move != null && x.move <= -12).sort((a, b) => a.move - b.move).slice(0, 2);
  if (risers.length) parts.push({ p: `Risers: ${risers.map((x) => `${fullName(x.p)} (${city(x.p.orgId)}) is up ${x.move} places to ${nth(x.rank)}`).join('; ')}.` });
  if (fallers.length) parts.push({ p: `Fallers: ${fallers.map((x) => `${fullName(x.p)} (${city(x.p.orgId)}) is down ${-x.move} to ${nth(x.rank)}`).join('; ')}.` });
  const mine = nat.filter((x) => x.p.orgId === me);
  if (mine.length) parts.push({ p: `Your system has ${mine.length} of the top 100.` }, { head: ['#', 'Prospect', 'Pos', 'Age', 'Level', 'Arrives', 'Risk', 'Buzz'], rows: mine.slice(0, 8).map((x) => [x.rank, { pid: x.p.id, t: fullName(x.p) }, mainPos(x.p), x.p.age, LEVEL_NAME[x.p.level], arrival(x.p), riskWord(x.p), hypeWords(hypeOf(x.p))]) });
  else parts.push({ p: 'None of the top 100 is in your system. The draft and the international market are where they come from.' });
  buzzNews(S, date);
  const top = nat[0];
  if (top) parts.push({ q: `${fullName(top.p)} is the best prospect in the game and it is not especially close. ${riskWord(top.p) === 'low' ? 'There is very little that can go wrong.' : 'The one question is how quickly he gets there.'}`, by: `${OUTLET.host}, ${OUTLET.name}` });
  message({ cat: 'league', quiet: true, title: `Prospect rankings: ${month}`, parts, body: `The ${month} Top 100.` });
}

// ---------- the buzz ----------

const SAY = {
  radio: ['Every caller wants to talk about {last}. Every one. I have not had a prospect do that to a phone-in since I started doing this show.', 'If {last} is not in the lineup by the summer there will be a march on the front office, and I will be at the front of it.'],
  writer: ['The talk in the clubhouse is no longer whether {last} will make it but when, and the front office knows it is holding something other clubs badly want.', 'Scouts from three clubs were in the stands for {last}\'s last start. They were not there for the hot dogs.'],
  podcast: ['We did forty minutes on {last} this week and nobody wanted to stop. Put him on the list of reasons to buy a ticket.', 'I have seen the video of {last} so many times my wife has asked who he is.'],
  forum: ['{last} is the only reason I check the minor league box scores every morning.', 'Do NOT trade {last}. I do not care what they offer.'],
};

/** Monthly: a story for each of your prospects whose buzz is building, and a headline for the biggest riser in the game. */
function buzzNews(S, date) {
  const me = game.orgId, o = outlets(me);
  const rng = new Rng(`buzz-${me}-${date.getFullYear()}-${date.getMonth()}`);
  const risers = [];
  for (const [id, hy] of Object.entries(S.hype)) {
    const p = W().players.get(id);
    if (!p || p.retired) continue;
    const was = S.hypeWas?.[id] ?? hy;
    if (hy >= 62 && (hy - was >= 7 || (was < 62 && hy >= 62))) risers.push({ p, hy, was });
  }
  risers.sort((a, b) => (b.hy - b.was) - (a.hy - a.was));
  const top = risers.find((x) => x.p.orgId !== me);
  if (top) headline(`PROSPECT WATCH: ${top.p.last.toUpperCase()} (${(W().orgs.get(top.p.orgId)?.club.city ?? '').toUpperCase()}) THE NAME EVERYONE IS TALKING ABOUT`, false);
  for (const x of risers.filter((r) => r.p.orgId === me).slice(0, 2)) {
    const p = x.p, ls = isPitcher(p) ? seasonLine(p, 'pit', game.season?.year, p.level) : seasonLine(p, 'bat', game.season?.year, p.level);
    const line = ls ? (isPitcher(p) ? `${ls.era.toFixed(2)} ERA and ${ls.so} strikeouts in ${(ls.outs / 3).toFixed(0)} innings` : `${ls.avg.toFixed(3).replace(/^0/, '')} with ${ls.hr} home runs in ${ls.pa} plate appearances`) : 'a standout season';
    const info = prospectInfo(p);
    const parts = [{ p: `The buzz around ${fullName(p)} is building. At ${LEVEL_NAME[p.level]} he has ${line}${info?.rank ? `, and he is now ${nth(info.rank)} on the national list` : ''}. The word has got round, and other clubs have noticed.` },
      { p: `Expect calls. A general manager with an eye on the future will pay for a name like this, in some cases more than the scouting reports alone would justify. If you are thinking of selling, this is the moment; if you want him to be your player, so is this.` }];
    for (const k of ['radio', 'writer', 'podcast', 'forum']) {
      if (k === 'podcast' && rng.chance(0.5)) continue;
      const q = rng.pick(SAY[k]).replaceAll('{last}', p.last);
      parts.push({ q, by: k === 'forum' ? `${rng.pick(o.forum.handles)}, on ${o.forum.outlet}` : `${o[k].host}, ${o[k].outlet}` });
    }
    message({ cat: 'club', title: `The buzz around ${fullName(p)}`, player: p.id, parts, body: `${fullName(p)} is the name everyone is talking about.` });
  }
}
