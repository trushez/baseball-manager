// The game world loaded from game/data: every player, every club, and each organisation (an MLB club
// and its four affiliates). Also the helpers screens use to read a player: positions, stat lines, contracts.

import { applyHonours } from './honours.js';
import { enrich, calibrate, familiarity, posString } from './attributes.js';

import { specialPlayers, hiddenPlayers } from './special.js';
import { ensureRepertoire } from './repertoire.js';
export const LEVELS = ['MLB', 'AAA', 'AA', 'A+', 'A', 'R'];
export const LEVEL_NAME = { MLB: 'Major League', AAA: 'Triple-A', AA: 'Double-A', 'A+': 'High-A', A: 'Single-A', R: 'Rookie' };
export const FIELD_POS = ['C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF'];
export const POS_NAME = {
  C: 'Catcher', '1B': 'First Base', '2B': 'Second Base', '3B': 'Third Base', SS: 'Shortstop', LF: 'Left Field',
  CF: 'Centre Field', RF: 'Right Field', DH: 'Designated Hitter', OF: 'Outfield', IF: 'Infield', UT: 'Utility', P: 'Pitcher',
  TWP: 'Two-Way Player',
};

// Season lines in players.json are arrays; these are their columns after [season, level, club].
export const HIST = {
  bat: ['g', 'pa', 'ab', 'h', 'b2', 'b3', 'hr', 'r', 'rbi', 'bb', 'so', 'sb', 'cs', 'hbp', 'sf'],
  pit: ['g', 'gs', 'outs', 'bf', 'h', 'er', 'hr', 'bb', 'so', 'w', 'l', 'sv', 'hld'],
};

/**
 * Fetch the data and build the world. The built-in data (the real players) is the default. A data set is one
 * complete file in data/sets/ (players, teams, honours and setup together, made by tools/bundle-data.js); the
 * New Game screen lists the files there and loads the one you pick. Edit a set file to change any stat.
 */
export async function loadWorld(base = 'data/', file = null) {
  const get = async (f) => {
    const r = await fetch(base + f);
    if (!r.ok) throw new Error(`Could not load ${f}`);
    return r.json();
  };
  let players, teams, hon, setup, info;
  const fromPack = (b, f) => { ({ players, teams } = b); hon = b.honours || null; setup = b.setup || null; return { ...checkBundle(b), file: f }; };
  if (file) {
    info = fromPack(await get(`sets/${file}`), file);
  } else {
    // a shipped game has one file, data/default.json; a development copy has the loose files
    const pack = await get('default.json').catch(() => null);
    if (pack) info = { ...fromPack(pack, null), builtIn: true };
    else {
      [players, teams, hon, setup] = await Promise.all([get('players.json'), get('teams.json'), get('honours.json').catch(() => null), get('setup.json').catch(() => null)]);
      info = { id: 'built-in', name: 'Real players (built in)', season: 2027, players: players.length, builtIn: true, file: null };
    }
  }
  const world = buildWorld(players, teams);
  world.setup = setup;
  world.dataInfo = info;
  applyHonours(world, hon); // real career honours, when tools/fetch-honours.js has been run
  return world;
}

/** The data set files in data/sets/ (the dev server and the desktop build both answer this with a list of names). */
export async function listSets(base = 'data/') {
  try {
    // the desktop game lists its data packs folder; a copy on a web host lists them in sets/index.json
    let r = await fetch(`${base}sets/`).catch(() => null);
    let l = r?.ok ? await r.json().catch(() => null) : null;
    if (!Array.isArray(l)) { r = await fetch(`${base}sets/index.json`); l = r.ok ? await r.json() : []; }
    return Array.isArray(l) ? l.filter((f) => /\.json$/i.test(f) && f !== 'index.json') : [];
  } catch { return []; }
}

export const DATA_FORMAT = 1;

/** The description of a data file, refusing one that is damaged or made for a newer game. */
export function checkBundle(b) {
  const m = b?.bm;
  if (!m || !Array.isArray(b.players) || !Array.isArray(b.teams)) throw new Error('That file is not a Baseball Manager data set.');
  if (m.format > DATA_FORMAT) throw new Error(`The data set ${m.name} is made for a newer version of the game. Update the game, or pick another set.`);
  return { id: m.id, name: m.name, season: m.season, players: b.players.length, builtIn: false, real: !!m.real, fictional: !!m.fictional };
}

