// The pennant races in the last weeks: who has clinched a division or a postseason place and who is
// out of it, worked out each night from wins and games left. Your club's moments come as messages with
// the race table; everyone else's as league news and headlines. A place is called clinched only when no
// set of results can take it away (ties count against the club, so it is never called early).
import { game } from '../state.js';
import { divisions, leagues } from './standings.js';
import { message } from './inbox.js';
import { headline } from './headlines.js';

const city = (id) => game.world.clubs.get(id).city;
const nick = (id) => { const c = game.world.clubs.get(id); return `${c.full ?? `${c.city} ${c.name}`}`; };
const shortDiv = (d) => d.replace('American League', 'AL').replace('National League', 'NL');
const shortLg = (l) => (l.startsWith('American') ? 'AL' : 'NL');

function left() {
  const n = new Map();
  for (const g of game.season.games) {
    if (g.level !== 'MLB' || g.post || g.s) continue;
    n.set(g.home, (n.get(g.home) || 0) + 1);
    n.set(g.away, (n.get(g.away) || 0) + 1);
  }
  return n;
}

/** Each night from late August: clinches and eliminations. */
export function raceWatch(d) {
  const S = game.season;
  if (!S || d < S.end - 35) return;
  const R = S.records, rem = left();
  const w = (id) => R.get(id)?.w || 0;
  const maxW = (id) => w(id) + (rem.get(id) || 0);
  const done = (S.race ||= { div: {}, spot: {}, out: {}, divOut: {} });
  const me = game.orgId;
  const divs = [...divisions().entries()];
  const divOf = (id) => divs.find(([, ids]) => ids.includes(id));

  for (const [div, ids] of divs) {
    const lead = ids[0];
    if (!done.div[div] && ids.slice(1).every((y) => maxW(y) < w(lead))) {
      done.div[div] = lead;
      done.spot[lead] = true;
      announce('div', lead, div, ids, maxW, rem);
    }
    for (const y of ids.slice(1)) {
      if (y === me && !done.divOut[y] && !done.div[div] && maxW(y) < w(lead)) {
        done.divOut[y] = true;
        announce('divOut', y, div, ids, maxW, rem);
      }
    }
  }
  for (const lg of leagues()) {
    const clubs = divs.filter(([dv]) => dv.startsWith(lg)).flatMap(([, ids]) => ids);
    for (const x of clubs) {
      // a place: fewer than three others can finish level with or above him (or he has won the division)
      if (!done.spot[x] && clubs.filter((y) => y !== x && maxW(y) >= w(x)).length < 3) {
        done.spot[x] = true;
        announce('spot', x, lg, clubs, maxW, rem);
      }
      // out: he can't win his division and six clubs are already beyond his reach
      const [, mine] = divOf(x);
      const cantWinDiv = mine.some((y) => y !== x && w(y) > maxW(x));
      if (!done.out[x] && cantWinDiv && clubs.filter((y) => w(y) > maxW(x)).length >= 6) {
        done.out[x] = true;
        announce('out', x, lg, clubs, maxW, rem);
      }
    }
  }
}

function raceTable(ids, maxW, rem) {
  const R = game.season.records;
  const top = R.get(ids[0]);
  return { head: ['Club', 'W', 'L', 'GB', 'Left', 'Most wins possible'], rows: ids.map((id) => {
    const r = R.get(id);
    const gb = ((top.w - r.w) + (r.l - top.l)) / 2;
    return [nick(id), r.w, r.l, gb <= 0 ? '-' : gb % 1 ? gb.toFixed(1) : String(gb), rem.get(id) || 0, maxW(id)];
  }) };
}

function announce(kind, id, where, ids, maxW, rem) {
  const me = game.orgId;
  const mine = id === me;
  const r = game.season.records.get(id);
  const rec = `${r.w}-${r.l}`;
  const lgIds = (lg) => ids.slice().sort((a, b) => game.season.records.get(b).w - game.season.records.get(a).w || game.season.records.get(a).l - game.season.records.get(b).l);
  if (kind === 'div') {
    const second = ids[1];
    headline(`${city(id).toUpperCase()} CLINCH THE ${shortDiv(where).toUpperCase()}`, mine);
    message({
      cat: mine ? 'club' : 'league', important: mine, stop: mine && game.settings.stops.important, quiet: true,
      title: mine ? `Champions of the ${shortDiv(where)}!` : `${nick(id)} clinch the ${shortDiv(where)}`,
      parts: [
        { p: mine ? `The ${nick(id)} are ${shortDiv(where)} champions. At ${rec}, nobody in the division can catch them now, and the clubhouse is soaked in champagne. ${city(second)} are the closest, and even winning every game left would not be enough.`
          : `${nick(id)} have won the ${shortDiv(where)}. At ${rec} they are out of reach of ${city(second)}, the nearest club, with ${rem.get(id) || 0} games still to play.` },
        { p: 'A division title means a place in the postseason, and the top two division winners in each league go straight to the Division Series.' },
        raceTable(ids, maxW, rem),
      ],
    });
  } else if (kind === 'spot') {
    if (game.season.race.div && Object.values(game.season.race.div).includes(id)) return;
    headline(`${city(id).toUpperCase()} ARE IN: POSTSEASON PLACE CLINCHED`, mine);
    message({
      cat: mine ? 'club' : 'league', important: mine, stop: mine && game.settings.stops.important, quiet: true,
      title: mine ? 'We are going to the postseason' : `${nick(id)} clinch a postseason place`,
      parts: [
        { p: mine ? `It is official: ${nick(id)} will play in October. At ${rec}, too few clubs can still catch them for the place to slip away. The division may yet be won; either way there will be postseason baseball in ${city(id)}.`
          : `${nick(id)} are sure of a postseason place at ${rec}. Whether they go in as division winners or through the Wild Card is still to be settled.` },
        { ...raceTable(lgIds(where).slice(0, 9), maxW, rem), head: ['Club', 'W', 'L', 'GB on the best record', 'Left', 'Most wins possible'] },
      ],
    });
  } else if (kind === 'out') {
    headline(`${city(id).toUpperCase()} ELIMINATED FROM THE POSTSEASON RACE`, mine);
    if (!mine) return;
    message({
      cat: 'club', important: true, stop: game.settings.stops.important, quiet: true,
      title: 'Out of the postseason race',
      parts: [
        { p: `The ${nick(id)} have been eliminated. At ${rec}, even winning every game left would not be enough to catch the clubs above them in the ${shortLg(where)}. There are still games to play, and the owner will be watching how the season ends: it is a chance to look at young players before the winter.` },
        { ...raceTable(lgIds(where).slice(0, 9), maxW, rem), head: ['Club', 'W', 'L', 'GB on the best record', 'Left', 'Most wins possible'] },
      ],
    });
  } else if (kind === 'divOut') {
    message({
      cat: 'club', quiet: true,
      title: `The ${shortDiv(where)} title is gone`,
      parts: [
        { p: `${city(ids[0])} are beyond reach in the ${shortDiv(where)} at ${game.season.records.get(ids[0]).w} wins; the most the ${nick(id)} (${rec}) can now reach is ${maxW(id)}. A Wild Card place is the only way into the postseason now.` },
        raceTable(ids, maxW, rem),
      ],
    });
  }
}
