// The media: each club's own voices (a radio phone-in, a podcast, the beat writer and the fan forum) plus a
// few national ones. They add a quote or two to messages that are sent anyway (injuries, results, signings,
// the weekly round-up, awards, streaks) rather than new messages. All outlets and people are invented.
import { game } from '../state.js';
import { Rng } from '../core/rng.js';
import { fullName, isPitcher } from '../data/world.js';
import { value } from './value.js';
import { pct } from './standings.js';
import { honourCount } from '../data/honours.js';
import { absDay } from './calendar.js';

const W = () => game.world;

// ---------- the outlets ----------

const SHOWS = ['The Bullpen', 'Extra Innings', 'Full Count', 'The Seventh-Inning Stretch', 'Talking Baseball', 'The Dugout', 'Afternoon Drive', 'The Hot Corner', 'Ball Four Tonight', 'The Clubhouse'];
const PAPERS = ['Morning Ledger', 'Evening Courier', 'Star-Sentinel', 'Daily Clarion', 'Gazette-Leader', 'Ledger-Dispatch', 'Courier-Post', 'Evening Standard-Times'];
const POD = ['{n} Talk', 'Inside the {n}', 'The {n} Report', '{n} After Dark', 'Box Score: a {n} podcast', 'The {n} Corner', 'Bleeding {n}'];
const FIRST = ['Mike', 'Dan', 'Tony', 'Jen', 'Kevin', 'Sarah', 'Marcus', 'Pete', 'Rachel', 'Chris', 'Gil', 'Dave', 'Nina', 'Sal', 'Vic', 'Ray', 'Jo', 'Ernie', 'Luis', 'Kate'];
const LAST = ['Hollis', 'Brennan', 'Okafor', 'Delgado', 'Pruitt', 'Szabo', 'Marchetti', 'Yates', 'Kowalski', 'Ferraro', 'Lindgren', 'Abernathy', 'Quinlan', 'Tran', 'Castillo', 'Rourke', 'Haverford', 'Bianchi', 'Stroud', 'McAllister'];
const HANDLES = ['Section112', 'BleacherBum77', 'OldTimer1954', 'NineInnings', 'KnuckleCurve', 'DugoutDave', 'UpperDeckUmp', 'SeventhInning', 'GrandSlamGran', 'RallyCap88', 'LeftFieldLou', 'BoxSeatBetty', 'FoulPole', 'TwoOutRally', 'CheapSeats'];

/** A club's voices, fixed for the career. */
export function outlets(orgId) {
  const o = W().orgs.get(orgId);
  if (!o) return null;
  const rng = new Rng(`media-${orgId}`);
  const person = () => `${rng.pick(FIRST)} ${rng.pick(LAST)}`;
  const east = ['NYY', 'NYM', 'BOS', 'PHI', 'BAL', 'WSH', 'ATL', 'MIA', 'TB', 'TOR', 'PIT', 'CLE', 'DET', 'CIN', 'CHC', 'CWS', 'MIL'].includes(orgId);
  const letters = 'ABCDEFGHJKLMNPRSTVWXZ';
  const call = (east ? 'W' : 'K') + Array.from({ length: 3 }, () => letters[rng.int(0, letters.length - 1)]).join('');
  const n = o.club.name;
  return {
    radio: { host: person(), outlet: `${call} ${rng.int(54, 160) * 10} "${rng.pick(SHOWS)}"` },
    podcast: { host: person(), outlet: rng.pick(POD).replace('{n}', n) },
    writer: { host: person(), outlet: `the ${o.club.city} ${rng.pick(PAPERS)}` },
    forum: { outlet: `the ${n} fan forum`, handles: [rng.pick(HANDLES), rng.pick(HANDLES), rng.pick(HANDLES)] },
  };
}
const NATIONAL = [
  { host: 'Walt Ferraro', outlet: 'Diamond Digest' },
  { host: 'Nina Okafor', outlet: '"The Baseball Hour" on national radio' },
  { host: 'Gil Abernathy', outlet: 'the Big Leagues Weekly podcast' },
  { host: 'ThreeAndTwo Baseball', outlet: 'threeandtwobaseball.com' },
];

