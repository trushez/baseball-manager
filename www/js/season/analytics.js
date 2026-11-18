// The analytics department. Spending on it sharpens the club's judgement of players (scouts' reports are less wrong),
// speeds development a little, and gives you a monthly note on your own players. It is not free: the money comes out
// of its own budget line, the owner has views on it, the old hands in the clubhouse resent it, a good analyst can be
// poached by a rival, and the returns flatten out after the third level, so the fifth costs far more than it gives back.
import { Rng } from '../core/rng.js';
import { game, orgState } from '../state.js';
import { fullName } from '../data/world.js';
import { message, onLater, later } from './inbox.js';
import { extraFor, owner } from './finance.js';
import { dayNo } from './calendar.js';
import { proneness } from './injuries.js';
import { value } from './value.js';
import { caOf } from './ability.js';
import { seen } from './scouting.js';
import { mainPos, isPitcher } from '../data/world.js';
import { attrValue, defence } from '../data/attributes.js';
import { activePlayers, offence } from '../club/depth.js';

export const LEVELS = [
  { label: 'None', cost: 0, edge: 0, words: 'Nobody looks at the numbers beyond the box score.' },
  { label: 'Spreadsheets', cost: 0.5e6, edge: 0.35, words: 'An intern and a licence for the league data. Enough to stop you embarrassing yourself.' },
  { label: 'Small group', cost: 1.4e6, edge: 0.62, words: 'Two analysts who sit near the coaches and are asked a question now and then.' },
  { label: 'Full department', cost: 2.8e6, edge: 0.82, words: 'Six people, a modelling team and a seat at the trade table.' },
  { label: 'Data science lab', cost: 4.8e6, edge: 0.94, words: 'Pitch tracking in every park, biomechanics, a lab of its own. Most of the clubhouse regards it as a cult.' },
  { label: 'Everything tracked', cost: 7.5e6, edge: 1, words: 'Every swing, every sleep cycle, every meal. The last step buys very little for a great deal.' },
];
const rankOf = (orgId) => game.world.mlb.slice().sort((a, b) => (b.payroll2026 || 0) - (a.payroll2026 || 0)).findIndex((c) => c.org === orgId);

/** The level a club runs. Computer clubs have what their payroll rank suggests; yours is what you set. */
export function levelOf(orgId = game.orgId) {
  if (orgId === game.orgId) return game.staff?.[orgId]?.analytics ?? 0;
  const r = rankOf(orgId);
  return r < 0 ? 1 : r < 8 ? 3 : r < 20 ? 2 : 1;
}
/** 0 to 1: how much the department is delivering today. Falls while an analyst has been poached. */
export function edgeFor(orgId = game.orgId) {
  const e = LEVELS[levelOf(orgId)].edge;
  const hit = orgId === game.orgId && game.staff?.[orgId]?.analyticsHit;
  return hit && hit > dayNo(game.date) ? e * 0.5 : e;
}
export const analyticsCost = (orgId = game.orgId) => LEVELS[levelOf(orgId)].cost;
export const analyticsBudget = (orgId = game.orgId) => {
  const r = Math.max(0, rankOf(orgId));
  return Math.round((0.6e6 + (1 - r / 29) * 2.6e6) / 5e4) * 5e4 + extraFor(orgId, 'analytics');
};

/** Change the level. Going up needs the money under the budget; going down is always allowed. */
export function setAnalytics(level) {
  const S = ((game.staff ||= {})[game.orgId] ||= {});
  const cur = levelOf();
  if (level === cur) return 'No change.';
  if (LEVELS[level].cost > analyticsBudget()) return `No: ${LEVELS[level].label} costs ${(LEVELS[level].cost / 1e6).toFixed(1)}M a year against a budget of ${(analyticsBudget() / 1e6).toFixed(1)}M. Ask the owner for more first.`;
  S.analytics = level;
  S.analyticsSince = dayNo(game.date);
  if (level < cur && cur >= 3) S.analyticsHit = dayNo(game.date) + 45; // laying people off costs you a while
  return level > cur ? `The club now runs ${LEVELS[level].label.toLowerCase()}.` : `The department is cut to ${LEVELS[level].label.toLowerCase()}.${cur >= 3 ? ' It will take a month and a half to settle.' : ''}`;
}

/** What the department's numbers do to a scout's error: up to a fifth narrower at the top. */
export const errorScale = (orgId = game.orgId) => 1 - 0.2 * edgeFor(orgId);
/** And to growth: up to 7% faster for those still improving, up to 5% slower for those declining. */
export const growthScale = (orgId) => 1 + 0.07 * edgeFor(orgId);
export const declineScale = (orgId) => 1 - 0.05 * edgeFor(orgId);

