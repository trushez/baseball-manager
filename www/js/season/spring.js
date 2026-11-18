// Spring training: the days between the camps opening and Opening Day are played one at a time. Players on the 40-man
// rosters of every club log a few plate appearances or innings a day, the computer clubs go on managing and trading,
// and once a week the press reports who is hitting, who is pitching well, who is struggling and who is forcing his way
// onto the roster. The lines are drawn from each player's quality with a lot of luck, because that is what spring is.
import { game, orgState } from '../state.js';
import { Rng } from '../core/rng.js';
import { fullName, isPitcher, mainPos } from '../data/world.js';
import { value } from './value.js';
import { message } from './inbox.js';
import { headline } from './headlines.js';
import { dayNo } from './calendar.js';
import { talent } from './odds.js';

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const city = (id) => game.world.orgs.get(id)?.club.city ?? id;

export function startSpring() {
  game.spring = { year: game.year, stats: {}, week: 0, begin: dayNo(game.date) };
}

const lineOf = (pid) => ((game.spring.stats[pid] ||= { pa: 0, h: 0, hr: 0, bb: 0, k: 0, tb: 0, outs: 0, er: 0, so: 0, bp: 0 }));

/** One day of camp: everyone on a 40-man roster may play a little. */
export function springDay(d) {
  if (!game.spring || game.spring.year !== game.year) startSpring();
  const rng = new Rng(`spring-${game.year}-${d}-${game.manager}`);
  for (const o of game.world.orgs.values()) {
    const st = orgState(o.id);
    for (const id of st.forty) {
      const p = game.world.players.get(id);
      if (!p || p.retired || p.injury) continue;
      const v = value(p);
      const L = lineOf(id);
      if (isPitcher(p)) {
        if (!rng.chance(p.role === 'Starter' ? 0.22 : 0.3)) continue;
        const outs = p.role === 'Starter' ? rng.int(3, 9) : rng.int(2, 5);
        const perOutEr = clamp((4.6 - (v - 50) * 0.1) / 27, 0.03, 0.4);
        const perOutBb = clamp(0.085 - (v - 50) * 0.0015, 0.02, 0.2);
        const perOutK = clamp(0.28 + (v - 50) * 0.006, 0.1, 0.5);
        L.outs += outs;
        for (let i = 0; i < outs; i++) { if (rng.chance(perOutEr)) L.er++; if (rng.chance(perOutBb)) L.bp++; if (rng.chance(perOutK)) L.so++; }
      } else {
        if (!rng.chance(0.6)) continue;
        const pa = rng.int(2, 4);
        const pBB = clamp(0.085 + (v - 50) * 0.002, 0.03, 0.2), pK = clamp(0.22 - (v - 50) * 0.004, 0.08, 0.4);
        const pH = clamp(0.245 + (v - 50) * 0.007, 0.12, 0.4), pHR = clamp(0.1 + (v - 50) * 0.006, 0.02, 0.3);
        for (let i = 0; i < pa; i++) {
          L.pa++;
          const r = rng.next();
          if (r < pBB) L.bb++;
          else if (r < pBB + pK * (1 - pBB)) L.k++;
          else if (rng.chance(pH)) { L.h++; if (rng.chance(pHR)) { L.hr++; L.tb += 4; } else L.tb += rng.chance(0.25) ? 2 : 1; }
        }
      }
    }
  }
  springGames(d, rng);
}

/** Camp games are simulated, not played: most clubs play one a day, and the score comes from how strong the two sides are, pulled well towards a coin toss (spring results mean little). */
function springGames(d, rng) {
  const S = game.spring;
  S.rec ||= {}; S.games ||= [];
  const T = talent(), ids = game.world.mlb.map((c) => c.id);
  for (let i = ids.length - 1; i > 0; i--) { const j = rng.int(0, i); [ids[i], ids[j]] = [ids[j], ids[i]]; }
  for (let i = 0; i + 1 < ids.length; i += 2) {
    const [a, b] = [ids[i], ids[i + 1]];
    if (!rng.chance(0.85)) continue;
    const ta = T.get(a) ?? 0.5, tb = T.get(b) ?? 0.5;
    const pa = 0.5 + (((ta * (1 - tb)) / (ta * (1 - tb) + tb * (1 - ta))) - 0.5) * 0.4;
    let ra = Math.max(0, Math.round(rng.normal(4.3 + (pa - 0.5) * 4, 2.4))), rb = Math.max(0, Math.round(rng.normal(4.3 - (pa - 0.5) * 4, 2.4)));
    if (ra === rb && !rng.chance(0.1)) { if (rng.chance(pa)) ra++; else rb++; } // most ties are played on
    for (const [x, y, rx, ry] of [[a, b, ra, rb], [b, a, rb, ra]]) {
      const R = (S.rec[x] ||= { w: 0, l: 0, t: 0 });
      if (rx > ry) R.w++; else if (rx < ry) R.l++; else R.t++;
      if (x === game.orgId) S.games.push({ d, opp: y, us: rx, them: ry, home: x === a });
    }
  }
}

const ab = (L) => Math.max(0, L.pa - L.bb);
const avg = (L) => (ab(L) ? L.h / ab(L) : 0);
const obp = (L) => (L.pa ? (L.h + L.bb) / L.pa : 0);
const slg = (L) => (ab(L) ? L.tb / ab(L) : 0);
const ops = (L) => obp(L) + slg(L);
const era = (L) => (L.outs ? (L.er * 27) / L.outs : 99);
const ip = (L) => `${Math.floor(L.outs / 3)}${L.outs % 3 ? `.${L.outs % 3}` : ''}`;
const r3 = (x) => x.toFixed(3).replace(/^0/, '');
const hitLine = (L) => `${r3(avg(L))} / ${r3(ops(L))} OPS, ${L.hr} HR in ${L.pa} PA`;
const pitLine = (L) => `${ip(L)} IP, ${era(L).toFixed(2)} ERA, ${L.so} K, ${L.bp} BB`;

