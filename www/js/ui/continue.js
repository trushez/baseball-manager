// The Continue button: runs the season forward at a watchable pace, with the news arriving as
// newspaper headlines, until something needs you or you press Stop. Then it opens whatever made it stop
// and says why.
import { h, fill, toast } from './dom.js';
import { nav } from './nav.js';
import { game, longDate, holiday, orgState } from '../state.js';
import { divisions } from '../season/standings.js';
import { dayNo } from '../season/calendar.js';
import { continueGame } from '../season/advance.js';
import { lastId } from '../season/inbox.js';
import { holidaySnap, holidayReport } from '../season/holiday-report.js';
import { autosave } from '../save.js';
import { reportError } from './errors.js';

let running = false;
const PACES = [['fast', 'Fast'], ['normal', 'Normal'], ['slow', 'Slow']];
/** How long a day stays on the bar of an ordinary Continue. */
const DAY_MS = { fast: 60, normal: 140, slow: 320 };

/** The fast-forward screen: the date, the headlines as they come, and where your club stands, until something needs you. */
function overlay(onStop, away = false) {
  const start = game.headSeq || 0;
  const date = h('div', { class: 'ff-date' }, longDate());
  const list = h('div', { class: 'ff-news' });
  const side = h('div', { class: 'ff-side' });
  const paceRow = h('span', { class: 'pace' });
  const drawPace = () => fill(paceRow, h('span', { class: 'cm-s' }, 'Pace '), PACES.map(([k, l]) => h('button', {
    class: `cm-btn${(game.settings.pace || 'normal') === k ? ' go' : ''}`, onClick: (e) => { e.stopPropagation(); game.settings.pace = k; drawPace(); },
  }, l)));
  drawPace();
  const stopBtn = h('button', { class: 'cm-btn big', onClick: (e) => { e.stopPropagation(); stop(); } }, away ? 'Come back' : 'Stop');
  const box = h('div', { class: 'busy ff', role: 'dialog', 'aria-label': 'Continuing' },
    h('div', { class: 'ff-panel' },
      h('div', { class: 'ff-head' }, h('span', { class: 'ff-title' }, away ? 'On holiday' : 'Around the Majors'), date),
      h('div', { class: 'ff-body' }, list, side),
      h('div', { class: 'ff-foot' }, away ? h('span', {}) : paceRow, h('span', { class: 'cm-s hint' }, away ? 'Your assistant is running the club. Press any key to come back' : 'Press any key to stop'), stopBtn)));
  const key = (e) => { if (!e.repeat) stop(); };
  function stop() { onStop(); fill(stopBtn, away ? 'Coming back...' : 'Stopping...'); }
  document.addEventListener('keydown', key);
  document.body.append(box);
  let shownNews = null;

  /** Where your club stands today, as a short card. */
  function standing() {
    const club = game.world.orgs.get(game.orgId)?.club;
    const rows = [];
    try {
      if (game.phase === 'offseason' && game.winter?.on) {
        rows.push(['Winter', game.winter.open ? 'Free agency is open' : 'Free agents are with their clubs']);
      } else if (game.season && (game.phase === 'regular' || game.phase === 'post')) {
        const R = game.season.records.get(game.orgId);
        if (R) {
          rows.push(['Record', `${R.w}-${R.l}`]);
          const [div, ids] = [...divisions().entries()].find(([, v]) => v.includes(game.orgId)) || [];
          if (ids) {
            const place = ids.indexOf(game.orgId) + 1;
            const lead = game.season.records.get(ids[0]);
            const behind = place === 1 ? 0 : ((lead.w - R.w) + (R.l - lead.l)) / 2;
            rows.push(['Division', `${['', '1st', '2nd', '3rd', '4th', '5th'][place]} in the ${div.replace('American League', 'AL').replace('National League', 'NL')}`]);
            rows.push(['Games back', place === 1 ? 'Leading' : behind % 1 ? behind.toFixed(1) : String(behind)]);
          }
          const today = dayNo(game.date);
          const nx = game.season.games.find((g) => g.level === 'MLB' && !g.post && !g.s && g.d >= today && (g.home === game.orgId || g.away === game.orgId));
          if (nx) { const opp = game.world.clubs.get(nx.home === game.orgId ? nx.away : nx.home); rows.push(['Next', `${nx.home === game.orgId ? 'v' : 'at'} ${opp?.city ?? ''}`]); }
        }
      } else if (game.phase === 'spring') rows.push(['Spring Training', 'Camp is open']);
    } catch (e) { /* the card is a courtesy */ }
    const R = game.season?.records?.get(game.orgId);
    const played = R && game.phase === 'regular' ? Math.min(1, (R.w + R.l) / 162) : null;
    return [
      h('div', { class: 'ff-club' }, h('span', { class: 'swatch', style: { background: club?.kitA, borderColor: club?.kitB } }), club ? (club.full ?? `${club.city} ${club.name}`) : ''),
      h('table', { class: 'ff-tbl' }, h('tbody', {}, rows.map(([k, v]) => h('tr', {}, h('td', { class: 'cm-s' }, k), h('td', { class: 'y' }, v))))),
      played != null ? h('div', { class: 'ff-bar', title: 'Share of the 162-game season played' }, h('div', { style: { width: `${Math.round(played * 100)}%` } })) : null,
      played != null ? h('div', { class: 'cm-s ff-barnote' }, `${Math.round(played * 100)}% of the season played`) : null,
    ];
  }
  return {
    set(d) {
      fill(date, longDate(d));
      const fresh = (game.headlines || []).filter((x) => x.n > start);
      // the same story told twice ("Smith traded" and "SMITH TRADED TO THE METS"): keep the fuller one
      const items = fresh.filter((x) => !fresh.some((y) => y !== x && y.text.length > x.text.length && y.text.toLowerCase().startsWith(x.text.toLowerCase()))).slice(away ? -10 : -6).reverse();
      // drawn again only when a story arrives, so the top one comes in once and does not flash every day
      const key = items.map((x) => x.n).join(',');
      if (key !== shownNews) {
        shownNews = key;
        fill(list, items.length ? items.map((x, i) => h('div', { class: `ff-item${x.mine ? ' mine' : ''}${i === 0 ? ' fresh' : ''}` }, x.text))
          : h('div', { class: 'ff-item quiet' }, 'A quiet day around the league.'));
      }
      const card = h('div', {}, standing());
      if (card.textContent !== side.textContent) fill(side, [...card.childNodes]);
    },
    close() { document.removeEventListener('keydown', key); box.remove(); },
  };
}

