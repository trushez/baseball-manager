// After the World Series: the winning club's city, owner, players and ticket office, over the next few days, written on
// the day from what the club's books and roster say by then. A club that loses the final gets a quieter set. The follow-ups
// are queued as plain data (inbox.later) so they survive a save.
import { game } from '../state.js';
import { Rng } from '../core/rng.js';
import { fullName, isPitcher } from '../data/world.js';
import { value } from './value.js';
import { message, later, onLater } from './inbox.js';
import { voices } from './media.js';
import { capacity } from './crowd.js';
import { owner } from './finance.js';
import { confidenceWords } from './reactions.js';
import { absDay } from './calendar.js';

const W = () => game.world;
const club = (id) => W().orgs.get(id).club;

/** The champion won or lost by the user's club: start the coverage. Called once, when the World Series ends. */
export function announceTitle({ champ, loser, mvp }) {
  const me = game.orgId;
  if (champ === me) {
    later(1, { kind: 'title-city', orgId: me, mvp });
    later(1, { kind: 'title-owner', orgId: me });
    later(2, { kind: 'title-parade', orgId: me, mvp });
    later(3, { kind: 'title-press', orgId: me, mvp });
    later(5, { kind: 'title-tickets', orgId: me });
    // a title lifts the clubhouse and the crowds into next season
    for (const p of W().orgs.get(me).players) p.mood = Math.min(100, (p.mood ?? 60) + 8);
    (game.buzz ||= {})[me] = { v: 0.35, from: absDay(game.date), days: 240 };
  } else if (loser === me) {
    later(1, { kind: 'final-city', orgId: me, champ });
    later(1, { kind: 'final-owner', orgId: me });
  }
}

const playerOf = (id) => (id ? W().players.get(id) : null);

onLater('title-city', ({ orgId, mvp }) => {
  const c = club(orgId), rng = new Rng(`tc-${game.season?.year}-${game.luck}`);
  const crowd = Math.round((capacity(orgId) * (3.5 + rng.next() * 2)) / 1000) * 1000;
  const p = playerOf(mvp);
  message({
    cat: 'club', important: true, title: `${c.city} did not sleep: the morning after`,
    body: `${c.city} woke up this morning as the home of the World Series champions, though for most of the city the night never really ended.\n\nPolice estimate that more than ${crowd.toLocaleString('en-US')} people were in the streets around the ballpark after the last out. Bars stayed open until dawn, car horns could be heard across the city, and there are reports of strangers hugging at traffic lights. Shops are already selling out of championship shirts, and the club store has opened early to meet a queue that goes round the block.${p ? `\n\n${fullName(p)}, the series MVP, was still being stopped for photographs on the street at breakfast.` : ''}\n\n${game.manager} walked out of the ballpark at four in the morning to a crowd that would not stop chanting the name of the club.`,
    voices: voices(orgId, 'champions', { p }, 1),
  });
});

onLater('title-owner', ({ orgId }) => {
  const c = club(orgId), o = owner(orgId), rng = new Rng(`to-${game.season?.year}-${game.luck}`);
  const words = confidenceWords()[0].toLowerCase();
  const line = rng.pick([
    `The owner has been on the phone since the last out. He has told the board this is the best night of his time in baseball, and that ${game.manager} will not be asked to explain anything this winter.`,
    `The owner came into the clubhouse in the middle of the celebration, soaked in champagne, and told ${game.manager} in front of the players that the club would never forget this.`,
    `Not a man for speeches, the owner kept it short: "Thank you. You have given this club and this city something they will have forever."`]);
  message({
    cat: 'club', important: true, title: `The owner: "You have given this city something forever"`,
    body: `${line}\n\nHis confidence in you stands at: ${words}.\n\nHe has also told the press that winning is what the club is for, and that he intends to keep the core of the team together for another run. Whether the budget will stretch that far is a question for the winter.`,
  });
});

