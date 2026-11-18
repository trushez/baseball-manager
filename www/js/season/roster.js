// Roster rules: the active roster (26, or 28 from 1 September; 13 or 14 pitchers), the 40-man roster,
// the injured list (10-day for hitters, 15-day for pitchers, 60-day off the 40-man), minor league
// options, designation for assignment and waivers, and release. Also how AI clubs manage their rosters
// day to day. Your club follows the same rules but nothing is done for you.
import { isPitcher, fullName, LEVEL_NAME } from '../data/world.js';
import { counts, addToForty, repair, keepStaff, activeHitters, activePitchers, autoRoles, pitchQuality, bestLineup } from '../club/depth.js';
import { game, orgState, autoClub } from '../state.js';
import { value } from './value.js';
import { dayNo } from './calendar.js';
import { message, about } from './inbox.js';
import { offerBack, ruleNote, rule5Problems } from './rule5.js';

export const ORDER = ['AAA', 'AA', 'A+', 'A', 'R'];
const inSeason = () => ['spring', 'regular', 'post'].includes(game.phase);
const today = () => dayNo(game.date);
const year = () => game.season?.year ?? game.year;

export function limits(date = game.date) {
  const sept = game.phase === 'regular' && date >= new Date(year(), 8, 1);
  return { active: sept ? 28 : 26, pitchers: sept ? 14 : 13 };
}

/** Where a player is: 'MLB', a minor league level, 'IL', 'DFA' or 'FA'. */
export function placeCode(st, p) {
  if (st.il.has(p.id)) return 'IL';
  if (st.dfa.has(p.id)) return 'DFA';
  if (st.active.has(p.id)) return 'MLB';
  return st.level.get(p.id);
}

// ---------- moves ----------

/**
 * Move a player between the majors and the minors under the rules. Returns null, or the reason it
 * cannot be done. Sending down a player on the 40-man roster uses one of his options for the season.
 */
export function move(o, st, p, to) {
  const err = checkMove(o, st, p, to);
  if (err) return err;
  const from = placeCode(st, p);
  if (from === to) return null;
  if (to === 'MLB') {
    if (!st.forty.has(p.id)) addToForty(st, p);
    st.active.add(p.id);
    st.level.set(p.id, 'MLB');
  } else {
    if (from === 'MLB' && st.forty.has(p.id) && inSeason()) useOption(p);
    st.active.delete(p.id);
    st.level.set(p.id, to);
  }
  repair(o, st);
  return null;
}

/** Why a move cannot be made, or null. Nothing is changed. */
export function checkMove(o, st, p, to) {
  const from = placeCode(st, p);
  if (from === to) return null;
  if (from === 'FA') return 'He becomes a free agent this winter. Re-sign him on the winter screen.';
  if (from === 'IL') return 'He is on the injured list. Activate him first.';
  if (from === 'DFA') return 'He has been designated for assignment and is waiting on waivers.';
  if (to === 'MLB') {
    if (p.injury) return `He is injured (${p.injury.type}).`;
    const c = counts(o, st), lim = limits();
    if (c.active >= lim.active) return `The active roster is full (${lim.active}). Send someone down first.`;
    if (isPitcher(p) && c.pitchers >= lim.pitchers) return `The active roster already has ${lim.pitchers} pitchers.`;
    if (!st.forty.has(p.id) && c.forty >= 40) return 'The 40-man roster is full. Designate someone for assignment, or move a long-term injury to the 60-day list, to make room.';
  } else if (p.rule5 && from === 'MLB' && st.active.has(p.id) && game.phase !== 'spring') {
    return ruleNote(p);
  } else if (from === 'MLB' && st.forty.has(p.id) && inSeason() && !canOption(p)) {
    return `${fullName(p)} is out of options. Designate him for assignment to send him down.`;
  }
  return null;
}