/** An ordinary Continue: a short bar that fills as the days go by, your results and the big stories of the day under it. */
function processBar(onStop, o = {}) {
  const startHead = game.headSeq || 0;
  const today0 = dayNo(game.date);
  // how far it is likely to run: to the date asked for, else to your next game; in the winter nobody knows, so the bar eases towards the end
  let goal = 0;
  try {
    if (o.until) goal = Math.max(1, dayNo(o.until) - today0);
    else if (game.season && game.phase !== 'offseason') {
      const nx = game.season.games.find((g) => g.level === 'MLB' && !g.s && g.d > today0 && (g.home === game.orgId || g.away === game.orgId));
      if (nx) goal = Math.max(1, nx.d - today0);
    }
  } catch { /* the bar only guesses */ }
  const date = h('div', { class: 'pb-date' }, longDate());
  const fillEl = h('div', { class: 'pb-fill' });
  const feed = h('div', { class: 'pb-feed' });
  const stopBtn = h('button', { class: 'cm-btn', onClick: (e) => { e.stopPropagation(); stop(); } }, 'Stop');
  const box = h('div', { class: 'pb-back', role: 'dialog', 'aria-label': 'Continuing' },
    h('div', { class: 'pb' },
      h('div', { class: 'pb-head' }, h('span', { class: 'pb-title' }, 'Processing'), date),
      h('div', { class: 'pb-bar' }, fillEl),
      feed,
      h('div', { class: 'pb-foot' }, h('span', { class: 'cm-s' }, 'Press any key to stop'), stopBtn)));
  const key = (e) => { if (!e.repeat) stop(); };
  function stop() { onStop(); stopBtn.textContent = 'Stopping...'; stopBtn.disabled = true; }
  document.addEventListener('keydown', key);
  document.body.append(box);
  const lines = [];
  let shownFeed = null;
  const add = (text, cls) => { lines.unshift({ text, cls }); lines.length = Math.min(lines.length, 5); };
  const name = (id) => game.world.clubs.get(id)?.city ?? id;
  return {
    set(d) {
      date.textContent = longDate(d);
      const n = dayNo(d) - today0;
      const share = goal ? Math.min(1, n / goal) : 1 - Math.exp(-n / 6);
      fillEl.style.width = `${Math.max(4, Math.round(share * 100))}%`;
      // your games of the day, as they finish
      try {
        for (const g of game.season?.games || []) {
          if (g.level !== 'MLB' || !g.s || (g.d !== dayNo(d) - 1 && g.d !== dayNo(d))) continue;
          if (g.home !== game.orgId && g.away !== game.orgId) continue;
          const k = `${g.d}|${g.home}|${g.away}|${g.gn || 0}`;
          if (lines.some((x) => x.k === k)) continue;
          const mine = g.home === game.orgId ? g.s[1] : g.s[0], theirs = g.home === game.orgId ? g.s[0] : g.s[1];
          const won = mine > theirs;
          add(`${won ? 'Won' : 'Lost'} ${Math.max(mine, theirs)}-${Math.min(mine, theirs)} ${g.home === game.orgId ? 'v' : 'at'} ${name(g.home === game.orgId ? g.away : g.home)}`, won ? 'win' : 'loss');
          lines[0].k = k;
        }
      } catch { /* results are a courtesy */ }
      const news = (game.headlines || []).filter((y) => y.n > startHead);
      for (const x of news.filter((y) => !lines.some((l) => l.n === y.n) && !news.some((z) => z !== y && z.text.length > y.text.length && z.text.toLowerCase().startsWith(y.text.toLowerCase())))) { add(x.text, x.mine ? 'mine' : ''); lines[0].n = x.n; }
      // drawn again only when a line arrives, so nothing flashes on the days with nothing new
      const key = lines.map((x) => x.text).join('|');
      if (key !== shownFeed) {
        shownFeed = key;
        fill(feed, lines.length ? lines.map((x, i) => h('div', { class: `pb-line ${x.cls}${i === 0 ? ' fresh' : ''}` }, x.text)) : h('div', { class: 'pb-line quiet' }, 'Nothing to report yet.'));
      }
    },
    async close() {
      fillEl.style.width = '100%';
      await new Promise((r) => setTimeout(r, 180));
      document.removeEventListener('keydown', key); box.remove();
    },
  };
}

