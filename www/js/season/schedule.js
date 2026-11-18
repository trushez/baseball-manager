// Schedules. MLB: 162 games in three-game series on the balanced format (division rivals, the rest
// of the league, every club in the other league and the natural rival), 81 at home for everyone.
// Minor leagues: six-game weekly series within each league, Tuesday to Sunday.
import { Rng } from '../core/rng.js';
import { keyDates } from './calendar.js';

/** Natural interleague rivals, AL first. */
export const RIVALS = [
  ['NYY', 'NYM'], ['BOS', 'ATL'], ['BAL', 'WSH'], ['TB', 'MIA'], ['TOR', 'PHI'], ['CWS', 'CHC'], ['CLE', 'CIN'],
  ['DET', 'PIT'], ['KC', 'STL'], ['MIN', 'MIL'], ['HOU', 'COL'], ['LAA', 'LAD'], ['ATH', 'SF'], ['SEA', 'SD'], ['TEX', 'AZ'],
];

const DAY = 86400000;
export const addDays = (date, n) => new Date(date.getFullYear(), date.getMonth(), date.getDate() + n);
export const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** Every series of the season: { home, away } club ids, three games each. */
export function mlbSeries(clubs) {
  const byDiv = new Map();
  for (const c of clubs) { if (!byDiv.has(c.division)) byDiv.set(c.division, []); byDiv.get(c.division).push(c.id); }
  const series = [];
  const add = (home, away, n = 1) => { for (let i = 0; i < n; i++) series.push({ home, away }); };
  const league = (id) => clubs.find((c) => c.id === id).league;
  // division: four series with each rival (two at home), plus one more around a ring of the five clubs
  for (const ids of byDiv.values()) {
    ids.sort();
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) { add(ids[i], ids[j], 2); add(ids[j], ids[i], 2); }
      add(ids[i], ids[(i + 1) % ids.length]);
    }
  }
  // rest of the league: two series with each club, one at home
  for (const a of clubs) {
    for (const b of clubs) {
      if (a.id < b.id && a.league === b.league && a.division !== b.division) { add(a.id, b.id); add(b.id, a.id); }
    }
  }
  // other league: one series with every club, two with the natural rival; home split seven and seven
  const al = RIVALS.map((r) => r[0]), nl = RIVALS.map((r) => r[1]);
  for (let i = 0; i < 15; i++) {
    for (let j = 0; j < 15; j++) {
      if (i === j) { add(al[i], nl[j]); add(nl[j], al[i]); continue; }
      const d = (j - i + 15) % 15;
      if (d >= 1 && d <= 7) add(al[i], nl[j]); else add(nl[j], al[i]);
    }
  }
  if (league(al[0]) === league(nl[0])) throw new Error('rival table is wrong');
  return series;
}

/**
 * Place every series into three-day slots, each club in at most one series per slot.
 * Returns slots: arrays of series. Clubs with more series left go first, so nobody is stranded.
 */
// Homestands and road trips of two or three series, like the real schedule: carry on after one series,
// lean towards switching after two, and switch after three.
const stay = (r) => (r === 1 ? 2 : r === 2 ? -1 : r >= 3 ? -6 : r <= -2 ? 3 : 1);

export function slotSeries(series, clubIds, seed, maxSlots = 60) {
  for (let attempt = 0; attempt < 200; attempt++) {
    const rng = new Rng(`${seed}-slots-${attempt}`);
    const left = series.map((s, i) => ({ ...s, i }));
    const remaining = new Map(clubIds.map((id) => [id, 0]));
    for (const s of left) { remaining.set(s.home, remaining.get(s.home) + 1); remaining.set(s.away, remaining.get(s.away) + 1); }
    const slots = [];
    // runs of home or away series so far: positive = at home, negative = on the road
    const run = new Map(clubIds.map((id) => [id, 0]));
    let ok = true;
    for (let k = 0; k < maxSlots && left.length; k++) {
      const slotsLeft = maxSlots - k;
      const busy = new Set();
      const slot = [];
      // clubs that must play every remaining slot are placed first
      // ...and series that end a long trip or a long homestand come before those that extend one
      const order = left.map((s) => ({ s, w: Math.max(remaining.get(s.home), remaining.get(s.away)) * 10 + rng.next() * 6
        + stay(run.get(s.home)) + stay(-run.get(s.away)) }))
        .sort((a, b) => b.w - a.w);
      for (const { s } of order) {
        if (busy.has(s.home) || busy.has(s.away)) continue;
        busy.add(s.home); busy.add(s.away);
        slot.push(s);
      }
      for (const id of clubIds) if (!busy.has(id)) run.set(id, 0);
      for (const s of slot) {
        run.set(s.home, Math.max(0, run.get(s.home)) + 1);
        run.set(s.away, Math.min(0, run.get(s.away)) - 1);
        left.splice(left.indexOf(s), 1);
        remaining.set(s.home, remaining.get(s.home) - 1);
        remaining.set(s.away, remaining.get(s.away) - 1);
      }
      slots.push(slot.map(({ home, away }) => ({ home, away })));
      if ([...remaining.values()].some((n) => n > slotsLeft - 1)) { ok = false; break; }
    }
    if (ok && !left.length) return slots;
  }
  throw new Error('could not build a schedule');
}

