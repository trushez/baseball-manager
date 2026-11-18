// The amateur draft. It runs by itself in July, at the All-Star break: the game makes the class, every club
// picks from what its own scouts believe, and the picks are signed. You set a strategy (what kind of player,
// how much to pay over slot) and read the report; you do not make the picks or haggle over each offer.
//
// 20 rounds of 30 picks. The order is last season's record, worst first, with a lottery among the worst 18 for
// the first six picks. Players are made from the moulds the game keeps for new arrivals: high schoolers are
// 17 or 18, less ready now and with a higher ceiling; collegians are 20 to 22 and nearer the finished article.
// Signed picks join Single-A. Each club then lets its weakest Single-A players go so the pyramid stays its size.
import { draftSequence } from './qualifying.js';
import { lastRecord } from './history.js';
import { logMove } from './roster.js';
import { Rng } from '../core/rng.js';
import { game, orgState, autoClub } from '../state.js';
import { isPitcher, mainPos, fullName, money } from '../data/world.js';
import { value } from './value.js';
import { clubScouting } from './scouting.js';
import { gmOf } from './gms.js';
import { newPlayer, retire } from './intake.js';
import { message, later, onLater } from './inbox.js';

export const ROUNDS = 20;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

export const APPROACH = [
  ['best', 'Best player available', 'Take the player the scouts rate highest, whatever he is.'],
  ['ceiling', 'Ceiling first', 'Lean to raw talent with the highest ceiling, mostly high schoolers. More stars and more busts.'],
  ['safe', 'Polish first', 'Lean to players close to ready, mostly college. Fewer busts, fewer stars.'],
  ['need', 'Fill the thin spots', 'Lean to the positions where your farm is short.'],
];
export const MIX = [['balanced', 'Balanced'], ['pitchers', 'Pitchers'], ['hitters', 'Hitters']];
export const SCHOOL = [['either', 'High school or college'], ['college', 'Prefer college'], ['hs', 'Prefer high school']];
export const SPEND = [
  ['frugal', 'Stay at slot', 'Pay no more than the slot value. Most college players sign; many high schoolers go to college instead.'],
  ['standard', 'A little over slot', 'Pay up to 20% over slot where it is needed.'],
  ['big', 'Pay what it takes', 'Pay up to 50% over slot to land the high schoolers. The most expensive way to draft.'],
];
const CAP = { frugal: 1.0, standard: 1.2, big: 1.5 };

export const DEFAULT_PLAN = { approach: 'best', mix: 'balanced', school: 'either', spend: 'standard' };
export const plan = () => ({ ...DEFAULT_PLAN, ...(game.draftPlan || {}) });
export const setPlan = (patch) => { game.draftPlan = { ...plan(), ...patch }; return game.draftPlan; };

/** What the pick at this overall number is worth in signing money. */
const SLOTS = [[1, 9.5e6], [10, 4.8e6], [30, 2.6e6], [60, 1.35e6], [100, 0.8e6], [150, 0.45e6], [200, 0.28e6], [300, 0.18e6], [600, 0.125e6]];
export function slotValue(n) {
  for (let i = 1; i < SLOTS.length; i++) {
    if (n <= SLOTS[i][0]) {
      const [a, x] = SLOTS[i - 1], [b, y] = SLOTS[i];
      return Math.round(Math.exp(Math.log(x) + (Math.log(y) - Math.log(x)) * ((Math.log(n) - Math.log(a)) / (Math.log(b) - Math.log(a)))) / 5000) * 5000;
    }
  }
  return 125000;
}

/** The order of picks within a round: last season's record, worst first, a lottery among the worst 18 for the first six. */
export function draftOrder(rng) {
  const clubs = game.world.mlb.map((c) => ({ id: c.org, pct: lastRecord(c) ? lastRecord(c)[0] / Math.max(1, lastRecord(c)[0] + lastRecord(c)[1]) : 0.5, r: rng.next() }));
  clubs.sort((a, b) => a.pct - b.pct || a.r - b.r);
  const lot = clubs.slice(0, 18), rest = clubs.slice(18);
  const W = [14, 14, 14, 12.5, 10.5, 9, 7.5, 6, 4.5, 3, 2, 1.5, 1, 0.5, 0.5, 0.25, 0.25, 0.25];
  const first = [];
  const pool = lot.map((c, i) => ({ c, w: W[i] }));
  for (let k = 0; k < 6 && pool.length; k++) {
    const tot = pool.reduce((a, x) => a + x.w, 0);
    let t = rng.next() * tot, i = 0;
    while (i < pool.length - 1 && (t -= pool[i].w) > 0) i++;
    first.push(pool.splice(i, 1)[0].c);
  }
  return [...first, ...pool.map((x) => x.c), ...rest].map((c) => c.id);
}

