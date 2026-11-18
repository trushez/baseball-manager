// News: your inbox, with categories, unread counts and actions on the message.
import { cannotSign } from '../season/winter.js';
import { h, fill, cmTabs, toast, captureToasts } from './dom.js';
import { nav } from './nav.js';
import { clubMenu } from './menu.js';
import { plink, clink } from './club-ui.js';
import { linkify, linkHint } from './linkify.js';
import { boxView } from './box-view.js';
import { inboxActions } from './inbox-actions.js';
import { negFor, talksWith, waitingText } from '../season/replies.js';
import { payrollEffect } from './deal-summary.js';
import { market, offerAsMine } from '../season/trade.js';
import { fullName, isPitcher } from '../data/world.js';
import { pageFor } from './inbox-pages.js';
import { addToRotation, addToLineup } from './place-player.js';
import { game, org, orgState } from '../state.js';
import { unread, since } from '../season/inbox.js';
import { ilKinds } from '../season/roster.js';
import { rosterAction } from './roster-action.js';
import { settleStaffNotes } from '../club/depth.js';
import { chooseTreatment, choiceOpen } from '../season/injuries.js';

// tabs: [id, label, categories shown]
const CATS = [['', 'All', null], ['club', 'Club', ['club']], ['injury', 'Injuries', ['injury']], ['result', 'Games', ['result', 'preview']], ['league', 'League', ['league']]];

