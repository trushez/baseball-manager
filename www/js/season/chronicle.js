// The story of a season told as a chapter of a book, written once the World Series is over from what the game recorded:
// the winter, the first month, the summer, the deadline, the players who carried the year, September and October.
// Kept in game.chronicles[year] as a title and paragraphs, so it can be read years later.
import { game } from '../state.js';
import { Rng } from '../core/rng.js';
import { fullName, mainPos, isPitcher, money } from '../data/world.js';
import { keyDates, dayNo, fromDayNo, monthName } from './calendar.js';
import { divisions } from './standings.js';
import { ledger } from './ledger.js';
import { clubYear } from './review.js';
import { leadersText, namer, notes, lineupText, staffText, fixturesText, seriesGames, roundText, lastYearText, managerText, moneyText, profile } from './chronicle-detail.js';

const P = (id) => game.world.players.get(id);
const city = (id) => game.world.orgs.get(id)?.club.city ?? id;
const nickOf = (id) => `the ${game.world.orgs.get(id)?.club.name ?? city(id)}`;
const nth = (n) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] || 'th'}`;
const list = (a) => (a.length <= 1 ? a.join('') : `${a.slice(0, -1).join(', ')} and ${a.at(-1)}`);
const dayWords = (d) => { const t = fromDayNo(d); return `${t.getDate()} ${monthName(t)}`; };
const POST = { WC: 'the wild card series', DS: 'the division series', LCS: 'the league championship series', WS: 'the World Series' };

/** Standing in the division after the games played by a day: { place, gb, w, l }. */
function standingAt(games, orgId, cut) {
  const rec = new Map(game.world.mlb.map((c) => [c.id, { w: 0, l: 0 }]));
  for (const g of games) {
    if (g.d > cut || !g.s) continue;
    const away = g.s[0], home = g.s[1];
    if (away === home) continue;
    const h = rec.get(g.home), a = rec.get(g.away);
    if (!h || !a) continue;
    if (home > away) { h.w++; a.l++; } else { a.w++; h.l++; }
  }
  const div = [...divisions().values()].find((ids) => ids.includes(orgId)) || [];
  const pct = (r) => (r.w + r.l ? r.w / (r.w + r.l) : 0);
  const sorted = div.slice().sort((x, y) => pct(rec.get(y)) - pct(rec.get(x)));
  const lead = rec.get(sorted[0]), me = rec.get(orgId);
  return { place: sorted.indexOf(orgId) + 1, gb: ((lead.w - me.w) + (me.l - lead.l)) / 2, w: me.w, l: me.l, leader: sorted[0] };
}

/** The user's games in order: { d, win, rs, ra, opp, home }. */
function gamesOf(orgId) {
  return game.season.games.filter((g) => g.level === 'MLB' && g.s && (g.home === orgId || g.away === orgId)).sort((a, b) => a.d - b.d)
    .map((g) => { const home = g.home === orgId, rs = home ? g.s[1] : g.s[0], ra = home ? g.s[0] : g.s[1]; return { d: g.d, win: rs > ra, rs, ra, opp: home ? g.away : g.home, home }; });
}

function streaks(gs) {
  let best = { win: { n: 0 }, loss: { n: 0 } }, cur = null;
  for (const g of gs) {
    if (cur && cur.win === g.win) { cur.n++; cur.to = g.d; } else cur = { win: g.win, n: 1, from: g.d, to: g.d };
    const k = cur.win ? 'win' : 'loss';
    if (cur.n > best[k].n) best[k] = { ...cur };
  }
  return best;
}

function months(gs) {
  const m = new Map();
  for (const g of gs) {
    const t = fromDayNo(g.d), k = Math.max(3, t.getMonth());
    const r = m.get(k) || { w: 0, l: 0 }; g.win ? r.w++ : r.l++; m.set(k, r);
  }
  return [...m.entries()].sort((a, b) => a[0] - b[0]).map(([k, r]) => ({ name: monthName(new Date(2000, k, 1)), ...r }));
}

const who = (p) => `${fullName(p)} (${isPitcher(p) ? (p.role === 'Starter' ? 'SP' : 'RP') : mainPos(p)}, ${p.age})`;

/** The moves your club made in a year, from the ledger and each player's own path. */
function moves(orgId, y, opening) {
  const L = ledger().moves.filter((m) => m.year === y && (m.to === orgId || m.from === orgId));
  const pre = L.filter((m) => m.day < opening), inn = L.filter((m) => m.day >= opening);
  const arr = (a) => a.filter((m) => m.to === orgId && P(m.pid)).sort((a1, b1) => b1.v - a1.v);
  const dep = (a) => a.filter((m) => m.from === orgId && P(m.pid)).sort((a1, b1) => b1.v - a1.v);
  // contracts that ran out or players cut loose, who were worth keeping
  const winterStart = dayNo(new Date(y - 1, 10, 1));
  const left = [];
  for (const p of game.world.list) {
    for (const m of p.mv || []) if (m.from === orgId && ['expired', 'released', 'nontender'].includes(m.how) && m.d >= winterStart && m.d < opening && !m.to) left.push({ p, how: m.how });
  }
  return { preIn: arr(pre), preOut: dep(pre), inIn: arr(inn), inOut: dep(inn), left };
}

const tradeLine = (m, side) => {
  const p = P(m.pid);
  return m.t === 'trade' ? `${who(p)} ${side === 'in' ? `from ${city(m.from)}` : `to ${city(m.to)}`}` : `${who(p)}${m.terms ? ` (${m.terms})` : ''}`;
};

const NUM = ['none', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve'];
const num = (n) => NUM[n] ?? String(n);
const POSW = { C: 'catcher', '1B': 'first baseman', '2B': 'second baseman', '3B': 'third baseman', SS: 'shortstop', LF: 'left fielder', CF: 'center fielder', RF: 'right fielder', DH: 'designated hitter', P: 'pitcher' };
const kind = (p) => (isPitcher(p) ? (p.role === 'Starter' ? 'starter' : p.role === 'Closer' ? 'closer' : 'reliever') : POSW[mainPos(p)] || 'player');
const an = (n) => (/^(8|11|18)/.test(String(n)) ? 'an' : 'a');
/** "Chase Harlan, a 28-year-old third baseman". */
const desc = (p) => `${fullName(p)}, ${an(p.age)} ${p.age}-year-old ${kind(p)}`;
/** "8 y/$402M (35-42)" as "eight years and $402 million". */
const dealWords = (t) => {
  const m = /^(\d+) y\/\$([\d.]+)([MK]?)/.exec(t || '');
  return m ? `${num(+m[1])} year${m[1] === '1' ? '' : 's'} and $${m[2]}${m[3] === 'M' ? ' million' : m[3] === 'K' ? ',000' : ''}` : '';
};
const rate = (v) => v.toFixed(3).replace(/^0/, '');
const wlWords = (w, l) => `${w}-${l}`;

/** A series in a sentence: "two games to none", "in seven games". */
const seriesWords = (s, orgId) => {
  const mine = s.hi === orgId ? s.hiW : s.loW, theirs = s.hi === orgId ? s.loW : s.hiW;
  const hi = Math.max(mine, theirs), lo = Math.min(mine, theirs), n = mine + theirs;
  return { mine, theirs, n, sweep: lo === 0 && n >= 3, decider: hi === lo + 1 && n >= 5 && (n === 5 || n === 7), score: `${hi}-${lo}` };
};

export function writeChronicle(orgId = game.orgId) {
  const S = game.season, y = S.year;
  const Y = clubYear(orgId, y);
  if (!Y) return null;
  const rng = new Rng(`chronicle-${y}-${orgId}`);
  const kd = keyDates(y), opening = dayNo(kd.opening);
  const gs = gamesOf(orgId);
  const out = [];
  const club = city(orgId);
  const nick = game.world.orgs.get(orgId)?.club.name || club;
  const { c, prev } = Y;
  const mgr = orgId === game.orgId && game.manager ? game.manager : '';
  const mgrLast = mgr.split(' ').pop();

  const pick = (a) => rng.pick(a);
  const mv = moves(orgId, y, opening);
  const arrived = new Set(mv.preIn.map((m) => P(m.pid)));
  const winterMan = (p) => (arrived.has(p) ? ' (a winter arrival)' : '');
  const arc = (a, b) => (b.place < a.place ? 'climbed' : b.place > a.place ? 'slipped' : 'held');
  const part = (text) => text && out.push({ head: '', text });

  const series = (Y.H.series || []).filter((x) => x.hi === orgId || x.lo === orgId);
  const champ = c.post === 'Champions';
  const ws = series.find((x) => x.round === 'WS');
  const wsLost = ws && ws.winner !== orgId;
  const made = champ || series.length > 0 || !!Y.post;
  const swing = prev ? c.w - prev.w : 0;
  const kindOfYear = champ ? 'champion' : wsLost ? 'pennant' : made ? 'october' : c.place <= 2 && c.gb <= 7 ? 'near' : swing >= 8 ? 'climb' : 'down';
  const wsMargin = wsLost ? Math.abs(seriesWords(ws, orgId).mine - seriesWords(ws, orgId).theirs) : 0;
  const TITLES = {
    champion: ['The Year It Came Together', 'All the Way', 'The Last Game of the Year'],
    pennant: wsMargin === 1 ? ['One Game Short', 'The Seventh Game'] : ['So Near the Top', 'A Pennant and Nothing More'],
    october: ['A Short October', 'The Wild Card Road', 'Back in the Playoffs'],
    near: ['The Summer That Got Away', 'Close, and Not Close Enough'],
    climb: ['Better, Not Yet Good Enough', 'The Climb'],
    down: ['A Year to Get Through', 'Waiting on Better Days'],
  };
  const title = pick(TITLES[kindOfYear]);
  const chapter = Object.keys(game.history || {}).filter((k) => +k <= y && game.history[k]?.clubs?.[orgId]).length || 1;

  const nm = namer();
  // the prologue: last year, the manager, and what this one was meant to be
  {
    const t = [];
    const ly = lastYearText(orgId, y, pick);
    if (ly) t.push(ly);
    const mt = managerText(orgId, y, pick);
    if (mt) t.push(mt);
    const ask = !prev ? `Nobody at ${club} could say yet what the ${nick} were.`
      : prev.post === 'Champions' ? pick(['The question for the new year was plain enough: could it be done again?', `The ${nick} were the team everybody else now had to beat, and nobody in the league was going to make it easy.`])
        : prev.w >= 90 ? pick(['The window looked open, and the work of the winter was to keep it that way.', 'There was no reason to tear anything down, and several reasons to push for more.'])
          : prev.w >= 81 ? pick(['The club was close enough to contention that a few good moves might make the difference.', 'It was a team stuck in the middle, and the middle is a hard place to leave.'])
            : pick([`There was a lot of work to do, and not much of it would be quick.`, 'The honest view inside the building was that the roster needed more than a patch.']);
    t.push(ask);
    part(t.join(' '));
  }

  // the winter
  {
    const t = [];
    if (mv.preIn.length) {
      const top = mv.preIn.slice(0, 3).map((m) => {
        const pl = P(m.pid);
        if (m.t === 'sign') { const d = dealWords(m.terms); return `${desc(pl)}, signed as a free agent${d ? ` for ${d}` : ''}`; }
        return `${desc(pl)}, who came over from ${city(m.from)} in a trade`;
      });
      t.push(`${pick(['The main business came early.', 'The front office moved first and mostly for names.', 'The market was kind enough to offer a few answers.'])} ${top.length > 1 ? `The arrivals were ${top.slice(0, -1).join('; ')}; and ${top.at(-1)}` : `The arrival was ${top[0]}`}${mv.preIn.length > 3 ? (mv.preIn.length === 4 ? '. One more player came in to fill out the depth' : `. ${num(mv.preIn.length - 3).replace(/^./, (ch) => ch.toUpperCase())} more players came in to fill out the depth`) : ''}.`);
    } else t.push('Nobody of note came in, and the winter passed without much to show for it.');
    const gone = mv.preOut.slice(0, 3).map((m) => `${fullName(P(m.pid))} to ${city(m.to)}`);
    const walked = mv.left.filter((x) => x.p.contract?.status !== 'signed' || x.p.orgId !== orgId).slice(0, 3).map((x) => fullName(x.p));
    if (gone.length && walked.length) t.push(`Going the other way were ${list(gone)}, traded to make room, while ${list(walked)} left when ${walked.length === 1 ? 'his contract ran' : 'their contracts ran'} out.`);
    else if (gone.length) t.push(`Going the other way were ${list(gone)}, traded to make room.`);
    else if (walked.length) t.push(`${list(walked)} left when ${walked.length === 1 ? 'his contract ran' : 'their contracts ran'} out, and the club let ${walked.length === 1 ? 'him' : 'them'} go.`);
    part(t.join(' '));
  }

  // the money
  {
    const m = moneyText(orgId, y, pick);
    part(m);
  }

  // the people: the faces the year turned on, with the history they brought
  {
    const faces = [];
    const add = (p) => { if (p && !faces.includes(p)) faces.push(p); };
    add(mv.preIn.find((m) => m.t === 'sign' && P(m.pid))?.pid && P(mv.preIn.find((m) => m.t === 'sign' && P(m.pid)).pid));
    add(Y.bat[0]?.p); add(Y.pit[0]?.p); add(Y.bat[1]?.p);
    const t = faces.slice(0, 4).map((p) => profile(p, orgId, y, nm)).filter(Boolean);
    if (t.length) part(`Some of the people the year would turn on. ${t.join(' ')}`);
    const lu = lineupText(orgId, y, nm, winterMan), st = staffText(orgId, y, nm, winterMan);
    if (lu || st) part([lu, st].filter(Boolean).join(' '));
  }

  // the first month
  if (gs.length >= 30) {
    const first = gs.slice(0, 30), w30 = first.filter((g) => g.win).length;
    const s30 = standingAt(S.games, orgId, first[29].d);
    const open = gs.slice(0, 6), ow = open.filter((g) => g.win).length;
    const where = s30.place === 1 ? 'on top of the division' : `${nth(s30.place)} in the division, ${s30.gb} games back`;
    const opener = ow >= 5 ? `They opened on ${dayWords(opening)} and answered every doubt at once, winning ${num(ow)} of the first ${num(open.length)}`
      : ow <= 1 ? `They opened on ${dayWords(opening)} and lost ${num(open.length - ow)} of the first ${num(open.length)}, which made for an uncomfortable start`
        : `They opened on ${dayWords(opening)} and split the first week, ${num(ow)} wins in ${num(open.length)} games`;
    const rest = w30 >= 20 ? `and the pace never dropped, so that after 30 games they stood ${wlWords(w30, 30 - w30)} and ${where}`
      : w30 >= 17 ? `and they settled into a good rhythm, standing ${wlWords(w30, 30 - w30)} after 30 games and ${where}`
        : w30 >= 14 ? `and neither side of the ball found much rhythm, which left them ${wlWords(w30, 30 - w30)} after 30 games and ${where}`
          : w30 >= 11 ? `and the hole only got deeper, until they were ${wlWords(w30, 30 - w30)} after 30 games and ${where}`
            : `and it did not improve, with the team ${wlWords(w30, 30 - w30)} after 30 games and ${where}`;
    part(`${opener}, ${rest}.`);
  }

  // the summer
  const mon = months(gs), st = streaks(gs);
  const full = mon.filter((m) => m.w + m.l >= 15);
  const mbest = full.slice().sort((a, b) => b.w / (b.w + b.l) - a.w / (a.w + a.l))[0], mworst = full.slice().sort((a, b) => a.w / (a.w + a.l) - b.w / (b.w + b.l))[0];
  const asb = standingAt(S.games, orgId, dayNo(kd.asbStart)), dl = standingAt(S.games, orgId, dayNo(kd.deadline)), sep = standingAt(S.games, orgId, dayNo(kd.september) - 1); // going into September: the games up to the last day of August
  const pos = (x) => (x.place === 1 ? `first at ${wlWords(x.w, x.l)}` : `${nth(x.place)} at ${wlWords(x.w, x.l)}, ${x.gb} games behind ${nickOf(x.leader)}`);
  {
    const t = [];
    t.push(`By the All-Star break the ${nick} were ${pos(asb)}.`);
    const runs = [];
    if (st.win.n >= 6) runs.push(`a run of ${num(st.win.n)} straight wins from ${dayWords(st.win.from)} to ${dayWords(st.win.to)}`);
    if (st.loss.n >= 6) runs.push(`a slide of ${num(st.loss.n)} straight defeats from ${dayWords(st.loss.from)} to ${dayWords(st.loss.to)}`);
    if (runs.length) t.push(`The year had its swings, among them ${list(runs)}.`);
    const bigW = gs.filter((g) => g.win).sort((a1, b1) => (b1.rs - b1.ra) - (a1.rs - a1.ra))[0], bigL = gs.filter((g) => !g.win).sort((a1, b1) => (b1.ra - b1.rs) - (a1.ra - a1.rs))[0];
    const nights = [];
    if (bigW && bigW.rs - bigW.ra >= 8) nights.push(`the loudest night was ${an(bigW.rs)} ${bigW.rs}-${bigW.ra} win over ${nickOf(bigW.opp)} on ${dayWords(bigW.d)}`);
    if (bigL && bigL.ra - bigL.rs >= 8) nights.push(`the ugliest was ${an(bigL.rs)} ${bigL.rs}-${bigL.ra} loss to ${nickOf(bigL.opp)} on ${dayWords(bigL.d)}`);
    if (nights.length) t.push(`${nights.join(', and ').replace(/^./, (ch) => ch.toUpperCase())}.`);
    const one = gs.filter((g) => Math.abs(g.rs - g.ra) === 1), oneW = one.filter((g) => g.win).length;
    if (one.length >= 40) { const r = oneW / one.length; t.push(`They played ${one.length} one-run games, winning ${oneW} and losing ${one.length - oneW}${r >= 0.56 ? ', and they won more than their share' : r <= 0.44 ? ', and they lost more than their share' : ', which settled very little'}.`); }
    {
      const rivals = ([...divisions().values()].find((ids) => ids.includes(orgId)) || []).filter((id) => id !== orgId);
      const fx = fixturesText(gs, orgId, rivals, pick);
      if (fx) t.push(fx);
    }
    {
      const ends = [[4, 'April'], [5, 'May'], [6, 'June'], [7, 'July'], [8, 'August']].map(([mo, name]) => {
        const cut = dayNo(new Date(y, mo, 0)); const x = standingAt(S.games, orgId, cut);
        const m = mon.find((q) => q.name === name);
        return m && x.w + x.l > 20 ? `${name} closed with them ${x.place === 1 ? 'in first' : `${nth(x.place)}, ${x.gb} back`} at ${wlWords(x.w, x.l)} (${wlWords(m.w, m.l)} for the month)` : null;
      }).filter(Boolean);
      if (ends.length) t.push(`The calendar told the story in order. ${ends.join('; ')}.`);
    }
    if (mbest && mworst && mbest !== mworst) t.push(`${mbest.name} turned out to be the best month at ${wlWords(mbest.w, mbest.l)}, and ${mworst.name}, at ${wlWords(mworst.w, mworst.l)}, was the one they would most like back.`);
    part(t.join(' '));
  }

  // the deadline and the moves made during the year
  {
    const t = [];
    const dlWord = dl.place === 1 ? 'were in front' : dl.place <= 3 && dl.gb <= 5 ? 'still had a chance' : 'were out of the race';
    const contending = dl.place === 1 || (dl.place <= 3 && dl.gb <= 5);
    t.push(`When the trade deadline came they ${dlWord}, ${pos(dl)}, having ${arc(asb, dl)} since the break.`);
    if (mv.inIn.length) t.push(`${mgrLast ? `${mgrLast}'s` : 'The'} club ${contending ? 'went shopping' : 'looked ahead'} anyway, adding ${list(mv.inIn.slice(0, 3).map((m) => (m.t === 'sign' ? fullName(P(m.pid)) : `${fullName(P(m.pid))} from ${city(m.from)}`)))}${contending ? ' to push for the title' : ' with next year in mind'}${mv.inOut.length ? `, and sending ${list(mv.inOut.slice(0, 3).map((m) => `${fullName(P(m.pid))} to ${city(m.to)}`))} the other way` : ''}.`);
    else if (mv.inOut.length) t.push(`The club sent ${list(mv.inOut.slice(0, 3).map((m) => `${fullName(P(m.pid))} to ${city(m.to)}`))} away and added nobody of note in return.`);
    const dr = game.drafts?.[y]?.picks?.find((x) => x[1] === orgId);
    if (dr) t.push(`In June the draft had brought ${dr[4]}, ${dr[6] ? 'a high school' : 'a college'} ${POSW[dr[5]] || 'player'}, as the first pick.`);
    part(t.join(' '));
  }

  // who carried the year
  {
    const t = [];
    const b0 = Y.bat[0], b1 = Y.bat[1], p0 = Y.pit[0];
    {
      const cl = Object.values(Y.H.clubs || {}), n = cl.length;
      const rsRank = 1 + cl.filter((x) => x.rs > c.rs).length, raRank = 1 + cl.filter((x) => x.ra < c.ra).length;
      const g = c.w + c.l || 162, avgRs = cl.reduce((a1, x) => a1 + x.rs, 0) / n / g;
      const id = raRank <= 5 && rsRank > n / 2 ? `This was a team that won with its pitching, allowing ${(c.ra / g).toFixed(1)} runs a game, ${raRank === 1 ? 'the fewest in the league' : `${nth(raRank)} best in the league`}, while scoring a modest ${(c.rs / g).toFixed(1)}`
        : rsRank <= 5 && raRank > n / 2 ? `This was a team that won with its bats, scoring ${(c.rs / g).toFixed(1)} runs a game, ${rsRank === 1 ? 'more than anyone in the league' : `${nth(rsRank)} in the league`}, while allowing ${(c.ra / g).toFixed(1)}`
          : rsRank <= 8 && raRank <= 8 ? `Nothing about this team was lopsided, with the offense ${nth(rsRank)} in the league at ${(c.rs / g).toFixed(1)} runs a game and the pitching ${nth(raRank)} at ${(c.ra / g).toFixed(1)}`
            : rsRank > n - 8 && raRank > n - 8 ? `Neither side of the ball carried this team, which scored ${(c.rs / g).toFixed(1)} runs a game against ${(c.ra / g).toFixed(1)} allowed` : '';
      void avgRs;
      if (id) t.push(`${id}.`);
    }
    { const lt = leadersText(orgId, y, nm); if (lt) t.push(lt); }
    if (Y.dud && Y.dud.good < 90) t.push(`${fullName(Y.dud.p)} had a harder year and never quite found his form.`);
    const aw = Y.awards.map(([k, p]) => (p ? `${fullName(p)} was named ${k}` : `the manager was named ${k}`)).slice(0, 3);
    if (aw.length) t.push(`The league noticed some of it, and ${list(aw)}.`);
    part(t.join(' '));
  }

  // September and the finish
  {
    const t = [];
    const diff = c.rs - c.ra;
    const sepNote = sep.place === 1 && dl.place !== 1 ? 'they had taken the lead' : sep.place > dl.place ? 'they had lost more ground' : sep.place < dl.place ? 'they had moved up' : 'nothing had changed';
    t.push(`Going into September ${sepNote}, ${pos(sep)}.`);
    const finish = c.place === 1 ? `They finished the job and took the ${String(c.div).replace('American League', 'AL').replace('National League', 'NL')} at ${wlWords(c.w, c.l)}` : `They finished ${nth(c.place)} at ${wlWords(c.w, c.l)}${c.gb ? `, ${c.gb} games back` : ''}`;
    const divClubs = Object.entries(Y.H.clubs || {}).filter(([, x]) => x.div === c.div).sort((a1, b1) => a1[1].place - b1[1].place);
    const top = divClubs[0], second = divClubs[1];
    const Nick = (id) => nickOf(id).replace(/^./, (ch) => ch.toUpperCase());
    const raceLine = !top ? '' : c.place === 1 && second ? `${Nick(second[0])} had pushed them to ${second[1].w}-${second[1].l}, ${second[1].gb} games back.` : c.place !== 1 ? `${Nick(top[0])} won the division at ${top[1].w}-${top[1].l}.` : '';
    t.push(`${finish}${prev && Math.abs(swing) >= 6 ? `, ${num(Math.abs(swing))} ${swing > 0 ? 'more' : 'fewer'} wins than the year before` : ''}, and a run difference of ${diff >= 0 ? '+' : ''}${diff} ${Math.abs(Y.luck) >= 4 ? `suggested they were a little ${Y.luck > 0 ? 'lucky' : 'unlucky'}` : 'said the record was about right'}.`);
    if (raceLine) t.push(raceLine);
    part(t.join(' '));
  }

  // October, series by series and game by game
  {
    const hurt = (S.postInj || []).filter((x) => x.org === orgId && P(x.pid));
    const order = 'WC DS LCS WS';
    const mine = series.slice().sort((x1, y1) => order.indexOf(x1.round) - order.indexOf(y1.round));
    if (!mine.length) {
      part(`There was no October for the ${nick} this time, and the season ended with the rest of the league still playing.`);
    }
    mine.forEach((s, i) => {
      const opp = nickOf(s.hi === orgId ? s.lo : s.hi), w = seriesWords(s, orgId), won = s.winner === orgId, stage = POST[s.round];
      const lead = i === 0 ? pick([`October opened with ${stage}, and ${opp} were the opponent`, `The road through October began in ${stage}, with ${opp} in the way`])
        : pick([`Then came ${opp} in ${stage}`, `${opp} waited in ${stage}`, `${stage.replace(/^./, (ch) => ch.toUpperCase())} brought ${opp}`]);
      const result = won
        ? (w.sweep ? `and the ${nick} swept them ${w.score}` : w.decider ? `and the ${nick} survived it ${w.score}, taking the full ${num(w.n)} games to do it` : `and the ${nick} took it ${w.score}`)
        : (w.sweep ? `and the ${nick} were swept ${w.score}` : w.decider ? `and ${opp} won it ${w.score} in the last of ${num(w.n)} games` : `and ${opp} won it ${w.score}`);
      const games = seriesGames(s, orgId, nm, pick);
      const inj = hurt.filter((x) => x.round === s.round).slice(0, 1).map((x) => ` The turning point was off the field: ${fullName(P(x.pid))}, the ${x.role}, went down with ${x.words.toLowerCase()} and was lost for the rest of the year.`).join('');
      part(`${lead}, ${result}${won ? '' : ', which ended the year'}. ${games}${inj}`.replace(/^./, (ch) => ch.toUpperCase()));
    });
    for (const x of hurt.filter((h) => !mine.some((m) => m.round === h.round)).slice(0, 2)) {
      part(`The turning point had come in ${POST[x.round]}, when ${fullName(P(x.pid))}, the ${x.role}, went down with ${x.words.toLowerCase()} and was lost for the rest of the year.`);
    }
    // everyone else's October, a round at a time
    const others = (Y.H.series || []).filter((x) => x.hi !== orgId && x.lo !== orgId && x.winner);
    const rounds = [['WC', 'In the wild card round'], ['DS', 'In the division series'], ['LCS', 'In the league championship series'], ['WS', 'In the World Series']];
    for (const [r, label] of rounds) {
      // the early rounds of other clubs' Octobers are a line a series; the later rounds keep their games
      const txt = roundText(others, r, nm, pick, r === 'WC' || r === 'DS');
      if (txt) part(`${label.replace(/^In /, mine.length ? 'Elsewhere, in ' : 'In ')}: ${txt}`);
    }
    if (champ) part(`When it was over the ${nick} were World Series champions, and the clubhouse was loud in the way that only the last game of the year makes it.`);
  }

  // the close
  {
    const t = [];
    if (Y.H.owner?.words) t.push(`${mgr ? `In the owner's office the verdict on ${mgrLast}` : "In the owner's office the verdict on the manager"} was ${Y.H.owner.words.toLowerCase()}.`);
    if (Y.prospects[0]) t.push(`${t.length ? 'Further down' : 'Down on the farm'}, ${fullName(Y.prospects[0].p)} at ${Y.prospects[0].level} had given the club something to look forward to when the next spring came.`);
    part(t.join(' '));
  }

  void money;
  (game.chronicles ||= {})[y] = { year: y, org: orgId, title, chapter, parts: out };
  return game.chronicles[y];
}

export const chronicleFor = (year) => game.chronicles?.[year] ?? null;