/** An option year is used the first time a 40-man player goes down in a season. */
function useOption(p) {
  const c = p.contract || (p.contract = {});
  if (c.optYear === year()) return null;
  if ((c.options ?? 3) <= 0) return `${fullName(p)} is out of options. Designate him for assignment to send him down.`;
  c.options = (c.options ?? 3) - 1;
  c.optYear = year();
  return null;
}
export const canOption = (p) => (p.contract?.optYear === year()) || (p.contract?.options ?? 3) > 0;

// ---------- injured list ----------

/** The lists a player can go on: 10-day (hitters) or 15-day (pitchers), and the 60-day list. */
export const ilKinds = (p) => [isPitcher(p) ? 15 : 10, 60];

export function placeIL(o, st, p, kind) {
  if (!p.injury) return 'Only an injured player can go on the injured list.';
  if (!st.forty.has(p.id)) return 'Only players on the 40-man roster use the major league injured list.';
  if (st.il.has(p.id)) return 'He is already on the injured list.';
  if (!kind) {
    kind = isPitcher(p) ? 15 : 10;
    // the computer uses the 60-day list for long injuries
    if (p.injury.days - (today() - p.injury.since) > 60) kind = 60;
  }
  if (!ilKinds(p).includes(kind)) return `${isPitcher(p) ? 'Pitchers' : 'Position players'} go on the ${ilKinds(p)[0]}-day or the 60-day list.`;
  if (kind === 60 && game.phase === 'regular' && game.date >= new Date(year(), 7, 1)) return 'From 1 August the 60-day list would keep him out for the rest of the season. Use the shorter list.';
  st.active.delete(p.id);
  st.il.set(p.id, { kind, since: today() });
  repair(o, st);
  return null;
}

/** From the 10- or 15-day list to the 60-day list: off the 40-man count, out 60 days from when he went on. */
export function moveTo60(o, st, p) {
  const il = st.il.get(p.id);
  if (!il || il.kind === 60) return 'He is not on the 10- or 15-day list.';
  il.kind = 60;
  return null;
}

export const ilDaysLeft = (st, p) => { const x = st.il.get(p.id); return x ? Math.max(0, x.kind - (today() - x.since)) : 0; };

/** Back from the injured list, to the active roster (to: 'MLB') or straight to a minor league club. */
export function activate(o, st, p, to = 'MLB') {
  if (!st.il.has(p.id)) return null;
  if (p.injury) return `He is still injured (${p.injury.type}).`;
  if (ilDaysLeft(st, p) > 0) return `He must stay on the injured list ${ilDaysLeft(st, p)} more day${ilDaysLeft(st, p) === 1 ? '' : 's'}.`;
  const was = st.il.get(p.id);
  if (was.kind === 60 && counts(o, st).forty >= 40) return 'The 40-man roster is full. Make room before he comes off the 60-day list.';
  if (to === 'MLB') {
    const c = counts(o, st), lim = limits();
    if (c.active >= lim.active) return `The active roster is full (${lim.active}). Send someone down first.`;
    if (isPitcher(p) && c.pitchers >= lim.pitchers) return `The active roster already has ${lim.pitchers} pitchers.`;
    st.il.delete(p.id);
    st.active.add(p.id);
    st.level.set(p.id, 'MLB');
  } else {
    st.il.delete(p.id);
    const err = inSeason() ? useOption(p) : null;
    if (err) { st.il.set(p.id, was); return err; }
    st.level.set(p.id, to);
  }
  delete p.rehab;
  repair(o, st);
  return null;
}

// ---------- designation, waivers, release ----------

export function designate(o, st, p) {
  if (p.rule5) return ruleNote(p);
  if (!st.forty.has(p.id)) return 'Only players on the 40-man roster can be designated for assignment.';
  // remembered until the next Continue, so the designation can be cancelled
  (st.dfaFrom ||= {})[p.id] = { active: st.active.has(p.id), il: st.il.get(p.id) || null, level: st.level.get(p.id) };
  st.active.delete(p.id);
  st.il.delete(p.id);
  st.forty.delete(p.id);
  st.dfa.set(p.id, today());
  st.level.set(p.id, 'AAA');
  repair(o, st);
  return null;
}

