// The stories behind the signings: when a club signs a free agent the league press says what it means for the club,
// not only that he signed. A second reliever in a winter is a bullpen rebuild, a bat for a thin lineup is a boost, and so on.
// The stories go to the League tab of the news. The Continue screen's headlines are written elsewhere.
import { game } from '../state.js';
import { Rng } from '../core/rng.js';
import { fullName, isPitcher, mainPos, lastSeason } from '../data/world.js';
import { value } from './value.js';
import { message } from './inbox.js';
import { gmOf } from './gms.js';
import { lastRecord } from './history.js';
import { teamTotals, rankOf } from './teamstats.js';
import { absDay } from './calendar.js';

const $M = (v) => `$${(v / 1e6).toFixed(v % 1e6 ? 2 : 0).replace(/(\.\d)0$/, '$1')}M`;
const yearsWord = (n) => `${n} ${n === 1 ? 'year' : 'years'}`;
const BAT_ROLE = { C: 'catcher', '1B': 'first baseman', '2B': 'second baseman', '3B': 'third baseman', SS: 'shortstop', LF: 'outfielder', CF: 'centre fielder', RF: 'outfielder', OF: 'outfielder', DH: 'designated hitter' };

/** What he is to the club: a starter, a reliever or a kind of hitter. */
function roleOf(p) {
  if (isPitcher(p)) return mainPos(p) === 'SP' ? 'starter' : 'reliever';
  return 'bat';
}

/** One line on how he did last year. */
function formLine(p) {
  const s = lastSeason(p);
  if (!s) return '';
  if (isPitcher(p)) {
    if (!s.ip) return '';
    const sv = s.sv >= 10 ? `, saving ${s.sv} games` : '';
    return `He pitched ${Math.round(s.ip)} innings in ${s.season} with a ${s.era?.toFixed(2) ?? '-'} ERA and ${s.so} strikeouts${sv}.`;
  }
  if (!s.pa) return '';
  return `He hit ${s.avg?.toFixed(3).replace(/^0/, '') ?? '-'} with ${s.hr} ${s.hr === 1 ? 'home run' : 'home runs'} in ${s.pa} plate appearances in ${s.season}.`;
}


const ordN = (n) => `${n}${[, 'st', 'nd', 'rd'][n % 100 > 10 && n % 100 < 14 ? 0 : n % 10] || 'th'}`;

/** Starters' and relievers' ERA for each club in a year, from the season lines (a start or five makes a starter). */
function staffEra(year) {
  const m = new Map();
  for (const q of game.world.list) {
    for (const r of q.hist?.pit || []) {
      if (r[0] !== year || r[1] !== 'MLB') continue;
      const gs = r[4], outs = r[5], er = r[8];
      const t = m.get(r[2]) || { st: [0, 0], rp: [0, 0] };
      const k = gs >= 5 ? t.st : t.rp;
      k[0] += outs; k[1] += er; m.set(r[2], t);
    }
  }
  const era = (a) => (a[0] ? (a[1] * 27) / a[0] : null);
  return new Map([...m].map(([id, t]) => [id, { st: era(t.st), rp: era(t.rp) }]));
}

/**
 * For a deal of $30M a year or more: why the club did it and what it changes, in the voice of a radio news read.
 * It uses last year's club record, its starters' ERA or its offence, ranked against the rest of the league.
 */
function bigMoney(p, c, { salary, years }, role) {
  const y = game.year - 1, out = [];
  const total = salary * years;
  const lg = game.world.mlb.filter((x) => x.league === c.league).map((x) => x.id);
  const rec = lastRecord(c);
  if (rec) {
    const wins = rec[0], hist = game.history?.[y]?.clubs;
    const rk = hist ? rankOf(c.id, lg, (id) => hist[id]?.w ?? null) : null;
    out.push(`That is ${$M(total)} committed to a club that went ${rec[0]}-${rec[1]} last season${rk ? `, ${ordN(rk)} in the ${c.league} by wins` : ''}.`);
  }
  const ids = game.world.mlb.map((x) => x.id);
  const mine = c.id;
  if (role === 'starter' || role === 'reliever') {
    const E = staffEra(y), my = E.get(mine);
    const key = role === 'starter' ? 'st' : 'rp', noun = role === 'starter' ? 'starters' : 'relievers';
    if (my?.[key] != null) {
      const rk = rankOf(mine, ids, (id) => E.get(id)?.[key] ?? null, true);
      out.push(`Their ${noun} had a ${my[key].toFixed(2)} ERA in ${y}${rk ? `, ${ordN(rk)} of ${ids.length}` : ''}.`);
      const s = lastSeason(p);
      if (s?.era != null && s.ip) {
        const d = my[key] - s.era;
        out.push(d > 0.4 ? `His ${s.era.toFixed(2)} was well under that, so on paper the rotation gets better the day he arrives.` : d < -0.4 ? `His ${s.era.toFixed(2)} was no better than what they already had, which makes the price harder to explain.` : `His ${s.era.toFixed(2)} is close to what they already got, so this is about holding the line more than lifting it.`);
      }
    }
  } else {
    const T = teamTotals(y), my = T.get(mine)?.bat;
    if (my?.ops != null) {
      const rk = rankOf(mine, ids, (id) => T.get(id)?.bat?.ops ?? null);
      out.push(`The lineup put up a ${my.ops.toFixed(3).replace(/^0/, '')} OPS in ${y}, ${rk ? `${ordN(rk)} of ${ids.length}` : 'and hit'} ${my.hr} home runs.`.replace(', and hit', ' and hit'));
      const s = lastSeason(p);
      if (s?.ops != null && s.pa) out.push(s.ops - my.ops > 0.05 ? `His ${s.ops.toFixed(3).replace(/^0/, '')} OPS would lift it straight away.` : `His ${s.ops.toFixed(3).replace(/^0/, '')} OPS is about what the lineup already managed, so the gain is smaller than the cheque suggests.`);
    }
  }
  if (years >= 5 && p.age + years >= 37) out.push(`The deal runs until he is ${p.age + years}, and the back end is where these contracts tend to hurt.`);
  else if (years >= 5) out.push(`It is a long commitment and the club is betting he holds his level through it.`);
  return out.join(' ');
}

