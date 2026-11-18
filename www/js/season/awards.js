// Honours: the All-Star teams and game at the break, and the season's awards after the World Series
// (MVP, Cy Young, Rookie of the Year, Gold Gloves, Silver Sluggers, Manager of the Year). Every pick comes
// from a value measure built on the game's own figures: TBO9+ for hitters and TBA9- for pitchers, scaled
// by playing time, with a position adjustment and the player's defence. Honours are kept on the player
// (p.hon) and in game.awards.
import { game } from '../state.js';
import { fullName, isPitcher, seasonLine } from '../data/world.js';
import { tboPlus, tbaMinus } from './tb.js';
import { fieldingAt } from '../data/attributes.js';
import { managerName } from './history.js';
import { mediaQuote } from './media.js';
import { divisions, leagues } from './standings.js';
import { message } from './inbox.js';
import { vote, margin } from './voting.js';
import { headline } from './headlines.js';
import { boxScore } from './news.js';
import { teamFrom } from '../club/match.js';
import { Game } from '../engine/game.js';
import { toEngineTeam } from '../club/engine-team.js';

const W = () => game.world;
const yr = () => game.season.year;
const lgShort = (l) => (l.startsWith('American') ? 'AL' : 'NL');
const city = (id) => W().orgs.get(id)?.club.city ?? id;
const POS_ADJ = { C: 10, SS: 7, CF: 5, '2B': 3, '3B': 3, LF: -5, RF: -5, '1B': -9, DH: -15 };
const FIELD = ['C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF'];

/** Games at each position this season (DH too), kept as the season goes. */
export function notePosition(p, pos) {
  if (p.filler) return;
  const y = yr();
  if (p.pyr?.y !== y) p.pyr = { y, c: {} };
  p.pyr.c[pos] = (p.pyr.c[pos] || 0) + 1;
}
const posGames = (p) => (p.pyr?.y === yr() ? p.pyr.c : {});
const mainPosNow = (p) => Object.entries(posGames(p)).sort((a, b) => b[1] - a[1])[0]?.[0] || p.pos;

/** A hitter's value this season in runs above replacement (roughly ten to a win). */
function hitValue(p) {
  const s = seasonLine(p, 'bat', yr(), 'MLB');
  if (!s?.pa) return null;
  const plus = tboPlus(s, yr()) ?? 100;
  const pos = mainPosNow(p);
  const share = s.pa / 600;
  const bat = ((plus - 100) / 100) * s.pa * 0.13;
  const r = pos === 'DH' ? null : fieldingAt(p, pos);
  const def = r ? ((r.range * 0.5 + r.hands * 0.3 + r.arm * 0.2) - 50) * 0.5 * share : 0;
  return { p, s, plus, pos, runs: bat + (POS_ADJ[pos] ?? 0) * share + def + 20 * share };
}
/** A pitcher's value this season in runs above replacement. */
function pitValue(p) {
  const s = seasonLine(p, 'pit', yr(), 'MLB');
  if (!s?.outs) return null;
  const minus = tbaMinus(s, p, yr()) ?? 100;
  const ip = s.outs / 3;
  const rel = s.gs < s.g / 2;
  return { p, s, minus, ip, rel, runs: ((100 - minus) / 100) * ip * 0.55 * (rel ? 1.6 : 1) + ip * (rel ? 0.12 : 0.1) };
}

/** Everyone in a league with a season line. */
function pool(lg) {
  const out = { hit: [], pit: [] };
  for (const o of W().orgs.values()) {
    if (o.club.league !== lg) continue;
    for (const p of o.players) {
      if (p.filler) continue;
      if (isPitcher(p)) { const v = pitValue(p); if (v) out.pit.push(v); } else { const v = hitValue(p); if (v) out.hit.push(v); }
    }
  }
  out.hit.sort((a, b) => b.runs - a.runs);
  out.pit.sort((a, b) => b.runs - a.runs);
  return out;
}