onLater('title-parade', ({ orgId, mvp }) => {
  const c = club(orgId), rng = new Rng(`tp-${game.season?.year}-${game.luck}`);
  const crowd = Math.round((capacity(orgId) * (12 + rng.next() * 10)) / 10000) * 10000;
  const p = playerOf(mvp);
  const org = W().orgs.get(orgId);
  const star = p ?? org.players.filter((x) => x.level === 'MLB').sort((a, b) => value(b) - value(a))[0];
  const quote = rng.pick([
    `"I have played in front of big crowds, and I have never seen anything like this. Thank you, ${c.city}."`,
    `"We did this for you. All year, you were there, and tonight we are bringing the trophy home to you."`,
    `"I looked out at the street and I could not see the end of it. This is the best day of my career."`]);
  message({
    cat: 'club', important: true, title: `The ${c.name} parade: ${crowd.toLocaleString('en-US')} line the streets`,
    body: `The victory parade wound through downtown this afternoon, and the city turned out as it rarely has. The police put the crowd at about ${crowd.toLocaleString('en-US')}, ten and twelve deep in places, with fans on balconies, rooftops and lamp posts.\n\nThe players rode on open trucks with the trophy, ${game.manager} with them, and the biggest cheers went to ${fullName(star)} and the pitching staff. At the rally at city hall the mayor handed the club the keys to the city, and ${star.last} took the microphone: ${quote}\n\nIt was the loudest the city has been for years, and it was still going when the last truck pulled away.`,
    voices: voices(orgId, 'champions', { p: star }, 1),
  });
});

onLater('title-press', ({ orgId, mvp }) => {
  const c = club(orgId), p = playerOf(mvp);
  message({
    cat: 'league', title: `Baseball reacts: ${c.name} are worthy champions`,
    body: `The rest of baseball has had its say on the ${game.season?.year ?? game.year} champions.\n\nThe national view is that the ${c.name} won it properly: through a long season and a harder October, against the best the league had to offer.${p ? ` ${fullName(p)}'s series is already being talked about as one of the great October performances.` : ''}\n\nEvery club in the league now knows what the ${c.name} did to win it, and what it will take to beat them next year. The target on this club's back has just got a lot bigger.`,
    voices: voices(orgId, 'champions', { p }, 1),
  });
});

onLater('title-tickets', ({ orgId }) => {
  const c = club(orgId), rng = new Rng(`tt-${game.season?.year}-${game.luck}`);
  const sold = Math.round((capacity(orgId) * (0.12 + rng.next() * 0.08)) / 10) * 10;
  message({
    cat: 'club', title: `Ticket office: ${sold.toLocaleString('en-US')} new season tickets since the title`,
    body: `${c.city}'s ticket office has sold ${sold.toLocaleString('en-US')} new season tickets since the World Series, the best week the club can remember. Sponsors are calling, the club store has sold out of championship merchandise twice, and the waiting list for next April is the longest it has ever been.\n\nThe crowds should stay big well into next season. How long they stay depends on what the team does once the games count again.`,
  });
});

onLater('final-city', ({ orgId, champ }) => {
  const c = club(orgId), k = club(champ);
  message({
    cat: 'club', important: true, title: `${c.city} wakes up to a World Series defeat`,
    body: `It was quiet in ${c.city} this morning. The ${c.name} lost the World Series to ${k.city}, and a city that spent the month dreaming of a parade is not ready to talk about it yet.\n\nBut the fans did not leave the ballpark when the last out was made. Thousands stayed to applaud the players off the field, and callers to the radio this morning are saying thank you at least as often as they are saying it hurts.\n\nThe players cleared their lockers this morning. Most said they would be back, and meant it.`,
    voices: voices(orgId, 'heartbreak', {}, 1),
  });
});

onLater('final-owner', ({ orgId }) => {
  const words = confidenceWords()[0].toLowerCase();
  message({
    cat: 'club', title: `The owner after the final: proud, and hungry`,
    body: `The owner met you in the tunnel after the last game and told you he was proud, and that he does not intend to stop at one final. His confidence in you stands at: ${words}.\n\nHe wants to know what the club needs to get one win further next year, and has asked for your thoughts when the winter begins.`,
  });
});
