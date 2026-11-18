// Two Transfers tabs that look back: the players you drafted and where they are now, and the players who came in and
// went out of your club by trade or signing, with what each was worth then and now.
import { h, fill } from './dom.js';
import { game } from '../state.js';
import { money, mainPos, fullName, isPitcher, line } from '../data/world.js';
import { plink, select } from './club-ui.js';
import { fromDayNo, dayNo } from '../season/calendar.js';
import { value } from '../season/value.js';
import { HIST as HIST_KEYS } from '../data/world.js';
import { ledger, mine, nowValue, surplus } from '../season/ledger.js';

const P = (id) => game.world.players.get(id);
const city = (id) => game.world.clubs.get(id)?.city ?? id;
const dateOf = (day) => fromDayNo(day).toLocaleDateString('en-GB');
const th = (cols, left = []) => h('thead', {}, h('tr', {}, cols.map((c, i) => h('th', { class: left.includes(i) ? 'l' : '' }, c))));
const sign = (n) => (n > 0 ? `+${n}` : String(n));
const cls = (n) => (n > 0 ? 'cm-g' : n < 0 ? 'cm-r' : 'cm-s');

const keep = { drafted: null, mode: 'trades', year: 'all' }; // what was chosen last time, so coming back to the screen finds it as you left it

export function draftedPanel() {
  const box = h('div', { class: 'cm-pad' });
  const ys = Object.keys(game.drafts || {}).map(Number).sort((a, b) => b - a);
  let year = keep.drafted && (keep.drafted === 'all' || ys.map(String).includes(keep.drafted)) ? keep.drafted : ys[0] ? String(ys[0]) : 'all';
  const where = (p, signed) => {
    if (!signed || !p) return 'Did not sign';
    if (p.retired) return 'Retired';
    if (p.orgId == null) return 'Free agent';
    const lv = p.level === 'MLB' ? 'in the majors' : `in ${p.level}`;
    return p.orgId === game.orgId ? `With you, ${lv}` : `${city(p.orgId)}, ${lv}`;
  };
  function draw() {
    const rows = [];
    for (const y of ys) {
      if (year !== 'all' && String(y) !== year) continue;
      for (const r of game.drafts[y].picks) if (r[1] === game.orgId) rows.push({ y, r, p: P(r[2]) });
    }
    const signed = rows.filter((x) => x.r[8]);
    const major = signed.filter((x) => x.p && !x.p.retired && x.p.level === 'MLB').length;
    const here = signed.filter((x) => x.p && !x.p.retired && x.p.orgId === game.orgId).length;
    const body = rows.map(({ y, r, p }) => {
      const v0 = r[9], now = r[8] && p ? nowValue(p) : null;
      const d = v0 != null && now != null ? now - v0 : null;
      return h('tr', {}, h('td', {}, y), h('td', { class: 'y' }, r[0]), h('td', { class: 'l' }, r[8] && p ? plink(p, r[4]) : r[4]), h('td', {}, r[5]), h('td', { class: 'cm-s' }, r[6] ? 'HS' : 'Coll'),
        h('td', {}, r[8] ? money(r[3]) : '-'), h('td', {}, v0 ?? ''), h('td', {}, r[10] ?? ''), h('td', {}, now ?? ''),
        h('td', { class: d == null ? '' : cls(d) }, d == null ? '' : sign(d)), h('td', { class: 'l' }, where(p, r[8])));
    });
    fill(box,
      h('div', { class: 'btnrow', style: { justifyContent: 'flex-start', alignItems: 'center' } }, h('span', { class: 'cm-s' }, 'Draft of'), select([['all', 'All years'], ...ys.map((y) => [String(y), String(y)])], year, (v) => { year = v; keep.drafted = v; draw(); })),
      h('p', { class: rows.length ? 'cm-s' : 'cm-s cm-empty' }, rows.length ? `${rows.length} picks, ${signed.length} signed, ${here} still with you and ${major} in the majors. Value is the rating on the day he was drafted and now; Peak is the ceiling he was drafted with. Drafts are kept for ten years.` : 'You have not made a draft pick yet.'),
      rows.length ? h('table', { class: 'cm-tbl' }, th(['Year', 'Pick', 'Player', 'Pos', 'From', 'Bonus', 'Value', 'Peak', 'Now', 'Change', 'Where he is'], [2, 10]), h('tbody', {}, body)) : null);
  }
  draw();
  return box;
}

