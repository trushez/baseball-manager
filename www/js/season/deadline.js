// The trade deadline: a preview two weeks out, deadline day, and the morning after with who moved. The clubs'
// buying and selling itself is in trade.js (trialsPer), which already picks up in the last twelve days.
import { game } from '../state.js';
import { message } from './inbox.js';
import { dayNo, keyDates, dateWords } from './calendar.js';
import { gmPlan } from './gms.js';
import { value } from './value.js';
import { fullName, mainPos } from '../data/world.js';
import { ledger, nowValue } from './ledger.js';
import { schedule } from './trade.js';
import { seeds, divisions } from './standings.js';
import { orgState } from '../state.js';

const city = (id) => game.world.clubs.get(id)?.city ?? id;
const flag = (k) => { const f = ledger().flags; if (f[k]) return false; f[k] = 1; return true; };

export function deadlineDay(date = game.date) {
  if (game.phase !== 'regular') return;
  const year = game.year, dl = dayNo(keyDates(year).deadline), d = dayNo(date);
  if (d === dl - 14 && flag(`dl${year}p`)) preview(year);
  else if ([dl - 7, dl - 3, dl - 1].includes(d) && flag(`dl${year}k${dl - d}`)) runUp(year, dl - d);
  else if (d === dl + 1 && flag(`dl${year}a`)) aftermath(year, dl);
}

function preview(year) {
  const sellers = game.world.mlb.map((c) => c.org).filter((id) => id !== game.orgId && gmPlan(id) === 'rebuild');
  const buyers = game.world.mlb.filter((c) => c.org !== game.orgId && gmPlan(c.org) === 'contend').length;
  const cand = [];
  for (const id of sellers) for (const p of game.world.orgs.get(id).players) if (p.level === 'MLB' && !p.retired && p.age >= 28 && value(p) >= 50) cand.push(p);
  cand.sort((a, b) => value(b) - value(a));
  const parts = [{ p: `The trade deadline is on ${dateWords(keyDates(year).deadline)}, two weeks from now. ${buyers} clubs are pushing for the playoffs and ${sellers.length} are selling. The clubs that are out of it list veterans and ask for prospects, and the ones in the race get more willing to pay for them as the day gets close.` }];
  if (cand.length) parts.push({ p: 'The best players on selling clubs, the ones most likely to be moved:' }, { head: ['Player', 'Club', 'Pos', 'Age', 'Value'], rows: cand.slice(0, 8).map((p) => [{ pid: p.id, t: fullName(p) }, city(p.orgId), mainPos(p), String(p.age), String(Math.round(value(p)))]) });
  parts.push({ p: 'To buy, make an offer from Transfers. To sell, list a player from his profile and the clubs will come to you with offers. The Rumour Mill tab shows who is being talked about.' });
  message({ cat: 'club', important: true, stop: true, title: 'The deadline is two weeks away', parts });
}

function aftermath(year, dl) {
  const L = ledger().moves.filter((m) => m.t === 'trade' && m.year === year && m.day >= dl - 14 && m.day <= dl);
  if (!L.length) { message({ cat: 'league', quiet: true, title: 'The deadline passes quietly', body: 'No trades were made in the last two weeks before the deadline.' }); return; }
  const trades = new Set(L.map((m) => `${m.day}|${[m.to, m.from].sort().join('-')}`)).size;
  const big = L.filter((m) => m.v >= 52).sort((a, b) => b.v - a.v).slice(0, 8);
  const mine = L.filter((m) => m.to === game.orgId || m.from === game.orgId);
  const net = new Map();
  for (const m of L) { net.set(m.to, (net.get(m.to) || 0) + Math.max(0, m.v - 44)); net.set(m.from, (net.get(m.from) || 0) - Math.max(0, m.v - 44)); }
  const gain = [...net.entries()].sort((a, b) => b[1] - a[1]);
  const parts = [{ p: `The deadline has passed. In the last two weeks clubs made ${trades} ${trades === 1 ? 'trade' : 'trades'}, moving ${L.length} players. Trades reopen after the World Series.` }];
  if (big.length) parts.push({ head: ['Player', 'From', 'To', 'Value'], rows: big.map((m) => [{ pid: m.pid, t: fullName(game.world.players.get(m.pid)) }, city(m.from), city(m.to), String(m.v)]) });
  if (gain.length > 1) parts.push({ p: `On the value of the players moved, ${city(gain[0][0])} came out furthest ahead and ${city(gain.at(-1)[0])} gave up the most. That counts the talent on the day, not how it turns out; the Moves tab under Transfers follows each deal afterwards.` });
  parts.push({ p: mine.length ? `Your club was in ${mine.length} player ${mine.length === 1 ? 'move' : 'moves'} in this window. The Moves tab under Transfers follows them.` : 'You made no trades in this window.' });
  message({ cat: 'club', important: true, title: `After the deadline: ${trades} ${trades === 1 ? 'trade' : 'trades'} made`, parts });
}