/** @param {{until?:Date}} [o] */
export async function doContinue(o = {}) {
  if (running) return;
  if (game.phase === 'offseason' && game.winter?.on && !game.winter.seenHub) {
    game.winter.seenHub = true;
    nav.push((await import('./winter-screen.js')).winterScreen());
    return;
  }
  if (game.phase === 'over') {
    // the first Continue after the last game opens the season in review; the next one starts the winter
    const y = game.season?.year;
    if (y && game.history?.[y] && !(game.reviewShown ||= {})[y]) {
      game.reviewShown[y] = true;
      nav.push((await import('./season-review.js')).seasonReviewScreen(y));
      toast('The season is over. Press Continue when you are ready to start the winter.');
      return;
    }
    const { beginWinter } = await import('../season/offseason.js');
    beginWinter();
    const { inboxScreen } = await import('./inbox-screen.js');
    nav.reset(inboxScreen());
    toast(`The ${game.year - 1} season is over. The winter begins.`);
    return;
  }
  // unread mail you have not been shown yet: the first Continue opens the inbox rather than running on
  const newest = game.inbox.filter((m) => !m.read).at(-1);
  if (newest && newest.id > (game.inboxShown || 0) && !o.until) {
    game.inboxShown = newest.id;
    const { inboxScreen } = await import('./inbox-screen.js');
    nav.push(inboxScreen());
    return;
  }
  running = true;
  let stopRequested = false;
  const from = lastId();
  const ov = processBar(() => { stopRequested = true; }, o);
  let res;
  const winter = game.phase === 'offseason' && game.winter?.on;
  try {
    if (winter) {
      const { continueWinter } = await import('../season/winter.js');
      res = await continueWinter({ onDay: (d) => ov.set(d), shouldStop: () => stopRequested, sleep: () => new Promise((r) => setTimeout(r, DAY_MS[game.settings.pace || 'normal'] * 2)) });
    } else res = await continueGame({ until: o.until, wait: DAY_MS[game.settings.pace || 'normal'], onDay: (d) => ov.set(d), shouldStop: () => stopRequested });
  } catch (e) {
    reportError(e, { during: 'playing the days' });
    return;
  } finally {
    await ov.close();
    running = false;
  }
  await safeAutosave();
  // mail first, then the game: if something unread has arrived since the inbox was last shown, the inbox opens before the match
  // day or roster screen, and the next Continue goes on to it
  // a player hurt on the active roster: Continue goes to his injury message, where the Injury Centre sorts out the cover
  if (res.stop === 'cover') { await openCover(res.players); return; }
  if (res.stop === 'match' || res.stop === 'required') {
    const fresh = game.inbox.filter((m) => !m.read).at(-1);
    if (fresh && fresh.id > (game.inboxShown || 0)) {
      game.inboxShown = fresh.id;
      const { inboxScreen } = await import('./inbox-screen.js');
      nav.push(inboxScreen());
      toast(res.stop === 'match' ? 'Read your mail, then press Continue for the game.' : 'Read your mail, then press Continue to sort out the roster.');
      return;
    }
  }
  if (res.stop === 'deadline') { nav.push((await import('./deadline-screen.js')).deadlineScreen()); return; }
  if (res.stop === 'match') { nav.push((await import('./matchday-screen.js')).matchDayScreen(res.game)); return; }
  if (res.stop === 'required') { nav.push((await import('./required-screen.js')).requiredScreen(res.problems)); return; }
  const { inboxScreen } = await import('./inbox-screen.js');
  game.inboxShown = lastId();
  nav.push(inboxScreen({ stopped: { ...res, from } }));
}

