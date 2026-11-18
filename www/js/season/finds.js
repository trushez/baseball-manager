// Finds: the young players your scouts turn up by living in a country. The longer a scout covers a place, the more
// people he knows there and the more he brings you; a better scout sees further and keeps better ones. Each find gets
// a report, can be signed for a bonus straight into your Rookie level, and is lost to another club if you wait.
//
// They are separate from the December international class: that is the big once-a-year auction; this is what a
// scout in the Dominican Republic hears about in March.
import { Rng } from '../core/rng.js';
import { game } from '../state.js';
import { isPitcher, mainPos, fullName, money } from '../data/world.js';
import { dayNo } from './calendar.js';
import { newPlayer } from './intake.js';
import { caOf } from './ability.js';
import { message } from './inbox.js';
import { look, sdPot, CODES } from './scouting.js';
import { askFor, sign, poolOf, committed } from './amateurs.js';
import { COUNTRY, REGIONS, destOf, pickCountry } from './geo.js';

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
export const STAY = 90;        // days a find waits before another club signs him
export const KEEP = 10;        // finds a scout holds at once
/** A youngster found abroad signs for next to nothing: a few thousand dollars, a little more for a better one. */
export const findPrice = (p) => Math.min(25000, 5000 + Math.round(Math.max(0, (p.pa ?? 80) - 80) / 20) * 5000);
export const ROOKIE_MAX = 36;  // the Rookie level is full beyond this
const codeOf = (name) => Object.entries(CODES).find(([, v]) => v === name)?.[0];

export function finds() {
  const f = (game.finds ||= { list: [], depth: {}, spent: {}, n: 0, seen: {} });
  f.seen ||= {};
  return f;
}
export const findsOf = (scoutId) => finds().list.filter((x) => x.scoutId === scoutId);
export const findFor = (pid) => finds().list.find((x) => x.p.id === pid) || null;
export const depthWords = (n) => (n >= 40 ? 'Everyone knows him there' : n >= 20 ? 'Well connected' : n >= 8 ? 'Getting known' : n >= 2 ? 'A few contacts' : 'New to the place');

/** A young player from somewhere a scout is covering: a country, or one of the countries in a region. */
function youngster(rng, dest, id) {
  const pool = game.intakePool || [];
  if (!pool.length) return null;
  const country = pickCountry(dest, rng);
  const cfg = COUNTRY[country] || { d: 15, age: [16, 20] };
  const kind = rng.chance(0.47) ? 'pit' : 'bat';
  const tpls = pool.filter((t) => t.kind === kind);
  const tpl = rng.pick(tpls.length ? tpls : pool);
  const age = rng.int(cfg.age[0], cfg.age[1]);
  const d = cfg.d;
  const t2 = { ...tpl, age, r: { ...tpl.r }, grades: JSON.parse(JSON.stringify(tpl.grades)) };
  for (const [k, v] of Object.entries(t2.r)) if (typeof v === 'number' && k !== '_e') t2.r[k] = clamp(v - d, 20, 80);
  for (const g of Object.values(t2.grades)) if (Array.isArray(g) && typeof g[0] === 'number') g[0] = clamp(g[0] - d, 20, 80);
  const p = newPlayer(t2, { id: 'INTL' }, game.year, rng, { id });
  p.team = null; p.club = null; p.orgId = null; p.level = 'R'; p.amateur = true; p.country = codeOf(country) || country; p.found = true;
  p.ask = askFor(p);
  return p;
}

