// The offer screen: pick a club, choose who goes each way, see what it does to your books, and put it to the
// general manager. He answers accept, counter or no, and a counter can be taken as your next offer.
import { linkify } from './linkify.js';
import { lastLine } from './deal-summary.js';
import { gmOf, gmWords, gmView } from '../season/gms.js';
import { h, fill, toast, holdable } from './dom.js';
import { counterAdds } from './confirm-deal.js';
import { nav } from './nav.js';
import { clubTitle, plink, select } from './club-ui.js';
import { keyAttrs } from './attr-ui.js';
import { clubMenu } from './menu.js';
import { mainPos, money, isPitcher, fullName, salaryIn } from '../data/world.js';
import { game, orgState } from '../state.js';
import { value } from '../season/value.js';
import { concludeTrade, worthText, rulesCheck, execute, announceUser, impact, advice, windowText, windowOpen, blocked, salaryFor, plan } from '../season/trade.js';
import { taxFor, cbtLine } from '../season/finance.js';
import { requestScouting } from '../season/scouting.js';
import { picksOf, pickValue, pickLabel, pickWorthText } from '../season/picks.js';
import { talksWith, sendTrade, waitingText, closeTradeTalks, standingCounter, orgOf, busyDeal, freeDeal, dealsWith, dealName } from '../season/replies.js';

const SORTS = [['value', 'Ability'], ['age', 'Age'], ['name', 'Name'], ['pos', 'Position'], ['pay', 'Salary']];
const SHOW = [['mlb', 'Major leaguers'], ['min', 'Minor leaguers'], ['all', 'Everyone']];
const POSN = [['all', 'All positions'], ['P', 'Pitchers'], ['H', 'Hitters']];
const LV = { MLB: 'Majors', AAA: 'AAA', AA: 'AA', 'A+': 'High-A', A: 'A', R: 'Rookie' };
const org = (id) => game.world.orgs.get(id);