/** Undo a designation made since the last Continue. */
export function cancelDesignation(o, st, p) {
  const was = st.dfaFrom?.[p.id];
  if (!st.dfa.has(p.id) || !was) return 'The designation can only be cancelled before you continue.';
  if (counts(o, st).forty >= 40 && !(was.il?.kind === 60)) return 'The 40-man roster is full again. Make room first.';
  if (was.active) {
    const c = counts(o, st), lim = limits();
    if (c.active >= lim.active || (isPitcher(p) && c.pitchers >= lim.pitchers)) return 'His place on the active roster has been filled. Send someone down first.';
  }
  st.dfa.delete(p.id);
  delete st.dfaFrom[p.id];
  st.forty.add(p.id);
  st.level.set(p.id, was.level);
  if (was.il) st.il.set(p.id, was.il);
  if (was.active) st.active.add(p.id);
  repair(o, st);
  return null;
}

export const canCancelDesignation = (st, p) => st.dfa.has(p.id) && !!st.dfaFrom?.[p.id];

/** Players designated a week ago go through waivers: the worst club with room and a use for him claims him. */
export function resolveWaivers(now = false) {
  const order = waiverOrder();
  for (const o of game.world.orgs.values()) {
    const st = orgState(o.id);
    for (const [id, day] of [...st.dfa]) {
      if (!now && today() - day < 7) continue;
      const p = game.world.players.get(id);
      st.dfa.delete(id);
      if (st.dfaFrom) delete st.dfaFrom[id];
      const v = value(p);
      const claimer = order.find((oid) => {
        if (oid === o.id) return false;
        if (oid === game.orgId) return !!game.claims?.[id] && counts(game.world.orgs.get(oid), orgState(oid)).forty < 40;
        const ost = orgState(oid);
        if (counts(game.world.orgs.get(oid), ost).forty >= 40) return false;
        const theirs = [...ost.forty].map((x) => game.world.players.get(x)).filter((x) => x && isPitcher(x) === isPitcher(p));
        const worst = Math.min(...theirs.map((x) => value(x)));
        return v > worst + 3 && v >= 44;
      });
      if (game.claims?.[id] && claimer !== game.orgId) {
        const full = counts(game.world.orgs.get(game.orgId), orgState(game.orgId)).forty >= 40;
        message({ cat: 'club', player: p.id, title: `Your claim for ${fullName(p)} did not go through`, body: full
          ? `Your 40-man roster was full when the waivers were decided, so the claim for ${fullName(p)} could not be made. Nothing was lost; make a spot and claim him next time.`
          : claimer ? `${game.world.orgs.get(claimer).club.city} claimed ${fullName(p)}. Clubs with the worst records get the first call on a player on waivers, so they were ahead of you. Nothing was lost.`
            : `Nobody was awarded ${fullName(p)}: he cleared waivers and stayed with ${o.club.city}.` });
      }
      if (claimer) {
        transfer(p, claimer, 'AAA', 'claimed');
        orgState(claimer).forty.add(p.id);
        note(o.id, `${fullName(p)} was claimed on waivers by ${game.world.orgs.get(claimer).club.city}.`, p);
        note(claimer, `${game.world.orgs.get(claimer).club.city} claimed ${fullName(p)} off waivers from ${o.club.city}.`, p);
      } else if ((p.contract?.serviceTime ?? 0) >= 3) {
        release(o, st, p, 'refused an outright assignment and became a free agent');
      } else {
        st.level.set(p.id, 'AAA');
        note(o.id, `${fullName(p)} cleared waivers and was sent outright to Triple-A.`, p);
      }
      if (game.claims) delete game.claims[id];
    }
  }
}

