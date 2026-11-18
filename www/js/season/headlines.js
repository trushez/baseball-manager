// Headlines for the Continue screen: the news as it happens around the majors while the days go by,
// in newspaper style. Kept for the current run only (not saved). Sources: remarkable games anywhere in
// the majors, changes at the top of each division, and the day's messages.
import { game } from '../state.js';
import { divisions } from './standings.js';

export function headline(text, mine = false) {
  // a running number: the list is trimmed, so the Continue screen finds new headlines by number, not position
  game.headSeq = (game.headSeq || 0) + 1;
  (game.headlines ||= []).push({ text, mine, date: game.date.getTime(), n: game.headSeq });
  if (game.headlines.length > 60) game.headlines.splice(0, game.headlines.length - 60);
}

const NUM = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six'];
const city = (id) => game.world.clubs.get(id)?.city ?? id;

/** Anything remarkable in a finished major league game. */
export function gameHeadlines(rec, eng) {
  const P = (id) => game.world.players.get(id);
  const mine = rec.home === game.orgId || rec.away === game.orgId;
  const [a, hm] = rec.s;
  const win = hm > a ? rec.home : rec.away, lose = win === rec.home ? rec.away : rec.home;
  for (const [id, L] of eng.stats) {
    const p = P(id);
    if (!p) continue;
    if (L.HR >= 3) headline(`${p.last.toUpperCase()} HITS ${NUM[L.HR]?.toUpperCase() ?? L.HR} HOME RUNS FOR ${city(p.orgId).toUpperCase()}`, mine);
    if (L.H >= 4 && L['2B'] && L['3B'] && L.HR && L.H - L['2B'] - L['3B'] - L.HR > 0) headline(`${p.last.toUpperCase()} HITS FOR THE CYCLE`, mine);
    if (L.pK >= 14) headline(`${p.last.toUpperCase()} STRIKES OUT ${L.pK} AS ${city(p.orgId).toUpperCase()} ${p.orgId === win ? 'WIN' : 'LOSE'}`, mine);
  }
  if (rec.inn >= 13) headline(`${city(win).toUpperCase()} OUTLAST ${city(lose).toUpperCase()} IN ${rec.inn} INNINGS`, mine);
  if (Math.max(a, hm) >= 16) headline(`${city(win).toUpperCase()} ROUT ${city(lose).toUpperCase()} ${Math.max(a, hm)}-${Math.min(a, hm)}`, mine);
  if (eng.events.some((e) => e.type === 'halfEnd' && e.data.walkOff) && rec.post) headline(`WALK-OFF WIN SENDS ${city(rec.home).toUpperCase()} WILD`, mine);
}

/** New leaders at the top of a division. */
export function leaderHeadlines() {
  const S = game.season;
  if (!S || game.phase !== 'regular') return;
  const now = {};
  for (const [div, ids] of divisions()) {
    const r = S.records.get(ids[0]);
    if (r.w + r.l < 10) { now[div] = ids[0]; continue; }
    now[div] = ids[0];
    const before = S.leaders?.[div];
    if (before && before !== ids[0]) headline(`${city(ids[0]).toUpperCase()} TAKE OVER FIRST IN THE ${div.replace('American League', 'AL').replace('National League', 'NL').toUpperCase()}`, ids[0] === game.orgId || before === game.orgId);
  }
  S.leaders = now;
}
