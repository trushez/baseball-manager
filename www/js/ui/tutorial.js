// How to Play: the tutorial for a new player, as a large box over whatever is on screen, so it can be opened from
// the title screen before a career exists as well as from Game Options during one. The lessons are down the side
// and the open one on the right. In a career it starts with Right now, which reads the calendar, the roster and the
// money and says what to see to next; and each lesson has Show me buttons that close the box, open the screen it is
// talking about and leave a small button to come back to the lesson.
import { h, fill } from './dom.js';
import { nav } from './nav.js';
import { LESSONS } from './tutorial-text.js';
import { game, org, orgState } from '../state.js';
import { money } from '../data/world.js';
import { dateWords, keyDates } from '../season/calendar.js';

const READ_KEY = 'bm-tutorial-read';
const readSet = () => { try { return new Set(JSON.parse(localStorage.getItem(READ_KEY) || '[]')); } catch { return new Set(); } };
const markRead = (id) => { try { const s = readSet(); s.add(id); localStorage.setItem(READ_KEY, JSON.stringify([...s])); } catch { /* storage may be blocked */ } };

let last = null; // the lesson open when the box was closed, so it reopens there
const inCareer = () => !!(game.world && game.orgId);

/** Right now: a short page built from the state of the career, saying what this part of the year asks of you. */
async function rightNow() {
  const [{ counts }, fin, { confidenceWords }, { unread }] = await Promise.all([
    import('../club/depth.js'), import('../season/finance.js'), import('../season/reactions.js'), import('../season/inbox.js')]);
  const d = game.date, y = game.year, m = d.getMonth(), day = d.getDate();
  const when = (mm, dd) => m > mm || (m === mm && day >= dd);
  const sections = [];
  let plan;
  const rec = game.season?.records?.get(game.orgId);
  const pace = rec && rec.w + rec.l ? Math.round((rec.w / (rec.w + rec.l)) * 162) : null;
  if (game.jobs?.jobless) plan = 'You are out of work. Open Jobs under MLB to see the vacancies and apply; Continue moves the days on while you wait for an offer.';
  else if (game.phase === 'over') plan = 'The season is over. Continue begins the winter, which starts with the club options and the players whose contracts end.';
  else if (game.phase === 'post') plan = 'It is the postseason. If your club is in it, Continue takes you through each game; if not, Continue runs to the end of the season and the start of the winter.';
  else if (game.phase === 'spring') {
    const op = game.season ? dateWords(keyDates(game.season.year).opening) : 'late March';
    plan = `Spring Training. Settle the last places on the roster, set both batting lineups, the five-man rotation and the bullpen roles in Tactics, and get the active roster down to 26 before Opening Day on ${op}. A few bargains are still on the free agent list, and their prices fall day by day.`;
  } else if (game.phase === 'regular') {
    const dl = keyDates(y).deadline;
    if (d < dl) {
      const side = pace == null ? '' : pace >= 88 ? ` You are on course for ${pace} wins, which should be enough for the postseason, so this is the time to trade prospects for the help that gets you there.` : pace <= 76 ? ` You are on course for only ${pace} wins. Think about selling: an older player with a year or two left on his contract can bring back young players from a contender.` : ` You are on course for ${pace} wins, on the edge of the race. Decide by July whether to buy or sell, because doing neither seldom helps.`;
      plan = `The season is on. Each time Continue stops, read the News, cover any injury and play or sim the game. The trade deadline is 31 July.${side}`;
    } else if (!when(8, 1)) plan = 'The trade deadline has passed, so the roster is mostly what it is. On 1 September the active roster grows to 28: plan which two young players you want to see in the majors.';
    else plan = 'September: the active roster is 28, so this is a good time to give your best prospects a look in the majors. The postseason starts in October.';
  } else if (game.phase === 'offseason') {
    if (!game.winter?.on) plan = 'The winter has not begun yet. Press Continue to start it.';
    else if (m === 10 && day < 7) plan = 'The first days of the winter. Until 7 November only you can talk to your own free agents: re-sign the ones you want from the Free Agents tab on the Squad screen, and think about qualifying offers for the good ones you will lose. Then look at your roster for the gaps to fill.';
    else if (m === 10 || (m === 11 && day <= 1)) plan = 'Free agency is open. Look at the free agents for your gaps, with an eye on the budget. Before 1 December decide which arbitration players to keep (the tender deadline) and put the prospects you must protect from the Rule 5 draft on the 40-man roster.';
    else if (m === 11 || (m === 0 && day < 15)) plan = 'The Winter Meetings are in the second week of December, the busiest time for signings and trades. International amateurs can be bid for until 14 January, and the Rule 5 draft follows the meetings.';
    else plan = 'Late winter. Arbitration figures are swapped on 15 January; settle the cases you can from the winter screen before the hearings on 1 February. Spring Training opens on 20 February, and the free agents still unsigned get cheaper from then on.';
  }
  sections.push({ h: `${dateWords(d)} ${d.getFullYear()}`, p: [plan] });

  const o = org(), st = orgState(), c = counts(o, st);
  const lines = [];
  const winterNow = game.phase === 'offseason' || game.phase === 'over';
  const fortyLine = c.forty > 40 ? (winterNow ? ` That is over the limit of 40, which the winter allows, but you must be down to 40 by Spring Training, so ${c.forty - 40} of them will have to come off it by trade, by designating or releasing them, or by moving a long-term injury to the 60-day list.` : ' That is over the limit of 40, and Continue will not go on until you take someone off.')
    : c.forty === 40 ? ' It is full, so adding anyone means taking someone off.' : ` That leaves ${40 - c.forty} place${40 - c.forty === 1 ? '' : 's'} on it.`;
  lines.push(winterNow ? `Your 40-man roster has ${c.forty} players.${fortyLine} The 26-man active roster does not matter until the spring.` : `Your active roster has ${c.active} players, ${c.pitchers} of them pitchers, and the 40-man roster has ${c.forty}.${fortyLine}`);
  const yr = y; // the season being played, or in the winter the one coming; never a year whose budget is not set yet
  try {
    const b = fin.budget(game.orgId, yr), e = fin.expected(game.orgId, yr), r = b - e;
    lines.push(`For ${yr} the owner's budget is ${money(b)} and you have about ${money(e)} committed, ${r >= 0 ? `which leaves ${money(r)} to spend` : `which is ${money(-r)} over the budget: the owner will not like it`}.`);
  } catch { /* the budget for the year may not be set yet */ }
  try {
    const gs = fin.goals(game.orgId, yr) || [];
    if (gs.length) lines.push(`His goals: ${gs.map((g) => g.text.replace(/\.$/, '').replace(/^./, (x) => x.toLowerCase())).join('; ')}. His confidence in you: ${confidenceWords()[0].toLowerCase()}.`);
  } catch { /* no goals yet */ }
  if (rec && rec.w + rec.l) lines.push(`The club is ${rec.w}-${rec.l}.`);
  sections.push({ h: 'Your club', p: lines });
  const n = unread();
  sections.push({ h: 'Next', p: [n ? `You have ${n} unread message${n === 1 ? '' : 's'} in the News. Read them first, then press Continue Game.` : 'The News is read. Press Continue Game to move on; it stops again when something needs you.'] });
  return {
    id: 'now', title: 'Right now', lead: 'What this part of the year asks of you, from your own club.', sections,
    show: [{ label: 'The News', open: async () => (await import('./inbox-screen.js')).inboxScreen() }, { label: 'Finances', open: async () => (await import('./finance-screen.js')).financeScreen() }],
  };
}