/** The deadline's date as a day number, and whether today is deadline day. */
export const deadlineNo = (year = game.year) => dayNo(keyDates(year).deadline);
export const isDeadlineDay = () => game.phase === 'regular' && dayNo(game.date) === deadlineNo();

/** The assistant's read of the club, in plain sentences, for the run-up and for deadline day. */
export function clubPicture() {
  const me = game.orgId, o = game.world.orgs.get(me), st = orgState(), W = game.world;
  const R = game.season?.records;
  const rec = R?.get(me) || { w: 0, l: 0 }, lg = W.orgs.get(me).club.league;
  const ok = !!R && W.mlb.every((c) => R.get(c.id)?.w != null);
  const inPo = ok ? seeds(lg).includes(me) : false;
  const div = ok ? [...divisions(lg).values()].find((l) => l.includes(me)) : [me];
  const lead = (ok && R.get(div[0])) || rec;
  const gb = div[0] === me ? 0 : ((lead.w - rec.w) + (rec.l - lead.l)) / 2;
  const left = 162 - rec.w - rec.l;
  const stand = `You are ${rec.w}-${rec.l} with ${left} games left. ${inPo ? (gb === 0 ? 'You lead your division.' : `You hold a playoff place, ${gb} games behind the division leaders.`) : `You are outside the playoff places, ${gb} games behind the division leaders.`}`;
  const byId = (id) => o.players.find((x) => x.id === id);
  const reg = [...st.lineupR.map((x) => [byId(x.id), x.pos]), ...st.rotation.map((id, i) => [byId(id), `SP${i + 1}`])].filter(([p]) => p);
  const weak = reg.map(([p, pos]) => ({ p, pos, v: nowValue(p) })).sort((a, b) => a.v - b.v).slice(0, 3);
  const exp = o.players.filter((p) => p.level === 'MLB' && st.active.has(p.id) && schedule(p).length <= 1 && nowValue(p) >= 46).sort((a, b) => nowValue(b) - nowValue(a)).slice(0, 5).map((p) => ({ p, pos: mainPos(p), v: nowValue(p) }));
  const sell = [];
  for (const c of W.mlb) if (c.org !== me && gmPlan(c.org) === 'rebuild') for (const p of W.orgs.get(c.org).players) if (p.level === 'MLB' && !p.retired && p.age >= 28 && nowValue(p) >= 52) sell.push(p);
  sell.sort((a, b) => nowValue(b) - nowValue(a));
  const buyers = W.mlb.filter((c) => c.org !== me && gmPlan(c.org) === 'contend').length;
  return { stand, inPo, weak, exp, sell: sell.slice(0, 4).map((p) => ({ p, pos: mainPos(p), v: nowValue(p) })), buyers, rec, left };
}

const names = (l) => l.map((x) => `${fullName(x.p || x)}${x.pos ? ` (${x.pos}, rated ${x.v})` : ''}`).join(', ');

/** The stops before the deadline: how the club stands, where it is thin, who is about to expire. */
function runUp(year, daysLeft) {
  const c = clubPicture();
  const when = daysLeft === 1 ? 'tomorrow' : `in ${daysLeft} days`;
  const parts = [{ p: `The trade deadline is ${when}, on ${dateWords(keyDates(year).deadline)}. ${c.stand}` }];
  if (c.weak.length) parts.push({ p: `Your thinnest spots among the regulars: ${names(c.weak)}.` });
  if (c.exp.length) parts.push({ p: `Contracts that run out this year: ${names(c.exp)}. ${c.inPo ? 'If they matter to the run, keep them; otherwise' : 'If you are not going to make the playoffs,'} the deadline is the last day to get something for them.` });
  if (c.sell.length) parts.push({ p: `Clubs selling have: ${names(c.sell)}.` });
  parts.push({ p: 'Make your offers from Transfers. On deadline day itself Continue opens the deadline room, where the day plays out hour by hour and you can trade as it goes.' });
  message({ cat: 'club', important: true, stop: true, title: daysLeft === 1 ? 'The trade deadline is tomorrow' : `The trade deadline is ${when}: your assistant's view`, parts });
}
