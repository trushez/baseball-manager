// A sprinkling of people news: a coach telling you a player is not working (you can talk to him or fine him),
// the chairman pleased by a winning run or concerned by a slump, and the fans taking to a player who is hot.
// Rare on purpose: a few of these a season, never more than two a week, each tied to something that happened.
import { game, orgState } from '../state.js';
import { Rng } from '../core/rng.js';
import { fullName, isPitcher } from '../data/world.js';
import { message } from './inbox.js';
import { hidden } from './hidden.js';
import { value } from './value.js';
import { dayNo } from './calendar.js';
import { owner } from './finance.js';
import { confidence, confidenceWords } from './reactions.js';
import { recentForm, voices } from './media.js';
import { salaryFor } from './trade.js';

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const state = () => (game.flavour ||= { last: {}, week: 0 });
const day = () => dayNo(game.date);
const since = (k) => day() - (state().last[k] ?? -999);
const stamp = (k) => { state().last[k] = day(); };
const coachOf = (p) => {
  const c = game.staff?.[game.orgId]?.coaches;
  const role = isPitcher(p) ? 'pit' : 'hit';
  return { name: c?.[role]?.name, role: isPitcher(p) ? 'pitching coach' : 'hitting coach', fit: c?.fit?.name };
};

// ---------- a player who is not working ----------

const TRAIN = [
  (p, c) => `${c.name ? `${c.name}, your ${c.role},` : `Your ${c.role}`} has been in touch about ${fullName(p)}. He has turned up late for the extra work three times this month and cut the sessions short when he did come. "He has the talent, but he is not putting in the hours," the coach says.`,
  (p, c) => `${c.fit ? `${c.fit}, your fitness coach,` : 'Your fitness coach'} says ${fullName(p)} is not looking after himself. He is behind on his conditioning and has been seen cutting corners in the weight room. The coaches think it is already costing him.`,
  (p, c) => `The coaches are worried about ${fullName(p)}'s attitude in training. ${c.name ? `${c.name} says` : 'The word is'} he does the minimum, argues with instruction and is not listening. "Somebody needs to have a word," the report ends.`,
];

/** Weekly: at most one player the coaches say is slacking, and not often. */
function trainingWatch(rng) {
  if (since('train') < 28) return null;
  const st = orgState(game.orgId);
  const pool = game.world.orgs.get(game.orgId).players.filter((p) => ['MLB', 'AAA'].includes(st.level.get(p.id)) && !p.injury && (!p.disc || day() - p.disc.day > 150) && hidden(p).professionalism <= 40);
  if (!pool.length || !rng.chance(0.2)) return null;
  const p = pool.sort((a, b) => hidden(a).professionalism - hidden(b).professionalism)[rng.int(0, Math.min(2, pool.length - 1))];
  p.disc = { day: day(), state: null };
  stamp('train');
  const c = coachOf(p);
  return message({ cat: 'club', player: p.id, disc: p.id, title: `${fullName(p)}: the coaches say he is not working`, body: `${rng.pick(TRAIN)(p, c)}\nYou can have a word with him, or fine him a week's wages.` });
}

/** You talk to him. How it goes depends on his temper. Returns what happened, in words. */
export function talkTo(p) {
  if (p.disc?.state) return p.disc.text;
  const t = p.r?.temper ?? 50;
  const ok = new Rng(`talk-${p.id}-${day()}-${game.manager}`).chance(clamp(0.65 - (t - 50) / 120, 0.25, 0.85));
  p.disc = { ...(p.disc || {}), state: 'talked' };
  if (ok) {
    if (p.r) p.r.prof = clamp((p.r.prof ?? 50) + 2, 20, 80);
    p.mood = clamp((p.mood ?? 60) + 3, 0, 100);
    p.disc.text = `You had a word with ${fullName(p)}. He listened, admitted he had let things slip and says he will put the work in. The coaches will tell you if he does not.`;
  } else {
    p.mood = clamp((p.mood ?? 60) - 2, 0, 100);
    p.disc.text = `You had a word with ${fullName(p)}. He nodded along, but you are not sure it sank in.`;
  }
  return p.disc.text;
}

/** You fine him a week's wages. It stings, and it can work, but he will not like it. */
export function fine(p) {
  if (p.disc?.state) return p.disc.text;
  const wage = salaryFor(p, game.year) || 750000;
  const amt = Math.max(5000, Math.round(wage / 26 / 5000) * 5000);
  const o = game.world.orgs.get(game.orgId), y = game.year;
  (o.club.otherMoney ||= []).push({ name: 'Fines', note: fullName(p), years: { [y]: -amt } });
  const t = p.r?.temper ?? 50;
  p.mood = clamp((p.mood ?? 60) - (t >= 60 ? 12 : 8), 0, 100);
  const works = new Rng(`fine-${p.id}-${day()}-${game.manager}`).chance(0.7);
  if (works && p.r) p.r.prof = clamp((p.r.prof ?? 50) + 1, 20, 80);
  p.disc = { ...(p.disc || {}), state: 'fined', text: `You fined ${fullName(p)} ${amt >= 1e6 ? `$${(amt / 1e6).toFixed(2)}M` : `$${Math.round(amt / 1000)}k`}, a week's wages. ${t >= 60 ? 'He took it badly and has not hidden it from the other players.' : works ? 'He took the message and the coaches expect an effort from him.' : 'He paid up without saying much.'}` };
  return p.disc.text;
}

