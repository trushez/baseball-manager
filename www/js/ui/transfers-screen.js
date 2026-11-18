// Transfers: the players clubs have listed, offers made to you, and the trades made around the league.
import { intlPanel } from './intl-panel.js';
import { rule5Panel } from './rule5-panel.js';
import { h, fill, toast } from './dom.js';
import { nav } from './nav.js';
import { clubTitle, plink, select } from './club-ui.js';
import { clubMenu } from './menu.js';
import { mainPos, money, fullName, lastSeason, isPitcher } from '../data/world.js';
import { keyAttrs } from './attr-ui.js';
import { lastLine } from './deal-summary.js';
import { game, orgState } from '../state.js';
import { freeAgentsPanel } from './free-agents-screen.js';
import { draftPanel } from './draft-panel.js';
import { draftedPanel, movesPanel } from './moves-panel.js';
import { value } from '../season/value.js';
import { counts } from '../club/depth.js';
import { waiverOrder } from '../season/roster.js';
import { fortyRoom } from './roster-action.js';
import { noMoney } from '../season/contracts.js';
import { dateWords, fromDayNo, dayNo } from '../season/calendar.js';
import { dealSummary, payrollEffect } from './deal-summary.js';
import { clink } from './club-ui.js';
import { OUTLETS, tally, book } from '../season/rumours.js';
import { budget, expected } from '../season/finance.js';
import { waitingText, orgOf } from '../season/replies.js';
import { market, listedPlayers, unlist, schedule, worth, worthText, salaryFor, acceptOffer, declineOffer, offerAsMine, windowText } from '../season/trade.js';

const P = (id) => game.world.players.get(id);
const city = (id) => game.world.orgs.get(id).club.city;
const TABS = [['fa', 'Free Agents'], ['waiver', 'Waiver Wire'], ['rule5', 'Rule 5'], ['list', 'Transfer List'], ['offers', 'Offers'], ['short', 'Shortlist'], ['draft', 'Draft'], ['intl', 'International'], ['drafted', 'Draft History'], ['moves', 'Moves In and Out'], ['log', 'Trades Made'], ['rumours', 'Rumour Mill']];