/**
 * The data holds only the next four seasons of a long contract. Its text ("8 y/$130M (26-33)") says how far it
 * runs and what it is worth: the seasons after the listed ones share what is left of the total.
 */
export function fillYears(p) {
  const c = p.contract;
  if (c?.status !== 'signed' || !Array.isArray(c.years)) return;
  // a text can hold the present deal and an extension after it ("1 y/$780,000 (26) 8 y/$150M (27-34)"): the one that runs latest decides
  const all = [...(c.text || '').matchAll(/(\d+) y\/\$([\d.]+)([Mk]) \((\d\d)-(\d\d)\)/g)];
  const m = all.sort((a, b) => Number(b[5]) - Number(a[5]))[0];
  if (!m) return;
  const total = Number(m[2]) * (m[3] === 'M' ? 1e6 : 1e3), end = 2000 + Number(m[5]);
  const paidBefore = Number(m[4]) <= 26 ? (c.paid2026 || 0) : 0;
  const nums = c.years.filter((y) => typeof y.salary === 'number');
  const last = Math.max(2026, ...c.years.map((y) => y.season));
  if (end <= last) return;
  const need = end - last;
  const left = total - paidBefore - nums.reduce((a, y) => a + y.salary, 0);
  const each = Math.round(((left > 0 ? left : (c.aav || 0) * need) / need) / 25000) * 25000;
  for (let yr = last + 1; yr <= end; yr++) c.years.push({ season: yr, salary: each });
}

/** Some texts in the source lost the M after a figure ("8 y/$150 (27-34)"): a figure under a thousand dollars is millions. */
export function tidyContractText(p) {
  const c = p.contract;
  if (!c?.text) return;
  c.text = c.text.replace(/\$(\d+(?:\.\d+)?)(?=[\s)+]|$)/g, (s, n) => (Number(n) < 1000 ? `$${n}M` : s));
  // the source's "signed" is the year his professional career began; the contract itself began in the first season its text names
  const start = /\((\d\d)/.exec(c.text)?.[1];
  if (start && c.signed && c.signed < 2000 + Number(start)) { c.firstSigned = c.signed; c.signed = 2000 + Number(start); }
}

/**
 * The source lists a team or mutual option year at the price of its buyout ("1 y/$6.2M (26)+27 m opt" with 2027 at
 * $100,000), which would have him playing the option year for a few thousand dollars. That year is an undecided
 * option, like the others in the data.
 */
function optionYears(p) {
  const c = p.contract;
  const m = c && /\+(\d\d) (?:m|cl|pl) opt/.exec(c.text || '');
  if (!m) return;
  const season = 2000 + Number(m[1]);
  const y = (c.years || []).find((x) => x.season === season);
  if (y && y.salary != null && y.salary < 1e6) { delete y.salary; y.status = 'opt'; }
}

export function buildWorld(players, teams) {
  players = [...players, ...specialPlayers(players).filter((p) => teams.some((t) => t.id === p.team))];
  const clubs = new Map(teams.map((t) => [t.id, t]));
  const orgs = new Map();
  for (const t of teams) {
    if (t.level !== 'MLB') continue;
    orgs.set(t.id, { id: t.id, club: t, affiliates: {}, players: [] });
  }
  // the Rookie level has no club in the data: each organisation gets a complex team, all in one Complex League
  for (const o of orgs.values()) {
    if (teams.some((t) => t.id === `${o.id}-R`)) continue;
    const m = o.club;
    const r = { id: `${o.id}-R`, level: 'R', org: o.id, city: m.city, name: 'Complex', abbr: `${m.abbr}R`, league: 'Complex League', division: null, venue: `${m.city} training complex`, kitA: m.kitA, kitB: m.kitB, full: `${m.city} Complex` };
    teams = [...teams, r]; clubs.set(r.id, r);
  }
  for (const t of teams) if (t.level !== 'MLB') orgs.get(t.org).affiliates[t.level] = t;
  const byId = new Map();
  for (const p of players) {
    p.club = clubs.get(p.team);
    p.orgId = (p.team || '').split('-')[0];
    byId.set(p.id, p);
    orgs.get(p.orgId)?.players.push(p);
  }
  // the ratings the data lacks, then the 1 to 20 scale against this season's major leaguers
  for (const p of players) { enrich(p); ensureRepertoire(p); tidyContractText(p); optionYears(p); fillYears(p); }
  calibrate(players);
  const mlb = [...orgs.values()].map((o) => o.club);
  // two clubs in one city (New York, Los Angeles, Chicago) are named by their nickname wherever a city would be used;
  // `full` is always the whole name and `town` the real city
  const count = new Map();
  for (const c of mlb) count.set(c.city, (count.get(c.city) || 0) + 1);
  for (const c of mlb) { c.town = c.city; c.full = `${c.city} ${c.name}`; if (count.get(c.city) > 1) c.city = c.name; }
  mlb.sort((a, b) => (a.division || '').localeCompare(b.division || '') || a.city.localeCompare(b.city));
  // the hidden few: in no club and no list, only in `hidden` until a scout turns one up
  const hidden = hiddenPlayers().filter((p) => !byId.has(p.id));
  for (const p of hidden) { p.club = null; p.orgId = null; p.amateur = true; p.found = true; p.gen = true; p.pa = p.fixedPa; p.tr = 0; p.ag = 0; enrich(p); ensureRepertoire(p); }
  return { players: byId, list: players, clubs, orgs, mlb, hidden };
}

