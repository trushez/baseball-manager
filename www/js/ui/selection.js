// Team selection in the CM 84/85 manner: the slots along the top, the squad in two columns underneath,
// each player with a box showing where he is picked and his positions in yellow. Click a slot, then a
// player (or a player, then a slot). Picking a player who already has a slot swaps the two.
//
// Batting: nine slots in batting order, each with a fielding position; a selected slot can change its
// position from the row of positions. Pitching: five starters, then the bullpen roles.
import { h, toast, dropdown } from './dom.js';
import { plink } from './club-ui.js';
import { num } from './attr-ui.js';
import { fullName, isPitcher, FIELD_POS } from '../data/world.js';
import { game, orgState } from '../state.js';
import { rosterAction } from './roster-action.js';
import { coverBanner } from './cover-screen.js';
import { limits } from '../season/roster.js';
import { counts } from '../club/depth.js';
import { seasonLine, lastSeason, fix, ipText, rate3 } from '../data/world.js';
import { attr, posString, familiarity } from '../data/attributes.js';
import { armStatus, staffPlan, dayWord, daysRest } from '../season/sim.js';
import { dayNo } from '../season/calendar.js';
import { tboPlus, tbaMinus } from '../season/tb.js';
import { value } from '../season/value.js';
import { activeHitters, activePitchers, bestLineup, lineupProblems, playerIn, PEN_ROLES, autoStaff } from '../club/depth.js';

/** "4 days' rest", "fully rested". */
const restWords = (r) => (r >= 7 ? 'fully rested' : `${r} day${r === 1 ? '' : 's'}' rest`);

const ROLE_SHORT = { Closer: 'CL', Setup: 'SU', Matchup: 'MU', Middle: 'MR', Long: 'LR' };

/** Injured, tired or worked hard lately: a tag after the name. */
function tag(p) {
  if (p.injury) return h('span', { class: 'sel-inj', title: p.injury.type }, 'Inj');
  if (isPitcher(p)) {
    if (!game.season || !p.plog?.length) return null;
    const a = armStatus(p, dayNo(game.date));
    // in the postseason nobody is out of reach: a worn arm is exhausted, yours to use at his own risk
    if (a === 'Unavailable' && game.phase === 'post') return h('span', { class: 'sel-tired', title: 'Exhausted: he can pitch, but well below his best and at greater risk of injury' }, 'Exhausted');
    return a === 'Rested' ? null : h('span', { class: a === 'Tired' ? 'sel-tired' : 'sel-inj' }, a);
  }
  return (p.fat || 0) > 70 ? h('span', { class: 'sel-tired', title: `Fatigue ${Math.round(p.fat)}%` }, 'Tired') : null;
}

/** The same tag as a short box for the squad lists: Inj, Tir (tired) or Una (unavailable, worked too hard). */
function shortTag(p) {
  const t = p ? tag(p) : null;
  if (!t) return h('span', { class: 'sq-tag' });
  const w = t.textContent;
  const code = w === 'Inj' ? 'Inj' : w === 'Tired' ? 'Tir' : w === 'Exhausted' ? 'Exh' : 'Una';
  return h('span', { class: `sq-tag ${code === 'Tir' || code === 'Exh' ? 'tir' : 'inj'}`, title: w === 'Inj' ? t.title : w }, code);
}

/** A player's row: the slot box, his name, his positions in yellow, a few figures. */
function playerRow(p, box, { on, sel, figs, click, sub }) {
  return h('div', { class: `sel-row${on ? ' on' : ''}${sel ? ' sel' : ''}`, onClick: (e) => { if (!e.target.closest('.pl')) click(); } },
    h('span', { class: `sel-box${box ? ' full' : ''}` }, box || ''),
    h('span', { class: 'sel-name' }, plink(p, `${p.last}, ${p.first[0]}`), tag(p)),
    h('span', { class: 'sel-pos', title: posString(p) }, posString(p)),
    h('span', { class: 'sel-figs' }, figs),
    sub ? h('span', { class: 'sel-sub' }, sub) : null);
}

// ---------- sorting: the grey Sort By box ----------