// ---------- the class ----------

/** Make the players of one class. They are not yet in the game: the picks put them there. */
function makeClass(year, rng, n) {
  const pool = game.intakePool || [];
  const out = [];
  if (!pool.length) return out;
  for (let i = 0; i < n; i++) {
    const kind = rng.chance(0.47) ? 'pit' : 'bat';
    const tpls = pool.filter((t) => t.kind === kind);
    const tpl = rng.pick(tpls.length ? tpls : pool);
    const hs = rng.chance(0.38);
    const age = hs ? rng.int(17, 18) : rng.int(20, 22);
    // a high schooler is further from the finished article, and a more talented one is further ahead of his age
    const d = hs ? 9 : 5;
    const t2 = { ...tpl, age, r: { ...tpl.r }, grades: JSON.parse(JSON.stringify(tpl.grades)) };
    for (const [k, v] of Object.entries(t2.r)) if (typeof v === 'number' && k !== '_e') t2.r[k] = clamp(v - d, 20, 80);
    for (const g of Object.values(t2.grades)) if (Array.isArray(g) && typeof g[0] === 'number') g[0] = clamp(g[0] - d, 20, 80);
    const p = newPlayer(t2, { id: 'DRAFT' }, year, rng, { id: `d${year}-${i + 1}` });
    p.team = null; p.club = null; p.orgId = null;
    p.draftYear = year; p.hs = hs;
    out.push(p);
  }
  return out;
}

/** How much a drafted player will ask for, as a multiple of the slot value. */
function demandOf(p, round, rng) {
  if (round <= 10) return p.hs ? clamp(rng.normal(1.15, 0.25), 0.8, 1.9) : clamp(rng.normal(0.95, 0.07), 0.75, 1.15);
  if (p.hs) return rng.chance(0.45) ? 2.5 : 1;
  return rng.chance(0.08) ? 2.5 : 1;
}

// ---------- the picks ----------

const peakOf = (p) => (p.pa - 100) / 5 + 50;
const baseScore = (p) => 0.7 * peakOf(p) + 0.3 * value(p);

/** How well a club's scouts judge amateurs, 5 to 18. For you, it is your scouts. */
function quality(orgId) {
  if (orgId !== game.orgId) return clubScouting(orgId);
  const sc = game.staff?.[orgId]?.scouts || [];
  if (!sc.length) return 5;
  return clamp(sc.reduce((a, s) => a + s.ja, 0) / sc.length + (sc.length - 1) * 0.7, 5, 18);
}

function needBonus(o, p) {
  const bucket = (x) => (isPitcher(x) ? (mainPos(x) === 'SP' ? 'SP' : 'RP') : ['LF', 'CF', 'RF'].includes(mainPos(x)) ? 'OF' : mainPos(x) === 'C' ? 'C' : 'IF');
  const counts = { SP: 0, RP: 0, C: 0, IF: 0, OF: 0 };
  for (const x of o.players) if (x.level !== 'MLB' && !x.retired) counts[bucket(x)]++;
  const want = { SP: 1, RP: 1, C: 0.4, IF: 1.6, OF: 1.1 };
  const tot = Object.values(counts).reduce((a, b) => a + b, 0) || 1, wt = Object.values(want).reduce((a, b) => a + b, 0);
  const b = bucket(p);
  return clamp(((want[b] / wt) - counts[b] / tot) * 40, -3, 5);
}

