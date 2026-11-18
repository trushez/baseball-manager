// Player profile, full screen in the CM manner: title bar, tab row, attribute grid, stats by season and
// level, contract, and an Action menu (shortlist, compare, move between levels).
import { dataCredit } from './credit.js';
import { progressTab } from './progress-tab.js';
import { h, fill, cmTabs, toast } from './dom.js';
import { prospectInfo, hypeWords } from '../season/prospects.js';
import { nav } from './nav.js';
import { plink, hand } from './club-ui.js';
import { clubMenu } from './menu.js';
import {
  fullName, isPitcher, seasons, lastSeason, seasonLine, line, HIST, money, salaryIn, rate3, fix, pct, ipText,
  POS_NAME, LEVEL_NAME, mainPos, FIELD_POS,
} from '../data/world.js';
import { game, orgState, isUserOrg } from '../state.js';
import { placeCode, ilDaysLeft, levelWords, ilKinds, canCancelDesignation } from '../season/roster.js';
import { rosterAction } from './roster-action.js';
import { status } from '../season/advice.js';
import { tbo9, tba9, tboPlus, tbaMinus } from '../season/tb.js';
import { injuryWords } from '../season/injuries.js';
import { dayNo, fromDayNo, dateWords } from '../season/calendar.js';
import { requestWords, promisesTo, promise, refuse, PROMISES } from '../season/grievances.js';
import { ATTRS, attrLabel, groupsFor, posString, pitch20, familiarity } from '../data/attributes.js';
import { av, num } from './attr-ui.js';
import { honours, honourSummary } from '../data/honours.js';
import { moodWords } from '../season/moods.js';
import { coachView } from '../season/personality.js';
import { changeWords } from '../season/ability.js';
import { whyWords } from '../season/devnews.js';
import { extOf, optionWords, notradeWords, noMoney, noteDeal } from '../season/contracts.js';
import { agentOf, relWords } from '../season/agents.js';
import { cannotSign } from '../season/winter.js';
import { worth as worthOf0, worthText, listPlayer, unlist, salaryFor, schedule, shopPlayer } from '../season/trade.js';
import { scoutReport } from './scout-report.js';
import { seen, shown, reportOn, reportFor, reportText, ageWords, stale, requestScouting, medical, myScouts } from '../season/scouting.js';

