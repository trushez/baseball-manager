// Guided roster management. Three things: where a player stands under the rules (status), what a move
// will do before you make it (preview), and the assistant's suggestions for putting problems right
// (suggestions). The moves themselves are in roster.js; perform() runs one.
import { isPitcher, fullName, money, positions } from '../data/world.js';
import { counts, activeHitters, repair, addToForty, injuryNews } from '../club/depth.js';
import { game } from '../state.js';
import {
  placeCode, limits, checkMove, move, placeIL, activate, designate, cancelDesignation, canCancelDesignation, release,
  ilDaysLeft, ilKinds, canOption, levelWords, rosterProblems, moveTo60, ORDER,
} from './roster.js';
import { value } from './value.js';
import { dayNo } from './calendar.js';
import { message } from './inbox.js';
import { moodWords } from './moods.js';
import { trial } from './undo.js';

const inSeason = () => ['spring', 'regular', 'post'].includes(game.phase);
const year = () => game.season?.year ?? game.year;
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
export const injuryLeft = (p) => (p.injury ? Math.max(0, p.injury.days - (dayNo(game.date) - p.injury.since)) : 0);
const where = (lv) => (lv === 'MLB' ? 'the majors' : levelWords(lv));

// ---------- where a player stands ----------

/** Rows of [label, text, colour class] describing a player's roster position in plain words. */
export function status(o, st, p) {
  const code = placeCode(st, p);
  const c = counts(o, st);
  const ct = p.contract || {};
  const rows = [];
  const il = st.il.get(p.id);
  rows.push(['Where', code === 'MLB' ? `Active roster (${c.active} of ${limits().active})`
    : code === 'IL' ? `${il.kind}-day injured list, ${plural(ilDaysLeft(st, p), 'day')} still to serve`
      : code === 'DFA' ? 'Designated for assignment: waiting for waivers'
        : code === 'FA' ? 'Leaving as a free agent' : levelWords(code), code === 'MLB' ? 'cm-g' : code === 'IL' || code === 'DFA' ? 'cm-r' : '']);
  if (st.forty.has(p.id)) {
    rows.push(['40-man roster', il?.kind === 60
      ? `Yes, but while he is on the 60-day list he does not count against the 40 (${c.forty} of 40 used)`
      : `Yes, he counts against the 40 (${c.forty} of 40 used)`, 'cm-g']);
  } else if (code === 'DFA') {
    rows.push(['40-man roster', 'Taken off it when he was designated', 'cm-r']);
  } else if (code !== 'FA') {
    rows.push(['40-man roster', `No. Calling him up adds him to it${ct.status === 'minor league' ? ' and turns his minor league deal into a major league contract' : ''}`, '']);
  }
  const opts = ct.options ?? 3;
  if (st.forty.has(p.id)) {
    if (ct.optYear === year()) rows.push(['Options', `Optioned already this season, so he can go up and down freely until it ends (${plural(opts, 'option year')} left after this one)`, '']);
    else if (opts > 0) rows.push(['Options', `${plural(opts, 'option year')} left. Sending him to the minors uses one for the whole season.`, opts === 1 ? 'cm-y' : '']);
    else rows.push(['Options', 'None left. To send him down he must be designated for assignment and pass through waivers, where any club can claim him.', 'cm-r']);
  } else if (code !== 'FA') {
    rows.push(['Options', `${plural(opts, 'option year')}, not used while he is off the 40-man roster`, '']);
  }
  if (ct.serviceTime != null && (st.forty.has(p.id) || code === 'DFA')) {
    const yrs = Math.floor(ct.serviceTime), days = Math.round((ct.serviceTime - yrs) * 1000);
    rows.push(['Service time', `${plural(yrs, 'year')}, ${plural(days, 'day')}${yrs >= 3 ? '. With three years or more he can refuse an outright assignment and become a free agent.' : ''}`, '']);
  }
  if (p.injury) rows.push(['Health', `Injured: ${p.injury.type}, about ${plural(injuryLeft(p), 'day')} to go`, 'cm-r']);
  const [mw, mc] = moodWords(p);
  if (code !== 'FA') rows.push(['Mood', mw, mc]);
  if (st.lock?.[p.id]) rows.push(['Assistant', 'Locked: the assistant will not move him', 'cm-y']);
  return rows;
}