/** The small button left on screen after Show me, to go back to the lesson. */
function backChip(id) {
  document.querySelector('.tut-chip')?.remove();
  const chip = h('div', { class: 'tut-chip' },
    h('button', { class: 'cm-btn go', onClick: () => { chip.remove(); openTutorial(id); } }, '‹ Back to How to Play'),
    h('button', { class: 'cm-btn', 'aria-label': 'Close', onClick: () => chip.remove() }, '×'));
  document.body.append(chip);
}

/**
 * Open How to Play. @param {string} [start] the lesson to open; by default the one last open, or Right now in a career.
 * Resolves when the box is closed.
 */
export async function openTutorial(start) {
  document.querySelector('.tut-chip')?.remove();
  const lessons = inCareer() ? [await rightNow(), ...LESSONS] : LESSONS.slice();
  let cur = lessons.some((l) => l.id === start) ? start : last && lessons.some((l) => l.id === last) ? last : lessons[0].id;
  const read = readSet();
  return new Promise((done) => {
    const list = h('nav', { class: 'man-toc', 'aria-label': 'Lessons' });
    const page = h('article', { class: 'man-page tut-page' });
    const close = () => { window.removeEventListener('keydown', key, true); back.remove(); done(); };
    const go = (id) => { cur = id; draw(); page.scrollTop = 0; };
    const key = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); close(); }
      else if (e.key === 'ArrowRight' && !e.target.closest?.('input, select, textarea')) { const i = lessons.findIndex((l) => l.id === cur); if (lessons[i + 1]) go(lessons[i + 1].id); e.preventDefault(); }
      else if (e.key === 'ArrowLeft' && !e.target.closest?.('input, select, textarea')) { const i = lessons.findIndex((l) => l.id === cur); if (lessons[i - 1]) go(lessons[i - 1].id); e.preventDefault(); }
      e.stopPropagation(); // the game's own keys (Space for Continue, the title screen's arrows) wait while this is open
    };
    async function show(s) {
      const screen = await s.open();
      close(); backChip(cur);
      // over the title screen there is no career to show; in a career the screen opens on top of where you were
      nav.push(screen);
    }
    async function draw() {
      last = cur;
      if (cur !== 'now') { markRead(cur); read.add(cur); }
      const i = lessons.findIndex((l) => l.id === cur), L = lessons[i];
      const num = inCareer() ? i : i + 1, total = inCareer() ? lessons.length - 1 : lessons.length;
      fill(list, lessons.map((l, n) => h('button', { class: `man-ch${l.id === cur ? ' on' : ''}`, 'aria-current': l.id === cur ? 'page' : null, onClick: () => go(l.id) },
        h('span', { class: 'n' }, l.id === 'now' ? '•' : read.has(l.id) && l.id !== cur ? '✓' : String(inCareer() ? n : n + 1)), l.title)));
      const shows = [];
      if (inCareer()) for (const s of L.show || []) if (!s.when || await s.when()) shows.push(s);
      const prev = lessons[i - 1], next = lessons[i + 1];
      fill(page,
        h('div', { class: 'man-num' }, L.id === 'now' ? 'Your career' : `Lesson ${num} of ${total}`),
        h('h2', { class: 'man-title' }, L.title),
        L.lead ? h('p', { class: 'tut-lead' }, L.lead) : null,
        L.sections.map((s) => h('section', {}, h('h3', {}, s.h), s.p.map((t) => h('p', {}, t)))),
        shows.length ? h('div', { class: 'tut-show' }, h('span', { class: 'cm-s' }, 'Show me'), shows.map((s) => h('button', { class: 'cm-btn', onClick: () => show(s) }, s.label))) : null,
        !inCareer() && L.show?.length ? h('p', { class: 'cm-s tut-note' }, 'Once you have started a career, How to Play under Game Options has buttons here that open each screen this lesson talks about.') : null,
        h('div', { class: 'man-foot' },
          prev ? h('button', { class: 'cm-btn', onClick: () => go(prev.id) }, `‹ ${prev.title}`) : h('span'),
          next ? h('button', { class: 'cm-btn go', onClick: () => go(next.id) }, `${next.title} ›`) : h('button', { class: 'cm-btn go', onClick: close }, inCareer() ? 'Back to the game' : 'Done')));
    }
    const back = h('div', { class: 'dlg-back tut-back', onClick: (e) => { if (e.target === back) close(); } },
      h('div', { class: 'dlg tut-dlg', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'How to Play' },
        h('div', { class: 'cm-title tut-head' }, h('span', {}, 'How to Play'), h('button', { class: 'cm-btn', onClick: close }, 'Close')),
        h('div', { class: 'man tut-body' }, list, page)));
    document.body.append(back);
    window.addEventListener('keydown', key, true);
    draw().then(() => back.querySelector('.man-ch.on')?.focus({ preventScroll: true }));
  });
}