/**
 * Write the story of a signing. `terms` is the contract as { salary, years }. Every signing you make gets one; for the
 * rest of the league only the notable ones do, and a club's second signing in the same role in one winter always does.
 */
export function signingStory(p, orgId, { salary, years }, mine = false) {
  const c = game.world.orgs.get(orgId)?.club;
  if (!c) return;
  const log = ((game.signLog ||= {})[orgId] ||= []);
  const winter = game.year;
  const role = roleOf(p);
  const before = log.filter((x) => x.winter === winter && x.role === role);
  log.push({ pid: p.id, role, winter, day: game.date.getTime() });
  if (log.length > 30) log.splice(0, log.length - 30);
  const n = before.length + 1;
  const v = value(p);
  const notable = v >= 54 || (n >= 2 && v >= 40);
  if (!mine && !notable) return;
  // the press only has room for so many a day
  const day = absDay(game.date);
  const q = (game.storyCount ||= { day, n: 0 });
  if (q.day !== day) { q.day = day; q.n = 0; }
  if (!mine && q.n >= 4) return;
  q.n++;

  const rng = new Rng(`story-${p.id}-${orgId}-${winter}`);
  const city = c.city, name = fullName(p), gm = gmOf(orgId).name;
  const pos = mainPos(p);
  const prev = before.map((x) => game.world.players.get(x.pid)).filter(Boolean).map((q) => q.last);
  const pay = `${$M(salary)} a year for ${yearsWord(years)}`;
  const ordW = (k) => ['zeroth', 'first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth'][k] || `${k}th`;
  let title, lead, angle;
  if (role === 'reliever') {
    if (n >= 3) { title = `${city} overhaul the bullpen again: ${p.last} is the ${ordW(n)} arm in`; angle = `That is the ${ordW(n)} reliever the club has added this winter, after ${prev.join(' and ')}.`; }
    else if (n === 2) { title = rng.pick([`${city} boost the bullpen with ${p.last}`, `${city} bolster their pen: ${p.last} joins ${prev[0]}`]); angle = `He joins ${prev[0]}, the other reliever signed this winter, in what looks like a rebuilt bullpen.`; }
    else { title = rng.pick([`${city} add ${p.last} to the bullpen`, `${p.last} gives ${city} another arm for the late innings`]); angle = 'It is the first move on a bullpen the club wants to strengthen.'; }
    lead = `${city} have signed the reliever ${name} (${p.age}).`;
  } else if (role === 'starter') {
    title = n >= 2 ? `${city} stack the rotation: ${p.last} is starter number ${n}` : rng.pick([`${city} land ${p.last} for the rotation`, `${p.last} to give ${city} depth in the rotation`]);
    lead = `${city} have signed the starting pitcher ${name} (${p.age}).`;
    angle = n >= 3 ? `He is the ${ordW(n)} starter the club has signed this winter, after ${prev.join(' and ')}.` : n === 2 ? `He follows ${prev[0]}, and the club has clearly decided to spend on starters.` : 'The club wanted another arm for the front of the rotation.';
  } else {
    const kind = BAT_ROLE[pos] || 'hitter';
    title = n >= 2 ? `${city} add another bat in ${p.last}` : rng.pick([`${city} sign ${kind} ${p.last}`, `${p.last} gives ${city} a lift on offence`]);
    lead = `${city} have signed the ${kind} ${name} (${p.age}).`;
    angle = n >= 3 ? `He is the third hitter the club has brought in this winter, after ${prev.join(' and ')}.` : n === 2 ? `He is the second hitter the club has brought in this winter, after ${prev[0]}.` : 'The club is looking for more production in the lineup.';
  }
  const gmLine = mine ? '' : rng.pick([
    `GM ${gm}: "He fits what we are trying to do."`,
    `GM ${gm}: "We liked him a lot. The price was right."`,
    `GM ${gm}: "We had a gap and he fills it."`,
    `GM ${gm} would only say the club "has more work to do".`,
  ]);
  let ctx = '';
  if (salary >= 30e6) { try { ctx = bigMoney(p, c, { salary, years }, role); } catch (e) { ctx = ''; } }
  const body = [`${lead} The deal is worth ${pay}.`, angle, formLine(p), ctx, gmLine].filter(Boolean).join(' ');
  message({ cat: 'league', quiet: true, player: p.id, title, body });
}