// ---------- what a move will do ----------

/** A short name for a move, for buttons, titles and the undo list. */
export function moveLabel(p, a) {
  const n = fullName(p);
  switch (a.type) {
    case 'move': return a.to === 'MLB' ? `Call up ${n}` : `Send ${n} to ${levelWords(a.to)}`;
    case 'il': return `Place ${n} on the ${a.kind}-day injured list`;
    case 'il60': return `Move ${n} to the 60-day injured list`;
    case 'activate': return a.to === 'MLB' ? `Activate ${n}` : `Activate ${n} and send him to ${levelWords(a.to)}`;
    case 'dfa': return `Designate ${n} for assignment`;
    case 'add40': return `Add ${n} to the 40-man roster`;
    case 'undfa': return `Cancel the designation of ${n}`;
    case 'release': return `Release ${n}`;
    case 'bench': return `Take ${n} out of the lineup`;
    default: return n;
  }
}

/**
 * What a move would do, without doing it.
 * @returns {{title:string, error:string|null, effects:string[], warnings:string[]}}
 */
export function preview(o, st, p, a) {
  const c = counts(o, st), lim = limits();
  const from = placeCode(st, p);
  const ct = p.contract || {};
  const effects = [], warnings = [];
  let error = null;
  const optionLine = () => {
    if (!st.forty.has(p.id)) return;
    if (!inSeason()) { effects.push('Moves in the off-season do not use an option.'); return; }
    if (ct.optYear === year()) effects.push('He has been optioned already this season, so this does not use another option.');
    else if ((ct.options ?? 3) > 0) {
      const left = (ct.options ?? 3) - 1;
      effects.push(`This uses one of his option years: ${plural(left, 'option year')} left afterwards. For the rest of this season he can go up and down without using more.`);
      if (left === 0) warnings.push('That is his last option. Next season he cannot be sent down without passing through waivers.');
    }
  };
  const activeLine = (d, pitcher) => {
    effects.push(`Active roster: ${c.active} to ${c.active + d} of ${lim.active}${pitcher ? `, pitchers ${c.pitchers} to ${c.pitchers + d} of ${lim.pitchers}` : ''}.`);
    if (d < 0 && game.phase === 'regular') warnings.push(`You will need ${lim.active} on the active roster before the next game.`);
  };
  switch (a.type) {
    case 'move': {
      error = checkMove(o, st, p, a.to);
      if (error) break;
      if (a.to === 'MLB') {
        activeLine(1, isPitcher(p));
        if (!st.forty.has(p.id)) {
          effects.push(`He is added to the 40-man roster: ${c.forty} to ${c.forty + 1} of 40.`);
          if (!ct.status || ct.status === 'minor league') effects.push('His minor league deal becomes a major league contract at the minimum ($780k), and from now on sending him down uses an option.');
          if (c.forty + 1 === 40) warnings.push('That fills the 40-man roster.');
        }
        if (game.phase === 'regular') effects.push('He earns major league service time for every day on the active roster.');
      } else if (from === 'MLB') {
        activeLine(-1, isPitcher(p));
        optionLine();
        if (st.forty.has(p.id)) effects.push('He stays on the 40-man roster.');
      } else {
        effects.push(`A move between minor league clubs: no option is used and the 40-man roster is not affected.`);
      }
      break;
    }
    case 'add40': {
      if (st.forty.has(p.id)) error = 'He is already on the 40-man roster.';
      else if (['FA', 'DFA', 'IL'].includes(from)) error = 'He cannot be added to the 40-man roster from where he is.';
      else if (c.forty >= 40) error = 'The 40-man roster is full. Designate someone for assignment first.';
      else {
        effects.push(`He is added to the 40-man roster: ${c.forty} to ${c.forty + 1} of 40. He stays where he is until you call him up.`);
        if (!ct.status || ct.status === 'minor league') effects.push('His minor league deal becomes a major league contract at the minimum ($780k), and from now on sending him down uses an option.');
        if (c.forty + 1 === 40) warnings.push('That fills the 40-man roster.');
      }
      break;
    }
    case 'il': {
      if (!p.injury) { error = 'Only an injured player can go on the injured list.'; break; }
      if (!st.forty.has(p.id)) { error = 'Only players on the 40-man roster use the major league injured list.'; break; }
      if (!ilKinds(p).includes(a.kind)) { error = `${isPitcher(p) ? 'Pitchers' : 'Position players'} go on the ${ilKinds(p)[0]}-day or the 60-day list.`; break; }
      const left = injuryLeft(p);
      effects.push(`He must stay on the list at least ${a.kind} days. The medical staff expect him back in about ${plural(left, 'day')}.`);
      if (st.active.has(p.id)) activeLine(-1, isPitcher(p));
      if (a.kind === 60) {
        effects.push(`While he is on the 60-day list he does not count against the 40-man roster: ${c.forty} to ${c.forty - 1} of 40.`);
        effects.push('When he comes back he needs a place on the 40-man roster again.');
        if (left < 50) warnings.push(`His injury should heal in about ${plural(left, 'day')}, so he would sit out longer than he needs to.`);
        if (game.phase === 'regular' && game.date >= new Date(year(), 7, 1)) error = 'From 1 August the 60-day list would keep him out for the rest of the season. Use the shorter list.';
      } else {
        effects.push('He still counts against the 40-man roster.');
        if (left > 60 && c.forty >= 40) warnings.push('The injury is a long one and your 40-man roster is full: the 60-day list would free a place.');
      }
      effects.push('He keeps earning major league pay and service time.');
      break;
    }
    case 'il60': {
      const il = st.il.get(p.id);
      if (!il || il.kind === 60) { error = 'He is not on the 10- or 15-day list.'; break; }
      effects.push(`He must stay out until 60 days after he first went on the list (about ${plural(Math.max(0, 60 - (dayNo(game.date) - il.since)), 'day')} from today).`);
      effects.push(`He stops counting against the 40-man roster: ${c.forty} to ${c.forty - 1} of 40.`);
      break;
    }
    case 'activate': {
      const il = st.il.get(p.id);
      if (!il) { error = 'He is not on the injured list.'; break; }
      if (p.injury) { error = `He is still injured (${p.injury.type}).`; break; }
      if (ilDaysLeft(st, p) > 0) { error = `He must stay on the injured list ${plural(ilDaysLeft(st, p), 'more day')}.`; break; }
      if (il.kind === 60 && c.forty >= 40) { error = 'The 40-man roster is full. Make room before he comes off the 60-day list.'; break; }
      if (a.to === 'MLB') {
        if (c.active >= lim.active) { error = `The active roster is full (${lim.active}). Send someone down first.`; break; }
        if (isPitcher(p) && c.pitchers >= lim.pitchers) { error = `The active roster already has ${lim.pitchers} pitchers.`; break; }
        activeLine(1, isPitcher(p));
      } else {
        if (inSeason() && !canOption(p)) { error = `${fullName(p)} is out of options, so he cannot go to the minors without waivers.`; break; }
        effects.push(`He goes to ${levelWords(a.to)} to play himself back into form.`);
        optionLine();
      }
      if (il.kind === 60) effects.push(`He counts against the 40-man roster again: ${c.forty} to ${c.forty + 1} of 40.`);
      break;
    }
    case 'dfa': {
      if (!st.forty.has(p.id)) { error = 'Only players on the 40-man roster can be designated for assignment.'; break; }
      const counted = st.il.get(p.id)?.kind !== 60;
      if (counted) effects.push(`He comes off the 40-man roster at once: ${c.forty} to ${c.forty - 1} of 40.`);
      if (st.active.has(p.id)) activeLine(-1, isPitcher(p));
      effects.push(inSeason() ? 'In 7 days he goes on waivers. Any club can claim him and take over his contract.' : 'When you continue he goes on waivers. Any club can claim him and take over his contract.');
      effects.push(((ct.serviceTime ?? 0) >= 3)
        ? 'If nobody claims him he can refuse to go to the minors, because he has three years of service or more. He would become a free agent and you would still owe his contract.'
        : 'If nobody claims him he goes outright to Triple-A and stays in the organisation, off the 40-man roster.');
      effects.push('You can cancel the designation until you press Continue.');
      if (value(p) >= 50) warnings.push('He is good enough that another club will probably claim him.');
      break;
    }
    case 'undfa': {
      if (!canCancelDesignation(st, p)) { error = 'The designation can only be cancelled before you continue.'; break; }
      effects.push('He goes back on the 40-man roster and back to where he was.');
      break;
    }
    case 'release': {
      const owed = (ct.years || []).filter((y) => y.season >= year() && typeof y.salary === 'number');
      const total = owed.reduce((s, y) => s + y.salary, 0);
      effects.push('He becomes a free agent at once and any club can sign him.');
      if (st.forty.has(p.id) && st.il.get(p.id)?.kind !== 60) effects.push(`A place opens on the 40-man roster: ${c.forty} to ${c.forty - 1} of 40.`);
      if (st.active.has(p.id)) activeLine(-1, isPitcher(p));
      if (total && ct.status !== 'minor league') warnings.push(`You still pay what is left of his contract: ${money(total)} (${owed.map((y) => y.season).join(', ')}). It stays on your payroll as money owed to players gone.`);
      else effects.push('There is no money left to pay on his contract.');
      warnings.push('This cannot be undone once you continue.');
      break;
    }
    case 'bench': {
      effects.push('The assistant fills his place in both lineups with the best player available today.');
      break;
    }
    default: error = 'Unknown move.';
  }
  return { title: moveLabel(p, a), error, effects, warnings };
}