/** The letter left in the news when you come back from holiday: what happened while you were away, then the club in detail. */
function holidayNote(from, begun, days, open = 0, snap = null) {
  const y = game.season?.year;
  const r = game.season?.records?.get(game.orgId);
  const lines = [`You were away for ${days} day${days === 1 ? '' : 's'}, from ${longDate(begun)} to ${longDate()}. Your assistant ran the club the whole time.`];
  // seasons that ended while you were away
  const ended = (k) => !snap || k > snap.year || (k === snap.year && !['over', 'offseason'].includes(snap.phase));
  const done = Object.keys(game.history || {}).map(Number).filter((k) => k >= begun.getFullYear() - 1 && ended(k) && game.history[k]?.clubs?.[game.orgId]).sort();
  for (const k of done) { const c = game.history[k].clubs[game.orgId]; if (c) lines.push(`${k} finished ${c.w}-${c.l}${c.result ? `, ${c.result}` : ''}.`); }
  if (r && game.phase !== 'offseason' && !(snap && snap.year === y)) lines.push(`${y} so far: ${r.w}-${r.l}.`);
  let report = [];
  try { report = snap ? holidayReport(snap, { days, begun }) : []; } catch (e) { console.warn('holiday report', e); }
  const tail = open ? `${open} offer${open === 1 ? '' : 's'} or question${open === 1 ? '' : 's'} came in that still need${open === 1 ? 's' : ''} an answer: look for them in the News, in Transfers and in the doctors' letters. All the news has been marked as read; the search box finds anything you want to look back at.` : 'Nothing is waiting for an answer. All the news has been marked as read; the search box finds anything you want to look back at.';
  return { body: [...lines, tail].join('\n'), parts: [...lines.map((p) => ({ p })), ...report, { p: tail }] };
}

/** Open the injury message of the first player who needs cover (or the Injury Centre, if there is none) and say why Continue stopped. */
async function openCover(ids) {
  const p = game.world.players.get(ids[0]);
  if (!p) return;
  const m = [...game.inbox].reverse().find((x) => x.player === p.id && x.cat === 'injury' && !x.closed);
  const others = ids.length > 1 ? ` (and ${ids.length - 1} more)` : '';
  if (m) {
    const { inboxScreen } = await import('./inbox-screen.js');
    game.inboxShown = lastId();
    nav.push(inboxScreen({ open: m }));
  } else nav.push((await import('./cover-screen.js')).coverScreen(p));
  toast(`${p.first} ${p.last}${others} is injured and still on the active roster. Sort out his cover in the Injury Centre before you go on: the injured list, or keep him on the roster.`);
}

let saveWarned = false;
/** Autosave, and if it fails say so once in the inbox (a full disk or a blocked folder), rather than stop saving in silence. */
export async function safeAutosave() {
  try {
    await autosave();
    saveWarned = false;
  } catch (e) {
    console.warn('autosave failed', e);
    if (saveWarned) return;
    saveWarned = true;
    const { message } = await import('../season/inbox.js');
    message({ cat: 'club', important: true, title: 'Autosave failed', body: `The game could not autosave (${e.message}). Your progress since the last save is not stored yet. Save from Game Options under a new name, and check there is space on the disk.` });
  }
}

