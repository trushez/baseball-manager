// Injury cover: one screen for what follows an injury. The injured man, who comes up in his place, what the batting lineups
// and the rotation look like afterwards (with every change marked and explained), and one Confirm. Nothing is made until then:
// the screen works out the result on a trial of the roster, so changing a choice shows the new picture straight away.
import { h, fill, toast, dropdown } from './dom.js';
import { nav } from './nav.js';
import { clubMenu } from './menu.js';
import { plink } from './club-ui.js';
import { num } from './attr-ui.js';
import { game, org, orgState } from '../state.js';
import { fullName, isPitcher, FIELD_POS, seasonLine, lastSeason, rate3, fix } from '../data/world.js';
import { attr, posString } from '../data/attributes.js';
import { perform, preview, moveLabel, bestCallUp, injuryLeft } from '../season/advice.js';
import { ilKinds, limits, placeCode, ilDaysLeft } from '../season/roster.js';
import { cuttable } from '../season/wire.js';
import { trial, checkpoint } from '../season/undo.js';
import { value } from '../season/value.js';
import { withoutLineupNote, counts, activeHitters, activePitchers, bestLineup, lineupProblems, playerIn, autoStaff, starterValue } from '../club/depth.js';

const ORD = ['1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th', '9th'];
const full = (p) => (p ? fullName(p) : 'nobody');
const nm = (p) => (p ? `${p.last}, ${p.first[0]}` : 'nobody');

/** Who the screen is about when it is opened without a player: the first injured man on the active roster, or null. */
function firstInjured(o, st) {
  return o.players.filter((p) => st.active.has(p.id) && p.injury).sort((a, b) => injuryLeft(b) - injuryLeft(a))[0] || null;
}