/** Make a move. Returns null, or why it could not be made. */
export function perform(o, st, p, a) {
  switch (a.type) {
    case 'move': return move(o, st, p, a.to);
    case 'add40': addToForty(st, p); return null;
    case 'il': return placeIL(o, st, p, a.kind);
    case 'il60': return moveTo60(o, st, p);
    case 'activate': return activate(o, st, p, a.to);
    case 'dfa': return designate(o, st, p);
    case 'undfa': return cancelDesignation(o, st, p);
    case 'release': return release(o, st, p);
    case 'bench': {
      for (const k of ['lineupR', 'lineupL']) st[k] = st[k].filter((s) => s.id !== p.id);
      // you have decided: he stays on the roster through this injury, and Continue no longer waits for cover
      if (p.injury) (st.keepHurt ||= {})[p.id] = `${p.injury.since}:${p.injury.type}`;
      repair(o, st);
      return null;
    }
    default: return 'Unknown move.';
  }
}

// ---------- the assistant's suggestions ----------

/**
 * Moves that would fix today's roster problems, most urgent first, plus a few that are simply sensible.
 * Each is { p, a, why, must } where must marks a move needed before the next game.
 */
/** The best player to call up to fill an empty place on the active roster (a pitcher or a hitter), or undefined. */
export function bestCallUp(o, st, needPitcher, not = null) {
  const catchers = activeHitters(o, st).filter((p) => positions(p).includes('C')).length;
  return o.players.filter((p) => isPitcher(p) === needPitcher && !p.injury && !st.lock?.[p.id] && p.id !== not && ORDER.includes(placeCode(st, p)))
    .sort((a, b) => (st.forty.has(b.id) - st.forty.has(a.id)) * 3 + (!needPitcher && catchers < 2 ? (positions(b).includes('C') - positions(a).includes('C')) * 6 : 0) + (value(b) - value(a)) / 8)[0];
}