// ---------- facts the voices use ----------

/** His last ten games as a hitter, or last three outings as a pitcher, in numbers and words. */
export function recentForm(p) {
  if (isPitcher(p)) {
    const log = (p.gp || []).filter((g) => g[2] === 'MLB');
    const starts = log.filter((g) => g[3]).slice(-3);
    const asStarter = starts.length >= 2 && log.slice(-5).filter((g) => g[3]).length >= 2;
    const use = asStarter ? starts : log.slice(-6);
    if (use.length < (asStarter ? 2 : 5)) return null;
    const outs = use.reduce((a, g) => a + g[4], 0), er = use.reduce((a, g) => a + g[7], 0), k = use.reduce((a, g) => a + g[9], 0);
    if (outs < 12) return null;
    const era = (er * 27) / outs;
    const ip = `${Math.floor(outs / 3)}${outs % 3 ? `.${outs % 3}` : ''}`;
    const what = asStarter ? `his last ${use.length} starts` : `his last ${use.length} outings`;
    const ers = er === 0 ? 'no earned runs' : `${er} earned run${er === 1 ? '' : 's'}`;
    return { era, outs, k, text: `${ers} in ${ip} innings over ${what}`, hot: asStarter ? era <= 1.6 && outs >= 15 : er === 0 && outs >= 18, cold: asStarter ? era >= 7 : era >= 9 && outs >= 15 };
  }
  const log = (p.gb || []).filter((g) => g[2] === 'MLB').slice(-10);
  if (log.length < 7) return null;
  const ab = log.reduce((a, g) => a + g[3], 0), hh = log.reduce((a, g) => a + g[5], 0), hr = log.reduce((a, g) => a + g[8], 0), rbi = log.reduce((a, g) => a + g[9], 0), k = log.reduce((a, g) => a + g[11], 0);
  if (ab < 25) return null;
  const avg = hh / ab;
  const extra = [hr ? `${hr} homer${hr > 1 ? 's' : ''}` : '', rbi >= 8 ? `${rbi} RBI` : ''].filter(Boolean).join(' and ');
  return { avg, hr, k, ab, h: hh, text: `${hh} for his last ${ab}${extra ? ` with ${extra}` : ''}`, hot: avg >= 0.37 || (hr >= 4 && avg >= 0.28), cold: avg <= 0.14 || (avg <= 0.17 && k >= ab * 0.4) };
}

/** Games in a row he has started, from his game log (every day he played, no day missed by his club). */
export function straight(p) {
  const log = (p.gb || []).filter((g) => g[2] === 'MLB').map((g) => g[0]);
  if (!log.length) return 0;
  const games = new Set(game.season?.games.filter((g) => g.level === 'MLB' && g.s && (g.home === p.orgId || g.away === p.orgId)).map((g) => g.d));
  const days = [...games].sort((a, b) => b - a);
  let n = 0;
  for (const d of days) { if (log.includes(d)) n++; else break; }
  return n;
}

const contending = (orgId) => { const r = game.season?.records.get(orgId); return r && r.w + r.l >= 20 && pct(r) >= 0.53; };
const struggling = (orgId) => { const r = game.season?.records.get(orgId); return r && r.w + r.l >= 20 && pct(r) <= 0.45; };
const star = (p) => value(p) >= 60 || honourCount(p, 'All-Star') >= 3;
const salary = (p) => p.contract?.aav || 0;

// ---------- what they say ----------