/** A club's view of a prospect: the truth, a scouting error that stays the same for the year, and the club's own tastes. */
function view(orgId, p, ctx) {
  const key = `${orgId}|${p.id}`;
  let s = ctx.cache.get(key);
  if (s == null) {
    const sd = 9 - 0.38 * quality(orgId);
    s = baseScore(p) + new Rng(`dv-${orgId}-${p.id}-${game.manager}`).normal(0, sd);
    ctx.cache.set(key, s);
  }
  if (orgId === game.orgId) {
    const pl = plan();
    const cur = value(p), peak = peakOf(p);
    if (pl.approach === 'ceiling') s += 0.35 * (peak - cur) + (p.hs ? 1.5 : 0);
    else if (pl.approach === 'safe') s += -0.3 * (peak - cur) + (p.hs ? -2 : 1);
    else if (pl.approach === 'need') s += needBonus(game.world.orgs.get(orgId), p);
    if (pl.mix === 'pitchers') s += isPitcher(p) ? 4 : 0; else if (pl.mix === 'hitters') s += isPitcher(p) ? 0 : 4;
    if (pl.school === 'college') s += p.hs ? 0 : 5; else if (pl.school === 'hs') s += p.hs ? 5 : 0;
  } else {
    const g = gmOf(orgId);
    if (p.hs) s += (g.love - 1) * 4 + (g.gamble - 0.5) * 3 - g.ageBias * 3; else s += (g.numbers - 0.5) * 2 + g.ageBias * 3;
  }
  return s;
}

/** Run the draft for a season. Returns the record of it. */
export function runDraft(year = game.season?.year ?? game.year) {
  game.drafts ||= {};
  if (game.drafts[year]) return game.drafts[year];
  const rng = new Rng(`draft-${year}-${game.manager}`);
  const order = draftOrder(rng);
  const seq = draftSequence(order, ROUNDS, year);
  const total = seq.length;
  const klass = makeClass(year, rng, total);
  const ctx = { cache: new Map() };
  const left = new Set(klass);
  const mine = plan();
  const picks = [];
  const W = game.world;
  const stats = new Map(order.map((id) => [id, { spent: 0, signed: 0, lost: 0 }]));
  for (let n = 1; n <= total; n++) {
    const { org, round, comp } = seq[n - 1];
    if (!stats.has(org)) stats.set(org, { spent: 0, signed: 0, lost: 0 });
    let best = null, bs = -1e9;
    for (const p of left) { const s = view(org, p, ctx); if (s > bs) { bs = s; best = p; } }
    if (!best) break;
    left.delete(best);
    const slot = slotValue(n);
    const dm = demandOf(best, round, rng);
    const cap = org === game.orgId ? CAP[mine.spend] : 1.2 + 0.25 * gmOf(org).gamble;
    const signs = dm <= cap && dm < 2;
    const bonus = signs ? Math.round(Math.max(125000, slot * dm) / 5000) * 5000 : 0;
    const st = stats.get(org);
    if (signs) {
      st.spent += bonus; st.signed++;
      const o = W.orgs.get(org);
      logMove(best, 'drafted', null, org, { note: `${comp ? 'compensation pick after round 1' : `round ${round}`}, pick ${n}`, bonus });
      best.orgId = org; best.team = `${org}-A`; best.club = W.clubs.get(best.team); best.level = 'A';
      best.contract = { status: 'minor league', text: 'Minor league contract', serviceTime: 0, options: 3, aav: 0, years: [], draft: { round, pick: n, year }, bonus, signed: year };
      W.players.set(best.id, best); W.list.push(best); o.players.push(best);
      orgState(org).level.set(best.id, 'A');
    } else st.lost++;
    picks.push({ n, round, org, pid: best.id, name: fullName(best), pos: mainPos(best), hs: best.hs, bonus, slot, signed: signs, v0: Math.round(value(best)), peak: Math.round(peakOf(best)), age: best.age });
  }
  trimFarms(year, picks);
  const rec = { year, comp: seq.filter((x) => x.comp).length, picks: picks.map((x) => [x.n, x.org, x.pid, x.bonus, x.name, x.pos, x.hs ? 1 : 0, x.slot, x.signed ? 1 : 0, x.v0, x.peak, x.age]), plan: mine };
  game.drafts[year] = rec;
  for (const y of Object.keys(game.drafts)) if (+y < year - 9) delete game.drafts[y];
  report(year, picks, stats);
  proposeReleases(year);
  return rec;
}