/** Everything that needs doing after an injury, as one thing to confirm. */
export function coverScreen(focus = null) {
  const o = org(), st = orgState();
  const lim = limits();
  const S = {
    inj: focus ? (typeof focus === 'object' ? focus : game.world.players.get(focus)) : null,
    how: null, // 'il' (with kind) or 'bench'
    kind: null,
    wantPitcher: null, // the kind of player to call up, when it is not the injured man's
    repl: undefined, // the player called up: undefined = the assistant's pick, null = leave the place open
    room: null, // the 40-man place to make, undefined = the assistant's
    mode: { R: 'keep', L: 'keep' }, // keep: the roster as the injury left it; best: the assistant's rebuild
    lu: { R: null, L: null }, // a lineup you edited, on top of the above
    rot: null, rotMode: 'keep',
    down: undefined, // a man coming back from the list: who goes down to make room (undefined = the assistant's pick)
  };
  if (!S.inj || S.inj.orgId !== game.orgId) S.inj = firstInjured(o, st);
  const inj = () => S.inj;
  const state0 = () => (inj() ? (st.il.has(inj().id) ? 'il' : st.active.has(inj().id) ? 'active' : 'other') : 'none');
  // a player who is fit and has served his time on the list: the screen works the other way round, with someone going down
  const returning = () => !!inj() && st.il.has(inj().id) && !inj().injury && ilDaysLeft(st, inj()) === 0;
  const body = h('div', { class: 'cover' });
  // what is already wrong with the lineups before anything is changed here: shown, but it does not stop a move that has nothing to do with it
  const luProblems = () => [...lineupProblems(st.lineupR, o, st).map((x) => `Against right-handers: ${x}`), ...lineupProblems(st.lineupL, o, st).map((x) => `Against left-handers: ${x}`)];
  const before0 = new Set(luProblems());

  // ---- what each choice does: the assistant's defaults ----
  const defaultKind = () => {
    const p = inj(); if (!p) return null;
    const left = injuryLeft(p);
    return left > 60 && counts(o, st).forty >= 40 ? 60 : ilKinds(p)[0];
  };
  const hasIL = () => state0() === 'active' && S.how !== 'bench';
  if (state0() === 'active') { S.how = injuryLeft(inj()) >= 5 ? 'il' : 'bench'; S.kind = defaultKind(); }
  const needPitcher = () => {
    if (S.wantPitcher != null) return S.wantPitcher;
    if (inj()) return isPitcher(inj());
    const c = counts(o, st);
    return c.pitchers < lim.pitchers && c.active - c.pitchers >= lim.active - lim.pitchers;
  };

  /** Make the chosen moves (on the real roster inside a trial, or for real on Confirm). Returns what happened. */
  function apply(real) {
    const made = [], errs = [];
    const go = (p, a) => { const e = perform(o, st, p, a); if (e) errs.push(e); else made.push(moveLabel(p, a)); return !e; };
    if (state0() === 'active') {
      if (S.how === 'il') go(inj(), { type: 'il', kind: S.kind });
      else if (S.how === 'bench') go(inj(), { type: 'bench' });
    }
    let repl = null, roomP = null, gap = false, down = null;
    const c = counts(o, st);
    if (returning()) {
      const back = inj();
      const full = c.active >= lim.active || (isPitcher(back) && c.pitchers >= lim.pitchers);
      if (full) {
        const list = downList(back);
        down = (S.down && list.find((x) => x.id === S.down)) || list[0] || null;
        if (down) go(down, { type: 'move', to: 'AAA' });
      }
      if (!st.forty.has(back.id) && counts(o, st).forty >= 40) {
        const list = cuttable(o, st, back);
        roomP = S.room ? list.find((x) => x.id === S.room) || list[0] : list[0];
        if (roomP) go(roomP, { type: 'dfa' });
      }
      go(back, { type: 'activate', to: 'MLB' });
    } else {
    gap = c.active < lim.active && (S.how === 'il' || state0() !== 'active');
    }
    const pool = returning() ? [] : candidates();
    if (gap && S.repl !== null) {
      repl = S.repl === undefined ? pool[0] : S.repl;
      if (repl && !candidates.stillOk(repl)) repl = null;
      if (repl) {
        if (!st.forty.has(repl.id) && counts(o, st).forty >= 40) {
          const list = cuttable(o, st, repl);
          roomP = S.room ? list.find((x) => x.id === S.room) || list[0] : list[0];
          if (roomP) go(roomP, { type: 'dfa' });
        }
        go(repl, { type: 'move', to: 'MLB' });
      }
    }
    const hit = activeHitters(o, st);
    const out = { made, errs, repl, roomP, gap, down, open: gap && !repl };
    for (const [k, key] of [['R', 'lineupR'], ['L', 'lineupL']]) {
      let lu = st[key].map((s) => ({ ...s }));
      if (S.mode[k] === 'best') lu = bestLineup(hit, k);
      if (S.lu[k]) lu = S.lu[k].filter((s) => st.active.has(s.id)).length === S.lu[k].length ? S.lu[k].map((s) => ({ ...s })) : lu;
      st[key] = lu;
      out[key] = lu.map((s) => ({ ...s }));
    }
    // the manager's rotation is not refilled by the game: put the best free arm in the empty turn, where the injured man was
    if (st.rotation.length < 5 && S.rotMode !== 'best') {
      const cur = st.rotation;
      const free = activePitchers(o, st).filter((x) => !cur.includes(x.id) && !x.injury).sort((a, b) => starterValue(b) - starterValue(a));
      const slots = rot0.map((id) => (cur.includes(id) ? id : null));
      for (let i = 0; i < slots.length && free.length; i++) if (!slots[i]) slots[i] = free.shift().id;
      while (slots.filter(Boolean).length < 5 && free.length) slots.push(free.shift().id);
      st.rotation = slots.filter(Boolean);
      const pen = {};
      for (const x of activePitchers(o, st)) if (!st.rotation.includes(x.id)) pen[x.id] = st.pen[x.id] || 'Middle';
      st.pen = pen;
    }
    if (S.rotMode === 'best') autoStaff(o, st);
    if (S.rot && S.rot.every((id) => st.active.has(id))) {
      st.rotation = [...S.rot];
      const pen = {};
      for (const p of activePitchers(o, st)) if (!st.rotation.includes(p.id)) pen[p.id] = st.pen[p.id] || 'Middle';
      st.pen = pen;
    }
    out.rotation = [...st.rotation]; out.pen = { ...st.pen };
    const all = luProblems();
    out.problems = all.filter((x) => !before0.has(x)); // made by these moves: Confirm waits for them
    out.already = all.filter((x) => before0.has(x)); // there before: a warning only
    out.hitters = hit.map((p) => p.id); out.arms = activePitchers(o, st).map((p) => p.id);
    out.counts = counts(o, st);
    if (!real) out.roomList = null;
    return out;
  }
  const result = () => trial(() => apply(false));

  /** Who could come up, the assistant's pick first. A man on the 40 before a man who needs a place on it. */
  function candidates() {
    const needP = needPitcher();
    const first = bestCallUp(o, st, needP, inj()?.id);
    // the pool as it stands once the injured man has gone (the same men: an injured player is never a candidate)
    const pool = o.players.filter((p) => isPitcher(p) === needP && !p.injury && !st.active.has(p.id) && !st.il.has(p.id) && !st.dfa.has(p.id) && !st.lock?.[p.id] && ['AAA', 'AA', 'A+', 'A', 'R'].includes(placeCode(st, p)))
      .sort((a, b) => (st.forty.has(b.id) - st.forty.has(a.id)) * 3 + (value(b) - value(a)) / 8);
    const list = first ? [first, ...pool.filter((p) => p.id !== first.id)] : pool;
    return list.slice(0, 10);
  }
  candidates.stillOk = (p) => !p.injury && !st.active.has(p.id);

  /** Who could go down to Triple-A to make room for a man coming back, the assistant's pick first: the weakest of his kind. */
  function downList(back) {
    const c = counts(o, st);
    const mustP = isPitcher(back) && c.pitchers >= lim.pitchers;
    return o.players.filter((x) => st.active.has(x.id) && x.id !== back.id && !st.lock?.[x.id] && (!mustP || isPitcher(x)) && !preview(o, st, x, { type: 'move', to: 'AAA' }).error)
      .sort((a, b) => (isPitcher(a) === isPitcher(back) ? 0 : 1) - (isPitcher(b) === isPitcher(back) ? 0 : 1) || value(a) - value(b)).slice(0, 10);
  }

  const yr = () => game.season?.year;
  const lineHit = (p) => { const x = seasonLine(p, 'bat', yr()), y = x?.pa >= 30 ? x : lastSeason(p, 'bat'); return y?.pa ? `${y.season}: ${rate3(y.avg)}, ${y.hr} HR, ${rate3(y.ops)} OPS` : 'no plate appearances'; };
  const linePit = (p) => { const x = seasonLine(p, 'pit', yr()), y = x?.ip >= 10 ? x : lastSeason(p, 'pit'); return y?.ip ? `${y.season}: ${fix(y.era, 2)} ERA, ${Math.round(y.ip)} IP` : 'no innings'; };
  const figs = (p) => (isPitcher(p)
    ? [['Stf', 'stuff'], ['Mov', 'movement'], ['Ctl', 'control'], ['Sta', 'stamina']] : [['Con', 'contact'], ['Pow', 'power'], ['Eye', 'eye'], ['Spd', 'speed']])
    .map(([l, k]) => h('span', { class: 'f' }, h('i', {}, l), num(attr(p, k))));

  // ---- drawing ----
  function card(n, title, ...kids) {
    return h('section', { class: 'cv-card' }, h('div', { class: 'cv-h' }, h('span', { class: 'cv-n' }, n), title), ...kids);
  }

  function draw() {
    const R = result();
    const p = inj();
    const parts = [];
    if (returning()) {
      parts.push(h('p', { class: 'cm-sub cv-lead' }, `${fullName(p)} (${posString(p)}) is fit and has served his time on the injured list. Each step shows the result of your choices; nothing is made until you press Confirm.`));
      parts.push(card(1, 'The returning player',
        h('div', { class: 'cv-row' }, h('span', { class: 'sel-name' }, plink(p, fullName(p))), h('span', { class: 'sel-pos' }, posString(p)), h('span', { class: 'sel-figs' }, figs(p)), h('span', { class: 'cm-g' }, 'fit and ready')),
        h('p', { class: 'cm-s cm-pad' }, `He comes back to the active roster${R.roomP ? ' and needs a place on the 40-man roster' : ''}.`)));
      parts.push(stepDown(R));
      const dn = R.down;
      if (!isPitcher(p) || (dn && !isPitcher(dn))) parts.push(stepLineups(R));
      if (isPitcher(p) || (dn && isPitcher(dn)) || sameRot(R) === false) parts.push(stepRotation(R));
      parts.push(bar(R));
      fill(body, parts);
      return;
    }
    const lead = p ? (state0() === 'il' ? `${fullName(p)} is already on the injured list. Cover for his place is below.` : state0() === 'active' ? `${fullName(p)} (${posString(p)}) is hurt: ${p.injury.type}, out about ${injuryLeft(p)} days.` : `${fullName(p)} is not on your active roster.`) : 'Nobody on the active roster is hurt. The active roster may still have an open place to fill.';
    parts.push(h('p', { class: 'cm-sub cv-lead' }, lead, ' Each step shows the result of your choices; nothing is made until you press Confirm.'));
    if (p && state0() === 'active') parts.push(stepInjured(p, R));
    parts.push(stepReplacement(R));
    // a pitcher hurt and a pitcher coming up change no batting order, so that step only shows when a hitter is involved
    if ((p && !isPitcher(p)) || (R.repl && !isPitcher(R.repl))) parts.push(stepLineups(R));
    if ((p && isPitcher(p)) || (R.repl && isPitcher(R.repl)) || sameRot(R) === false) parts.push(stepRotation(R));
    parts.push(bar(R));
    fill(body, parts);
  }
  const rot0 = [...st.rotation];
  const sameRot = (R) => R.rotation.join() === rot0.join();

  function stepInjured(p, R) {
    const left = injuryLeft(p);
    const opt = (how, kind, label, tip) => h('button', { class: `cm-btn${S.how === how && (how !== 'il' || S.kind === kind) ? ' go' : ''}`, title: tip, onClick: () => { S.how = how; if (kind) S.kind = kind; S.decided = true; S.repl = undefined; resetEdits(); draw(); } }, label);
    const [a, b] = ilKinds(p);
    const kinds = [a, b].map((k) => opt('il', k, `${k}-day injured list`, k === 60 ? 'Also frees his place on the 40-man roster' : 'Frees an active place; he can return when the days are served'));
    return card(1, 'The injured player',
      h('div', { class: 'cv-row' }, h('span', { class: 'sel-name' }, plink(p, fullName(p))), h('span', { class: 'sel-pos' }, posString(p)), h('span', { class: 'sel-figs' }, figs(p)), h('span', { class: 'cm-s' }, `out about ${left} days`)),
      S.decided ? h('div', { class: 'btnrow cm-pad' },
        h('span', { class: 'cm-g' }, S.how === 'il'
          ? `${fullName(p)} goes on the ${S.kind}-day injured list${S.kind === 60 ? ' and comes off the 40-man roster' : ''}. His place on the active roster is free.`
          : `${fullName(p)} stays on the active roster and is out of the lineup.`),
        h('button', { class: 'cm-btn', onClick: () => { S.decided = false; draw(); } }, 'Change')) :
      h('div', { class: 'btnrow cm-pad' }, ...kinds, opt('bench', null, 'Keep him on the roster, bench him', 'He stays on the active roster but is out of the lineup'),
        h('span', { class: 'cm-s' }, left < 5 ? 'Out only a few days: the injured list is not worth a place on it.' : left > 60 ? 'A long injury: the 60-day list also frees a place on the 40-man roster.' : '')));
  }

  function stepDown(R) {
    const back = inj();
    const c0 = counts(o, st);
    const full = c0.active >= lim.active || (isPitcher(back) && c0.pitchers >= lim.pitchers);
    if (!full) return card(2, 'Who goes down', h('p', { class: 'cm-s cm-pad' }, 'There is a free place on the active roster, so nobody has to go down.'));
    const pool = downList(back);
    const mustP = isPitcher(back) && c0.pitchers >= lim.pitchers;
    const rows = pool.map((x, i) => h('div', { class: `sel-row hc cv-cand${R.down && R.down.id === x.id ? ' sel' : ''}`, onClick: (e) => { if (e.target.closest('.pl')) return; S.down = x.id; resetEdits(); draw(); } },
      h('span', { class: 'sel-box' }, 'MLB'),
      h('span', { class: 'sel-name' }, plink(x, nm(x)), i === 0 && S.down === undefined ? h('span', { class: 'cv-best', title: "The assistant's pick" }, 'Best') : null),
      h('span', { class: 'sel-pos' }, posString(x)),
      h('span', { class: 'sel-figs' }, figs(x)),
      h('span', { class: 'cm-s hl' }, isPitcher(x) ? linePit(x) : lineHit(x)),
      h('span', { class: 'cm-s' }, 'goes to Triple-A')));
    const extra = [];
    if (R.roomP) extra.push(h('div', { class: 'cv-room cm-pad' }, h('span', { class: 'cm-y' }, `The 40-man roster is full: ${fullName(R.roomP)} is designated for assignment to make room.`)));
    return card(2, 'Who goes down', h('p', { class: 'cm-s cm-pad' }, mustP ? `The active roster already has ${lim.pitchers} pitchers, so a pitcher has to go down. Weakest first.` : 'The active roster is full. Pick the player who goes down to Triple-A; the weakest of his kind comes first.'),
      pool.length ? rows : h('p', { class: 'cm-r cm-pad' }, 'Nobody can be sent down.'), ...extra);
  }

  function stepReplacement(R) {
    const p = inj();
    const gapNow = counts(o, st).active < lim.active || (p && state0() === 'active' && S.how === 'il');
    if (!gapNow && !R.gap) {
      return card(2, 'The replacement', h('p', { class: 'cm-s cm-pad' }, p && S.how === 'bench' ? 'No call-up is needed: he stays on the roster and the lineup is adjusted below.' : 'The active roster is full, so nobody needs to be called up.'));
    }
    const pool = candidates();
    const sel = R.repl;
    const picked = (x) => (S.repl === null ? false : sel && sel.id === x.id);
    const kindBtns = h('div', { class: 'btnrow' },
      h('span', { class: 'cm-s' }, 'Call up a '),
      ...[[false, 'hitter'], [true, 'pitcher']].map(([v, l]) => h('button', { class: `cm-btn${needPitcher() === v ? ' go' : ''}`, onClick: () => { S.wantPitcher = v; S.repl = undefined; resetEdits(); draw(); } }, l)),
      h('button', { class: `cm-btn${S.repl === null ? ' go' : ''}`, title: 'Play a man short', onClick: () => { S.repl = null; resetEdits(); draw(); } }, 'Leave the place open'));
    const rows = pool.map((x, i) => h('div', { class: `sel-row hc cv-cand${picked(x) ? ' sel' : ''}`, onClick: (e) => { if (e.target.closest('.pl')) return; S.repl = x; S.room = null; resetEdits(); draw(); } },
      h('span', { class: 'sel-box' }, placeCode(st, x)),
      h('span', { class: 'sel-name' }, plink(x, nm(x)), i === 0 && S.repl === undefined ? h('span', { class: 'cv-best', title: "The assistant's pick" }, 'Best') : null),
      h('span', { class: 'sel-pos' }, posString(x)),
      h('span', { class: 'sel-figs' }, figs(x)),
      h('span', { class: 'cm-s hl' }, isPitcher(x) ? linePit(x) : lineHit(x)),
      h('span', { class: 'cm-s' }, st.forty.has(x.id) ? 'on the 40' : 'needs a 40-man place')));
    const extra = [];
    if (R.roomP) {
      const list = roomList(R);
      extra.push(h('div', { class: 'cv-room cm-pad' }, h('span', { class: 'cm-y' }, `The 40-man roster is full: ${fullName(R.roomP)} is designated for assignment to make room.`),
        list.length > 1 ? dropdown(list.map((x) => [x.id, `${nm(x)} (${posString(x)}, age ${x.age})`]), R.roomP.id, (v) => { S.room = v; draw(); }, { label: 'Change: ', wide: true }) : null));
    }
    return card(2, 'Who comes up', h('div', { class: 'cm-pad' }, kindBtns), pool.length ? rows : h('p', { class: 'cm-s cm-pad cm-empty' }, 'Nobody suitable is available in the minors.'), ...extra);
  }
  /** The men who could make way on the 40, worked out as the roster stands after the injured player has been moved. */
  function roomList(R) {
    return trial(() => {
      if (state0() === 'active' && S.how === 'il') perform(o, st, inj(), { type: 'il', kind: S.kind });
      return cuttable(o, st, R.repl).slice(0, 8);
    });
  }

  function lineupBlock(key, k, hand, R) {
    const before = st[key], after = R[key];
    const byId = (id) => playerIn(o, id) || game.world.players.get(id);
    const was = new Map(before.map((s, i) => [s.id, { i, pos: s.pos }]));
    const stays = new Set(after.map((s) => s.id));
    const gone = before.filter((s) => !stays.has(s.id)).map((s) => byId(s.id));
    const opts = R.hitters.map((id) => { const x = byId(id); return [id, nm(x)]; });
    const note = (s, i) => {
      const w = was.get(s.id);
      if (!w) { const out = before.find((b) => b.pos === s.pos && !stays.has(b.id)); return h('span', { class: 'cv-in' }, out ? `in for ${full(byId(out.id))} at ${s.pos}` : 'in'); }
      if (w.pos !== s.pos && w.i !== i) return h('span', { class: 'cv-mv' }, `was ${ORD[w.i]} at ${w.pos}`);
      if (w.pos !== s.pos) return h('span', { class: 'cv-mv' }, `was at ${w.pos}`);
      if (w.i !== i) return h('span', { class: 'cv-mv' }, `was ${ORD[w.i]}`);
      return null;
    };
    const set = (lu) => { S.lu[k] = lu; draw(); };
    const rows = after.map((s, i) => {
      const x = byId(s.id);
      const changed = !was.has(s.id) || was.get(s.id).pos !== s.pos || was.get(s.id).i !== i;
      return h('div', { class: `cv-lu${changed ? ' chg' : ''}` },
        h('span', { class: 'cv-o' }, i + 1),
        dropdown(['DH', ...FIELD_POS].map((q) => [q, q]), s.pos, (v) => { const lu = after.map((t) => ({ ...t })); const other = lu.find((t, j) => j !== i && t.pos === v); if (other) other.pos = lu[i].pos; lu[i].pos = v; set(lu); }, { aria: 'Position' }),
        dropdown(opts, s.id, (v) => { const lu = after.map((t) => ({ ...t })); const j = lu.findIndex((t) => t.id === v); if (j >= 0) lu[j].id = lu[i].id; lu[i].id = v; set(lu); }, { wide: true, aria: 'Player' }),
        h('span', { class: 'sel-figs' }, figs(x)),
        h('span', { class: 'cv-note' }, note(s, i)));
    });
    const best = S.mode[k] === 'best';
    return h('div', { class: 'cv-half' },
      h('div', { class: 'cm-h' }, `Against ${hand}-handed starters`),
      rows,
      gone.length ? h('div', { class: 'cm-s cm-pad' }, `Out of the lineup: ${gone.map(full).join(', ')}.`) : null,
      h('div', { class: 'btnrow cm-pad' },
        h('button', { class: `cm-btn${!best && !S.lu[k] ? ' go' : ''}`, title: 'Only the places of men who left are filled; the batting order is as you had it', onClick: () => { S.mode[k] = 'keep'; S.lu[k] = null; draw(); } }, 'Change as little as possible'),
        h('button', { class: `cm-btn${best && !S.lu[k] ? ' go' : ''}`, title: 'The assistant picks the best nine and the order again', onClick: () => { S.mode[k] = 'best'; S.lu[k] = null; draw(); } }, 'Assistant rebuilds it'),
        S.lu[k] ? h('span', { class: 'cm-s' }, 'edited by you') : null));
  }

  function stepLineups(R) {
    const probs = R.problems.filter((x) => /lineup|Nobody|players are|listed twice|not on the active/.test(x));
    return card(3, 'The batting lineups',
      h('p', { class: 'cm-s cm-pad' }, 'Changes from today are marked. Change a position or a player from the boxes; they swap if the other man is already in.'),
      h('div', { class: 'cv-two' }, lineupBlock('lineupR', 'R', 'right', R), lineupBlock('lineupL', 'L', 'left', R)),
      probs.length ? h('div', { class: 'cm-pad' }, probs.map((x) => h('div', { class: 'cm-r' }, x))) : null);
  }

  function stepRotation(R) {
    const byId = (id) => playerIn(o, id);
    const opts = R.arms.map((id) => [id, nm(byId(id))]);
    const mvd = (id, i) => { const w = rot0.indexOf(id); return w < 0 ? h('span', { class: 'cv-in' }, 'into the rotation') : w !== i ? h('span', { class: 'cv-mv' }, `was SP${w + 1}`) : null; };
    const rows = R.rotation.map((id, i) => h('div', { class: `cv-lu cv-rot${rot0[i] !== id ? ' chg' : ''}` },
      h('span', { class: 'cv-o' }, `SP${i + 1}`),
      dropdown(opts, id, (v) => { const r = [...R.rotation]; const j = r.indexOf(v); if (j >= 0) r[j] = r[i]; r[i] = v; S.rot = r; draw(); }, { wide: true }),
      h('span', { class: 'sel-figs' }, figs(byId(id))), h('span', { class: 'cv-note' }, mvd(id, i))));
    const out = rot0.filter((id) => !R.rotation.includes(id)).map((id) => byId(id) || game.world.players.get(id)).filter(Boolean);
    return card(4, 'The rotation',
      h('p', { class: 'cm-s cm-pad' }, 'Bullpen roles stay as they are for men already in the pen; a new arm is a middle reliever until you give him a role on the Pitching Staff screen.'),
      rows, out.length ? h('div', { class: 'cm-s cm-pad' }, `Out of the rotation: ${out.map(nm).join(', ')}.`) : null,
      h('div', { class: 'btnrow cm-pad' }, h('button', { class: `cm-btn${S.rotMode === 'best' && !S.rot ? ' go' : ''}`, onClick: () => { S.rotMode = 'best'; S.rot = null; draw(); } }, 'Assistant rebuilds staff'),
        h('button', { class: 'cm-btn', onClick: () => { S.rotMode = 'keep'; S.rot = null; draw(); } }, 'Change as little as possible')));
  }

  function resetEdits() { S.lu = { R: null, L: null }; S.rot = null; }

  function bar(R) {
    const lines = R.made.length ? R.made.map((m) => m) : ['No roster move'];
    const bad = R.errs.length ? R.errs : R.problems;
    return h('div', { class: 'cv-bar' },
      h('div', { class: 'cv-sum' }, h('b', {}, 'Moves: '), lines.join('; '), R.open ? ' (the place stays open)' : '',
        h('span', { class: 'cm-s' }, `  Active roster after: ${R.counts.active} of ${lim.active}, ${R.counts.pitchers} pitchers.`),
        bad.length ? h('div', { class: 'cm-r' }, bad.join(' ')) : null,
        !R.errs.length && R.already?.length ? h('div', { class: 'cm-y' }, `Already wrong in your lineups before this, and not changed by it: ${R.already.join(' ')} Confirm still works; put the lineups right in the cards above or on the Tactics screen.`) : null),
      h('div', { class: 'btnrow' },
        h('button', { class: 'cm-btn', onClick: () => nav.back() }, 'Decide later'),
        h('button', { class: 'cm-btn go', disabled: bad.length > 0, onClick: confirm }, 'Confirm')));
  }

  function confirm() {
    const R = result();
    if (R.errs.length || R.problems.length) return;
    checkpoint(`Injury cover${inj() ? `: ${fullName(inj())}` : ''}`);
    const real = withoutLineupNote(() => apply(true));
    toast(real.made.length ? `Done: ${real.made.join('; ')}.` : 'Lineups updated.');
    nav.back();
  }

  draw();
  return { el: h('div', { style: { display: 'contents' } }, h('div', { class: 'cm-title' }, 'Injury Centre'), h('div', { class: 'cm-panel grow' }, body)), side: () => clubMenu(null) };
}

/** A banner for the selection screens when somebody on the active roster is hurt or a place is open: one button to the cover screen. Null when there is nothing to cover. */
export function coverBanner(o, st) {
  if (o.id !== game.orgId || !['spring', 'regular'].includes(game.phase)) return null;
  const hurt = firstInjured(o, st);
  const open = counts(o, st).active < limits().active;
  if (!hurt && !open) return null;
  const text = hurt ? `${fullName(hurt)} is injured and still on the active roster.` : `A place on the active roster is open (${counts(o, st).active} of ${limits().active}).`;
  return h('div', { class: 'cv-banner' }, h('span', {}, text), h('button', { class: 'cm-btn go', onClick: () => nav.push(coverScreen(hurt)) }, 'Open injury cover'));
}
