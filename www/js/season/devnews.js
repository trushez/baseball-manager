// The news from development: rare events (a lost fastball, a breakout) as they happen, and the words for
// why a player's year went the way it did.
import { game } from '../state.js';
import { fullName } from '../data/world.js';
import { headline } from './headlines.js';
import { message, about } from './inbox.js';
import { caOf } from './ability.js';
import { BUDGET_WORDS } from './budget.js';

const SAY = {
  velocity: (n) => `${n} has lost the zip on his fastball, and the club's doctors can find no reason.`,
  yips: (n) => `${n} cannot find the plate any more. Those close to him say it is in his head.`,
  late: (n) => `${n} is a late bloomer: scouts who wrote him off say they got him wrong.`,
  breakout: (n) => `${n} has taken a step nobody saw coming.`,
  collapse: (n) => `${n} has fallen away badly, and nobody can say why.`,
};
const HEAD = { velocity: 'LOST HIS FASTBALL', yips: 'THE YIPS', late: 'LATE BLOOMER', breakout: 'BREAKOUT', collapse: 'SUDDEN DECLINE' };
const TITLE = { velocity: 'a lost fastball', yips: 'the yips', late: 'a late bloomer', breakout: 'a breakout year', collapse: 'a sudden decline' };

/** Headlines for the big names and a message for each of your major leaguers. Returns the league talking points. */
export function announce(events) {
  const lead = events.filter((e) => e.p.level === 'MLB' && e.p.orgId && caOf(e.p) >= 90).slice(0, 4);
  for (const e of lead) headline(`${e.p.last.toUpperCase()}: ${HEAD[e.event]}`, e.p.orgId === game.orgId);
  for (const e of events.filter((x) => x.p.orgId === game.orgId && x.p.level === 'MLB')) {
    message({ cat: 'club', player: e.p.id, title: `${fullName(e.p)}: ${TITLE[e.event]}`, body: `${SAY[e.event](fullName(e.p))}\n${about(e.p)}` });
  }
  return lead.map((e) => SAY[e.event](fullName(e.p)));
}

export const WHY_WORDS = {
  young: 'Young, and still growing into his ability', playing: 'Playing nearly every day', work: 'Works hard and looks after himself',
  coach: 'Good coaching', age: 'Past the age his position holds up to', usage: 'Too little playing time', effort: 'Not looking after himself',
  injury: 'A long injury took something from him', velocity: 'Lost the zip on his fastball', yips: 'Lost his control',
  late: 'A late bloomer', breakout: 'A breakout year', collapse: 'A sudden decline',
};

/** Why a player's year went as it did, in a sentence. */
export function whyWords(p) {
  const codes = p.dvWhy || [];
  if (!codes.length) return '';
  return codes.map((c) => (c.startsWith('b:') ? BUDGET_WORDS[c.slice(2)] : WHY_WORDS[c])).filter(Boolean).join('. ').replace(/\.$/, '');
}