/** Each club lets its weakest Single-A players go so the pyramid keeps its size. The new draftees are safe this year. */
function trimFarms(year, picks) {
  const released = new Map();
  game.draftPropose = [];
  for (const o of game.world.orgs.values()) {
    const target = game.targets?.[o.id]?.A;
    if (!target) continue;
    for (const kind of ['pit', 'bat']) {
      const have = o.players.filter((p) => p.level === 'A' && !p.retired && (isPitcher(p) ? 'pit' : 'bat') === kind && !orgState(o.id).forty.has(p.id));
      const over = have.length - target[kind];
      if (over <= 0) continue;
      const keep = (p) => value(p) + (24 - (p.age ?? 22)) * 0.8 + (p.draftYear === year ? 100 : 0);
      for (const p of have.sort((a, b) => keep(a) - keep(b)).slice(0, over)) {
        // your own farm is yours to cut: the assistant only proposes who should go (see proposeReleases)
        if (o.id === game.orgId && !autoClub()) { (game.draftPropose ||= []).push({ id: p.id, kind, of: have.length, target: target[kind] }); continue; }
        (released.get(o.id) || released.set(o.id, []).get(o.id)).push(p);
        retire(p);
      }
    }
  }
  game.draftReleased = released.get(game.orgId)?.map((p) => fullName(p)) || [];
}

/** The class as it will be drafted: the same seed as the draft, so the names match on the day. */
export function board(year) {
  const rng = new Rng(`draft-${year}-${game.manager}`);
  const order = draftOrder(rng);
  const klass = makeClass(year, rng, draftSequence(order, ROUNDS, year).length);
  return { order, klass };
}

/** What a pick should turn into, by position in the draft (an estimate of the peak value of a typical player). */
const expectedPeak = (n) => 64 - 7.2 * Math.log10(n);
const gradeWord = (d) => (d >= 3 ? 'A' : d >= 2 ? 'A-' : d >= 1 ? 'B+' : d >= 0 ? 'B' : d >= -1 ? 'B-' : d >= -2 ? 'C+' : d >= -3 ? 'C' : 'D');

/** Each club's draft score: the average of how far its picks' ceilings beat the usual for their spot, a pick that did not sign counting against. */
function gradeClubs(picks) {
  const t = new Map();
  for (const x of picks) {
    const a = t.get(x.org) || t.set(x.org, { sum: 0, n: 0 }).get(x.org);
    a.sum += x.signed ? x.peak - expectedPeak(x.n) : -4; a.n++;
  }
  const rows = [...t.entries()].map(([org, a]) => ({ org, d: a.sum / a.n })).sort((a, b) => b.d - a.d);
  return rows.map((r, i) => ({ ...r, rank: i + 1, grade: gradeWord(r.d) }));
}

