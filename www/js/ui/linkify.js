// Turns the names in a piece of news into links: players open their profiles and clubs open their pages.
// Club names are matched as "City Nickname", the nickname alone, or the city when only one club has it
// (New York, Chicago and Los Angeles each have two, so a bare city there stays plain text).
import { game } from '../state.js';
import { fullName } from '../data/world.js';
import { plink, clink } from './club-ui.js';

let cache = null;
function index() {
  const W = game.world;
  if (cache && cache.W === W && cache.n === W.list.length) return cache;
  const clubs = new Map(), people = new Map();
  const cityCount = new Map();
  for (const c of W.mlb) cityCount.set(c.city, (cityCount.get(c.city) || 0) + 1);
  for (const c of W.mlb) {
    clubs.set(`${c.full ?? `${c.city} ${c.name}`}`, c.org); clubs.set(c.name, c.org);
    if (cityCount.get(c.city) === 1) clubs.set(c.city, c.org);
  }
  const dupes = new Map(); // names shared by more than one player
  for (const p of W.list) {
    if (p.retired) continue;
    const k = fullName(p), old = people.get(k);
    if (old) (dupes.get(k) || dupes.set(k, [old]).get(k)).push(p);
    // two players with one name: the one with a club, then the older record
    if (!old || (!old.orgId && p.orgId)) people.set(k, p);
  }
  return (cache = { W, n: W.list.length, clubs, people, dupes });
}

const WORD = /\p{Lu}(?:[\p{L}\-]|\.(?=\p{L}))*(?:['’](?!s\b)\p{L}+)*/gu;

let hint = new Set();
/** The players the message on screen is about: when two players share a name, the one named here is the one linked. */
export const linkHint = (ids) => { hint = new Set((ids || []).filter((x) => x != null)); };

/** Text to an array of strings and link buttons. `extra` are more player ids to prefer for a name two players share. */
export function linkify(text, extra = []) {
  if (typeof text !== 'string' || !text || !game.world) return text;
  const { clubs, people, dupes } = index();
  const want = (name) => { const list = dupes.get(name); if (!list) return people.get(name); return list.find((p) => extra.includes(p.id)) || list.find((p) => hint.has(p.id)) || people.get(name); };
  const words = [...text.matchAll(WORD)].map((m) => ({ w: m[0], at: m.index, end: m.index + m[0].length }));
  const out = [];
  let last = 0, i = 0;
  while (i < words.length) {
    let hit = null;
    // the longest run of capitalised words, joined by single spaces, that names something
    for (let n = Math.min(4, words.length - i); n >= 1 && !hit; n--) {
      const run = words.slice(i, i + n);
      let ok = true;
      for (let j = 1; j < n; j++) if (text.slice(run[j - 1].end, run[j].at) !== ' ') { ok = false; break; }
      if (!ok) continue;
      const end = run[n - 1].end;
      for (const s of [text.slice(run[0].at, end), text[end] === '.' ? text.slice(run[0].at, end + 1) : null]) { // "Jr." keeps its full stop
        if (!s || hit) continue;
        if (clubs.has(s)) hit = { n, s, club: clubs.get(s) };
        else if (n >= 2 && people.has(s)) hit = { n, s, p: want(s) };
      }
    }
    if (!hit) { i++; continue; }
    const start = words[i].at;
    if (start > last) out.push(text.slice(last, start));
    out.push(hit.club ? clink(hit.club, hit.s) : plink(hit.p, hit.s));
    last = start + hit.s.length;
    i += hit.n;
  }
  if (!out.length) return text;
  if (last < text.length) out.push(text.slice(last));
  return out;
}
