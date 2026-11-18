// Find: every player in the game, filtered by name, level, position, age, any attribute, contract and club.
// The Shortlist tab keeps the players you have marked.
import { av, avSort, avShort, avLabel } from './attr-ui.js';
import { h, fill, cmTabs } from './dom.js';
import { plink, gradeCell, select, posCell } from './club-ui.js';
import { clubMenu } from './menu.js';
import { sortTable } from './table.js';
import { isPitcher, positions, mainPos, statusShort, salaryIn, money, LEVELS, LEVEL_NAME, FIELD_POS, fullName } from '../data/world.js';
import { game } from '../state.js';
import { styleOf, STYLE_WORDS } from '../season/analytics.js';

const HIT_KEYS = ['contact', 'power', 'eye', 'avoidK', 'speed', 'Fielding', 'gap', 'bunt', 'steal', 'instincts', 'range', 'hands', 'arm', 'acc', 'turn', 'block', 'framing', 'cthrow'];
const PIT_KEYS = ['stuff', 'movement', 'control', 'stamina', 'velocity', 'hold'];
const MENTAL = ['comp', 'conc', 'det', 'work', 'lead', 'temper', 'prof', 'amb', 'cons', 'big', 'adapt', 'team', 'str', 'agi', 'fit'];
const STATUS = [['', 'Any contract'], ['signed', 'Signed'], ['arbitration', 'Arbitration'], ['pre-arbitration', 'Pre-arbitration'], ['free agent', 'Free agent this winter'], ['minor league', 'Minor league']];

// filters survive leaving and coming back, as in CM
const f = { name: '', group: 'bat', level: '', pos: '', ageMin: '', ageMax: '', key: '', min: '', future: false, status: '', org: '', style: '', bats: '' };