function note(orgId, text, p) {
  if (orgId === game.orgId) message({ cat: 'club', title: text, player: p?.id, important: false, minor: /sent outright/.test(text), body: `${text}${p ? `\n${about(p)}` : ''}` });
}

/** Clubs in reverse order of their record, the worst first. */
export function waiverOrder() {
  const rec = game.season?.records;
  return [...game.world.orgs.keys()].sort((a, b) => pctOf(rec?.get(a)) - pctOf(rec?.get(b)));
}
const pctOf = (r) => (r && r.w + r.l ? r.w / (r.w + r.l) : 0.5);

/** Release a player: he becomes a free agent and the club still owes what is left of his contract. */
export function release(o, st, p, why = 'was released') {
  if (p.rule5) return offerBack(p, 'offered back');
  const owed = {};
  for (const y of p.contract?.years || []) if (y.salary && y.season >= year()) owed[y.season] = y.salary;
  if (Object.keys(owed).length && (p.contract?.status !== 'minor league')) {
    (o.club.otherMoney ||= []).push({ name: `${p.last}, ${p.first}`, note: `released ${game.date.toLocaleDateString('en-GB')}`, years: owed });
  }
  st.active.delete(p.id); st.forty.delete(p.id); st.il.delete(p.id); st.dfa.delete(p.id); st.level.delete(p.id);
  transfer(p, null, 'AAA', 'released');
  p.contract = { ...(p.contract || {}), status: 'free agent', years: [], text: 'Free agent' };
  if (!game.freeAgents.includes(p.id)) game.freeAgents.push(p.id);
  repair(o, st);
  if (o.id === game.orgId) message({ cat: 'club', title: `${fullName(p)} ${why}.`, player: p.id, body: `${fullName(p)} ${why} and is now a free agent.${Object.keys(owed).length ? ` The club still owes him ${Object.entries(owed).map(([y, v]) => `$${(v / 1e6).toFixed(1)}M for ${y}`).join(', ')}; it stays on the payroll.` : ''}\n${about(p)}` });
  return null;
}

/** Move a player to another organisation (or none: a free agent), at a given level. */
/** One line of a player's path: how he came to be where he is. how: drafted, intl, signed, trade, claimed, released, expired, minor. */
export function logMove(p, how, from, to, extra = {}) {
  (p.mv ||= []).push({ y: game.date.getFullYear(), d: dayNo(game.date), how, from: from || null, to: to || null, ...extra });
  if (p.mv.length > 40) p.mv.shift();
}
/** Add to the note of his latest move (the terms of a signing, the bonus). */
export const noteMove = (p, note) => { const m = p.mv?.at(-1); if (m) m.note = note; };

export function transfer(p, orgId, level = 'AAA', how = null, extra = {}) {
  const world = game.world;
  const old = world.orgs.get(p.orgId);
  if (how) logMove(p, how, old?.id, orgId, extra);
  if (old) {
    old.players.splice(old.players.indexOf(p), 1);
    const ost = orgState(old.id);
    for (const k of ['active', 'forty']) ost[k].delete(p.id);
    ost.il.delete(p.id); ost.dfa.delete(p.id); ost.level.delete(p.id);
  }
  if (!orgId) { p.orgId = null; p.team = null; p.club = null; return; }
  const o = world.orgs.get(orgId);
  o.players.push(p);
  p.orgId = orgId;
  p.level = level;
  p.team = level === 'MLB' ? orgId : `${orgId}-${level}`;
  p.club = world.clubs.get(p.team) || o.club;
  orgState(orgId).level.set(p.id, level);
  game.freeAgents = game.freeAgents.filter((id) => id !== p.id);
}