// ---------- reading a player ----------

/** A player's age for a season, the baseball way: his age on 1 July of that year. */
export function ageForSeason(p, year) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(p.born || '');
  if (!m) return p.age;
  const after = Number(m[2]) * 100 + Number(m[3]) > 701;
  return year - Number(m[1]) - (after ? 1 : 0);
}

export const fullName = (p) => `${p.first} ${p.last}`;
export const isPitcher = (p) => p.kind === 'pit';
/** On the 40-man roster: anyone under a major league contract, except players leaving as free agents this winter. */
export const onForty = (p) => !!p.contract?.status && !['minor league', 'free agent'].includes(p.contract.status);
export const leaving = (p) => p.contract?.status === 'free agent';
export const grade = (p, k) => p.grades?.[k]?.[0] ?? 50;

/** Fielding positions a hitter can play: what he has played 2024-26 (10+ games, or his most played), plus his listed position. */
export function positions(p) {
  if (isPitcher(p)) return [];
  // positions he knows well enough to be picked there (familiarity 15 of 20 or more)
  return FIELD_POS.filter((x) => familiarity(p, x) >= 15);
}

/** Position to show in a table: the listed one, or the most played when the listing is broad. */
/** The position his listing gives him (a broad listing shows what he has played most): used by ageing and valuation, which should not move with his position range. */
export function listedPos(p) {
  if (isPitcher(p)) return p.role === 'Starter' ? 'SP' : 'RP';
  if (['OF', 'IF', 'UT', 'TWP'].includes(p.pos)) return Object.keys(p.played || {})[0] || p.pos;
  return p.pos;
}

