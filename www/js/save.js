// Saving and loading. A save holds only what changes in play (rosters, contracts, results, stats,
// injuries, messages); the player database is loaded fresh and the save laid over it.
//
// Where saves live: in the desktop build, ordinary files in the player's saves folder (through
// window.bmDesktop, see desktop/preload.cjs); in a browser, IndexedDB. Either way the saved text is
// gzipped when the platform can, which shrinks a long career about ten times.
//
// What goes in: every field on the game object except those in TRANSIENT (state.js) and the few with
// their own code below (the world's players, the clubs' roster states, the season, the scouts' finds).
// Sets, Maps and Dates are tagged so they come back as what they were. SAVE_VERSION goes up when the
// layout changes; older saves are read through the steps in readState and apply.
import { findsForSave, restoreFinds } from './season/finds.js';
import { enrichExtra } from './data/attributes.js';
import { ensureRepertoire } from './data/repertoire.js';
import { game, defaultSettings, resetGame, TRANSIENT, blankGame } from './state.js';
import { indexSeason } from './season/sim.js';
import { loadWorld, listSets, ageForSeason } from './data/world.js';
import { ensureJobs } from './season/jobs.js';
import { SAVE_VERSION } from './version.js';

// ---------- storage ----------

const desktop = () => globalThis.bmDesktop?.saves || null;
const DB = 'baseball-manager', STORE = 'saves', DB_VERSION = 1;

function openDb() {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open(DB, DB_VERSION);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE, { keyPath: 'name' });
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}
let dbPromise = null;
const tx = async (mode, fn) => {
  const db = await (dbPromise ||= openDb().catch((e) => { dbPromise = null; throw e; }));
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const req = fn(t.objectStore(STORE));
    t.oncomplete = () => resolve(req?.result);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error || new Error('The save was not written.'));
  });
};

// A save file: a first line naming the format, a line of facts about the save (so a list of saves never has to
// open the game itself), then the game, gzipped. The desktop build keeps each save as one of these files, and
// Export writes the same thing, so a save can be copied between computers just by copying the file.
const MAGIC = 'BMSAVE 2\n';
export function toFile({ name, label, savedAt, auto, data }) {
  const head = new TextEncoder().encode(`${MAGIC}${JSON.stringify({ name, label, savedAt, auto: !!auto })}\n`);
  const body = typeof data === 'string' ? new TextEncoder().encode(data) : data;
  const out = new Uint8Array(head.length + body.length);
  out.set(head, 0); out.set(body, head.length);
  return out;
}
/** The facts line of a save file, from its first bytes, or null if it is not one. */
export function readHead(bytes) {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const magic = new TextEncoder().encode(MAGIC);
  if (b.length < magic.length || magic.some((x, i) => b[i] !== x)) return null;
  const end = b.indexOf(10, magic.length);
  if (end < 0) return null;
  try { return { meta: JSON.parse(new TextDecoder().decode(b.subarray(magic.length, end))), start: end + 1 }; } catch { return null; }
}
export function fromFile(bytes) {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const h = readHead(b);
  if (!h) return null;
  return { ...h.meta, data: b.slice(h.start) };
}
/** The file a save of this name is kept in. */
export const fileFor = (name) => `${name.replace(/[^\w ,()'.-]+/g, '').replace(/\s+/g, ' ').trim().slice(0, 120) || 'save'}.bmsave`;

const files = new Map(); // save name -> file, from the last listing (a file copied in by hand keeps its own name)
const store = {
  async list() {
    if (!desktop()) return ((await tx('readonly', (s) => s.getAll())) || []).map(({ name, savedAt, label, auto }) => ({ name, savedAt, label, auto }));
    const out = [];
    for (const { file, head } of await desktop().list()) {
      const h = readHead(head);
      if (!h?.meta?.name) continue;
      files.set(h.meta.name, file);
      out.push({ name: h.meta.name, savedAt: h.meta.savedAt, label: h.meta.label, auto: h.meta.auto });
    }
    return out;
  },
  async get(name) {
    if (!desktop()) return tx('readonly', (s) => s.get(name));
    const bytes = await desktop().read(files.get(name) || fileFor(name));
    return bytes ? fromFile(bytes) : null;
  },
  async put(rec) {
    if (!desktop()) return tx('readwrite', (s) => s.put(rec));
    const file = files.get(rec.name) || fileFor(rec.name);
    await desktop().write(file, toFile(rec));
    files.set(rec.name, file);
  },
  async remove(name) {
    if (!desktop()) return tx('readwrite', (s) => s.delete(name));
    await desktop().remove(files.get(name) || fileFor(name));
    files.delete(name);
  },
};

