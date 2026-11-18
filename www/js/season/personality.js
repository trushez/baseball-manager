// Character and home life (Phase 6, development depth).
//
// Three hidden traits (in hidden.js) shape how a player develops: professionalism (does he look after
// himself and do the work), ambition (does he want to get to the top) and adaptability (how easily he
// settles, and how far trouble off the field gets to him). On top of that a player's life moves in
// spells: a baby, a family settled in, a move far from home, a deal about to run out. Each spell lasts
// weeks or months and nudges how fast he develops and how happy he is. The events are deliberately
// ordinary: these are real people, and the game does not invent anything worse than a bad week.
//
// A spell is p.life = { k, until, m, mood } where m multiplies his growth and mood is a weekly nudge.
import { Rng } from '../core/rng.js';
import { game, isUserOrg } from '../state.js';
import { hidden } from './hidden.js';
import { dayNo } from './calendar.js';
import { value } from './value.js';
import { message } from './inbox.js';
import { fullName, serviceYears, fromAbroad } from '../data/world.js';
import { staffFor } from './ability.js';

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// kind: [growth multiplier, weekly mood, min and max days, what the papers and your coaches would say]
export const LIFE = {
  settled: { m: 1.05, mood: 1, days: [150, 300], good: true, words: 'settled, with his family around him', tell: '{n} has settled in well, and his family has joined him. The coaches expect it to show in his work.' },
  baby: { m: 0.97, mood: 1, days: [45, 90], good: true, words: 'a new baby at home', tell: '{n} and his partner have had a baby. He is delighted and not getting much sleep.' },
  homesick: { m: 0.93, mood: -1, days: [60, 150], words: 'homesick', tell: '{n} is finding it hard so far from home. The coaches are keeping an eye on him.' },
  family: { m: 0.9, mood: -1, days: [20, 50], words: 'preoccupied with matters at home', tell: '{n} is preoccupied with things at home. Nobody is saying more than that, and the coaches expect him to be himself again soon.' },
  mentor: { m: 1.07, mood: 1, days: [120, 240], good: true, words: 'learning from an older player', tell: '{n} has been taken under the wing of an experienced player in the clubhouse, and it is helping.' },
  contract: { m: 0.96, mood: -1, days: [60, 200], words: 'thinking about his contract', tell: '{n} has a deal that is about to run out, and it is on his mind.' },
};

const today = () => dayNo(game.date);
export const lifeOf = (p) => (p.life && p.life.until > today() ? p.life : null);
/** Growth multiplier from home life: 1 when nothing is going on. */
export const lifeMult = (p) => lifeOf(p)?.m ?? 1;
/** Weekly mood nudge from home life. */
export const lifeMood = (p) => lifeOf(p)?.mood ?? 0;

const $m = (v) => `$${(v / 1e6).toFixed(1)}M`;
/** The last season his club controls him: the end of his contract, or six years of service if that comes later. Null when the deal ends his time with the club. */
function controlUntil(p) {
  const c = p.contract || {};
  if (c.status === 'free agent' || (fromAbroad(p) && c.status === 'signed')) return null;
  const ys = (c.years || []).filter((y) => y.season >= game.year);
  const last = ys.length ? Math.max(...ys.map((y) => y.season)) : game.year;
  const st = serviceYears(p);
  // a season on the contract is a year of service, so six years are reached after this many more seasons
  const sixth = game.year + Math.max(1, Math.ceil(6 - st)) - 1;
  return sixth > last ? sixth : null;
}

/** Where his contract stands, in a sentence or two, for the message about it. */
export function contractNote(p) {
  const c = p.contract || {}, ys = (c.years || []).filter((y) => y.season >= game.year);
  const last = ys.length ? Math.max(...ys.map((y) => y.season)) : game.year;
  const now = ys.find((y) => y.season === game.year)?.salary;
  const pay = now ? `, paid ${$m(now)} this season` : '';
  const until = controlUntil(p);
  const city = game.world.orgs.get(p.orgId)?.club.city ?? 'the club';
  // in the winter, a one-year deal that covered the season just played has run out: nothing is signed for the year ahead
  if (!ys.length) {
    const was = Math.max(0, ...(c.years || []).map((y) => y.season)) || game.year - 1;
    if (until) return `His contract covered ${was} and has run out, but ${city} keep his rights through ${until} and he cannot reach free agency before that, so he is not about to walk. His ${game.year} salary is settled in arbitration this winter and rises as he goes. A longer deal now would fix his price and cover seasons that would otherwise be arbitration years.`;
    return `His contract covered ${was} and has run out. Unless a new deal is agreed he can walk as a free agent, and the longer you leave it the more his agent will ask for.`;
  }
  if (until) return `His current deal runs through ${last}${pay}, but ${city} keep his rights through ${until} and he cannot reach free agency before that, so he is not about to walk. His pay is settled in arbitration each winter and rises as he goes. A longer deal now would fix his price and cover the seasons that would otherwise be arbitration years.`;
  return `He is signed through ${last}${pay}. When the deal ends he can walk as a free agent unless you extend him first, and the longer you leave it the more his agent will ask for.`;
}

