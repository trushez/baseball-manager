// Form and the assistant manager. Two kinds of mail, both worked out from the game logs and season lines the game already keeps:
//   - a message of its own when one of your players is on a good or a bad run (a hitter, a starter, a reliever), or when a
//     minor leaguer is playing so well he is worth a look;
//   - a report every second week from your assistant manager: where the club stands, where it is weak, who is hot.
// The wording is chosen from several versions for each case and the one used last time is not used again, and what is said
// follows what is true, so two reports rarely read alike.
import { fullName, isPitcher, seasonLine, mainPos } from '../data/world.js';
import { game, orgState } from '../state.js';
import { Rng } from '../core/rng.js';
import { message } from './inbox.js';
import { dayNo } from './calendar.js';
import { recentForm } from './media.js';
import { tboPlus, tbaMinus } from './tb.js';
import { divisions, seeds, wildCard, gb } from './standings.js';
import { reportOn } from './scouting.js';
import { value } from './value.js';

const W = () => game.world;
const on = () => game.settings.news?.form !== false;
const yr = () => game.season?.year ?? game.year;
const F = () => (game.formLog ||= { last: {}, said: {}, report: 0 });
const rate = (v) => (v == null ? '' : v.toFixed(3).replace(/^0/, ''));
const nth = (n) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] || 'th'}`;
const NUM = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];
const num = (n) => NUM[n] ?? String(n);

// ---------- people ----------

const FIRSTS = ['Dave', 'Mike', 'Tom', 'Ray', 'Jim', 'Carl', 'Luis', 'Pat', 'Hector', 'Walt', 'Gene', 'Rick', 'Tony', 'Sam', 'Ed', 'Manny', 'Doug', 'Frank'];
const LASTS = ['Hollis', 'Brandt', 'Kowal', 'Reyes', 'Dunne', 'Marsh', 'Okafor', 'Lindgren', 'Pruitt', 'Salas', 'Tierney', 'Vance', 'Whitlock', 'Yoder', 'Cardoza', 'Grimes', 'Haddad', 'Ibarra'];
/** Your assistant manager: made once and kept with the save. */
export function assistant() {
  if (!game.assistant) {
    const r = new Rng(`assistant-${game.manager}-${game.orgId}`);
    game.assistant = { name: `${r.pick(FIRSTS)} ${r.pick(LASTS)}` };
  }
  return game.assistant;
}

/** One of several versions of a line, never the one used last time for this kind of thing. */
function pick(kind, options, rng) {
  const said = F().said;
  let i = rng.int(0, options.length - 1);
  if (options.length > 1 && said[kind] === i) i = (i + 1 + rng.int(0, options.length - 2)) % options.length;
  said[kind] = i;
  return options[i];
}

// ---------- a player on a run ----------

/** Where a hitter bats in your lineup, in words, or ''. */
function slotWords(p) {
  const st = orgState();
  const i = st.lineupR?.findIndex((s) => s.id === p.id);
  return i >= 0 ? `He bats ${nth(i + 1)} in your lineup against right-handers.` : '';
}
const seasonWords = (p) => {
  const s = seasonLine(p, isPitcher(p) ? 'pit' : 'bat', yr(), 'MLB');
  if (!s) return '';
  return isPitcher(p) ? (s.outs >= 30 ? `On the season: ${s.era.toFixed(2)} ERA over ${(s.outs / 3).toFixed(0)} innings.` : '')
    : (s.pa >= 60 ? `On the season he is hitting ${rate(s.avg)}/${rate(s.obp)}/${rate(s.slg)}.` : '');
};

/** A minor leaguer's last ten games, in the same shape as recentForm. */
function minorForm(p) {
  if (isPitcher(p)) {
    const log = (p.gp || []).filter((g) => g[2] !== 'MLB' && g[3]).slice(-3);
    if (log.length < 3) return null;
    const outs = log.reduce((a, g) => a + g[4], 0), er = log.reduce((a, g) => a + g[7], 0), k = log.reduce((a, g) => a + g[9], 0);
    if (outs < 15) return null;
    const era = (er * 27) / outs;
    return { era, level: log.at(-1)[2], hot: era <= 1.2, text: `${er === 0 ? 'no earned runs' : `${er} earned run${er === 1 ? '' : 's'}`} and ${k} strikeouts in ${Math.floor(outs / 3)} innings over his last three starts` };
  }
  const log = (p.gb || []).filter((g) => g[2] !== 'MLB').slice(-10);
  if (log.length < 8) return null;
  const ab = log.reduce((a, g) => a + g[3], 0), h = log.reduce((a, g) => a + g[5], 0), hr = log.reduce((a, g) => a + g[8], 0);
  if (ab < 28) return null;
  const avg = h / ab;
  return { avg, level: log.at(-1)[2], hot: avg >= 0.4 || (hr >= 5 && avg >= 0.3), text: `${h} for his last ${ab}${hr ? ` with ${hr} home run${hr === 1 ? '' : 's'}` : ''}` };
}

/** The weakest of your regulars at hitting, for a comparison with a prospect: { p, idx } or null. */
function softSpot() {
  const st = orgState();
  const regs = (st.lineupR || []).map((s) => W().players.get(s.id)).filter(Boolean);
  const rows = regs.map((p) => { const s = seasonLine(p, 'bat', yr(), 'MLB'); return s && s.pa >= 80 ? { p, s, idx: tboPlus(s, yr()) } : null; }).filter((x) => x && x.idx != null).sort((a, b) => a.idx - b.idx);
  return rows[0] || null;
}

const HOT_BAT = [
  (p, f, x) => ({ title: `${p.last} is on a tear`, body: `${x.who}: "${fullName(p)} is swinging as well as anyone in the league at the moment, ${f.text}. ${x.season} ${x.slot} Ride him while it lasts."` }),
  (p, f, x) => ({ title: `${fullName(p)} is hot`, body: `${x.who} says ${p.last} has found something: ${f.text}. ${x.season} ${x.slot} ${x.advice}` }),
  (p, f, x) => ({ title: `${p.last}: ${f.hr >= 3 ? 'the power is back' : 'the hits keep coming'}`, body: `Over the last ten games ${fullName(p)} has ${f.text}. ${x.season} ${x.slot}` }),
];
const COLD_BAT = [
  (p, f, x) => ({ title: `${p.last} is struggling`, body: `${x.who}: "${fullName(p)} is ${f.text}. He is pressing, and it shows in his at-bats. ${x.season}" ${x.advice}` }),
  (p, f, x) => ({ title: `Cold spell for ${fullName(p)}`, body: `It has been a rough ten days for ${fullName(p)}, ${f.text}. ${x.season} ${x.slot} ${x.advice}` }),
  (p, f, x) => ({ title: `${p.last} needs a break?`, body: `${x.who} says he has noticed ${p.last} chasing pitches: ${f.text}. ${x.season} A day off, or a move down the order, might help.` }),
];
const HOT_ARM = [
  (p, f, x) => ({ title: `${p.last} is dealing`, body: `${x.who}: "${fullName(p)} has been excellent: ${f.text}. ${x.season}"` }),
  (p, f, x) => ({ title: `${fullName(p)} is in form`, body: `${f.text.replace(/^./, (c) => c.toUpperCase())}, and the word from ${x.who.replace(/^Your/, 'your')} is that the pitches are sharper than they have been all year. ${x.season}` }),
];
const COLD_ARM = [
  (p, f, x) => ({ title: `${p.last} is getting hit`, body: `${x.who}: "${fullName(p)} has been hit hard: ${f.text}. Something is off, either his command or his legs. ${x.season}" ${x.advice}` }),
  (p, f, x) => ({ title: `Trouble for ${fullName(p)}`, body: `${f.text.replace(/^./, (c) => c.toUpperCase())}. ${x.season} ${x.advice}` }),
];
const FARM_HOT = [
  (p, f, x) => ({ title: `${p.last} is tearing it up at ${f.level}`, body: `${x.who}: "Have a look at ${fullName(p)} (${p.age}) at ${f.level}. ${f.text}. ${x.scout}${x.compare}"` }),
  (p, f, x) => ({ title: `Worth a look: ${fullName(p)}`, body: `${fullName(p)} has been the best player in your system this week: ${f.text} at ${f.level}. ${x.scout}${x.compare}${x.room}` }),
];

function voiceFor(p, rng) {
  const a = assistant().name, S = game.staff?.[game.orgId]?.coaches;
  const coach = isPitcher(p) ? S?.pit : S?.hit;
  const opts = [`Your assistant, ${a}`, coach ? `${isPitcher(p) ? 'Pitching' : 'Hitting'} coach ${coach.name}` : `Your assistant, ${a}`];
  return rng.pick(opts);
}

/** Once a day, after the games: a message for each of your players whose run has become news (two a day at most). */
export function formWatch(d = dayNo(game.date)) {
  if (!on() || game.phase !== 'regular') return;
  const rng = new Rng(`form-${game.manager}-${d}`);
  const L = F(), st = orgState(), o = W().orgs.get(game.orgId);
  const found = [];
  const cool = (p, kind) => d - (L.last[`${p.id}-${kind}`] ?? -99) >= (kind === 'farm' ? 30 : 18);
  for (const p of o.players) {
    if (p.injury) continue;
    const inMajors = st.active.has(p.id);
    if (inMajors) {
      const f = recentForm(p);
      if (!f) continue;
      if (f.hot && cool(p, 'hot')) found.push({ p, kind: 'hot', f, rank: isPitcher(p) ? 3 - f.era / 4 : f.avg * 6 + (f.hr || 0) * 0.3 });
      else if (f.cold && cool(p, 'cold')) found.push({ p, kind: 'cold', f, rank: isPitcher(p) ? f.era / 4 : (0.3 - f.avg) * 6 });
    } else if (['AAA', 'AA', 'A+'].includes(st.level.get(p.id)) && !st.il.has(p.id) && !st.dfa.has(p.id)) {
      const f = minorForm(p);
      if (f?.hot && cool(p, 'farm')) found.push({ p, kind: 'farm', f, rank: (isPitcher(p) ? 3 - f.era : f.avg * 5) + (value(p) - 40) / 30 });
    }
  }
  found.sort((a, b) => b.rank - a.rank);
  // one note at a time, and a few days between them, so the form reports stay news
  if (d - (L.lastAny ?? -99) < 4) return;
  if (found.length) L.lastAny = d;
  for (const x of found.slice(0, 1)) {
    const { p, kind, f } = x;
    const who = kind === 'farm' ? `Your assistant, ${assistant().name}` : voiceFor(p, rng);
    const adv = kind === 'cold' ? (isPitcher(p) ? pick('advA', ['Do you want to skip his next turn?', 'Perhaps push him back a day and let him reset.', 'It may be worth looking at his workload.'], rng) : pick('advB', ['Perhaps rest him for a game.', 'Move him down the order for a few days?', 'He needs a day off the bench to clear his head.'], rng))
      : kind === 'hot' ? pick('advC', ['Keep him where he is.', 'I would not touch the lineup.', 'Play him every day while he is this locked in.'], rng) : '';
    const rep = reportOn(p);
    const soft = kind === 'farm' && !isPitcher(p) ? softSpot() : null;
    const forty = st.forty.has(p.id);
    const ctx = {
      who, season: seasonWords(p), slot: isPitcher(p) || kind === 'farm' ? '' : slotWords(p), advice: adv,
      scout: rep?.pot ? `Our scouts say he ${rep.pot}. ` : 'We have not had a scout look at him properly. ',
      compare: soft ? `The weakest bat in your lineup, ${fullName(soft.p)}, is hitting ${rate(soft.s.avg)} with a TBO9+ of ${soft.idx}. ` : '',
      room: forty ? '' : 'He is not on your 40-man roster, so you would have to make room. ',
    };
    const set = kind === 'farm' ? FARM_HOT : isPitcher(p) ? (kind === 'hot' ? HOT_ARM : COLD_ARM) : (kind === 'hot' ? HOT_BAT : COLD_BAT);
    const m = pick(`${kind}-${isPitcher(p) ? 'a' : 'b'}`, set, rng)(p, f, ctx);
    message({ cat: 'club', player: p.id, title: m.title, body: m.body.replace(/\s+/g, ' ').replace(/\s+"(?=[\s.]|$)/g, '"').replace(/ \./g, '.').trim() });
    L.last[`${p.id}-${kind}`] = d;
  }
}

// ---------- the assistant's report ----------

const lastTen = (r) => { const s = (r.last || '').slice(-10); return { w: (s.match(/W/g) || []).length, l: (s.match(/L/g) || []).length }; };

/** Every second Wednesday of the season: how we are doing, where we are weak, who is hot, who is worth a look. */
export function assistantReport(d = dayNo(game.date)) {
  if (!on() || game.phase !== 'regular') return;
  const S = game.season, me = game.orgId, r = S.records.get(me);
  const day = new Date(game.date).getDay();
  if (day !== 3 || !r || r.w + r.l < 24) return;
  const L = F();
  if (d - L.report < 13) return;
  L.report = d;
  const rng = new Rng(`assist-${game.manager}-${d}`);
  const st = orgState(), A = assistant().name;
  const city = W().orgs.get(me).club.city;
  const n = r.w + r.l;
  const items = []; // [weight, text]
  // where we stand
  const lg = W().orgs.get(me).club.league;
  const div = [...divisions().entries()].find(([, ids]) => ids.includes(me));
  const ids = div[1], lead = S.records.get(ids[0]);
  const place = ids.indexOf(me) + 1;
  const gbd = gb(lead, r);
  const wc = (wildCard(lg) || []).slice(0, 3);
  const inWc = wc.includes(me), sd = seeds(lg).includes(me);
  const t10 = lastTen(r);
  const stand = place === 1
    ? pick('stand1', [`We are ${r.w}-${r.l} and top of the division${ids[1] ? `, ${gb(lead, S.records.get(ids[1])) || 'level'} ${gb(lead, S.records.get(ids[1])) ? 'games clear of' : 'with'} ${W().orgs.get(ids[1]).club.city}` : ''}.`,
      `${r.w}-${r.l} after ${n} games and we lead the division. Nobody is making it easy for us, though.`], rng)
    : sd || inWc ? pick('standW', [`We are ${r.w}-${r.l}, ${nth(place)} in the division but holding a playoff place for now, ${gbd} back of the lead.`, `At ${r.w}-${r.l} we are in the wild card picture, ${gbd} games behind the ${W().orgs.get(ids[0]).club.name || W().orgs.get(ids[0]).club.city}.`], rng)
      : gbd <= 5 ? pick('standC', [`We are ${r.w}-${r.l}, ${gbd} games off the division lead. Close enough to believe in, not close enough to relax.`, `${r.w}-${r.l}: ${gbd} back. One good run puts us right in it.`], rng)
        : pick('standB', [`At ${r.w}-${r.l} we are ${gbd} games off the lead and the games are running out.`, `${r.w}-${r.l} and ${gbd} back. If we are going to move, it has to be soon.`], rng);
  items.push([10, stand]);
  items.push([t10.w + t10.l >= 8 ? 6 : 0, t10.w >= 8 ? `We have won ${num(t10.w)} of our last ten and the clubhouse feels it.` : t10.l >= 8 ? `We have lost ${num(t10.l)} of our last ten. The clubhouse is quieter than I like.` : `We have won ${num(t10.w)} of our last ten, which is steady enough.`]);
  // runs
  const all = [...S.records.values()], games = all.reduce((a, x) => a + x.w + x.l, 0) / 2 || 1;
  const lgRpg = all.reduce((a, x) => a + x.rs, 0) / (games * 2), rpg = r.rs / n, rapg = r.ra / n;
  if (rpg >= lgRpg + 0.4) items.push([5, `The offence is a strength: ${rpg.toFixed(1)} runs a game against a league average of ${lgRpg.toFixed(1)}.`]);
  else if (rpg <= lgRpg - 0.4) items.push([7, `We are not scoring: ${rpg.toFixed(1)} runs a game, and the league average is ${lgRpg.toFixed(1)}.`]);
  if (rapg <= lgRpg - 0.4) items.push([5, `Run prevention is why we are where we are. We allow ${rapg.toFixed(1)} a game.`]);
  else if (rapg >= lgRpg + 0.4) items.push([7, `We allow ${rapg.toFixed(1)} runs a game, which is more than the league average of ${lgRpg.toFixed(1)}. That is the first thing to fix.`]);
  // weak spots
  const soft = softSpot();
  if (soft && soft.idx < 85) items.push([8, pick('soft', [`${fullName(soft.p)} has been our soft spot at the plate: ${rate(soft.s.avg)}/${rate(soft.s.obp)}/${rate(soft.s.slg)}, TBO9+ ${soft.idx}.`, `If I am honest, ${soft.p.last} is the weakest bat we are running out every day (TBO9+ ${soft.idx}).`], rng)]);
  const arms = [...st.active].map((id) => W().players.get(id)).filter((p) => p && isPitcher(p));
  const idxOf = (p) => { const s = seasonLine(p, 'pit', yr(), 'MLB'); return s && s.outs >= 30 ? { p, s, idx: tbaMinus(s, p, yr()) } : null; };
  const lines = arms.map(idxOf).filter((x) => x && x.idx != null);
  const pen = lines.filter((x) => x.p.role !== 'Starter'), rot = lines.filter((x) => x.p.role === 'Starter' && x.s.gs >= 3);
  const wtd = (rows) => (rows.length ? rows.reduce((a, x) => a + x.idx * x.s.outs, 0) / rows.reduce((a, x) => a + x.s.outs, 0) : null);
  const bp = wtd(pen), rt = wtd(rot);
  if (bp != null && bp >= 108) items.push([7, pick('penBad', [`The bullpen is leaking, TBA9- ${Math.round(bp)} as a group (100 is average, lower is better).`, `Late innings are a worry. The relievers together sit at ${Math.round(bp)} on the TBA9- scale and 100 is average.`], rng)]);
  else if (bp != null && bp <= 92) items.push([4, `The bullpen has been a strength, ${Math.round(bp)} on TBA9- against an average of 100.`]);
  const worstSP = rot.sort((a, b) => b.idx - a.idx)[0];
  if (worstSP && worstSP.idx >= 118) items.push([6, `${fullName(worstSP.p)} is the problem in the rotation: ${worstSP.s.era.toFixed(2)} ERA and he is not giving us length.`]);
  else if (rt != null && rt <= 90) items.push([4, 'The rotation is the best thing about this team right now.']);
  // hot and cold
  const hot = [...st.active].map((id) => W().players.get(id)).filter(Boolean).map((p) => ({ p, f: recentForm(p) })).filter((x) => x.f?.hot);
  if (hot.length) items.push([6, `Hot right now: ${hot.slice(0, 3).map((x) => `${fullName(x.p)} (${x.f.text})`).join('; ')}.`]);
  const cold = [...st.active].map((id) => W().players.get(id)).filter(Boolean).map((p) => ({ p, f: recentForm(p) })).filter((x) => x.f?.cold);
  if (cold.length) items.push([5, `${cold.map((x) => fullName(x.p)).slice(0, 2).join(' and ')} ${cold.length > 1 ? 'are' : 'is'} struggling and may need a rest.`]);
  // the farm
  const farm = W().orgs.get(me).players.filter((p) => !st.active.has(p.id) && ['AAA', 'AA'].includes(st.level.get(p.id))).map((p) => ({ p, f: minorForm(p) })).filter((x) => x.f?.hot)[0];
  if (farm) items.push([6, `Down at ${farm.f.level}, ${fullName(farm.p)} (${farm.p.age}) is playing very well, ${farm.f.text}. Worth a look.`]);
  // injuries
  const hurt = [...st.il.keys()].length;
  if (hurt >= 4) items.push([5, `${num(hurt).replace(/^./, (c) => c.toUpperCase())} players are on the injured list. The depth is being tested.`]);
  const rest = items.slice(1).filter((x) => x[0] > 0).map((x) => [x[0] + rng.next() * 4, x[1]]).sort((a, b) => b[0] - a[0]).slice(0, 4);
  const chosen = [stand, ...rest.map((x) => x[1])];
  const titles = [`${A}: where we stand`, `${A}'s report after ${n} games`, `${city} after ${n} games: the assistant's view`, `${A}: how we are doing`];
  message({ cat: 'club', title: pick('rtitle', titles, rng), body: chosen.join('\n\n') });
}