const honour = (p, text) => { (p.hon ||= []).push(text); };
const r3 = (v) => (v == null ? '-' : v.toFixed(3).replace(/^0/, ''));
const war = (runs) => (runs / 10).toFixed(1);
const ipT = (outs) => `${Math.floor(outs / 3)}.${outs % 3}`;
const pref = (p, t = fullName(p)) => ({ pid: p.id, t });
const batLine = (v) => `${r3(v.s.avg)}/${r3(v.s.obp)}/${r3(v.s.slg)}, ${v.s.hr} HR, ${v.s.rbi} RBI, TBO9+ ${v.plus}`;
const pitLine = (v) => `${v.s.w}-${v.s.l}, ${v.s.era?.toFixed(2)} ERA, ${ipT(v.s.outs)} IP, ${v.s.so} K${v.s.sv ? `, ${v.s.sv} SV` : ''}, TBA9- ${v.minus}`;

// ---------- the All-Stars ----------

/** At the break: pick both teams, play the game, tell everyone. */
export function allStarBreak() {
  if (game.awards?.[yr()]?.allStar) return;
  const A = ((game.awards ||= {})[yr()] ||= {});
  const teams = {};
  for (const lg of leagues()) teams[lg] = pickAllStars(lg);
  A.allStar = Object.fromEntries(Object.entries(teams).map(([lg, t]) => [lgShort(lg), t.all.map((x) => x.p.id)]));
  const me = game.orgId;
  const mine = Object.values(teams).flatMap((t) => t.all).filter((x) => x.p.orgId === me);
  for (const t of Object.values(teams)) for (const x of t.all) honour(x.p, `${yr()} All-Star`);

  const parts = [{ p: `The All-Star teams are announced. ${mine.length ? `${mine.length === 1 ? 'One of your players is' : `${mine.length} of your players are`} going: ${mine.map((x) => fullName(x.p)).join(', ')}.` : 'None of your players made it this year.'}` }];
  for (const [lg, t] of Object.entries(teams)) {
    parts.push({ head: [`${lgShort(lg)} starters`, 'Club', 'Season'], rows: t.starters.map((x) => [pref(x.p, `${x.slot}: ${fullName(x.p)}`), city(x.p.orgId), batLine(x)]) });
    parts.push({ head: [`${lgShort(lg)} reserves`, 'Club', 'Season'], rows: t.reserves.map((x) => [pref(x.p, `${x.pos}: ${fullName(x.p)}`), city(x.p.orgId), batLine(x)]) });
    parts.push({ head: [`${lgShort(lg)} pitchers`, 'Club', 'Season'], rows: t.arms.map((x) => [pref(x.p, `${x.rel ? 'RP' : 'SP'}: ${fullName(x.p)}`), city(x.p.orgId), pitLine(x)]) });
  }
  headline(`ALL-STAR TEAMS NAMED${mine.length ? `: ${mine.length} FROM ${city(me).toUpperCase()}` : ''}`, mine.length > 0);
  // the reaction at home: pride in those picked, anger at a snub
  const talk = [];
  if (mine.length) talk.push(mediaQuote(me, 'allStar', { p: mine.sort((a, b) => b.runs - a.runs)[0].p }));
  const myLg = W().orgs.get(me).club.league, picked = new Set(Object.values(teams).flatMap((t) => t.all).map((x) => x.p.id));
  const { hit: hh, pit: pp } = pool(myLg);
  const cut = [...hh, ...pp].sort((a, b) => b.runs - a.runs)[24]?.runs ?? Infinity;
  const snub = [...hh, ...pp].filter((v) => v.p.orgId === me && !picked.has(v.p.id) && v.runs >= cut).sort((a, b) => b.runs - a.runs)[0];
  if (snub) talk.push(mediaQuote(me, 'snub', { p: snub.p, form: isPitcher(snub.p) ? `${snub.s.era?.toFixed(2)} ERA` : `${r3(snub.s.avg)} with ${snub.s.hr} homers` }));
  message({ cat: mine.length ? 'club' : 'league', important: mine.length > 0, quiet: true, title: `The ${yr()} All-Stars${mine.length ? `: ${mine.length} of yours` : ''}`, parts, voices: talk.filter(Boolean).length ? talk.filter(Boolean) : undefined });
  playAllStarGame(teams);
}

