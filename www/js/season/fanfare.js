// The coverage of a big signing. A deal this size is a story for days: the unveiling and the city's excitement,
// then the doubters (the bill, the length, the arm, the payroll), then the ticket office and the owner. The
// follow-ups are queued as plain data (inbox.later) so they survive a save, and are written on the day with
// whatever the club's books say by then. The excitement also lifts the crowds for about two months (game.buzz).
import { game } from '../state.js';
import { Rng } from '../core/rng.js';
import { fullName, isPitcher, money, mainPos } from '../data/world.js';
import { value } from './value.js';
import { message, later, onLater, about } from './inbox.js';
import { voices } from './media.js';
import { capacity } from './crowd.js';
import { expected, room, taxFor } from './finance.js';
import { absDay } from './calendar.js';

const W = () => game.world;

/** Is this a deal the city will talk about? About $100M in all, or $25M a year. */
export const isBlockbuster = (salary, years) => salary * years >= 100e6 || salary >= 25e6;

/** His place among the league's players of his kind, by current value: 1 is the best. */
function rankOf(p) {
  const pit = isPitcher(p), v = value(p);
  let n = 1;
  for (const q of W().list) if (q !== p && isPitcher(q) === pit && value(q) > v) n++;
  return n;
}

const NUM = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];
const Num = (y) => (NUM[y] ? NUM[y][0].toUpperCase() + NUM[y].slice(1) : String(y));
const yearsWord = (y) => (y === 1 ? 'one-year' : `${y}-year`);
const quote = {
  pit: ['I wanted to be somewhere that wants to win. When {city} called, there was nothing to think about.', 'It is a lot of money and a lot of responsibility. I plan to earn every dollar of it.', 'I looked at what they are building here and I wanted to be the one on the mound when it happens.'],
  bat: ['I wanted to be somewhere that wants to win. When {city} called, there was nothing to think about.', 'It is a lot of money and a lot of responsibility. I plan to earn every dollar of it.', 'I saw the crowds at the ballpark and I wanted to play in front of them every night.'],
};

/** Start the coverage of a signing by your own club. Does nothing for an ordinary deal. */
export function announceBlockbuster(orgId, p, { salary, years }) {
  if (!isBlockbuster(salary, years)) return false;
  const o = W().orgs.get(orgId), c = o.club;
  const rank = rankOf(p);
  const franchise = rank <= 3 || salary * years >= 200e6;
  const rng = new Rng(`fanfare-${p.id}-${game.date.getTime()}-${game.luck}`);
  const total = salary * years;
  const cap = capacity(orgId);
  const holders = Math.round((cap * 0.38) / 100) * 100;
  const crowd = franchise ? 'Thousands of' : 'Hundreds of';
  const kind = isPitcher(p) ? 'pitcher' : 'hitter';
  const best = rank === 1 ? `the best ${kind} in the league on our figures` : rank <= 5 ? `one of the five best ${kind}s in the league on our figures` : `a ${kind} the league respects`;
  const q = rng.pick(quote[isPitcher(p) ? 'pit' : 'bat']).replaceAll('{city}', c.city).replace(/\.$/, '');
  const gone = franchise && rng.chance(0.7) ? ` The team store sold out of ${p.last} shirts before the afternoon was over.` : '';
  message({
    cat: 'club', important: true, player: p.id,
    title: franchise ? `${c.city} turns out for ${fullName(p)}` : `${fullName(p)} is unveiled`,
    body: `${fullName(p)}, ${p.age}, was unveiled at the ballpark this afternoon after signing a ${yearsWord(years)} deal worth ${money(total)} (${money(salary)} a year). He is ${best}.\n\n${crowd} fans gathered outside for the announcement, and the ticket office reported a rush of calls from the moment the news broke.${gone}\n\n${about(p)}\n\n"${q}," he told the room.\n\nInside the club there is no doubt. Nobody has forgotten what ${money(total)} means all the same: ${years === 1 ? 'a year' : `${years} years`}, and no way back.`,
    voices: voices(orgId, 'blockbuster', { p, x: money(total), n: years }, 0.95),
  });
  // buzz in the stands, and the follow-ups
  (game.buzz ||= {})[orgId] = { v: franchise ? 0.3 : 0.18, from: absDay(game.date), days: 60 };
  later(1, { kind: 'fanfare2', orgId, pid: p.id, salary, years, franchise, rank });
  later(3, { kind: 'fanfare3', orgId, pid: p.id, salary, years, franchise, holders });
  return true;
}