const SORT = { bat: 'order', pit: 'slot' }; // kept while the game is open
const POS_ORDER = ['C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF', 'DH', 'SP', 'RP'];
const posRank = (p) => { const first = posString(p).split(/[\/ (]/)[0]; const i = POS_ORDER.indexOf(first); return i < 0 ? 99 : i; };
const BAT_SORTS = [['name', 'Name'], ['pos', 'Position'], ['order', 'Batting order'], ['ovr', 'Overall'],
  ['contact', 'Contact'], ['power', 'Power'], ['gap', 'Gap Power'], ['eye', 'Eye'], ['avoidK', 'Avoid Strikeouts'], ['speed', 'Speed'], ['range', 'Range'], ['arm', 'Arm Strength']];
const PIT_SORTS = [['name', 'Name'], ['slot', 'Rotation and bullpen order'], ['ovr', 'Overall'],
  ['velocity', 'Velocity'], ['stuff', 'Stuff'], ['movement', 'Movement'], ['control', 'Control'], ['cmd', 'Command'], ['stamina', 'Stamina'], ['recov', 'Recovery']];

/** The grey drop-down above the squad lists, as in CM. */
function sortBox(kind, options, ui) {
  return h('div', { class: 'sel-tools' },
    dropdown(options.map(([k, l]) => [k, l]), SORT[kind], (v) => { SORT[kind] = v; ui.render(); }, { label: 'Sort By: ', title: 'Sort the squad', wide: true }));
}

/** Put the players in the chosen order; ties fall back to the name. */
function sorted(list, kind, { slotOf, hand = 'R' }) {
  const key = SORT[kind];
  const byName = (a, b) => a.last.localeCompare(b.last) || a.first.localeCompare(b.first);
  const val = (p, k) => { const a = attr(p, k); return Array.isArray(a) ? a[hand === 'R' ? 0 : 1] : a; };
  const by = key === 'name' ? byName
    : key === 'pos' ? (a, b) => posRank(a) - posRank(b) || byName(a, b)
    : key === 'order' || key === 'slot' ? (a, b) => (slotOf.get(a.id) ?? 99) - (slotOf.get(b.id) ?? 99) || byName(a, b)
    : key === 'ovr' ? (a, b) => value(b) - value(a) || byName(a, b)
    : (a, b) => (val(b, key) ?? 0) - (val(a, key) ?? 0) || byName(a, b);
  return [...list].sort(by);
}

// ---------- batting ----------

/**
 * @param {any} o organisation  @param {any} st its state  @param {'R'|'L'} hand opposing starter's hand
 * @param {{picked:any, set:(v:any)=>void, render:()=>void}} ui selection state kept by the screen
 */
export function battingSelection(o, st, hand, ui) {
  const key = hand === 'R' ? 'lineupR' : 'lineupL';
  // a player who has left the club (a free agent over the winter) cannot stay in the lineup
  if (st[key].some((s) => !playerIn(o, s.id))) st[key] = bestLineup(activeHitters(o, st), hand);
  const lu = st[key];
  const slotOf = new Map(lu.map((s, i) => [s.id, i]));
  const hitters = sorted(activeHitters(o, st), 'bat', { slotOf, hand });
  const pick = ui.picked; // { slot: i } or { id }

  function place(i, id) {
    const j = slotOf.get(id);
    if (j === i) { ui.set(null); return ui.render(); }
    if (j != null) [lu[i].id, lu[j].id] = [lu[j].id, lu[i].id]; // both in the lineup: swap their places in the order
    else lu[i] = { id, pos: lu[i].pos };
    ui.set(null); ui.render();
  }
  const clickSlot = (i) => {
    if (pick?.id) return place(i, pick.id);
    if (pick?.slot != null && pick.slot !== i) { [lu[i], lu[pick.slot]] = [lu[pick.slot], lu[i]]; ui.set(null); return ui.render(); }
    ui.set(pick?.slot === i ? null : { slot: i }); ui.render();
  };
  const clickPlayer = (p) => {
    if (pick?.slot != null) return place(pick.slot, p.id);
    const j = slotOf.get(p.id);
    ui.set(j != null ? { slot: j } : pick?.id === p.id ? null : { id: p.id }); ui.render();
  };
  const setPos = (pos) => {
    const i = pick.slot;
    const k = lu.findIndex((s, x) => x !== i && s.pos === pos);
    if (k >= 0) lu[k].pos = lu[i].pos; // the man there takes this slot's old position
    lu[i].pos = pos;
    ui.render();
  };

  const slots = h('div', { class: 'sel-slots' }, lu.map((s, i) => {
    const p = playerIn(o, s.id);
    return h('button', { class: `sel-slot${pick?.slot === i ? ' on' : ''}`, onClick: () => clickSlot(i) },
      h('b', {}, `${i + 1}`), h('span', { class: 'p' }, s.pos), h('span', { class: 'n' }, p ? p.last : '-'));
  }));
  const posRow = pick?.slot != null ? h('div', { class: 'sel-posrow' },
    h('span', { class: 'cm-s' }, `Position for number ${pick.slot + 1}: `),
    [...FIELD_POS, 'DH'].map((pos) => h('button', { class: `cm-btn${lu[pick.slot].pos === pos ? ' go' : ''}`, onClick: () => setPos(pos) }, pos))) : null;

  const figs = (p) => {
    const i = hand === 'R' ? 0 : 1;
    const v = (k) => { const a = attr(p, k); return Array.isArray(a) ? a[i] : a; };
    return [['Con', v('contact')], ['Pow', v('power')], ['Eye', v('eye')], ['Spd', v('speed')]].map(([l, x]) => h('span', { class: 'f' }, h('i', {}, l), num(x)));
  };
  const rows = hitters.map((p) => {
    const i = slotOf.get(p.id);
    return playerRow(p, i != null ? lu[i].pos : '', { on: i != null, sel: pick?.id === p.id || (i != null && pick?.slot === i), figs: figs(p), click: () => clickPlayer(p) });
  });
  const half = Math.ceil(rows.length / 2);

  // what is wrong, and who is playing a position he doesn't know
  const problems = lineupProblems(lu, o, st);
  const away = lu.filter((s) => s.pos !== 'DH' && familiarity(playerIn(o, s.id), s.pos) < 15).map((s) => `${playerIn(o, s.id).last} is playing out of position at ${s.pos}.`);
  const hint = pick?.slot != null ? `Number ${pick.slot + 1} selected: click a player to bat there, another slot to swap, or a position below.`
    : pick?.id ? `${fullName(playerIn(o, pick.id))} selected: click the slot to put him in.` : 'Click a slot, then a player. Clicking two slots swaps them in the order.';
  // a place on the active roster is open: choose who comes up from the 40-man roster, right here (the pitching tab does the same for arms)
  const hitterCallups = (() => {
    if (ui.level || !game.season || !['regular', 'spring'].includes(game.phase) || o.id !== game.orgId) return null;
    const c = counts(o, st), lim = limits();
    if (c.active >= lim.active) return null;
    const cands = o.players.filter((p) => !isPitcher(p) && st.forty.has(p.id) && !st.active.has(p.id) && !st.il.has(p.id) && !st.dfa.has(p.id) && !p.injury).sort((a, b) => value(b) - value(a)).slice(0, 8);
    const yr = game.season.year;
    const line = (p) => { const x = seasonLine(p, 'bat', yr), y = x?.pa >= 30 ? x : lastSeason(p, 'bat'); return y?.pa ? `${y.season}: ${rate3(y.avg)}, ${y.hr} HR, ${y.rbi} RBI, ${rate3(y.ops)} OPS` : 'no plate appearances'; };
    const hf = (p) => [['Con', 'contact'], ['Pow', 'power'], ['Eye', 'eye'], ['Spd', 'speed']].map(([l, k]) => h('span', { class: 'f' }, h('i', {}, l), num(attr(p, k))));
    return h('div', { class: 'sel-callup' },
      h('div', { class: 'cm-h' }, `A place on the active roster is open (${c.active} of ${lim.active}): call a hitter up from your 40-man roster`),
      cands.length ? cands.map((p) => h('div', { class: 'sel-row on hc' },
        h('span', { class: 'sel-box' }, st.level.get(p.id) || 'AAA'),
        h('span', { class: 'sel-name' }, plink(p, `${p.last}, ${p.first[0]}`)),
        h('span', { class: 'sel-pos', title: posString(p) }, posString(p)),
        h('span', { class: 'sel-figs' }, hf(p)),
        h('span', { class: 'cm-s hl' }, line(p)),
        h('button', { class: 'cm-btn go', onClick: async () => {
          if (await rosterAction(o, st, p, { type: 'move', to: 'MLB' }, { follow: false })) { toast(`${p.last} is on the active roster.`); ui.set(null); ui.render(); }
        } }, 'Call up'))) : h('p', { class: 'cm-s cm-pad cm-empty' }, 'No healthy hitter on your 40-man roster is available. Add one from the Squad screen.'));
  })();
  return h('div', { class: 'sel' },
    h('div', { class: 'sel-head' }, `Lineup against ${hand === 'R' ? 'right' : 'left'}-handed starters`),
    slots, posRow,
    h('p', { class: 'cm-sub' }, hint),
    ui.level ? null : coverBanner(o, st),
    hitterCallups,
    sortBox('bat', BAT_SORTS, ui),
    h('div', { class: 'sel-cols' }, h('div', {}, rows.slice(0, half)), h('div', {}, rows.slice(half))),
    problems.length || away.length ? h('div', { class: 'cm-pad' }, problems.map((x) => h('div', { class: 'cm-r' }, x)), away.map((x) => h('div', { class: 'cm-y' }, x)))
      : h('div', { class: 'cm-pad cm-g' }, 'The lineup is ready.'),
    h('div', { class: 'cm-pad btnrow' },
      h('button', { class: 'cm-btn', onClick: () => { st[key] = bestLineup(activeHitters(o, st), hand); ui.set(null); ui.render(); toast("The assistant's lineup is in."); } }, "Assistant's Lineup"),
      h('button', { class: 'cm-btn', onClick: () => { const other = key === 'lineupR' ? 'lineupL' : 'lineupR'; st[key] = st[other].map((x) => ({ ...x })); ui.set(null); ui.render(); toast(`This lineup is now the same as the one against ${hand === 'R' ? 'left' : 'right'}-handers.`); } }, `Copy the lineup against ${hand === 'R' ? 'left' : 'right'}-handers`),
      lockButton(st, ui)));
}

/** Keeps the batting orders exactly as set: no trade, injury or call-up makes the assistant change them. */
function lockButton(st, ui) {
  const on = !!st.lineupLock;
  return h('button', { class: `cm-btn${on ? ' go' : ''}`, title: 'When on, the assistant never changes your batting orders, whatever happens on the roster. A man who is hurt is still replaced for that game only.',
    onClick: () => { st.lineupLock = !on; ui.render(); toast(st.lineupLock ? 'Lineups locked: the assistant will not change them.' : 'Lineups unlocked: the assistant fills a place when a player leaves.'); } },
    on ? 'Lineups locked' : 'Lock lineups');
}

// ---------- pitching ----------

/** The slots: five starters, then the bullpen in role order. */
function staffSlots(o, st) {
  const out = st.rotation.map((id, i) => ({ code: `SP${i + 1}`, role: 'SP', id }));
  const pen = activePitchers(o, st).filter((p) => !st.rotation.includes(p.id));
  const left = [...pen];
  for (const role of PEN_ROLES) {
    const i = left.findIndex((p) => (st.pen[p.id] || 'Middle') === role);
    out.push({ code: ROLE_SHORT[role], role, id: i >= 0 ? left.splice(i, 1)[0].id : null });
  }
  // anyone else in the bullpen (rosters of 14 pitchers in September)
  for (const p of left) out.push({ code: ROLE_SHORT[st.pen[p.id] || 'Middle'], role: st.pen[p.id] || 'Middle', id: p.id });
  return out;
}

export function pitchingSelection(o, st, ui) {
  // turns the rotation so SP1 is the next starter, and when each man is due
  const plan = game.season && !ui.level ? staffPlan(o.id) : new Map();
  const slots = staffSlots(o, st);
  const slotOf = new Map(slots.map((s, i) => [s.id, i]).filter(([id]) => id));
  const arms = sorted(activePitchers(o, st), 'pit', { slotOf });
  const pick = ui.picked;

  // write the slots back: rotation in order, bullpen roles
  function commit(list) {
    st.rotation = list.filter((s) => s.role === 'SP').map((s) => s.id).filter(Boolean);
    const pen = {};
    for (const s of list) if (s.role !== 'SP' && s.id) pen[s.id] = s.role;
    st.pen = pen;
  }
  function place(i, id) {
    const list = slots.map((s) => ({ ...s }));
    const j = slotOf.get(id);
    if (j === i) { ui.set(null); return ui.render(); }
    if (j != null) [list[i].id, list[j].id] = [list[j].id, list[i].id];
    else list[i].id = id;
    commit(list); ui.set(null); ui.render();
  }
  const clickSlot = (i) => {
    if (pick?.id) return place(i, pick.id);
    if (pick?.slot != null && pick.slot !== i && slots[pick.slot].id) return place(i, slots[pick.slot].id);
    ui.set(pick?.slot === i ? null : { slot: i }); ui.render();
  };
  const clickPlayer = (p) => {
    if (pick?.slot != null) return place(pick.slot, p.id);
    const j = slotOf.get(p.id);
    ui.set(j != null ? { slot: j } : pick?.id === p.id ? null : { id: p.id }); ui.render();
  };

  const strip = h('div', { class: 'sel-slots pit' }, slots.map((s, i) => {
    const p = s.id && playerIn(o, s.id);
    return h('button', { class: `sel-slot${pick?.slot === i ? ' on' : ''}${s.role === 'SP' ? ' sp' : ''}`, onClick: () => clickSlot(i) },
      h('b', {}, s.code), h('span', { class: 'n' }, p ? p.last : '-'),
      s.role === 'SP' && p && game.season ? h('span', { class: `r${daysRest(p, dayNo(game.date)) < 4 ? ' short' : ''}` }, restWords(daysRest(p, dayNo(game.date)))) : null,
      s.role === 'SP' ? h('span', { class: `d${plan.get(s.id)?.n === 0 ? ' now' : ''}` }, plan.has(s.id) ? dayWord(plan.get(s.id).d) : p?.injury ? 'Injured' : game.season ? 'Skipped' : '') : null);
  }));
  // the next games, and who starts them
  const order = [...plan.entries()].sort((a, b) => a[1].n - b[1].n);
  const lineUp = order.length ? h('div', { class: 'sel-plan' },
    h('span', { class: 'cm-s' }, 'Starting: '),
    order.map(([id, x], k) => h('span', { class: `sp${x.n === 0 ? ' now' : ''}` }, k ? ', ' : '', h('b', {}, playerIn(o, id).last), ` (${dayWord(x.d)})`))) : null;
  // make a starter go next: the rotation turns to him, keeping its order
  const firstUp = pick?.slot != null && slots[pick.slot].role === 'SP' && pick.slot > 0 && slots[pick.slot].id
    ? h('button', { class: 'cm-btn go', onClick: () => { const k = pick.slot; st.rotation = [...st.rotation.slice(k), ...st.rotation.slice(0, k)]; st.rotIdx = 0; ui.set(null); ui.render(); toast(`${playerIn(o, slots[k].id).last} starts next.`); } }, `Start ${playerIn(o, slots[pick.slot].id).last} next`) : null;
  // one table: slot, name, ratings, then the season line, then rest. This season's line (last season's until he has pitched 5 innings)
  const yrNow = game.season?.year ?? game.year;
  const lineOf = (p) => { const x = seasonLine(p, 'pit', yrNow); return x?.outs >= 15 ? x : lastSeason(p, 'pit'); };
  const restShort = (p) => (game.season && p.plog?.length ? (daysRest(p, dayNo(game.date)) >= 7 ? 'Rested' : `${daysRest(p, dayNo(game.date))} d`) : '');
  const ATT = [['Stf', 'stuff'], ['Mov', 'movement'], ['Ctl', 'control'], ['Vel', 'velocity'], ['Sta', 'stamina']];
  const figs = (p) => ATT.map(([l, k]) => h('span', { class: 'f' }, h('i', {}, l), num(attr(p, k))));
  const rows = arms.map((p) => {
    const i = slotOf.get(p.id), y = lineOf(p), on = i != null;
    const t = (v) => h('td', {}, y?.outs ? v : '-');
    return h('tr', { class: `${on ? 'on' : ''}${pick?.id === p.id || (on && pick?.slot === i) ? ' sel' : ''}`, onClick: (e) => { if (!e.target.closest('.pl')) clickPlayer(p); } },
      h('td', {}, h('span', { class: `sel-box${on ? ' full' : ''}` }, on ? slots[i].code : '')),
      h('td', { class: 'l nm' }, plink(p, `${p.last}, ${p.first[0]}`), ' ', shortTag(p)),
      ...ATT.map(([, k]) => h('td', {}, num(attr(p, k)))),
      t(`${y?.w}-${y?.l}`), t(fix(y?.era)), t(ipText(y?.outs)), t(y?.so), t(fix(y?.whip)), t(y?.sv || y?.hld ? `${y.sv || 0}/${y.hld || 0}` : ''),
      h('td', { class: 'cm-s' }, restShort(p)));
  });
  const half = Math.ceil(rows.length / 2);
  const staffTable = (part) => h('div', { class: 'cm-tblwrap' }, h('table', { class: 'cm-tbl stafftbl' },
    h('thead', {}, h('tr', {}, ['', 'Pitcher', 'Stf', 'Mov', 'Ctl', 'Vel', 'Sta', 'W-L', 'ERA', 'IP', 'K', 'WHIP', 'SV/H', 'Rest'].map((c, i) => h('th', { class: i === 1 ? 'l' : '' }, c)))),
    h('tbody', {}, part)));
  const staffTables = h('div', {}, h('div', { class: 'sel-cols' }, staffTable(rows.slice(0, half)), staffTable(rows.slice(half))),
    h('p', { class: 'cm-s cm-pad' }, `Season figures are for ${(arms[0] && lineOf(arms[0])?.season) ?? yrNow}, or last season's until a pitcher has thrown 5 innings. SV/H is saves and holds. Rest is days since he last pitched. Inj is injured, Tir tired, Una unavailable (in the postseason Exh, exhausted: usable, at a cost).`));
  // a place on the pitching staff is open: choose who comes up from the 40-man roster, right here
  const callups = (() => {
    if (ui.level || !game.season || !['regular', 'spring'].includes(game.phase) || o.id !== game.orgId) return null;
    const c = counts(o, st), lim = limits();
    if (c.pitchers >= lim.pitchers || c.active >= lim.active) return null;
    const cands = o.players.filter((p) => isPitcher(p) && st.forty.has(p.id) && !st.active.has(p.id) && !st.il.has(p.id) && !st.dfa.has(p.id) && !p.injury).sort((a, b) => value(b) - value(a));
    const yr = game.season.year;
    const era = (p) => { const x = seasonLine(p, 'pit', yr), y = x?.outs >= 15 ? x : lastSeason(p, 'pit'); return y?.outs ? `${fix(y.era)} ERA, ${ipText(y.outs)} IP` : 'no innings'; };
    const open = pick?.slot != null && slots[pick.slot].role !== 'SP' && !slots[pick.slot].id ? slots[pick.slot] : null;
    return h('div', { class: 'sel-callup' },
      h('div', { class: 'cm-h' }, `A pitching place is open (${c.pitchers} of ${lim.pitchers}): call one up from your 40-man roster`),
      cands.length ? cands.map((p) => h('div', { class: 'sel-row on pc' },
        h('span', { class: 'sel-box' }, st.level.get(p.id) || 'AAA'),
        h('span', { class: 'sel-name' }, plink(p, `${p.last}, ${p.first[0]}`)),
        h('span', { class: 'sel-pos' }, posString(p)),
        h('span', { class: 'sel-figs' }, h('span', { class: 'f' }, era(p)), figs(p)),
        h('button', { class: 'cm-btn go', onClick: async () => {
          if (await rosterAction(o, st, p, { type: 'move', to: 'MLB' }, { follow: false })) {
            if (open) { st.pen[p.id] = open.role; toast(`${p.last} is in the bullpen as ${open.role.toLowerCase()}.`); }
            ui.set(null); ui.render();
          }
        } }, open ? `Call up as ${ROLE_SHORT[open.role]}` : 'Call up'))) : h('p', { class: 'cm-s cm-pad cm-empty' }, 'No healthy pitcher on your 40-man roster is available. Add one from the Squad screen.'),
      h('p', { class: 'cm-s cm-pad' }, 'Select an open bullpen slot first to put him straight into that role.'));
  })();
  const closers = slots.filter((s) => s.role === 'Closer' && s.id).length;
  const hint = pick?.slot != null ? `${slots[pick.slot].code} selected: click a pitcher to put him there, or another slot to swap.`
    : pick?.id ? `${fullName(playerIn(o, pick.id))} selected: click the slot to put him in.` : 'Click a slot, then a pitcher. SP1 starts the next game and the rest follow in order (a starter not rested enough is skipped). Select a starter to make him go next.';
  return h('div', { class: 'sel' },
    h('div', { class: 'sel-head' }, 'Rotation and bullpen'),
    ui.level ? null : coverBanner(o, st),
    // who decides the starter: you, strictly in order, or the assistant, working round tired arms
    h('div', { class: 'sel-mode' },
      h('span', { class: 'cm-s' }, 'Rotation: '),
      [['auto', 'Automatic'], ['manual', 'Manual']].map(([k, l]) => h('button', { class: `cm-btn${(st.rotMode || 'auto') === k ? ' go' : ''}`, onClick: () => { st.rotMode = k; ui.render(); } }, l)),
      h('span', { class: 'cm-s mode-note' }, (st.rotMode || 'auto') === 'manual'
        ? 'Manual: SP1 starts the next game whatever his rest. Short rest (three days) costs him stuff and stamina; less than that and he is exhausted, pitches badly and risks injury.'
        : 'Automatic: the next starter who has had four days\' rest goes; a tired one is skipped and goes later. Bring anyone forward with Start him next.')),
    lineUp,
    strip,
    h('p', { class: 'cm-sub' }, hint, firstUp ? ' ' : null, firstUp),
    callups,
    sortBox('pit', PIT_SORTS, ui),
    staffTables,
    !arms.length ? h('div', { class: 'cm-pad cm-s cm-empty' }, 'No pitchers at this level yet.')
      : st.rotation.length < 5 ? h('div', { class: 'cm-pad cm-r' }, `Only ${st.rotation.length} starter${st.rotation.length === 1 ? '' : 's'}: fill all five rotation slots.`)
      : closers ? h('div', { class: 'cm-pad cm-g' }, 'The staff is set.') : h('div', { class: 'cm-pad cm-y' }, 'No closer named: the best reliever available will close.'),
    h('div', { class: 'cm-pad btnrow' },
      h('button', { class: 'cm-btn', onClick: () => { autoStaff(o, st); ui.set(null); ui.render(); toast("The assistant's staff is in."); } }, "Assistant's Staff")));
}

// ---------- the team on one page: lineup and bench on the left, rotation and bullpen on the right ----------

let TEAM_HAND = 'R';
/** The squad as CM 01/02 lays it out (slot box, tag, name, positions), with the same moves as the other tabs: click one player, then another, to swap them. */
export function teamSelection(o, st, ui) {
  const hand = TEAM_HAND, key = hand === 'R' ? 'lineupR' : 'lineupL';
  if (st[key].some((s) => !playerIn(o, s.id))) st[key] = bestLineup(activeHitters(o, st), hand);
  const lu = st[key];
  const slotOf = new Map(lu.map((s, i) => [s.id, i]));
  const bench = sorted(activeHitters(o, st).filter((p) => !slotOf.has(p.id)), 'bat', { slotOf, hand });
  const slots = staffSlots(o, st), pslot = new Map(slots.map((x, i) => [x.id, i]).filter(([id]) => id));
  const pick = ui.picked; // { bat: id } or { pit: slotIndex }
  const done = () => { ui.set(null); ui.render(); };

  // hitters: two lineup places swap their players (positions stay with the place); a bench player takes a lineup place
  const clickBat = (p) => {
    const a = pick?.bat;
    if (!a) { ui.set({ bat: p.id }); return ui.render(); }
    if (a === p.id) return done();
    const i = slotOf.get(a), j = slotOf.get(p.id);
    // moving within the order: each takes the other's place in the order and keeps his own position; a bench player takes the place and its position
    if (i != null && j != null) [lu[i], lu[j]] = [lu[j], lu[i]];
    else if (i != null) lu[i] = { id: p.id, pos: lu[i].pos };
    else if (j != null) lu[j] = { id: a, pos: lu[j].pos };
    else { ui.set({ bat: p.id }); return ui.render(); }
    done();
  };
  const setPos = (pos) => {
    const i = slotOf.get(pick.bat);
    const k = lu.findIndex((x, n) => n !== i && x.pos === pos);
    if (k >= 0) lu[k].pos = lu[i].pos; // the man there takes this place's old position
    lu[i].pos = pos; ui.render();
  };
  // pitchers: every row is a slot; two slots swap their pitchers, and the rotation and bullpen are written back
  const clickPit = (i) => {
    const a = pick?.pit;
    if (a == null) { if (slots[i].id) { ui.set({ pit: i }); ui.render(); } return; }
    if (a === i) return done();
    const list = slots.map((x) => ({ ...x }));
    [list[i].id, list[a].id] = [list[a].id, list[i].id];
    st.rotation = list.filter((x) => x.role === 'SP').map((x) => x.id).filter(Boolean);
    const pen = {}; for (const x of list) if (x.role !== 'SP' && x.id) pen[x.id] = x.role;
    st.pen = pen; done();
  };

  // a few season figures after the positions (the same for everyone, so the two lists line up)
  const sea = (p) => (ui.season ? ui.season(p) : lastSeason(p));
  const f1 = (l, v) => h('span', { class: 'sq-fig' }, v);
  const keys = (p) => {
    if (!p) return null;
    const x = sea(p);
    const lv = x?.level && !String(x.level).includes('/') ? x.level : 'MLB';
    return isPitcher(p) ? [f1('ERA', x?.outs ? fix(x.era) : '-'), f1('IP', x?.outs ? ipText(x.outs) : '-'), f1('SO', x?.outs ? x.so : '-'), f1('TBA9-', x?.outs ? tbaMinus(x, p, x.season, lv) ?? '-' : '-')]
      : [f1('AVG', x?.ab ? rate3(x.avg) : '-'), f1('HR', x ? x.hr : '-'), f1('RBI', x ? x.rbi : '-'), f1('TBO9+', x?.pa ? tboPlus(x, x.season, lv) ?? '-' : '-')];
  };
  const colh = (hs, ord) => h('div', { class: `sq-row full sq-colh${ord ? ' ord' : ''}` }, ord ? h('span') : null, h('span'), h('span'), h('span', { class: 'sq-name' }, 'Name'), h('span', { class: 'sq-pos' }, 'Pos'), h('span', { class: 'sq-figs' }, hs.map((x) => h('span', { class: 'sq-fig' }, x))));
  const row = (code, p, on, click, sub, n) => h('div', { class: `sq-row full edit${on ? ' sel' : ''}${sub ? ' sub' : ''}${n != null ? ' ord' : ''}`, onClick: (e) => { if (!e.target.closest('.pl')) click(); } },
    n != null ? h('span', { class: 'sq-n' }, n) : null, h('span', { class: `sq-slot${sub ? ' sub' : ''}` }, code), shortTag(p),
    h('span', { class: 'sq-name' }, p ? plink(p, fullName(p)) : h('span', { class: 'cm-s' }, 'empty')),
    h('span', { class: 'sq-pos', title: p && !isPitcher(p) ? posString(p) : '' }, p ? (isPitcher(p) ? (p.role === 'Starter' ? 'SP' : p.role === 'Closer' ? 'CL' : 'RP') : posString(p)) : ''),
    h('span', { class: 'sq-figs' }, keys(p)));
  const left = [...lu.map((x, i) => row(x.pos, playerIn(o, x.id), pick?.bat === x.id, () => clickBat(playerIn(o, x.id)), false, i + 1)),
    ...bench.map((p, i) => row(`BN${i + 1}`, p, pick?.bat === p.id, () => clickBat(p), true, ''))];
  const right = slots.map((x, i) => row(x.code, x.id ? playerIn(o, x.id) : null, pick?.pit === i, () => clickPit(i), x.role !== 'SP' && !x.id));
  const lineupPick = pick?.bat && slotOf.has(pick.bat);
  // always the same height, so nothing below it moves when you pick a player
  const posRow = h('div', { class: `sq-posrow${lineupPick ? '' : ' idle'}` }, h('span', { class: 'cm-s' }, lineupPick ? `Position for ${fullName(playerIn(o, pick.bat))}: ` : 'Pick a lineup player to change his position'),
    lineupPick ? [...FIELD_POS, 'DH'].map((pos) => h('button', { class: `cm-btn${lu[slotOf.get(pick.bat)].pos === pos ? ' go' : ''}`, onClick: () => setPos(pos) }, pos)) : null);
  const problems = lineupProblems(lu, o, st);
  const away = lu.filter((s) => s.pos !== 'DH' && familiarity(playerIn(o, s.id), s.pos) < 15).map((s) => `${playerIn(o, s.id).last} is playing out of position at ${s.pos}.`);
  const msg = pick ? 'Now click the player to swap with: each keeps his own position and they trade places in the order.' : 'Click a player, then another, to swap their places in the batting order. Their positions travel with them.';
  return h('div', { class: 'sq-sel' },
    h('div', { class: 'sq-head' }, 'Position(s)'),
    h('div', { class: 'sq-bar' }, lu.map((x) => h('span', { class: 'sq-cell' }, x.pos)), h('span', { class: 'sq-gap' }), slots.slice(0, 14).map((x) => h('span', { class: 'sq-cell' }, x.code))),
    h('div', { class: 'sq-vs' }, h('span', { class: 'cm-s' }, 'Lineup shown'), ['R', 'L'].map((k) => h('button', { class: `grp-btn${hand === k ? ' on' : ''}`, onClick: () => { TEAM_HAND = k; ui.set(null); ui.render(); } }, k === 'R' ? 'v right-handers' : 'v left-handers'))),
    posRow,
    h('div', { class: 'sq-cols full' }, h('div', {}, h('div', { class: 'sq-sub' }, 'Lineup and bench', h('span', { class: 'sq-subnote' }, ' (batting order top to bottom)')), colh(['AVG', 'HR', 'RBI', 'TBO9+'], true), left), h('div', {}, h('div', { class: 'sq-sub' }, 'Rotation and bullpen'), colh(['ERA', 'IP', 'SO', 'TBA9-']), right)),
    h('div', { class: 'sq-msg' }, h('div', { class: problems.length || away.length ? 'cm-r' : 'cm-g' }, problems.length || away.length ? [...problems, ...away].join(' ') : 'The lineup is ready.'), h('div', { class: 'cm-s' }, msg)),
    h('div', { class: 'cm-pad btnrow' }, h('button', { class: 'cm-btn', onClick: () => { st[key] = bestLineup(activeHitters(o, st), hand); done(); toast("The assistant's lineup is in."); } }, "Assistant's lineup"),
      lockButton(st, ui),
      h('button', { class: 'cm-btn', onClick: () => { autoStaff(o, st); done(); toast("The assistant's staff is in."); } }, "Assistant's pitching staff")));
}