/** Gzip text when the platform can; old saves and platforms without it keep plain text. */
export async function pack(text) {
  if (typeof CompressionStream === 'undefined') return text;
  const stream = new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}
export async function unpack(data) {
  if (typeof data === 'string') return data;
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  if (bytes[0] !== 0x1f || bytes[1] !== 0x8b) return new TextDecoder().decode(bytes);
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Response(stream).text();
}

/** Where the game stands, to tell whether anything has happened since the last save (the quit question). */
export const progressMark = () => (game.world && game.orgId ? `${game.date?.getTime()}|${game.inbox?.length}|${game.phase}` : null);
export const markSaved = () => { game.savedMark = progressMark(); };
export const unsaved = () => !!progressMark() && progressMark() !== game.savedMark;

export const listSaves = async () => ((await store.list()) || []).sort((a, b) => b.savedAt - a.savedAt);
export const deleteSave = (name) => store.remove(name);

const clubLabel = () => { const club = game.world.orgs.get(game.orgId).club; return `${club.full ?? `${club.city} ${club.name}`}, ${game.date.toDateString()}`; };

export async function saveGame(name, { auto = false } = {}) {
  const data = await pack(JSON.stringify(serialize()));
  await store.put({ name, savedAt: Date.now(), label: clubLabel(), data, auto });
  if (!auto) { game.saveName = name; delete game.broken; } // a save the player chose to make: autosave may run again
  markSaved();
}

/** The two autosave slots for this career: the newest, and the one before it. */
export function autosaveNames() {
  const club = game.world.orgs.get(game.orgId).club;
  const name = `Autosave: ${game.manager}, ${club.name}`;
  return [name, `${name} (previous)`];
}

/**
 * Autosave (Game Options): at every Continue stop, or once a week of game time. One pair of slots per
 * club and manager, so a new career never writes over another's: the last autosave moves to "(previous)"
 * before the new one is written, so a save made in a bad moment never leaves you without a good one.
 * Nothing is written after an error has been reported this sitting (game.broken).
 */
export async function autosave() {
  const how = game.settings.autosave ?? 'stop';
  if (how === 'off' || !game.world || !game.orgId || game.broken) return null;
  if (how === 'weekly' && game.lastAuto && game.date - game.lastAuto < 7 * 864e5) return null;
  const [name, prev] = autosaveNames();
  const old = await store.get(name).catch(() => null);
  if (old) await store.put({ ...old, name: prev });
  await saveGame(name, { auto: true });
  game.lastAuto = game.date.getTime();
  return name;
}

/** A save as a file to keep or move to another computer (the same format the desktop build keeps its saves in). */
export async function exportSave(name) {
  const rec = await store.get(name);
  if (!rec) throw new Error('Save not found');
  const data = typeof rec.data === 'string' ? await pack(rec.data) : rec.data;
  return { file: fileFor(name), bytes: toFile({ ...rec, data }) };
}

/** A save file back into the list of saved games (a save of the same name is replaced). Returns its name. */
export async function importSave(content) {
  const bytes = typeof content === 'string' ? new TextEncoder().encode(content) : new Uint8Array(content);
  let rec = fromFile(bytes);
  if (!rec) {
    // an export from before version 2: the whole record as JSON
    let d;
    try { d = JSON.parse(await unpack(bytes)); } catch { throw new Error('That is not a save file.'); }
    if (d?.bm !== 1 || typeof d.data !== 'string' || !d.name) throw new Error('That is not a save file.');
    rec = { name: d.name, label: d.label, savedAt: d.savedAt || Date.now(), data: await pack(d.data) };
  }
  let inner;
  try { inner = JSON.parse(await unpack(rec.data)); } catch { throw new Error('The save file is damaged.'); }
  if (inner.v > SAVE_VERSION) throw new Error('This save was made by a newer version of the game. Update the game to load it.');
  if (!inner.v || !(inner.orgId || inner.state?.orgId) || !Array.isArray(inner.players)) throw new Error('The save file is damaged.');
  if (!rec.name) throw new Error('That is not a save file.');
  await store.put({ name: rec.name, savedAt: rec.savedAt || Date.now(), label: rec.label || inner.orgId || inner.state.orgId, data: rec.data, auto: false });
  return rec.name;
}