// topic -> voice -> lines. {name} full name, {last}, {nick} club name, {city}, {form} recent form words,
// {days} time out, {n} a number, {x} the injury or record, {handle} a forum name
const LINES = {
  injury: {
    writer: {
      star: ['Losing {last} for {days} is the worst news {city} could have had. There is nobody in the organisation who does what he does.', 'This one hurts. {last} is the heartbeat of this lineup, and {days} without him will test the depth of the roster like nothing else this year.'],
      regular: ['{last} going down for {days} leaves a hole, but not a crater. Somebody gets a chance now, and the next few weeks will tell us a lot about the bench.', 'The {nick} can absorb {days} without {last}, but only if the replacements hit. That is a big if.', 'Nobody will call {last} irreplaceable, but {days} is long enough to cost the {nick} games they had pencilled in as wins.', 'The timing could be better. {last} was finding his rhythm, and now the {nick} have {days} to cover.', 'Expect the front office to look inside the organisation first. {days} without {last} is a test, not a crisis.'],
      depth: ['{last} was a useful piece, no more. The {nick} will barely notice.'],
    },
    radio: {
      star: ['The phones lit up the moment the news broke. Caller after caller asking the same thing: how do the {nick} survive {days} without {last}?', 'I said it on air this morning and I will say it again. If this team is serious, they go and get a replacement for {last} now, not in a month.'],
      regular: ['{last} out {days}. Not a disaster, but it is the kind of injury that quietly costs you games.', 'Callers are split on the {last} news. Half say next man up, half say the season just got harder.', 'One caller summed it up: you do not notice {last} until he is gone. We are about to find out how true that is.', 'Lose {last} for {days}, and suddenly the bench matters. Is it good enough? Most of my callers think not.'],
      depth: [],
    },
    forum: {
      star: ['{handle}: Of course it\'s {last}. Of course it is. Why is it always our best player?', '{handle}: Season over. Wake me up when he\'s back.', '{handle}: Panic? No. Concerned? Absolutely. {days} is a long time.'],
      regular: ['{handle}: Get well soon {last}. Now let\'s see what the kid can do.', '{handle}: Not ideal, but we\'ll be fine.', '{handle}: {days}? They always say that and it always ends up longer.', '{handle}: Next man up. Nobody feels sorry for us.'],
      depth: [],
    },
  },
  setback: {
    radio: ['A setback for {last} and you can hear the groan around the city. Every week he is out is a week the {nick} have to find answers elsewhere.'],
    writer: ['The {nick} were hoping {last} was close. That timeline is gone now, and the front office has a decision to make about whether to wait or act.'],
    forum: ['{handle}: Every update on {last} is worse than the last one.', '{handle}: Starting to wonder if we see him again this season.'],
  },
  hot: {
    radio: ['{last} is the hottest hitter in town right now: {form}. Every at-bat feels like something is about to happen.', 'You cannot get {last} out at the moment. He is {form}, and pitchers are running out of ideas.', 'Callers wanted to talk about one man today, and it was {last}: {form}.'],
    writer: ['{last} is locked in. He is {form}, and the at-bats have been even better than the numbers.', 'It is not luck. {last} has shortened up with two strikes and he is spraying the ball everywhere: {form}.', 'Ask the opposing pitchers about {last}. They will tell you there is nowhere to throw it to him right now. He is {form}.'],
    podcast: ['We spent twenty minutes on {last} this week and could have done an hour. {form}. Ride it.'],
    forum: ['{handle}: {last} is carrying this team right now. Pay the man.', '{handle}: Whatever {last} is eating for breakfast, everyone else should be eating it too.'],
  },
  hotP: {
    radio: ['{last} has been untouchable: {form}. When he takes the ball you feel like you are going to win.', 'I will take {last} against anybody right now. {form}.'],
    writer: ['{last} is pitching like an ace: {form}, and he is getting quicker outs than at any time this year.', 'The fastball has life again and {last} is pounding the zone with it. The result: {form}.'],
    forum: ['{handle}: {last} days are the best days. Lock him up long term.', '{handle}: Is there a better pitcher in this league right now than {last}? Genuine question.'],
  },
  cold: {
    radio: ['I have to say it: {last} looks lost at the plate. He is {form}. At some point you give somebody else a look.', 'The callers are out of patience with {last}. He is {form}, and the boos last night were loud.', 'Every time {last} walks up there I hold my breath, and not in a good way. {form}.'],
    writer: ['{last} is chasing pitches he laid off a month ago, and he is {form}. The coaches insist it is mechanical, not mental.', '{last} is {form}, the kind of slump that tests a manager\'s faith, and a clubhouse\'s.', 'The bat speed is there in batting practice. In games, {last} is {form}, and the pressure is building.'],
    podcast: ['Is it time to drop {last} in the order? {form}. We argued about it for half the show.'],
    forum: ['{handle}: {last} needs a day off. Or a week. {form}.', '{handle}: Bench him. I don\'t care what he did last year.', '{handle}: Booing your own players is wrong, but I get it with {last} right now.'],
  },
  coldP: {
    radio: ['{last} has been hit hard: {form}. Callers want him out of the rotation, and I find it hard to argue.', 'Another rough one for {last}. {form}. Something is not right.'],
    writer: ['{last} keeps falling behind and paying for it: {form}. The stuff is there; the command is not.', 'Scouts in the stands say {last} is tipping his pitches. Whatever the cause, it is {form}.'],
    forum: ['{handle}: Every {last} start feels like a bullpen game waiting to happen.', '{handle}: {form}. How much longer?'],
  },
  pricey: {
    forum: ['{handle}: That contract is looking worse every week. {form}.', '{handle}: We are paying {last} star money for this?'],
    radio: ['When you are paid like {last} is paid, {form} is not good enough. The fans know it, and they are letting him hear it.'],
  },
  overplayed: {
    writer: ['{last} has started {n} in a row and it shows. The bat looks slow. A day off now would be a day well spent.', 'Somebody give {last} a rest. {n} straight games, and the legs are going.'],
    radio: ['{n} games straight for {last}. Even iron men need a day off, and his swing says he needs one now.'],
    podcast: ['Is anyone watching {last}\'s legs? {n} in a row. Rest him before he breaks.'],
  },
  signing: {
    forum: {
      big: ['{handle}: WE GOT {upper}! I can\'t believe it.', '{handle}: Finally the front office spends some money. {last} changes everything.', '{handle}: Love the player, terrified of the later years of that deal.'],
      old: ['{handle}: {last} at his age on that money? We will regret this.', '{handle}: Two good years and then an albatross. Classic us.'],
    },
    writer: {
      big: ['{last} makes the {nick} better today, and that is the point. Whether the back end of the deal ages well is tomorrow\'s problem.', 'A statement signing. {last} gives the {nick} a player opponents have to plan around.'],
      old: ['The years are the worry with {last}. The first season should be good; the last ones look expensive.'],
    },
  },
  walks: {
    forum: ['{handle}: {last} is gone and the club never even made him an offer. Unbelievable.', '{handle}: So we just let {last} walk? What is the point of this front office?', '{handle}: I bought the shirt. {last} leaves and we do nothing. Done with this team.'],
    radio: ['The phones have not stopped since {last} left. People want to know why nobody sat down with him before he reached the market.', '{last} leaves for nothing, and callers are asking who decided that.'],
    writer: ['Losing {last} for no return is the kind of decision this club will be asked about all winter.'],
  },
  nonTender: {
    forum: ['{handle}: Non-tendered {last}? He was one of our better players.', '{handle}: Cheap move. {last} deserved a contract.'],
    radio: ['{last} cut loose before arbitration. Callers think the club is saving pennies while the team gets worse.'],
  },
  champions: {
    forum: ['{handle}: I have waited my whole life for this. I am sitting on my kitchen floor crying. {city} are world champions.', '{handle}: Forget the sums, forget the contracts. {nick}, world champions. I will never tire of typing it.', '{handle}: My dad is eighty-one and he saw it tonight. That is all I wanted.', '{handle}: Whoever is reading this, go outside. The whole street is out. {city} is going to be loud until morning.'],
    radio: ['The phones will not stop. Nobody is calling to argue about anything tonight, they are just calling to say thank you.', 'I have been on this station a long time and I have never heard the city like this. You can hear it through the walls of the studio.', 'Every caller says the same thing: they saw it, they were there, they will tell their grandchildren.'],
    writer: ['This {nick} team will be remembered not for one moment but for the way it kept getting up. The ring is the least of it.', 'It will be years before the city stops talking about this October, and it will not be soon before another club does what this one did.'],
    national: ['The {nick} are world champions, and nobody can say they did not earn it. A deserving winner.', 'You could feel it coming for weeks. {city} gave baseball a title worth remembering.'],
  },
  heartbreak: {
    forum: ['{handle}: That one hurts. But I have never been prouder of a team. Thank you for the run.', '{handle}: So close. Next year, and I will be there for every game.', '{handle}: I will not sleep tonight, but I would not trade this October for anything.'],
    radio: ['The callers are quiet tonight, and the ones who are phoning say the same thing: it hurt, and it was worth it.', 'A bitter night, but the city stood and applauded its team off the field, and that says something.'],
    writer: ['Losing a World Series is the hardest thing in this sport, and the {nick} will carry it all winter. They will also be back.', 'There is no shame in what happened, and everybody in the clubhouse knows how close it was.'],
    national: ['Credit the {nick} for getting here, and for pushing it as far as they did. A fine team that came up just short.'],
  },
  blockbuster: {
    forum: ['{handle}: {last}!!! I just bought a season ticket. First time in years. {city} is back.', '{handle}: {x} for {last}. I do not care. This is the signing we have been begging for.', '{handle}: Took the afternoon off to watch the unveiling. Worth it. Put {last} {there} and let us go.', '{handle}: Finally the front office does something bold. {last} in a {nick} shirt, I never thought I would see it.'],
    radio: ['The phones have not stopped since {last} signed. People are calling to say they have bought tickets they had no plans to buy.', 'I have been doing this show a long time and I cannot remember a day like this. {last} has changed the mood of the whole city.', 'Callers are ecstatic. {x} is a number nobody expected the club to spend, and the fans are saying thank you.'],
    writer: ['{last} is the kind of signing that changes how a club is seen, inside the clubhouse as much as outside it. The {nick} have a star again.', 'The {nick} have paid {x} to make a statement. The statement has landed.'],
    national: ['Whatever you think of the price, {last} to the {nick} makes the league more interesting. {city} just became a team to watch.', 'The {nick} have gone and got the biggest name on the market. Bold, expensive, and exactly what their fans wanted.'],
  },
  blockbusterDoubt: {
    forum: ['{handle}: {x} for {last}. I love him, but what happens when {goes}? We will be paying for this for {n} years.', '{handle}: Great signing, scary contract. One bad injury and this is the worst deal in the league.', '{handle}: Everyone is celebrating. I am just doing the sums on that payroll and feeling sick.', '{handle}: Okay, but who pays for the rest of the roster now?'],
    radio: ['Not every caller is thrilled. A few are asking what a deal this size does to everything else the club wants to do.', 'The honest question this afternoon is what happens in the later years. Callers are split between joy and dread.'],
    writer: ['The risk with {last} is not this season but the later ones. {x} is a lot of the club\'s future committed to one player, and the club has no way back.', 'A deal like this only looks smart if {last} stays healthy. The club has bet heavily that he will.'],
    national: ['It is a great player on a great contract only until something goes wrong. The {nick} have taken on a lot of risk with {last}.', 'You can admire the ambition and still wonder about the length. {x} is a very big cheque to write on one {limb}.'],
  },
  bigDeal: {
    forum: ['{handle}: {last} signed! Lock him up, he is the face of this team.', '{handle}: That is a lot of money but I do not care. Keep the stars, win games.', '{handle}: That is a lot of years and money, but I would rather overpay {last} than watch him in another uniform.'],
    radio: ['The fans wanted {last} kept and the club has done it. Callers are happy, if a little nervous about the length.', 'A huge deal for {last}. Expect the ticket office to feel it.'],
    writer: ['{last} is secure, and so is the core of this team. What this does to the payroll in later years is tomorrow\'s argument.'],
  },
  longDeal: {
    forum: ['{handle}: Those last years for {last} are going to be ugly.', '{handle}: Love {last}, hate the length of that contract.'],
    radio: ['{last} gets the years, and some callers think the club has given away its flexibility.'],
  },
  cheapDeal: {
    forum: ['{handle}: {last} at that price? Great business.', '{handle}: Smart. Keep the good ones at a fair rate.'],
    radio: ['Callers like the {last} deal. A fair price, sensible years.'],
  },
  tradedAway: {
    forum: ['{handle}: We traded {last}?! Why?', '{handle}: Hope the return is good, because {last} was a fan favourite.', '{handle}: {last} gone. This is the front office rebuilding again, isn\'t it.'],
    radio: ['Trading {last} was always going to upset people. The phones say it has.'],
    writer: ['{last} was among the most popular players in the clubhouse. The club will need something good back to win the room.'],
  },
  tradedFor: {
    forum: ['{handle}: {last} is ours! Great pickup.', '{handle}: Finally a real move. Welcome, {last}.'],
    radio: ['The {nick} have made a move and callers like it. {last} lifts the mood.'],
  },
  leaves: {
    forum: ['{handle}: Thanks for everything, {last}. Never should have let him walk.', '{handle}: Sad to see {last} go, but the front office is right not to pay that.'],
    radio: ['Letting {last} walk will be the talk of the winter. Callers are not happy.'],
  },
  record: {
    national: ['History. {name} now owns the record for {x}, and he did it in {nick} colours. We will be talking about this one for decades.'],
    radio: ['I never thought I would see it. {last} has the record. The whole city was standing.'],
    forum: ['{handle}: I was there. I was THERE.', '{handle}: Put it in the record books. Our guy.'],
  },
  allStar: {
    forum: ['{handle}: {last} an All-Star. Deserved every bit of it.', '{handle}: Proud of {last}. Best player in this league that nobody talks about.'],
    radio: ['Congratulations to {last}, an All-Star. The phones have been full of people saying it was about time.'],
  },
  snub: {
    radio: ['No All-Star spot for {last}. {form} this season and he stays at home? Callers are furious, and they should be.'],
    forum: ['{handle}: {last} snubbed again. This league is a joke.', '{handle}: Robbed. {last} deserved that spot.'],
    writer: ['{last} has a fair complaint about the All-Star selections. On the numbers he was one of the first names in.'],
  },
  award: {
    forum: ['{handle}: {x}! Our guy!', '{handle}: Told you all in April. {last}, {x}.'],
    writer: ['{last}, {x}. Nobody in the league had a better season, and nobody in this city will forget it.'],
  },
  losing: {
    radio: ['{n} straight defeats. I have had callers asking for the manager\'s job. I am not there yet, but I understand why they are.', 'The mood in this city is grim. {n} losses in a row, and nobody seems to have an answer.'],
    forum: ['{handle}: {n} in a row. Something has to change and it starts at the top.', '{handle}: I have watched this team for thirty years and this is as bad as it has been.'],
    writer: ['{n} in a row. The {nick} are not as bad as this, but they are not good enough to be playing like this either.'],
  },
};

