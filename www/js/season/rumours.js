// Rumours. Stories in the news about who might be moved, from three outlets of different reliability: a national
// insider who is usually right, the beat writers who are often right, and a fan forum that is mostly noise. Some
// stories come from deals the computer clubs really are working on and some are invented. The game keeps each
// outlet's record, so you can learn whom to trust. A story about one of your players unsettles him.
import { game, orgState } from '../state.js';
import { Rng } from '../core/rng.js';
import { fullName } from '../data/world.js';
import { dayNo, keyDates } from './calendar.js';
import { message } from './inbox.js';
import { headline } from './headlines.js';
import { value } from './value.js';

const today = () => dayNo(game.date);
const org = (id) => game.world.orgs.get(id);
const P = (id) => game.world.players.get(id);

export const OUTLETS = {
  insider: { name: 'Marcus Hale, national insider', short: 'The national insider', note: 'Well connected and usually right.', real: 0.4, fake: 0.1 },
  beat: { name: 'The beat writers', short: 'The beat writers', note: 'Close to the clubs and often right, though they like a story.', real: 0.4, fake: 0.3 },
  forum: { name: 'The fan forum', short: 'The fan forum', note: 'Everybody knows somebody. Mostly noise.', real: 0.2, fake: 0.6 },
};

export const book = () => (game.rumours ||= { items: [], nextId: 1, last: 0 });

const pickOutlet = (rng, real) => {
  return rng.weighted(Object.fromEntries(Object.entries(OUTLETS).map(([k, o]) => [k, real ? o.real : o.fake])));
};

const LINES = {
  insider: ['Sources say {to} are closing in on {p} and {from} are listening.', 'I am hearing {to} have made a strong approach for {p}.', 'League sources: {p} to {to} is moving fast.'],
  beat: ['{to} have been watching {p} closely and {from} may be ready to talk.', '{to} are said to like {p}. Nothing is close, but they have called.', '{from} are open to moving {p}, and {to} are first in line.'],
  forum: ['A guy I know at the stadium says {p} is going to {to}. Done deal.', '{p} to {to}!! Trust me.', 'Hearing {to} want {p} bad. Could be this week.'],
};

/** A new story. `real` ones come from a deal under way (dealId) and are proved right when it is done. */
export function addRumour({ pid, from, to, real = false, dealId = null, outlet, rng, state }) {
  const B = book();
  const p = P(pid);
  if (!p || !from || !to) return null;
  if (B.items.some((x) => x.pid === pid && x.to === to && x.state === 'open')) return null;
  const o = outlet || pickOutlet(rng || new Rng(`rum-${today()}-${pid}`), real);
  const r = rng || new Rng(`rumline-${today()}-${pid}-${to}`);
  const text = r.pick(LINES[o]).replace('{p}', fullName(p)).replace('{to}', org(to).club.city).replace('{from}', org(from).club.city);
  const it = { id: B.nextId++, day: today(), outlet: o, pid, from, to, text, state: state || 'open', dealId, reported: false, expires: today() + 21 };
  B.items.push(it);
  if (B.items.length > 400) B.items.splice(0, B.items.length - 400);
  if (p.orgId === game.orgId) unsettle(p, it);
  return it;
}

/** A story about one of your players: it gets to him and to the fans. */
function unsettle(p, it) {
  p.mood = Math.max(0, (p.mood ?? 60) - 3);
}

/** A player has moved: stories that said he would go to that club were right. */
export function moved(pid, toOrg) {
  for (const it of book().items) if (it.state === 'open' && it.pid === pid && it.to === toOrg) it.state = 'hit';
}
/** A deal fell through: stories tied to it were wrong. */
export function failed(dealId) {
  for (const it of book().items) if (it.state === 'open' && it.dealId === dealId) it.state = 'miss';
}
/** An offer for one of your players from a club the stories named. */
export function offered(pid, fromOrg) { moved(pid, fromOrg); }