/**
 * The MLB season: games by day from Opening Day, with the All-Star break kept free.
 * @returns {{start:Date, end:Date, days: {date:Date, games:{id:string, home:string, away:string}[]}[]}}
 */
export function mlbSchedule(clubs, { year = 2027, opening = keyDates(year).opening, allStar = [keyDates(year).asbStart, 4], seed = 'season' } = {}) {
  const slots = slotSeries(mlbSeries(clubs), clubs.map((c) => c.id), `${seed}-${year}`);
  const days = [];
  let date = opening;
  const asbStart = allStar[0], asbEnd = addDays(allStar[0], allStar[1]);
  let n = 0;
  for (const [k, slot] of slots.entries()) {
    if (k && k % 5 === 0) date = addDays(date, 1); // a league-wide off day every couple of weeks
    // a series never straddles the All-Star break
    if (date < asbEnd && addDays(date, 3) > asbStart) date = asbEnd;
    for (let g = 0; g < 3; g++) {
      days.push({ date: addDays(date, g), games: slot.map((s) => ({ id: `${year}-${++n}`, home: s.home, away: s.away })) });
    }
    date = addDays(date, 3);
  }
  return { start: opening, end: days[days.length - 1].date, days };
}

/** Minor league season: each league plays weekly six-game series (Tuesday to Sunday) on a rotating round-robin. */
export function minorSchedule(teams, { year = 2027, seed = 'minors' } = {}) {
  const WEEKS = { AAA: 25, AA: 23, 'A+': 22, A: 22, R: 11 };
  const K = keyDates(year);
  const FIRST = { AAA: K.minorAAA, AA: K.minorRest, 'A+': K.minorRest, A: K.minorRest, R: addDays(K.minorRest, 77) }; // Tuesdays; the complex league starts in mid-June
  const leagues = new Map();
  for (const t of teams) {
    if (t.level === 'MLB') continue;
    const key = `${t.level}|${t.league}`;
    if (!leagues.has(key)) leagues.set(key, []);
    leagues.get(key).push(t);
  }
  const byDate = new Map();
  let n = 0;
  for (const [key, list] of leagues) {
    const level = key.split('|')[0];
    const rng = new Rng(`${seed}-${year}-${key}`);
    const ids = list.map((t) => t.id).sort(() => rng.next() - 0.5);
    const rounds = circle(ids);
    for (let w = 0; w < WEEKS[level]; w++) {
      const pairs = rounds[w % rounds.length];
      const flip = Math.floor(w / rounds.length) % 2 === 1;
      for (let d = 0; d < 6; d++) {
        const date = addDays(FIRST[level], w * 7 + d);
        const k = ymd(date);
        if (!byDate.has(k)) byDate.set(k, { date, games: [] });
        for (const [a, b] of pairs) {
          const [home, away] = flip ? [b, a] : [a, b];
          byDate.get(k).games.push({ id: `${year}-m${++n}`, home, away, level });
        }
      }
    }
  }
  return [...byDate.values()].sort((a, b) => a.date - b.date);
}

/** Round-robin pairings by the circle method (even number of clubs). */
function circle(ids) {
  const list = [...ids];
  const rounds = [];
  for (let r = 0; r < list.length - 1; r++) {
    const pairs = [];
    for (let i = 0; i < list.length / 2; i++) {
      const a = list[i], b = list[list.length - 1 - i];
      pairs.push(r % 2 ? [a, b] : [b, a]);
    }
    rounds.push(pairs);
    list.splice(1, 0, list.pop());
  }
  return rounds;
}
