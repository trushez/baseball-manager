// Opening Day: the build-up (what the fans expect, from last year and from the winter's business) and the morning-after
// reaction (the debut of the new signing, what the radio and the fans make of the result). Both are written for
// your club from its own history, so a team that stood still after a poor year gets a gloomier paper than one that spent.
import { game } from '../state.js';
import { Rng } from '../core/rng.js';
import { fullName, isPitcher, mainPos } from '../data/world.js';
import { message } from './inbox.js';
import { ledger } from './ledger.js';
import { outlets } from './media.js';
import { stature } from './jobs.js';
import { gmOf } from './gms.js';
import { value } from './value.js';
import { teamOdds, chanceText } from './odds.js';

const club = (id) => game.world.orgs.get(id)?.club;
const WORDS = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve'];
const num = (n) => WORDS[n] ?? String(n);
const ipWords = (o) => (o % 3 ? `${num(Math.floor(o / 3))} and ${o % 3 === 1 ? 'a third' : 'two thirds'}` : num(o / 3)) + ' innings';
const plural = (n, a, b) => (n === 1 ? a : b);

/** Who the club added and lost this winter, and how much that is worth. */
function winter() {
  const me = game.orgId, start = game.season.start;
  const moves = ledger().moves.filter((m) => m.day >= start - 170 && m.day <= start + 1 && (m.to === me || m.from === me));
  const take = (list) => list.map((m) => ({ m, p: game.world.players.get(m.pid) })).filter((x) => x.p && !x.p.retired);
  const ins = take(moves.filter((m) => m.to === me)).sort((a, b) => b.m.v - a.m.v);
  const outs = take(moves.filter((m) => m.from === me)).sort((a, b) => b.m.v - a.m.v);
  const gain = (xs) => xs.reduce((a, x) => a + Math.max(0, x.m.v - 44), 0);
  return { ins, outs, net: gain(ins) - gain(outs) };
}

const role = (p) => (isPitcher(p) ? (mainPos(p) === 'SP' ? 'starting pitcher' : 'reliever') : 'hitter');

/** The paper before the first game. */
/** The preseason forecast: where the simulation puts your club, the favourites, and your division. */
function forecast(odds, mine) {
  const me = game.orgId, c = club(me), y = game.season.year;
  const city = (id) => club(id)?.city ?? id;
  const row = (x) => [city(x.id), x.wins.toFixed(1), chanceText(x.div), chanceText(x.playoff), chanceText(x.title)];
  const head = ['Club', 'Proj. W', 'Division', 'Playoffs', 'World Series'];
  const favs = odds.slice(0, 6);
  const div = odds.filter((x) => club(x.id).division === c.division).sort((a, b) => b.wins - a.wins);
  const place = div.findIndex((x) => x.id === me) + 1;
  const tier = mine.playoff >= 0.75 ? 'a club the model expects to be playing in October' : mine.playoff >= 0.4 ? 'in the race for a playoff place without being a favourite' : mine.playoff >= 0.12 ? 'on the outside of the race, needing things to go right' : 'a long way from the picture, and the forecast does not hide it';
  const rival = div.find((x) => x.id !== me && x.wins >= (place === 1 ? 0 : mine.wins));
  const paras = [`Before a game is played, the forecast has ${c.city} winning about ${Math.round(mine.wins)} games and finishing ${['', 'first', 'second', 'third', 'fourth', 'fifth'][place] ?? 'down the table'} in the ${c.division.replace('American League', 'AL').replace('National League', 'NL')}, ${tier}. It gives you a ${chanceText(mine.div)} chance of the division, ${chanceText(mine.playoff)} of reaching the playoffs and ${chanceText(mine.title)} of winning the World Series.`];
  if (rival) paras.push(`${city(rival.id)} are the club to watch in your division, projected for ${Math.round(rival.wins)} wins.`);
  paras.push(`${city(favs[0].id)} are the favourites for the title at ${chanceText(favs[0].title)}, with ${city(favs[1].id)} and ${city(favs[2].id)} behind them. These figures come from playing out the whole schedule hundreds of times with each club's roster as it stands today, so they will move as injuries, trades and results come in. The Odds tab under League keeps them up to date.`);
  message({ cat: 'club', title: `${y} forecast: ${city(me)} projected for ${Math.round(mine.wins)} wins`, parts: [...paras.map((p) => ({ p })), { head, rows: favs.map(row) }, { head: [`${c.division.replace('American League', 'AL').replace('National League', 'NL')}`, ...head.slice(1)], rows: div.map(row) }], quiet: true });
}