/** The next day: the doubters. */
onLater('fanfare2', ({ orgId, pid, salary, years, franchise }) => {
  const p = W().players.get(pid);
  if (!p || p.orgId !== orgId) return;
  const c = W().orgs.get(orgId).club, total = salary * years, yr = game.year;
  const pay = expected(orgId, yr), left = room(orgId, yr), tax = taxFor(orgId, yr, pay);
  const endAge = p.age + years - 1;
  const lines = [];
  lines.push(left < 0
    ? `The signing leaves the club ${money(-left)} over its payroll budget for ${yr}, and the owner's office will have noticed.`
    : `After the signing the club has ${money(left)} left of its ${yr} payroll budget${left < 25e6 ? ', which does not leave much for anything else' : ''}.`);
  if (tax.over) lines.push(`The payroll is now ${money(tax.over)} over the luxury tax line, which will cost the owner about ${money(tax.tax)}.`);
  else if (tax.threshold - pay < 20e6) lines.push(`That is only ${money(Math.max(0, tax.threshold - pay))} under the luxury tax line, so the next big move will be taxed.`);
  lines.push(isPitcher(p)
    ? `${years >= 4 ? `${Num(years)} years` : 'The years'} is a long time to commit to an arm. He will be ${endAge} when the deal ends, and one bad injury changes the whole picture.`
    : `He will be ${endAge} when the deal ends, and bats rarely age as kindly as the contract assumes.`);
  message({
    cat: 'club', player: p.id,
    title: `${c.city} is talking: is ${p.last} worth ${money(total)}?`,
    body: `A day on, the celebration has given way to the arithmetic.\n\n${lines.join('\n\n')}\n\nThe club's view is that stars sell tickets and win games. The doubters' view is that this is a lot of the future spent on one player.`,
    voices: voices(orgId, 'blockbusterDoubt', { p, x: money(total), n: years }, 0.95),
  });
});

/** Three days on: the ticket office, the sponsors and the owner. */
onLater('fanfare3', ({ orgId, pid, salary, years, franchise, holders }) => {
  const p = W().players.get(pid);
  if (!p || p.orgId !== orgId) return;
  const c = W().orgs.get(orgId).club;
  const rng = new Rng(`fanfare3-${pid}-${game.luck}`);
  const sold = Math.round((holders * (franchise ? 0.05 + rng.next() * 0.04 : 0.02 + rng.next() * 0.03)) / 10) * 10;
  const left = room(orgId, game.year);
  const owner = left >= 0
    ? `The owner's office says it is delighted, and that the bill was always meant to be paid by the crowds ${p.last} brings in.`
    : `The owner's office has said the club will "find a way" to carry ${money(-left)} over budget, which fans took as a promise and the finance people took as a warning.`;
  message({
    cat: 'club', player: p.id,
    title: `Ticket office: ${sold.toLocaleString('en-US')} new season tickets since ${p.last} signed`,
    body: `${c.city}'s ticket office has sold ${sold.toLocaleString('en-US')} new season tickets in the three days since ${fullName(p)} signed, and says single-game sales are well ahead of last year. ${franchise ? `Merchandise sales for the week are the best the club can remember, and a sponsor has asked about a ${p.last} night.` : `Merchandise is up and sponsors have been in touch.`}\n\n${owner}\n\nThe crowds should be bigger for the next couple of months. Whether they stay that way depends on what ${p.last} does once the games count.`,
  });
});
