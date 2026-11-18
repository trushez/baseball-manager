// Every roster move you make goes through here: the assistant explains what it will do (the rules, the
// options used, the roster counts before and after) and you confirm or cancel. Moves can be undone
// until you press Continue.
import { h, toast } from './dom.js';
import { game } from '../state.js';
import { preview, perform, moveLabel } from '../season/advice.js';
import { counts, withoutLineupNote } from '../club/depth.js';
import { placeCode, limits } from '../season/roster.js';
import { value } from '../season/value.js';
import { fullName, mainPos, isPitcher } from '../data/world.js';
import { checkpoint, undo } from '../season/undo.js';
import { nav } from './nav.js';
import { cuttable } from '../season/wire.js';
import { playerIn } from '../club/depth.js';
import { sortTable } from './table.js';
import { keyAttrs } from './attr-ui.js';
import { lastLine } from './deal-summary.js';

/** A small modal box. Returns a promise of true (confirmed) or false. */
export function confirmBox({ title, lines = [], warnings = [], error = null, ok = 'Confirm' }) {
  return new Promise((resolve) => {
    const close = (v) => { box.remove(); document.removeEventListener('keydown', key); resolve(v); };
    const key = (e) => { if (e.key === 'Escape') close(false); if (e.key === 'Enter' && !error) close(true); };
    const okBtn = error ? null : h('button', { class: 'cm-btn go', onClick: () => close(true) }, ok);
    const box = h('div', { class: 'dlg-back', onClick: (e) => { if (e.target === box) close(false); } },
      h('div', { class: 'dlg', role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
        h('div', { class: 'cm-title' }, title),
        h('div', { class: 'dlg-body' },
          error ? h('p', { class: 'cm-r' }, error) : null,
          lines.length ? h('ul', { class: 'dlg-list' }, lines.map((l) => h('li', {}, l))) : null,
          warnings.length ? h('ul', { class: 'dlg-list warn' }, warnings.map((l) => h('li', {}, l))) : null),
        h('div', { class: 'dlg-btns' }, okBtn, h('button', { class: 'cm-btn', onClick: () => close(false) }, error ? 'Close' : 'Cancel'))));
    document.body.append(box);
    document.addEventListener('keydown', key);
    (okBtn || box.querySelector('.cm-btn')).focus();
  });
}

/** A list of choices in a small box. Resolves to the index chosen, or null. */
function chooseBox({ title, note, options, more = null }) {
  return new Promise((resolve) => {
    const close = (v) => { box.remove(); document.removeEventListener('keydown', key); resolve(v); };
    const key = (e) => { if (e.key === 'Escape') close(null); };
    const box = h('div', { class: 'dlg-back', onClick: (e) => { if (e.target === box) close(null); } },
      h('div', { class: 'dlg', role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
        h('div', { class: 'cm-title' }, title),
        h('div', { class: 'dlg-body' }, h('p', { class: 'cm-s' }, note),
          options.length ? h('div', { style: { display: 'flex', flexDirection: 'column', gap: '4px', maxHeight: '320px', overflowY: 'auto' } },
            options.map((o, i) => h('button', { class: 'cm-btn', style: { textAlign: 'left' }, onClick: () => close(i) }, o))) : h('p', { class: 'cm-r' }, 'Nobody can be moved to make room.')),
        h('div', { class: 'dlg-btns' }, more ? h('button', { class: 'cm-btn go', onClick: () => close('more') }, more) : null, h('button', { class: 'cm-btn', onClick: () => close(null) }, 'Cancel'))));
    document.body.append(box);
    document.addEventListener('keydown', key);
    box.querySelector('.cm-btn')?.focus();
  });
}

/** The full list of one kind of player, with his ratings and last season, to pick one from. Resolves to the player or null (back). */
function listBox({ title, note, players, verb }) {
  return new Promise((resolve) => {
    const close = (v) => { box.remove(); document.removeEventListener('keydown', key); resolve(v); };
    const key = (e) => { if (e.key === 'Escape') close(null); };
    const table = sortTable({
      rows: players, sort: 'val', desc: false,
      cols: [
        { key: 'name', label: 'Player', left: true, get: (x) => x.last, show: (x) => fullName(x) },
        { key: 'pos', label: 'Pos', left: true, get: (x) => mainPos(x), show: (x) => h('b', { class: 'cm-y' }, isPitcher(x) ? (x.role === 'Starter' ? 'SP' : x.role === 'Closer' ? 'CL' : 'RP') : mainPos(x)) },
        { key: 'age', label: 'Age', get: (x) => x.age, asc: true },
        { key: 'val', label: 'Value', get: (x) => value(x), show: (x) => Math.round(value(x)) },
        { key: 'att', label: 'Ratings', left: true, get: () => 0, show: (x) => keyAttrs(x) },
        { key: 'last', label: 'Last season', left: true, get: () => 0, show: (x) => h('span', { class: 'cm-s' }, lastLine(x)) },
        { key: 'go', label: '', get: () => 0, show: (x) => { const v = typeof verb === 'function' ? verb(x) : { label: verb }; return h('button', { class: `cm-btn${v.label === 'Designate' ? ' warn' : ''}`, style: { whiteSpace: 'nowrap' }, disabled: !v.label, title: v.note || '', onClick: () => close(x) }, v.label || 'Cannot go'); } },
      ],
    }).el;
    const box = h('div', { class: 'dlg-back', onClick: (e) => { if (e.target === box) close(null); } },
      h('div', { class: 'dlg', role: 'dialog', 'aria-modal': 'true', 'aria-label': title, style: { width: 'min(1180px, 100%)' } },
        h('div', { class: 'cm-title' }, title),
        h('div', { class: 'dlg-body' }, h('p', { class: 'cm-s' }, note), h('div', { style: { maxHeight: '60vh', overflow: 'auto' } }, table)),
        h('div', { class: 'dlg-btns' }, h('button', { class: 'cm-btn', onClick: () => close(null) }, 'Back to the short list'))));
    document.body.append(box);
    document.addEventListener('keydown', key);
  });
}

/** Pick one from `cands` in the short list, or open the whole pitching list (or batting list) for the kind of player coming in. */
async function pickFrom({ title, note, cands, label, forP, verb, full = null, how = null }) {
  const same = full || cands.filter((x) => isPitcher(x) === forP);
  for (;;) {
    const i = await chooseBox({ title, note, options: cands.map(label), more: same.length > 1 ? `Show full ${forP ? 'pitching' : 'batting'} list` : null });
    if (i !== 'more') return i;
    const x = await listBox({ title, note: `Every ${forP ? 'pitcher' : 'hitter'} on the active roster. Click a heading to sort; the weakest are first. A player out of options cannot be sent down: he has to be designated for assignment, and another club may claim him.`, players: same, verb: how || verb });
    if (x) return cands.includes(x) ? cands.indexOf(x) : { player: x };
  }
}

/**
 * When a move needs a place that is not there (the active roster, its pitcher limit or the 40-man roster is full), ask who
 * should make way and make that move first. Returns { ok, made }: made is how many moves were done, so they can be undone.
 */
async function makeRoom(o, st, p, a) {
  const out = { ok: true, made: 0 };
  if (p.injury && a.type === 'move') return out;
  const here = placeCode(st, p);
  const up = (a.type === 'move' || a.type === 'activate') && a.to === 'MLB' && here !== 'MLB';
  if (!up && a.type !== 'add40') return out;
  const free = (x) => x.id !== p.id && !st.lock?.[x.id];
  const label = (x, how) => `${how} ${fullName(x)}: ${mainPos(x)}, age ${x.age}, ${isPitcher(x) ? 'pitcher' : 'hitter'}`;
  let c = counts(o, st);
  const lim = limits();
  if (up && (c.active >= lim.active || (isPitcher(p) && c.pitchers >= lim.pitchers))) {
    const needP = isPitcher(p) && c.pitchers >= lim.pitchers;
    const cands = o.players.filter((x) => st.active.has(x.id) && free(x) && (!needP || isPitcher(x)) && !preview(o, st, x, { type: 'move', to: 'AAA' }).error).sort((x, y) => (isPitcher(x) === isPitcher(p) ? 0 : 1) - (isPitcher(y) === isPitcher(p) ? 0 : 1) || value(x) - value(y));
    // the full list is every one of the kind on the active roster: those who cannot be optioned can still be designated
    const kind = (x) => (needP ? isPitcher(x) : isPitcher(x) === isPitcher(p));
    const full = o.players.filter((x) => st.active.has(x.id) && free(x) && kind(x));
    const moveFor = (x) => (!preview(o, st, x, { type: 'move', to: 'AAA' }).error ? { type: 'move', to: 'AAA' } : !preview(o, st, x, { type: 'dfa' }).error ? { type: 'dfa' } : null);
    const how = (x) => { const m = moveFor(x); if (!m) return { label: '', note: preview(o, st, x, { type: 'dfa' }).error || preview(o, st, x, { type: 'move', to: 'AAA' }).error }; return m.type === 'move' ? { label: 'Send down', note: 'Yes' } : { label: 'Designate', note: preview(o, st, x, { type: 'move', to: 'AAA' }).error }; };
    const i = await pickFrom({ full, how, title: `Who goes down for ${fullName(p)}?`, note: needP ? `The active roster already has ${lim.pitchers} pitchers, so a pitcher has to go down. Weakest first.` : `The active roster is full (${lim.active}). Pick the player who goes down to Triple-A. Players of the same kind first, weakest first.`, cands, label: (x) => label(x, 'Send down'), forP: isPitcher(p), verb: 'Send down' });
    if (i == null) return { ok: false, made: out.made };
    const who = typeof i === 'object' ? i.player : cands[i];
    const m = moveFor(who);
    // designating a player is a bigger step than an option: that one is explained and confirmed
    if (!m || !(await rosterAction(o, st, who, m, { ask: m.type !== 'move', room: false }))) return { ok: false, made: out.made };
    out.made++;
  }
  c = counts(o, st);
  if (!st.forty.has(p.id) && c.forty >= 40) {
    const r = await fortyRoom(o, st, p, 'to come up');
    if (!r) { for (let k = 0; k < out.made; k++) undo(); return { ok: false, made: 0 }; }
    out.made++;
  }
  return out;
}

/**
 * Explain a move, and make it if you confirm. With explanations switched off in Game Options, the
 * move is made straight away (a move that breaks a rule is still explained). A full roster asks who makes way.
 * @returns {Promise<boolean>} whether the move was made
 */
export async function rosterAction(o, st, p, a, { ask = game.settings.explainMoves !== false, room: wantRoom = true, follow = true } = {}) {
  const room = wantRoom ? await makeRoom(o, st, p, a) : { ok: true, made: 0 };
  if (!room.ok) return false;
  const back = () => { for (let k = 0; k < room.made; k++) undo(); };
  const pv = preview(o, st, p, a);
  if (pv.error || ask) {
    const yes = await confirmBox({ title: pv.title, lines: pv.effects, warnings: pv.warnings, error: pv.error });
    if (!yes) { back(); return false; }
  }
  const before = snap(st);
  checkpoint(moveLabel(p, a));
  const err = withoutLineupNote(() => perform(o, st, p, a));
  if (err) { toast(err); back(); return false; }
  toast(`Done: ${pv.title.charAt(0).toLowerCase()}${pv.title.slice(1)}.`);
  if (follow && wantRoom) await afterMove(o, st, p, a, before);
  return true;
}

// ---------- what to do next ----------

/** A small box that tells you what a move changed and offers the screens where you put it right. */
function nextBox({ title, lines, buttons }) {
  return new Promise((resolve) => {
    const close = (v) => { box.remove(); document.removeEventListener('keydown', key); resolve(v); };
    const key = (e) => { if (e.key === 'Escape') close(null); };
    const box = h('div', { class: 'dlg-back', onClick: (e) => { if (e.target === box) close(null); } },
      h('div', { class: 'dlg', role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
        h('div', { class: 'cm-title' }, title),
        h('div', { class: 'dlg-body' }, h('ul', { class: 'dlg-list' }, lines.map((l) => h('li', {}, l)))),
        h('div', { class: 'dlg-btns' }, buttons.map((b, i) => h('button', { class: `cm-btn${i === 0 ? ' go' : ''}`, onClick: () => close(b) }, b.label)), h('button', { class: 'cm-btn', onClick: () => close(null) }, 'Later'))));
    document.body.append(box);
    document.addEventListener('keydown', key);
    box.querySelector('.cm-btn')?.focus();
  });
}

const snap = (st) => ({ r: st.lineupR.map((x) => x.id), l: st.lineupL.map((x) => x.id), rot: [...st.rotation] });
const nameOf = (o, id) => { const p = playerIn(o, id); return p ? fullName(p) : 'someone'; };

/** After an injury placement or a call-up: say what the lineup and rotation did on their own, and offer the screens. */
async function afterMove(o, st, p, a, before) {
  if (game.settings.followUps === false || !['spring', 'regular'].includes(game.phase)) return;
  const now = snap(st), lines = [], buttons = [];
  const lost = (arr, b) => b.filter((id) => !arr.includes(id));
  const gained = (arr, b) => arr.filter((id) => !b.includes(id));
  const lu = (key, hand) => {
    const out = lost(now[key], before[key]), inn = gained(now[key], before[key]);
    if (out.length || inn.length) lines.push(`Batting against ${hand}-handers: ${inn.length ? inn.map((id) => nameOf(o, id)).join(' and ') + ' now in' : ''}${inn.length && out.length ? ', ' : ''}${out.length ? out.map((id) => nameOf(o, id)).join(' and ') + ' out' : ''}. The batting order may need a look.`);
  };
  const up = a.type === 'move' && a.to === 'MLB';
  const ill = a.type === 'il' || a.type === 'il60';
  if (!up && !ill) return;
  const c = counts(o, st), lim = limits();
  let title;
  if (ill) {
    title = `${fullName(p)} is on the injured list`;
    if (c.active < lim.active) lines.push(`The active roster is one short (${c.active} of ${lim.active}). Call someone up before the next game.`);
    buttons.push({ label: 'Injury Centre', go: async () => (await import('./cover-screen.js')).coverScreen(p) });
  } else {
    title = `${fullName(p)} is on the active roster`;
    if (c.active < lim.active) lines.push(`The active roster still has a gap (${c.active} of ${lim.active}).`);
  }
  lu('r', 'right'); lu('l', 'left');
  if (isPitcher(p) || before.rot.join() !== now.rot.join()) {
    const out = lost(now.rot, before.rot), inn = gained(now.rot, before.rot);
    if (out.length || inn.length) lines.push(`Rotation: ${inn.length ? `${inn.map((id) => nameOf(o, id)).join(' and ')} takes the spot` : 'a spot is open'}${out.length ? ` of ${out.map((id) => nameOf(o, id)).join(' and ')}` : ''}. Check who starts next.`);
    else if (up && isPitcher(p)) lines.push(`${fullName(p)} is in the bullpen. The rotation is unchanged.`);
  }
  if (up && !isPitcher(p) && ![...now.r, ...now.l].includes(p.id)) lines.push(`${fullName(p)} is not in either lineup. He is on the bench until you put him in.`);
  if (!lines.length) return;
  buttons.push({ label: 'Batting lineup', go: async () => (await import('./club-tactics.js')).clubTactics('lineupR') });
  if (isPitcher(p) || before.rot.join() !== now.rot.join()) buttons.push({ label: 'Pitching staff', go: async () => (await import('./club-tactics.js')).clubTactics('pitching') });
  const pick = await nextBox({ title, lines, buttons });
  if (pick) nav.push(await pick.go());
}

/**
 * The 40-man roster is full and p needs a place (a call-up, a waiver claim, a protected prospect, a Rule 5 pick). A pop-up
 * shows who could go, the assistant's choice first with his reason, and designates the one you pick. Returns true when there is room.
 */
export async function fortyRoom(o, st, p, why = 'to be added') {
  if (counts(o, st).forty < 40) return true;
  const list = cuttable(o, st, p);
  const label = (x, i) => `${i === 0 ? 'Assistant suggests: ' : ''}Designate ${fullName(x)}: ${mainPos(x)}, age ${x.age}, ${isPitcher(x) ? 'pitcher' : 'hitter'}${i === 0 ? ' (the weakest you can spare)' : ''}`;
  const i = await pickFrom({ title: `Who comes off the 40-man for ${fullName(p)}?`, note: `The 40-man roster is full, so a place has to be made ${why}. The player you pick is designated for assignment: another club can claim him within seven days. Players on the active roster, the injured list and Rule 5 picks are not offered. Weakest first.${why === 'for the claim' ? ' If another club is ahead of you and wins the claim, he is still designated.' : ''}`, cands: list, label, forP: isPitcher(p), verb: 'Designate' });
  if (i == null) return false;
  return rosterAction(o, st, list[i], { type: 'dfa' }, { ask: false, room: false, follow: false });
}
