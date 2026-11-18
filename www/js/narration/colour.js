// Colour: the asides a radio man drops into the gaps between the action. Each comes from something true
// about the game or the players: their season, their attributes (power, speed, a wild arm, a short fuse),
// how they have done against each other, the pitch count and the bullpen, the crowd and the score.
// At most one aside between batters, never the same kind twice running, and never the same fact twice
// in a game.
import { attr } from '../data/attributes.js';
import { honourSummary, honourCount } from '../data/honours.js';
import { recentForm } from '../season/media.js';

const vs = (p, k, hand) => { const a = attr(p, k); return Array.isArray(a) ? a[hand === 'L' ? 1 : 0] : a; };
const r3 = (v) => (typeof v === 'string' ? v : v == null ? '' : v.toFixed(3).replace(/^0/, ''));

export class Colour {
  /** @param {any} narr the narrator (names, rng, teams, ctx)  @param {{attendance?:string, year?:number}} o */
  constructor(narr, o = {}) {
    this.n = narr;
    this.o = o;
    this.told = new Set();
    this.lastKind = null;
    this.gap = 0; // at-bats since the last aside
  }

  once(key) { if (this.told.has(key)) return false; this.told.add(key); return true; }

  /** After the batter is introduced: one aside, now and then. */
  beforePA(e) {
    this.gap++;
    const n = this.n, rng = n.rng, b = e.board;
    if (this.gap < 1 || !rng.chance(0.65)) return [];
    const bat = n.p(e.data.batterId), pit = n.p(b.pitcherId);
    if (!bat || !pit) return [];
    const hand = pit.throws === 'L' ? 'L' : 'R';
    const B = n.last(bat.id), P = n.last(pit.id);
    const late = e.inning >= 7, close = Math.abs(b.score.home - b.score.away) <= 1;
    const fieldKey = e.half === 'top' ? 'home' : 'away', batKey = e.half === 'top' ? 'away' : 'home';
    const ideas = [];
    const add = (kind, key, text) => { if (text && kind !== this.lastKind && !this.told.has(key)) ideas.push({ kind, key, text }); };

    // his season
    const when = bat.season === this.o.year ? 'this season' : 'last season';
    if (bat.hr >= 25) add('season', `hr-${bat.id}`, rng.pick([`${B} hit ${bat.hr} home runs ${when}.`, `${bat.hr} home runs ${when} for ${B}. ${P} will be careful.`]));
    if (parseFloat(bat.avg) >= 0.3 && bat.pa >= 150) add('season', `avg-${bat.id}`, `${B} is a ${r3(bat.avg)} hitter ${when}, one of the best in the league.`);
    if (parseFloat(bat.avg) > 0 && parseFloat(bat.avg) < 0.215 && bat.pa >= 150) add('season', `low-${bat.id}`, `It has been a hard year at the plate for ${B}, batting ${r3(bat.avg)} ${when}.`);

    // his honours, and how he has been going
    const hon = honourSummary(bat, 2);
    const nAS = honourCount(bat, 'All-Star');
    if (hon && (nAS >= 2 || /MVP|Cy Young|Rookie/.test(hon))) add('honours', `hon-${bat.id}`, rng.pick([`${B}: ${hon}. Quite a record.`, `A big name at the plate: ${B}, ${hon}.`]));
    const pHon = honourSummary(pit, 2);
    if (pHon && /Cy Young|All-Star/.test(pHon) && honourCount(pit, 'All-Star') + honourCount(pit, 'Cy Young') >= 2) add('honours', `hon-${pit.id}`, `On the mound, ${P}: ${pHon}.`);
    const f = recentForm(bat);
    if (f?.hot) add('form', `hot-${bat.id}`, rng.pick([`${B} comes in hot: ${f.text}.`, `Nobody is swinging it better than ${B} lately: ${f.text}.`]));
    if (f?.cold) add('form', `cold-${bat.id}`, rng.pick([`${B} is fighting it: ${f.text}.`, `A tough stretch for ${B}, ${f.text}. The crowd is getting restless.`]));

    // what the scouts say about him
    const pow = vs(bat, 'power', hand), con = vs(bat, 'contact', hand), eye = vs(bat, 'eye', hand), avk = vs(bat, 'avoidK', hand), spd = attr(bat, 'speed');
    if (pow >= 18) add('scout', `pow-${bat.id}`, rng.pick([`${B} has as much raw power as anyone in the game.`, `Any mistake to ${B} could leave the ballpark.`]));
    if (avk >= 18) add('scout', `avk-${bat.id}`, `${B} is one of the hardest men in baseball to strike out.`);
    if (eye >= 18) add('scout', `eye-${bat.id}`, `${B} won't chase. ${P} will have to throw him strikes.`);
    if (spd >= 18) add('scout', `spd-${bat.id}`, `${B} is one of the fastest men in the league. Anything on the ground and he'll be flying.`);
    if (con <= 5 && bat.pa >= 50) add('scout', `con-${bat.id}`, `${B} has struggled to make contact against ${hand === 'L' ? 'left' : 'right'}-handers.`);
    const split = attr(bat, 'contact');
    if (Array.isArray(split) && bat.bats === pit.throws && Math.abs(split[0] - split[1]) >= 3) {
      add('scout', `plat-${bat.id}`, `${B} is a much weaker hitter against ${hand === 'L' ? 'lefties' : 'righties'}, and ${P} throws with his ${hand === 'L' ? 'left' : 'right'}.`);
    }

    // against each other
    const meet = n.ctx.meet?.(bat.id, pit.id);
    if (meet) add('meet', `meet-${bat.id}-${pit.id}`, `${B} is ${meet} against ${P} this season.`);

    // the pitcher
    if (attr(pit, 'stuff') >= 18) add('pitcher', `stf-${pit.id}`, `${P} has some of the nastiest stuff in the league.`);
    if (attr(pit, 'control') >= 18) add('pitcher', `ctl-${pit.id}`, `${P} hardly walks anybody. He lives on the corners.`);
    if (attr(pit, 'velocity') >= 18) add('pitcher', `vel-${pit.id}`, `${P} can run his fastball up near a hundred.`);
    if (attr(pit, 'control') <= 5) add('pitcher', `wild-${pit.id}`, `${P} has had trouble finding the strike zone all year.`);
    const pc = b.pitchCount ?? 0, sta = attr(pit, 'stamina') ?? 10;
    if (pc >= 70 + sta * 2) add('pitcher', `tired-${pit.id}-${Math.floor(pc / 15)}`, rng.pick([`${P} is at ${pc} pitches, and he's labouring.`, `${pc} pitches for ${P}. He's running out of gas.`]));
    if (pc >= 85 || (e.inning >= 6 && close)) add('bullpen', `pen-${fieldKey}-${e.inning}`, rng.pick([`There's movement in the ${n.teams[fieldKey].city} bullpen.`, `The phone has rung in the ${n.teams[fieldKey].city} bullpen. Somebody is getting loose.`]));

    // character, from the mental attributes
    const today = n.ctx.today(bat.id);
    if (attr(bat, 'temper') <= 5 && today?.K) add('character', `temper-${bat.id}`, `${B} struck out last time up, and he didn't take it well.`);
    if (late && close && attr(bat, 'comp') >= 17) add('character', `comp-${bat.id}`, `If you want anyone at the plate in this spot, it's ${B}. Nothing rattles him.`);
    if (late && close && attr(bat, 'comp') <= 4) add('character', `nerves-${bat.id}`, `${B} has been known to tighten up in spots like this.`);

    // what he did earlier today
    const did = n.didLog?.[bat.id];
    if (did?.length) {
      const last = did.at(-1);
      const WORDS = { K: 'struck out', BB: 'walked', IBB: 'was walked intentionally', HBP: 'was hit by a pitch', '1B': 'singled', '2B': 'doubled', '3B': 'tripled', HR: 'homered',
        GO: 'grounded out', FO: 'flied out', LO: 'lined out', PO: 'popped up', DP: 'hit into a double play', LDP: 'lined into a double play', SF: 'drove one in with a sacrifice fly', FC: 'reached on a fielder\'s choice', E: 'reached on an error' };
      const nth = ['', 'first', 'second', 'third', 'fourth', 'fifth'][did.length] || 'last';
      // the notable ones only: the introduction already says how many hits he has
      if (['1B', '2B', '3B', 'HR', 'K', 'DP', 'LDP', 'SF', 'E'].includes(last) && !(last === 'K' && attr(bat, 'temper') <= 5)) add('today', `did-${bat.id}-${did.length}`, rng.pick([`${B} ${WORDS[last]} in his ${nth} at-bat.`, `Last time up, ${B} ${WORDS[last]}.`]));
    }
    // the pitcher's night
    const run = n.retired?.[pit.id] || 0;
    if (run >= 6) add('pitcher', `ret-${pit.id}-${run}`, rng.pick([`${P} has retired ${run} in a row.`, `${run} straight outs for ${P}.`]));
    const pk = n.ctx.today(pit.id)?.pK || 0;
    if (pk >= 6) add('pitcher', `k-${pit.id}-${pk}`, `${P} has ${pk} strikeouts tonight.`);
    const ps = n.ctx.today(pit.id);
    if (ps && ps.pOuts >= 9 && e.inning >= 3) {
      const ip = `${Math.floor(ps.pOuts / 3)}${ps.pOuts % 3 ? `.${ps.pOuts % 3}` : ''}`;
      const hw = (ps.pH || 0) + (ps.pBB || 0);
      if (hw <= 2) add('pitcher', `line-${pit.id}-${Math.floor(ps.pOuts / 6)}`, `${P} has allowed ${ps.pH || 0} ${ps.pH === 1 ? 'hit' : 'hits'} and ${ps.pBB || 0} ${ps.pBB === 1 ? 'walk' : 'walks'} through ${ip} innings.`);
      else if ((ps.pR || 0) >= 4) add('pitcher', `rough-${pit.id}-${ps.pR}`, `${P} has given up ${ps.pR} runs on ${ps.pH || 0} hits in ${ip} innings.`);
    }
    if (ps && ps.pBB >= 3) add('pitcher', `bb-${pit.id}-${ps.pBB}`, `${P} has walked ${ps.pBB} tonight.`);
    if (ps && ps.pitches >= 40 && ps.pOuts > 0 && ps.pitches / Math.max(1, ps.pOuts) <= 4) add('pitcher', `eff-${pit.id}-${Math.floor(ps.pitches / 20)}`, `${P} has needed only ${ps.pitches} pitches to get ${ps.pOuts} outs.`);
    const hits = b.hits?.[batKey] ?? 1;
    if (hits === 0 && e.inning >= 4 && e.inning < 6) add('crowd', `nohit-${batKey}-${e.inning}`, `${n.teams[batKey].city} are still looking for their first hit.`);
    if (e.inning >= 3 && e.inning <= 5) add('crowd', 'evening', rng.pick([`A good crowd in tonight, ${this.o.attendance || 'a big one'}.`, `${n.teams.home.city} fans have turned out in numbers tonight.`]));
    const rec = n.teams[batKey].record;
    if (rec && rec !== '0-0' && e.inning <= 4) add('crowd', `rec-${batKey}`, `${n.teams[batKey].city} came into tonight at ${rec.replace('-', ' and ')}.`);

    // where the club stands in the season: the division, the wild card, what a win tonight could mean
    const facts = n.story?.race?.[batKey];
    if (facts?.length && e.inning <= 6) add('race', `race-${batKey}-${e.inning < 4 ? 0 : 1}`, rng.pick(facts));
    const ffacts = n.story?.race?.[fieldKey];
    if (ffacts?.length && e.inning >= 2 && e.inning <= 7) add('race', `race-${fieldKey}-${e.inning < 5 ? 0 : 1}`, rng.pick(ffacts));
    if (late && close && n.story?.clinch?.[batKey]) add('race', `clinch-${batKey}`, n.story.clinch[batKey].div ? `A hit here could win ${n.teams[batKey].city} the division.` : `${n.teams[batKey].city} are close to clinching a place in October, and this game could do it.`);
    if (late && close && n.story?.elim?.[batKey]) add('race', `elim-${batKey}`, `If ${n.teams[batKey].city} lose this one, their season is over.`);
    const fin = n.story?.finale;
    if (fin && fin.round && fin.round !== 'WS' && e.inning >= 6 && close) add('race', `fin-${e.inning}`, fin.round === 'LCS' ? 'The pennant is the prize, and every pitch in the late innings feels like it.' : fin.round === 'DS' ? 'A trip to the Championship Series depends on these last few innings.' : 'One game from the Division Series, and nobody in the ballpark is sitting.');

    // the crowd and the score
    const lead = b.score[batKey] - b.score[fieldKey];
    if (late && close && batKey === 'home') add('crowd', `crowd-${e.inning}`, rng.pick([`${this.o.attendance ? `${this.o.attendance} here` : 'The crowd'}, and they're all on their feet.`, 'The home crowd wants something to happen here.']));
    if (late && lead <= -5 && batKey === 'home') add('crowd', `exits-${e.inning}`, 'Some of the home crowd are making for the exits.');
    if (late && lead >= 5 && batKey === 'away') add('crowd', `quiet-${e.inning}`, 'It has gone very quiet in the stands.');
    if (!ideas.length) return [];
    const pick = rng.pick(ideas);
    this.told.add(pick.key);
    this.lastKind = pick.kind;
    this.gap = 0;
    return [{ text: pick.text, cls: 'colour', hold: 1.1, key: false }];
  }

  /** The crowd after a big moment. */
  afterRuns(e, homeRun) {
    const n = this.n, rng = n.rng;
    const home = e.half === 'bottom';
    if (!rng.chance(homeRun ? 0.7 : 0.25)) return [];
    const text = home
      ? rng.pick(homeRun ? ['The place is rocking!', 'Listen to this crowd!', 'What a noise in here!'] : ['The home crowd loves it.', 'A big cheer goes up.'])
      : rng.pick(homeRun ? ['That silences the crowd.', 'You could hear a pin drop.', 'The home fans can only watch it go.'] : ['A groan around the ballpark.', 'That quietens the home crowd.']);
    return [{ text, cls: 'colour', hold: 1, key: false }];
  }
}