export function openingPreview() {
  const me = game.orgId, c = club(me), y = game.season.year;
  if (!c || game.opening?.previewed === y) return;
  const H = game.history?.[y - 1]?.clubs?.[me];
  const w = H?.w ?? c.record2026?.[0] ?? 81, l = H?.l ?? c.record2026?.[1] ?? 81;
  const W = winter();
  const size = stature(me);
  const s = (w - 81) / 9 + W.net / 25 + (size - 50) / 60;
  const mood = s >= 1 ? 'high' : s <= -0.8 ? 'low' : 'mid';
  const odds = teamOdds(300);
  const mine = odds?.find((x) => x.id === me);
  const pred = mine ? Math.round(mine.wins) : Math.max(55, Math.min(108, Math.round(81 + (w - 81) * 0.5 + W.net * 0.25 + (size - 50) * 0.1)));
  const rng = new Rng(`opening-${me}-${y}`);
  const star = W.ins[0]?.p;
  const gm = gmOf(me).name;
  game.opening = { previewed: y, mood, pred, ins: W.ins.slice(0, 4).map((x) => x.p.id), star: star?.id ?? null, reacted: false };

  const paras = [];
  // last year
  const finish = H ? `${H.place === 1 ? 'won' : `finished ${['', '', 'second', 'third', 'fourth', 'fifth'][H.place] || 'down the table'} in`} the ${H.div?.replace('American League', 'AL').replace('National League', 'NL') ?? 'division'}` : '';
  const last = w >= 95 ? `${c.city} won ${w} games last season${finish && H.place === 1 ? ' and took the division' : ''}, and the ballpark has not forgotten it.`
    : w >= 85 ? `${c.city} won ${w} and lost ${l} last season, good enough to be in the conversation without ever quite being the story.`
      : w >= 77 ? `Last season ended ${w}-${l}, the sort of record that keeps a city interested and never quite satisfied.`
        : `Last season was a bad one: ${w} wins and ${l} defeats, and a summer of empty seats in September.`;
  paras.push(`${last} ${mood === 'high' ? 'Everything about the mood in town says this is the year to go further.' : mood === 'low' ? 'The mood at the gates this morning is patience wearing thin.' : 'The fans arrive with hope, and with their arms folded.'}`);

  // the winter
  if (W.ins.length >= 3 && W.net > 6) {
    paras.push(`It has been a busy winter. ${gm}, the general manager, brought in ${W.ins.slice(0, 3).map((x) => fullName(x.p)).join(', ')}${W.ins.length > 3 ? ` and ${num(W.ins.length - 3)} more` : ''}${star ? `, and ${fullName(star)} in particular is the name on every shirt in the club shop` : ''}. ${W.outs.length ? `${fullName(W.outs[0].p)} is among those who left, and that will be missed, but the feeling is that the club has gained more than it has given up.` : 'Nobody of note left, which is the part the fans like most.'}`);
  } else if (W.ins.length && W.net >= 0) {
    paras.push(`The winter was quiet but not empty. ${fullName(star)} is the headline addition${W.ins.length > 1 ? `, with ${num(W.ins.length - 1)} other ${plural(W.ins.length - 1, 'arrival', 'arrivals')} behind him` : ''}, and ${gm} has talked all spring about how little needed fixing. Not everyone is convinced that is enough.`);
  } else if (W.ins.length) {
    paras.push(`The big names are mostly on the way out. ${fullName(W.outs[0]?.p ?? star)} ${W.outs.length ? 'left' : 'has gone'}, and the replacements, led by ${fullName(star)}, are being asked to do a lot. ${gm} says the plan is to be patient. The fans have heard that before.`);
  } else {
    paras.push(`There was almost nothing to look at this winter. No signing of any size came in the door, and ${W.outs.length ? `${fullName(W.outs[0].p)} went out of it` : 'the roster you see is the roster that finished last season'}. ${gm} insists the answers are already in the building. The season ticket holders are less sure.`);
  }
  paras.push(`The forecasts have ${c.name} winning around ${pred} games. ${pred >= 90 ? 'That puts them among the favourites, and the expectations to match.' : pred >= 82 ? 'That is a playoff race, and a club that has to earn every point of it.' : 'That is a season of hard questions unless something goes better than planned.'}`);

  const parts = paras.map((p) => ({ p }));
  if (W.ins.length) {
    parts.push({ p: 'The new faces:' }, {
      head: ['Player', 'Pos', 'Age', 'How he arrived'],
      rows: W.ins.slice(0, 6).map((x) => [{ pid: x.p.id, t: fullName(x.p) }, mainPos(x.p), x.p.age, x.m.t === 'trade' ? `Trade from ${club(x.m.from)?.city ?? 'another club'}` : 'Free agent']),
    });
  }

  // the voices
  const o = outlets(me), n = c.name;
  const nm = star ? star.last : 'any one new arrival';
  const say = {
    high: {
      radio: [`I have been doing this show a long time and I have not felt like this on an Opening Day since I was a kid. ${nm} walks in, the lineup looks right, and this town wants October.`, `If this team is not in the race in September, I will eat my headphones live on air.`],
      writer: [`There is an edge about the ${n} this spring that has been missing for years. The question is no longer whether they can contend; it is whether they can stand the pressure of being asked to.`, `${star ? nm + ' was the piece that made the winter feel like' : 'The winter felt like'} a plan instead of a hope.`],
      podcast: [`We did the preseason pod this week and I think we all quietly believe in this team. We just did not want to say it out loud.`, `The rotation is good, the lineup is deeper, and ${star ? nm : 'the winter'} changes how I think about the order. Buy.`],
      forum: [`Not sleeping. Opening Day. Lineup card is up. Let us GO.`, `Took the day off work. Told the boss it was a family emergency. It is.`],
    },
    mid: {
      radio: [`I want to believe. I really do. But I want ${star ? nm : 'somebody'} to show me something before I put the banner up.`, `This is a good team that can become a great one or a mediocre one depending on three or four things, and you will see most of them in April.`],
      writer: [`The ${n} are the hardest club in the division to read. There is enough here to win ${pred} games and not enough to be sure of it.`, `If ${star ? nm : 'the new group'} settles quickly, the winter will look smart. If not, the questions come back fast.`],
      podcast: [`We argued for forty minutes on the preseason episode and could not agree whether this is an 84-win team or a 90-win team. That is the whole story.`, `I want to see the bullpen before I say anything about October.`],
      forum: [`Cautiously optimistic. Emphasis on cautious.`, `Honestly just happy it is baseball again. Ask me again in May.`],
    },
    low: {
      radio: [`We lost ${l} games last year and we did very little to fix it, and now we are supposed to be excited? Show me.`, `The front office keeps telling us to be patient. The fans have been patient. The seats in September were the patience.`],
      writer: [`There is no way to dress it up: the ${n} come into the season with more questions than answers and a winter that did little to change that.`, `${star ? nm + ' may turn out to be a good addition, but one' : 'One'} player does not close a gap this size.`],
      podcast: [`Look, I will be at the park. I always am. But if you ask me what this team is trying to be, I could not tell you.`, `A year ago we said it was a rebuild without a plan. This year it just feels like a plan without a rebuild.`],
      forum: [`Opening Day is still Opening Day. Will be there, will cheer, will be complaining by the fifth inning.`, `Bring back the old uniforms, at least we would look good losing.`],
    },
  }[mood];
  for (const [who, host] of [['radio', o.radio], ['writer', o.writer], ['podcast', o.podcast], ['forum', null]]) {
    const q = rng.pick(say[who]);
    parts.push({ q, by: host ? `${host.host}, ${host.outlet}` : `${rng.pick(o.forum.handles)}, on ${o.forum.outlet}` });
  }

  message({ cat: 'club', important: true, title: `Opening Day: ${mood === 'high' ? `${c.city} dares to dream` : mood === 'low' ? `${c.city} wait to be convinced` : `What ${c.city} expect of the season`}`, parts, player: star?.id, body: `The paper before the first game: what the fans expect of ${c.name} this year.` });
  if (odds) forecast(odds, mine);
}