const replaceNote = (o, st, p) => {
  const r = bestCallUp(o, st, isPitcher(p), p.id);
  return r ? ` His replacement would be ${fullName(r)} (${levelWords(placeCode(st, r))}), called up once he is on the list.` : '';
};

export function suggestions(o, st) {
  const out = [];
  const lim = limits();
  const c = counts(o, st);
  const free = (p) => !st.lock?.[p.id];
  const players = o.players;
  const seen = new Set();
  const add = (p, a, why, must) => { const k = `${p.id}-${a.type}`; if (seen.has(k) || preview(o, st, p, a).error) return; seen.add(k); out.push({ p, a, why, must }); };
  const forty = () => players.filter((p) => st.forty.has(p.id));
  const cuttable = () => forty().filter((p) => free(p) && !st.active.has(p.id) && !st.il.has(p.id)).sort((a, b) => value(a) - value(b));
  const inGame = ['spring', 'regular', 'post'].includes(game.phase);

  // injured players taking up active places
  for (const p of players.filter((x) => st.active.has(x.id) && x.injury)) {
    const left = injuryLeft(p);
    const inLineup = [...st.lineupR, ...st.lineupL].some((s) => s.id === p.id);
    if (left >= 5) {
      const kind = left > 60 && c.forty >= 40 ? 60 : ilKinds(p)[0];
      add(p, { type: 'il', kind }, `Out for about ${plural(left, 'day')}. The injured list frees his place on the active roster${kind === 60 ? ' and, because the injury is long and the 40-man roster is full, a place on the 40 too' : ''}.${replaceNote(o, st, p)}`, true);
    } else if (inLineup) {
      add(p, { type: 'bench' }, `Out for ${plural(left, 'day')}: too short for the injured list, but he cannot be in the lineup.`, true);
    }
  }
  // long injuries on the short list while the 40-man roster is full
  if (c.forty >= 40) {
    for (const p of players.filter((x) => st.il.get(x.id) && st.il.get(x.id).kind !== 60 && injuryLeft(x) > 45)) {
      add(p, { type: 'il60' }, `He will be out about ${plural(injuryLeft(p), 'more day')} anyway. The 60-day list frees a place on the full 40-man roster.`, false);
    }
  }
  // players ready to come back
  for (const p of players.filter((x) => st.il.has(x.id) && !x.injury && ilDaysLeft(st, x) === 0)) {
    if (st.il.get(p.id).kind === 60 && counts(o, st).forty >= 40 && cuttable()[0]) {
      add(cuttable()[0], { type: 'dfa' }, `${fullName(p)} is ready to come off the 60-day list, but the 40-man roster is full. This is the least valuable player on it who is not on the active roster.`, false);
      continue;
    }
    const room = counts(o, st).active < lim.active && (!isPitcher(p) || counts(o, st).pitchers < lim.pitchers);
    if (room) add(p, { type: 'activate', to: 'MLB' }, 'Fit again and his time on the list is served.', false);
    else add(p, { type: 'activate', to: 'AAA' }, 'Fit again. The active roster is full, so he can get back into form in Triple-A.', false);
  }
  if (inGame) {
    // too many on the active roster, or too many pitchers
    if (c.pitchers > lim.pitchers || c.active > lim.active) {
      const pitchersOver = c.pitchers > lim.pitchers;
      const pool = players.filter((p) => st.active.has(p.id) && free(p) && (!pitchersOver || isPitcher(p)) && canOption(p)).sort((a, b) => value(a) - value(b));
      if (pool[0]) add(pool[0], { type: 'move', to: 'AAA' }, `The weakest ${pitchersOver ? 'pitcher' : 'player'} on the active roster who still has an option.`, true);
    }
    // too few on the active roster
    if (c.active < lim.active && game.phase !== 'spring') {
      const needPitcher = c.pitchers < lim.pitchers && c.active - c.pitchers >= lim.active - lim.pitchers;
      const pick = bestCallUp(o, st, needPitcher);
      const catchers = activeHitters(o, st).filter((p) => positions(p).includes('C')).length;
      if (pick) {
        if (!st.forty.has(pick.id) && c.forty >= 40 && cuttable()[0]) {
          add(cuttable()[0], { type: 'dfa' }, `Makes room on the 40-man roster for ${fullName(pick)}. He is the least valuable player on the 40 who is not on the active roster.`, true);
        }
        add(pick, { type: 'move', to: 'MLB' }, `The best ${needPitcher ? 'pitcher' : catchers < 2 ? 'catcher' : 'hitter'} available${st.forty.has(pick.id) ? ' on the 40-man roster' : ''} to fill the empty place.`, true);
      }
    }
  }
  // the 40-man roster over the limit
  for (let i = 0; i < counts(o, st).forty - 40; i++) {
    const p = cuttable()[i];
    if (p) add(p, { type: 'dfa' }, 'The 40-man roster is over the limit. He is the least valuable player on it who is not on the active roster.', true);
  }
  return out;
}

