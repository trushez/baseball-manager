// The inbox: news for you, newest last. Messages can carry a player to look at and can stop Continue.
import { game } from '../state.js';
import { headline } from './headlines.js';
import { lastSeason, isPitcher, fullName } from '../data/world.js';
import { honourSummary } from '../data/honours.js';
import { dayNo, absDay } from './calendar.js';

const rate3 = (v) => (v == null ? '' : v.toFixed(3).replace(/^0/, ''));
/** A sentence on a player's most recent season, for message bodies. */
export function about(p) {
  if (!p) return '';
  const s = lastSeason(p);
  const lv = { MLB: 'in the majors', AAA: 'at Triple-A', AA: 'at Double-A', 'A+': 'at High-A', A: 'at Single-A', R: 'in the Rookie league' };
  const where = s ? (s.level.split('/').map((x) => lv[x] || x).join(' and ')) : '';
  const age = p.age ? `${fullName(p)}, ${p.age}, ` : `${fullName(p)} `;
  if (!s) return `${age}has no recorded season yet.`;
  const hon = honourSummary(p, 2);
  const tail = hon ? ` His honours: ${hon}.` : '';
  if (isPitcher(p)) return `${age}pitched ${Math.round(s.ip)} innings ${where} in ${s.season} with a ${s.era?.toFixed(2) ?? '-'} ERA, ${s.so} strikeout${s.so === 1 ? '' : 's'} and ${s.bb} walk${s.bb === 1 ? '' : 's'}${s.sv ? ` and ${s.sv} save${s.sv === 1 ? '' : 's'}` : ''}.${tail}`;
  return `${age}hit ${rate3(s.avg)} with ${s.hr} home runs and a ${rate3(s.ops)} OPS in ${s.pa} plate appearances ${where} in ${s.season}.${tail}`;
}

let seq = 0;

// Two players can share a name. A message only holds text, so when it names such a player we record at once which one it means,
// by who has just moved, who is on your club, or the player the message is about; the inbox links that one.
let dupCache = null;
function sameNames() {
  const W = game.world;
  if (dupCache && dupCache.W === W && dupCache.n === W.list.length) return dupCache.map;
  const all = new Map();
  for (const p of W.list) { if (p.retired) continue; const k = fullName(p); (all.get(k) || all.set(k, []).get(k)).push(p); }
  const map = new Map([...all].filter(([, l]) => l.length > 1));
  dupCache = { W, n: W.list.length, map };
  return map;
}
function pinNames(msg) {
  if (!game.world) return;
  const map = sameNames();
  if (!map.size) return;
  const text = [msg.title, msg.body, ...(msg.parts || []).flatMap((x) => [x.p, x.q])].filter((x) => typeof x === 'string').join('\n');
  const today = dayNo(game.date), ids = new Set(msg.ids || []);
  for (const [name, list] of map) {
    if (!text.includes(name) || list.some((p) => ids.has(p.id))) continue;
    const score = (p) => (msg.player === p.id ? 4 : 0) + (p.mv?.at(-1)?.d === today ? 3 : 0) + (p.orgId === game.orgId ? 2 : 0);
    const ranked = list.map((p) => [score(p), p]).sort((a, b) => b[0] - a[0]);
    if (ranked[0][0] > 0 && ranked[0][0] > ranked[1][0]) ids.add(ranked[0][1].id);
  }
  if (ids.size) msg.ids = [...ids];
}

/**
 * @param {{cat:'club'|'injury'|'league'|'result', title:string, body?:string, player?:string,
 *          important?:boolean, stop?:boolean}} m
 */
export function message(m) {
  seq = Math.max(seq, ...game.inbox.map((x) => x.id), 0) + 1;
  const msg = { id: seq, date: game.date.getTime(), read: !!m.minor, ...m }; // minor items (daily farm scores, routine moves) arrive read and stay out of the All tab
  pinNames(msg);
  game.inbox.push(msg);
  // every message is also a headline on the Continue screen
  if (!m.quiet && ['result', 'injury', 'league'].includes(m.cat)) {
    headline(m.headline || m.title, m.cat !== 'league');
  }
  if (game.inbox.length > 1500) game.inbox.splice(0, game.inbox.length - 1500);
  return msg;
}

const handlers = {};
/** Register how a kind of delayed item turns into messages when its day comes (the item is plain data, so it saves with the game). */
export const onLater = (kind, fn) => { handlers[kind] = fn; };

/** Post a message some days from now (the follow-up coverage of a big story). It is saved with the game. */
export function later(days, m) {
  (game.mailLater ||= []).push({ on: absDay(game.date) + days, m });
}
/** Deliver what is due. Called once a day. */
export function deliverLater(date = game.date) {
  const q = game.mailLater;
  if (!q?.length) return;
  const today = absDay(date);
  const due = q.filter((x) => x.on <= today);
  game.mailLater = q.filter((x) => x.on > today);
  for (const x of due) { if (x.m.kind) handlers[x.m.kind]?.(x.m); else message(x.m); }
}

/** The newest message id: messages after it are the ones sent since (the inbox is trimmed, so not an index). */
export const lastId = () => game.inbox.at(-1)?.id ?? 0;
export const since = (id) => game.inbox.filter((m) => m.id > id);

export const unread = (cat) => game.inbox.filter((m) => !m.read && (!cat || m.cat === cat)).length;