function report(year, picks, stats) {
  const W = game.world, me = game.orgId;
  const mine = picks.filter((x) => x.org === me);
  const st = stats.get(me);
  const club = (id) => W.clubs.get(id)?.city ?? id;
  const first = picks[0];
  const parts = [{ p: `The ${year} draft is done: 20 rounds, ${picks.length} picks. ${club(first.org)} took ${first.name} (${first.pos}${first.hs ? ', from high school' : ', from college'}) first overall, with a bonus of ${money(first.bonus)}.` }];
  const strat = plan();
  parts.push({ p: `Your approach: ${APPROACH.find((a) => a[0] === strat.approach)[1].toLowerCase()}, ${MIX.find((a) => a[0] === strat.mix)[1].toLowerCase()}, ${SCHOOL.find((a) => a[0] === strat.school)[1].toLowerCase()}, ${SPEND.find((a) => a[0] === strat.spend)[1].toLowerCase()}. You made ${mine.length} picks and signed ${st.signed}, spending ${money(st.spent)} in bonuses${st.lost ? `; ${st.lost} would not sign for what you were willing to pay` : ''}.` });
  const rel = game.draftReleased || [];
  if (rel.length) parts.push({ p: `To make room in Single-A, ${rel.length === 1 ? 'one player was' : `${rel.length} players were`} released: ${rel.slice(0, 8).join(', ')}${rel.length > 8 ? ' and others' : ''}.` });
  const gr = gradeClubs(picks), mg = gr.find((g) => g.org === me);
  if (mg) {
    const best = mine.filter((x) => x.signed).sort((a, b) => (b.peak - expectedPeak(b.n)) - (a.peak - expectedPeak(a.n)))[0];
    parts.push({ p: `Draft report: your scouts grade the class ${mg.grade}, ${mg.rank}${[, 'st', 'nd', 'rd'][mg.rank % 10 > 3 || [11, 12, 13].includes(mg.rank) ? 0 : mg.rank % 10] || 'th'} of ${gr.length}. ${best ? `The pick they like most is ${best.name} at number ${best.n}, a ${best.pos} they put on a path to ${best.peak >= 62 ? 'a star' : best.peak >= 56 ? 'a regular' : best.peak >= 50 ? 'a useful player' : 'a depth player'}.` : ''} This is a first read: the Draft tab follows each player from here.` });
  }
  const cell = (x) => (x.signed ? { pid: x.pid, t: x.name } : `${x.name} (unsigned)`);
  parts.push({ head: ['Pick', 'Round', 'Your picks', 'Pos', 'From', 'Bonus'], rows: mine.map((x) => [String(x.n), String(x.round), cell(x), x.pos, x.hs ? 'High school' : 'College', x.signed ? money(x.bonus) : '-']) });
  parts.push({ head: ['Pick', 'Club', 'First round', 'Pos', 'From', 'Bonus'], rows: picks.slice(0, 30).map((x) => [String(x.n), club(x.org), cell(x), x.pos, x.hs ? 'High school' : 'College', x.signed ? money(x.bonus) : '-']) });
  later(1, { kind: 'draft-react', year });
  message({ cat: 'club', important: true, stop: game.settings?.stops?.important, title: `The ${year} draft: you made ${mine.length} picks, led by ${mine[0] ? mine[0].name : 'none'}`, parts, body: `The ${year} draft is over.` });
}

// ---------- the calendar ----------

/** Called each morning from the first of July: a warning on the 6th, the draft from the 13th. */
export function draftDay(date) {
  const year = game.season?.year;
  if (!year || game.drafts?.[year]) return;
  const d = date.getDate();
  if (d >= 13) { runDraft(year); return; }
  const flags = (game.draftWarned ||= {});
  if (d >= 6 && !flags[year]) {
    flags[year] = true;
    const pl = plan();
    const { order, klass } = board(year);
    const spot = order.indexOf(game.orgId) + 1;
    const ctx = { cache: new Map() };
    const top = klass.map((p) => ({ p, s: view(game.orgId, p, ctx) })).sort((a, b) => b.s - a.s).slice(0, 8);
    const lvl = (p) => (peakOf(p) >= 62 ? 'Star' : peakOf(p) >= 56 ? 'Regular' : 'Depth');
    message({ cat: 'club', title: `Draft preview: you pick ${spot}${[, 'st', 'nd', 'rd'][spot % 10 > 3 || [11, 12, 13].includes(spot) ? 0 : spot % 10] || 'th'}`,
      parts: [{ p: `The ${year} draft runs by itself at the All-Star break on the 13th: 20 rounds, ${order.length * ROUNDS} picks. You hold ${draftSequence(order, ROUNDS, year).filter((x) => x.org === game.orgId).length} of them and pick ${spot} in each round you still own a pick in, and your first pick is worth ${money(slotValue(spot))} in signing money. Your approach is ${APPROACH.find((a) => a[0] === pl.approach)[1].toLowerCase()}, ${SPEND.find((a) => a[0] === pl.spend)[1].toLowerCase()}. You can change it under Transfers, Draft until the night before.` },
        { p: `This is your scouts' board. Other clubs have their own, so the best player on yours may be gone, and your scouts' ability decides how well they have read the class.` },
        { head: ['Rank', 'Player', 'Pos', 'Age', 'From'], rows: top.map((x, i) => [String(i + 1), fullName(x.p), mainPos(x.p), String(x.p.age), x.p.hs ? 'High school' : 'College']) }] });
  }
  if (d === 12 && !flags[`${year}e`]) {
    flags[`${year}e`] = true;
    message({ cat: 'club', important: true, stop: game.settings?.stops?.important, title: 'The draft is tomorrow', body: `Your scouts have finished their work on the ${year} class. The picks are made tomorrow at the All-Star break. This is the last day to change your approach under Transfers, Draft.` });
  }
}

