// In-game tactics: opened from the sidebar during a match. The match pauses while you are here;
// anything you confirm happens before the next pitch.
import { av, avSort, avShort, avLabel } from './attr-ui.js';
import { h, fill, cmTabs, val, toast, fullName } from './dom.js';
import { pl } from './player-screen.js';
import { nav } from './nav.js';

/**
 * @param {{club:any, getState:()=>any, getPitcher:()=>any, getBatter:()=>any, userBatting:()=>boolean,
 *          queue:any[], onQueue:(cmd:any)=>void}} m
 */
export function tacticsScreen(m) {
  const club = m.club;
  const body = h('div', { class: 'cm-panel grow' });
  const queued = h('div', { class: 'cm-panel cm-pad' });
  const tabs = [
    { id: 'pitch', label: 'Pitching Change' }, { id: 'subs', label: 'Pinch Hit / Run' },
    { id: 'def', label: 'Defensive Changes' }, { id: 'instr', label: 'Instructions' },
  ];
  let cur = 'pitch';
  const row = cmTabs(tabs, cur, (id) => { cur = id; render(); });
  const el = h('div', { style: { display: 'contents' } }, h('div', { class: 'cm-title' }, `${club.city} Tactics`), row.el, body, queued);

  function render() {
    ({ pitch: pitching, subs, def: defence, instr: instructions })[cur]();
    fill(queued, h('span', { class: 'cm-y', style: { fontWeight: 'bold' } }, 'Before the next pitch: '),
      m.queue.length ? m.queue.map((q) => q.text).join('; ') : h('span', { class: 'cm-s' }, 'no changes'));
  }

  function confirmBar(label, getCmd) {
    const b = h('button', { class: 'cm-btn go', disabled: true, onClick: () => {
      const cmd = getCmd();
      if (!cmd) return;
      m.onQueue(cmd);
      toast(`${cmd.text}. Press Back to return to the game.`);
      render();
    } }, label);
    return { el: h('div', { class: 'cm-pad', style: { display: 'flex', justifyContent: 'flex-end', gap: '6px' } }, b), enable: (on) => { b.disabled = !on; } };
  }

  function pickTable(head, rows, onPick) {
    const trs = rows.map(({ cells, off, title }, i) => {
      const tr = h('tr', { class: off ? 'off' : 'pick', title: title || null }, cells);
      if (!off) tr.addEventListener('click', () => { trs.forEach((r) => r.classList.remove('sel')); tr.classList.add('sel'); onPick(i); });
      return tr;
    });
    return h('div', { class: 'cm-tblwrap' }, h('table', { class: 'cm-tbl' },
      h('thead', {}, h('tr', {}, head.map(([c, l, tip]) => h('th', { class: l ? 'l' : '', title: tip || null }, c)))), h('tbody', {}, trs)));
  }

  function notNow(msg) {
    fill(body, h('div', { class: 'cm-pad' }, h('div', { class: 'cm-h' }, msg)));
  }

  const ipOf = (o) => `${Math.floor(o / 3)}.${o % 3}`;
  /** Who is pitching now and who has pitched in this game, for each side, with the line so far. */
  function today() {
    const g = m.getPitched?.();
    if (!g) return null;
    const tbl = (title, rows) => h('div', { class: 'cm-tblwrap' }, h('table', { class: 'cm-tbl' },
      h('thead', {}, h('tr', {}, [[title, 1], ['', 1], ['IP'], ['H'], ['R'], ['ER'], ['BB'], ['K'], ['Pit']].map(([c, l]) => h('th', { class: l ? 'l' : '' }, c)))),
      h('tbody', {}, rows.map(({ p, now, L }) => h('tr', {}, h('td', { class: 'l' }, pl(p)), h('td', { class: `l ${now ? 'cm-y' : 'cm-s'}` }, now ? 'Pitching now' : 'Done'),
        h('td', {}, ipOf(L.pOuts || 0)), h('td', {}, L.pH || 0), h('td', {}, L.pR || 0), h('td', {}, L.pER || 0), h('td', {}, L.pBB || 0), h('td', {}, L.pK || 0), h('td', {}, L.pitches || 0))))));
    return h('div', { class: 'tx-two' }, g.mine.length ? tbl(`${club.city} pitchers`, g.mine) : null, g.theirs.length ? tbl(`${g.theirCity} pitchers`, g.theirs) : null);
  }

  function pitching() {
    const batting = m.userBatting();
    const p = m.getPitcher(), b = m.getBatter(), st = m.getState();
    const vs = b.bats === 'L' ? 'vsL' : 'vsR';
    let choice = null;
    const block = batting ? null : (m.getBlock?.() ?? null);
    const wait = batting ? null : (m.getWait?.() ?? null);
    const bar = confirmBar(batting ? 'Plan the change' : 'Make Change', () => !block && choice && { id: 'pitch', player: choice, text: batting ? `${choice.last} takes the mound next inning` : wait ? `${choice.last} replaces ${p.last} as soon as the rules allow` : `${choice.last} replaces ${p.last}` });
    const pen = club.bullpen.filter((x) => x !== p);
    const manual = !!m.getManual?.();
    const ctl = m.setManual ? h('div', { class: 'cm-pad btnrow' },
      h('button', { class: 'cm-btn', 'aria-pressed': String(manual), onClick: () => { m.setManual(!manual); render(); } }, manual ? 'Bullpen: you make every change' : 'Bullpen: computer makes changes'),
      h('span', { class: 'cm-s' }, manual
        ? 'The computer will not take your pitcher out, and the game stops when it would have. Only a pitcher far past exhaustion is pulled for you. This stays on for every game until you switch it off.'
        : 'Turn this on to stop the computer replacing a pitcher you have put in. The game will stop when it thinks a change is due.')) : null;
    fill(body, h('div', { class: 'tx-tight' },
      ctl,
      block ? h('div', { class: 'cm-pad cm-r', style: { fontWeight: 'bold' } }, block)
        : wait ? h('div', { class: 'cm-pad cm-y', style: { fontWeight: 'bold' } }, `${wait.replace(/ \(he has faced \d+\)\.$/, '')}. Pick his replacement now and the change is made the moment he has.`) : m.getMid?.() ? h('div', { class: 'cm-pad cm-y', style: { fontWeight: 'bold' } }, 'The batter is mid at-bat: a change you make now takes effect when the at-bat ends.') : null,
      batting ? h('div', { class: 'cm-h' }, `${club.city} are batting. Pick who pitches at the start of the next inning; ${fullName(p)} (${st.pitchCount} pitches) is out there until then.`)
        : h('div', { class: 'cm-h' }, `${fullName(p)}: ${st.pitchCount} pitches. Next up: ${fullName(b)}, bats ${b.bats === 'L' ? 'left' : b.bats === 'S' ? 'both' : 'right'}.`),
      today(),
      pickTable([['Pitcher', 1], ['T'], ['Role', 1], ['Status', 1], ['Last 3 days', 0, 'Pitches thrown in the last three days'], ['ERA'], ['Stuff'], ['Control'], [b.bats === 'L' ? 'OPS v LHB' : 'OPS v RHB']],
        pen.map((x) => ({
          off: x.status === 'Unavailable', title: x.status === 'Unavailable' ? 'A starter between starts: not available in the regular season' : x.status === 'Exhausted' ? 'Exhausted: he will pitch well below his best and is at much greater risk of injury' : '',
          cells: [h('td', { class: 'l' }, pl(x)), h('td', {}, x.throws), h('td', { class: 'l' }, x.role),
            h('td', { class: `l ${x.status === 'Rested' ? 'cm-g' : x.status === 'Tired' ? 'cm-y' : 'cm-r'}` }, x.status),
            h('td', {}, x.last3), h('td', {}, x.era), h('td', {}, av(x, 'Stuff')), h('td', {}, av(x, 'Control')), h('td', {}, x[vs])],
        })),
        (i) => { choice = pen[i]; bar.enable(!block); }),
      bar.el));
  }

  function subs() {
    if (!m.userBatting()) return notNow(`Pinch hitters go in when ${club.city} bat.`);
    const b = m.getBatter(), p = m.getPitcher();
    const vs = p.throws === 'L' ? 'vsL' : 'vsR';
    let choice = null;
    const bar = confirmBar('Pinch Hit', () => choice && { id: 'ph', playerId: choice.id, text: `${choice.last} to hit for ${b.last}` });
    fill(body,
      h('div', { class: 'cm-h' }, `Due up: ${fullName(b)}, bats ${b.bats === 'L' ? 'left' : b.bats === 'S' ? 'both' : 'right'}. On the mound: ${fullName(p)}, throws ${p.throws === 'L' ? 'left' : 'right'}.`),
      pickTable([['Bench', 1], ['Pos', 1], ['B'], ['AVG'], ['Contact'], ['Power'], ['Eye'], [p.throws === 'L' ? 'OPS v LHP' : 'OPS v RHP']],
        club.bench.map((x) => ({ cells: [h('td', { class: 'l' }, pl(x)), h('td', { class: 'l' }, x.pos), h('td', {}, x.bats), h('td', {}, x.avg),
          h('td', {}, av(x, 'Contact')), h('td', {}, av(x, 'Power')), h('td', {}, av(x, 'Eye')), h('td', {}, x[vs])] })),
        (i) => { choice = club.bench[i]; bar.enable(true); }),
      bar.el);
  }

  function defence() {
    if (m.userBatting()) return notNow(`Defensive changes are made when ${club.city} take the field.`);
    let inn = null, out = null;
    const bar = confirmBar('Make Change', () => inn && out && { id: 'def', inId: inn.id, outId: out.id, text: `${inn.last} in for ${out.last} at ${out.pos}` });
    const upd = () => bar.enable(!!(inn && out));
    const fielders = club.lineup.filter((x) => x.pos !== 'DH');
    fill(body,
      h('div', { class: 'cm-h' }, '1. Coming in'),
      pickTable([['Bench', 1], ['Pos', 1], ['Fielding'], ['Arm'], ['Speed']],
        club.bench.map((x) => ({ cells: [h('td', { class: 'l' }, pl(x)), h('td', { class: 'l' }, x.pos), h('td', {}, av(x, 'Fielding')), h('td', {}, av(x, 'Arm')), h('td', {}, av(x, 'Speed'))] })),
        (i) => { inn = club.bench[i]; upd(); }),
      h('div', { class: 'cm-h' }, '2. Coming out'),
      pickTable([['Pos', 1], ['Player', 1], ['Fielding'], ['Arm'], ['Speed']],
        fielders.map((x) => ({ cells: [h('td', { class: 'l' }, x.pos), h('td', { class: 'l' }, pl(x)), h('td', {}, av(x, 'Fielding')), h('td', {}, av(x, 'Arm')), h('td', {}, av(x, 'Speed'))] })),
        (i) => { out = fielders[i]; upd(); }),
      bar.el);
  }

  function instructions() {
    const bat = m.userBatting();
    const b = m.getBatter(), p = m.getPitcher(), st = m.getState();
    const opt = (name, desc, cmd, enabled) => {
      const btn = h('button', { class: 'cm-opt', disabled: !enabled, onClick: () => {
        m.onQueue(cmd); toast(`${cmd.text}. Press Back to return to the game.`); render();
      } }, h('b', {}, name), h('span', {}, desc));
      return btn;
    };
    fill(body,
      h('div', { class: 'cm-h' }, bat ? 'At the plate' : 'In the field'),
      h('div', { class: 'cm-pad cm-opts' },
        opt('Mound Visit', `Settle ${p.last} down. Four visits left.`, { id: 'visit', text: `Mound visit to ${p.last}` }, !bat),
        opt('Walk Him', `Put ${b.last} on first without a pitch.${st.bases[0] ? ' First base is taken.' : ''}`, { id: 'ibb', text: `Intentional walk to ${b.last}` }, !bat),
        opt('Infield In', 'Cut the run at the plate. More grounders get through.', { id: 'inf', mode: 'in', text: 'Infield in' }, !bat),
        opt('Double-Play Depth', 'Middle infielders shade toward second.', { id: 'inf', mode: 'dp', text: 'Infield at double-play depth' }, !bat),
        opt('Normal Depth', 'Back to standard positions.', { id: 'inf', mode: 'normal', text: 'Infield back to normal depth' }, !bat),
        opt('Steal', 'Send the runner from first on the next pitch.', { id: 'steal', text: 'Steal on the next pitch' }, bat && st.bases[0] && !st.bases[1]),
        opt('Bunt', 'Sacrifice to move the runner up.', { id: 'bunt', text: 'Bunt' }, bat && st.bases.some(Boolean) && st.outs < 2),
        opt('Hit and Run', 'Runner goes, batter swings.', { id: 'hitRun', text: 'Hit and run' }, bat && st.bases[0])));
  }

  return {
    el, onShow: render,
    side: () => [{ label: 'Back to Match', hl: true, onClick: () => nav.back() }],
  };
}