/** Holiday: the assistant runs the club and nothing stops until you press a key or the button. */
export async function doHoliday() {
  if (running) return;
  const ok = await new Promise((done) => {
    const box = h('div', { class: 'busy', role: 'dialog', 'aria-label': 'Go on holiday' },
      h('div', { class: 'paper' },
        h('div', { class: 'paper-head' }, h('span', { class: 'masthead' }, 'Go on holiday?')),
        h('p', { class: 'cm-pad' }, 'Your assistant will run the club: lineups, injuries, call-ups and the draft. He will not re-sign anyone whose contract runs out. Nothing will stop for your games, messages or deadlines until you press a key or the Come back button. If the board sacks you, the holiday ends there.'),
        h('div', { class: 'paper-foot' },
          h('button', { class: 'cm-btn', onClick: () => { box.remove(); done(false); } }, 'Stay'),
          h('button', { class: 'cm-btn go big', onClick: () => { box.remove(); done(true); } }, 'Go on holiday'))));
    document.body.append(box);
  });
  if (!ok) return;
  running = true;
  holiday.on = true;
  let stopRequested = false;
  const from = lastId();
  const begun = new Date(game.date);
  let snap = null;
  try { snap = holidaySnap(); } catch (e) { console.warn('holiday snapshot', e); }
  const ov = overlay(() => { stopRequested = true; }, true);
  const [{ beginWinter }, { continueWinter }, { owner }] = await Promise.all([import('../season/offseason.js'), import('../season/winter.js'), import('../season/finance.js')]);
  let still = 0, last = '', atReview = 0, failed = null;
  try {
    for (let guard = 0; guard < 5000 && !stopRequested; guard++) {
      if (game.jobs?.jobless) break;
      // the owner has given an order the assistant cannot carry out: the holiday is over
      { const cutO = owner(game.orgId).cut; if (cutO && !cutO.done && cutO.year >= game.year) break; }
      const mark = `${game.date.getTime()}|${game.phase}|${game.winter?.on}`;
      still = mark === last ? still + 1 : 0;
      last = mark;
      if (still > 3) break;
      if (game.phase === 'over') {
        game.reviewShown ||= {};
        const yr = game.season?.year;
        // the end of the season is worth a look: the holiday stops there unless it is switched off in the options
        if (game.settings?.holidayStops !== false && yr && game.history?.[yr] && !game.reviewShown[yr]) { atReview = yr; break; }
        if (yr) game.reviewShown[yr] = true;
        beginWinter();
        await safeAutosave();
        continue;
      }
      if (game.phase === 'offseason' && game.winter?.on) {
        if (!game.winter.holidayPrep) {
          game.winter.holidayPrep = true;
          // the assistant signs nobody: players whose contracts run out go to the market, and re-signing them is for you to decide when you are back
        }
        await continueWinter({ auto: true, onDay: (d) => ov.set(d), shouldStop: () => stopRequested, sleep: () => new Promise((r) => setTimeout(r, 150)) });
        continue;
      }
      await continueGame({ auto: true, wait: 90, onDay: (d) => ov.set(d), shouldStop: () => stopRequested });
    }
  } catch (e) {
    failed = e;
  } finally {
    ov.close();
    holiday.on = false;
    running = false;
  }
  if (failed) { reportError(failed, { during: 'running the club on holiday' }); return; }
  // everything is marked read, so the summary letter is the one thing waiting; offers and questions that still need an answer are counted in it
  const open = game.inbox.filter((m) => m.id > from && !m.closed && (m.offer || m.neg || m.trade || (m.choice && !m.choice.picked))).length;
  for (const m of game.inbox) m.read = true;
  const days = Math.max(0, Math.round((game.date - begun) / 864e5));
  const { message } = await import('../season/inbox.js');
  const note = holidayNote(from, begun, days, open, snap);
  const back = message({ cat: 'club', important: true, title: game.jobs?.jobless ? 'Your holiday ended: you are out of work' : 'Back from holiday', body: note.body, parts: note.parts });
  await safeAutosave();
  const { inboxScreen } = await import('./inbox-screen.js');
  game.inboxShown = back.id;
  nav.reset(inboxScreen());
  if (atReview && !game.jobs?.jobless) {
    game.reviewShown[atReview] = true;
    nav.push((await import('./season-review.js')).seasonReviewScreen(atReview));
    toast('The season is over, and the holiday has stopped here. Press Continue when you are ready to start the winter.');
    return;
  }
  toast(game.jobs?.jobless ? 'The board has let you go.' : 'Welcome back.');
}
