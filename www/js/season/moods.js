// Player moods. Each week a player compares where he is with where he thinks he should be: a regular
// expects to play most days, a starter expects to start, a big leaguer expects to be in the majors.
// Being let down lowers his mood, getting what he expects and winning raise it, and it drifts back
// towards contentment. A slump the fans have noticed weighs on him too, more on a player without composure.
// Mood moves his form a little (moodShift) and, for your players, brings the odd
// message: one sentence picked from a grid of cause by how unhappy he is.
import { isPitcher, fullName } from '../data/world.js';
import { game, orgState } from '../state.js';
import { value } from './value.js';
import { message } from './inbox.js';
import { Rng } from '../core/rng.js';
import { fanPressure, recentForm, mediaQuote } from './media.js';
import { headline } from './headlines.js';
import { lifeMood } from './personality.js';
import { moodLift } from './coaching.js';
import { absDay } from './calendar.js';

export const MOOD_START = 60;
const mood = (p) => p.mood ?? MOOD_START;

/** Grade points of form from mood: at most about -2 for a furious player, +1 for a delighted one. */
export const moodShift = (p) => (p.mood == null ? 0 : ((p.mood - MOOD_START) / 40) * 1.2 * (1 - ((p.r?.temper ?? 50) - 50) / 70));

export function moodWords(p) {
  const m = mood(p);
  const why = p.moodWhy ? WHY_SHORT[p.moodWhy] : '';
  if (m >= 75) return ['Delighted', 'cm-g'];
  if (m >= 55) return ['Content', ''];
  if (m >= 40) return [`Restless${why ? ` (${why})` : ''}`, 'cm-y'];
  if (m >= 25) return [`Unhappy${why ? ` (${why})` : ''}`, 'cm-r'];
  return [`Furious${why ? ` (${why})` : ''}`, 'cm-r'];
}

const WHY_SHORT = { time: 'playing time', demoted: 'in the minors', role: 'his role', fans: 'the fans' };

// [cause][severity] -> sentences; {name} {level} {city}
const SAYS = {
  time: {
    unhappy: [
      '{name} has told the coaches he wants to play more. He has started {g} of the last {t} games.',
      '{name} is not happy sitting on the bench. He feels he has earned more at-bats.',
    ],
    furious: [
      '{name}\'s agent has been on the phone. His client wants to play every day, here or somewhere else.',
      '{name} skipped batting practice today. The word in the clubhouse is that he wants out if he can\'t play.',
    ],
  },
  demoted: {
    unhappy: [
      '{name} believes he belongs in the majors and is frustrated to still be in {level}.',
      '{name} has told the {level} manager he doesn\'t understand why he hasn\'t been called up.',
    ],
    furious: [
      '{name}\'s agent says his client is being held back in {level} and is asking for a trade.',
      'The {level} staff report that {name} has stopped listening. He is convinced he should be in the majors.',
    ],
  },
  role: {
    unhappy: [
      '{name} sees himself as a starter and is unhappy in the bullpen.',
      '{name} has asked the pitching coach why he has lost his place in the rotation.',
    ],
    furious: [
      '{name}\'s agent says his client will not accept a relief role much longer.',
    ],
  },
  fans: {
    unhappy: [
      '{name} is feeling the heat from the stands. The coaches say he has been quiet in the clubhouse since the boos started.',
      '{name} has stopped reading the papers. The criticism of his slump has got to him.',
    ],
    furious: [
      '{name} snapped at reporters after another hitless night. The pressure from the fans is affecting him badly.',
      '{name}\'s agent says his client is hurt by the reaction of the fans and wonders whether he has a future here.',
    ],
  },
  better: [
    '{name} is in better spirits now that he is getting what he wanted.',
    'The coaches say {name} has been a different man in the clubhouse lately.',
  ],
};

