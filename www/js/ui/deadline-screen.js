// Deadline day. Continue stops here on the morning of the trade deadline. The clock runs from nine to four while
// the assistant talks about the club (where it is thin, whose contracts run out, who is selling), the other clubs
// make their deals and may ring you, and you can open the trade screen at any time. Leave whenever you like: the
// day is then played out when you press Continue.
import { h, fill, toast } from './dom.js';
import { nav } from './nav.js';
import { clubMenu } from './menu.js';
import { game } from '../state.js';
import { Rng } from '../core/rng.js';
import { fullName } from '../data/world.js';
import { clubPicture } from '../season/deadline.js';
import { deadlineTick, market, acceptOffer, declineOffer } from '../season/trade.js';

const START = 9 * 60, END = 16 * 60, STEP = 10;
const clock = (t) => `${((Math.floor(t / 60) + 11) % 12) + 1}:${String(t % 60).padStart(2, '0')} ${t >= 720 ? 'PM' : 'AM'}`;
const city = (id) => game.world.clubs.get(id)?.city ?? id;
const nm = (ids) => ids.map((id) => game.world.players.get(id)).filter(Boolean).map(fullName).join(', ') || 'cash';
const names = (l) => l.map((x) => `${fullName(x.p || x)}${x.pos ? ` (${x.pos}, rated ${x.v})` : ''}`).join(', ');

function room() {
  if (game.dl && game.dl.year === game.year) return game.dl;
  return (game.dl = { year: game.year, t: START, lines: [], paused: false, speed: 1, said: {}, seenDone: market().done.length, seenOffers: new Set(market().offers.map((o) => o.id)), tradesToday: 0 });
}

