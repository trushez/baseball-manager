// The season in review: a dashboard for one finished year. It opens by itself when your season ends, and from History for
// any earlier year of the save. Tables, the postseason, the leaders, your club's story and every player's season lines.
import { h, fill, cmTabs } from './dom.js';
import { clubMenu } from './menu.js';
import { clubTitle, plink, select } from './club-ui.js';
import { sortTable } from './table.js';
import { game, userClub } from '../state.js';
import { fullName, rate3, fix, ipText } from '../data/world.js';
import { chronicleFor } from '../season/chronicle.js';
import { reviewYears, clubYear, storyLines, posOf } from '../season/review.js';

const W = () => game.world;
const city = (id) => W().orgs.get(id)?.club.city ?? id;
const clubName = (id) => { const c = W().orgs.get(id)?.club; return c ? (c.full ?? `${c.city} ${c.name}`) : id; };
const pctT = (w, l) => (w + l ? (w / (w + l)).toFixed(3).replace(/^0/, '') : '-');
const POST = { Champions: 'World Series champions', WS: 'Lost the World Series', LCS: 'Lost the LCS', DS: 'Lost the Division Series', WC: 'Lost the Wild Card Series' };
const ROUND = { WC: 'Wild Card Series', DS: 'Division Series', LCS: 'League Championship Series', WS: 'World Series' };
const plk = (id, t) => { const p = W().players.get(id); return p ? plink(p, t ?? fullName(p)) : (t ?? ''); };
const tbl = (head, rows, cls = '') => h('div', { class: 'cm-tblwrap' }, h('table', { class: `cm-tbl ${cls}` },
  h('thead', {}, h('tr', {}, head.map((c, i) => h('th', { class: i === 0 ? 'l' : '' }, c)))),
  h('tbody', {}, rows.map((r) => h('tr', { class: r.cls || '' }, (r.cells || r).map((c, i) => h('td', { class: i === 0 ? 'l' : '' }, c)))))));