function everyone() {
  const out = [];
  for (const [id, L] of Object.entries(game.spring?.stats || {})) {
    const p = game.world.players.get(id);
    if (p && !p.retired) out.push({ p, L });
  }
  return out;
}
const MIN_PA = 14, MIN_OUTS = 12;
const hitters = (xs) => xs.filter((x) => !isPitcher(x.p) && x.L.pa >= MIN_PA);
const pitchers = (xs) => xs.filter((x) => isPitcher(x.p) && x.L.outs >= MIN_OUTS);

/** The weekly report: yours in your inbox, the league's under League. `final` is the last one, as camp breaks. */
export function springReport(final = false) {
  const S = game.spring;
  if (!S) return;
  if (!final && dayNo(game.date) - (S.begin ?? 0) < 6) return; // too early for a report to say anything
  S.week++;
  const all = everyone();
  const mine = all.filter((x) => x.p.orgId === game.orgId);
  const st = orgState();
  const name = (p) => ({ pid: p.id, t: fullName(p) });
  const row = (x) => [name(x.p), mainPos(x.p), x.p.age, isPitcher(x.p) ? pitLine(x.L) : hitLine(x.L)];
  const top = (xs, f, n, desc = true) => xs.slice().sort((a, b) => (desc ? f(b) - f(a) : f(a) - f(b))).slice(0, n);
  const bestH = top(hitters(mine), (x) => ops(x.L), 3), bestP = top(pitchers(mine), (x) => era(x.L), 3, false);
  const wantsRoster = (x) => !st.active.has(x.p.id);
  const pushing = [...top(hitters(mine).filter(wantsRoster).filter((x) => ops(x.L) >= 0.85), (x) => ops(x.L), 2), ...top(pitchers(mine).filter(wantsRoster).filter((x) => era(x.L) <= 2.5), (x) => -era(x.L), 2)];
  const cold = [...top(hitters(mine).filter((x) => st.active.has(x.p.id) && ops(x.L) <= 0.55), (x) => -ops(x.L), 2), ...top(pitchers(mine).filter((x) => st.active.has(x.p.id) && era(x.L) >= 8), (x) => era(x.L), 2)];
  const parts = [{ p: final ? 'Camp is breaking. Here is how your players finished the spring.' : `Week ${S.week} of camp. Spring numbers come from a handful of games against uneven opposition, so treat them with caution.` }];
  const rec = S.rec?.[game.orgId];
  if (rec) {
    const last = (S.games || []).slice(-5).map((g) => `${g.us > g.them ? 'W' : g.us < g.them ? 'L' : 'T'} ${g.us}-${g.them} ${g.home ? 'v' : 'at'} ${city(g.opp)}`);
    parts.push({ p: `${city(game.orgId)} ${final ? 'finished' : 'are'} ${rec.w}-${rec.l}${rec.t ? `-${rec.t}` : ''} in the spring${last.length ? `. Latest: ${last.join(', ')}.` : '.'}` });
  }
  if (bestH.length) parts.push({ p: 'Hitters:' }, { head: ['Player', 'Pos', 'Age', 'Spring'], rows: bestH.map(row) });
  if (bestP.length) parts.push({ p: 'Pitchers:' }, { head: ['Player', 'Pos', 'Age', 'Spring'], rows: bestP.map(row) });
  if (pushing.length) parts.push({ p: final ? 'Pushing for a place on the roster:' : 'Making a case for the roster:' }, { head: ['Player', 'Pos', 'Age', 'Spring'], rows: pushing.map(row) });
  if (cold.length) parts.push({ p: 'Struggling:' }, { head: ['Player', 'Pos', 'Age', 'Spring'], rows: cold.map(row) });
  if (!bestH.length && !bestP.length) parts.push({ p: 'Not enough has been played yet to say much.' });
  const lead = pushing[0] ?? bestH[0] ?? bestP[0];
  message({ cat: 'club', quiet: true, title: final ? 'Spring Training: the final report' : `Spring Training report: week ${S.week}`, parts, player: lead?.p.id });

  // around the camps
  const lh = top(hitters(all), (x) => ops(x.L), 4), lp = top(pitchers(all), (x) => era(x.L), 3, false);
  if (lh.length || lp.length) {
    const leagueRow = (x) => [name(x.p), city(x.p.orgId), mainPos(x.p), isPitcher(x.p) ? pitLine(x.L) : hitLine(x.L)];
    const lparts = [{ p: final ? 'The best of the spring around the league:' : `Around the camps, week ${S.week}:` }];
    if (lh.length) lparts.push({ head: ['Player', 'Club', 'Pos', 'Spring'], rows: lh.map(leagueRow) });
    if (lp.length) lparts.push({ head: ['Player', 'Club', 'Pos', 'Spring'], rows: lp.map(leagueRow) });
    message({ cat: 'league', quiet: true, title: final ? 'Spring Training: the best of the spring' : `Around the camps: week ${S.week}`, parts: lparts, player: lh[0]?.p.id });
    const star = lh[0];
    if (star && S.star !== star.p.id) headline(`SPRING STAR: ${star.p.last.toUpperCase()} (${city(star.p.orgId).toUpperCase()}) HITTING ${r3(avg(star.L)).toUpperCase()} IN CAMP`, star.p.orgId === game.orgId);
    if (star) S.star = star.p.id;
  }
}