/** At the start of a new career, ask once whether the player wants How to Play. Someone who has read a lesson, or said no before, is not asked. */
export function offerTutorial() {
  let asked = false;
  try { asked = !!localStorage.getItem('bm-tutorial-offered'); localStorage.setItem('bm-tutorial-offered', '1'); } catch { /* storage may be blocked */ }
  if (asked || readSet().size) return;
  const close = () => { window.removeEventListener('keydown', key, true); box.remove(); };
  const key = (e) => { if (e.key === 'Escape') close(); e.stopPropagation(); };
  const box = h('div', { class: 'dlg-back tut-back' },
    h('div', { class: 'dlg', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'How to Play' },
      h('div', { class: 'cm-title' }, 'New to Baseball Manager?'),
      h('div', { class: 'dlg-body' },
        h('p', {}, 'How to Play explains the game in a dozen short lessons: what to do each time Continue stops, the rules of baseball, how contracts work, and why a good club is built from cheap young players with a few stars on top. It starts with what your own club needs right now.'),
        h('p', { class: 'cm-s' }, 'You can open it at any time from Game Options, or from the message in your News.')),
      h('div', { class: 'dlg-btns' },
        h('button', { class: 'cm-btn big', onClick: close }, 'Not now'),
        h('button', { class: 'cm-btn go big', onClick: () => { close(); openTutorial('now'); } }, 'Show me how to play'))));
  document.body.append(box);
  window.addEventListener('keydown', key, true);
  box.querySelector('.cm-btn.go')?.focus();
}
