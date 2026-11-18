// Hidden attributes, as in CM 01/02: never shown on a player's screen, only seen in how he plays.
// Professionalism, ambition and adaptability decide how well he develops and how home life affects him.
// Consistency: how far his level moves from one day to the next. Big games: whether he rises or shrinks
// when it matters (the postseason and a September race). Both on the 20-80 scale, fixed for each player.
// Injury proneness lives in injuries.js; mood (from playing time and the like) in moods.js.
import { game } from '../state.js';
import { Rng } from '../core/rng.js';

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

export function hidden(p) {
  // the traits are ratings now (p.r, shown on the player screen); older players without them get the same values made here
  const q = p.r || {};
  if (q.prof != null) return { consistency: q.cons, bigGames: q.big, professionalism: q.prof, ambition: q.amb, adapt: q.adapt };
  if (!p._hid) {
    const r = new Rng(`hidden-${p.id}`);
    // young players run hotter and colder; veterans are steadier
    const age = p.age ?? 27;
    const ageNudge = age < 24 ? -4 : age > 30 ? 3 : 0;
    p._hid = {
      consistency: clamp(Math.round(r.normal(50 + ageNudge, 10)), 20, 80),
      bigGames: clamp(Math.round(r.normal(50, 10)), 20, 80),
      // how seriously he looks after himself, how much he wants to get to the top, how easily he settles
      // (drawn after the two above, so those keep the values they always had)
      professionalism: clamp(Math.round(r.normal(50 + (age > 30 ? 3 : 0), 11)), 20, 80),
      ambition: clamp(Math.round(r.normal(52 - (age > 31 ? 4 : 0), 11)), 20, 80),
      adapt: clamp(Math.round(r.normal(50, 11)), 20, 80),
    };
  }
  return p._hid;
}

/** Today's form in grade points: centred on zero (plus mood), wider for inconsistent players. */
export function formShift(p, day, mood = 0) {
  const sd = Math.max(0.6, 3.6 - (hidden(p).consistency - 50) / 10);
  return new Rng(`form-${p.id}-${day}-${game.luck}`).normal(mood, sd);
}

/** The lift (or the drop) in a big game, in grade points. */
export const bigShift = (p) => ((hidden(p).bigGames - 50) / 10) * 1.5;

const BAT = ['contact', 'power', 'eye', 'avoidK'];
const PIT = ['stuff', 'movement', 'control'];

/** Ratings for one game: form, a big-game shift when it applies, and mood. */
export function dayRatings(p, r, { day, big = false, mood = 0 } = {}) {
  if (day == null || p.filler) return r;
  const shift = formShift(p, day, mood) + (big ? bigShift(p) : 0);
  if (!shift) return r;
  const out = { ...r };
  for (const k of p.kind === 'pit' ? PIT : BAT) if (out[k] != null) out[k] = Math.max(20, Math.min(80, out[k] + shift));
  return out;
}
