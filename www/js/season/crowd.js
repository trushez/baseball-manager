// The crowd. Every major league game has an attendance and a mood in the stands, set by the size of the
// ground, how the home club is playing, what is at stake and what happens on the field.
import { game } from '../state.js';
import { Rng } from '../core/rng.js';
import { fromDayNo, absDay } from './calendar.js';

const ROUND = { WC: 'wild card', DS: 'division series', LCS: 'championship series', WS: 'World Series' };

/** A club's ground: between 35,000 and 56,000 seats, the same every year. */
export function capacity(orgId) {
  const r = new Rng(`cap-${orgId}`);
  const base = 35000 + Math.floor(r.next() * 21000);
  const upgrade = (game.facilities?.[orgId]?.stadium ?? 10) - 10;
  return Math.round((base + upgrade * 250) / 100) * 100;
}

/** How hot a club is: -1 (the fans have given up) to 1 (the town is buzzing). */
export function fever(orgId) {
  const r = game.season?.records?.get(orgId);
  if (!r) return 0;
  // a big signing lifts the mood for a couple of months, fading away
  const b = game.buzz?.[orgId];
  const buzz = b ? b.v * Math.max(0, 1 - (absDay(game.date) - b.from) / b.days) : 0;
  const n = r.w + r.l;
  const pc = n ? r.w / n : 0.5;
  const last = [...(r.last || [])];
  const form = last.length ? (last.filter((x) => x === 'W').length - last.filter((x) => x === 'L').length) / last.length : 0;
  const early = Math.min(1, n / 40);
  return Math.max(-1, Math.min(1, ((pc - 0.5) * 4 * early) + form * 0.35 + buzz));
}

/** Words for a mood. */
export const feverWords = (f) => (f > 0.6 ? 'the town is buzzing' : f > 0.25 ? 'the fans are warming to the team' : f > -0.25 ? 'the crowds are steady' : f > -0.6 ? 'the fans are getting restless' : 'the stands are empty and angry');

/** Attendance and the mood of the crowd for a finished game: { att, cap, mood } (mood 0 to 5). */
export function crowdFor(rec) {
  const rng = new Rng(`crowd-${rec.id}`);
  const cap = capacity(rec.home);
  const f = fever(rec.home);
  const wk = [0, 5, 6].includes(fromDayNo(rec.d).getDay());
  let pct = 0.62 + f * 0.2 + (wk ? 0.08 : 0) + (rng.next() - 0.5) * 0.12;
  if (rec.post) pct = 0.97 + rng.next() * 0.03;
  pct = Math.max(0.3, Math.min(1, pct));
  const att = Math.round(cap * pct);
  const margin = Math.abs((rec.s?.[0] ?? 0) - (rec.s?.[1] ?? 0));
  const homeWon = rec.s && rec.s[1] > rec.s[0];
  let mood = 2 + (rec.post ? 2 : 0) + (pct > 0.9 ? 1 : 0) + (homeWon ? 0.6 : -0.4) + (margin <= 1 ? 0.5 : 0) - (margin >= 8 ? 1 : 0) + f * 0.8;
  if (rec.inn > 9 && homeWon) mood += 1;
  return { att, cap, mood: Math.max(0, Math.min(5, Math.round(mood))) };
}

const NOISE = [
  'The ground was half asleep and the loudest noise of the night was the vendors.',
  'A flat, quiet night, with plenty of empty seats and little to shout about.',
  'A steady crowd that had its moments but never really got going.',
  'A decent, noisy crowd that stayed with the game to the end.',
  'The place was loud all night and the noise rose with every pitch late on.',
  'The ground was bedlam, with fans on their feet and the noise rolling round the stands.',
];

/** A line about the crowd at a finished game. */
export function crowdLine(rec) {
  if (!rec.att) return '';
  const left = rec.cap ? Math.round((1 - rec.att / rec.cap) * 100) : 0;
  const full = rec.att >= rec.cap * 0.985 ? 'a sell-out' : left > 35 ? `with ${left}% of the seats empty` : '';
  const stage = rec.post ? ` ${ROUND[rec.series?.split('-')[0]] ? `at a ${ROUND[rec.series.split('-')[0]]} game` : ''}` : '';
  return `${rec.att.toLocaleString('en-GB')} in the stands${stage}${full ? `, ${full}` : ''}. ${NOISE[rec.mood ?? 2]}`;
}

/** The mood around your own club, from the attendance at your home games so far. */
export function clubAtmosphere(orgId) {
  const home = (game.season?.games || []).filter((g) => g.level === 'MLB' && g.s && !g.post && g.home === orgId && g.att);
  const f = fever(orgId);
  const avg = home.length ? Math.round(home.reduce((a, g) => a + g.att, 0) / home.length) : 0;
  const cap = capacity(orgId);
  return { f, avg, cap, games: home.length, words: feverWords(f) };
}