/** After your first game of the season: how it went for the new faces, and what the town makes of it. */
export function openingReaction(rec, eng) {
  const O = game.opening;
  if (!O || O.reacted || rec.post) return;
  const me = game.orgId, c = club(me), won = (rec.home === me) === (rec.s[1] > rec.s[0]);
  O.reacted = true;
  const opp = club(rec.home === me ? rec.away : rec.home);
  const hi = Math.max(...rec.s), lo = Math.min(...rec.s);
  const rng = new Rng(`reaction-${me}-${rec.id}`);
  const ins = O.ins.map((id) => game.world.players.get(id)).filter(Boolean);
  const played = ins.filter((p) => { const L = eng.stats.get(p.id); return L && (L.PA || L.pOuts); });
  const debut = played.sort((a, b) => value(b) - value(a))[0];
  const paras = [];
  const venue = rec.home === me ? 'at home' : `at ${opp.city}`;
  paras.push(won
    ? `${c.name} won their opener ${hi}-${lo} ${venue} against the ${opp.name}. The first game of a long season counts for exactly one game, but nobody in town was treating it that way this morning.`
    : `${c.name} lost their opener ${lo === hi ? '' : `${hi}-${lo} `}${venue} to the ${opp.name}. It is one game out of 162, and everyone knows it, which has not stopped the radio phone lines from lighting up.`);

  let nuance = '';
  let tone = debut ? 'mixed' : 'none';
  if (debut) {
    const L = eng.stats.get(debut.id), name = fullName(debut);
    if (isPitcher(debut) && L.pOuts) {
      const hr = eng.events.find((e) => e.type === 'paEnd' && e.data.result === 'HR' && e.data.pitcherId === debut.id);
      const line = `${ipWords(L.pOuts)}, ${L.pR === 0 ? 'no runs' : `${num(L.pR)} ${plural(L.pR, 'run', 'runs')}`}, ${num(L.pK)} ${plural(L.pK, 'strikeout', 'strikeouts')}`;
      const long = L.pOuts >= 15;
      if (hr && long) { tone = 'mixed'; nuance = `${name}, the big name of the winter, had a debut that will be argued about. He gave up a home run in the ${hr.inning === 1 ? 'first inning' : `${hr.inning}${['th', 'st', 'nd', 'rd'][hr.inning] || 'th'} inning`}, which is the part the highlight shows will remember, but he settled down and went on to throw ${line}. Whether that is a nervous start or a worrying one depends on who you ask.`; }
      else if (hr) { tone = 'bad'; nuance = `${name} had a rough introduction. A home run in the ${hr.inning === 1 ? 'first inning' : 'early innings'} set the tone, and he was gone after ${line}.`; }
      else if (L.pR <= 2 && long) { tone = 'good'; nuance = `${name} made the day a good one for the front office. He was in control from the start and finished with ${line}.`; }
      else if (L.pR >= 4) { tone = 'bad'; nuance = `${name} was hit hard on his first night with the club: ${line}. It is only one start, but it is not the one anybody wanted.`; }
      else { nuance = `${name} was fine, not more: ${line}. He will want to build on it.`; }
    } else if (L.PA) {
      const h = `${num(L.H)} for ${num(L.AB)}`;
      if (L.HR) { tone = 'good'; nuance = `${name} announced himself at the plate. He went ${h} with ${L.HR === 1 ? 'a home run' : `${num(L.HR)} home runs`}${L.RBI ? ` and ${num(L.RBI)} ${plural(L.RBI, 'RBI', 'RBI')}` : ''} in his first game for the club.`; }
      else if (L.H >= 2) { tone = 'good'; nuance = `${name} looked comfortable, going ${h} in his debut.`; }
      else if (L.H === 0 && L.AB >= 3) { tone = 'bad'; nuance = `It was a quiet start for ${name}, who went ${h}${L.K ? ` with ${num(L.K)} ${plural(L.K, 'strikeout', 'strikeouts')}` : ''}. First games are first games, but he knows people were watching.`; }
      else { nuance = `${name} went ${h} in his first game for the club, a day that did not settle much either way.`; }
    }
  }
  if (nuance) paras.push(nuance);
  paras.push(O.mood === 'high' ? `After a winter of talk, the first result will be read for signs. ${won ? 'This one gives the optimists plenty.' : 'This one will not shake the optimists, but it will test them.'}` : O.mood === 'low' ? `For a fan base that came in sceptical, ${won ? 'a win is a good start and nothing more' : 'a loss feels like confirmation, fair or not'}.` : `${won ? 'A win keeps the hopeful happy' : 'A loss gives the doubters their first line'}, and it settles nothing.`);

  const parts = paras.map((p) => ({ p }));
  const o = outlets(me), nm = debut ? debut.last : 'the team', n = c.name;
  const V = {
    good: {
      radio: [`${nm} looked like a man who belongs. One game, I know. But what a way to start.`],
      writer: [`${nm} gave the winter a first, reassuring answer.`],
      podcast: [`I am trying not to overreact to one game and I am failing completely.`],
      forum: [`${nm} MVP. Don't @ me.`],
    },
    bad: {
      radio: [`I do not want to be the guy who says it after one game, so I will say it after one game: that was not what we paid for.`],
      writer: [`It is one start, and it will be forgotten by Friday if ${nm} bounces back. If not, the questions arrive quickly.`],
      podcast: [`Not great from ${nm}. Not panic either. We will check back in two weeks.`],
      forum: [`Is it too early to be worried about ${nm}? Asking for me.`],
    },
    none: {
      radio: [`${won ? 'A win is a win, and I will take it, but I want to see the same thing on Tuesday.' : 'Nobody should read too much into one game, and everybody will anyway.'}`],
      writer: [`${won ? 'The ' + n + ' have the one thing every club wants from the first night: a result to point to.' : 'The ' + n + ' will say it is one game of 162. They are right, and the next few weeks will show whether it was the start of something.'}`],
      podcast: [`${won ? 'Great start, now do it 80 more times.' : 'One game. I have said it before, I will say it again: one game.'}`],
      forum: [`${won ? 'We are undefeated. Season is going great.' : 'Season is over. See you next year.'}`],
    },
    mixed: {
      radio: [`Look at the whole night, not just the one inning. ${nm} gave us length and gave us hope, and he gave up the one pitch he will want back.`, `I have heard people calling ${nm} a bust after one game, and I have heard people calling the ${n} champions. Both groups should calm down.`],
      writer: [`${won ? 'A win and plenty to chew on' : 'A loss, but the more interesting question is what to make of the night'}: ${nm} was neither the disaster the opening inning suggested nor the saviour he is paid to be.`],
      podcast: [`I would take that line from ${nm} every fifth day. Ignore the home run, watch what he did after it.`],
      forum: [`First-inning homer, then six solid. I will take that and pretend I was never worried.`, `${won ? 'We won. Everything else is noise.' : 'We lost. Everything else is noise, but louder.'}`],
    },
  }[tone];
  for (const [who, host] of [['radio', o.radio], ['writer', o.writer], ['podcast', o.podcast], ['forum', null]]) {
    if (!V[who]) continue;
    parts.push({ q: rng.pick(V[who]).replace(/^(\w)/, (m) => m.toUpperCase()), by: host ? `${host.host}, ${host.outlet}` : `${rng.pick(o.forum.handles)}, on ${o.forum.outlet}` });
  }
  message({ cat: 'club', important: true, title: won ? `Opening Day: ${c.city} start with a win` : debut ? 'Opening Day: a defeat, and a debut to talk about' : `Opening Day: ${c.city} lose the opener`, parts, player: debut?.id, body: `The morning after the first game of the season.` });
}