/** Once a week in the season: every player in the majors and Triple-A looks at his week. */
export function weeklyMoods() {
  const S = game.season;
  if (!S || game.phase !== 'regular') return;
  const prev = S.moodSnap || new Map();
  const now = new Map();
  const rng = new Rng(`moods-${S.year}-${game.date.getTime()}`);
  for (const o of game.world.orgs.values()) {
    const st = orgState(o.id);
    if (o.id === game.orgId) for (const p of o.players) p.wasMine = true;
    const rec = S.records.get(o.id);
    const recPrev = prev.get(`rec-${o.id}`) || { w: 0, l: 0 };
    now.set(`rec-${o.id}`, { w: rec.w, l: rec.l });
    const teamGames = rec.w + rec.l - recPrev.w - recPrev.l;
    const winning = rec.w - recPrev.w > rec.l - recPrev.l;
    // a clubhouse of team players is a happier place (the average Teamwork of the big-league players)
    const mlbP = o.players.filter((p) => st.level.get(p.id) === 'MLB');
    const clubTeam = mlbP.length ? mlbP.reduce((a, p) => a + (p.r?.team ?? 50), 0) / mlbP.length : 50;
    // what each player expects, from where his value ranks in the organisation
    const ranked = (pit) => o.players.filter((p) => isPitcher(p) === pit && !p.injury && ['MLB', 'AAA'].includes(st.level.get(p.id))).sort((a, b) => value(b) - value(a));
    const bats = ranked(false), arms = ranked(true);
    // nine regulars, counting only one catcher (the second catches once or twice a week)
    const regs = [];
    let catcher = false;
    for (const p of bats) {
      if (regs.length >= 9) break;
      const c = p.pos === 'C';
      if (c && catcher) continue;
      if (c) catcher = true;
      regs.push(p);
    }
    const regular = new Set(regs.map((p) => p.id));
    const bench = new Set(bats.filter((p) => !regular.has(p.id)).slice(0, 4).map((p) => p.id));
    const starters = new Set(arms.filter((p) => p.role === 'Starter').slice(0, 5).map((p) => p.id));
    const bigLeague = new Set([...bats.slice(0, 13), ...arms.slice(0, 13)].map((p) => p.id));
    for (const p of [...bats, ...arms]) {
      const g = gamesMLB(p, S.year);
      now.set(p.id, g);
      if (!teamGames) continue;
      const played = g - (prev.get(p.id) ?? g);
      const active = st.active.has(p.id);
      let delta = (MOOD_START - mood(p)) * 0.15 + (winning ? 1 : 0) + lifeMood(p) + (clubTeam - 50) / 10 + moodLift(p);
      let why = null, pressure = 0;
      // prospects accept time in the minors; established players don't
      const established = (p.contract?.serviceTime ?? 0) >= 1 || (p.age ?? 0) >= 27;
      if (!active && established && bigLeague.has(p.id) && value(p) >= 47) { delta -= 6; why = 'demoted'; }
      else if (!isPitcher(p) && active && regular.has(p.id) && played < teamGames * 0.5) { delta -= 5; why = 'time'; }
      else if (isPitcher(p) && active && starters.has(p.id) && !st.rotation.includes(p.id)) { delta -= 5; why = 'role'; }
      else if (!isPitcher(p) && active && bench.has(p.id) && played === 0) { delta -= 2; why = 'time'; }
      else if (st.active.has(p.id) && (pressure = fanPressure(p))) {
        // the crowd on his back: how much it gets to him depends on his composure and temperament
        delta -= pressure * 5 * (1 - ((p.r?.comp ?? 50) - 50) / 60) * (1 - ((p.r?.temper ?? 50) - 50) / 80);
        why = 'fans';
        const now = absDay(game.date);
        if (o.id === game.orgId && pressure >= 0.7 && !S.booed?.[p.id] && !(now - (S.lastBoo || 0) < 21)) {
          (S.booed ||= {})[p.id] = 1;
          S.lastBoo = now;
          const L = p.last.toUpperCase();
          headline(rng.pick([`BOOS FOR ${L} AS THE SLUMP GOES ON`, `FANS TURN ON ${L}`, `RADIO CALLERS WANT ${L} BENCHED`, `"ENOUGH IS ENOUGH": FANS LOSE PATIENCE WITH ${L}`]), true);
        }
      } else delta += 3;
      const before = mood(p);
      p.mood = Math.max(0, Math.min(100, Math.round(before + delta)));
      if (why) p.moodWhy = why; else if (p.mood >= 55) delete p.moodWhy;
      if (o.id === game.orgId) tell(p, before, why, { g: played, t: teamGames, level: st.level.get(p.id) }, rng);
    }
  }
  S.moodSnap = now;
}

export const gamesMLB = (p, year) => {
  const kind = isPitcher(p) ? 'pit' : 'bat';
  return (p.hist?.[kind] || []).filter((r) => r[0] === year && r[1] === 'MLB').reduce((a, r) => a + r[3], 0);
};

/** A message when one of your players crosses into unhappiness, or out of it. */
function tell(p, before, why, facts, rng) {
  const after = mood(p);
  const fill = (t) => t.replace('{name}', fullName(p)).replace('{level}', facts.level === 'AAA' ? 'Triple-A' : 'the minors').replace('{g}', facts.g).replace('{t}', facts.t);
  const talk = why === 'fans' ? (() => { const f = recentForm(p); return f ? [mediaQuote(p.orgId, isPitcher(p) ? 'coldP' : 'cold', { p, form: f.text })].filter(Boolean) : undefined; })() : undefined;
  if (why && before >= 40 && after < 40) message({ cat: 'club', player: p.id, title: `${fullName(p)} is unhappy`, body: fill(rng.pick(SAYS[why].unhappy)), voices: talk });
  else if (why && before >= 25 && after < 25) message({ cat: 'club', player: p.id, important: true, title: `${fullName(p)} wants answers`, body: fill(rng.pick(SAYS[why].furious)), voices: talk });
  else if (before < 40 && after >= 50) message({ cat: 'club', player: p.id, title: `${fullName(p)} is happier`, body: fill(rng.pick(SAYS.better)) });
}