/** One week of a scout living in a country. */
export function discover(scout, country, rng) {
  const f = finds();
  const depth = f.depth[country] || 0;
  const tries = clamp(2 + Math.floor(depth / 6) + Math.round(scout.ja / 3), 2, 16);
  const keepChance = clamp(0.28 + scout.ja * 0.025 + Math.min(depth, 40) * 0.006, 0.2, 0.95);
  f.depth[country] = depth + 1;
  const batch = [];
  for (let i = 0; i < tries; i++) {
    const p = youngster(rng, country, `f${game.year}-${++f.n}`);
    if (p) batch.push({ p, s: (p.pa ?? caOf(p)) + rng.normal(0, sdPot(scout.jp)) });
  }
  batch.sort((a, b) => b.s - a.s);
  const out = [];
  for (const x of batch) {
    if (out.length >= 1 + (scout.ja >= 14 && rng.chance(0.5) ? 1 : 0)) break;
    if (!rng.chance(keepChance)) break;
    out.push(x.p);
  }
  const now = dayNo(game.date);
  for (const p of out) {
    const rep = look(scout, p, rng);
    (game.knowledge ||= {})[p.id] = rep;
    game.world.players.set(p.id, p);
    f.list.push({ p, scoutId: scout.id, scout: scout.name, country, date: now, expires: now + STAY });
    f.seen[scout.id] = (f.seen[scout.id] || 0) + 1;
  }
  // the greatest players alive who belong to no club: the longer and the better a scout looks, the likelier he hears of one
  for (const g of game.world.hidden || []) {
    if (game.world.players.has(g.id) || destOf(g.country) !== country) continue;
    // a scout in a whole region is looking at a dozen countries at once, so he is half as likely to hear of one boy
    if (!rng.chance(clamp((0.004 + depth * 0.0012 + scout.ja * 0.0015) * (REGIONS.has(country) ? 0.5 : 1), 0, 0.12))) continue;
    g.ask = g.ask ?? askFor(g);
    const rep = look(scout, g, rng);
    (game.knowledge ||= {})[g.id] = rep;
    game.world.players.set(g.id, g);
    f.list.push({ p: g, scoutId: scout.id, scout: scout.name, country, date: now, expires: now + STAY, gem: true });
    f.seen[scout.id] = (f.seen[scout.id] || 0) + 1;
    out.push(g);
  }
  // a scout holds only so many: the weakest drops away
  const mine = findsOf(scout.id).sort((a, b) => (game.knowledge[b.p.id]?.pj ?? 0) - (game.knowledge[a.p.id]?.pj ?? 0));
  for (const x of mine.slice(KEEP)) drop(x);
  return out;
}

function drop(x) {
  const f = finds();
  f.list = f.list.filter((y) => y !== x);
  game.world.players.delete(x.p.id); // a hidden player goes back to being hidden (see world.hidden)
  delete game.knowledge?.[x.p.id];
}

/**
 * Daily: a find you leave alone is not lost for certain. Some of them (about a third) are signed by a computer club into
 * its Rookie level, where he becomes an ordinary part of the game; the rest are not signed by anyone and go back to
 * being people nobody has seen. A hidden one goes back into hiding.
 */
export function findsTick(d = dayNo(game.date)) {
  const f = finds();
  for (const x of f.list.slice()) {
    if (d < x.expires) continue;
    const rng = new Rng(`rival-${x.p.id}-${x.expires}`);
    const orgs = [...game.world.orgs.values()].filter((o) => o.id !== game.orgId && o.players.filter((p) => p.level === 'R').length < 32);
    if (orgs.length && rng.chance(0.33)) {
      const o = rng.pick(orgs), p = x.p;
      f.list = f.list.filter((y) => y !== x);
      delete p.found;
      sign(p, o.id, findPrice(p), game.date.getFullYear());
      const rep = game.knowledge?.[p.id];
      if (rep && (x.gem || rep.pj >= 140)) message({ cat: 'club', player: p.id, title: `${fullName(p)} signs with ${o.club.city}`, body: `${o.club.city} have signed ${fullName(p)}, ${p.age}, from ${x.country}, whom ${x.scout} had reported on. ${rep.pot ? `${x.scout} said he ${rep.pot}.` : ''} You did not sign him in time.` });
    } else drop(x);
  }
}

/** Why you cannot sign him now, or null. */
export function cannotSign(x) {
  const o = game.world.orgs.get(game.orgId);
  const rookies = o.players.filter((p) => p.level === 'R').length;
  if (rookies >= ROOKIE_MAX) return `Your Rookie level is full (${ROOKIE_MAX}).`;
  const left = poolOf() - committed() - (finds().spent[game.date.getFullYear()] || 0);
  if (findPrice(x.p) > left) return `Your signing pool has ${money(Math.max(0, left), { short: false })} left; he wants ${money(findPrice(x.p), { short: false })}.`;
  return null;
}

/** Sign a find into the development complex at the Rookie level. Returns [ok, text]. */
export function signFind(pid) {
  const x = findFor(pid);
  if (!x) return [false, 'He is no longer available.'];
  const why = cannotSign(x);
  if (why) return [false, why];
  const f = finds();
  const year = game.date.getFullYear();
  f.spent[year] = (f.spent[year] || 0) + findPrice(x.p);
  f.list = f.list.filter((y) => y !== x);
  const p = x.p;
  delete p.found;
  sign(p, game.orgId, findPrice(p), year);
  return [true, `${fullName(p)} signs for ${money(findPrice(p), { short: false })} and joins your Rookie level.`];
}

/** For the save. */
export const findsForSave = () => (game.finds ? { ...game.finds, list: game.finds.list.map((x) => ({ ...x, p: (({ club, ...r }) => r)(x.p) })) } : null);
export function restoreFinds(d) {
  game.finds = d || null;
  for (const x of game.finds?.list || []) game.world.players.set(x.p.id, x.p);
}