const yearsLeft = (p) => (p.contract?.years || []).filter((y) => y.season >= game.year).length;

/** Chance this month of each spell starting, for this player. */
function odds(p) {
  const age = p.age ?? 27, hid = hidden(p);
  const f = 1 + (50 - hid.adapt) / 60; // 1.5 for the hardest to settle, 0.5 for the easiest
  const out = {};
  if (age >= 24 && (yearsLeft(p) >= 2 || (p.contract?.serviceTime || 0) >= 3)) out.settled = 0.014;
  if (age >= 24 && age <= 37) out.baby = 0.007;
  if (p.country && p.country !== 'USA' && age <= 26 && p.orgId) out.homesick = 0.045 * f;
  out.family = 0.006 * f;
  if (age <= 24 && ['AA', 'AAA', 'MLB'].includes(p.level)) out.mentor = 0.02;
  if (p.level === 'MLB' && yearsLeft(p) <= 1 && value(p) >= 48 && !['minor league', 'pre-arbitration'].includes(p.contract?.status)) out.contract = 0.2 * f;
  return out;
}

/** Spells for everyone, once a month. Returns how many started. */
export function lifeTick(rng = new Rng(`life-${game.year}-${today()}-${game.manager}`)) {
  const d = today();
  let n = 0, told = 0;
  for (const p of game.world.list) {
    if (p.retired || !p.orgId) continue;
    if (p.life && p.life.until <= d) delete p.life;
    if (p.life) continue;
    const o = odds(p);
    for (const [k, pr] of Object.entries(o)) {
      if (!rng.chance(pr)) continue;
      const L = LIFE[k];
      const f = 1 + (50 - hidden(p).adapt) / 60;
      // the same spell hits an unsettled player harder, and a settled one less
      const m = L.good ? L.m : 1 - (1 - L.m) * clamp(f, 0.5, 1.5);
      p.life = { k, until: d + rng.int(L.days[0], L.days[1]), m: Math.round(m * 1000) / 1000, mood: L.mood };
      n++;
      if (isUserOrg(p.orgId) && p.level === 'MLB' && told < 3 && (!L.good || k === 'settled')) {
        told++;
        message({ cat: 'club', player: p.id, title: `${fullName(p)}: ${L.words}`, body: `${(k === 'contract' && controlUntil(p) ? (yearsLeft(p) === 0 ? '{n}\'s contract has run out and his future is on his mind.' : '{n} is in the last year of his current deal and his future is on his mind.') : L.tell).replace('{n}', fullName(p))}${k === 'contract' ? `\n${contractNote(p)}` : ''}`, contractTalk: k === 'contract' ? p.id : undefined });
      }
      break;
    }
  }
  return n;
}

// ---------- what your coaches make of him ----------

const WORDS = {
  professionalism: [[68, 'A model professional'], [57, 'Looks after himself'], [45, 'Does what is asked'], [35, 'Needs reminding'], [0, 'Casual about the work']],
  ambition: [[68, 'Hungry to get to the top'], [57, 'Wants to improve'], [45, 'Content'], [0, 'Happy where he is']],
  adapt: [[62, 'Settles anywhere'], [42, 'Takes time to settle'], [0, 'Finds change hard']],
};
const wordFor = (k, v) => WORDS[k].find(([lo]) => v >= lo)[1];

/**
 * What your own coaches say about a player's character. Their reading is a little off, by less the
 * better the coach. Nothing for players who are not yours.
 */
export function coachView(p) {
  if (!isUserOrg(p.orgId)) return null;
  // his character is on the player screen as plain figures; what is left here is the news from home
  const out = [];
  const L = lifeOf(p);
  if (L) out.push(`Right now: ${LIFE[L.k].words}`);
  return out;
}
