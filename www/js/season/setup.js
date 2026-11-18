// Applies data/setup.json when a new game starts: real-world facts the roster data can't hold, such as
// a pitcher who had Tommy John surgery last summer and won't be back until July.
import { dayNo } from './calendar.js';

/** @returns {string[]} what was applied, for the log */
export function applySetup(world, setup) {
  const done = [];
  const byMlb = new Map(world.list.map((p) => [p.mlb_id, p]));
  for (const ev of setup?.events || []) {
    const p = byMlb.get(ev.mlbId) || world.list.find((x) => `${x.first} ${x.last}` === ev.name);
    if (!p) continue;
    if (ev.type === 'injury') {
      const from = dayNo(new Date(ev.from)), until = dayNo(new Date(ev.until));
      p.injury = { type: ev.injury, since: from, days: Math.max(1, until - from), setup: true };
      done.push(`${ev.name}: ${ev.injury}, back about ${ev.until}`);
    }
  }
  return done;
}