/**
 * The whole sequence of moves that puts the roster right, in the order they have to be made: the injured to the list, room made on
 * the 40, then every call-up. Worked out by making the moves on the real roster and putting it back, so the replacement for the
 * second and third injured player is known now and not only once the first has been dealt with. Needed moves first, then the rest.
 */
export function plan(o, st) {
  const first = suggestions(o, st);
  if (!first.length) return first;
  return trial(() => {
    const steps = [];
    for (let guard = 0; guard < 40; guard++) {
      const now = guard ? suggestions(o, st) : first;
      const s = now.find((x) => x.must) || now[0];
      if (!s || perform(o, st, s.p, s.a)) break;
      steps.push(s);
    }
    return steps;
  });
}

/** Make the first n moves of a plan, in order, as one step that Undo takes back whole. Returns the moves made and any error. */
export function runPlan(o, st, steps, n = steps.length) {
  const done = [];
  for (const s of steps.slice(0, n)) {
    const err = perform(o, st, s.p, s.a);
    if (err) return { done, error: err };
    done.push(moveLabel(s.p, s.a));
  }
  return { done, error: null };
}

/** Make the assistant's moves until there are no more problems (or nothing more it can do). */
export function fixAll(o, st) {
  const done = [];
  for (let guard = 0; guard < 40; guard++) {
    const s = suggestions(o, st).find((x) => x.must);
    if (!s) break;
    if (perform(o, st, s.p, s.a)) break;
    done.push(moveLabel(s.p, s.a));
  }
  return { done, problems: rosterProblems(o, st) };
}