export async function loadGame(name) {
  const rec = await store.get(name);
  if (!rec) throw new Error('Save not found');
  let d;
  try { d = JSON.parse(await unpack(rec.data)); } catch { throw new Error('The save is damaged and cannot be read.'); }
  if (d.v > SAVE_VERSION) throw new Error('This save was made by a newer version of the game. Update the game to load it.');
  let world;
  try { world = await loadWorld('data/', d.dataFile || null); } catch (e) { throw new Error(`This game uses the data set ${d.dataFile}, which could not be loaded (${e.message}). Put the file back in the data packs folder.`); }
  let had = d.dataId || 'built-in', has = world.dataInfo?.id || 'built-in';
  // a game started on the real players built into a development copy (the browser version): the real-players
  // pack in the data packs folder holds the same players, so the game loads with it and saves with it from now on
  if (had === 'built-in' && has !== 'built-in' && !d.dataFile) {
    for (const f of await listSets('data/')) {
      try { const w = await loadWorld('data/', f); if (w.dataInfo?.real) { world = w; has = had = w.dataInfo.id; break; } } catch { /* not this one */ }
    }
    if (had === 'built-in') throw new Error('This game was started with the real players. Put the real players data pack in the Data packs folder (Documents, Baseball Manager) to load it.');
  }
  if (had !== has) throw new Error(`This game was started with different player data (${had}), but ${d.dataFile || 'the built-in data'} is now ${has}. Put the old file back to load it.`);
  game.world = world;
  apply(d);
  ensureJobs();
  game.saveName = name;
  markSaved();
}

// ---------- the tagged copy of plain game fields ----------

/** A JSON-safe copy that keeps Sets, Maps and Dates. A field that holds a player object (a loop) is a bug and says which. */
export function encode(v, path = 'game', seen = new WeakSet()) {
  if (v === null || typeof v !== 'object') return v;
  if (v instanceof Date) return { $date: v.getTime() };
  if (seen.has(v)) throw new Error(`${path} refers back to itself and cannot be saved`);
  seen.add(v);
  let out;
  if (v instanceof Set) out = { $set: [...v].map((x, i) => encode(x, `${path}[${i}]`, seen)) };
  else if (v instanceof Map) out = { $map: [...v].map(([k, x]) => [encode(k, path, seen), encode(x, `${path}.${k}`, seen)]) };
  else if (Array.isArray(v)) out = v.map((x, i) => encode(x, `${path}[${i}]`, seen));
  else { out = {}; for (const k of Object.keys(v)) { const x = v[k]; if (x !== undefined && typeof x !== 'function') out[k] = encode(x, `${path}.${k}`, seen); } }
  seen.delete(v);
  return out;
}
export function decode(v) {
  if (v === null || typeof v !== 'object') return v;
  if (Array.isArray(v)) return v.map(decode);
  if ('$date' in v) return new Date(v.$date);
  if ('$set' in v) return new Set(v.$set.map(decode));
  if ('$map' in v) return new Map(v.$map.map(([k, x]) => [decode(k), decode(x)]));
  const out = {};
  for (const k of Object.keys(v)) out[k] = decode(v[k]);
  return out;
}

/** Fields with code of their own in serialize/apply, not copied as plain state. */
const OWN = new Set(['orgStates', 'season', 'finds']);

/** The plain game fields of a save, whatever its version. */
function readState(d) {
  if (d.v >= 2) return decode(d.state);
  // version 1 kept the fields at the top level, a few in their own shapes
  const skip = new Set(['v', 'orgs', 'players', 'season', 'otherMoney', 'retired', 'retiredData', 'finds', 'svcFix', 'aavFix', 'dataId', 'dataFile']);
  const st = {};
  for (const k of Object.keys(d)) if (!skip.has(k)) st[k] = d[k];
  st.date = new Date(d.date);
  st.shortlist = new Set(d.shortlist || []);
  st.advised = new Set(d.advised || []);
  return st;
}

