// Award voting. A panel of writers each fills in a ballot; a writer weighs the player's value, how the team did and
// the headline numbers a little differently from the next, so close races can go either way and the runners-up are real.
import { Rng } from '../core/rng.js';

export const BALLOTS = {
  MVP: { places: [14, 9, 8, 7, 6, 5, 4, 3, 2, 1], voters: 30 },
  'Cy Young': { places: [7, 4, 3, 2, 1], voters: 30 },
  'Rookie of the Year': { places: [5, 3, 1], voters: 30 },
  'Manager of the Year': { places: [5, 3, 1], voters: 30 },
};

/**
 * Run a vote. Each candidate is { id, base, story } where base is the value in runs and story is what the writers
 * notice beyond it (a winning team, big counting stats). Returns the field ranked by points, with first-place votes.
 */
export function vote(award, cands, seed) {
  const { places, voters } = BALLOTS[award];
  const rng = new Rng(`vote-${seed}`);
  const tally = new Map(cands.map((c) => [c.id, { id: c.id, pts: 0, first: 0, c }]));
  // what the whole press box is talking about that year lifts or hurts a name for every writer alike
  const buzz = new Map(cands.map((c) => [c.id, rng.normal(0, 3)]));
  for (let v = 0; v < voters; v++) {
    const w = Math.min(2, Math.max(0.1, rng.normal(1, 0.5))); // how much this writer cares about the story
    const sd = 1.5 + 3 * rng.next();
    const ranked = cands.map((c) => ({ c, x: c.base + buzz.get(c.id) + w * c.story + rng.normal(0, sd) })).sort((a, b) => b.x - a.x).slice(0, places.length);
    ranked.forEach((r, i) => { const t = tally.get(r.c.id); t.pts += places[i]; if (i === 0) t.first++; });
  }
  return [...tally.values()].filter((t) => t.pts > 0).sort((a, b) => b.pts - a.pts || b.first - a.first || b.c.base - a.c.base);
}

/** The few worth naming: everyone who got a first-place vote or the top places on the ballot. */
export const finalists = (res, n = 3) => res.slice(0, n);

/** A sentence on how close it was. */
export function margin(res, voters = 30) {
  if (!res.length) return '';
  const a = res[0], b = res[1];
  if (a.first === voters) return 'a unanimous choice';
  if (!b) return 'without a rival';
  const gap = a.pts - b.pts;
  if (a.first >= voters * 0.8) return 'a runaway';
  if (gap <= Math.max(2, a.pts * 0.04)) return 'the closest of races';
  if (gap <= a.pts * 0.15) return 'a tight vote';
  return 'a clear winner';
}