export function inboxScreen({ stopped = null, open = null } = {}) {
  let cat = '';
  // open on the oldest unread message (of the run just played, after a Continue), not on the one that stopped it;
  // or on the message asked for (the injury that needs cover)
  let sel = open && game.inbox.includes(open) ? open : null;
  let first = true;
  let query = '';
  let opening = true; // phone: open the oldest unread message once, as a mail app opens its newest
  let reading = false; // phone: the list and the open message are separate screens, like a mail app
  const phone = () => false; // the phone shows the list and the open message together, as on a desktop
  const search = h('input', { class: 'cm-input inbox-search', type: 'search', placeholder: 'Search', 'aria-label': 'Search the news', onInput: (e) => { query = e.target.value.trim().toLowerCase(); sel = null; first = true; render(); } });
  const list = h('div', { class: 'inbox-list' });
  const bar = h('div', { class: 'inbox-bar' });
  const view = h('div', { class: 'inbox-view' });
  const tabs = cmTabs(CATS.map(([id, label]) => ({ id: id || 'all', label })), 'all', (id) => { cat = id === 'all' ? '' : id; sel = null; first = true; render(); });
  const inCat = (m) => (cat ? CATS.find((c) => c[0] === cat)[2].includes(m.cat) : query || !m.minor) && (!query || text(m).includes(query));

  function labels() {
    tabs.el.querySelectorAll('.cm-tab').forEach((b, i) => {
      const [, label, cats] = CATS[i];
      const n = cats ? cats.reduce((a, c) => a + unread(c), 0) : unread();
      b.textContent = n ? `${label} (${n})` : label;
    });
  }

  function render() {
    // what an action on a message did is written into the message under its buttons, not shown in a pop-up
    captureToasts((t) => { if (!sel) return false; const r = (sel.result ||= []); if (r.at(-1) !== t) r.push(t); if (r.length > 6) r.shift(); render(); return true; });
    try { settleStaffNotes(orgState()); } catch { /* no club yet */ }
    if (sel && !game.inbox.includes(sel)) sel = null; // withdrawn: dealt with since
    const msgs = game.inbox.filter(inCat).slice().reverse();
    // open on the oldest unread message, so news is read in the order it happened
    if (phone() && !reading) sel = null;
    if (!sel && msgs.length && (!phone() || (opening && msgs.some((m) => !m.read) && !query))) {
      reading = phone();
      // always the oldest unread message in the tab, so nothing is skipped and the news reads in the order it happened
      const unreadMsgs = msgs.filter((m) => !m.read);
      sel = unreadMsgs.at(-1) || msgs[0];
    }
    opening = false;
    if (sel && (!phone() || reading)) sel.read = true;
    rootEl?.classList.toggle('inbox-reading', phone() && reading && !!sel);
    labels();
    nav.refreshSide?.(); // the unread count beside your name
    const shown = msgs.slice(0, 300);
    const left = msgs.filter((m) => !m.read).length;
    // next unread: the oldest unread message in this tab, the order the news happened in
    const bring = () => requestAnimationFrame(() => list.querySelector('.inbox-row.on')?.scrollIntoView({ block: 'center' }));
    const next = () => { const m = msgs.filter((x) => !x.read).at(-1); if (m) { sel = m; render(); bring(); } };
    fill(bar,
      h('button', { class: 'cm-btn', disabled: !left, onClick: next }, left ? `Next unread (${left})` : 'No unread'),
      h('button', { class: 'cm-btn', disabled: !left, onClick: () => { msgs.forEach((m) => { m.read = true; }); render(); } }, 'Mark all read'));
    // one line a message, as in the old game: the day, the kind of news and the headline, the open one in the club colour
    fill(list, shown.length ? shown.map((m) => h('div', {
      class: `inbox-row${m === sel ? ' on' : ''}${m.read ? '' : ' unread'}${m.important ? ' imp' : ''}`,
      onClick: () => { sel = m; reading = true; render(); },
    }, h('span', { class: 'when' }, dateShort(m.date)), h('span', { class: `cat c-${m.cat}` }, catLabel(m.cat)), h('span', { class: 't' }, m.title)))
      : h('p', { class: 'cm-sub cm-pad cm-empty' }, 'No messages.'));
    const toList = () => { reading = false; sel = null; first = false; render(); };
    const nextBtn = h('button', { class: 'cm-btn', disabled: !left, onClick: () => { const m = msgs.filter((x) => !x.read && x !== sel).at(-1); if (m) { sel = m; render(); bring(); } else toList(); } }, left ? `Next unread (${left})` : 'No unread');
    rootEl?.classList.toggle('inbox-offer', !!sel?.offer);
    fill(view, sel ? [h('div', { class: 'inbox-nav' }, h('button', { class: 'cm-btn', onClick: toList }, '‹ Inbox'), nextBtn), ...message(sel)] : null);
    // the list is newest first, so the oldest unread sits down it: bring it into view the first time
    if (first && !phone()) { first = false; requestAnimationFrame(() => list.querySelector('.inbox-row.on')?.scrollIntoView({ block: 'center' })); }
  }

  function message(m) {
    const p = m.player && game.world.players.get(m.player);
    const acts = [];
    if (p) acts.push(h('button', { class: 'cm-btn', onClick: async () => { try { const { playerScreen } = await import('./player-screen.js'); nav.push(playerScreen(p)); } catch (e) { console.error('profile', p.id, e); toast(`Could not open ${fullName(p)}: ${e.message}`); } } }, `View ${fullName(p)}`));
    // the doctors' question: rest or surgery
    if (choiceOpen(m)) for (const o of m.choice.options) acts.push(h('button', { class: 'cm-btn', onClick: () => { const t = chooseTreatment(m, o.id); if (t) toast(t); render(); } }, o.label));
    else if (m.choice?.picked) acts.push(h('span', { class: 'cm-s' }, `Decided: ${m.choice.options.find((o) => o.id === m.choice.picked).label.replace(/ \(.*/, '').toLowerCase()}.`));
    if (p && !m.neg && game.winter?.on && game.freeAgents.includes(p.id) && !cannotSign(p)) acts.push(h('button', { class: 'cm-btn go', onClick: async () => nav.push((await import('./negotiate-screen.js')).negotiateScreen(p, { how: 'Signed as a free agent', kind: 'free' })) }, 'Open the talks'));
    if (m.neg && !m.closed && game.world.players.get(m.neg) && !negFor(game.world.players.get(m.neg)).agreed) acts.push(h('button', { class: 'cm-btn go', onClick: async () => nav.push((await import('./negotiate-screen.js')).negotiateScreen(game.world.players.get(m.neg))) }, 'Open the talks'));
    if (m.trade && !m.closed) {
      const tk = talksWith(m.trade);
      // terms already sent: say so and offer only a look at them, not another go at making the offer
      if (tk?.pending) acts.push(h('span', { class: 'cm-s' }, `Offer sent. ${waitingText(tk.pending.due)}`));
      acts.push(h('button', { class: tk?.pending ? 'cm-btn' : 'cm-btn go', onClick: async () => nav.push((await import('./trade-screen.js')).tradeScreen({ with: m.trade })) }, tk?.pending ? 'See the offer' : 'Open the talks'));
    }
    for (const q of m.search || []) acts.push(h('button', { class: 'cm-btn go', onClick: async () => nav.push((await import('./search-screen.js')).searchScreen(q.preset)) }, q.label));
    if (m.offer) acts.push(h('button', { class: 'cm-btn go', onClick: async () => nav.push((await import('./transfers-screen.js')).transfersScreen('offers', m.offer)) }, 'See the offer'));
    // players just received in a trade: put them straight into the lineup or the rotation
    for (const id of m.got || []) {
      const q = game.world.players.get(id);
      if (!q || q.orgId !== game.orgId) continue;
      const pit = isPitcher(q);
      acts.push(h('button', { class: 'cm-btn go', onClick: async () => { const o = org(), st = orgState(); const ok = pit ? await addToRotation(o, st, q) : await addToLineup(o, st, q); if (ok) render(); } }, pit ? `Add ${fullName(q)} to the rotation` : `Add ${fullName(q)} to the lineup`));
      acts.push(h('button', { class: 'cm-btn', onClick: async () => nav.push((await import('./club-tactics.js')).clubTactics(pit ? 'pitching' : 'lineupR')) }, pit ? 'Pitching staff' : 'Batting lineup'));
    }
    // any other message with information in it opens the page it is about
    const pg = !m.offer && !m.trade && !m.neg && !m.search?.length ? pageFor(m) : null;
    if (pg && m.cat !== 'result' && m.cat !== 'preview') acts.push(h('button', { class: 'cm-btn go', onClick: pg.open }, pg.label));
    acts.push(...inboxActions(m, p, render));
    const lo = m.offer ? market().offers.find((x) => x.id === m.offer) : null;
    const offerNow = lo?.status === 'open' ? offerAsMine(lo.id) : null;
    if (m.cat === 'result' || m.cat === 'preview') acts.push(h('button', { class: 'cm-btn', onClick: async () => nav.push((await import('./fixtures-screen.js')).fixturesScreen('fixtures')) }, 'Fixtures'));
    // the quick links sit straight under the last line of the message, so the mouse has little way to go
    // the grey status lines (offer declined, decided, since this arrived...) go under the buttons, large, where they are read
    const isNote = (a) => a?.classList?.contains('cm-s');
    const notes = acts.filter(isNote).map((a) => { a.classList.remove('cm-s'); return a; });
    if (m.closed) notes.unshift(h('div', {}, m.closed));
    for (const r of m.result || []) if (r !== m.closed) notes.push(h('div', { class: 'cm-g' }, r));
    const isGo = (a) => (a.classList?.contains('go') ? 1 : 0);
    const buttons = acts.filter((a) => !isNote(a)).sort((a, b) => isGo(a) - isGo(b)); // the main action goes last, on the right
    linkHint([...(m.ids || []), m.player, m.neg]);
    return [
      h('div', { class: 'inbox-scroll' },
        h('div', { class: 'cm-h' }, linkify(m.title)),
        h('div', { class: 'cm-sub' }, new Date(m.date).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })),
        m.parts || m.body ? h('div', { class: 'cm-pad inbox-body' }, withVoices(m).map(part)) : null,
        offerNow ? payrollEffect(offerNow) : null,
        notes.length ? h('div', { class: 'inbox-status' }, notes.map((n) => h('div', {}, n))) : null),
      // the actions sit in a bar along the foot of the message, the main one last on the right
      buttons.length ? h('div', { class: 'inbox-foot' }, buttons) : null,
    ];
  }

  let rootEl = null;
  rootEl = h('div', { style: { display: 'contents' } },
    h('div', { class: 'cm-title' }, `${game.manager}: News`),
    tabs.el,
    h('div', { class: 'cm-panel grow inbox' }, list, h('div', { class: 'inbox-find' }, search, bar), view));
  render();
  return {
    el: rootEl,
    side: () => clubMenu('inbox'), bg: 'news',
    onShow: render,
    /** The Space bar: the oldest unread message, wherever it is. False when there is nothing left to read. */
    space() {
      cat = ''; query = ''; search.value = ''; tabs.select('all');
      const m = game.inbox.find((x) => !x.read && inCat(x));
      if (!m) return false;
      sel = m; first = true; render();
      return true;
    },
  };
}