export function mainPos(p) {
  if (isPitcher(p)) return p.role === 'Starter' ? 'SP' : 'RP';
  // the first position of the string the profile and squad lists show, so the three always agree
  const s = posString(p);
  const m = /^OF \(([A-Z]{2})/.exec(s);
  return m ? m[1] : s.split(/[\/ (]/)[0] || p.pos;
}

/** One season line (array from players.json) as an object with rates. */
export function line(kind, row) {
  const o = { season: row[0], level: row[1], club: row[2] };
  HIST[kind].forEach((k, i) => { o[k] = row[i + 3]; });
  if (kind === 'bat') {
    const singles = o.h - o.b2 - o.b3 - o.hr;
    o.avg = o.ab ? o.h / o.ab : null;
    const obpD = o.ab + o.bb + o.hbp + o.sf;
    o.obp = obpD ? (o.h + o.bb + o.hbp) / obpD : null;
    o.slg = o.ab ? (singles + 2 * o.b2 + 3 * o.b3 + 4 * o.hr) / o.ab : null;
    o.ops = o.obp != null && o.slg != null ? o.obp + o.slg : null;
    o.kPct = o.pa ? o.so / o.pa : null;
    o.bbPct = o.pa ? o.bb / o.pa : null;
  } else {
    const ip = o.outs / 3;
    o.ip = ip;
    o.era = ip ? (o.er * 9) / ip : null;
    o.whip = ip ? (o.h + o.bb) / ip : null;
    o.k9 = ip ? (o.so * 9) / ip : null;
    o.bb9 = ip ? (o.bb * 9) / ip : null;
    o.hr9 = ip ? (o.hr * 9) / ip : null;
    o.kPct = o.bf ? o.so / o.bf : null;
    o.bbPct = o.bf ? o.bb / o.bf : null;
    o.fip = ip ? (13 * o.hr + 3 * o.bb - 2 * o.so) / ip + 3.15 : null;
  }
  return o;
}

/** All season lines of one kind, oldest first. */
export const seasons = (p, kind = isPitcher(p) ? 'pit' : 'bat') => (p.hist?.[kind] || []).map((r) => line(kind, r));

/** The most recent season, all levels added together (levels listed). */
export function lastSeason(p, kind = isPitcher(p) ? 'pit' : 'bat') {
  const rows = p.hist?.[kind];
  if (!rows?.length) return null;
  const year = Math.max(...rows.map((r) => r[0]));
  const these = rows.filter((r) => r[0] === year);
  const sum = [year, these.map((r) => r[1]).join('/'), these.map((r) => r[2]).join('/')];
  HIST[kind].forEach((_, i) => { sum.push(these.reduce((a, r) => a + r[i + 3], 0)); });
  return line(kind, sum);
}

/**
 * Years of major league service. The data gives it for players on a major league contract; for the rest (a veteran on a
 * minor league deal, say) it is worked out from the seasons he has played in the majors.
 */
/** A professional signed from another country's league (Japan, Korea): when his contract ends he is a free agent, whatever his years of major league service. */
const PRO_ABROAD = new Set(['JPN', 'KOR', 'TWN', 'NPB']);
export const fromAbroad = (p) => (!!p.foreign && !p.defector) || (PRO_ABROAD.has(p.contract?.origin) && p.contract?.status === 'signed');

export function serviceYears(p) {
  const given = p.contract?.serviceTime;
  if (given != null) return given;
  let years = 0;
  for (const r of p.hist?.[isPitcher(p) ? 'pit' : 'bat'] || []) {
    if (r[1] !== 'MLB') continue;
    const g = r[3];
    years += g >= 45 ? 1 : g >= 15 ? 0.5 : 0.15;
  }
  return Math.round(years * 100) / 100;
}

/** One season added up across clubs, optionally at one level only. */
export function seasonLine(p, kind, year, level = null) {
  const these = (p.hist?.[kind] || []).filter((r) => r[0] === year && (!level || r[1] === level));
  if (!these.length) return null;
  const sum = [year, [...new Set(these.map((r) => r[1]))].join('/'), these.map((r) => r[2]).join('/')];
  HIST[kind].forEach((_, i) => { sum.push(these.reduce((a, r) => a + r[i + 3], 0)); });
  return line(kind, sum);
}

// ---------- contracts ----------

const STATUS_SHORT = {
  signed: 'Signed', arbitration: 'Arb', 'pre-arbitration': 'Pre-arb', 'free agent': 'FA', option: 'Option', 'minor league': 'MiLB',
};
export const statusShort = (p) => STATUS_SHORT[p.contract?.status] || '';

/** What a player is due in a season: an amount, a status ('A2', 'FA', 'opt'), or null. */
export function salaryIn(p, season) {
  const y = p.contract?.years?.find((x) => x.season === season);
  if (!y) return null;
  return y.salary ?? y.status;
}

export function money(v, { short = true } = {}) {
  if (v == null) return '';
  if (typeof v === 'string') return v;
  if (v < 0) return `-${money(-v, { short })}`;
  if (short) {
    if (Math.abs(v) >= 1e6) return `$${(v / 1e6).toFixed(v % 1e6 === 0 ? 0 : 1)}M`;
    if (Math.abs(v) >= 1e3) return `$${Math.round(v / 1e3)}k`;
  }
  return `$${Math.round(v).toLocaleString('en-US')}`;
}

export const rate3 = (x) => (x == null ? '' : x.toFixed(3).replace(/^0/, ''));
export const fix = (x, d = 2) => (x == null ? '' : x.toFixed(d));
export const pct = (x) => (x == null ? '' : `${(x * 100).toFixed(1)}%`);
export const ipText = (outs) => `${Math.floor(outs / 3)}.${outs % 3}`;