function pickAllStars(lg) {
  const { hit, pit } = pool(lg);
  const used = new Set();
  const take = (v, extra = {}) => { used.add(v.p.id); return { ...v, ...extra }; };
  // a starter at each position (three outfielders), by value at the position he has played most
  const starters = [];
  for (const slot of ['C', '1B', '2B', '3B', 'SS', 'OF', 'OF', 'OF', 'DH']) {
    const fits = (v) => !used.has(v.p.id) && (slot === 'OF' ? ['LF', 'CF', 'RF'].includes(v.pos) : slot === 'DH' ? true : v.pos === slot) && v.s.pa >= 120;
    const v = hit.find(fits);
    if (v) starters.push(take(v, { slot: slot === 'OF' ? v.pos : slot }));
  }
  // reserves: a second catcher, then the best of the rest, sixteen hitters in all
  const reserves = [];
  const c2 = hit.find((v) => !used.has(v.p.id) && v.pos === 'C' && v.s.pa >= 100);
  if (c2) reserves.push(take(c2));
  for (const v of hit) { if (starters.length + reserves.length >= 17) break; if (!used.has(v.p.id) && v.s.pa >= 150) reserves.push(take(v)); }
  // pitchers: nine starters and five relievers
  const arms = [...pit.filter((v) => !v.rel && v.ip >= 50).slice(0, 9), ...pit.filter((v) => v.rel && v.ip >= 20).slice(0, 5)].map((v) => take(v));
  // every club sends someone: its best player replaces the last reserve of a club with more than one
  const all = () => [...starters, ...reserves, ...arms];
  for (const o of W().orgs.values()) {
    if (o.club.league !== lg || all().some((x) => x.p.orgId === o.id)) continue;
    const best = [...hit, ...pit].filter((v) => v.p.orgId === o.id).sort((a, b) => b.runs - a.runs)[0];
    if (!best) continue;
    const list = isPitcher(best.p) ? arms : reserves;
    const counts = (id) => all().filter((x) => x.p.orgId === id).length;
    for (let i = list.length - 1; i >= 0; i--) if (counts(list[i].p.orgId) > 1 && !(list === reserves && list[i].pos === 'C' && i === 0)) { list.splice(i, 1, best); break; }
  }
  arms.sort((a, b) => (a.rel - b.rel) || b.runs - a.runs);
  return { starters, reserves, arms, all: all() };
}