/** Every player's stored club and level follow where his organisation has him today (call-ups and send-downs change only the roster state). */
export function syncTeams(world = game.world) {
  for (const o of world.orgs.values()) {
    const st = orgState(o.id);
    for (const p of o.players) {
      if (st.il.has(p.id) || st.dfa.has(p.id)) continue;
      const code = st.active.has(p.id) ? 'MLB' : st.level.get(p.id);
      if (!code || code === 'FA' || !world.clubs.has(code === 'MLB' ? o.id : `${o.id}-${code}`)) continue;
      const team = code === 'MLB' ? o.id : `${o.id}-${code}`;
      if (p.team !== team) { p.team = team; p.club = world.clubs.get(team) || o.club; p.level = code; }
    }
  }
}

// ---------- checks for your club ----------

/** Problems that stop the game until you fix them. */
/**
 * Injured players on your active roster nobody has decided about: out for five days or more (long enough for the
 * injured list) and neither placed on it nor kept on the roster on purpose in the Injury Centre. Continue waits for them.
 */
export function coverNeeded(o, st) {
  if (!inSeason() && game.phase !== 'spring') return [];
  return o.players.filter((p) => st.active.has(p.id) && p.injury && p.injury.days - (today() - p.injury.since) >= 5 && st.keepHurt?.[p.id] !== `${p.injury.since}:${p.injury.type}`);
}

export function rosterProblems(o, st) {
  const out = [];
  const c = counts(o, st), lim = limits();
  if (inSeason() || game.phase === 'spring') {
    if (c.active > lim.active) out.push(`The active roster has ${c.active} players; the limit is ${lim.active}.`);
    if (c.active < lim.active && game.phase !== 'spring') out.push(`The active roster has ${c.active} players; it must have ${lim.active}.`);
    if (c.pitchers > lim.pitchers) out.push(`There are ${c.pitchers} pitchers on the active roster; the limit is ${lim.pitchers}.`);
    if (c.forty > 40) out.push(`The 40-man roster has ${c.forty} players; the limit is 40.`);
    // a manual rotation: the next starter must be able to pitch (in automatic the assistant works round him)
    if (st.rotMode === 'manual' && game.phase !== 'spring' && st.rotation.length) {
      const next = game.world.players.get(st.rotation[(st.rotIdx || 0) % st.rotation.length]);
      if (next && (next.injury || !st.active.has(next.id))) out.push(`Your rotation is manual and your next starter, ${fullName(next)}, ${next.injury ? 'is injured' : 'is not on the active roster'}. Pick another starter or switch the rotation to automatic.`);
    }
  }
  if (inSeason() || game.phase === 'spring') out.push(...rule5Problems(o, st));
  for (const key of ['lineupR', 'lineupL']) {
    for (const s of st[key]) {
      const p = game.world.players.get(s.id);
      if (p?.injury && st.active.has(s.id)) out.push(`${fullName(p)} is injured but in your lineup against ${key === 'lineupR' ? 'right' : 'left'}-handers.`);
    }
  }
  return out;
}

// ---------- AI clubs ----------