// ---------- the monthly note, and the price ----------

const pick = (rng, a) => a[rng.int(0, a.length - 1)];
const OLD_HANDS = ['a pitching coach of thirty years', 'the bench coach', 'a veteran catcher', 'the hitting coach', 'a clubhouse leader'];
const SPOKEN = [
  (a) => `"If I wanted a spreadsheet to tell me what a pitcher is feeling, I would have married an accountant," says ${a}.`,
  (a) => `${a} was heard asking the analysts whether their model could also tell him when to bunt, and then asking why not.`,
  (a) => `${a} has taken to calling the analytics room "the aquarium" because everyone in it stares at a screen and nobody has seen them eat.`,
];

/** Once a month in season: the department's note, and the costs of having one. */
export function analyticsMonth() {
  const lv = levelOf();
  if (lv === 0 || !game.season) return;
  const S = game.staff[game.orgId];
  const rng = new Rng(`analytics-${game.year}-${game.date.getMonth()}-${game.manager}`);
  const me = game.world.orgs.get(game.orgId);
  const mine = me.players.filter((p) => ['MLB', 'AAA'].includes(orgState(game.orgId).level.get(p.id)));
  const rec = game.season.records.get(game.orgId);
  const pct = rec && rec.w + rec.l ? rec.w / (rec.w + rec.l) : 0.5;
  const lines = [];

  // what it tells you
  const hurtRisk = mine.filter((p) => !p.injury).sort((a, b) => proneness(b) - proneness(a)).slice(0, lv >= 3 ? 3 : 1);
  if (lv >= 2 && hurtRisk.length) lines.push(`Workload: the models would rest ${hurtRisk.map((p) => `${fullName(p)} (${p.pos || 'P'})`).join(', ')} more than usual. Their movement patterns look like the ones that come before a strain.`);
  const risers = mine.filter((p) => (p.dvYear || 0) > 0.8).sort((a, b) => b.dvYear - a.dvYear).slice(0, 2);
  if (lv >= 2 && risers.length) lines.push(`Trend: ${risers.map((p) => fullName(p)).join(' and ')} ${risers.length === 1 ? 'is' : 'are'} improving faster than the box score shows.`);
  if (lv >= 3) {
    const others = game.world.list.filter((p) => p.orgId !== game.orgId && p.club && !p.retired && !p.injury && (p.contract?.aav ?? 0) > 0);
    const gem = others.map((p) => ({ p, v: value(p) - (p.contract.aav / 5e5) })).sort((a, b) => b.v - a.v)[0];
    if (gem) lines.push(`Market: ${fullName(gem.p)} of ${gem.p.club.city} produces far more than he is paid. Worth a call.`);
  }
  if (lv >= 4) lines.push('Biomechanics: the lab has flagged two pitchers whose release point has drifted. The coaches have their copies and have not yet looked at them.');
  // what the models suggest about the roster, in words: fewer at lower levels, and always only a suggestion
  const ideas = lv >= 2 ? insights().sort(() => rng.next() - 0.5).slice(0, lv >= 4 ? 3 : lv >= 3 ? 2 : 1) : [];
  if (lv >= 2 && (lines.length || ideas.length)) message({ cat: 'club', title: `Analytics: the month's note`, body: `${LEVELS[lv].label}. ${[...lines, ...ideas.map((x) => `Roster: ${x.text}`)].join('\n\n')}`, ...(ideas.length ? { search: ideas.map((x) => x.search) } : {}) });

  // what it costs: the owner
  const own = owner(game.orgId);
  if (own.style === 'cheap' && lv >= 3 && rng.next() < 0.35) {
    own.conf = Math.max(0, (own.conf ?? 60) - 3);
    message({ cat: 'club', title: 'The owner questions the analytics bill', body: `He has seen what the department costs and wants to know what it has done for the club. "Six people to tell us the shortstop is good," he says. His confidence in you has dropped a little.` });
  } else if (own.style === 'spender' && lv >= 3 && pct > 0.55 && rng.next() < 0.3) {
    own.conf = Math.min(100, (own.conf ?? 60) + 2);
    message({ cat: 'club', title: 'The owner likes the department', body: 'He told a dinner table that the club is run on the best information in the game. He has gone on telling people since.' });
  }
  // the clubhouse
  if (lv >= 4 && pct < 0.5 && rng.next() < 0.5) {
    const hands = mine.filter((p) => (p.age ?? 0) >= 31);
    const who = hands.slice(rng.int(0, Math.max(0, hands.length - 2))).slice(0, 2);
    for (const p of who) p.mood = Math.max(0, (p.mood ?? 60) - 4);
    message({ cat: 'club', title: 'Grumbling about the data room', body: `${pick(rng, SPOKEN)(pick(rng, OLD_HANDS))}${who.length ? ` ${who.map(fullName).join(' and ')} are the ones saying it loudest, and neither is happy at being asked to wear another sensor.` : ''} With the club under .500 it carries more weight than it would.` });
  }
  // the rival who hires your analyst
  if (lv >= 3 && !(S.analyticsHit > dayNo(game.date)) && rng.next() < (lv >= 5 ? 0.12 : 0.07)) {
    S.analyticsHit = dayNo(game.date) + 60;
    const rival = game.world.mlb.filter((c) => c.org !== game.orgId)[rng.int(0, 28)] ?? game.world.mlb[0];
    message({ cat: 'club', title: `${rival.city} take your head of analytics`, body: `${rival.city} have hired away the analyst who ran your models, at a salary your budget could not match. The department will be at about half strength for two months while the rest of the group works out how his code runs.` });
  }
}