function playAllStarGame(teams) {
  const [alKey, nlKey] = leagues().slice().sort();
  const al = teams[alKey], nl = teams[nlKey];
  const home = yr() % 2 ? 'AL' : 'NL';
  const side = (t, name, kitA, kitB) => {
    const club = { id: name, city: name === 'AL' ? 'American League' : 'National League', name: 'All-Stars', abbr: name, kitA, kitB };
    const lineup = t.starters.map((x) => ({ p: x.p, pos: x.slot === 'DH' ? 'DH' : x.slot }));
    const sp = t.arms.filter((x) => !x.rel), rp = t.arms.filter((x) => x.rel);
    const pen = [...sp.slice(1).map((x) => ({ p: x.p, role: 'Long', status: 'Rested' })), ...rp.map((x, i) => ({ p: x.p, role: i === 0 ? 'Closer' : 'Setup', status: 'Rested' }))];
    return teamFrom(club, { lineup, bench: t.reserves.map((x) => x.p), starter: sp[0].p, pen, instr: { hook: 'quick' } });
  };
  const A = side(al, 'AL', '#1f3d8a', '#e8e8e8'), N = side(nl, 'NL', '#9e1b2c', '#e8e8e8');
  const away = home === 'AL' ? N : A, hm = home === 'AL' ? A : N;
  const g = new Game({ away: toEngineTeam(away), home: toEngineTeam(hm), seed: `asg-${yr()}-${game.luck}` }).playAll();
  const rec = { id: `asg-${yr()}`, away: away.id, home: hm.id, s: [g.score.away, g.score.home], inn: g.inning };
  const winKey = g.score.home > g.score.away ? 'home' : 'away';
  const winner = winKey === 'home' ? hm : away;
  // the game's MVP: the best day on the winning side
  const score = (L) => (L.H || 0) + (L['2B'] || 0) + 2 * (L['3B'] || 0) + 3 * (L.HR || 0) + (L.RBI || 0) + (L.pOuts || 0) / 3 - 2 * (L.pR || 0) + 0.5 * (L.pK || 0);
  const ids = new Set([...winner.lineup, ...winner.bench, winner.pitcher, ...winner.bullpen].map((p) => p.id));
  const [mvpId] = [...g.stats].filter(([id]) => ids.has(id)).sort((a, b) => score(b[1]) - score(a[1]))[0] || [];
  const mvp = mvpId && W().players.get(mvpId);
  if (mvp) honour(mvp, `${yr()} All-Star Game MVP`);
  const hi = Math.max(...rec.s), lo = Math.min(...rec.s);
  headline(`${winner.city.toUpperCase()} WIN THE ALL-STAR GAME ${hi}-${lo}`, false);
  message({ cat: 'league', quiet: true, title: `All-Star Game: ${winner.city} ${hi}, ${(winner === hm ? away : hm).city} ${lo}`,
    parts: [{ p: `The ${winner.city} won the ${yr()} All-Star Game ${hi}-${lo}${g.inning > 9 ? ` in ${g.inning} innings` : ''}.${mvp ? ` ${fullName(mvp)} of ${city(mvp.orgId)} was named the game's MVP.` : ''}` }, { box: boxScore(g, rec) }] });
  ((game.awards[yr()]).allStarGame = { score: rec.s, home, mvp: mvp?.id });
}

// ---------- the season's awards ----------

/** After the World Series: every award in both leagues, in one message, and the honours on each winner. */
export function seasonAwards() {
  const A = ((game.awards ||= {})[yr()] ||= {});
  if (A.season) return;
  A.season = {};
  A.wins = Object.fromEntries([...game.season.records].map(([id, r]) => [id, r.w]));
  const parts = [{ p: `The ${yr()} awards. Values are runs above a replacement player, about ten to a win.` }];
  const me = game.orgId;
  const mineWon = [], myBig = [];
  for (const lg of leagues()) {
    const L = lgShort(lg);
    const { hit, pit } = pool(lg);
    const won = (A.season[L] = {});
    const give = (award, v, line) => { if (!v) return; won[award] = v.p.id; honour(v.p, `${yr()} ${L} ${award}`); if (v.p.orgId === me) { mineWon.push(`${fullName(v.p)}, ${L} ${award}`); myBig.push({ p: v.p, x: `${L} ${award}` }); } return [award, pref(v.p), city(v.p.orgId), line]; };
    const rows = [];
    // MVP: the most valuable, pitchers counted at a discount
    const { mvpC: cands, cyC, story } = candidates(hit, pit, A.wins, true);
    const vMVP = vote('MVP', cands, `${yr()}-${L}-MVP`);
    const mvp = vMVP[0]?.c.v;
    rows.push(give('MVP', mvp, mvp && (isPitcher(mvp.p) ? pitLine(mvp) : batLine(mvp)) + `, ${war(mvp.runs)} wins`));
    const vCy = vote('Cy Young', cyC, `${yr()}-${L}-CY`);
    const cy = vCy[0]?.c.v;
    rows.push(give('Cy Young', cy, cy && `${pitLine(cy)}, ${war(cy.runs)} wins`));
    // rookies: fewer than 130 at-bats and 50 innings in the majors before this season
    const before = (p, k, i) => (p.hist?.[k] || []).filter((r) => r[1] === 'MLB' && r[0] < yr()).reduce((a, r) => a + r[i], 0);
    const rookie = [...hit.filter((v) => before(v.p, 'bat', 5) < 130 && v.s.pa >= 200), ...pit.filter((v) => before(v.p, 'pit', 5) < 150 && v.ip >= 40)].sort((a, b) => b.runs - a.runs).slice(0, 8);
    const vRoy = vote('Rookie of the Year', rookie.map((v) => ({ v, id: v.p.id, base: v.runs, story: story(v.p.orgId) * 0.3 + (isPitcher(v.p) ? 0 : (v.s.hr + v.s.rbi / 3) * 0.05) })), `${yr()}-${L}-ROY`);
    const roy = vRoy[0]?.c.v;
    rows.push(give('Rookie of the Year', roy, roy && (isPitcher(roy.p) ? pitLine(roy) : batLine(roy))));
    // Manager of the Year: the most wins gained on last season, a division title or a postseason place worth more
    const S = game.season;
    const clubs = [...W().orgs.values()].filter((o) => o.club.league === lg).map((o) => {
      const r = S.records.get(o.id), last = game.awards[yr() - 1]?.wins?.[o.id] ?? (yr() === 2027 ? o.club.record2026?.[0] : null) ?? 81;
      const divWin = [...divisions().values()].some((ids) => ids[0] === o.id);
      const inPost = Object.values(S.post?.seeds || {}).some((s) => s.includes(o.id));
      return { o, r, x: r.w - last + (divWin ? 6 : 0) + (inPost ? 4 : 0), last };
    }).sort((a, b) => b.x - a.x);
    const vMoy = vote('Manager of the Year', clubs.slice(0, 6).map((c) => ({ c, id: c.o.id, base: c.x, story: 0 })), `${yr()}-${L}-MOY`);
    const m = vMoy[0]?.c.c;
    // the ballots, kept so the finalists can be shown
    ((A.votes ||= {})[L] = {});
    const keep = (award, res, line) => { A.votes[L][award] = { margin: margin(res), top: res.slice(0, 5).map((t) => ({ id: t.id, pts: t.pts, first: t.first, line: line(t.c) })) }; };
    keep('MVP', vMVP, (c) => (isPitcher(c.v.p) ? pitLine(c.v) : batLine(c.v)));
    keep('Cy Young', vCy, (c) => pitLine(c.v));
    keep('Rookie of the Year', vRoy, (c) => (isPitcher(c.v.p) ? pitLine(c.v) : batLine(c.v)));
    keep('Manager of the Year', vMoy, (c) => `${c.c.r.w}-${c.c.r.l}, ${c.c.r.w > c.c.last ? `up from ${c.c.last}` : `against ${c.c.last}`} wins last season`);
    if (m) {
      won['Manager of the Year'] = m.o.id;
      if (m.o.id === me) mineWon.push(`you, ${L} Manager of the Year`);
      rows.push(['Manager of the Year', managerName(m.o.id), m.o.club.city, `${m.r.w}-${m.r.l}, ${m.r.w > m.last ? `up from ${m.last}` : `against ${m.last}`} wins last season`]);
    }
    parts.push({ head: [`${L} awards`, 'Winner', 'Club', 'Season'], rows: rows.filter(Boolean) });
    for (const [award, vt] of Object.entries(A.votes[L])) {
      if (!vt.top.length) continue;
      const mgr = award === 'Manager of the Year';
      parts.push({ p: `${L} ${award}: ${vt.margin}.` });
      parts.push({ head: [`${L} ${award} vote`, 'Club', 'Points', '1st', 'Season'], rows: vt.top.slice(0, 3).map((t) => {
        const pl = mgr ? null : W().players.get(t.id);
        return [mgr ? managerName(t.id) : pref(pl), mgr ? city(t.id) : city(pl.orgId), String(t.pts), String(t.first), t.line];
      }) });
    }
    // Gold Gloves: the best defender at each position among those who played it most of the season
    const gg = [];
    for (const pos of FIELD) {
      const v = hit.filter((x) => (posGames(x.p)[pos] || 0) >= 70).map((x) => ({ x, d: defenceAt(x.p, pos) })).sort((a, b) => b.d - a.d)[0];
      if (v) { won[`Gold Glove ${pos}`] = v.x.p.id; honour(v.x.p, `${yr()} ${L} Gold Glove (${pos})`); if (v.x.p.orgId === me) mineWon.push(`${fullName(v.x.p)}, ${L} Gold Glove at ${pos}`); gg.push([pos, pref(v.x.p), city(v.x.p.orgId), `${posGames(v.x.p)[pos]} games there`]); }
    }
    if (gg.length) parts.push({ head: [`${L} Gold Gloves`, 'Winner', 'Club', ''], rows: gg });
    // Silver Sluggers: the best hitter at each position (three outfielders, a DH)
    const ss = [];
    const usedSS = new Set();
    for (const slot of ['C', '1B', '2B', '3B', 'SS', 'OF', 'OF', 'OF', 'DH']) {
      const v = hit.filter((x) => !usedSS.has(x.p.id) && x.s.pa >= 350 && (slot === 'OF' ? ['LF', 'CF', 'RF'].includes(x.pos) : x.pos === slot)).sort((a, b) => b.plus * b.s.pa - a.plus * a.s.pa)[0];
      if (v) { usedSS.add(v.p.id); won[`Silver Slugger ${slot}${slot === 'OF' ? ss.filter((r) => r[0] === 'OF').length + 1 : ''}`] = v.p.id; honour(v.p, `${yr()} ${L} Silver Slugger (${slot})`); if (v.p.orgId === me) mineWon.push(`${fullName(v.p)}, ${L} Silver Slugger`); ss.push([slot, pref(v.p), city(v.p.orgId), batLine(v)]); }
    }
    if (ss.length) parts.push({ head: [`${L} Silver Sluggers`, 'Winner', 'Club', 'Season'], rows: ss });
    headline(`${L} MVP: ${mvp ? fullName(mvp.p).toUpperCase() : '-'}. CY YOUNG: ${cy ? fullName(cy.p).toUpperCase() : '-'}`, false);
  }
  if (mineWon.length) parts.splice(1, 0, { p: `For your club: ${mineWon.join('; ')}.` });
  const talk = myBig.length ? [mediaQuote(me, 'award', { p: myBig[0].p, x: myBig[0].x })].filter(Boolean) : undefined;
  message({ cat: mineWon.length ? 'club' : 'league', important: true, quiet: true, title: `The ${yr()} awards${mineWon.length ? `: ${mineWon.length} for your club` : ''}`, parts, voices: talk });
}

/** The MVP and Cy Young fields: value first, then what the writers notice beyond it (a winning club, big counting stats). */
function candidates(hit, pit, wins, post) {
  const tw = (id) => (wins?.[id] ?? 81) - 81;
  const inPost = (id) => post && Object.values(game.season.post?.seeds || {}).some((x) => x.includes(id));
  const story = (id) => tw(id) * 0.3 + (inPost(id) ? 3 : 0);
  const hs = (v) => story(v.p.orgId) + (v.s.hr + v.s.rbi / 3) * 0.06;
  const mvpC = [...hit.slice(0, 25).map((v) => ({ v, id: v.p.id, base: v.runs, story: hs(v) })), ...pit.slice(0, 10).map((v) => ({ v, id: v.p.id, base: v.runs * 0.75, story: story(v.p.orgId) * 0.6 }))];
  const cyC = pit.filter((v) => v.ip >= 60).slice(0, 12).map((v) => ({ v, id: v.p.id, base: v.runs, story: v.s.w * 0.9 + v.s.sv * 0.3 + story(v.p.orgId) * 0.3 }));
  return { mvpC, cyC, story };
}

/** Where the MVP and Cy Young races stand now: how often each name wins if the vote were held today. */
export function awardOdds(runs = 80) {
  if (!game.season) return [];
  const wins = Object.fromEntries([...game.season.records].map(([id, r]) => [id, r.w]));
  const out = [];
  for (const lg of leagues()) {
    const L = lgShort(lg);
    const { hit, pit } = pool(lg);
    const { mvpC, cyC } = candidates(hit, pit, wins, false);
    for (const [award, field] of [['MVP', mvpC], ['Cy Young', cyC]]) {
      if (field.length < 2) continue;
      const won = new Map();
      for (let i = 0; i < runs; i++) { const id = vote(award, field, `odds-${yr()}-${L}-${award}-${i}-${game.date?.getTime?.() ?? 0}`)[0]?.id; if (id) won.set(id, (won.get(id) || 0) + 1); }
      const top = [...won.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([id, n]) => ({ p: field.find((c) => c.id === id).v.p, chance: n / runs, line: isPitcher(field.find((c) => c.id === id).v.p) ? pitLine(field.find((c) => c.id === id).v) : batLine(field.find((c) => c.id === id).v) }));
      out.push({ L, award, top });
    }
  }
  return out;
}

/** His defence at a position, from his attributes there (1 to 20 averaged). */
function defenceAt(p, pos) {
  const r = fieldingAt(p, pos);
  if (pos === 'C') return r.block + r.framing + r.cthrow + r.hands * 0.5;
  return r.range * 1.2 + r.hands + r.arm * (['SS', '3B', 'RF', 'CF'].includes(pos) ? 0.8 : 0.4) + (r.turn ?? 50) * (['SS', '2B'].includes(pos) ? 0.6 : 0) + (r.acc ?? 50) * 0.4;
}