export function searchScreen(preset = null) {
  let tab = 'search';
  // a link from the analytics department opens the search already set up
  if (preset) Object.assign(f, { name: '', level: '', pos: '', ageMin: '', ageMax: '', key: '', min: '', status: '', org: '', style: '', bats: '' }, preset);
  const body = h('div', { class: 'cm-panel grow' });
  const tabs = cmTabs([{ id: 'search', label: 'Player Search' }, { id: 'short', label: `Shortlist` }], tab, (id) => { tab = id; render(); });
  const results = h('div');

  const levelOf = (p) => { const st = game.orgStates.get(p.orgId); return st ? (st.active.has(p.id) ? 'MLB' : st.level.get(p.id)) : p.level; };

  function matches() {
    const words = f.name.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const keys = f.group === 'pit' ? PIT_KEYS : HIT_KEYS;
    const key = [...keys, ...MENTAL].includes(f.key) ? f.key : '';
    return game.world.list.filter((p) => {
      if ((f.group === 'pit') !== isPitcher(p)) return false;
      if (words.length) { const n = fullName(p).toLowerCase(); if (!words.every((w) => n.includes(w))) return false; }
      if (f.level && levelOf(p) !== f.level) return false;
      if (f.pos) {
        if (f.group === 'pit') { if ((f.pos === 'SP') !== (p.role === 'Starter')) return false; } else if (!positions(p).includes(f.pos) && mainPos(p) !== f.pos) return false;
      }
      if (f.ageMin && p.age < +f.ageMin) return false;
      if (f.ageMax && p.age > +f.ageMax) return false;
      if (key && f.min && (avSort(p, key) ?? 0) < +f.min) return false;
      if (f.status && p.contract?.status !== f.status) return false;
      if (f.org && p.orgId !== f.org) return false;
      if (f.style && styleOf(p) !== f.style) return false;
      if (f.bats && (p.bats || 'R') !== f.bats) return false;
      return true;
    });
  }

  function table(rows, opts = {}) {
    const pit = f.group === 'pit' && !opts.mixed;
    const keys = opts.mixed ? [] : (pit ? PIT_KEYS : HIT_KEYS).slice(0, pit ? 4 : 6);
    return sortTable({
      rows, limit: 200, sort: opts.mixed ? 'name' : keys[0], desc: !opts.mixed, empty: opts.empty || 'Nobody matches. Loosen a filter.',
      cols: [
        { key: 'name', label: 'Name', left: true, get: (p) => `${p.last} ${p.first}`, show: (p) => plink(p) },
        { key: 'club', label: 'Org', left: true, get: (p) => p.orgId || '', title: 'Organisation' },
        { key: 'lvl', label: 'Level', left: true, get: (p) => levelOf(p) },
        { key: 'pos', label: 'Pos', left: true, get: (p) => mainPos(p), show: (p) => posCell(p) },
        { key: 'age', label: 'Age', get: (p) => p.age, asc: true },
        { key: 'bt', label: 'B/T', get: (p) => `${p.bats || '-'}/${p.throws || '-'}` },
        ...keys.map((k) => ({ key: k, label: avShort(k), title: avLabel(k), get: (p) => avSort(p, k), show: (p) => av(p, k) })),
        { key: 'style', label: 'Style', left: true, get: (p) => STYLE_WORDS[styleOf(p)] || '' },
        { key: 'status', label: 'Status', left: true, get: (p) => statusShort(p) },
        { key: 'y27', label: String(game.year), get: (p) => { const s = salaryIn(p, game.year); return typeof s === 'number' ? s : null; }, show: (p) => money(salaryIn(p, game.year)) },
      ],
    }).el;
  }

  function filters() {
    const keys = f.group === 'pit' ? PIT_KEYS : HIT_KEYS;
    const posOpts = f.group === 'pit' ? [['', 'Any role'], ['SP', 'Starter'], ['RP', 'Reliever']] : [['', 'Any position'], ...FIELD_POS.map((x) => [x, x]), ['DH', 'DH']];
    const on = (k) => (v) => { f[k] = v; if (k === 'group') { f.pos = ''; f.key = ''; renderSearch(); } else update(); };
    const input = (k, attrs) => h('input', { class: 'cm-input', value: f[k], ...attrs, onInput: (e) => { f[k] = e.target.value; update(); } });
    const clubs = [['', 'Any club'], ...game.world.mlb.map((c) => [c.id, `${c.full ?? `${c.city} ${c.name}`}`])];
    return h('div', { class: 'cm-pad filters' },
      h('label', { class: 'cm-field' }, h('span', {}, 'Name'), input('name', { type: 'search', placeholder: 'Any part of the name' })),
      h('label', { class: 'cm-field' }, h('span', {}, 'Players'), select([['bat', 'Hitters'], ['pit', 'Pitchers']], f.group, on('group'))),
      h('label', { class: 'cm-field' }, h('span', {}, 'Level'), select([['', 'Any level'], ...LEVELS.map((l) => [l, LEVEL_NAME[l]])], f.level, on('level'))),
      h('label', { class: 'cm-field' }, h('span', {}, f.group === 'pit' ? 'Role' : 'Position'), select(posOpts, f.pos, on('pos'))),
      h('label', { class: 'cm-field' }, h('span', {}, 'Age'), input('ageMin', { type: 'number', min: 16, max: 45, placeholder: 'from', style: { width: '64px' } }), input('ageMax', { type: 'number', min: 16, max: 45, placeholder: 'to', style: { width: '64px' } })),
      h('label', { class: 'cm-field' }, h('span', {}, 'Attribute'), select([['', 'Any attribute'], ...[...keys, ...MENTAL].map((k) => [k, avLabel(k)])], f.key, on('key')),
        h('span', { class: 'cm-s' }, ' at least '), input('min', { type: 'number', min: 1, max: 20, step: 1, style: { width: '64px' } })),
      h('label', { class: 'cm-field' }, h('span', {}, 'Style'), select([['', 'Any style'], ['gb', f.group === 'pit' ? 'Ground-ball pitcher' : 'Ground-ball hitter'], ['fb', f.group === 'pit' ? 'Fly-ball pitcher' : 'Fly-ball hitter']], f.style, on('style'))),
      h('label', { class: 'cm-field' }, h('span', {}, 'Bats'), select([['', 'Either'], ['L', 'Left'], ['R', 'Right'], ['S', 'Switch']], f.bats, on('bats'))),
      h('label', { class: 'cm-field' }, h('span', {}, 'Contract'), select(STATUS, f.status, on('status'))),
      h('label', { class: 'cm-field' }, h('span', {}, 'Club'), select(clubs, f.org, on('org'))));
  }

  let timer = 0;
  function update() { clearTimeout(timer); timer = setTimeout(() => { const m = matches(); fill(results, h('div', { class: 'cm-sub' }, `${m.length} player${m.length === 1 ? '' : 's'} found`), table(m)); }, 120); }

  function renderSearch() {
    fill(body, filters(), results);
    update();
  }

  function render() {
    if (tab === 'search') return renderSearch();
    const list = [...game.shortlist].map((id) => game.world.players.get(id)).filter(Boolean);
    fill(body, h('div', { class: 'cm-h' }, 'Shortlist'),
      h('p', { class: 'cm-sub' }, 'Add players from the Action menu on their profile.'),
      table(list, { mixed: true, empty: 'Your shortlist is empty.' }));
  }

  render();
  return {
    el: h('div', { style: { display: 'contents' } }, h('div', { class: 'cm-title' }, 'Find'), tabs.el, body),
    side: () => clubMenu('find'),
    onShow: () => { if (tab === 'short') render(); },
  };
}