export function deadlineScreen() {
  const D = room();
  let timer = null;
  const feed = h('div', { class: 'dl-feed' });
  const head = h('div', {});
  const btns = h('div', { class: 'cm-pad btnrow' });
  const say = (text, kind = 'assistant', extra = {}) => { D.lines.push({ t: D.t, text, kind, ...extra }); };

  // what the assistant has to say, and when
  const SCRIPT = {
    [START]: () => {
      const c = clubPicture();
      say(`Good morning. It is deadline day: trades close at ${clock(END)} and nobody can make one again until the World Series is over. ${c.stand}`);
      say(`${c.buyers} clubs are pushing for the playoffs and will pay for help. Open the trade screen whenever you like; I will keep talking while the clock runs.`);
    },
    [START + 30]: () => {
      const c = clubPicture();
      say(c.weak.length ? `Where you are thinnest among the regulars: ${names(c.weak)}. If you want an upgrade, those are the places to look.` : 'Your regulars all look solid, so there is no obvious hole to fill.');
    },
    [START + 90]: () => {
      const c = clubPicture();
      say(c.exp.length ? `Contracts that run out at the end of the year: ${names(c.exp)}. ${c.inPo ? 'They are part of the run, so only move them for a clear upgrade.' : 'With the club outside the places, this is the last chance to get something for them.'}` : 'Nobody important is on an expiring contract, so nothing here is going to walk away for nothing.');
    },
    [START + 150]: () => {
      const c = clubPicture();
      say(c.sell.length ? `Clubs that are selling have: ${names(c.sell)}. Those are the clubs that will listen to offers.` : 'There are not many sellers with anything worth having.');
    },
    [START + 240]: () => say(`Halfway through the day. ${D.tradesToday ? `${D.tradesToday} ${D.tradesToday === 1 ? 'trade has' : 'trades have'} been made so far.` : 'No trades yet.'} ${clubPicture().stand}`),
    [START + 330]: () => say(`One hour to the deadline. ${market().offers.some((o) => o.status === 'open') ? 'You still have offers waiting for an answer.' : 'Nothing is waiting on you.'}`),
    [START + 405]: () => say('Fifteen minutes. Anything you want done has to be agreed now.'),
  };

  function tick() {
    if (D.t >= END) return;
    D.t += STEP;
    SCRIPT[D.t]?.();
    if (D.t < END) deadlineTick(new Rng(`dl-${game.year}-${D.t}-${game.orgId}`));
    // news: trades the other clubs made, and calls to you
    const m = market();
    for (const x of m.done.slice(D.seenDone)) {
      D.tradesToday++;
      if (x.a !== game.orgId && x.b !== game.orgId) say(`${city(x.a)} and ${city(x.b)} have made a trade: ${nm(x.give)} for ${nm(x.get)}.`, 'news');
    }
    D.seenDone = m.done.length;
    for (const o of m.offers) if (o.status === 'open' && !D.seenOffers.has(o.id)) { D.seenOffers.add(o.id); say(`${city(o.from)} are on the phone: they would send ${nm(o.send)} for ${nm(o.want)}.`, 'offer', { offer: o.id }); }
    if (D.t >= END) {
      say('It is four o\'clock and the deadline has passed. Trades are closed until the World Series is over. Press Continue when you are ready to play on.');
      stop();
    }
    draw();
  }
  function start() { stop(); if (D.t < END && !D.paused) timer = setInterval(tick, 1300 / D.speed); }
  function stop() { if (timer) { clearInterval(timer); timer = null; } }

  function lineEl(l) {
    const o = l.offer ? market().offers.find((x) => x.id === l.offer) : null;
    return h('div', { class: `dl-line ${l.kind}` }, h('span', { class: 'ts' }, clock(l.t)),
      h('div', { class: 'tx' }, l.text,
        l.offer ? (o?.status === 'open'
          ? h('div', { class: 'btnrow' },
            h('button', { class: 'cm-btn go', onClick: async () => { const { confirmOffer } = await import('./confirm-deal.js'); if (!(await confirmOffer(o.id))) return; const e = acceptOffer(o.id); if (e) toast(e); draw(); } }, 'Accept'),
            h('button', { class: 'cm-btn', onClick: () => { declineOffer(o.id); draw(); } }, 'Decline'),
            h('button', { class: 'cm-btn', onClick: async () => nav.push((await import('./trade-screen.js')).tradeScreen({ with: o.from, give: o.want, get: o.send })) }, 'Talk about it'))
          : h('div', { class: 'cm-s' }, o ? `This offer was ${o.status}.` : '')) : null));
  }

  function draw() {
    const done = D.t >= END;
    const pct = Math.round(((D.t - START) / (END - START)) * 100);
    fill(head, h('div', { class: 'dl-clock' }, h('span', { class: 't' }, clock(D.t)), h('span', { class: 'cm-s' }, done ? 'The deadline has passed.' : `Trades close at ${clock(END)}`)), h('div', { class: 'dl-bar' }, h('div', { style: { width: `${pct}%` } })));
    fill(feed, [...D.lines].reverse().map(lineEl));
    fill(btns,
      h('button', { class: 'cm-btn go', disabled: done, onClick: async () => nav.push((await import('./trade-screen.js')).tradeScreen()) }, 'Trade screen'),
      h('button', { class: 'cm-btn', disabled: done, onClick: () => { D.paused = !D.paused; D.paused ? stop() : start(); draw(); } }, D.paused ? 'Resume the clock' : 'Pause the clock'),
      h('button', { class: 'cm-btn', disabled: done, onClick: () => { D.speed = D.speed === 1 ? 2 : D.speed === 2 ? 4 : 1; start(); draw(); } }, `Speed ${D.speed}x`),
      h('button', { class: 'cm-btn', disabled: done, onClick: () => { stop(); let g = 0; while (D.t < END && g++ < 60) tick(); } }, 'Skip to the deadline'),
      h('button', { class: 'cm-btn', onClick: async () => nav.push((await import('./squad-screen.js')).squadScreen(game.orgId)) }, 'Squad'),
      h('button', { class: 'cm-btn', onClick: () => nav.back() }, done ? 'Back to the inbox' : 'Leave for now'));
  }

  if (!D.lines.length) SCRIPT[START]();
  draw();
  start();
  return {
    el: h('div', { style: { display: 'contents' } }, h('div', { class: 'cm-title' }, 'Trade Deadline Day'), head, btns, feed),
    side: () => clubMenu(null),
    onHide: stop,
    onShow: () => { draw(); start(); },
  };
}
