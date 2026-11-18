// The full scout report on a player: what the scout concluded, where he is strong and weak, how far to trust him.
import { h } from './dom.js';
import { toast } from './dom.js';
import { game } from '../state.js';
import { fullName, isPitcher, mainPos } from '../data/world.js';
import { attrValue, defence } from '../data/attributes.js';
import { avLabel } from './attr-ui.js';
import { scoutingStatus, viewOf, reportOn, reportFor, reportText, ageWords, stale, requestScouting, myScouts, sdAttr, sdPot } from '../season/scouting.js';

const BAT = ['contact', 'power', 'eye', 'avoidK', 'speed', '_def'];
const PIT = ['stuff', 'movement', 'control', 'velocity', 'stamina'];

const judgeWords = (v) => (v >= 16 ? 'an excellent' : v >= 13 ? 'a good' : v >= 8 ? 'an average' : v >= 5 ? 'a poor' : 'a very poor');

/** The scout who wrote it, if he is still on your books (reports filed before this was added carry only his name). */
function scoutOf(rep) {
  const pool = [...myScouts(), ...(game.staff?.[game.orgId]?.pool || []), ...(game.scoutPool || [])];
  return pool.find((s) => s.id === rep.scoutId) || (rep.ja ? { ja: rep.ja, jp: rep.jp } : null);
}

const gradeWord = (v) => (v >= 17 ? 'outstanding' : v >= 15 ? 'a clear strength' : v >= 13 ? 'above average' : v >= 9 ? 'average' : v >= 6 ? 'below average' : 'a real weakness');

/** What a scout would say about how he plays: nothing that reads as a number, and nothing at all for the middle of the range. */
export function styleHints(p, view) {
  const r = view.r || {};
  const out = [];
  const pos = mainPos(p);
  if (isPitcher(p)) {
    const g = r.pgb;
    if (g >= 64) out.push('Hitters pound the ball into the dirt against him.');
    else if (g >= 60) out.push('He works down in the zone and gets his share of grounders.');
    else if (g != null && g <= 36) out.push('Almost everything hit off him goes in the air.');
    else if (g != null && g <= 40) out.push('He tends to get hitters under the ball.');
    if (r.hold >= 64) out.push('Runners do not get much of a jump on him.');
    else if (r.hold != null && r.hold <= 36) out.push('Runners take liberties when he is on the mound.');
    return out;
  }
  const g = r.gb;
  if (g >= 64) out.push('He lives on the ground, with plenty of grounders and little loft.');
  else if (g >= 60) out.push('He hits more balls on the ground than most.');
  else if (g != null && g <= 36) out.push('Nearly everything he hits is in the air.');
  else if (g != null && g <= 40) out.push('He gets the ball in the air more than most.');
  const glove = r.range != null && r.hands != null ? (r.range * 0.7 + r.hands * 0.3) : null;
  if (glove != null && ['2B', 'SS', '3B'].includes(pos)) {
    if (glove >= 62) out.push('He gets to balls on the infield that others cannot reach.');
    else if (glove <= 40) out.push('Limited in the field: ground balls find holes on his side.');
  } else if (glove != null && ['LF', 'CF', 'RF'].includes(pos)) {
    if (glove >= 62) out.push('He covers a lot of grass in the outfield.');
    else if (glove <= 40) out.push('Slow to read the ball: fly balls and gappers are an adventure.');
  }
  if (r.arm >= 66 && pos !== '1B' && pos !== 'DH') out.push('A strong arm.');
  else if (r.arm != null && r.arm <= 36 && pos !== '1B' && pos !== 'DH') out.push('A weak arm that runners will test.');
  return out;
}

export function scoutReport(p, redraw = () => {}) {
  const rep = reportFor(p);
  if (!rep) {
    const wait = scoutingStatus(p);
    if (wait) return h('div', { class: 'cm-pad sr-big' }, h('p', { class: 'y' }, h('b', {}, 'Scouting under way.')), h('p', {}, wait), h('p', { class: 'cm-s' }, 'The report appears here when it is filed, and you will get a message.'));
    return h('div', { class: 'cm-pad sr-big' },
      h('p', {}, `Nobody has reported on ${fullName(p)} yet.`),
      h('p', { class: 'cm-s' }, 'A scout who looks at him will say whether he is good enough for your club, what he could become, and where he is strong and weak.'),
      h('button', { class: 'cm-btn go', onClick: () => { toast(requestScouting(p)); redraw(); } }, 'Request scouting'));
  }
  const view = viewOf(p, rep);
  const keys = isPitcher(p) ? PIT : BAT;
  const rows = keys.map((k) => ({ k, v: k === '_def' ? defence(view) : attrValue(view, k) })).filter((x) => x.v != null);
  const best = rows.filter((x) => x.v >= 13).sort((a, b) => b.v - a.v).slice(0, 3);
  const worst = rows.filter((x) => x.v <= 9).sort((a, b) => a.v - b.v).slice(0, 3);
  const line = (x) => `${avLabel(x.k)} (${x.v}, ${gradeWord(x.v)})`;
  const sc = scoutOf(rep);
  const trust = [];
  if (sc) {
    trust.push(`${rep.scout} is ${judgeWords(sc.ja)} judge of current ability: his readings of the ratings are usually within about ${Math.max(1, Math.round(sdAttr(sc.ja)))} ${Math.round(sdAttr(sc.ja)) === 1 ? 'point' : 'points'} of the truth.`);
    trust.push(`He is ${judgeWords(sc.jp)} judge of potential, so ${sc.jp >= 13 ? 'his view of the ceiling can be leaned on' : sc.jp >= 8 ? 'treat his view of the ceiling as a fair guess' : 'what he says about the ceiling could be well wide of the mark: a second opinion is worth having'}.`);
  } else trust.push(`${rep.scout} is no longer one of your scouts, so I cannot say how reliable he was.`);
  const own = p.orgId === game.orgId;
  const section = (title, ...body) => h('div', { class: 'cm-pad' }, h('div', { class: 'cm-h' }, title), ...body);
  return h('div', { class: 'sr-big' },
    section(`Report on ${fullName(p)}`,
      h('p', { class: stale(rep) ? 'cm-s' : 'y' }, reportText(p, rep)),
      own ? h('p', { class: 'cm-s' }, `${rep.scout}, today. He is ${p.age} and plays ${mainPos(p)}.`) : h('p', { class: 'cm-s' }, `Filed by ${rep.scout}, ${ageWords(rep)}${stale(rep) ? ' (out of date)' : ''}. He was ${rep.age} then and plays ${mainPos(p)}.`)),
    section('Strengths and weaknesses',
      h('p', {}, best.length ? `Strengths: ${best.map(line).join(', ')}.` : 'No ratings stand out as strengths.'),
      h('p', {}, worst.length ? `Weaknesses: ${worst.map(line).join(', ')}.` : 'No ratings stand out as weaknesses.')),
    styleHints(p, view).length ? section('How he plays', h('p', {}, styleHints(p, view).join(' '))) : null,
    own ? null : section('How far to trust it', ...trust.map((t) => h('p', {}, t)),
      h('p', { class: 'cm-s' }, p.orgId === game.orgId ? 'Your coaches see him every day, so this is as close to the truth as the club can get.' : 'The ratings on his Profile page are this scout\'s reading, not the true figures. A second scout can confirm or contradict him.')),
    p.orgId === game.orgId ? null : h('div', { class: 'cm-pad btnrow' },
      h('button', { class: 'cm-btn', onClick: () => { toast(requestScouting(p)); redraw(); } }, 'Ask for a fresh look')));
}
