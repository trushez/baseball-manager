// Your legacy: what you have done as a manager, worked out from the seasons kept in game.history, the trades in the market
// log and the drafts. Nothing is stored for it, so it works for any save.
import { game } from '../state.js';
import { fullName } from '../data/world.js';
import { value } from './value.js';
import { managerCareer } from './history.js';

const P = (id) => game.world.players.get(id);
const city = (id) => game.world.orgs.get(id)?.club.city ?? id;

export function legacy() {
  const seasons = managerCareer('you');
  if (!seasons.length) return null;
  const w = seasons.reduce((a, s) => a + s.w, 0), l = seasons.reduce((a, s) => a + s.l, 0);
  const pct = (s) => s.w / Math.max(1, s.w + s.l);
  const best = seasons.slice().sort((a, b) => pct(b) - pct(a))[0], worst = seasons.slice().sort((a, b) => pct(a) - pct(b))[0];
  const titles = seasons.filter((s) => s.post === 'Champions'), pennants = seasons.filter((s) => s.post === 'Champions' || s.post === 'WS');
  const divs = seasons.filter((s) => s.place === 1), posts = seasons.filter((s) => s.post), moys = seasons.filter((s) => s.moy);
  const clubs = [...new Set(seasons.map((s) => s.org))];

  // your drafts: the picks still worth most today
  const picks = [];
  for (const [y, d] of Object.entries(game.drafts || {})) for (const r of d.picks) if (r[1] === game.orgId && r[8]) { const p = P(r[2]); if (p && !p.retired) picks.push({ p, year: +y, n: r[0], v: Math.round(value(p)) }); }
  picks.sort((a, b) => b.v - a.v);

  // trades: the market log keeps the edge from the point of view of the club that started it
  const me = game.orgId;
  const trades = (game.market?.done || []).filter((t) => t.a === me || t.b === me).map((t) => ({ ...t, edge: t.a === me ? t.truth : -t.truth }));
  const wins = trades.filter((t) => t.edge > 0).sort((a, b) => b.edge - a.edge).slice(0, 3), losses = trades.filter((t) => t.edge < 0).sort((a, b) => a.edge - b.edge).slice(0, 3);
  const names = (ids) => ids.map((id) => P(id) && fullName(P(id))).filter(Boolean).join(', ') || 'cash';
  const tradeText = (t) => `${new Date(t.date).getFullYear()}: with ${city(t.a === me ? t.b : t.a)}, sent ${names(t.a === me ? t.give : t.get)} and got ${names(t.a === me ? t.get : t.give)}`;

  const lines = [];
  lines.push(`${seasons.length} ${seasons.length === 1 ? 'season' : 'seasons'}, ${w}-${l} (${(w / Math.max(1, w + l)).toFixed(3).replace(/^0/, '')}) with ${clubs.map(city).join(' and ')}.`);
  if (titles.length) lines.push(`World Series champions in ${titles.map((s) => s.year).join(', ')}.`);
  else if (pennants.length) lines.push(`Reached the World Series in ${pennants.map((s) => s.year).join(', ')} without winning it.`);
  else if (posts.length) lines.push(`${posts.length} postseason${posts.length > 1 ? 's' : ''}, no World Series yet.`);
  else lines.push('No postseason yet.');
  if (divs.length) lines.push(`${divs.length} division ${divs.length > 1 ? 'titles' : 'title'}.`);
  return { seasons, w, l, best, worst, titles, pennants, divs, posts, moys, clubs, picks: picks.slice(0, 5), wins: wins.map(tradeText), losses: losses.map(tradeText), summary: lines.join(' ') };
}