// ---------- scout stories ----------


onLater('scoutHunch', (m) => {
  const p = game.world.players.get(m.pid);
  const s = (game.staff?.[game.orgId]?.scouts || []).find((x) => x.id === m.scoutId);
  if (!p || p.retired) return;
  const gain = caOf(p) - m.ca;
  const who = s ? s.name : 'Your former scout';
  const good = gain >= 8;
  message({ cat: 'club', player: p.id, quiet: false, title: `${who}'s hunch on ${fullName(p)}: ${good ? 'it came off' : gain <= 2 ? 'it did not' : 'still open'}`,
    body: good ? `Four months ago ${who} told you he liked ${fullName(p)}. He has improved a good deal since, and ${who} has been reminding everyone about it in the dining room.` : gain <= 2 ? `${who} backed ${fullName(p)} four months ago. Nothing much has happened: no progress at all. ${who} says he needs a year.` : `${who} backed ${fullName(p)} four months ago and he has improved, though not by as much as the report suggested. ${who} says that is how it starts.` });
});

/** Daily: the odd story about your scouts. Real effects only when a scout is poached or retires or a hunch is filed. */
export function scoutNews(d = dayNo(game.date)) {
  const scouts = game.staff?.[game.orgId]?.scouts || [];
  if (!scouts.length || !game.season) return;
  const rng = new Rng(`scoutnews-${d}-${game.manager}`);
  if (rng.next() > 0.11) return;
  const s = scouts[rng.int(0, scouts.length - 1)];
  const kind = rng.next();
  if (kind < 0.28) {
    // a hunch: he likes a young player in your system, and you hear how it goes
    const me = game.world.orgs.get(game.orgId);
    const kids = me.players.filter((p) => (p.age ?? 30) <= 22 && !['MLB'].includes(orgState(game.orgId).level.get(p.id)));
    if (!kids.length) return;
    const p = kids[rng.int(0, kids.length - 1)];
    message({ cat: 'club', player: p.id, title: `${s.name} has a hunch about ${fullName(p)}`, body: `${s.name} came into the office unprompted. "That ${fullName(p)} kid. Everyone looks at his numbers. I looked at his feet," he says. He will not say what he saw in them, only that you should watch him over the summer.` });
    later(120, { kind: 'scoutHunch', pid: p.id, scoutId: s.id, ca: caOf(p) });
  } else if (kind < 0.42 && s.ja + s.jp >= 22 && scouts.length > 1) {
    const rival = game.world.mlb.filter((c) => c.org !== game.orgId)[rng.int(0, 28)];
    if (!rival) return;
    const stays = rng.next() < 0.5 + (s.wage > 1.2e6 ? 0.2 : 0);
    if (!stays) {
      game.staff[game.orgId].scouts = scouts.filter((x) => x !== s);
      message({ cat: 'club', title: `${s.name} leaves for ${rival.city}`, body: `${s.name} has taken a job with ${rival.city}. He rang you from the car park. His reports stay on file, but you will want to replace him, and the better scouts will have noticed.` });
    }
  } else if (kind < 0.5 && scouts.length > 2) {
    game.staff[game.orgId].scouts = scouts.filter((x) => x !== s);
    message({ cat: 'club', title: `${s.name} retires`, body: `${s.name} has decided that his knees will not take another summer in the stands. He leaves a binder on every player he never got round to telling you about, and asks that someone look at the fourth one.` });
  }
}

