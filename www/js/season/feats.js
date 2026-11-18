// The rare things a pitching staff can do in a game: a no-hitter, a perfect game. They are big news anywhere in the
// majors and front-page news when they are yours: a full story in the inbox (which also becomes the headline), a
// stop on the Continue screen for your own club, and the follow-up coverage a day or two later.
import { game } from '../state.js';
import { message, later } from './inbox.js';
import { fullName } from '../data/world.js';

const city = (id) => game.world.clubs.get(id)?.city ?? id;
const NAME = (id) => game.world.clubs.get(id)?.name ?? id;
const IP = (outs) => `${Math.floor(outs / 3)}${outs % 3 ? `.${outs % 3}` : '.0'}`;
const WORDS = { 1: 'one', 2: 'two', 3: 'three', 4: 'four', 5: 'five', 6: 'six', 7: 'seven', 8: 'eight', 9: 'nine', 10: 'ten', 11: 'eleven', 12: 'twelve' };
const w = (n) => WORDS[n] ?? String(n);

/** What the staff of one side did in a finished game. */
function staffLine(rec, eng, key) {
  const org = rec[key];
  const rows = [];
  for (const [id, L] of eng.stats) {
    if (!L.pOuts && !L.BF) continue;
    const p = game.world.players.get(id);
    if (p && p.orgId === org) rows.push({ p, L });
  }
  const sum = (k) => rows.reduce((a, r) => a + (r.L[k] || 0), 0);
  return { rows, outs: sum('pOuts'), H: sum('pH'), R: sum('pR'), BB: sum('pBB'), HBP: sum('pHBP'), K: sum('pK'), BF: sum('BF') };
}

/** Called for every finished major league game. Posts the story if a staff held the other side without a hit. */
export function gameFeats(rec, eng) {
  if (rec.inn < 9) return; // a game cut short by rain is not recorded as one
  const mineOrg = game.orgId;
  for (const key of ['away', 'home']) {
    const other = key === 'away' ? 'home' : 'away';
    if (eng.side[other].hits !== 0) continue;
    const S = staffLine(rec, eng, key);
    if (S.outs < 27 || !S.rows.length) continue;
    const mine = rec[key] === mineOrg, against = rec[other] === mineOrg;
    const perfect = S.BB === 0 && S.HBP === 0 && (eng.side[key].errors || 0) === 0 && S.BF === S.outs;
    const combined = S.rows.length > 1;
    const lead = [...S.rows].sort((a, b) => (b.L.pOuts || 0) - (a.L.pOuts || 0))[0];
    const pit = lead.p, name = fullName(pit);
    const club = city(rec[key]), foe = city(rec[other]), foeName = NAME(rec[other]);
    const score = `${rec.s[key === 'away' ? 0 : 1]}-${rec.s[key === 'away' ? 1 : 0]}`;
    const pc = lead.L.pitches;
    let title, body;
    if (combined) {
      const who = S.rows.map((r) => `${r.p.last} (${IP(r.L.pOuts || 0)})`).join(', ');
      title = perfect ? `PERFECT! ${club.toUpperCase()} COMBINE FOR A PERFECT GAME` : `NO-HITTER! ${club.toUpperCase()} COMBINE TO SHUT OUT ${foe.toUpperCase()} HITLESS`;
      body = `${club} used ${w(S.rows.length)} pitchers to hold ${foe} without a hit in a ${score} win: ${who}. ${S.BB ? `They walked ${w(S.BB)}${S.HBP ? ` and hit ${w(S.HBP)}` : ''}, ` : ''}${S.K ? `struck out ${S.K}` : 'struck out none'} and faced ${S.BF} batters.`;
    } else if (perfect) {
      title = `PERFECT! ${name.toUpperCase()} THROWS A PERFECT GAME`;
      body = `${name} retired all ${S.outs} ${foe} batters in order on ${pc ? `${pc} pitches ` : ''}for ${club}, a perfect game, with ${S.K} strikeouts in a ${score} win. Nobody reached base by hit, walk, hit by pitch or error. There have been very few in the history of the game.`;
    } else {
      const reached = S.BB + S.HBP + (eng.side[key].errors || 0);
      const how = S.BB === 1 && !S.HBP && !eng.side[key].errors ? 'a single walk' : reached === 1 ? 'one runner on an error or a hit batter' : `${w(reached)} baserunners`;
      const near = reached === 1;
      title = `NO-HITTER! ${name.toUpperCase()} ${near ? 'ONE BATTER SHORT OF PERFECT' : 'HOLDS ' + foe.toUpperCase() + ' HITLESS'}`;
      body = `${name} threw a no-hitter for ${club} against ${foe}, ${S.outs === 27 ? 'nine' : IP(S.outs)} innings with no hits allowed and ${S.R ? `${S.R} run${S.R > 1 ? 's' : ''}` : 'no runs'}, ${S.K} strikeouts${pc ? ` and ${pc} pitches` : ''}. ${near ? `Only ${how} kept it from being a perfect game, ` : `He allowed ${how}, `}in a ${score} ${rec[key] === (rec.s[0] > rec.s[1] ? rec.away : rec.home) ? 'win' : 'loss'}.`;
    }
    if (against) body += ` It was your lineup that was held without a hit, and the dressing room is quiet.`;
    else if (mine) body += ` The ${NAME(rec[key])} clubhouse emptied onto the field when the last out was made.`;
    message({ cat: 'league', title, headline: title, body, important: mine || against, stop: (mine || against) && game.settings.stops.important, player: pit.id });
    const next = mine ? `${name} is the talk of the sport after his ${perfect ? 'perfect game' : 'no-hitter'}. Your pitching coach says he will be kept on his normal routine, and the ${foeName} have little to say about it.` : against ? `The press are asking how your hitters went a whole game without one. Coaches say it happens to everybody, even if it is rarely this complete.` : `${name}'s ${perfect ? 'perfect game' : 'no-hitter'} for ${club} is still the main topic around the league two days on.`;
    later(2, { cat: 'league', title: `${name}: the day after`, body: next, quiet: true, player: pit.id });
  }
}