/**
 * The assistant's advice, sent to your inbox: each move he would make, once, when the need first appears
 * (an injury and who would replace him, a player ready to come back, a roster that is over the limit).
 * It is sent again only if the need goes away and comes back. Each message carries the buttons to do it.
 */
export function adviceMail(o, st) {
  const seen = (game.advised ||= new Set());
  const now = plan(o, st);
  const keys = new Set();
  for (const x of now) {
    const k = `${x.p.id}-${x.a.type}-${x.a.to || ''}-${x.a.kind || ''}`;
    keys.add(k);
    if (seen.has(k)) continue;
    seen.add(k);
    // an injury gets one mail, the injury report with its Injury Centre button, not a second one from the assistant
    if (x.p.injury && x.p.orgId === game.orgId && (x.a.type === 'il' || x.a.type === 'bench')) { injuryNews(x.p); continue; }
    // a player fit again already has his own mail (on rehab, or ready to be activated) with the Injury Centre button
    if (x.a.type === 'activate' && x.p.orgId === game.orgId) continue;
    message({ cat: 'club', advice: true, important: !!x.must, player: x.p.id, title: `Your assistant suggests: ${moveLabel(x.p, x.a).replace(/^(\w)/, (c) => c.toLowerCase())}`, body: x.why });
  }
  for (const k of [...seen]) if (!keys.has(k)) seen.delete(k);
}