/** One voice on a story: {q, by}, or null if there is nothing to say. Varies with the day and the luck of this sitting. */
export function mediaQuote(orgId, topic, ctx = {}, prefer = null) {
  const t = LINES[topic];
  if (!t) return null;
  const media = orgId ? outlets(orgId) : null;
  const rng = new Rng(`mq-${topic}-${orgId}-${ctx.p?.id ?? ''}-${game.date?.getTime()}-${game.luck}-${ctx.k ?? 0}`);
  const pool = (who) => { const v = t[who]; return Array.isArray(v) ? v : v?.[ctx.level] || []; };
  const voices = Object.keys(t).filter((w) => pool(w).length && (w === 'national' || media));
  const avoid = ctx.not || [];
  const who = prefer && voices.includes(prefer) ? prefer : rng.pick(voices.filter((w) => !avoid.includes(w)).length ? voices.filter((w) => !avoid.includes(w)) : voices);
  if (!who) return null;
  const p = ctx.p;
  const handle = media ? rng.pick(media.forum.handles) : 'a fan';
  const used = ((game.mediaUsed ||= {})[`${topic}-${who}`] ||= []);
  const fresh = pool(who).filter((x) => !used.includes(x));
  const line = rng.pick(fresh.length ? fresh : pool(who));
  used.push(line);
  if (used.length > Math.max(1, Math.floor(pool(who).length * 0.7))) used.shift();
  let text = line
    .replaceAll('{name}', p ? fullName(p) : '').replaceAll('{last}', p?.last ?? '').replaceAll('{upper}', (p?.last ?? '').toUpperCase())
    .replaceAll('{nick}', W().orgs.get(orgId)?.club.name ?? '').replaceAll('{city}', W().orgs.get(orgId)?.club.city ?? '')
    .replaceAll('{limb}', p && isPitcher(p) ? 'arm' : 'bat').replaceAll('{goes}', p && isPitcher(p) ? 'the arm goes' : 'the bat slows').replaceAll('{there}', p && isPitcher(p) ? 'on the mound' : 'in the lineup').replaceAll('{form}', ctx.form ?? '').replaceAll('{days}', ctx.days ?? '').replaceAll('{n}', ctx.n ?? '').replaceAll('{x}', ctx.x ?? '');
  text = text.replace(/^(\w)/, (m) => m.toUpperCase()).replace(/\.\s*\./g, '.');
  let by;
  if (who === 'forum') { text = text.replace('{handle}: ', ''); by = `${handle}, on ${media.forum.outlet}`; }
  else if (who === 'national') { const v = rng.pick(NATIONAL); by = `${v.host}, ${v.outlet}`; }
  else by = `${media[who].host}, ${media[who].outlet}`;
  return { q: text, by, who };
}