// ---------- the chairman ----------

function move(delta) {
  const o = owner(game.orgId);
  o.conf = clamp(Math.round((o.conf ?? 60) + delta), 0, 100);
}

const WINNING = [
  (n) => `${n} wins in a row, and the chairman has rung to say so. "That is what I wanted to see," he says. "Keep it going."`,
  (n) => `The chairman sent a note after the ${n}th straight win: "The town is talking about this team again. Well done to everyone."`,
  (n) => `${n} straight wins. The chairman has been seen in the clubhouse shaking hands, and says he could not be happier with how the club is playing.`,
];
const SLUMP = [
  (w, l) => `${w}-${l} in the last ten games has the chairman worried. He has asked to be kept informed and says he expects things to turn soon.`,
  (w, l) => `The chairman has called about the ${w}-${l} run in the last ten. He is not threatening anything, but he wants to know what you are going to change.`,
  (w, l) => `A ${w}-${l} stretch over ten games has gone down badly upstairs. The chairman says he is disappointed and is looking for a reaction.`,
];

function chairman(rng) {
  const r = game.season?.records.get(game.orgId);
  if (!r) return null;
  const run = r.last?.match(/W+$/)?.[0]?.length || 0;
  const k = run >= 8 ? 'win8' : null;
  if (k && since(k) > 40) {
    stamp(k); move(3);
    return message({ cat: 'club', title: `The chairman on the ${run} straight wins`, body: `${rng.pick(WINNING)(run)} His confidence in you: ${confidenceWords()[0].toLowerCase()}.` });
  }
  const l10 = r.last || '';
  if (l10.length === 10) {
    const w = (l10.match(/W/g) || []).length, l = 10 - w;
    if (w <= 2 && since('slump') > 35) {
      stamp('slump'); move(-3);
      return message({ cat: 'club', title: 'The chairman is concerned', body: `${rng.pick(SLUMP)(w, l)} His confidence in you: ${confidenceWords()[0].toLowerCase()}.` });
    }
  }
  return null;
}

// ---------- the fans and a player on a run ----------

function fansTake(rng) {
  if (since('fans') < 30) return null;
  const st = orgState(game.orgId);
  const mlb = game.world.orgs.get(game.orgId).players.filter((p) => st.active.has(p.id) && !p.injury);
  const hot = mlb.map((p) => ({ p, f: recentForm(p) })).filter((x) => x.f?.hot && !((game.mediaSaid ||= {})[`fan-${x.p.id}`] > day() - 45 + 0)).sort((a, b) => value(b.p) - value(a.p));
  if (!hot.length || !rng.chance(0.45)) return null;
  const { p, f } = hot[rng.int(0, Math.min(1, hot.length - 1))];
  game.mediaSaid[`fan-${p.id}`] = day();
  stamp('fans');
  const young = (p.age ?? 30) <= 24;
  const lead = isPitcher(p)
    ? `The crowd has taken to ${fullName(p)}: ${f.text}. ${young ? 'At his age the fans are already talking about him as the future of the rotation.' : 'They stand when he takes the mound.'}`
    : `The fans have a new favourite in ${fullName(p)}: ${f.text}. ${young ? 'The younger supporters are queueing for his shirt, and the club shop says it is selling out.' : 'He gets the biggest cheer in the lineup when the names are read out.'}`;
  p.mood = clamp((p.mood ?? 60) + 3, 0, 100);
  return message({ cat: 'club', player: p.id, title: `The fans are behind ${fullName(p)}`, body: lead, voices: voices(game.orgId, isPitcher(p) ? 'hotP' : 'hot', { p, form: f.text }, 0.6) });
}

// ---------- the calls ----------

/** Called every Monday of the regular season. */
export function weeklyFlavour() {
  if (game.phase !== 'regular' || !game.season) return;
  const rng = new Rng(`flavour-${day()}-${game.manager}`);
  let n = 0;
  for (const f of [chairman, trainingWatch, fansTake]) {
    if (n >= 2) break;
    if (f(rng)) n++;
  }
}

/** Called each evening: a winning run is news the day it reaches eight. */
export function dailyFlavour() {
  if (game.phase !== 'regular' || !game.season) return;
  const r = game.season.records.get(game.orgId);
  const run = r?.last?.match(/W+$/)?.[0]?.length || 0;
  if (run === 8) chairman(new Rng(`flavour-d-${day()}-${game.manager}`));
}