/** The leak of a lowball: your offer was turned down and the story is out. */
export function leak(offer, gmCity) {
  const p = P(offer.get[0] ?? offer.give[0]);
  if (!p) return;
  const mine = org(game.orgId).club.city;
  headline(`SOURCES: ${mine.toUpperCase()} LOWBALLED FOR ${p.last.toUpperCase()}`);
  message({ cat: 'league', title: `Leak: ${mine}'s offer for ${fullName(p)} called a lowball`, body: `${OUTLETS.insider.name} reports that ${mine} made ${gmCity} an offer for ${fullName(p)} that was not taken seriously. The talks are now public.` });
  const B = book();
  B.items.push({ id: B.nextId++, day: today(), outlet: 'insider', pid: p.id, from: offer.with, to: game.orgId, text: `${mine} lowballed ${gmCity} for ${fullName(p)}.`, state: 'hit', reported: true, expires: today(), leak: true });
}

/** Per-outlet record: { n, right, wrong, open }. */
export function tally() {
  const out = {};
  for (const k of Object.keys(OUTLETS)) out[k] = { right: 0, wrong: 0, open: 0 };
  for (const it of book().items) {
    const t = out[it.outlet];
    if (it.state === 'hit') t.right++; else if (it.state === 'miss') t.wrong++; else t.open++;
  }
  return out;
}

const digestDay = (date) => {
  return date.getDay() === 1 && game.phase !== 'postseason';
};

/** Each day while trades are open: stories age, a few invented ones appear, and the digest goes out. */
export function rumourDay(date = game.date) {
  const B = book(), d = dayNo(date);
  for (const it of B.items) if (it.state === 'open' && it.expires < d) it.state = 'miss';
  const rng = new Rng(`rumours-${d}-${game.year}-${game.orgId}`);
  const dl = dayNo(keyDates(game.year).deadline);
  const rate = game.phase === 'regular' ? (d > dl - 12 ? 2 : 0.5) : date.getMonth() === 11 && date.getDate() >= 6 && date.getDate() <= 12 ? 3 : 1;
  const n = Math.floor(rate) + (rng.chance(rate - Math.floor(rate)) ? 1 : 0);
  const clubs = game.world.mlb.map((c) => c.org);
  for (let i = 0; i < n; i++) {
    const from = rng.pick(clubs.filter((c) => c !== game.orgId)), to = rng.pick(clubs.filter((c) => c !== from));
    const mineToo = rng.chance(0.12);
    const so = org(mineToo ? game.orgId : from);
    const pool = so.players.filter((p) => p.level === 'MLB' && value(p) >= 48).sort(() => rng.next() - 0.5);
    const p = pool[0];
    if (p && to !== so.id) addRumour({ pid: p.id, from: so.id, to, real: false, rng });
  }
  if (digestDay(date)) sendDigest(date);
}

function sendDigest(date) {
  const B = book();
  const fresh = B.items.filter((x) => !x.reported && x.state === 'open' && !x.leak);
  const short = game.shortlist || new Set();
  // a quiet week's talk waits for the next digest unless it touches your players or your shortlist
  if (!fresh.length || (fresh.length < 4 && !fresh.some((x) => short.has(x.pid) || P(x.pid)?.orgId === game.orgId))) return;
  for (const x of fresh) x.reported = true;
  const top = fresh.slice().sort((x, y) => (short.has(y.pid) - short.has(x.pid)) || ((P(y.pid)?.orgId === game.orgId) - (P(x.pid)?.orgId === game.orgId))).slice(0, 8);
  message({
    cat: 'league', quiet: true, title: `Rumour recap: ${fresh.length} ${fresh.length === 1 ? 'story' : 'stories'} this week`,
    parts: [{ p: 'The talk around the league this week, including anything about your own players. Check the Rumour Mill under Transfers to see who has been right before.' },
      { head: ['Outlet', 'Story'], rows: top.map((x) => [OUTLETS[x.outlet].short, `${x.text}${short.has(x.pid) ? ' (on your shortlist)' : ''}`]) }],
  });
}