export function seasonReviewScreen(year = reviewYears()[0], orgId = game.orgId) {
  if (year == null) {
    return { el: h('div', { style: { display: 'contents' } }, h('div', { class: 'cm-title' }, 'Season in review'), h('div', { class: 'cm-panel grow' }, h('p', { class: 'cm-sub cm-pad cm-empty' }, 'No season has been played to the end yet.'))), side: () => clubMenu('history') };
  }
  let tab = chronicleFor(year) ? 'story' : 'over';
  const body = h('div', { class: 'cm-panel grow' });
  const tabs = cmTabs([
    { id: 'story', label: 'Season Story' }, { id: 'over', label: 'Overview' }, { id: 'table', label: 'Standings' }, { id: 'post', label: 'Postseason' }, { id: 'lead', label: 'Leaders and Awards' },
    { id: 'mine', label: 'Your Players' }, { id: 'farm', label: 'Your Minor Leaguers' },
  ], tab, (id) => { tab = id; render(); });
  const years = reviewYears();
  const title = clubTitle(userClub(), `${year} in review`);
  const leagueBtn = h('button', { class: 'cm-btn', onClick: async () => { const { statsScreen } = await import('./stats-screen.js'); const { nav } = await import('./nav.js'); nav.push(statsScreen('bat', year)); } }, `Full league stats for ${year}`);
  const head = h('div', { class: 'cm-pad filters' },
    years.length > 1 ? select(years.map((y) => [y, String(y)]), year, (v) => { year = Number(v); render(); }, { 'aria-label': 'Season' }) : null,
    leagueBtn);

  function render() {
    title.firstChild.textContent = `${year} in review`;
    leagueBtn.textContent = `Full league stats for ${year}`;
    const H = game.history?.[year];
    if (!H) { fill(body, head, h('p', { class: 'cm-pad cm-s cm-empty' }, 'That season has not been archived.')); return; }
    fill(body, head, h('div', { class: 'cm-pad cm-y' }, summary(H)), ({ story, over, table, post, lead, mine, farm })[tab](H));
  }

  const summary = (H) => {
    const c = H.clubs?.[orgId];
    return `${year}: ${H.champion ? `${clubName(H.champion)} won the World Series. ` : ''}${c ? `${clubName(orgId)} went ${c.w}-${c.l}${c.post ? ` and ${POST[c.post].toLowerCase()}` : ''}.` : ''}`;
  };

  /** A long block of the story broken into paragraphs of a few sentences each, so it reads on a screen. */
  function paragraphs(text) {
    const words = text.split(/(\s+)/);
    const sentences = [];
    let cur = '';
    for (let i = 0; i < words.length; i++) {
      cur += words[i];
      const w = words[i], next = words[i + 2] || '';
      // a sentence ends at . ! or ? before a capital, but not after an initial (J.P., A.) or a short title (St., Jr.)
      const ends = /[.!?]["”']?$/.test(w) && /^["“']?[A-Z0-9]/.test(next) && !/^(?:[A-Z]\.)+$|^(?:[A-Z]\.)+[A-Z]\.?$|^(?:St|Jr|Sr|Mr|Dr|vs)\.$/.test(w);
      if (ends) { sentences.push(cur.trim()); cur = ''; }
    }
    if (cur.trim()) sentences.push(cur.trim());
    const out = [];
    let para = [], n = 0;
    // a sentence that leans on the one before (he, his, the year before) stays with it; one that turns to a new subject starts a paragraph
    const leans = /^(?:He|His|Him|She|Her|It|Its|They|Their|That|This|Then|But|And|So|Still|The year before|The others|Behind)\b/;
    const turns = /^(?:The rotation|The bullpen|In the ninth|By the|In the field|At the plate|On the mound|In October|In September|At the deadline|The deadline)\b/;
    for (const t of sentences) {
      const len = t.split(/\s+/).length;
      const full = n + len > 70 || para.length >= 4;
      if (para.length && ((full && !leans.test(t)) || n + len > 120 || (turns.test(t) && n >= 25))) { out.push(para.join(' ')); para = []; n = 0; }
      para.push(t); n += len;
    }
    if (para.length) out.push(para.join(' '));
    // a last line of a few words reads better with the one before it
    if (out.length > 1 && out.at(-1).split(/\s+/).length < 12) out.splice(-2, 2, `${out.at(-2)} ${out.at(-1)}`);
    return out;
  }

  /** The season written up as a story: the written version if the game kept one, else the lines from the figures. */
  function story() {
    const ch = chronicleFor(year);
    if (!ch) return h('div', { class: 'cm-pad' }, h('p', { class: 'cm-s' }, 'The full story is only written for seasons played from now on. Here is a short version.'), storyLines(orgId, year).map((t) => h('p', {}, t)));
    return h('div', { class: 'cm-pad cm-chapter' },
      ch.title ? h('div', { class: 'ch-top' }, h('div', { class: 'ch-num' }, `Chapter ${ch.chapter}`), h('h2', { class: 'ch-title' }, ch.title), h('div', { class: 'ch-year' }, `${clubName(orgId)}, ${year}`)) : null,
      ch.parts.map((x) => h('div', {}, x.head ? h('div', { class: 'cm-h' }, x.head) : null, paragraphs(x.text).map((t) => h('p', {}, t)))));
  }

  function over() {
    const Y = clubYear(orgId, year);
    if (!Y) return h('p', { class: 'cm-pad cm-s cm-empty' }, 'Nothing is kept for your club in that year.');
    const story = storyLines(orgId, year);
    const row = (x) => [plk(x.p.id), posOf(x.p), x.kind === 'bat' ? `${rate3(x.s.avg)}/${rate3(x.s.obp)}/${rate3(x.s.slg)}, ${x.s.hr} HR, ${x.s.rbi} RBI` : `${x.s.w}-${x.s.l}, ${fix(x.s.era)} ERA, ${ipText(x.s.outs)} IP, ${x.s.so} K`, String(x.idx ?? '-')];
    return h('div', {},
      h('div', { class: 'cm-h' }, `${clubName(orgId)} in ${year}`),
      h('div', { class: 'cm-pad' }, story.map((t) => h('p', {}, t))),
      h('div', { class: 'cm-h' }, 'Best performers'),
      tbl(['Player', 'Pos', 'Season', 'TB index'], [...Y.bat, ...Y.pit].map(row), 'compact'),
      Y.awards.length ? [h('div', { class: 'cm-h' }, 'Awards'), tbl(['Award', 'Winner'], Y.awards.map(([k, p]) => [k, p ? plk(p.id) : clubName(orgId)]), 'compact')] : null,
      Y.prospects.length ? [h('div', { class: 'cm-h' }, 'Worth a look on the farm'), tbl(['Player', 'Level', 'Season', 'TB index'], Y.prospects.map((x) => [plk(x.p.id), x.level, x.kind === 'bat' ? `${rate3(x.s.avg)}/${rate3(x.s.obp)}/${rate3(x.s.slg)}, ${x.s.hr} HR` : `${fix(x.s.era)} ERA, ${ipText(x.s.outs)} IP`, String(x.idx ?? '-')]), 'compact')] : null);
  }

  function table(H) {
    const divs = {};
    for (const [id, c] of Object.entries(H.clubs)) (divs[c.div] ||= []).push([id, c]);
    const short = (d) => (d || '').replace('American League', 'AL').replace('National League', 'NL');
    return h('div', {}, Object.keys(divs).sort().map((div) => tbl([short(div), 'W', 'L', 'Pct', 'GB', 'RS', 'RA', 'Postseason'],
      divs[div].sort((a, b) => a[1].place - b[1].place).map(([id, c]) => ({ cells: [city(id), String(c.w), String(c.l), pctT(c.w, c.l), c.gb ? (c.gb % 1 ? c.gb.toFixed(1) : String(c.gb)) : '-', String(c.rs), String(c.ra), POST[c.post] ?? ''], cls: id === orgId ? 'hl' : '' })), 'compact divtbl')));
  }

  function post(H) {
    const S = H.series || [];
    if (!S.length) return h('p', { class: 'cm-pad cm-s cm-empty' }, 'The series results are kept from the 2029 season on. This one has only the final standings.');
    const out = [];
    const lname = (l) => (String(l).startsWith('A') ? 'American League' : 'National League');
    for (const r of ['WC', 'DS', 'LCS', 'WS']) {
      const rows = S.filter((s) => s.round === r);
      if (!rows.length) continue;
      const mk = (list, label) => tbl([label, 'Beat', 'Series'], list.map((s) => {
        const w = `${Math.max(s.hiW, s.loW)}-${Math.min(s.hiW, s.loW)}`;
        return { cells: [city(s.winner), city(s.winner === s.hi ? s.lo : s.hi), w], cls: s.hi === orgId || s.lo === orgId ? 'hl' : '' };
      }), 'compact');
      out.push(h('div', { class: 'cm-h' }, ROUND[r]));
      if (r === 'WS') out.push(h('div', { class: 'rv-one' }, mk(rows, 'Champion')));
      else out.push(h('div', { class: 'rv-cols' }, ['A', 'N'].map((k) => mk(rows.filter((s) => String(s.league).startsWith(k)), `${lname(k)} winner`))));
    }
    return h('div', {}, out);
  }

  function lead(H) {
    const A = game.awards?.[year]?.season || {};
    const cols = ['AL', 'NL'].map((L) => {
      const ld = H.leaders?.[L] || {};
      const col = [tbl([`${L} leaders`, 'Leader', 'Club', ''], Object.entries(ld).filter(([, r]) => r.length).map(([k, r]) => [k, plk(r[0][0]), city(r[0][2]), k === 'AVG' || k === 'OPS' ? rate3(r[0][1]) : k === 'ERA' ? r[0][1].toFixed(2) : String(r[0][1])]), 'compact')];
      const aw = A[L] || {};
      const keys = Object.keys(aw);
      if (keys.length) col.push(tbl([`${L} awards`, 'Winner'], keys.map((k) => [k, k === 'Manager of the Year' ? clubName(aw[k]) : plk(aw[k])]), 'compact'));
      return h('div', {}, col);
    });
    return h('div', { class: 'rv-cols' }, cols);
  }

  const lineTable = (rows, id) => {
    const bat = rows.filter((x) => x.kind === 'bat'), pit = rows.filter((x) => x.kind === 'pit');
    const nm = { key: 'name', label: 'Player', left: true, get: (x) => x.p.last, show: (x) => plink(x.p) };
    const pos = { key: 'pos', label: 'Pos', left: true, get: (x) => posOf(x.p) };
    const out = [];
    if (bat.length) out.push(h('div', { class: 'cm-h' }, 'Batting'), sortTable({ id: `${id}-bat`, rows: bat, sort: 'pa', desc: true, cols: [nm, pos,
      { key: 'lv', label: 'Lvl', left: true, get: (x) => x.level }, { key: 'g', label: 'G', get: (x) => x.s.g }, { key: 'pa', label: 'PA', get: (x) => x.s.pa },
      { key: 'avg', label: 'AVG', get: (x) => x.s.avg, show: (x) => rate3(x.s.avg) }, { key: 'obp', label: 'OBP', get: (x) => x.s.obp, show: (x) => rate3(x.s.obp) }, { key: 'slg', label: 'SLG', get: (x) => x.s.slg, show: (x) => rate3(x.s.slg) },
      { key: 'ops', label: 'OPS', get: (x) => x.s.ops, show: (x) => rate3(x.s.ops) }, { key: 'hr', label: 'HR', get: (x) => x.s.hr }, { key: 'rbi', label: 'RBI', get: (x) => x.s.rbi }, { key: 'sb', label: 'SB', get: (x) => x.s.sb },
      { key: 'idx', label: 'TBO9+', get: (x) => x.idx, cls: 'hl' }] }).el);
    if (pit.length) out.push(h('div', { class: 'cm-h' }, 'Pitching'), sortTable({ id: `${id}-pit`, rows: pit, sort: 'ip', desc: true, cols: [nm, pos,
      { key: 'lv', label: 'Lvl', left: true, get: (x) => x.level }, { key: 'g', label: 'G', get: (x) => x.s.g }, { key: 'gs', label: 'GS', get: (x) => x.s.gs }, { key: 'ip', label: 'IP', get: (x) => x.s.outs, show: (x) => ipText(x.s.outs) },
      { key: 'wl', label: 'W-L', get: (x) => x.s.w, show: (x) => `${x.s.w}-${x.s.l}` }, { key: 'sv', label: 'SV', get: (x) => x.s.sv }, { key: 'era', label: 'ERA', get: (x) => x.s.era, show: (x) => fix(x.s.era), asc: true },
      { key: 'whip', label: 'WHIP', get: (x) => x.s.whip, show: (x) => fix(x.s.whip), asc: true }, { key: 'k9', label: 'K/9', get: (x) => x.s.k9, show: (x) => fix(x.s.k9) },
      { key: 'idx', label: 'TBA9-', get: (x) => x.idx, asc: true, cls: 'hl' }] }).el);
    return h('div', {}, out);
  };
  const mine = () => lineTable(clubYear(orgId, year)?.mlb || [], `rv-${orgId}`);
  const farm = () => lineTable(clubYear(orgId, year)?.mi || [], `rvm-${orgId}`);

  render();
  return { el: h('div', { style: { display: 'contents' } }, title, h('div', { class: 'cm-panel' }, tabs.el), body), side: () => clubMenu('history'), onShow: render };
}
