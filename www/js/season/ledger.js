// The ledger: every trade and free-agent signing in the league, with what the player was worth on the day, so the
// Transfers screen can show who came in, who went out and how it turned out. Drafts are kept in game.drafts.
import { game } from '../state.js';
import { value } from './value.js';
import { dayNo } from './calendar.js';

export const ledger = () => (game.ledger ||= { moves: [], flags: {} });

/** t: 'trade' or 'sign'. to is the club he joined, from the club he left (none for a signing). */
export function record(t, p, to, from, extra = {}) {
  const L = ledger();
  L.moves.push({ t, day: dayNo(game.date), year: game.year, pid: p.id, to, from: from || null, v: Math.round(value(p)), age: p.age, ...extra });
  if (L.moves.length > 3200) {
    const cut = game.year - 5;
    L.moves = L.moves.filter((m) => m.to === game.orgId || m.from === game.orgId || m.year >= cut);
  }
}

/** The moves that involve your club, newest first. */
export const mine = () => ledger().moves.filter((m) => m.to === game.orgId || m.from === game.orgId).slice().reverse();

export const years = () => [...new Set(ledger().moves.map((m) => m.year))].sort((a, b) => b - a);

/** What he is worth now, or 0 when he has retired. */
export const nowValue = (p) => (!p || p.retired ? 0 : Math.round(value(p)));

/** The surplus a group of players is worth: only the value above a bench player counts. */
export const surplus = (vs) => vs.reduce((a, v) => a + Math.max(0, v - 44), 0);