// ---------- what the department notices about your club ----------

export const STYLE_WORDS = { gb: 'Ground ball', fb: 'Fly ball', '': '' };
/** A hitter's or pitcher's batted-ball style in words. The figures behind it are never shown. */
export function styleOf(p) {
  const s = seen(p); // the fog applies: nothing is known about a player nobody has watched
  if (s.mode === 'partial') return '';
  const r = s.v.r;
  const v = isPitcher(p) ? r?.pgb : r?.gb;
  if (v == null) return '';
  return v >= 57 ? 'gb' : v <= 43 ? 'fb' : '';
}
const avg = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);

/** Things the numbers suggest, in words, each with a search that finds the sort of player meant. Never the figures themselves. */
export function insights() {
  const o = game.world.orgs.get(game.orgId), st = orgState(game.orgId);
  const act = activePlayers(o, st);
  const hit = act.filter((p) => !isPitcher(p)).sort((a, b) => offence(b) - offence(a)).slice(0, 9);
  const pit = act.filter(isPitcher);
  const out = [];
  if (hit.length >= 7) {
    const inf = hit.filter((p) => ['1B', '2B', '3B', 'SS'].includes(mainPos(p))).map((p) => defence(p) ?? 11);
    const of = hit.filter((p) => ['LF', 'CF', 'RF'].includes(mainPos(p))).map((p) => defence(p) ?? 11);
    if (inf.length >= 3 && of.length >= 2) {
      const d = avg(inf) - avg(of);
      if (d >= 1.5) out.push({ text: `Your infield is the better defensive group. A ground-ball pitcher would keep more of his outs on that side of the field.`, search: { label: 'Find ground-ball pitchers', preset: { group: 'pit', style: 'gb', level: 'MLB' } } });
      else if (d <= -1.5) out.push({ text: `Your outfield covers more ground than your infield. A fly-ball pitcher would make use of it.`, search: { label: 'Find fly-ball pitchers', preset: { group: 'pit', style: 'fb', level: 'MLB' } } });
    }
    const gbN = hit.filter((p) => styleOf(p) === 'gb').length, fbN = hit.filter((p) => styleOf(p) === 'fb').length;
    if (gbN >= 4) out.push({ text: `Too many of your regular hitters put the ball on the ground. A bat that lifts it would take some pressure off the double play.`, search: { label: 'Find fly-ball hitters', preset: { group: 'bat', style: 'fb', level: 'MLB', key: 'power', min: '12' } } });
    else if (fbN >= 4) out.push({ text: `Your lineup lives on fly balls and the park does not always help. One hitter who keeps the ball down would add another way to get on base.`, search: { label: 'Find ground-ball hitters', preset: { group: 'bat', style: 'gb', level: 'MLB', key: 'speed', min: '12' } } });
    const lefts = hit.filter((p) => p.bats === 'L').length, rights = hit.filter((p) => (p.bats || 'R') === 'R').length;
    if (rights >= 7) out.push({ text: `Seven or more of your regulars bat right-handed. Left-handed pitchers will look forward to facing you.`, search: { label: 'Find left-handed bats', preset: { group: 'bat', bats: 'L', level: 'MLB' } } });
    else if (lefts >= 6) out.push({ text: `Your lineup leans left, and a good left-hander out of the bullpen can take most of it out of the game.`, search: { label: 'Find right-handed bats', preset: { group: 'bat', bats: 'R', level: 'MLB' } } });
    const eye = avg(hit.map((p) => attrValue(p, 'eye') ?? 11));
    if (eye < 9.5) out.push({ text: `Your hitters see the ball well enough but chase too much. A patient bat at the top of the order would lift the whole lineup.`, search: { label: 'Find patient hitters', preset: { group: 'bat', key: 'eye', min: '14', level: 'MLB' } } });
  }
  const pen = pit.filter((p) => p.role !== 'Starter');
  if (pen.length >= 4 && avg(pen.map((p) => attrValue(p, 'stuff') ?? 11)) < 10) out.push({ text: `The bullpen gets hit too often when it is asked to protect a lead. A reliever with real swing-and-miss would change the late innings.`, search: { label: 'Find strong relievers', preset: { group: 'pit', pos: 'RP', key: 'stuff', min: '14', level: 'MLB' } } });
  return out;
}