/** Two voices on the same story, from different outlets (the second only sometimes). */
export function voices(orgId, topic, ctx = {}, chance2 = 0.5) {
  const a = mediaQuote(orgId, topic, ctx);
  if (!a) return [];
  const rng = new Rng(`v2-${topic}-${orgId}-${ctx.p?.id ?? ''}-${game.date?.getTime()}-${game.luck}`);
  const b = rng.chance(chance2) ? mediaQuote(orgId, topic, { ...ctx, k: 1, not: [a.who] }) : null;
  return b && b.who !== a.who ? [a, b] : [a];
}

// ---------- ready-made commentary for the places that use it ----------

const said = (key, days = 10) => {
  const m = (game.mediaSaid ||= {});
  const d = absDay(game.date);
  if (m[key] != null && d - m[key] < days) return true;
  m[key] = d;
  return false;
};

/** The voices on an injury. */
export function injuryVoices(p, inj) {
  const days = inj.days >= 120 ? `${Math.round(inj.days / 30)} months` : inj.days >= 14 ? `${Math.round(inj.days / 7)} weeks` : `${inj.days} days`;
  const level = star(p) ? 'star' : value(p) >= 52 ? 'regular' : 'depth';
  if (inj.days < 14 || level === 'depth') return [];
  return voices(p.orgId, 'injury', { p, days, level }, level === 'star' ? 0.8 : 0.3);
}