export function movesPanel() {
  const box = h('div', { class: 'cm-pad' });
  const L = ledger();
  const ys = [...new Set(L.moves.map((m) => m.year))].sort((a, b) => b - a);
  let mode = keep.mode, year = keep.year;
  const inYear = (m) => year === 'all' || String(m.year) === year;
  const nameBit = (m) => {
    const p = P(m.pid), n = nowValue(p);
    return h('div', {}, p ? plink(p, fullName(p)) : '?', h('span', { class: 'cm-s' }, ` ${m.v} → ${p?.retired ? 'retired' : n}`));
  };

  function trades() {
    const groups = new Map();
    for (const m of mine().filter((x) => x.t === 'trade' && inYear(x))) {
      const other = m.to === game.orgId ? m.from : m.to;
      const k = `${m.day}|${other}`;
      (groups.get(k) || groups.set(k, { day: m.day, other, in: [], out: [] }).get(k))[m.to === game.orgId ? 'in' : 'out'].push(m);
    }
    const now = dayNo(game.date);
    const rows = [...groups.values()].sort((a, b) => b.day - a.day).map((g) => {
      const then = surplus(g.in.map((m) => m.v)) - surplus(g.out.map((m) => m.v));
      const nowD = surplus(g.in.map((m) => nowValue(P(m.pid)))) - surplus(g.out.map((m) => nowValue(P(m.pid))));
      const early = now - g.day < 240;
      const verdict = early ? 'Too early' : nowD >= 4 ? 'Won it' : nowD <= -4 ? 'Lost it' : 'About even';
      return h('tr', {}, h('td', { class: 'l' }, dateOf(g.day)), h('td', { class: 'l' }, city(g.other)), h('td', { class: 'l' }, g.out.length ? g.out.map(nameBit) : 'nobody'), h('td', { class: 'l' }, g.in.length ? g.in.map(nameBit) : 'nobody'),
        h('td', { class: cls(then) }, sign(then)), h('td', { class: cls(nowD) }, sign(nowD)), h('td', { class: early ? 'cm-s' : cls(nowD) }, verdict));
    });
    return [h('p', { class: 'cm-s' }, 'Each player shows his rating on the day of the trade and today. The two score columns count only the value above a bench player, on the day and today, for what you received minus what you sent. A deal under eight months old is too early to judge. Cash and picks are not counted.'),
      rows.length ? h('table', { class: 'cm-tbl' }, th(['Date', 'With', 'Players out', 'Players in', 'Then', 'Now', 'Verdict'], [0, 1, 2, 3]), h('tbody', {}, rows)) : h('p', { class: 'cm-s cm-empty' }, 'You have made no trades yet.')];
  }

  /** His record in your colours since he signed: games and the main figures, summed over every level he played for you. */
  function withMe(p, m) {
    if (!p) return '';
    const kind = isPitcher(p) ? 'pit' : 'bat', yr = m.year;
    const rows = (p.hist?.[kind] || []).filter((r) => r[0] >= yr && (r[2] === game.orgId || String(r[2]).startsWith(`${game.orgId}-`)));
    if (!rows.length) return 'Not played yet';
    const t = [0, '', ''];
    HIST_KEYS[kind].forEach((_, i) => t.push(rows.reduce((a, r) => a + r[i + 3], 0)));
    const o = line(kind, t);
    if (kind === 'bat') return o.ab ? `${o.g} G, ${o.avg.toFixed(3).slice(1)}/${o.obp.toFixed(3).slice(1)}/${o.slg.toFixed(3).slice(1)}, ${o.hr} HR, ${o.rbi} RBI` : `${o.g} G`;
    return o.outs ? `${o.g} G, ${o.w}-${o.l}, ${o.era.toFixed(2)} ERA, ${Math.floor(o.outs / 3)}.${o.outs % 3} IP${o.sv ? `, ${o.sv} SV` : ''}` : `${o.g} G`;
  }

  function signings() {
    const rows = mine().filter((m) => m.t === 'sign' && m.to === game.orgId && inYear(m)).map((m) => {
      const p = P(m.pid), n = nowValue(p), d = n - m.v;
      return h('tr', {}, h('td', { class: 'l' }, dateOf(m.day)), h('td', { class: 'l' }, p ? plink(p, fullName(p)) : '?'), h('td', {}, p ? mainPos(p) : ''), h('td', {}, m.age), h('td', { class: 'l cm-s' }, m.terms || ''), h('td', {}, m.v), h('td', {}, p?.retired ? 'ret.' : n), h('td', { class: cls(d) }, sign(d)),
        h('td', { class: 'l cm-s' }, withMe(p, m)), h('td', { class: 'l' }, !p || p.retired ? 'Retired' : p.orgId === game.orgId ? 'With you' : p.orgId == null ? 'Free agent' : city(p.orgId)));
    });
    return [h('p', { class: 'cm-s' }, 'Free agents you signed, with their rating on the day and now, and where they are today.'),
      rows.length ? h('table', { class: 'cm-tbl' }, th(['Date', 'Player', 'Pos', 'Age', 'Terms', 'Value', 'Now', 'Change', 'With you', 'Now at'], [0, 1, 4, 8, 9]), h('tbody', {}, rows)) : h('p', { class: 'cm-s cm-empty' }, 'You have not signed a free agent yet.')];
  }

  function league() {
    const rows = L.moves.filter((m) => inYear(m) && m.v >= 54 && m.to !== game.orgId && m.from !== game.orgId).sort((a, b) => b.year - a.year || b.v - a.v).slice(0, 60).map((m) => {
      const p = P(m.pid), n = nowValue(p), d = n - m.v;
      return h('tr', {}, h('td', { class: 'l' }, dateOf(m.day)), h('td', { class: 'l' }, p ? plink(p, fullName(p)) : '?'), h('td', {}, m.t === 'trade' ? 'Trade' : 'Signed'),
        h('td', { class: 'l' }, m.from ? city(m.from) : 'Free agent'), h('td', { class: 'l' }, city(m.to)), h('td', {}, m.v), h('td', {}, p?.retired ? 'ret.' : n), h('td', { class: cls(d) }, sign(d)));
    });
    return [h('p', { class: 'cm-s' }, 'The biggest moves between other clubs, trades and free agent signings, best players first within each year.'),
      rows.length ? h('table', { class: 'cm-tbl' }, th(['Date', 'Player', 'How', 'From', 'To', 'Value', 'Now', 'Change'], [0, 1, 3, 4]), h('tbody', {}, rows)) : h('p', { class: 'cm-s cm-empty' }, 'Nothing to show yet.')];
  }

  function draw() {
    const modes = [['trades', 'Your trades'], ['signings', 'Your signings'], ['league', 'Around the league']];
    fill(box,
      h('div', { class: 'btnrow', style: { justifyContent: 'flex-start', alignItems: 'center' } },
        modes.map(([k, l]) => h('button', { class: 'cm-btn', 'aria-pressed': String(mode === k), onClick: () => { mode = k; keep.mode = k; draw(); } }, l)),
        h('span', { class: 'cm-s' }, 'Year'), select([['all', 'All years'], ...ys.map((y) => [String(y), String(y)])], year, (v) => { year = v; keep.year = v; draw(); })),
      ...(mode === 'trades' ? trades() : mode === 'signings' ? signings() : league()));
  }
  draw();
  return box;
}