onLater('draft-react', (m) => {
  const D = game.drafts?.[m.year];
  if (!D) return;
  const city = (id) => game.world.clubs.get(id)?.city ?? id;
  const row = (r) => ({ n: r[0], org: r[1], name: r[4], pos: r[5], hs: r[6], signed: r[8], peak: r[10], d: (r[10] ?? 0) - expectedPeak(r[0]) });
  const all = D.picks.filter((r) => r[10] != null).map(row);
  if (!all.length) return;
  const steals = all.filter((x) => x.n > 30 && x.signed).sort((a, b) => b.d - a.d).slice(0, 3);
  const reaches = all.filter((x) => x.n <= 30).sort((a, b) => a.d - b.d).slice(0, 2);
  const gr = gradeClubs(all.map((x) => ({ org: x.org, n: x.n, peak: x.peak, signed: x.signed })));
  const lines = [{ p: `The talk after the ${m.year} draft is about who got the most out of it. The best-graded classes belong to ${gr.slice(0, 3).map((g) => `${city(g.org)} (${g.grade})`).join(', ')}; the weakest to ${gr.slice(-2).map((g) => `${city(g.org)} (${g.grade})`).join(' and ')}.` }];
  if (steals.length) lines.push({ p: `Picks later in the draft that scouts expect to pay off: ${steals.map((x) => `${x.name} (${x.pos}) to ${city(x.org)} at number ${x.n}`).join('; ')}.` });
  if (reaches.length) lines.push({ p: `First-round picks with the most doubt around them: ${reaches.map((x) => `${x.name} (${x.pos}) to ${city(x.org)} at number ${x.n}`).join('; ')}.` });
  message({ cat: 'league', quiet: true, title: `After the draft: who won it`, parts: lines });
});

/**
 * Single-A is over its size after the draft. For your club nobody is let go without you: the assistant sends
 * the list of who would go and why, and the message carries the buttons to release them or keep them.
 */
function proposeReleases(year) {
  const list = (game.draftPropose || []).map((x) => ({ ...x, p: game.world.players.get(x.id) })).filter((x) => x.p && !x.p.retired);
  game.draftPropose = [];
  if (!list.length) return;
  const rows = list.map((x) => {
    const p = x.p, v = Math.round(value(p));
    const why = `Rated ${v}, age ${p.age}: among the lowest of the ${x.of} ${x.kind === 'pit' ? 'pitchers' : 'hitters'} in Single-A, which has room for ${x.target}${p.age >= 23 ? ', and at his age he has little time to grow' : ''}.`;
    return [{ pid: p.id, t: fullName(p) }, mainPos(p), String(p.age), String(v), why];
  });
  message({ cat: 'club', important: true, stop: game.settings?.stops?.important, release: list.map((x) => x.id), title: `Single-A is over its size: ${list.length} ${list.length === 1 ? 'player' : 'players'} to go?`,
    parts: [{ p: `The ${year} draft class has filled Single-A beyond its ${list.length === 1 ? 'size by one player' : `size by ${list.length} players`}. Nobody has been released. These are the players the assistant would let go, the weakest by rating and age (this year's draftees are safe). Open any of them to see his record, release them all below, or leave them where they are and decide later.` },
      { head: ['Player', 'Pos', 'Age', 'Rating', 'Why him'], rows }] });
}

/** Your scouts' board for the coming draft: the n players they like best, with where each comes from. Empty once the draft is held. */
export function scoutBoard(n = 8, year = game.year) {
  if (game.drafts?.[year]) return [];
  const { klass } = board(year);
  const ctx = { cache: new Map() };
  return klass.map((p) => ({ p, s: view(game.orgId, p, ctx) })).sort((a, b) => b.s - a.s).slice(0, n).map((x) => x.p);
}