// ---------- what goes in a save ----------

// A player made during the game (draft, intake, scouting) is not in the database, so his save carries what he was
// made with. Everything that changes in play is saved in its own place and left out here, so it is not kept twice.
const LIVE = new Set(['club', 'hist', 'contract', 'injury', 'fat', 'plog', 'playedDay', 'mood', 'disc', 'moodWhy', 'splits', 'played', 'gb', 'gp', 'hon', 'pyr', 'rust', 'rehab', 'ps', 'mv', 'deals', 'injuryLog',
  'fx', 'rule5', 'listed', 'tradeBar', 'nearDeal', 'qo', 'qoUsed', 'prog', 'pa', 'tr', 'ag', 'hurt', 'hurtKind', 'yips', 'r0', 'dvLast', 'life', 'dvYear', 'dvWhy', 'ev', 'bud', 'wasMine', 'orgId', 'team', 'level', 'req', 'broken', 'focus', 'hurtLong', '_u', '_hid']);
const KEPT = new Set(['club', 'hist', 'mv', 'ps', 'hon']); // a retired player: only these are saved elsewhere
function genCore(p, skip) {
  const o = {};
  for (const k of Object.keys(p)) if (!skip.has(k) && p[k] !== undefined) o[k] = p[k];
  if (o.fx) o.fx = roundFx(o.fx);
  return o;
}

/** The hidden fractions under the attributes, to three places: full-length decimals were a sixth of a save. */
const roundFx = (fx) => { const o = {}; for (const k in fx) o[k] = Math.round(fx[k] * 1000) / 1000; return o; };

const BASE_YEAR = 2027;

/** A retired player leaves the list but his years in this game stay on record: what he did for your club, how he came and went, his honours. */
function retiredData() {
  const out = [];
  for (const p of game.world.players.values()) {
    if (!p.retired) continue;
    const rows = {};
    for (const k of ['bat', 'pit']) { const r = p.hist?.[k]?.filter((x) => x[0] >= BASE_YEAR); if (r?.length) rows[k] = r; }
    if (Object.keys(rows).length || p.mv?.length || p.hon?.length || p.ps) out.push({ id: p.id, ps: p.ps, rows: Object.keys(rows).length ? rows : undefined, mv: p.mv?.length ? p.mv : undefined, hon: p.hon, gen: p.gen ? genCore(p, KEPT) : undefined });
  }
  return out;
}

export function serialize() {
  const W = game.world;
  const players = [];
  for (const p of W.list) {
    const rows = {};
    for (const k of ['bat', 'pit']) { const r = p.hist?.[k]?.filter((x) => x[0] >= BASE_YEAR); if (r?.length) rows[k] = r; }
    const dev = { pa: p.pa, tr: p.tr || undefined, ag: p.ag, hurt: p.hurt || undefined, hurtKind: p.hurtKind, yips: p.yips || undefined, r0: p.r0, dvLast: p.dvLast, fx: p.fx && roundFx(p.fx), life: p.life, dvYear: p.dvYear, dvWhy: p.dvWhy, ev: p.ev, bud: p.bud, wasMine: p.wasMine || undefined, mv: p.mv?.length ? p.mv : undefined, deals: p.deals?.length ? p.deals : undefined, injuryLog: p.injuryLog?.length ? p.injuryLog : undefined, rule5: p.rule5 || undefined, listed: p.listed || undefined, tradeBar: p.tradeBar || undefined, nearDeal: p.nearDeal || undefined, qo: p.qo || undefined, qoUsed: p.qoUsed || undefined, prog: p.prog?.length ? p.prog : undefined, req: p.req, broken: p.broken, focus: p.focus, hurtLong: p.hurtLong, _u: p._u, _hid: p._hid };
    if (p.dvLast != null || p.dvYear != null) { dev.r = p.r; dev.grades = p.grades; dev.pitchGrades = p.pitchGrades; }
    if (p.gen) dev.full = genCore(p, LIVE);
    players.push({
      dev, id: p.id, team: p.team ?? null, level: p.level, contract: p.contract, injury: p.injury, fat: p.fat || undefined,
      plog: p.plog?.length ? p.plog : undefined, pd: p.playedDay, rows: Object.keys(rows).length ? rows : undefined,
      ps: p.ps, mood: p.mood, why: p.moodWhy, disc: p.disc, splits: p.splits, played: p.played, gb: p.gb, gp: p.gp, hon: p.hon, pyr: p.pyr, rust: p.rust || undefined, rehab: p.rehab,
    });
  }
  const orgs = [...game.orgStates].map(([id, st]) => [id, encode(st, `orgStates.${id}`)]);
  const state = {};
  for (const k of Object.keys(game)) {
    if (TRANSIENT.has(k) || OWN.has(k) || game[k] === undefined) continue;
    state[k] = encode(game[k], `game.${k}`);
  }
  const s = game.season;
  return {
    v: SAVE_VERSION,
    dataId: W.dataInfo?.id || 'built-in',
    dataFile: W.dataInfo?.file || null,
    state,
    finds: findsForSave(),
    retired: [...W.players.values()].filter((p) => p.retired).map((p) => p.id),
    retiredData: retiredData(),
    otherMoney: W.mlb.map((c) => [c.id, c.otherMoney || []]),
    orgs,
    players,
    season: s && {
      ...s, byDay: undefined, records: [...s.records], minorRecords: [...s.minorRecords],
      monthSnap: s.monthSnap ? [...s.monthSnap] : undefined, weekSnap: s.weekSnap ? [...s.weekSnap] : undefined,
      weekRec: s.weekRec ? [...s.weekRec] : undefined, moodSnap: s.moodSnap ? [...s.moodSnap] : undefined,
    },
  };
}