/** @param {{with?:string, give?:string[], get?:string[], cash?:number}} [start] */
export function tradeScreen(start = {}) {
  const others = game.world.mlb.filter((c) => c.org !== game.orgId);
  // the deal: a club's first one is under its code, a separate one with the same club under "TB#2" (the news passes the key)
  const startOrg = start.with ? orgOf(start.with) : others[0].org;
  let deal = start.deal || (start.with && start.with.includes('#') ? start.with : startOrg);
  // a new deal asked for from a player's page or a list, while talks with that club are busy with another: a separate deal
  const fresh = !!(start.give?.length || start.get?.length);
  if (fresh && busyDeal(deal)) {
    const tk0 = talksWith(deal), cur = tk0.agreed?.offer || tk0.pending?.offer || standingCounter(deal)?.offer;
    const sameAs = (a = [], b = []) => a.length === b.length && a.every((x) => b.includes(x));
    if (!cur || !(sameAs(start.get || [], cur.get) && sameAs(start.give || [], cur.give))) deal = freeDeal(startOrg);
  }
  const t = { with: startOrg, give: new Set(start.give || []), get: new Set(start.get || []), givePicks: new Set(start.givePicks || []), getPicks: new Set(start.getPicks || []), cash: start.cash || 0, ptbnl: start.ptbnl || null };
  const ui = { pick: null, sel: null, sortG: 'value', sortY: 'value', showG: 'mlb', showY: 'mlb', posG: 'all', posY: 'all' };
  const talks = () => talksWith(deal);
  const log = () => talks().log;
  const agreedNow = () => talks().agreed?.offer || null;
  // reopening talks that are in progress: the agreed deal, or the last draft, comes back
  if (!start.give?.length && !start.get?.length && agreedNow()) { const a = agreedNow(); t.give = new Set(a.give); t.get = new Set(a.get); t.givePicks = new Set(a.givePicks || []); t.getPicks = new Set(a.getPicks || []); t.cash = a.cash || 0; t.ptbnl = a.ptbnl || null; }
  else if (!start.give?.length && !start.get?.length && talks().last) { const a = talks().last; t.give = new Set(a.give); t.get = new Set(a.get); t.givePicks = new Set(a.givePicks || []); t.getPicks = new Set(a.getPicks || []); t.cash = a.cash || 0; t.ptbnl = a.ptbnl || null; }
  let agreed = agreedNow();
  const body = h('div', { style: { display: 'contents' } });
  const offer = () => ({ with: t.with, deal, give: [...t.give], get: [...t.get], givePicks: [...t.givePicks], getPicks: [...t.getPicks], cash: t.cash, ptbnl: t.ptbnl ? { ...t.ptbnl } : undefined });
  const touch = () => draw();

  const order = (k) => ({
    value: (a, b) => value(b) - value(a), age: (a, b) => a.age - b.age, name: (a, b) => `${a.last}${a.first}`.localeCompare(`${b.last}${b.first}`),
    pos: (a, b) => mainPos(a).localeCompare(mainPos(b)) || value(b) - value(a), pay: (a, b) => (salaryFor(b, game.year) ?? 0) - (salaryFor(a, game.year) ?? 0),
  })[k];

  function list(orgId, set, sortKey, showKey, posKey, side) {
    const o = org(orgId);
    let ps = o.players;
    if (showKey === 'mlb') ps = ps.filter((p) => p.level === 'MLB');
    if (showKey === 'min') ps = ps.filter((p) => p.level !== 'MLB');
    if (posKey === 'P') ps = ps.filter(isPitcher); else if (posKey === 'H') ps = ps.filter((p) => !isPitcher(p));
    ps = ps.filter((p) => !set.has(p.id)).sort(order(sortKey)).slice(0, 70);
    // the list keeps its place when it is redrawn or you come back to it; a player whose page you opened is brought into view and chosen
    const wrap = h('div', { class: 'cm-tblwrap tr-pick', onScroll: (e) => { ui.pickTop = e.target.scrollTop; } });
    // a click on a name opens his page: note who it was before the page opens
    wrap.addEventListener('click', (e) => { const tr = e.target.closest?.('tr[data-id]'); if (tr && e.target.closest('.pl, a')) { ui.seen = tr.dataset.id; if (!tr.title) ui.sel = tr.dataset.id; } }, true);
    return fill(wrap, h('table', { class: 'cm-tbl tr-fit' },
      h('thead', {}, h('tr', {}, ['Player', 'Latest season', 'Pay', 'Value'].map((c, i) => h('th', { class: i < 2 ? 'l' : '' }, c)))),
      h('tbody', {}, ps.map((p) => {
        const why = blocked(p, side === 'give' ? t.with : game.orgId);
        return h('tr', { class: ui.sel === p.id ? 'sel' : '', 'data-id': p.id, title: why || '', style: why ? { opacity: 0.5 } : {}, onClick: () => { if (why) { toast(why); return; } ui.sel = p.id; draw(); } },
          h('td', { class: 'l tr-who' }, plink(p), h('span', { class: 'cm-s' }, `  ${mainPos(p)}, ${p.age}, ${LV[p.level] || p.level || ''}`), h('div', {}, keyAttrs(p))), h('td', { class: 'l cm-s' }, lastLine(p)),
          h('td', {}, salaryFor(p, game.year) != null ? money(salaryFor(p, game.year)) : ''), h('td', { class: 'y' }, worthCell(p, touch)));
      }))));
  }

  /** The players already in the deal on one side, each with a short summary and a button to take him out. */
  function chosen(set) {
    const ps = [...set].map((id) => game.world.players.get(id)).filter(Boolean);
    if (!ps.length) return h('p', { class: 'cm-s cm-pad cm-empty' }, 'Nobody yet.');
    return h('div', { class: 'cm-tblwrap' }, h('table', { class: 'cm-tbl' },
      h('tbody', {}, ps.map((p) => {
        const pay = salaryFor(p, game.year);
        return h('tr', {},
          h('td', { class: 'l tr-who' }, plink(p), h('span', { class: 'cm-s' }, `  ${mainPos(p)}, age ${p.age}, ${LV[p.level] || p.level || ''}`),
            h('div', {}, keyAttrs(p)),
            h('div', { class: 'cm-s' }, lastLine(p)),
            h('div', { class: 'cm-s' }, `${pay != null ? money(pay) : 'No major league pay'}${p.contract?.text ? `, ${p.contract.text.replace(/^[^:]*: /, '')}` : ''}`)),
          h('td', { class: 'y tr-val' }, worthCell(p, touch)),
          h('td', {}, h('button', { class: 'cm-btn', 'aria-label': `Remove ${fullName(p)}`, onClick: () => { set.delete(p.id); touch(); } }, 'Remove')));
      }))));
  }

  /** A column of the deal: the chosen players and an Add player button, or the picker when it is open. */
  function column(side, title, set, orgId) {
    const g = side === 'give';
    if (ui.pick === side) {
      return h('div', { class: 'cm-panel' }, h('div', { class: 'cm-h' }, `Add a player: ${g ? 'yours' : org(t.with).club.city}`),
        h('div', { class: 'cm-pad' }, controls(side)), list(orgId, set, g ? ui.sortG : ui.sortY, g ? ui.showG : ui.showY, g ? ui.posG : ui.posY, side),
        h('div', { class: 'cm-pad btnrow' },
          h('button', { class: 'cm-btn go', disabled: !ui.sel, onClick: () => { set.add(ui.sel); ui.sel = null; ui.pick = null; touch(); } }, 'Add to deal'),
          h('button', { class: 'cm-btn', onClick: () => { ui.sel = null; ui.pick = null; draw(); } }, 'Cancel')));
    }
    return h('div', { class: 'cm-panel' }, h('div', { class: 'cm-h' }, title), chosen(set),
      h('div', { class: 'cm-pad btnrow' }, h('button', { class: 'cm-btn go', onClick: () => { ui.pick = side; ui.sel = null; ui.pickTop = 0; draw(); } }, 'Add player'),
        // the cash stepper is one unit that never wraps, so its buttons stay where the finger is
        g ? h('span', { class: 'cash-step' }, h('span', { class: 'cm-s' }, 'Cash'), h('button', { class: 'cm-btn', ...holdable(() => { t.cash -= 500000; touch(); }) }, '−'),
          h('b', { class: 'y cash-val' }, t.cash === 0 ? 'None' : t.cash > 0 ? `You pay ${money(t.cash)}` : `They pay ${money(-t.cash)}`),
          h('button', { class: 'cm-btn', ...holdable(() => { t.cash += 500000; touch(); }) }, '+')) : null));
  }

  const controls = (side) => {
    const g = side === 'give';
    return h('div', { style: { display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' } },
      h('span', { class: 'cm-s' }, 'Sort By'), select(SORTS, g ? ui.sortG : ui.sortY, (v) => { ui[g ? 'sortG' : 'sortY'] = v; draw(); }, { class: 'cm-sel cm-grey' }),
      select(SHOW, g ? ui.showG : ui.showY, (v) => { ui[g ? 'showG' : 'showY'] = v; draw(); }, { class: 'cm-sel cm-grey' }),
      select(POSN, g ? ui.posG : ui.posY, (v) => { ui[g ? 'posG' : 'posY'] = v; draw(); }, { class: 'cm-sel cm-grey' }));
  };

  function send(askOnly = false) {
    if (talks().pending) { toast('You are waiting for their reply.'); return; }
    const o = offer();
    const due = sendTrade(o, askOnly);
    log().push({ you: askOnly ? `What would it take to get ${[...t.get].map((id) => fullName(game.world.players.get(id))).join(', ')}?` : summary(o), status: 'sent', sent: true, sentOn: due, text: `Sent to ${org(t.with).club.city}. ${waitingText(due)}` });
    talks().agreed = null; agreed = null;
    // once the terms are with the other club there is nothing more to do here: back to where you came from (the list or the player), or the news, to wait for the reply
    toast(`${askOnly ? 'Question' : 'Offer'} sent to ${org(t.with).club.city}. ${waitingText(due)}`);
    nav.leave();
  }
  const ask = () => send(true);
  async function conclude() {
    const { confirmTrade } = await import('./confirm-deal.js');
    if (!(await confirmTrade({ with: t.with, deal, ...agreed }))) return;
    const why = concludeTrade(agreed);
    if (why) { toast(why); return; }
    toast('The trade is done.');
    nav.back();
  }
  const side = (ids, picks) => [...ids.map((id) => fullName(game.world.players.get(id))), ...(picks || []).map((k) => pickLabel(k))].join(', ') || 'nobody';
  const summary = (o) => `You send ${side(o.give, o.givePicks)}${o.cash ? (o.cash > 0 ? ` and ${money(o.cash)}` : `, they send ${money(-o.cash)}`) : ''}${o.ptbnl?.dir === 'give' ? `, and a player to be named later worth up to ${money(o.ptbnl.cap)}` : ''}; you get ${side(o.get, o.getPicks)}.`;

  function impactPanel() {
    const o = offer();
    if (!o.give.length && !o.get.length && !o.givePicks.length && !o.getPicks.length) return h('p', { class: 'cm-s cm-pad' }, 'Choose players or picks on either side to see what the deal does to your books.');
    const im = impact(o), probs = rulesCheck(o, game.orgId, { window: false });
    const tax = taxFor(game.orgId, im.rows[0].year, im.rows[0].after);
    return h('div', {},
      h('table', { class: 'cm-tbl info' },
        h('thead', {}, h('tr', {}, ['Payroll', 'Now', 'After the deal', 'Owner\'s budget'].map((c, i) => h('th', { class: i ? '' : 'l' }, c)))),
        h('tbody', {}, im.rows.map((r) => h('tr', {}, h('td', { class: 'l' }, String(r.year)), h('td', {}, money(r.now)), h('td', { class: r.after > r.budget ? 'cm-r' : 'y' }, money(r.after)), h('td', {}, money(r.budget)))),
          h('tr', {}, h('td', { class: 'l cm-s' }, 'Luxury tax'), h('td', { colspan: 3, class: 'l y' }, cbtLine(game.orgId, im.rows[0].year, im.rows[0].after, tax))),
          h('tr', {}, h('td', { class: 'l cm-s' }, '40-man roster after'), h('td', { colspan: 3, class: im.forty > 40 ? 'l cm-r' : 'l y' }, String(im.forty))),
          h('tr', {}, h('td', { class: 'l cm-s' }, 'Years of control'), h('td', { colspan: 3, class: 'l' }, im.control.map((c) => `${fullName(c.p)} ${c.years}`).join(', '))))),
      [...im.holes, ...im.risks, ...probs].length ? h('div', { class: 'cm-pad' }, [...im.holes, ...im.risks, ...probs].map((x) => h('p', { class: 'cm-r' }, x))) : null,
      h('p', { class: 'cm-s cm-pad' }, `Your assistant: ${advice(o) || 'Nothing to say yet.'}`));
  }

  /** Draft picks in the deal: add one of theirs or one of yours from the list, and take it out again with its x. */
  function picksPanel(c) {
    const chips = (set, label) => [...set].map((k) => h('button', { class: 'cm-btn', title: 'Take it out of the deal', onClick: () => { set.delete(k); touch(); } }, `${label(k)} (${pickWorthText(k)}) \u00d7`));
    const adder = (orgId, set, text) => {
      const have = picksOf(orgId, { rounds: 10 }).filter((k) => !set.has(k));
      return select([['', text], ...have.map((k) => [k, `${pickLabel(k, orgId)}, about ${pickWorthText(k)}`])], '', (v) => { if (v) { set.add(v); touch(); } }, { class: 'cm-sel cm-grey' });
    };
    return h('div', { class: 'cm-panel cm-pad', style: { display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' } },
      h('b', { class: 'y' }, 'Draft picks'),
      adder(t.with, t.getPicks, `Ask for a ${c.city} pick`), adder(game.orgId, t.givePicks, 'Add one of your picks'),
      chips(t.getPicks, (k) => `Get: ${pickLabel(k, t.with)}`), chips(t.givePicks, (k) => `Send: ${pickLabel(k, game.orgId)}`),
      !t.getPicks.size && !t.givePicks.size ? h('span', { class: 'cm-s' }, 'Picks from the next three drafts can be traded, rounds 1 to 10. The value shown is a guess from last season\'s record.') : null);
  }

  const CAPS = [500000, 1e6, 2e6, 3e6, 5e6, 8e6, 12e6, 20e6];
  /** A player to be named later: set how much he may be worth, and the club that owes him names him within a few months. */
  function ptPanel(c) {
    const dir = t.ptbnl?.dir || '';
    return h('div', { class: 'cm-panel cm-pad', style: { display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' } },
      h('b', { class: 'y' }, 'Player to be named later'),
      select([['', 'None'], ['get', `${c.city} send me one`], ['give', `I send ${c.city} one`]], dir, (v) => { t.ptbnl = v ? { dir: v, cap: t.ptbnl?.cap || 2e6 } : null; touch(); }, { class: 'cm-sel cm-grey' }),
      t.ptbnl ? [h('span', { class: 'cm-s' }, 'a prospect worth up to'),
        select(CAPS.map((v) => [String(v), money(v)]), String(t.ptbnl.cap), (v) => { t.ptbnl.cap = Number(v); touch(); }, { class: 'cm-sel cm-grey' }),
        h('span', { class: 'cm-s' }, dir === 'get' ? 'They name him from their minor leaguers in one to five months.' : 'Your assistant names him from your minor leaguers in one to five months, and keeps your best.')]
        : h('span', { class: 'cm-s' }, 'Not sure who you want yet? Agree a value now and the name comes later.'));
  }

  /** Switch to another deal with this club, or start a separate one: its own sides, its own talks. */
  function openDeal(k) {
    deal = k;
    const tk = talksWith(k), a = tk.agreed?.offer || tk.last;
    t.give = new Set(a?.give || []); t.get = new Set(a?.get || []); t.givePicks = new Set(a?.givePicks || []); t.getPicks = new Set(a?.getPicks || []); t.cash = a?.cash || 0; t.ptbnl = a?.ptbnl || null;
    agreed = agreedNow(); ui.pick = null;
    draw();
  }
  /** The deals open with this club, when there is more than one or this one is busy: each can be opened, and a separate one started. */
  function dealsBar(c) {
    const keys = dealsWith(t.with);
    if (!keys.some((k) => k !== deal) && !busyDeal(deal)) return null;
    if (!keys.includes(deal)) keys.push(deal);
    const state = (k) => { const tk = talksWith(k); return tk.agreed ? 'agreed' : tk.pending ? 'waiting for a reply' : standingCounter(k) ? 'their proposal stands' : tk.log?.length ? 'talked' : 'new'; };
    const label = (k) => { const tk = talksWith(k), o = tk.agreed?.offer || tk.pending?.offer || tk.last; const who = o?.get?.map((id) => game.world.players.get(id)?.last).filter(Boolean).join(', '); return `${dealName(k) ? dealName(k).replace(/^./, (x) => x.toUpperCase()) : 'First deal'}${who ? `: ${who}` : ''} (${state(k)})`; };
    return h('div', { class: 'cm-panel cm-pad', style: { display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' } },
      h('b', { class: 'y' }, `Deals with ${c.city}`),
      keys.map((k) => h('button', { class: `cm-btn${k === deal ? ' go' : ''}`, 'aria-current': k === deal ? 'true' : null, onClick: () => { if (k !== deal) openDeal(k); } }, label(k))),
      h('button', { class: 'cm-btn', title: 'Talk about other players while this deal is open: it has its own offer and its own reply', onClick: () => openDeal(freeDeal(t.with)) }, 'Start a separate deal'));
  }

  function draw() {
    const c = org(t.with).club;
    // the newest reply answers the deal as it was when you sent it: say so once you have changed the deal since
    const lastSent = talks().last;
    const same = (a, b) => a.size === b.length && b.every((x) => a.has(x));
    const changed = !!lastSent && !agreed && !(same(t.give, lastSent.give) && same(t.get, lastSent.get) && same(t.givePicks, lastSent.givePicks || []) && same(t.getPicks, lastSent.getPicks || []) && (t.cash || 0) === (lastSent.cash || 0));
    const rounds = log().length ? log().slice(-1).map((r, i) => h('div', { class: `neg-say ${r.status}${changed && i === 0 ? ' stale' : ''}` },
      changed && i === 0 ? h('div', { class: 'cm-y', style: { fontWeight: 'bold', paddingBottom: '4px' } }, 'You have changed the deal since this. Their reply below is to the earlier offer: press Make the offer to put the new one to them.') : null, h('div', { class: 'cm-s' }, 'You: ', linkify(r.you)), h('div', {}, linkify(r.text)),
      r.counter && standingCounter(deal) ? h('div', { class: 'btnrow' }, h('button', { class: 'cm-btn go', onClick: async () => { const { acceptCounter } = await import('./confirm-deal.js'); if (await acceptCounter(deal)) nav.leave(); else draw(); } }, (() => { const a = counterAdds(standingCounter(deal).offer, talks().last); return a ? `Add ${a} and complete the trade` : 'Accept their terms and complete the trade'; })())) : null,
      r.counter ? h('button', { class: 'cm-btn', onClick: () => { t.give = new Set(r.counter.give); t.get = new Set(r.counter.get); t.givePicks = new Set(r.counter.givePicks || []); t.getPicks = new Set(r.counter.getPicks || []); t.cash = r.counter.cash || 0; t.ptbnl = r.counter.ptbnl || null; draw(); } }, 'Start from his terms') : null))
      : [h('p', { class: 'cm-s cm-pad cm-empty' }, 'Nothing has been said yet.')];
    fill(body,
      clubTitle(org(game.orgId).club, `Trade with ${c.city}${dealName(deal) ? `: ${dealName(deal)}` : ''}`),
      h('div', { class: 'cm-panel cm-pad', style: { display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' } },
        select(others.map((x) => [x.org, `${x.full ?? `${x.city} ${x.name}`}`]), t.with, (v) => { t.with = v; deal = v; t.get = new Set(); t.getPicks = new Set(); t.ptbnl = null; /* the players you are offering stay in the deal when you change club */ ui.pick = null; agreed = agreedNow(); touch(); }, { class: 'cm-sel cm-grey' }),
        h('span', { class: 'cm-s', title: gmView(t.with) }, `GM ${gmOf(t.with).name}: ${gmWords(t.with)}. ${windowText()} ${c.city} look like ${{ contend: 'contenders', rebuild: 'sellers', middle: 'a club in the middle' }[plan(t.with)]}.`)),
      dealsBar(c),
      h('div', { class: 'tr-two' }, column('get', `You get from ${c.city}`, t.get, t.with), column('give', 'You send', t.give, game.orgId)),
      picksPanel(c),
      ptPanel(c),
      h('div', { class: 'tr-two tr-fill' },
        h('div', { class: 'cm-panel' }, h('div', { class: 'cm-h' }, 'What it does to the books'), impactPanel()),
        h('div', { class: 'cm-panel' }, h('div', { class: 'cm-h' }, 'The talks'), h('div', { class: 'tr-talks' }, rounds),
          h('div', { class: 'cm-pad btnrow' },
            agreed ? h('button', { class: 'cm-btn go big', disabled: !windowOpen(), title: windowOpen() ? '' : 'The deal completes when trades open.', onClick: conclude }, windowOpen() ? 'Confirm the trade' : 'Deal agreed: completes when trades open') : talks().pending ? h('button', { class: 'cm-btn big', disabled: true }, 'Waiting for their reply') : h('button', { class: 'cm-btn go big', disabled: (!t.give.size && !t.get.size && !t.ptbnl && !t.givePicks.size && !t.getPicks.size), onClick: () => send() }, 'Make the offer'),
            t.get.size && !t.give.size && !talks().pending ? h('button', { class: 'cm-btn', onClick: ask }, 'Ask what it would take') : null,
            h('button', { class: 'cm-btn', onClick: () => { closeTradeTalks(deal, `You walked away from the talks with ${org(t.with).club.city}.`); nav.back(); } }, 'Walk away')))));
    const pk = body.querySelector('.tr-pick');
    if (pk) {
      if (ui.seen) {
        const row = pk.querySelector(`tr[data-id="${CSS.escape(ui.seen)}"]`);
        ui.seen = null;
        if (row) requestAnimationFrame(() => { row.scrollIntoView({ block: 'center' }); ui.pickTop = pk.scrollTop; });
      } else pk.scrollTop = ui.pickTop || 0;
    }
  }

  draw();
  return { el: body, side: () => clubMenu('transfers'), onShow: draw };
}

/** The scouts' view of a player, or a button that sends one to look (a look takes a day, before the club replies). */
function worthCell(p, touch) {
  const w = worthText(p);
  if (w !== '?') return w;
  return h('button', { class: 'cm-btn', title: 'Send a scout: the report comes the next day', onClick: (e) => { e.stopPropagation(); toast(requestScouting(p)); touch?.(); } }, 'Scout');
}