export function transfersScreen(tab = 'fa', focus = null) {
  const area = h('div', { class: 'cm-panel grow tx-area' });
  const tabs = h('div', { class: 'cm-tabs tx-tabs', role: 'tablist' });
  const open_ = async (what, offer) => nav.push((await import('./trade-screen.js')).tradeScreen({ ...offer, back: true }));
  const open = open_;

  // the list can be read three ways, so it all fits: everything at once is too wide
  const VIEWS = [['over', 'Overview'], ['stats', 'Season stats'], ['money', 'Contract and value']];
  const LSORT = [['worth', 'Value'], ['age', 'Age'], ['pay', 'Pay'], ['club', 'Club'], ['pos', 'Position'], ['name', 'Name']];
  const lf = (transfersScreen.lf ||= { view: 'over', sort: 'worth', pos: 'all' });
  const LPOS = [['all', 'All players'], ['P', 'Pitchers'], ['H', 'Hitters'], ['SP', 'Starters'], ['RP', 'Relievers'], ['C', 'Catchers'], ['IF', 'Infielders'], ['OF', 'Outfielders']];
  const r3 = (v) => (v == null ? '-' : v.toFixed(3).replace(/^0/, ''));
  const fx = (v, d = 2) => (v == null ? '-' : v.toFixed(d));
  const yearsLeft = (p) => (p.contract?.years || []).filter((y) => y.season >= game.year).length;
  const through = (p) => { const ys = (p.contract?.years || []).filter((y) => y.season >= game.year).map((y) => y.season), sc = schedule(p).map((r) => r.season), end = Math.max(0, ...ys, ...sc); if (!end) return 'Expiring'; const n = end - game.year + 1; return `${n} ${n === 1 ? 'year' : 'years'}, to ${end}${sc.length && end > Math.max(0, ...ys) ? ' (club control)' : ''}`; };
  const posOK = (p) => {
    const m = mainPos(p), pit = isPitcher(p);
    return { all: true, P: pit, H: !pit, SP: m === 'SP', RP: pit && m !== 'SP', C: m === 'C', IF: ['1B', '2B', '3B', 'SS'].includes(m), OF: ['LF', 'CF', 'RF'].includes(m) }[lf.pos];
  };
  function lists() {
    const sorts = {
      worth: (a, b) => (worth(game.orgId, b) ?? -1e12) - (worth(game.orgId, a) ?? -1e12), age: (a, b) => a.age - b.age,
      pay: (a, b) => (salaryFor(b, game.year) ?? 0) - (salaryFor(a, game.year) ?? 0), club: (a, b) => city(a.orgId).localeCompare(city(b.orgId)),
      pos: (a, b) => mainPos(a).localeCompare(mainPos(b)), name: (a, b) => `${a.last}${a.first}`.localeCompare(`${b.last}${b.first}`),
    };
    const rows = listedPlayers().filter(posOK).sort(sorts[lf.sort]);
    const cols = { over: ['Latest season', 'Pay', 'Value'], stats: ['Games', 'Line', 'Production'], money: ['Pay', 'Contract', 'Years', 'Value'] }[lf.view];
    const cells = (p) => {
      const sl = lastSeason(p), pay = salaryFor(p, game.year), pit = isPitcher(p);
      const w = h('td', { class: 'y' }, worthText(p)), pc = h('td', {}, pay != null ? money(pay) : '');
      if (lf.view === 'stats') {
        if (!sl) return [h('td', {}, ''), h('td', { class: 'l cm-s' }, 'No record yet'), h('td', { class: 'l cm-s' }, '')];
        return pit
          ? [h('td', {}, `${sl.season}: ${sl.g ?? ''}`), h('td', { class: 'l' }, `${Math.round(sl.ip)} IP, ${fx(sl.era)} ERA, ${fx(sl.whip)} WHIP`), h('td', { class: 'l cm-s' }, `${sl.so} K, ${sl.bb} BB, ${fx(sl.k9, 1)} K/9${sl.sv ? `, ${sl.sv} SV` : ''}`)]
          : [h('td', {}, `${sl.season}: ${sl.g ?? ''}`), h('td', { class: 'l' }, `${r3(sl.avg)} / ${r3(sl.obp)} / ${r3(sl.slg)}`), h('td', { class: 'l cm-s' }, `${sl.hr} HR, ${sl.rbi} RBI, ${sl.sb} SB, ${sl.pa} PA`)];
      }
      if (lf.view === 'money') return [pc, h('td', { class: 'l cm-s' }, (p.contract?.text || '').replace(/^[^:]*: /, '') || 'Not recorded'), h('td', { class: 'l' }, through(p)), w];
      return [h('td', { class: 'l' }, lastLine(p)), pc, w];
    };
    return h('table', { class: 'cm-tbl' },
      h('thead', {}, h('tr', {}, ['Player', 'Club', 'Pos', 'Age', ...cols, ''].map((c, i) => h('th', { class: i < 2 || (lf.view === 'over' && i === 4) || (lf.view === 'stats' && i > 4) || (lf.view === 'money' && (i === 5 || i === 6)) ? 'l' : '' }, c)))),
      h('tbody', {}, rows.length ? rows.map((p) => {
        const mine = p.orgId === game.orgId;
        return h('tr', { class: mine ? 'sel' : '' }, h('td', { class: 'l tr-who' }, plink(p), h('div', {}, keyAttrs(p))), h('td', { class: 'l' }, city(p.orgId)), h('td', {}, mainPos(p)), h('td', {}, p.age), ...cells(p),
          h('td', {}, mine ? h('button', { class: 'cm-btn', onClick: () => { unlist(p); draw(); } }, 'Take off the list') : h('button', { class: 'cm-btn', onClick: () => open('offer', { with: p.orgId, get: [p.id] }) }, 'Make an offer')));
      }) : h('tr', {}, h('td', { class: 'l cm-s', colspan: 8 }, 'Nobody is listed yet.'))));
  }
  const listPanel = () => h('div', {},
    h('div', { class: 'cm-pad', style: { display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' } },
      h('span', { class: 'cm-s' }, 'View'), select(VIEWS, lf.view, (v) => { lf.view = v; draw(); }, { class: 'cm-sel cm-grey' }),
      h('span', { class: 'cm-s' }, 'Sort By'), select(LSORT, lf.sort, (v) => { lf.sort = v; draw(); }, { class: 'cm-sel cm-grey' }),
      h('span', { class: 'cm-s' }, 'Show'), select(LPOS, lf.pos, (v) => { lf.pos = v; draw(); }, { class: 'cm-sel cm-grey' })),
    h('div', { class: 'cm-tblwrap' }, lists()));

  const openDeals = new Set(); // offers and talks opened out to their full detail
  /** Everything happening on each of your players: every club's offer and every negotiation you have going, together. */
  function offers() {
    const m = market(), all = m.offers.filter((o) => o.status === 'open'), old = m.offers.filter((o) => o.status !== 'open').slice(-6).reverse();
    const mineIds = (ids) => ids.filter((id) => P(id)?.orgId === game.orgId);
    const names = (ids) => ids.map((i) => fullName(P(i))).join(', ');
    const val = (ids) => ids.reduce((a, i) => a + (worth(game.orgId, P(i)) ?? 0), 0);
    // one board per player of yours: offers from clubs, and talks you have started about him
    const board = new Map();
    const slot = (id) => { if (!board.has(id)) board.set(id, []); return board.get(id); };
    for (const o of all) { const t = mineIds(o.want); if (t.length) slot(t[0]).push({ kind: 'offer', o, org: o.from, send: o.send, want: o.want }); }
    for (const [deal, tk] of Object.entries(m.talks || {})) {
      const org = orgOf(deal);
      // a reply that turned the offer down, or a counter left unanswered for days, is finished business
      const lr = tk.log?.at(-1), fresh = lr?.status === 'counter' && lr.at != null && dayNo(game.date) - lr.at <= 5;
      if (!tk.pending && !tk.agreed && !fresh) continue;
      const d = tk.pending?.offer || tk.last; if (!d) continue;
      const t = mineIds(d.give || []); if (!t.length) continue;
      slot(t[0]).push({ kind: 'talk', tk, org, deal, send: d.get || [], want: d.give });
    }
    const rows = [...board.entries()].sort((x, y) => y[1].length - x[1].length);
    const focused = focus != null ? rows.find(([, list]) => list.some((e) => e.o?.id === focus)) : null;
    const shown = focused ? [focused] : rows;
    const status = (e) => {
      if (e.kind === 'offer') return [h('span', { class: 'cm-y' }, 'Offer to you'), h('span', { class: 'cm-s' }, ` open until ${dateWords(fromDayNo(e.o.expires))}`)];
      const tk = e.tk, r = tk.log?.at(-1);
      if (tk.agreed) return h('span', { class: 'cm-g' }, 'Deal agreed: confirm it');
      if (tk.pending) return [h('span', { class: 'cm-y' }, tk.pending.ask ? 'You asked their price' : 'Your offer is with them'), h('span', { class: 'cm-s' }, ` ${waitingText(tk.pending.due)}`)];
      if (r) return [h('span', { class: r.status === 'ok' || r.status === 'accept' ? 'cm-g' : 'cm-r' }, 'They replied'), h('span', { class: 'cm-s' }, `: ${String(r.text || '').replace(/\*\*/g, '').slice(0, 70)}`)];
      return h('span', { class: 'cm-s' }, 'Talks open');
    };
    const block = ([pid, list]) => {
      const p = P(pid), price = worth(game.orgId, p);
      const sorted = list.slice().sort((x, y) => val(y.send) - val(x.send));
      return h('div', { class: 'of-block' },
        h('div', { class: 'of-head' }, plink(p), h('span', { class: 'cm-s' }, ` ${mainPos(p)}, age ${p.age}, ${p.level}`), price != null ? h('span', { class: 'cm-s' }, `  Worth to you ${money(price)}`) : null,
          h('b', { class: 'of-count' }, `${list.length} ${list.length === 1 ? 'club' : 'clubs'} in`)),
        h('div', { class: 'of-cards' }, sorted.map((e) => {
          const key = `${pid}-${e.kind}-${e.deal || e.org}`, open = openDeals.has(key);
          const act = e.kind === 'offer'
            ? [h('button', { class: 'cm-btn go', onClick: async () => { const { confirmOffer } = await import('./confirm-deal.js'); if (!(await confirmOffer(e.o.id))) return; const er = acceptOffer(e.o.id); toast(er || 'The trade is done.'); draw(); } }, 'Accept'),
              h('button', { class: 'cm-btn', onClick: () => open_('offer', offerAsMine(e.o.id)) }, 'Counter'),
              h('button', { class: 'cm-btn', onClick: () => { declineOffer(e.o.id); draw(); } }, 'Decline')]
            : [h('button', { class: 'cm-btn', onClick: () => open_('talks', { with: e.deal || e.org, give: [], get: [] }) }, 'Open talks')];
          return h('div', { class: `of-card${open ? ' open' : ''}${e.kind === 'offer' ? ' offer' : ''}` },
            h('div', { class: 'of-top' }, h('b', { class: 'of-club' }, clink(e.org, city(e.org))), e.send.length ? h('span', { class: `of-val${val(e.send) < 0 ? ' neg' : ''}`, title: 'What the players they send are worth to you' }, h('small', {}, 'Worth to you '), val(e.send) < 0 ? `-${money(-val(e.send))}` : money(val(e.send))) : null),
            h('div', { class: 'of-send' }, h('span', { class: 'of-lab' }, e.kind === 'offer' ? 'Offers' : 'Would send'), ' ',
              e.send.length ? e.send.flatMap((i, k) => [k ? ', ' : '', plink(P(i))]) : h('span', { class: 'cm-s' }, 'nothing yet')),
            h('div', { class: 'of-status' }, status(e)),
            h('div', { class: 'of-btns' }, act, h('button', { class: 'cm-btn', onClick: () => { open ? openDeals.delete(key) : openDeals.add(key); draw(); } }, open ? 'Less' : 'Details')),
            open ? h('div', { class: 'of-detail' }, e.send.length ? [dealSummary(e.send, 'They offer'), dealSummary(e.want, 'They want'), e.kind === 'offer' ? payrollEffect(offerAsMine(e.o.id)) : null] : h('p', { class: 'cm-s cm-empty' }, 'No players named yet.')) : null);
        })));
    };
    return h('div', {},
      focused && rows.length > 1 ? h('div', { class: 'cm-pad' }, h('button', { class: 'cm-btn', onClick: () => { focus = null; draw(); } }, `See all ${rows.length} players`)) : null,
      shown.length ? shown.map(block) : h('p', { class: 'cm-s cm-pad cm-empty' }, 'No offers or talks at the moment. List a player from his profile, and clubs will make you offers.'),
      old.length ? [h('div', { class: 'cm-h' }, 'Earlier'), old.map((o) => h('p', { class: 'cm-s cm-pad' }, `${city(o.from)} offer ${o.send.map((i) => fullName(P(i))).join(' and ')} for ${o.want.map((i) => fullName(P(i))).join(' and ')} (${o.status}).`))] : null);
  }

  function waiver() {
    const rows = [];
    for (const o of game.world.orgs.values()) for (const [id, day] of orgState(o.id).dfa) { const p = P(id); if (p && o.id !== game.orgId) rows.push({ p, o, day }); }
    const claims = (game.claims ||= {});
    const me = game.world.orgs.get(game.orgId), forty = counts(me, orgState()).forty, full = forty >= 40;
    const now = dayNo(game.date);
    const order = waiverOrder();
    const place = (ownerId) => order.filter((x) => x !== ownerId).indexOf(game.orgId) + 1;
    const mineCount = rows.filter(({ p }) => claims[p.id]).length;
    return h('div', {},
      h('p', { class: 'cm-s cm-pad' }, 'A player designated for assignment waits seven days. In that time any club can claim him, the club with the worst record getting the first call. A claim takes over his contract and puts him on your 40-man roster. If nobody claims him he goes to Triple-A, or becomes a free agent if he has three years of service and would rather leave.'),
      h('p', { class: 'cm-s cm-pad' }, `Your 40-man roster has ${forty} of 40 spots used${full ? ': it is full, so make a spot before you claim anyone' : `, so you can claim ${40 - forty} more`}. ${mineCount ? `You have ${mineCount} claim${mineCount === 1 ? '' : 's'} in. You will hear the result either way, and a claim costs you nothing if another club is ahead of you.` : 'Press Claim on a player to put a claim in; you can withdraw it any time before he is decided.'}`),
      h('table', { class: 'cm-tbl' },
        h('thead', {}, h('tr', {}, ['Player', 'Club', 'Pos', 'Age', 'Pay', 'Value', 'Decided', 'Your place', ''].map((c, i) => h('th', { class: i < 2 ? 'l' : '' }, c)))),
        h('tbody', {}, rows.length ? rows.sort((a, b) => value(b.p) - value(a.p)).map(({ p, o, day }) => {
          const left = Math.max(0, 7 - (now - day));
          const pl = place(o.id);
          return h('tr', { class: claims[p.id] ? 'sel' : '' }, h('td', { class: 'l' }, plink(p)), h('td', { class: 'l' }, o.club.city), h('td', {}, mainPos(p)), h('td', {}, p.age),
            h('td', {}, salaryFor(p, game.year) != null ? money(salaryFor(p, game.year)) : ''), h('td', { class: 'y' }, worthText(p)),
            h('td', {}, left <= 0 ? 'today' : `${left} day${left === 1 ? '' : 's'}`), h('td', {}, `${pl} of ${order.length - 1}`),
            h('td', {}, claims[p.id] ? h('button', { class: 'cm-btn', onClick: () => { delete claims[p.id]; toast(`Claim for ${fullName(p)} withdrawn.`); draw(); } }, 'Withdraw claim')
              : h('button', { class: 'cm-btn', disabled: !!noMoney(), title: noMoney() || (full ? 'Your 40-man roster is full: you will be asked who comes off.' : `Claim ${fullName(p)}`), onClick: async () => { if (full && !(await fortyRoom(me, orgState(), p, 'for the claim'))) return draw(); claims[p.id] = true; toast(`You have put in a claim for ${fullName(p)}. You will hear the result when waivers are decided.`); draw(); } }, 'Claim')));
        })
          : h('tr', {}, h('td', { class: 'l cm-s', colspan: 9 }, 'Nobody is on waivers.')))));
  }

  function shortlist() {
    const ids = [...(game.shortlist || [])].map(P).filter(Boolean);
    const news = (p) => game.inbox.filter((m) => m.player === p.id).slice(-1)[0];
    return h('div', {}, h('p', { class: 'cm-s cm-pad' }, 'Players you follow. You are told when one of them is listed, close to signing, traded or signs. Add players from their profile.'),
      h('table', { class: 'cm-tbl' },
        h('thead', {}, h('tr', {}, ['Player', 'Club', 'Pos', 'Age', 'Value', 'Latest', ''].map((c, i) => h('th', { class: i === 0 || i === 1 || i === 5 ? 'l' : '' }, c)))),
        h('tbody', {}, ids.length ? ids.map((p) => h('tr', {}, h('td', { class: 'l' }, plink(p)), h('td', { class: 'l' }, p.orgId ? city(p.orgId) : 'Free agent'), h('td', {}, mainPos(p)), h('td', {}, p.age), h('td', { class: 'y' }, worthText(p)),
          h('td', { class: 'l cm-s' }, news(p)?.title || ''),
          h('td', {}, h('button', { class: 'cm-btn', onClick: () => { game.shortlist.delete(p.id); draw(); } }, 'Remove'))))
          : h('tr', {}, h('td', { class: 'l cm-s', colspan: 7 }, 'Your shortlist is empty.')))));
  }

  function log() {
    const rows = market().done.slice(-40).reverse();
    return h('table', { class: 'cm-tbl' }, h('thead', {}, h('tr', {}, ['Date', 'Clubs', 'Moved'].map((c, i) => h('th', { class: 'l' }, c)))),
      h('tbody', {}, rows.length ? rows.map((t) => h('tr', { class: t.a === game.orgId || t.b === game.orgId ? 'sel' : '' }, h('td', { class: 'l' }, new Date(t.date).toLocaleDateString('en-GB')), h('td', { class: 'l' }, `${city(t.a)} and ${city(t.b)}`),
        h('td', { class: 'l' }, `${t.give.map((i) => fullName(P(i))).join(', ') || 'cash'} for ${t.get.map((i) => fullName(P(i))).join(', ') || 'cash'}`)))
        : h('tr', {}, h('td', { class: 'l cm-s', colspan: 3 }, 'No trades yet.'))));
  }

  function rumours() {
    const T = tally(), items = book().items.filter((x) => !x.leak || x.state).slice(-30).reverse();
    const word = { open: 'Still to be proved', hit: 'Proved right', miss: 'Proved wrong' };
    return h('div', {},
      h('p', { class: 'cm-s cm-pad' }, 'Stories in the news about who might move. Some come from deals clubs really are working on and some are nothing more than talk. Each outlet\'s record below is how its stories turned out, so you can learn whom to believe.'),
      h('table', { class: 'cm-tbl' }, h('thead', {}, h('tr', {}, ['Outlet', 'Right', 'Wrong', 'Open', 'Record', 'Reputation'].map((c, i) => h('th', { class: i === 0 || i === 5 ? 'l' : '' }, c)))),
        h('tbody', {}, Object.entries(OUTLETS).map(([k, o]) => { const r = T[k], n = r.right + r.wrong; return h('tr', {}, h('td', { class: 'l' }, o.name), h('td', {}, r.right), h('td', {}, r.wrong), h('td', {}, r.open),
          h('td', { class: 'y' }, n >= 3 ? `${Math.round(100 * r.right / n)}%` : 'too soon to say'), h('td', { class: 'l cm-s' }, o.note)); }))),
      h('div', { class: 'cm-h' }, 'Recent stories'),
      h('table', { class: 'cm-tbl' }, h('tbody', {}, items.length ? items.map((x) => h('tr', {}, h('td', { class: 'l cm-s' }, fromDayNo(x.day).toLocaleDateString('en-GB')), h('td', { class: 'l' }, OUTLETS[x.outlet].short), h('td', { class: 'l' }, x.text),
        h('td', { class: x.state === 'hit' ? 'cm-g' : x.state === 'miss' ? 'cm-r' : 'cm-s' }, word[x.state])))
        : h('tr', {}, h('td', { class: 'l cm-s' }, 'No stories yet. They start once trades are open.')))));
  }

  const budgetBox = h('span', { class: 'act cm-s', style: { fontSize: '14px', textAlign: 'right', lineHeight: '1.2' } });
  function budgetNow() {
    const left = budget(game.orgId, game.year) - expected(game.orgId, game.year);
    fill(budgetBox, 'Transfer budget ', h('b', { class: left < 780000 ? 'cm-r' : 'y' }, left < 0 ? `${money(-left)} over` : money(left)));
  }

  function draw() {
    budgetNow();
    fill(tabs, TABS.map(([k, l]) => h('button', { class: 'cm-tab', role: 'tab', 'aria-selected': String(tab === k), onClick: () => { tab = k; draw(); } }, l)),
      h('button', { class: 'cm-btn new-offer', onClick: () => open('offer', {}) }, 'New offer'));
    fill(area, ['offers', 'list', 'log', 'rumours'].includes(tab) ? h('p', { class: 'cm-s cm-pad' }, windowText()) : null, h('div', { class: 'tx-body' }, tab === 'rumours' ? rumours() : tab === 'offers' ? offers() : tab === 'log' ? log() : tab === 'waiver' ? waiver() : tab === 'rule5' ? rule5Panel(draw) : tab === 'short' ? shortlist() : tab === 'fa' ? freeAgentsPanel() : tab === 'intl' ? intlPanel() : tab === 'draft' ? draftPanel() : tab === 'drafted' ? draftedPanel() : tab === 'moves' ? movesPanel() : listPanel()));
  }
  draw();
  return {
    el: h('div', { style: { display: 'contents' } }, clubTitle(game.world.orgs.get(game.orgId).club, 'Transfers', budgetBox), tabs, area),
    side: () => clubMenu('transfers'),
    onShow: draw,
  };
}