export function apply(d) {
  const W = game.world;
  // start from a blank career, so nothing from the game that was open before carries into this one
  resetGame({ world: W, defaultData: game.defaultData });
  const blank = blankGame();
  const st = readState(d);
  for (const [k, v] of Object.entries(st)) {
    if (TRANSIENT.has(k) || OWN.has(k)) continue;
    if (v == null && blank[k] != null) continue; // a missing value keeps the blank career's default
    game[k] = v;
  }
  game.settings = { ...defaultSettings(), ...st.settings, stops: { ...defaultSettings().stops, ...st.settings?.stops }, news: { ...defaultSettings().news, ...st.settings?.news } };
  game.compareWith = null;
  const svcFix = d.v >= 2 || d.svcFix, aavFix = d.v >= 2 || d.aavFix;
  for (const [id, om] of d.otherMoney) { const c = W.clubs.get(id); if (c) c.otherMoney = om; }
  // players: where they are, their contracts, health and this season's lines
  for (const o of W.orgs.values()) o.players.length = 0;
  restoreFinds(d.finds);
  // players who have retired leave the list; players who joined since the start are rebuilt from the save
  const retired = new Set(d.retired || []);
  for (const id of retired) { const p = W.players.get(id); if (p) p.retired = true; }
  W.list = W.list.filter((p) => !retired.has(p.id));
  // what the retired did in this game: the lines they played for each club and the moves that took them there
  for (const r of d.retiredData || []) {
    let p = W.players.get(r.id);
    if (!p && r.gen) { p = { ...r.gen }; W.players.set(p.id, p); }
    if (!p) continue;
    p.retired = true;
    if (r.rows) { p.hist ||= {}; for (const k of ['bat', 'pit']) p.hist[k] = [...(p.hist[k] || []).filter((x) => x[0] < BASE_YEAR), ...(r.rows[k] || [])]; }
    if (r.mv) p.mv = r.mv;
    if (r.ps) p.ps = r.ps;
    if (r.hon) p.hon = r.hon;
  }
  for (const sp of d.players) {
    if (sp.dev?.full && !W.players.has(sp.id)) { const np = { ...sp.dev.full }; W.players.set(np.id, np); W.list.push(np); }
  }
  for (const sp of d.players) {
    const p = W.players.get(sp.id);
    if (!p) continue;
    if (sp.dev) {
      const dv = sp.dev;
      p.pa = dv.pa; p.ag = dv.ag; if (dv.tr) p.tr = dv.tr; else delete p.tr;
      if (dv.hurt) p.hurt = dv.hurt; else delete p.hurt;
      p.hurtKind = dv.hurtKind; if (dv.yips) p.yips = dv.yips; else delete p.yips;
      if (dv.r0) p.r0 = dv.r0; else delete p.r0;
      p.dvLast = dv.dvLast;
      for (const k of ['fx', 'life', 'dvYear', 'dvWhy', 'ev', 'bud', 'wasMine', 'mv', 'deals', 'injuryLog', 'rule5', 'listed', 'tradeBar', 'nearDeal', 'qo', 'qoUsed', 'prog', 'req', 'broken', 'focus', 'hurtLong', '_u', '_hid']) { if (dv[k] != null) p[k] = dv[k]; else delete p[k]; }
      if (dv.r) { p.r = dv.r; p.grades = dv.grades; if (dv.pitchGrades) p.pitchGrades = dv.pitchGrades; enrichExtra(p); ensureRepertoire(p); }
    }
    if (game.year > 2027) p.age = ageForSeason(p, game.year);
    p.team = sp.team; p.level = sp.level; p.contract = sp.contract;
    // saves from before the service-time fix counted a year twice: nobody has more years than he has been an adult player
    if (!svcFix && p.contract?.serviceTime > Math.max(0, (p.age ?? 30) - 20)) p.contract.serviceTime = Math.max(0, (p.age ?? 30) - 20);
    p.club = sp.team ? W.clubs.get(sp.team) : null;
    p.orgId = sp.team ? sp.team.split('-')[0] : null;
    if (sp.injury) p.injury = sp.injury; else delete p.injury;
    p.fat = sp.fat || 0; p.plog = sp.plog || []; p.playedDay = sp.pd;
    if (sp.mood != null) p.mood = sp.mood; else delete p.mood;
    if (sp.disc) p.disc = sp.disc; else delete p.disc;
    if (sp.why) p.moodWhy = sp.why; else delete p.moodWhy;
    if (sp.splits) p.splits = sp.splits; else delete p.splits;
    if (sp.played) p.played = sp.played;
    if (sp.gb) p.gb = sp.gb; else delete p.gb;
    if (sp.gp) p.gp = sp.gp; else delete p.gp;
    if (sp.hon) p.hon = sp.hon; else delete p.hon;
    if (sp.pyr) p.pyr = sp.pyr; else delete p.pyr;
    if (sp.rust) p.rust = sp.rust; else delete p.rust;
    if (sp.rehab) p.rehab = sp.rehab; else delete p.rehab;
    if (sp.ps) p.ps = sp.ps; else delete p.ps;
    if (sp.rows) {
      p.hist ||= {};
      for (const k of ['bat', 'pit']) {
        const keep = (p.hist[k] || []).filter((x) => x[0] < BASE_YEAR);
        p.hist[k] = [...keep, ...(sp.rows[k] || [])];
      }
    }
    if (p.orgId) W.orgs.get(p.orgId)?.players.push(p);
    // older saves: a one-year deal (arbitration or a renewal) kept the average value of the contract before it
    const c = p.contract;
    if (!aavFix && (c?.status === 'signed' || c?.status === 'pre-arbitration')) {
      const rows = (c.years || []).filter((y) => y.salary != null);
      const others = (c.years || []).filter((y) => y.salary == null);
      if (rows.length === 1 && others.every((y) => /^A\d$/.test(y.status || '')) && !c.bonus && c.aav !== rows[0].salary) c.aav = rows[0].salary;
    }
  }
  game.orgStates = new Map(d.orgs.map(([id, st]) => [id, d.v >= 2 ? decode(st) : {
    ...st, level: new Map(st.level), active: new Set(st.active), forty: new Set(st.forty), il: new Map(st.il), dfa: new Map(st.dfa),
  }]));
  if (d.season) {
    const s = d.season;
    game.season = { ...s, records: new Map(s.records), minorRecords: new Map(s.minorRecords), monthSnap: s.monthSnap ? new Map(s.monthSnap) : undefined,
      weekSnap: s.weekSnap ? new Map(s.weekSnap) : undefined, weekRec: s.weekRec ? new Map(s.weekRec) : undefined, moodSnap: s.moodSnap ? new Map(s.moodSnap) : undefined };
    indexSeason(game.season);
  } else game.season = null;
}