/** Talk about one of a club's players after a game, if there is something worth saying: hot, cold, worn out. */
export function playerTalk(orgId, players) {
  const out = [];
  for (const p of players) {
    if (out.length >= 2) break;
    if (!p || p.filler) continue;
    const f = recentForm(p);
    const run = isPitcher(p) ? 0 : straight(p);
    if (!isPitcher(p) && (run >= 22 || (p.pos === 'C' && run >= 9)) && !said(`over-${p.id}`, 15)) { out.push(mediaQuote(orgId, 'overplayed', { p, n: run })); continue; }
    if (!f) continue;
    if (f.hot && !said(`hot-${p.id}`)) out.push(mediaQuote(orgId, isPitcher(p) ? 'hotP' : 'hot', { p, form: f.text }));
    else if (f.cold && !said(`cold-${p.id}`)) {
      const pricey = salary(p) >= 15e6 && !isPitcher(p);
      out.push(mediaQuote(orgId, pricey ? 'pricey' : isPitcher(p) ? 'coldP' : 'cold', { p, form: f.text }));
    }
  }
  return out.filter(Boolean);
}

/** Pressure from the stands: a cold player the fans have turned on (used by the weekly moods). Strength 0 to 1. */
export function fanPressure(p) {
  const f = recentForm(p);
  if (!f?.cold) return 0;
  const big = salary(p) >= 15e6 ? 0.4 : 0;
  const town = contending(p.orgId) ? 0.3 : struggling(p.orgId) ? 0.2 : 0;
  return Math.min(1, 0.4 + big + town);
}