/** Daily housekeeping for a club run by the computer. */
export function aiManage(o, st) {
  let changed = false;
  const free = (p) => !st.lock?.[p.id];
  // injured players go on the injured list; short ones sit for a day or two
  for (const id of [...st.active]) {
    const p = game.world.players.get(id);
    if (p.injury && p.injury.days - (today() - p.injury.since) >= 5 && st.forty.has(p.id)) { placeIL(o, st, p); changed = true; }
  }
  // players fit again come back if there is room, otherwise go down to Triple-A
  for (const [id] of [...st.il]) {
    const p = game.world.players.get(id);
    if (p.injury || ilDaysLeft(st, p) > 0 || (p.rehab && !p.rehab.ready)) continue;
    // back from the 60-day list with the 40-man roster full: the weakest spare player makes room
    if (st.il.get(id).kind === 60 && counts(o, st).forty >= 40) {
      const cut = [...st.forty].map((x) => game.world.players.get(x)).filter((x) => x && free(x) && !st.active.has(x.id) && !st.il.has(x.id)).sort((a, b) => value(a) - value(b))[0];
      if (cut) designate(o, st, cut); else continue;
    }
    if (activate(o, st, p, 'MLB')) {
      // no room: send down the weakest player of his kind who can go, or send him down instead
      const same = (isPitcher(p) ? activePitchers(o, st) : activeHitters(o, st)).sort((a, b) => value(a) - value(b));
      const worst = same.filter(free).find(canOption);
      if (worst && value(worst) < value(p) && !move(o, st, worst, 'AAA')) activate(o, st, p, 'MLB');
      else if (activate(o, st, p, 'AAA') && same.filter(free)[0] && value(same.filter(free)[0]) < value(p)) { designate(o, st, same.filter(free)[0]); activate(o, st, p, 'MLB'); }
    }
    changed = true;
  }
  // over the limit (a trade or call-up made while the limit was higher): the weakest of those who can go are sent down
  const lim = limits();
  for (let guard = 0; guard < 4; guard++) {
    const c = counts(o, st);
    if (c.active <= lim.active && c.pitchers <= lim.pitchers) break;
    const tooManyArms = c.pitchers > lim.pitchers;
    const worst = [...st.active].map((x) => game.world.players.get(x)).filter((x) => x && free(x) && (!tooManyArms || isPitcher(x))).sort((a, b) => value(a) - value(b));
    const down = worst.find((x) => canOption(x)) || worst[0];
    if (!down) break;
    if (move(o, st, down, 'AAA')) designate(o, st, down);
    changed = true;
  }
  // fill the active roster
  for (let guard = 0; guard < 6; guard++) {
    const c = counts(o, st);
    if (c.active >= lim.active) break;
    const needPitcher = c.pitchers < Math.min(lim.pitchers, 13 + (lim.active > 26 ? 1 : 0));
    const cands = o.players.filter((p) => isPitcher(p) === needPitcher && !p.injury && free(p) && ORDER.includes(placeCode(st, p)))
      .sort((a, b) => (st.forty.has(b.id) - st.forty.has(a.id)) * 2 + (value(b) - value(a)) / 10);
    const pick = cands[0];
    if (!pick) break;
    if (!st.forty.has(pick.id) && counts(o, st).forty >= 40) {
      const cut = [...st.forty].map((x) => game.world.players.get(x)).filter((x) => x && free(x) && !st.active.has(x.id) && !st.il.has(x.id))
        .sort((a, b) => value(a) - value(b))[0];
      if (cut) designate(o, st, cut); else break;
    }
    if (move(o, st, pick, 'MLB')) break;
    changed = true;
  }
  if (changed) refreshStaff(o, st);
}

/** Rotation and bullpen roles from the current active pitchers, for AI clubs. */
export function refreshStaff(o, st) {
  const mine = o.id === game.orgId && !autoClub();
  if (mine) keepStaff(o, st);
  const arms = activePitchers(o, st);
  const sv = (p) => pitchQuality(p) + 0.6 * (p.grades.Stamina?.[0] ?? 50);
  const starters = arms.filter((p) => p.role === 'Starter').sort((a, b) => sv(b) - sv(a));
  const rot = starters.slice(0, 5);
  for (const p of arms.filter((x) => !rot.includes(x)).sort((a, b) => sv(b) - sv(a))) { if (rot.length >= 5) break; rot.push(p); }
  if (!mine) {
    st.rotation = rot.map((p) => p.id);
    st.pen = autoRoles(arms.filter((p) => !st.rotation.includes(p.id)));
  }
  // your own batting orders are yours: only a place left empty by a man who is gone gets filled, and a locked lineup is left alone
  if (mine) { repair(o, st); return; }
  const hitters = activeHitters(o, st);
  st.lineupR = bestLineup(hitters, 'R');
  st.lineupL = bestLineup(hitters, 'L');
}

export const levelWords = (code) => ({ MLB: 'the majors', IL: 'the injured list', DFA: 'designated for assignment', FA: 'free agency' }[code] || LEVEL_NAME[code]);