const catLabel = (c) => ({ club: 'Club', injury: 'Injury', result: 'Result', preview: 'Preview', league: 'League' }[c] || '');

/** A table cell: text, or a player name that opens his profile. */
const cell = (v) => (v && typeof v === 'object' && v.pid ? (game.world.players.get(v.pid) ? plink(game.world.players.get(v.pid), v.t) : v.t) : linkify(v));

/** One piece of a message: a paragraph, a table or a box score. */
/** The message's parts with the media's voices after the words and before any box score. */
function withVoices(m) {
  const parts = m.parts || m.body.split('\n').map((x) => ({ p: x }));
  const v = m.voices || [];
  const at = parts.findIndex((x) => x.box);
  return at < 0 ? [...parts, ...v] : [...parts.slice(0, at), ...v, ...parts.slice(at)];
}

function part(x) {
  if (x.p) return h('p', {}, linkify(x.p, x.pid != null ? [x.pid] : []));
  if (x.rows) {
    return h('div', { class: 'cm-tblwrap' }, h('table', { class: 'cm-tbl msg-tbl' },
      x.head ? h('thead', {}, h('tr', {}, x.head.map((c) => h('th', { class: 'l' }, c)))) : null,
      h('tbody', {}, x.rows.map((r) => h('tr', {}, r.map((c) => h('td', { class: 'l' }, cell(c))))))));
  }
  if (x.box) return boxView(x.box);
  if (x.q) return h('blockquote', { class: 'voice' }, h('span', { class: 'q' }, '"', linkify(x.q), '"'), h('span', { class: 'by' }, linkify(x.by)));
  return null;
}

const dateShort = (t) => new Date(t).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });

/** Everything a message says, lower case, for the search box. */
function text(m) {
  if (m._txt) return m._txt;
  const cellText = (c) => (c && typeof c === 'object' ? c.t ?? '' : String(c ?? ''));
  const parts = (m.parts || []).map((x) => [x.p, x.q, x.by, x.head?.join(' '), x.rows?.map((r) => r.map(cellText).join(' ')).join(' ')].filter(Boolean).join(' '));
  Object.defineProperty(m, '_txt', { value: [m.title, m.body, ...parts].filter(Boolean).join(' ').toLowerCase(), enumerable: false, configurable: true, writable: true });
  return m._txt;
}