/** The club's second colour for text on its first, or white or black when the two don't read together. */
export function readableOn(bg, fg) {
  const lum = (hex) => {
    const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
    if (!m) return 0.2;
    const [r, g, b] = [0, 2, 4].map((i) => { const c = parseInt(m[1].slice(i, i + 2), 16) / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const ratio = (a, b) => (Math.max(lum(a), lum(b)) + 0.05) / (Math.min(lum(a), lum(b)) + 0.05);
  if (ratio(bg, fg) >= 3.5) return fg;
  return ratio(bg, '#ffffff') >= ratio(bg, '#111111') ? '#ffffff' : '#111111';
}

/** Clickable player name used on every screen. */
export const pl = (p, text) => plink(p, text);


let goTab = () => {}; // set by the open player screen: switch to one of its tabs
export function playerScreen(p) {
  // match copies carry the database player's fields; find the original so moves and shortlists act on it
  p = game.world?.players.get(p.id) ?? p;
  const body = h('div', { class: 'cm-panel grow' });
  const tabs = cmTabs([
    { id: 'profile', label: 'Profile' }, { id: 'inj', label: 'Injuries' }, { id: 'contract', label: 'Contract' }, { id: 'scout', label: 'Scout Report' }, { id: 'recent', label: 'Recent' }, { id: 'prog', label: 'Progression' }, { id: 'stats', label: 'History' },
  ], 'profile', (id) => show(id));
  const actBtn = h('button', { class: 'cm-btn act', onClick: (e) => { e.stopPropagation(); toggleMenu(); } }, 'Action ▾');
  const menu = h('div', { class: 'cm-menu', hidden: true });
  // the name on a bar in the colours of the club he plays for today, with the level, as in CM
  const where = placeLine(p);
  const kit = where.club || p.club;
  const title = h('div', { class: 'cm-title pp-name', ...(kit ? { '--kit-a': kit.kitA, '--kit-b': kit.kitB, '--kit-text': readableOn(kit.kitA, kit.kitB) } : {}) },
    h('span', { class: 'nm' }, fullName(p)), where.text ? h('span', { class: 'club' }, where.text) : null, actBtn, menu);

  /** The bar at the top: his club and level as they are now, redrawn after any move. */
  function paintTitle() {
    const w = placeLine(p), k = w.club || p.club;
    let span = title.querySelector('.club');
    if (w.text) { if (!span) { span = h('span', { class: 'club' }); title.insertBefore(span, actBtn); } span.textContent = w.text; } else span?.remove();
    if (k) { title.style.setProperty('--kit-a', k.kitA); title.style.setProperty('--kit-b', k.kitB); title.style.setProperty('--kit-text', readableOn(k.kitA, k.kitB)); }
  }

  function toggleMenu() {
    if (!menu.hidden) { menu.hidden = true; return; }
    const items = [];
    const free = !p.amateur && (game.freeAgents.includes(p.id) || (!p.orgId && !p.retired));
    if (free) items.push(['Sign player', async () => {
      const why = cannotSign(p) || noMoney();
      if (why) { toast(why); return; }
      nav.push((await import('./negotiate-screen.js')).negotiateScreen(p, { how: 'Signed as a free agent', kind: 'free' }));
    }]);
    else if (p.amateur) items.push(['Bid on this prospect', async () => nav.push((await import('./transfers-screen.js')).transfersScreen('intl'))]);
    else if (p.orgId && !isUserOrg(p.orgId) && /^[A-Z]{2,3}$/.test(p.orgId)) items.push(['Trade for player', async () => nav.push((await import('./trade-screen.js')).tradeScreen({ with: p.orgId, get: [p.id], back: true }))]);
    const listed = game.shortlist.has(p.id);
    items.push([listed ? 'Remove from shortlist' : 'Add to shortlist', () => {
      if (listed) game.shortlist.delete(p.id); else game.shortlist.add(p.id);
      toast(listed ? `${fullName(p)} removed from your shortlist.` : `${fullName(p)} added to your shortlist.`);
    }]);
    const other = game.compareWith && game.world.players.get(game.compareWith);
    if (other && other.id !== p.id) items.push([`Compare with ${fullName(other)}`, async () => nav.push((await import('./compare-screen.js')).compareScreen(other, p))]);
    items.push(['Compare with...', async () => { game.compareWith = p.id; nav.push((await import('./compare-screen.js')).compareScreen(p, null)); }]);
    if (p.orgId && isUserOrg(p.orgId)) {
      const o = game.world.orgs.get(p.orgId), st = orgState(p.orgId);
      const here = placeCode(st, p);
      const act = (a) => async () => { await rosterAction(o, st, p, a); show(cur); };
      if (here === 'IL') {
        items.push(['Activate from the injured list', !p.injury && ilDaysLeft(st, p) === 0 ? async () => nav.push((await import('./cover-screen.js')).coverScreen(p)) : act({ type: 'activate', to: 'MLB' })]);
        items.push(['Activate and send to Triple-A', act({ type: 'activate', to: 'AAA' })]);
        if (st.il.get(p.id).kind !== 60) items.push(['Move to the 60-day injured list', act({ type: 'il60' })]);
      } else if (here === 'DFA') {
        if (canCancelDesignation(st, p)) items.push(['Cancel the designation', act({ type: 'undfa' })]);
      } else if (here !== 'FA') {
        for (const [lv, label] of [['MLB', 'Call up to the majors'], ['AAA', 'Send to Triple-A'], ['AA', 'Send to Double-A'], ['A+', 'Send to High-A'], ['A', 'Send to Single-A'], ['R', 'Send to the Rookie level']]) {
          if (lv === here) continue;
          items.push([label, act({ type: 'move', to: lv })]);
        }
        if (p.injury && st.forty.has(p.id)) for (const kind of ilKinds(p)) items.push([`Place on the ${kind}-day injured list`, act({ type: 'il', kind })]);
        if (st.forty.has(p.id)) items.push(['Designate for assignment', act({ type: 'dfa' })]);
        else items.push(['Add to the 40-man roster', act({ type: 'add40' })]);
      }
      if (p.rule5) items.push([`Offer back to ${game.world.orgs.get(p.rule5.from)?.club.city} (Rule 5)`, async () => { const m = await import('../season/rule5.js'); toast(m.offerBack(p) || `${fullName(p)} goes back to ${game.world.orgs.get(p.rule5?.from)?.club.city ?? 'his old club'}.`); nav.back?.(); }]);
      if (here !== 'FA' && /^[A-Z]{2,3}$/.test(p.orgId)) {
        items.push(p.listed?.mine ? ['Take off the transfer list', () => { unlist(p); toast(`${fullName(p)} is off the transfer list.`); }]
          : ['Put on the transfer list', () => { listPlayer(p); toast(`${fullName(p)} is on the transfer list. Clubs will make you offers.`); }]);
        items.push(['Shop to every club', () => toast(shopPlayer(p))]);
      }
      if (here !== 'FA') items.push(['Release', act({ type: 'release' })]);
      items.push([st.lock?.[p.id] ? 'Let the assistant move him again' : 'Lock: the assistant must not move him', () => {
        st.lock ||= {};
        if (st.lock[p.id]) delete st.lock[p.id]; else st.lock[p.id] = true;
        toast(st.lock[p.id] ? `${fullName(p)} is locked. When the assistant runs your club it will leave him where he is.` : `${fullName(p)} is no longer locked.`);
        show(cur);
      }]);
    }
    items.push(['Request scouting', () => { toast(requestScouting(p)); show(cur); }]);
    items.push(['Medical report', () => { const m = medical(p); toast(`${fullName(p)}: ${m.text}`); }]);
    if (p.orgId) items.push([`View ${game.world.orgs.get(p.orgId)?.club.city ?? ''} squad`, async () => nav.push((await import('./squad-screen.js')).squadScreen(p.orgId))]);
    fill(menu, items.map(([label, fn]) => h('button', { onClick: (e) => { e.stopPropagation(); menu.hidden = true; fn(); } }, label)));
    menu.hidden = false;
  }
  const closeMenu = () => { menu.hidden = true; };

  let cur = 'profile';
  function show(id) {
    cur = id;
    paintTitle();
    if (id === 'profile') fill(body, profile(p));
    if (id === 'recent') fill(body, recent(p));
    if (id === 'stats') fill(body, stats(p));
    if (id === 'prog') fill(body, progressTab(p));
    if (id === 'contract') fill(body, contract(p));
    if (id === 'inj') fill(body, injuries(p));
    if (id === 'scout') fill(body, scoutReport(p, () => show('scout')));
  }
  goTab = (id) => { tabs.select(id); show(id); };
  show('profile');
  return {
    el: h('div', { style: { display: 'contents' } }, title, tabs.el, body),
    side: () => clubMenu(null), bg: 'profile', bgOrg: p.orgId || '',
    onShow: () => { document.addEventListener('click', closeMenu); show(cur); },
    onHide: () => document.removeEventListener('click', closeMenu),
  };
}

function profile(p) {
  let where = '';
  if (p.orgId && game.world.orgs.has(p.orgId)) {
    const st = orgState(p.orgId);
    const code = placeCode(st, p);
    where = `${code === 'MLB' ? 'Active roster' : code === 'IL' ? `Injured list (${ilDaysLeft(st, p)} days to serve)` : levelWords(code)}  ·  ${statusWords(p)}`;
  }
  return [
    h('div', { class: 'pp-born' }, bornLine(p)),
    where ? h('div', { class: 'cm-sub ph-hide', style: { marginBottom: '6px' } }, where) : null,
    h('div', { class: 'ph-hide' }, prospectLine(p)),
    grievance(p),
    attrGrid(p),
    h('div', { class: 'pp-posline ph-hide' }, positionLine(p)),
    positionChips(p),
    h('div', { class: 'pp-foot ph-hide' }, tbStrip(p)),
    lastTable(p),
  ];
}

/** For a ranked prospect: where he stands on the lists, when he should arrive, the risk and the buzz. */
function prospectLine(p) {
  const i = prospectInfo(p);
  if (!i) return null;
  const bits = [i.rank ? `No. ${i.rank} prospect in baseball${i.orgRank ? `, No. ${i.orgRank} for ${game.world.orgs.get(p.orgId)?.club.city}` : ''}` : `No. ${i.orgRank} prospect for ${game.world.orgs.get(p.orgId)?.club.city}`,
    `arrives ${i.eta === 'now' ? 'now' : i.eta}`, `${i.risk} risk`, `buzz: ${hypeWords(i.hype).toLowerCase()}`];
  return h('div', { class: 'cm-sub y', style: { marginBottom: '6px' }, title: 'From the monthly prospect lists. See Prospects in the menu.' }, bits.join('  ·  '));
}

const FULL_POS = { C: 'Catcher', '1B': 'First Baseman', '2B': 'Second Baseman', '3B': 'Third Baseman', SS: 'Shortstop', LF: 'Left Fielder', CF: 'Center Fielder', RF: 'Right Fielder', OF: 'Outfielder', DH: 'Designated Hitter', IF: 'Infielder' };

/** His position in words along the foot of the profile, as CM does: "Shortstop / Second Baseman". */
function positionLine(p) {
  if (isPitcher(p)) return p.role === 'Starter' ? 'Starting Pitcher' : p.role === 'Closer' ? 'Relief Pitcher (Closer)' : 'Relief Pitcher';
  const toks = posString(p).split(/[\/\s()]+/).filter(Boolean);
  const names = [...new Set(toks.map((t) => FULL_POS[t]).filter(Boolean))];
  const specific = names.some((n) => /^(Left|Center|Right) Fielder$/.test(n));
  return (specific ? names.filter((n) => n !== 'Outfielder') : names).slice(0, 3).join(' / ') || '-';
}

/** How well he plays each position he can cover, 1 to 20, so a utility man's range is clear at a glance. */
function positionChips(p) {
  if (isPitcher(p)) return null;
  const list = FIELD_POS.map((x) => [x, familiarity(p, x)]).filter(([, f]) => f >= 10).sort((a, b) => b[1] - a[1]);
  if (list.length < 2) return null;
  return h('div', { class: 'pp-poschips', title: 'How comfortable he is at each position (20 is natural)' },
    list.map(([x, f]) => h('span', { class: `pp-poschip${f >= 18 ? ' hi' : f >= 15 ? ' ok' : ' lo'}` }, h('b', {}, x), ` ${f}`)));
}

/** The Recent tab: where he stands in the organisation, how he is developing, and his latest games. */
function recent(p) {
  return [h('div', { class: 'pp-foot' }, rosterBlock(p), devBlock(p)), recentGames(p)];
}

const NATION = {
  USA: 'American', 'Dominican Republic': 'Dominican', Venezuela: 'Venezuelan', Cuba: 'Cuban', Canada: 'Canadian', Mexico: 'Mexican',
  'Puerto Rico': 'Puerto Rican', Panama: 'Panamanian', Japan: 'Japanese', Colombia: 'Colombian', Curacao: 'Curaçaoan', 'Curaçao': 'Curaçaoan',
  'South Korea': 'South Korean', Korea: 'South Korean', Australia: 'Australian', Nicaragua: 'Nicaraguan', Bahamas: 'Bahamian', Aruba: 'Aruban',
  Taiwan: 'Taiwanese', Brazil: 'Brazilian', Germany: 'German', Netherlands: 'Dutch', Honduras: 'Honduran', 'United Kingdom': 'British',
  England: 'English', Italy: 'Italian', 'South Africa': 'South African', Peru: 'Peruvian', Spain: 'Spanish', China: 'Chinese',
  'Czech Republic': 'Czech', Lithuania: 'Lithuanian', Jamaica: 'Jamaican', 'Virgin Islands': 'Virgin Islander', Guatemala: 'Guatemalan',
  Ecuador: 'Ecuadorian', Philippines: 'Filipino', France: 'French', Russia: 'Russian', Ireland: 'Irish', 'New Zealand': 'New Zealander',
};

/** "Born 3.10.00 (Age 26). American." */
function bornLine(p) {
  const nat = p.country ? `${NATION[p.country] || p.country}.` : '';
  if (!p.born) return `Age ${p.age ?? '?'}. ${nat}`;
  const [y, m, d] = p.born.split('-').map(Number);
  return `Born ${d}.${m}.${String(y).slice(2)} (Age ${p.age}). ${nat}`;
}

const MINOR = new Set(['det', 'lead', 'temper', 'fit']);
/** The attribute grid: three columns of label and figure, then his positions, form, morale and condition. */
function attrGrid(p) {
  const groups = groupsFor(p);
  const row = (label, value, cls = '') => h('div', { class: `pp-row ${cls}` }, h('span', { class: 'k' }, label), h('span', { class: 'v' }, value));
  const NAME = { batting: 'Batting', running: 'Running', fielding: 'Fielding', catching: 'Catching', pitching: 'Pitching', mental: 'Mental', physical: 'Physical' };
  // the six character ratings; a player only shows the ratings he has (a pitcher has no Anticipation)
  const CHAR = new Set(['prof', 'amb', 'cons', 'big', 'adapt', 'team']);
  const rowsOf = (g, chars = false) => ATTRS[g].filter(([k]) => p.r?.[k] != null && CHAR.has(k) === chars).map(([k]) => row(attrLabel(k), av(p, k), chars || MINOR.has(k) ? 'pp-char' : ''));
  const w = seen(p);
  const pitches = w.mode !== 'partial' && w.v.pitchGrades && (isPitcher(p) || p.rPitch)
    ? Object.entries(w.v.pitchGrades).filter(([k]) => w.mode !== 'partial' || shown(p, k)).map(([k, v]) => row(k, num(pitch20(v[0]), w.mode === 'report'))) : [];
  const has = (g) => groups.includes(g);
  // one list read down three columns, like the CM profile grid: no headings, the groups simply run on
  let rows;
  if (isPitcher(p)) rows = [...rowsOf('pitching'), ...pitches, ...rowsOf('fielding'), ...rowsOf('physical'), ...rowsOf('mental'), ...rowsOf('mental', true)];
  else if (has('pitching')) rows = [...rowsOf('batting'), ...rowsOf('running'), ...rowsOf('pitching'), ...pitches, ...rowsOf('fielding'), ...rowsOf('physical'), ...rowsOf('mental'), ...rowsOf('mental', true)];
  else rows = [...rowsOf('batting'), ...rowsOf('running'), ...rowsOf('fielding'), ...(has('catching') ? rowsOf('catching') : []), ...rowsOf('physical'), ...rowsOf('mental'), ...rowsOf('mental', true)];
  const [mood, moodCls] = moodWords(p);
  const cond = p.injury ? [`Injured (${Math.max(0, p.injury.days - (dayNo(game.date) - p.injury.since))} days)`, 'cm-r'] : [`${Math.round(100 - Math.min(60, p.fat || 0) * 0.5)}%`, ''];
  const [form, formCls] = formWord(p);
  rows.push(
    row('Bats/Throws', `${hand[p.bats] || '-'} / ${hand[p.throws] || '-'}`),
    row('Form', h('span', { class: formCls }, form), 'pp-char'),
    row('Morale', h('span', { class: moodCls }, mood)),
    row('Condition', h('span', { class: cond[1] }, cond[0])));
  // the batting figures are split: against right-handers / against left-handers
  if (!isPitcher(p) && rows.length) rows.unshift(h('div', { class: 'pp-row pp-colhead' }, h('span', { class: 'k' }, ''), h('span', { class: 'v' }, 'RH / LH')));
  const phone = typeof window !== 'undefined' && window.innerWidth <= 700;
  const n = rows.length;
  const nShown = phone ? rows.filter((r) => !/pp-char/.test(r.className)).length : n;
  return h('div', { class: 'pp-wrap' },
    h('div', { class: 'pp-grid', style: `--r3:${Math.ceil(n / 3)};--r2:${Math.ceil((phone ? nShown : n) / 2)}` }, rows),
    honours(p).length ? h('div', { class: 'pp-hon' }, 'Honours ', h('b', { class: 'cm-y' }, honourSummary(p, 3))) : null);
}

/** How he is going this month against his season: from the month's split once he has played enough. */
function formWord(p) {
  const S = game.season;
  if (!S || game.phase !== 'regular' && game.phase !== 'post') return ['-', 'cm-s'];
  const yr = p.splits?.[S.year];
  const kind = isPitcher(p) ? 'pit' : 'bat';
  const m = yr?.[kind]?.[`m${game.date.getMonth() + 1}`];
  const all = seasonLine(p, kind, S.year, 'MLB');
  if (!m || !all) return ['-', 'cm-s'];
  const mine = line(kind, [S.year, 'MLB', '', ...m]);
  if (kind === 'bat') {
    if (mine.pa < 25 || mine.ops == null || all.ops == null) return ['Average', ''];
    const d = mine.ops - all.ops;
    return d > 0.12 ? ['Excellent', 'cm-g'] : d > 0.05 ? ['Good', 'cm-g'] : d < -0.12 ? ['Very poor', 'cm-r'] : d < -0.05 ? ['Poor', 'cm-r'] : ['Average', ''];
  }
  if (mine.outs < 15 || mine.era == null || all.era == null) return ['Average', ''];
  const d = all.era - mine.era;
  return d > 1.5 ? ['Excellent', 'cm-g'] : d > 0.6 ? ['Good', 'cm-g'] : d < -1.5 ? ['Very poor', 'cm-r'] : d < -0.6 ? ['Poor', 'cm-r'] : ['Average', ''];
}

/** The headline figures: TBO9+ for hitters, TBA9- for pitchers, for his latest season at his main level. */
function tbStrip(p) {
  const kind = isPitcher(p) ? 'pit' : 'bat';
  const rows = p.hist?.[kind] || [];
  if (!rows.length) return null;
  const year = Math.max(...rows.map((r) => r[0]));
  const levels = rows.filter((r) => r[0] === year);
  const lv = levels.some((r) => r[1] === 'MLB') ? 'MLB' : levels.sort((a, b) => b[4] - a[4])[0][1];
  const s = seasonLine(p, kind, year, lv);
  if (!s) return null;
  const idx = kind === 'bat' ? tboPlus(s, year, lv) : tbaMinus(s, p, year, lv);
  const raw = kind === 'bat' ? tbo9(s) : tba9(s, p, year);
  if (idx == null) return null;
  const good = kind === 'bat' ? idx >= 100 : idx <= 100;
  return h('div', { class: 'tb-strip', title: kind === 'bat' ? 'TBO9: bases produced per game. TBO9+: against the league, 100 is average, higher is better.' : 'TBA9: bases allowed per nine innings. TBA9-: against the league, 100 is average, lower is better.' },
    h('span', {}, h('span', { class: 'lbl' }, kind === 'bat' ? 'TBO9+' : 'TBA9-'), h('span', { class: `big ${good ? 'cm-g' : 'cm-r'}` }, idx)),
    h('span', {}, h('span', { class: 'lbl' }, kind === 'bat' ? 'TBO9' : 'TBA9'), h('span', { class: 'y' }, raw.toFixed(2))),
    h('span', { class: 'cm-s' }, `${year} ${lv === 'MLB' ? 'majors' : LEVEL_NAME[lv] || lv}`));
}

/** Roster position under the rules, for players in your organisation. */
/** What the scouts say: the report on him, or how to get one. */
function scoutBlock(p) {
  const w = seen(p), rep = reportFor(p);
  const box = h('div', { class: 'pp-scout' });
  const draw = () => {
    const text = [];
    if (w.mode === 'partial') text.push(h('div', { class: 'cm-r' }, 'Only some of his attributes are known: no scout has looked at him properly.'));
    if (rep) {
      text.push(h('div', { class: stale(rep) ? 'cm-s' : 'y' }, reportText(p, rep)));
      text.push(h('div', { class: 'cm-s', title: w.mode === 'report' ? 'The attributes shown are your scout\'s reading of him.' : '' }, `Report by ${rep.scout}, ${ageWords(rep)}${stale(rep) ? ' (out of date)' : ''}.`));
    }
    const buttons = [];
    if (rep) buttons.push(h('button', { class: 'cm-btn', onClick: () => goTab('scout') }, 'Full scout report'));
    if (rep && (!isUserOrg(p.orgId) || stale(rep))) buttons.push(h('button', { class: 'cm-btn', onClick: () => { toast(requestScouting(p)); draw(); } }, 'Ask for a fresh look'));
    fill(box, [h('div', { class: 'pp-scout-text' }, text), buttons.length ? h('div', { class: 'pp-scout-btns' }, buttons) : null]);
  };
  draw();
  return box;
}

/** For your own players: how he is developing, and what is happening at home. His character shows as plain figures in the grid. */
function devBlock(p) {
  const view = coachView(p);
  if (!view) return null;
  const rows = [];
  const now = view.find((x) => x.startsWith('Right now'));
  if (now) rows.push(['Home life', now.replace('Right now: ', '')]);
  if (p.dvYear != null && game.phase !== 'offseason') rows.push(['This season', changeWords(p.dvYear)]);
  if (p.dvLast != null) rows.push(['Last year', `${changeWords(p.dvLast)}${whyWords(p) ? `: ${whyWords(p).toLowerCase()}` : ''}`]);
  if (!rows.length) return null;
  return h('table', { class: 'cm-tbl info pstatus' }, h('tbody', {}, rows.map(([k, v]) => h('tr', {}, h('td', { class: 'l cm-s' }, k), h('td', { class: 'l y' }, v)))));
}

function rosterBlock(p) {
  if (!p.orgId || !isUserOrg(p.orgId)) return null;
  const rows = status(game.world.orgs.get(p.orgId), orgState(p.orgId), p);
  return h('table', { class: 'cm-tbl info pstatus' }, h('tbody', {}, rows.map(([k, v, cls]) => h('tr', {}, h('td', { class: 'l cm-s' }, k), h('td', { class: `l ${cls || 'y'}` }, v)))));
}

function injuries(p) {
  const club = (id) => game.world.clubs.get(id)?.city ?? id;
  const now = p.injury ? h('div', { class: 'cm-h cm-r' }, `Injured: ${injuryWords(p.injury)} (${Math.max(0, p.injury.days - (dayNo(game.date) - p.injury.since))} days left)${p.injury.setbacks ? `, ${p.injury.setbacks === 1 ? 'one setback' : `${p.injury.setbacks} setbacks`}` : ''}`)
    : p.rehab && !p.rehab.ready ? h('div', { class: 'cm-h cm-y' }, `On a rehab assignment with ${club(p.rehab.club)} (${p.rehab.level}): ${p.rehab.done} of ${p.rehab.need} ${isPitcher(p) ? 'outings' : 'games'}`)
      : p.rehab?.ready ? h('div', { class: 'cm-h cm-g' }, 'Rehab done: ready to be activated')
        : h('div', { class: 'cm-h' }, p.rust ? 'Fit, but rusty after his layoff' : 'Fit to play');
  // every injury the game has seen him have, newest first (this season's log fills in for saves from before the history was kept)
  const mine = (p.injuryLog || []).slice();
  for (const [d, , lv, days, type] of (game.season?.injuries || []).filter((x) => x[1] === p.id)) {
    if (!mine.some((e) => e.d === d)) mine.push({ d, y: game.season.year, org: p.orgId, level: lv, days, text: type });
  }
  mine.sort((a, b) => b.d - a.d);
  const total = mine.reduce((a, e) => a + (e.days || 0), 0);
  const live = (e) => p.injury && e === mine[0] && dayNo(game.date) - e.d < (p.injury.days || 0) + 1;
  return [now, mine.length
    ? [h('p', { class: 'cm-sub' }, `${mine.length} injur${mine.length === 1 ? 'y' : 'ies'} on record, ${total} days lost in all.`),
      h('table', { class: 'cm-tbl info' }, h('thead', {}, h('tr', {}, ['Date', 'Club', 'Level', 'Injury', 'Days out', 'Notes'].map((c) => h('th', { class: 'l' }, c)))),
        h('tbody', {}, mine.map((e) => h('tr', {}, h('td', { class: 'l' }, fromDayNo(e.d).toDateString().slice(4)), h('td', { class: 'l' }, e.org ? club(e.org) : ''), h('td', { class: 'l' }, e.level),
          h('td', { class: 'l y' }, e.text), h('td', { class: 'l' }, String(e.days)),
          h('td', { class: 'l cm-s' }, [live(e) ? 'Still out' : '', e.setbacks ? `${e.setbacks === 1 ? 'a setback' : `${e.setbacks} setbacks`}` : '', e.post ? 'in the postseason' : ''].filter(Boolean).join('; '))))))]
    : h('p', { class: 'cm-sub cm-empty' }, 'No injuries on record.')];
}

function statusWords(p) {
  const c = p.contract || {};
  const y = salaryIn(p, game.year);
  if (c.status === 'signed') return `${money(y)} in ${game.year}`;
  if (c.status === 'arbitration') return `arbitration (${y})`;
  if (c.status === 'pre-arbitration') return 'pre-arbitration';
  if (c.status === 'free agent') return 'free agent this winter';
  if (c.status === 'option') return 'option to be decided';
  return 'minor league contract';
}

/** His recent games, full lines: a starter's last five starts, a reliever's last five outings, a hitter's last ten games. */
function recentGames(p) {
  const pit = isPitcher(p);
  const log = (pit ? p.gp : p.gb) || [];
  if (!log.length) return null;
  const starter = pit && log.some((g) => g[3]);
  const rows = (pit ? (starter ? log.filter((g) => g[3]) : log).slice(-5) : log.slice(-10)).reverse();
  const opp = (id) => game.world.clubs.get(id)?.city ?? id;
  const when = (d) => { const x = fromDayNo(d); return `${x.getDate()}.${x.getMonth() + 1}`; };
  const lv = (l) => (l === 'MLB' ? '' : ` (${l})`);
  const head = pit ? ['Date', 'Opponent', 'IP', 'H', 'R', 'ER', 'BB', 'K', 'HR', 'Pitches', 'Dec'] : ['Date', 'Opponent', 'AB', 'R', 'H', '2B', '3B', 'HR', 'RBI', 'BB', 'K', 'SB'];
  const body = rows.map((g) => (pit
    ? [when(g[0]), `${opp(g[1])}${lv(g[2])}`, ipText(g[4]), g[5], g[6], g[7], g[8], g[9], g[10], g[11], g[12]]
    : [when(g[0]), `${opp(g[1])}${lv(g[2])}`, ...g.slice(3)]));
  const title = pit ? (starter ? `Last ${rows.length === 1 ? 'start' : `${rows.length} starts`}` : `Last ${rows.length === 1 ? 'outing' : `${rows.length} outings`}`) : `Last ${rows.length === 1 ? 'game' : `${rows.length} games`}`;
  return h('div', {}, h('div', { class: 'cm-h' }, title),
    h('div', { class: 'cm-tblwrap' }, h('table', { class: 'cm-tbl' },
      h('thead', {}, h('tr', {}, head.map((c, i) => h('th', { class: i < 2 ? 'l' : '' }, c)))),
      h('tbody', {}, body.map((r) => h('tr', {}, r.map((v, i) => h('td', { class: i < 2 ? 'l' : i === r.length - 1 && pit ? (v === 'L' ? 'cm-r' : v ? 'cm-g' : '') : 'y' }, v))))))));
}

/** The profile's stat lines: this season in the majors, this season in the minors if he has played there, and the last three years. */
/** TBO9+ (hitters) or TBA9- (pitchers) for hist rows of one year: judged against the league at his main level. */
function tbIndex(p, kind, these) {
  if (!these.length) return null;
  const yr = these[0][0];
  const lv = these.some((r) => r[1] === 'MLB') ? 'MLB' : [...these].sort((a, b) => b[4] - a[4])[0][1];
  const s = seasonLine(p, kind, yr, lv);
  if (!s) return null;
  return kind === 'bat' ? tboPlus(s, yr, lv) : tbaMinus(s, p, yr, lv);
}
const tbCol = (kind) => [kind === 'bat' ? 'TBO9+' : 'TBA9-', (s) => (s.tb == null ? '-' : s.tb)];

function lastTable(p) {
  const kind = isPitcher(p) ? 'pit' : 'bat';
  const rows = p.hist?.[kind] || [];
  if (!rows.length) return h('p', { class: 'cm-sub cm-pad cm-empty' }, 'No professional stats yet.');
  const cur = Math.max(game.season?.year ?? 0, ...rows.map((r) => r[0]));
  const club = (id) => { const c = game.world?.clubs.get(id); return c ? c.city : (id ?? ''); };
  const sum = (yr, these) => { const t = [yr, these.map((r) => r[1]).join('/'), these.map((r) => r[2]).join('/')]; HIST[kind].forEach((_, i) => t.push(these.reduce((a, r) => a + r[i + 3], 0))); return line(kind, t); };
  const out = [];
  const now = rows.filter((r) => r[0] === cur);
  const maj = now.filter((r) => r[1] === 'MLB'), minor = now.filter((r) => r[1] !== 'MLB');
  if (maj.length) out.push({ ...sum(cur, maj), label: `${cur} MLB`, tb: tbIndex(p, kind, maj) });
  if (minor.length) out.push({ ...sum(cur, minor), label: `${cur} ${minor.map((r) => r[1]).filter((v, i, a) => a.indexOf(v) === i).join('/')}`, tb: tbIndex(p, kind, minor) });
  for (const yr of [...new Set(rows.map((r) => r[0]))].filter((y) => y < cur).sort((a, b) => b - a).slice(0, 3)) {
    const these = rows.filter((r) => r[0] === yr);
    out.push({ ...sum(yr, these), label: `${yr} ${[...new Set(these.map((r) => r[1]))].join('/')}`, tb: tbIndex(p, kind, these) });
  }
  return h('div', { class: 'pp-stats' }, statTable(kind, out), dataCredit());
}

const FULL = {
  bat: [['G', (s) => s.g], ['PA', (s) => s.pa], ['AB', (s) => s.ab], ['R', (s) => s.r], ['H', (s) => s.h], ['2B', (s) => s.b2], ['3B', (s) => s.b3], ['HR', (s) => s.hr],
    ['RBI', (s) => s.rbi], ['BB', (s) => s.bb], ['SO', (s) => s.so], ['SB', (s) => s.sb], ['CS', (s) => s.cs], ['HBP', (s) => s.hbp], ['SF', (s) => s.sf],
    ['AVG', (s) => rate3(s.avg)], ['OBP', (s) => rate3(s.obp)], ['SLG', (s) => rate3(s.slg)], ['OPS', (s) => rate3(s.ops)], ['BB%', (s) => pct(s.bbPct)], ['K%', (s) => pct(s.kPct)], tbCol('bat')],
  pit: [['G', (s) => s.g], ['GS', (s) => s.gs], ['W', (s) => s.w], ['L', (s) => s.l], ['SV', (s) => s.sv], ['HLD', (s) => s.hld], ['IP', (s) => ipText(s.outs)], ['BF', (s) => s.bf],
    ['H', (s) => s.h], ['ER', (s) => s.er], ['HR', (s) => s.hr], ['BB', (s) => s.bb], ['SO', (s) => s.so], ['ERA', (s) => fix(s.era)], ['FIP', (s) => fix(s.fip)], ['WHIP', (s) => fix(s.whip)],
    ['K/9', (s) => fix(s.k9, 1)], ['BB/9', (s) => fix(s.bb9, 1)], ['HR/9', (s) => fix(s.hr9, 1)], ['K%', (s) => pct(s.kPct)], tbCol('pit')],
};

function statTable(kind, rows, full = false) {
  const cols = full ? FULL[kind] : kind === 'bat'
    ? [['G', (s) => s.g], ['PA', (s) => s.pa], ['AVG', (s) => rate3(s.avg)], ['OBP', (s) => rate3(s.obp)], ['SLG', (s) => rate3(s.slg)],
      ['HR', (s) => s.hr], ['RBI', (s) => s.rbi], ['SB', (s) => s.sb], ['BB%', (s) => pct(s.bbPct)], ['K%', (s) => pct(s.kPct)], tbCol('bat')]
    : [['G', (s) => s.g], ['GS', (s) => s.gs], ['IP', (s) => ipText(s.outs)], ['ERA', (s) => fix(s.era)], ['FIP', (s) => fix(s.fip)],
      ['WHIP', (s) => fix(s.whip)], ['K/9', (s) => fix(s.k9, 1)], ['BB/9', (s) => fix(s.bb9, 1)], ['W-L', (s) => `${s.w}-${s.l}`], ['SV', (s) => s.sv], tbCol('pit')];
  return h('div', { class: 'cm-tblwrap' }, h('table', { class: `cm-tbl ${kind}${full ? ' hist' : ''}` },
    h('thead', {}, h('tr', {}, h('th', { class: 'l' }, ''), cols.map(([c]) => h('th', {}, c)))),
    h('tbody', {}, rows.map((s) => h('tr', { class: s.total ? 'now' : '' }, h('td', { class: 'l' }, s.label), cols.map(([, f]) => h('td', { class: 'y' }, f(s))))))));
}

const ROUND_FULL = { WC: 'Wild Card Series', DS: 'Division Series', LCS: 'Championship Series', WS: 'World Series' };
const ROUND_ORD = { WS: 0, LCS: 1, DS: 2, WC: 3 };

/** His postseason: every series he played, newest first, with a total for each year and for his career. */
function postseasonBlock(p) {
  const out = [];
  const city = (id) => game.world?.clubs.get(id)?.city ?? id ?? '';
  for (const kind of isPitcher(p) ? ['pit', 'bat'] : ['bat', 'pit']) {
    const raw = p.ps?.[kind];
    if (!raw?.length) continue;
    if (kind === 'bat' && isPitcher(p) && raw.reduce((a, r) => a + r[HIST.bat.indexOf('pa') + 3], 0) < 5) continue;
    const cols = kind === 'bat'
      ? [['G', (s) => s.g], ['PA', (s) => s.pa], ['AB', (s) => s.ab], ['R', (s) => s.r], ['H', (s) => s.h], ['2B', (s) => s.b2], ['3B', (s) => s.b3], ['HR', (s) => s.hr], ['RBI', (s) => s.rbi], ['BB', (s) => s.bb], ['SO', (s) => s.so], ['SB', (s) => s.sb], ['AVG', (s) => rate3(s.avg)], ['OBP', (s) => rate3(s.obp)], ['SLG', (s) => rate3(s.slg)], ['OPS', (s) => rate3(s.ops)]]
      : [['G', (s) => s.g], ['GS', (s) => s.gs], ['W', (s) => s.w], ['L', (s) => s.l], ['SV', (s) => s.sv], ['IP', (s) => ipText(s.outs)], ['H', (s) => s.h], ['ER', (s) => s.er], ['HR', (s) => s.hr], ['BB', (s) => s.bb], ['SO', (s) => s.so], ['ERA', (s) => fix(s.era)], ['WHIP', (s) => fix(s.whip)]];
    const sum = (list, yr, round, club) => { const r = [yr, round, club]; HIST[kind].forEach((_, i) => r.push(list.reduce((a, x) => a + x[i + 3], 0))); return line(kind, r); };
    const rows = [];
    for (const yr of [...new Set(raw.map((r) => r[0]))].sort((a, b) => b - a)) {
      const these = raw.filter((r) => r[0] === yr).sort((a, b) => ROUND_ORD[a[1]] - ROUND_ORD[b[1]]);
      for (const r of these) rows.push({ yr, label: ROUND_FULL[r[1]] || r[1], club: city(r[2]), s: line(kind, r) });
      if (these.length > 1) rows.push({ yr, label: 'Postseason', club: '', s: sum(these, yr, '', ''), total: true });
    }
    rows.push({ yr: '', label: 'Postseason career', club: '', s: sum(raw, 0, '', ''), total: true });
    out.push(h('div', { class: 'cm-h' }, `Postseason ${kind === 'bat' ? 'batting' : 'pitching'}`),
      h('div', { class: 'cm-tblwrap' }, h('table', { class: 'cm-tbl hist' },
        h('thead', {}, h('tr', {}, ['Season', 'Series', 'Club'].map((c) => h('th', { class: 'l' }, c)), cols.map(([c]) => h('th', {}, c)))),
        h('tbody', {}, rows.map((r) => h('tr', { class: r.total ? 'now' : '' }, h('td', { class: 'l' }, r.yr), h('td', { class: 'l' }, r.label), h('td', { class: 'l' }, r.club), cols.map(([, f]) => h('td', { class: 'y' }, f(r.s)))))))));
  }
  return out;
}

/** Which stat lines the History tab shows: all, only the major leagues, or only the minors. */
let LEVELS = 'all';
const LEVEL_NAMES = { all: 'All', mlb: 'MLB', minors: 'Minor leagues' };

function stats(p) {
  const out = []; let movesDone = 0;
  const holders = [], statsStart = 0;
  for (const kind of isPitcher(p) ? ['pit', 'bat'] : ['bat', 'pit']) {
    const rows = seasons(p, kind);
    if (!rows.length || (kind === 'bat' && isPitcher(p) && rows.reduce((a, r) => a + r.pa, 0) < 20)) continue;
    if (kind === 'pit' && !isPitcher(p) && !p.pitching) continue;
    const clubName = (id) => { const c = game.world?.clubs.get(id); return c ? c.city : (id ?? ''); };
    const total = [0, 'Total', ''];
    HIST[kind].forEach((_, i) => total.push(p.hist[kind].reduce((a, r) => a + r[i + 3], 0)));
    // one line per season and club, newest first, like the Playing Career list in CM 01/02; a move sits on the season it led to
    const lines = [];
    for (const yr of [...new Set(rows.map((r) => r.season))]) {
      const these = p.hist[kind].filter((r) => r[0] === yr);
      for (const r of these) lines.push({ ...line(kind, r), season: yr, level: r[1], club: clubName(r[2]), org: String(r[2] || '').split('-')[0], tb: tbIndex(p, kind, [r]) });
      if (these.length > 1) {
        const sum = [yr, 'All', ''];
        HIST[kind].forEach((_, i) => sum.push(these.reduce((a, r) => a + r[i + 3], 0)));
        lines.push({ ...line(kind, sum), season: yr, level: '', club: 'All clubs', total: true, tb: tbIndex(p, kind, these) });
      }
    }
    const moves = movesDone++ ? [] : movesOf(p);
    const holder = h('div', {});
    const paint = () => {
      const keep = (r) => LEVELS === 'all' || (LEVELS === 'mlb') === (r[1] === 'MLB');
      let shown = lines, career = { ...line(kind, total), season: '', level: '', club: 'Career', total: true };
      if (LEVELS !== 'all') {
        shown = lines.filter((l) => !l.total && (LEVELS === 'mlb') === (l.level === 'MLB'));
        const sub = [0, 'Total', ''];
        const mine = p.hist[kind].filter(keep);
        HIST[kind].forEach((_, i) => sub.push(mine.reduce((a, r) => a + r[i + 3], 0)));
        career = { ...line(kind, sub), season: '', level: '', club: LEVELS === 'mlb' ? 'MLB career' : 'Minor league career', total: true };
      }
      const t = shown.length ? careerTable(kind, shown, career, moves, LEVELS !== 'all')
        : h('p', { class: 'cm-pad cm-s' }, LEVELS === 'mlb' ? 'No major league games yet.' : 'No minor league games.');
      holder.replaceChildren(t);
    };
    holders.push(paint);
    out.push(h('div', { class: 'cm-h' }, kind === 'bat' ? 'Batting' : 'Pitching'), holder);
  }
  if (holders.length) {
    const btns = Object.entries(LEVEL_NAMES).map(([id, label]) => h('button', { class: 'cm-btn', 'aria-pressed': String(LEVELS === id), onClick: () => { LEVELS = id; btns.forEach((b, i) => b.setAttribute('aria-pressed', String(Object.keys(LEVEL_NAMES)[i] === id))); holders.forEach((f) => f()); } }, label));
    out.splice(statsStart, 0, h('div', { class: 'cm-pad btnrow', style: { justifyContent: 'center' } }, h('span', { class: 'cm-s' }, 'Stat lines:'), btns));
    holders.forEach((f) => f());
  }
  out.push(...postseasonBlock(p));
  // honours won in the game: All-Star selections and awards, newest first
  const hon = honours(p);
  if (hon.length) {
    out.unshift(h('div', { class: 'cm-h' }, 'Honours'), h('p', { class: 'cm-pad cm-y' }, honourSummary(p, 8)),
      h('div', { class: 'pp-honlist' }, [...hon].reverse().map(([y, t]) => h('span', { class: `pp-honchip ${/MVP|Cy Young|Rookie/.test(t) ? 'y' : ''}` }, h('b', {}, y || ''), ` ${t}`))));
  }
  // this season's splits, with the month-by-month chart
  if (p.splits?.[game.season?.year]) out.push(splitsBlock(p));
  return out.length ? [...out, dataCredit()] : h('p', { class: 'cm-sub cm-pad cm-empty' }, 'No professional stats in 2024-26.');
}

/** The moves the game has recorded for him, each with the sentence that says what happened and a short tag for the career list. */
function movesOf(p) {
  const city = (id) => game.world.orgs.get(id)?.club.city ?? id ?? 'a club';
  const nm = (ids) => (ids || []).map((id) => game.world.players.get(id)).filter(Boolean).map(fullName).join(' and ');
  const $ = (v) => money(v, { short: false });
  const tags = { drafted: 'Drafted', intl: 'International signing', signed: 'Free agent', minor: 'Minor league deal', trade: 'Traded', claimed: 'Waiver claim', released: 'Released', expired: 'Contract ran out', nontender: 'Non-tendered', posted: 'On the market' };
  const say = (m) => {
    switch (m.how) {
      case 'drafted': return `Drafted by ${city(m.to)} (${m.note})${m.bonus ? `, signing for ${$(m.bonus)}` : ''}.`;
      case 'intl': return `Signed by ${city(m.to)} as an international amateur from ${m.country ? (COUNTRIES[m.country] || m.country) : 'abroad'}${m.bonus ? `, bonus ${$(m.bonus)}` : ''}.`;
      case 'signed': return `Signed with ${city(m.to)} as a free agent${m.note ? `: ${String(m.note).replace(/^Signed as a free agent: /, '')}` : ''}.`;
      case 'minor': return `Signed a minor league deal with ${city(m.to)}.`;
      case 'trade': return `Traded from ${city(m.from)} to ${city(m.to)}${m.sw?.length ? ` for ${nm(m.sw)}` : ''}${m.pt ? ', with a player to be named later in the deal' : ''}${m.cash ? (m.cash > 0 ? `, with ${$(m.cash)} sent` : `, with ${$(-m.cash)} received`) : ''}.`;
      case 'claimed': return `Claimed on waivers by ${city(m.to)} from ${city(m.from)}.`;
      case 'released': return `Released by ${city(m.from)}.`;
      case 'expired': return `His contract with ${city(m.from)} ran out.`;
      case 'nontender': return `Non-tendered by ${city(m.from)}.`;
      case 'posted': return `Came to the market: ${m.note}.`;
      default: return m.note || m.how;
    }
  };
  return (p.mv || []).map((m) => ({ m, text: say(m), tag: tags[m.how] || m.how, when: dateWords(fromDayNo(m.d)) + ' ' + m.y, at: m.y + (new Date(fromDayNo(m.d)).getMonth() / 12) }));
}
const COUNTRIES = { DOM: 'the Dominican Republic', VEN: 'Venezuela', MEX: 'Mexico', COL: 'Colombia', PAN: 'Panama', NIC: 'Nicaragua', CUB: 'Cuba', PUR: 'Puerto Rico', JPN: 'Japan', KOR: 'South Korea', USA: 'the United States', CAN: 'Canada', TWN: 'Taiwan' };

/** Season, club, how he got there, then the figures. Moves with no season of their own (a release, a contract running out) get a line of their own in date order. */
function careerTable(kind, lines, career, moves, only = false) {
  const cols = FULL[kind];
  moves = moves.map((mv) => ({ ...mv, placed: false })); // each drawing places them afresh (the filter buttons redraw the table)
  const used = new Set(), attach = new Map();
  // a move belongs to the first line at the club he moved to, in that season or the next (a winter signing plays the following year)
  for (const mv of moves) {
    const org = mv.m.to; if (!org) continue;
    const win = new Date(fromDayNo(mv.m.d)).getMonth() >= 9;
    const hit = lines.find((l) => !l.total && l.org === org && !used.has(l) && (l.season === mv.m.y || (win && l.season === mv.m.y + 1)));
    if (hit) { used.add(hit); attach.set(hit, mv); mv.placed = true; }
  }
  // a move to a club he has not played for yet (a winter trade, a new signing) still gets its row, as in CM's Playing Career
  const extra = [];
  for (const mv of only ? [] : moves) {
    if (mv.placed || !mv.m.to) continue;
    const win = new Date(fromDayNo(mv.m.d)).getMonth() >= 9;
    const org = game.world.orgs.get(mv.m.to);
    const l = { season: mv.m.y + (win ? 1 : 0), org: mv.m.to, club: org?.club.city ?? 'a club', level: '', blank: true };
    attach.set(l, mv); mv.placed = true; extra.push(l);
  }
  const entries = [...extra, ...lines].map((l) => ({ at: l.season + 0.5 + (l.total ? -0.01 : l.blank ? 0.01 : 0), line: l }))
    .concat((only ? [] : moves).filter((mv) => !mv.placed).map((mv) => ({ at: mv.at, mv }))).sort((a, b) => b.at - a.at);
  const width = cols.length + 3;
  const body = entries.map((e) => {
    if (e.mv) return h('tr', { class: 'hist-move' }, h('td', { class: 'l cm-s', style: { whiteSpace: 'nowrap' } }, e.mv.when), h('td', { class: 'l', colspan: width - 1 }, e.mv.text));
    const l = e.line, mv = attach.get(l);
    return h('tr', { class: l.total ? 'now' : '' }, h('td', { class: 'l' }, l.season), h('td', { class: 'l' }, l.club, l.level && !l.total ? h('small', { class: 'cm-s' }, `  ${l.level}`) : ''),
      h('td', { class: 'l hist-how', title: mv?.text || '' }, mv ? (mv.m.how === 'trade' && mv.m.from ? `Traded from ${game.world.orgs.get(mv.m.from)?.club.city ?? 'a club'}${mv.m.sw?.length ? ` for ${mv.m.sw.map((id) => game.world.players.get(id)).filter(Boolean).map(fullName).join(' and ')}` : ''}` : mv.tag) : ''), cols.map(([, f]) => h('td', { class: 'y' }, l.blank ? '' : f(l))));
  });
  body.push(h('tr', { class: 'now' }, h('td', { class: 'l' }, ''), h('td', { class: 'l' }, career.club && career.club !== 'Total' ? career.club : 'Career'), h('td', {}), cols.map(([, f]) => h('td', { class: 'y' }, f(career)))));
  return h('div', { class: 'cm-tblwrap' }, h('table', { class: 'cm-tbl hist' },
    h('thead', {}, h('tr', {}, ['Season', 'Club', 'Move'].map((c) => h('th', { class: 'l' }, c)), cols.map(([c]) => h('th', {}, c)))), h('tbody', {}, body)));
}

function splitsBlock(p) {
  const box = h('div', {}, h('p', { class: 'cm-s cm-pad' }, 'Loading splits...'));
  import('./stats-screen.js').then(({ splitsView }) => fill(box, splitsView(p)));
  return box;
}

/** How he came to his present club: the last recorded move into it (a trade, a waiver claim, a signing), else what his record says of how he began. */
function joinedHow(p, c) {
  const last = movesOf(p).filter((x) => x.m.to && x.m.to === p.orgId).at(-1);
  if (last) return `${last.text.replace(/\.$/, '')}, ${last.when}`;
  // the data says how his career began, not how he came to this club, so a drafted veteran is not called a draftee here
  return c.origin && !c.draft ? `International signing (${c.origin})` : '';
}

/** Where his career began: the round and pick he went in (to whichever club drafted him). */
const draftWords = (c) => (c.draft ? `Round ${String(c.draft.round).replace(/s$/, ' (supplemental)')}${c.draft.pick ? `, pick ${c.draft.pick}` : ''}` : '');
/** The average a year is worth showing only for a deal of more than one season. */
const multiYear = (c) => (c.text || '').split(/\s(?=\d+ y)/).some((t) => Number(/^(\d+) y/.exec(t)?.[1]) > 1);

function contract(p) {
  const c = p.contract || {};
  const ext = extOf(p);
  const info = [
    ['Status', statusWords(p)], ['Contract', c.text || (c.status === 'minor league' ? 'Minor league contract' : '')], ['Agent', `${agentOf(p).name} (${agentOf(p).agency})`],
    ...(isUserOrg(p.orgId) ? [['Your relationship with him', relWords(agentOf(p))]] : []),
    ['Signing bonus', ext.bonus ? money(ext.bonus, { short: false }) : ''],
    ['Deferred pay', ext.deferred ? `${money(ext.deferred.per * (c.years || []).filter((y) => y.deferred).length, { short: false })} put off in all (${money(ext.deferred.per, { short: false })} from each season's salary). It is paid in ${ext.deferred.pays.length} instalments, ${ext.deferred.pays.map((x) => `${money(x.amount, { short: false })} in ${x.season}`).join(', ')}, by ${game.world.orgs.get(ext.deferred.org)?.club.city ?? 'the club that signed him'}, whoever he plays for then. The salaries below are what is paid in each season.` : ''],
    ['Options', ext.opts.map((o) => `${optionWords(o)} for ${o.season} (buyout ${money(o.buyout, { short: false })})`).join('; ')],
    ['Opt-out', ext.optOut ? `after the ${ext.optOut} season` : ''],
    ['No-trade clause', notradeWords(ext.notrade)],
    ['Service time', c.serviceTime != null ? `${Math.floor(c.serviceTime)} years, ${Math.round((c.serviceTime % 1) * 1000)} days` : ''],
    ['Options left', c.options != null ? String(c.options) : ''],
    ['Average annual value', c.aav && multiYear(c) ? money(c.aav, { short: false }) : ''],
    ['Signed', c.signed ? String(c.signed) : ''],
    ['How he joined', joinedHow(p, c)],
    ['Drafted', draftWords(c)],
  ].filter(([, v]) => v);
  const listed = (c.years || []).filter((y) => y.season >= game.year && (y.status !== 'FA' || y.salary != null));
  const run = new Map(schedule(p).map((x) => [x.season, x.salary]));
  const years = listed.map((y) => {
    if (y.salary != null) return [String(y.season), money(y.salary, { short: false }) + (y.deferred ? `, plus ${money(y.deferred, { short: false })} deferred` : '')];
    const est = /^A\d/.test(y.status || '') ? run.get(y.season) ?? salaryFor(p, y.season) : /opt/.test(y.status || '') ? salaryFor(p, y.season) : null;
    return [String(y.season), `${YEAR_WORDS[y.status] || y.status}${est ? `, expect about ${money(est, { short: false })}` : ''}`];
  });
  // club control beyond the listed years: arbitration seasons still to come, with the salary he can expect
  if (p.contract && p.contract.status !== 'free agent') {
    const have = new Set(listed.map((y) => y.season));
    const ctl = schedule(p).filter((x) => !have.has(x.season));
    const st0 = p.contract.serviceTime ?? 0;
    for (const x of ctl) years.push([String(x.season), `${st0 + x.t >= 3 ? 'Arbitration' : 'Pre-arbitration'}, expect about ${money(x.salary, { short: false })}`]);
  }
  const canTalk = isUserOrg(p.orgId) && c.status && c.status !== 'minor league' && c.status !== 'free agent';
  return h('div', {},
    tradeButtons(p, canTalk ? h('button', { class: 'cm-btn go', onClick: async () => nav.push((await import('./negotiate-screen.js')).negotiateScreen(p, { extension: true })) }, 'Negotiate a new contract') : null),
    h('table', { class: 'cm-tbl info' }, h('tbody', {}, info.map(([k, v]) => h('tr', {}, h('td', { class: 'l cm-s' }, k), h('td', { class: 'l y' }, v))))),
    years.length ? [h('div', { class: 'cm-h' }, 'Seasons ahead'),
      h('table', { class: 'cm-tbl info' }, h('tbody', {}, years.map(([k, v]) => h('tr', {}, h('td', { class: 'l' }, k), h('td', { class: 'l y' }, v)))))] : null,
    dealHistory(p));
}

/** His career one year at a time: where he was, at what level, on what contract and pay, and what happened to him that year. */
function dealHistory(p) {
  const org = (id) => game.world.orgs.get(id)?.club;
  const city = (id) => org(id)?.city ?? id ?? '';
  const nickOf = (id) => org(id)?.name ?? '';
  const $ = (v) => money(v, { short: false });
  noteDeal(p, null);
  const kind = isPitcher(p) ? 'pit' : 'bat';
  const rows = (p.hist?.[kind] || []).slice();
  const years = new Set(rows.map((r) => r[0]));
  for (const d of p.deals || []) years.add(d.y);
  for (const m of p.mv || []) years.add(m.y);
  const dr = p.contract?.draft && !(p.mv || []).some((m) => m.how === 'drafted') ? p.contract.draft : null;
  if (dr?.year) years.add(dr.year);
  if (!years.size) return h('p', { class: 'cm-sub cm-pad cm-empty' }, 'No career record is kept for him yet.');
  const moves = movesOf(p);
  // deals noted by older versions called any contract of a drafted player "Drafted"; only his first, minor league one was
  const deals = (p.deals || []).map((d) => (d.kind === 'Drafted' && !/minor league/i.test(d.text || '') ? { ...d, kind: 'Contract', draft: null } : d));
  // each season belongs to the deal signed most recently at or before it that still runs (a deal's years start the year it was signed:
  // an extension keeps the earlier years in the same list, and they belong to the earlier contract)
  const live = new Map((p.contract?.years || []).map((r) => [r.season, r]));
  const cover = (y) => deals.filter((d) => d.y <= y && d.to != null && y <= d.to).sort((a, b) => b.y - a.y)[0] || deals.find((d) => d.y === y && d.kind === 'Last contract');
  const paid = (y, d) => {
    const row = live.get(y);
    if (row && typeof row.salary === 'number') return $(row.salary);
    const slot = d?.ys?.find((s) => s[0] === y);
    if (slot && typeof slot[1] === 'number') return $(slot[1]);
    if (slot && slot[1]) return String(slot[1]);
    return d?.aav ? $(d.aav) : '';
  };
  let mlbYears = 0;
  const out = [];
  for (const y of [...years].sort((a, b) => a - b)) {
    const rs = rows.filter((r) => r[0] === y);
    const lv = [...new Set(rs.map((r) => r[1]))];
    const clubs = [...new Set(rs.map((r) => String(r[2]).split('-')[0]))];
    const mlb = lv.includes('MLB');
    if (mlb) mlbYears++;
    const d = cover(y);
    let deal = '', pay = '';
    const earlier = !d && live.get(y) && typeof live.get(y).salary === 'number' && p.contract?.signed > y;
    if (d) {
      deal = d.kind === 'Last contract' ? 'Last contract on file' : `${d.kind}${d.org ? ` with ${city(d.org)}` : ''}, ${d.y}${d.to > d.y ? ` to ${d.to}` : ''}`;
      pay = paid(y, d);
    } else if (earlier) {
      deal = 'Earlier contract (terms not recorded)';
      pay = paid(y, null);
    } else if (mlb) {
      deal = mlbYears <= 3 ? 'Pre-arbitration, a club contract' : 'Not recorded';
      if (mlbYears <= 3) pay = $(780000);
    } else if (lv.length) deal = 'Minor league contract';
    if (!clubs.length && d?.org) clubs.push(d.org);
    // a contract signed in a year is an event of that year (a free agent signing already shows as a move)
    const signedHere = deals.filter((d) => d.kind !== 'Last contract' && (d.on ?? d.y) === y && !(d.kind === 'Signed' && moves.some((x) => x.m.y === y && x.m.how === 'signed')) && !(d.draft || /minor league/i.test(d.text || '')))
      .map((d) => `${d.kind} with ${d.org ? city(d.org) : 'the club'}${d.text ? `: ${d.text.replace(/^[^:]*: /, '')}` : ''}`);
    const ev = [...signedHere, ...moves.filter((x) => x.m.y === y).map((x) => x.text.replace(/\.$/, '')), ...(dr && dr.year === y ? [`Drafted in round ${dr.round}${dr.pick ? `, pick ${dr.pick}` : ''}`] : [])].join('. ');
    out.push({ y, age: p.age - (game.year - y), club: clubs.map(city).join(' / '), lv: lv.join(' / ') || '', deal, pay, ev });
  }
  out.reverse();
  const T = (heads, body) => h('table', { class: 'cm-tbl info' }, h('thead', {}, h('tr', {}, heads.map((x) => h('th', { class: 'l' }, x)))), h('tbody', {}, body));
  const res = [h('div', { class: 'cm-h' }, 'Career, year by year'),
    T(['Year', 'Age', 'Club', 'Level', 'Contract', 'Pay', 'What happened'], out.map((r) => h('tr', {}, [String(r.y), String(r.age), r.club, r.lv, r.deal, r.pay, r.ev].map((v, i) => h('td', { class: i === 6 ? 'l cm-s' : 'l' }, v)))))];
  const signed = deals.filter((d) => d.kind !== 'Last contract').slice().reverse();
  if (signed.length) {
    res.push(h('div', { class: 'cm-h' }, 'Contracts signed'));
    res.push(T(['Signed', 'Club', 'Deal', 'Seasons', 'Per year', 'Whole deal', 'Terms'], signed.map((d) => {
      const bits = [];
      if (d.bonus) bits.push(`bonus ${$(d.bonus)}`);
      for (const o of d.ext?.opts || []) bits.push(`${o.type} option for ${o.season}`);
      if (d.ext?.optOut) bits.push(`opt-out after ${d.ext.optOut}`);
      if (d.ext?.notrade) bits.push('no-trade clause');
      if (d.draft) bits.push(`drafted round ${d.draft.round}${d.draft.pick ? `, pick ${d.draft.pick}` : ''}`);
      return h('tr', {}, [String(d.y), d.org ? (org(d.org)?.full ?? `${city(d.org)} ${nickOf(d.org)}`) : '', d.kind, d.from != null ? (d.to !== d.from ? `${d.from} to ${d.to}` : String(d.from)) : '', d.aav ? $(d.aav) : '', d.total ? $(d.total) : '', bits.join('; ')].map((v) => h('td', { class: 'l' }, v)));
    })));
  }
  return res;
}

const YEAR_WORDS = {
  popt: 'Player option', 
  A1: 'Arbitration (first year)', A2: 'Arbitration (second year)', A3: 'Arbitration (third year)', A4: 'Arbitration (fourth year)',
  FA: 'Free agent', opt: 'Option year', 'cond opt': 'Conditional option',
};


/** A player of yours who has asked for a trade: what he wants and what you can say. */
function grievance(p) {
  if (!isUserOrg(p.orgId)) return null;
  const words = requestWords(p), open = promisesTo(p);
  if (!words && !open.length) return null;
  const say = (kind) => { promise(p, kind); toast('He has your word. The game will keep a record.'); nav.replace?.(playerScreen(p)); };
  return h('div', { class: 'cm-pad neg-say' },
    words ? h('div', {}, h('b', { class: 'cm-r' }, 'Wants out. '), words) : null,
    open.map((x) => h('div', { class: 'cm-s' }, `You promised: ${PROMISES[x.kind].label.replace('Promise him ', '').replace('Promise to ', '')}${Number.isFinite(x.due) ? `, by ${dateWords(fromDayNo(x.due))}` : ' in his contract talks'}.`)),
    words ? h('div', { class: 'btnrow' },
      Object.entries(PROMISES).map(([k, K]) => h('button', { class: 'cm-btn', onClick: () => say(k) }, K.label)),
      h('button', { class: 'cm-btn', onClick: () => { refuse(p); toast('You have told him he is staying.'); nav.replace?.(playerScreen(p)); } }, 'Tell him he stays')) : null);
}

/** Trade buttons on the contract tab: ask for him, or offer or list your own player. */
function tradeButtons(p, extra = null) {
  if (!p.orgId || !/^[A-Z]{2,3}$/.test(p.orgId)) return null;
  const go = async (o) => nav.push((await import('./trade-screen.js')).tradeScreen(o));
  const w = worthOf0(game.orgId, p);
  const val = h('div', { class: 'tb-value', title: 'What a player is worth to you is the production he gives above a bench player, minus what his contract costs over the years you control him.' },
    h('span', { class: 'cm-s' }, w == null ? 'Value to you: ' : w >= 0 ? 'Surplus value to you: ' : 'Overpaid by: '), h('b', { class: w != null && w < 0 ? 'cm-r' : 'y' }, w == null ? '?' : money(Math.abs(w))),
    h('span', { class: 'cm-s' }, w == null ? '  (not scouted well enough to say)' : w >= 0 ? '  more than his contract costs' : '  his contract costs more than he gives, so a club would want something back to take it'));
  const note = h('div', { class: 'tb-note' });
  // the answer shows beside the buttons and stays there, as well as the pop-up
  const say = (msg) => { note.textContent = msg; toast(msg); };
  if (isUserOrg(p.orgId)) {
    return h('div', { class: 'cm-pad' }, val, h('div', { class: 'btnrow' }, extra,
      h('button', { class: 'cm-btn', onClick: () => go({ give: [p.id] }) }, 'Offer him to a club'),
      h('button', { class: 'cm-btn go', title: 'Every club hears he is available and the interested ones come back with offers in a few days', onClick: () => say(shopPlayer(p)) }, 'Shop him to every club'),
      p.listed?.mine ? h('button', { class: 'cm-btn', onClick: () => { unlist(p); say('He is off the transfer list.'); } }, 'Take off the transfer list')
        : h('button', { class: 'cm-btn', onClick: () => { listPlayer(p); say('He is on the transfer list. Clubs will make you offers.'); } }, 'Put on the transfer list')), note);
  }
  return h('div', { class: 'cm-pad' }, val, h('div', { class: 'btnrow' }, h('button', { class: 'cm-btn go', onClick: () => go({ with: p.orgId, get: [p.id] }) }, 'Trade for him')));
}

/** The club he plays for today and at what level, from his organisation's roster (his stored club can lag behind a call-up). */
function placeLine(p) {
  const o = p.orgId && game.world?.orgs.get(p.orgId);
  if (!o) return { text: p.contract?.status === 'free agent' ? 'Free agent' : '', club: null };
  const code = placeCode(orgState(p.orgId), p) || p.level;
  const big = o.club.full ?? `${o.club.city} ${o.club.name}`;
  if (code === 'MLB') return { text: `${big} · ${LEVEL_NAME.MLB}`, club: o.club };
  if (code === 'IL') return { text: `${big} · Injured list`, club: o.club };
  if (code === 'DFA') return { text: `${big} · Designated for assignment`, club: o.club };
  const lv = LEVEL_NAME[code] ? code : p.level;
  const c = game.world.clubs.get(`${p.orgId}-${lv}`);
  return c && lv !== 'MLB' ? { text: `${c.full ?? `${c.city} ${c.name}`} · ${LEVEL_NAME[lv]}, ${o.club.name} organisation`, club: c } : { text: big, club: o.club };
}
