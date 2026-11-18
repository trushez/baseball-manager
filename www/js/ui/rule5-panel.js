// The Rule 5 page of the Transfers screen: protect your players, make your list for the draft, see what happened, and
// look after the picks you hold. Everything is explained where it applies and nothing is hidden behind a rule.
import { h, toast } from './dom.js';
import { plink } from './club-ui.js';
import { mainPos, fullName, LEVEL_NAME } from '../data/world.js';
import { game } from '../state.js';
import { worthText } from '../season/trade.js';
import { dateWords } from '../season/calendar.js';
import * as R from '../season/rule5.js';
import { fortyRoom } from './roster-action.js';
import { orgState } from '../state.js';

const city = (id) => game.world.orgs.get(id)?.club.city ?? id;
const P = (id) => game.world.players.get(id);
const th = (cols) => h('thead', {}, h('tr', {}, cols.map((c, i) => h('th', { class: i === 0 || c === 'Club' ? 'l' : '' }, c))));
const cap = (arr, n) => arr.slice(0, n);

export function rule5Panel(redraw) {
  const stage = R.stage(), d = R.dates(), free = R.room();
  const out = [];
  const say = (err, ok) => { toast(err || ok); redraw(); };

  const where = stage === 'before'
    ? `Protection deadline: ${dateWords(d.protect)}. Draft: ${dateWords(d.draft)}.`
    : stage === 'protected'
      ? `Clubs have named their protected players. The draft is on ${dateWords(d.draft)}.`
      : R.R5().done ? 'This year\'s draft has been held.' : 'The draft is on its way.';
  out.push(h('p', { class: 'cm-s cm-pad' }, `Each December, a minor leaguer who has been in pro ball long enough and is not on his club's 40-man roster can be picked by another club. The club that picks him pays $${R.FEE / 1000}k and has to keep him on its active roster all season (the injured list counts), or offer him back for $${R.BACK_FEE / 1000}k. After ${R.KEEP_DAYS} days of the season he belongs to his new club for good. ${where}`));

  // the picks you hold
  const held = R.mineRule5();
  if (held.length) {
    out.push(h('div', { class: 'cm-h' }, 'Your Rule 5 picks'),
      h('table', { class: 'cm-tbl' }, th(['Player', 'Club', 'Pos', 'Age', 'Where he is', '']),
        h('tbody', {}, held.map((p) => h('tr', {}, h('td', { class: 'l' }, plink(p)), h('td', { class: 'l' }, `from ${city(p.rule5.from)}`), h('td', {}, mainPos(p)), h('td', {}, p.age),
          h('td', {}, game.world.orgs.get(game.orgId) && p.level === 'MLB' ? 'Active roster' : LEVEL_NAME[p.level] || p.level),
          h('td', {}, h('button', { class: 'cm-btn', onClick: () => { say(R.offerBack(p), `${fullName(p)} is on his way back to ${city(p.rule5.from)}.`); } }, `Offer back to ${city(p.rule5.from)}`)))))),
      h('p', { class: 'cm-s cm-pad' }, 'Put each one on your active roster before Opening Day, or offer him back. The game will not let you send him down or designate him in between.'));
  }

  // your own players
  const mine = R.myExposed();
  out.push(h('div', { class: 'cm-h' }, `Your players another club could pick (${free >= 0 ? `${free} spot${free === 1 ? '' : 's'} free on your 40-man roster` : `your 40-man roster is ${-free} over the limit`})`));
  if (!mine.length) out.push(h('p', { class: 'cm-s cm-pad cm-empty' }, 'None of your minor leaguers is eligible.'));
  else {
    out.push(h('table', { class: 'cm-tbl' }, th(['Player', 'Pos', 'Age', 'Level', 'Value', '']),
      h('tbody', {}, cap(mine, 25).map((p) => h('tr', {}, h('td', { class: 'l' }, plink(p)), h('td', {}, mainPos(p)), h('td', {}, p.age), h('td', {}, LEVEL_NAME[p.level]), h('td', { class: 'y' }, worthText(p)),
        h('td', {}, h('button', { class: 'cm-btn', disabled: stage === 'after', title: free < 1 ? 'Your 40-man roster is full: you will be asked who comes off.' : 'Adds him to your 40-man roster so no club can pick him.', onClick: async () => { if (free < 1 && !(await fortyRoom(game.world.orgs.get(game.orgId), orgState(), p, 'to protect him'))) return redraw(); say(R.protect(p), `${fullName(p)} is on your 40-man roster and protected.`); } }, 'Protect')))))));
    if (stage !== 'after') out.push(h('p', { class: 'cm-s cm-pad' }, 'Protecting a player puts him on your 40-man roster, which counts against the limit of 40 and gives him a major league contract at the minimum. Leave off anyone you would not mind losing.'));
  }

  // what you could pick
  out.push(h('div', { class: 'cm-h' }, 'Your list for the draft'));
  if (stage === 'before') out.push(h('p', { class: 'cm-s cm-pad' }, `Clubs name their protected players on ${dateWords(d.protect)}. After that you can choose up to ${R.MAX_QUEUE} players to try for, in order.`));
  else {
    const q = R.R5().queue.map(P).filter(Boolean);
    const open = R.available();
    if (!R.R5().done) {
      out.push(h('p', { class: 'cm-s cm-pad' }, `You pick in your turn, worst record first. The first player on your list who is still there is the one you get, and you need a free spot on the 40-man roster (you have ${free}). Pick nobody and you skip the draft.`));
      if (q.length) out.push(h('table', { class: 'cm-tbl' }, th(['#', 'Player', 'Club', 'Pos', 'Age', 'Level', '']),
        h('tbody', {}, q.map((p, i) => h('tr', {}, h('td', {}, i + 1), h('td', { class: 'l' }, plink(p)), h('td', { class: 'l' }, city(p.orgId)), h('td', {}, mainPos(p)), h('td', {}, p.age), h('td', {}, LEVEL_NAME[p.level]),
          h('td', {}, h('button', { class: 'cm-btn', disabled: i === 0, onClick: () => { R.queueMove(p, -1); redraw(); } }, 'Up'), h('button', { class: 'cm-btn', disabled: i === q.length - 1, onClick: () => { R.queueMove(p, 1); redraw(); } }, 'Down'), h('button', { class: 'cm-btn', onClick: () => { R.queueRemove(p); redraw(); } }, 'Remove')))))));
      out.push(h('div', { class: 'cm-h' }, `Open to the draft (${open.length}, best first)`),
        h('table', { class: 'cm-tbl' }, th(['Player', 'Club', 'Pos', 'Age', 'Level', 'Value', '']),
          h('tbody', {}, cap(open, 40).map((p) => h('tr', { class: R.R5().queue.includes(p.id) ? 'sel' : '' }, h('td', { class: 'l' }, plink(p)), h('td', { class: 'l' }, city(p.orgId)), h('td', {}, mainPos(p)), h('td', {}, p.age), h('td', {}, LEVEL_NAME[p.level]), h('td', { class: 'y' }, worthText(p)),
            h('td', {}, R.R5().queue.includes(p.id) ? h('button', { class: 'cm-btn', onClick: () => { R.queueRemove(p); redraw(); } }, 'Remove') : h('button', { class: 'cm-btn', onClick: async () => { const err = R.queueAdd(p); if (!err && free < 1) { const ok = await fortyRoom(game.world.orgs.get(game.orgId), orgState(), p, 'before the draft'); if (!ok) toast('Your list has him, but you will need a free place on the 40-man roster on draft day.'); else toast(`${fullName(p)} is on your list and a place is cleared.`); return redraw(); } say(err, `${fullName(p)} is on your list.`); } }, 'Add to my list')))))));
    } else {
      const log = R.R5().log;
      out.push(log.length ? h('table', { class: 'cm-tbl' }, th(['Pick', 'Player', 'Taken by', 'From']),
        h('tbody', {}, log.map((x) => h('tr', { class: x.to === game.orgId || x.from === game.orgId ? 'sel' : '' }, h('td', {}, x.n), h('td', { class: 'l' }, plink(P(x.pid))), h('td', { class: 'l' }, city(x.to)), h('td', { class: 'l' }, city(x.from))))))
        : h('p', { class: 'cm-s cm-pad cm-empty' }, 'Nobody was picked.'));
    }
  }
  return h('div', {}, out);
}