/** A national voice on the week's best or worst run around the league, for the weekly round-up. */
export function leagueTalk() {
  const pool = W().list.filter((p) => p.orgId && !p.filler && game.world.orgs.get(p.orgId) && (p.gb?.length || p.gp?.length));
  let best = null, worst = null;
  for (const p of pool) {
    const f = recentForm(p);
    if (!f) continue;
    if (f.hot && (!best || value(p) > value(best.p))) best = { p, f };
    if (f.cold && star(p) && (!worst || value(p) > value(worst.p))) worst = { p, f };
  }
  const out = [];
  const rng = new Rng(`lt-${game.date.getTime()}-${game.luck}`);
  const v = () => rng.pick(NATIONAL);
  if (best) { const n = v(); out.push({ q: `${fullName(best.p)} is the hottest ${isPitcher(best.p) ? 'arm' : 'bat'} in baseball right now: ${best.f.text}. ${rng.pick(['Appointment viewing.', 'Pitchers should be walking him.', 'Enjoy it while it lasts.', 'Nobody is playing better.'])}`.replace(/Pitchers should be walking him\./, isPitcher(best.p) ? 'Hitters want no part of him.' : 'Pitchers should be walking him.'), by: `${n.host}, ${n.outlet}` }); }
  if (worst) { const n = v(); out.push({ q: `What has happened to ${fullName(worst.p)}? ${worst.f.text[0].toUpperCase() + worst.f.text.slice(1)}. ${rng.pick(['For a player of his class that is a worry.', 'The scouts I talk to think he is hurt.', 'He will come out of it. Players like him always do.'])}`, by: `${n.host}, ${n.outlet}` }); }
  return out;
}

/** The voices on a contract you have just signed: by size and length, or the bargain it is. */
export function dealVoices(orgId, p, { salary = 0, years = 1 } = {}) {
  const topic = salary >= 20e6 || salary * years >= 120e6 ? 'bigDeal' : years >= 6 && p.age >= 30 ? 'longDeal' : salary * years <= 40e6 && value(p) >= 52 ? 'cheapDeal' : null;
  return topic ? voices(orgId, topic, { p, n: years }, 0.6) : [];
}

/** The voices when a player of yours leaves: a walk, a non-tender, or a trade. Only for players the fans know. */
export function exitVoices(orgId, p, topic = 'walks') {
  if (value(p) < 50) return [];
  return voices(orgId, topic, { p }, 0.7);
}
