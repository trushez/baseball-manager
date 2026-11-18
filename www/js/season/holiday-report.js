// The letter waiting when you come back from holiday: how the club has done while you were away, who is hitting and
// pitching well and who is not, who got hurt, and who came and went. holidaySnap() is taken as you leave;
// holidayReport() compares the club with it when you are back.
import { game, orgState } from '../state.js';
import { HIST, fullName, mainPos, isPitcher, line } from '../data/world.js';
import { dayNo } from './calendar.js';
import { divisions, gb } from './standings.js';

const org = () => game.world.orgs.get(game.orgId);
const yearNow = () => game.season?.year ?? game.year;

/** A player's totals for your club in the big leagues this season, as numbers in the HIST order. */
function totals(p, kind, year) {
  const sum = HIST[kind].map(() => 0);
  for (const r of p.hist?.[kind] || []) {
    if (r[0] !== year || r[1] !== 'MLB' || r[2] !== game.orgId) continue;
    HIST[kind].forEach((_, i) => { sum[i] += r[i + 3]; });
  }
  return sum;
}

/** Where the club stands in its division: place and games behind the leader. */
function place() {
  const R = game.season?.records;
  const club = game.world.mlb.find((c) => c.id === game.orgId);
  if (!R || !club) return null;
  const div = divisions(club.league).get(club.division) || [];
  const i = div.indexOf(game.orgId);
  if (i < 0) return null;
  return { rank: i + 1, of: div.length, gb: gb(R.get(div[0]), R.get(game.orgId)), div: club.division, leader: div[0] };
}

/** The club as you leave it. */
export function holidaySnap() {
  const o = org(), st = orgState();
  const year = yearNow();
  const r = game.season?.records?.get(game.orgId);
  const bat = {}, pit = {};
  for (const p of o.players) { bat[p.id] = totals(p, 'bat', year); pit[p.id] = totals(p, 'pit', year); }
  return {
    year, phase: game.phase, date: game.date.getTime(),
    rec: r ? { w: r.w, l: r.l, rs: r.rs, ra: r.ra } : null,
    place: game.phase === 'regular' ? place() : null,
    active: [...st.active], il: [...(st.il?.keys?.() || [])], level: Object.fromEntries(o.players.map((p) => [p.id, st.level.get(p.id) || null])), bat, pit,
  };
}

const minus = (a, b) => a.map((x, i) => x - (b?.[i] || 0));
const rate = (v) => (v == null ? '-' : v.toFixed(3).replace(/^0/, ''));
const ipText = (outs) => `${Math.floor(outs / 3)}.${outs % 3}`;
const name = (p) => ({ pid: p.id, t: fullName(p) });
const ord = (n) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] || 'th'}`;
const gbText = (g) => (g <= 0 ? 'level with the leaders' : `${g % 1 ? g.toFixed(1) : g} game${g === 1 ? '' : 's'} back`);
const role = (p) => (isPitcher(p) ? (p.role === 'Starter' ? 'SP' : p.role === 'Closer' ? 'CL' : 'RP') : mainPos(p));

/** When an injured player is due back, in words. */
function dueBack(p) {
  const inj = p.injury;
  if (!inj) return '';
  const left = Math.max(1, (inj.since ?? dayNo(game.date)) + inj.days - dayNo(game.date));
  if (left <= 6) return 'day to day';
  if (left < 21) return `back in about ${Math.round(left / 7)} week${Math.round(left / 7) > 1 ? 's' : ''}`;
  if (left < 120) return `back in about ${Math.round(left / 7)} weeks`;
  return `back in about ${Math.round(left / 30)} months`;
}

/** Why someone who was on the active roster is not on it now. */
function whereNow(p, st) {
  if (p.orgId !== game.orgId) return p.orgId ? `traded to ${game.world.orgs.get(p.orgId)?.club?.name ?? 'another club'}` : 'released';
  if (p.injury || st.il?.has(p.id)) return `injured list: ${p.injury ? `${p.injury.type}, ${dueBack(p)}` : 'recovering'}`;
  if (st.dfa?.has(p.id)) return 'designated for assignment';
  return `sent down to ${st.level.get(p.id) || 'the minors'}`;
}

/** The letter's body as message parts: paragraphs and tables. */
export function holidayReport(snap, { days, begun }) {
  const parts = [];
  const o = org(), st = orgState();
  const y = yearNow();
  const same = snap && snap.year === y;
  const r = game.season?.records?.get(game.orgId);
  const say = (p) => parts.push({ p });

  // how the club has done
  if (r && same && snap.rec) {
    const w = r.w - snap.rec.w, l = r.l - snap.rec.l, rs = r.rs - snap.rec.rs, ra = r.ra - snap.rec.ra;
    if (w + l > 0) {
      const now = game.phase === 'regular' ? place() : null;
      let s = `While you were away the club went ${w}-${l}, scoring ${rs} runs and allowing ${ra}. The season record is now ${r.w}-${r.l}`;
      if (now) {
        s += now.rank === 1 ? `, top of the ${now.div}` : `, ${ord(now.rank)} in the ${now.div} and ${gbText(now.gb)}`;
        if (snap.place) s += now.rank < snap.place.rank ? `, up from ${ord(snap.place.rank)} when you left` : now.rank > snap.place.rank ? `, down from ${ord(snap.place.rank)} when you left` : `, the same place as when you left`;
      }
      s += '.';
      const last = r.last || '';
      if (last.length >= 5) {
        const run = last.match(/(W+|L+)$/)?.[0] || '';
        const lw = [...last].filter((c) => c === 'W').length;
        s += ` The last ${last.length} games went ${lw}-${last.length - lw}${run.length >= 3 ? `, and the club has ${run[0] === 'W' ? 'won' : 'lost'} the last ${run.length} in a row` : ''}.`;
      }
      say(s);
    }
  }

  // the hitters and pitchers since you left (this season only, if a new season began while you were away)
  const games = r && same && snap.rec ? (r.w - snap.rec.w) + (r.l - snap.rec.l) : r ? r.w + r.l : 0;
  if (games > 0) {
    const bats = [], arms = [];
    for (const p of o.players) {
      const b = line('bat', [y, 'MLB', game.orgId, ...minus(totals(p, 'bat', y), same ? snap.bat[p.id] : null)]);
      if (b.pa > 0 && !isPitcher(p)) bats.push({ p, b });
      const q = line('pit', [y, 'MLB', game.orgId, ...minus(totals(p, 'pit', y), same ? snap.pit[p.id] : null)]);
      if (q.outs > 0) arms.push({ p, q });
    }
    const minPA = Math.max(8, Math.round(games * 2));
    const regular = bats.filter((x) => x.b.pa >= minPA).sort((a, b) => b.b.ops - a.b.ops);
    const head = ['Player', 'Pos', 'G', 'PA', 'AVG', 'OBP', 'SLG', 'HR', 'RBI', 'SB'];
    const row = ({ p, b }) => [name(p), mainPos(p), String(b.g), String(b.pa), rate(b.avg), rate(b.obp), rate(b.slg), String(b.hr), String(b.rbi), String(b.sb)];
    const hot = regular.filter((x) => x.b.ops >= 0.75).slice(0, 5);
    const since = same ? 'since you left' : 'this season';
    if (hot.length) {
      say(`Hitting well ${since}:`);
      parts.push({ head, rows: hot.map(row) });
    } else if (regular.length) say(`Nobody has hit especially well ${since}. ${fullName(regular[0].p)} has been the best of them with an OPS of ${rate(regular[0].b.ops)}.`);
    const cold = regular.filter((x) => x.b.ops < 0.62 && !hot.includes(x)).slice(-3).reverse();
    if (cold.length) {
      say(`Struggling at the plate:`);
      parts.push({ head, rows: cold.map(row) });
    }

    const minIP = Math.max(4, games * 0.35) * 3;
    const used = arms.filter((x) => x.q.outs >= minIP);
    const phead = ['Player', 'Role', 'G', 'GS', 'IP', 'ERA', 'WHIP', 'SO', 'BB', 'W-L', 'SV'];
    const prow = ({ p, q }) => [name(p), role(p), String(q.g), String(q.gs), ipText(q.outs), q.era.toFixed(2), q.whip.toFixed(2), String(q.so), String(q.bb), `${q.w}-${q.l}`, String(q.sv)];
    const good = used.filter((x) => x.q.era <= 3.6).sort((a, b) => a.q.era - b.q.era || b.q.outs - a.q.outs).slice(0, 5);
    if (good.length) {
      say(`Pitching well ${since}:`);
      parts.push({ head: phead, rows: good.map(prow) });
    }
    const bad = used.filter((x) => x.q.era >= 5.25 && !good.includes(x)).sort((a, b) => b.q.era - a.q.era).slice(0, 3);
    if (bad.length) {
      say(`Hit hard:`);
      parts.push({ head: phead, rows: bad.map(prow) });
    }
  }

  // a long holiday: the form of the last two weeks as well, from the players' game logs
  if (days > 21 && game.season && ['regular', 'post', 'over'].includes(game.phase)) {
    const from = dayNo(game.date) - 14;
    const mine = o.players.filter((p) => p.orgId === game.orgId);
    const hb = mine.filter((p) => !isPitcher(p)).map((p) => {
      const g = (p.gb || []).filter((r) => r[0] >= from && r[2] === 'MLB');
      const s = g.reduce((a, r) => ({ g: a.g + 1, ab: a.ab + r[3], h: a.h + r[5], d: a.d + r[6], t: a.t + r[7], hr: a.hr + r[8], rbi: a.rbi + r[9], bb: a.bb + r[10] }), { g: 0, ab: 0, h: 0, d: 0, t: 0, hr: 0, rbi: 0, bb: 0 });
      const obp = s.ab + s.bb ? (s.h + s.bb) / (s.ab + s.bb) : 0, slg = s.ab ? (s.h + s.d + 2 * s.t + 3 * s.hr) / s.ab : 0;
      return { p, s, avg: s.ab ? s.h / s.ab : 0, obp, slg, ops: obp + slg };
    }).filter((x) => x.s.ab >= 20 && x.ops >= 0.8).sort((a, b) => b.ops - a.ops).slice(0, 4);
    const pb = mine.filter(isPitcher).map((p) => {
      const g = (p.gp || []).filter((r) => r[0] >= from && r[2] === 'MLB');
      const s = g.reduce((a, r) => ({ g: a.g + 1, gs: a.gs + r[3], outs: a.outs + r[4], h: a.h + r[5], er: a.er + r[7], bb: a.bb + r[8], so: a.so + r[9] }), { g: 0, gs: 0, outs: 0, h: 0, er: 0, bb: 0, so: 0 });
      return { p, s, era: s.outs ? (s.er * 27) / s.outs : 99 };
    }).filter((x) => x.s.outs >= 15 && x.era <= 3).sort((a, b) => a.era - b.era).slice(0, 4);
    if (hb.length) {
      say('Hot in the last two weeks:');
      parts.push({ head: ['Player', 'Pos', 'G', 'AB', 'AVG', 'OBP', 'SLG', 'HR', 'RBI'], rows: hb.map((x) => [name(x.p), mainPos(x.p), String(x.s.g), String(x.s.ab), rate(x.avg), rate(x.obp), rate(x.slg), String(x.s.hr), String(x.s.rbi)]) });
    }
    if (pb.length) {
      say('Sharpest on the mound in the last two weeks:');
      parts.push({ head: ['Player', 'Role', 'G', 'GS', 'IP', 'ERA', 'SO', 'BB'], rows: pb.map((x) => [name(x.p), role(x.p), String(x.s.g), String(x.s.gs), ipText(x.s.outs), x.era.toFixed(2), String(x.s.so), String(x.s.bb)]) });
    }
  }

  // the active roster then and now
  const inSeason = (ph) => ['spring', 'regular', 'post', 'over'].includes(ph);
  if (same && snap.active?.length && inSeason(snap.phase) && inSeason(game.phase)) {
    const was = new Set(snap.active);
    const gone = snap.active.map((id) => game.world.players.get(id)).filter((p) => p && !st.active.has(p.id));
    const hurt = gone.filter((p) => p.orgId === game.orgId && (p.injury || st.il?.has(p.id)));
    const moved = gone.filter((p) => !hurt.includes(p));
    if (hurt.length) {
      say(`On the injured list now, who were on the active roster when you left:`);
      parts.push({ head: ['Player', 'Pos', 'Injury', 'Expected back'], rows: hurt.map((p) => [name(p), role(p), p.injury?.type ?? 'Healed', p.injury ? dueBack(p) : 'Fit now: he can be activated']) });
    }
    if (moved.length) {
      say(`Also off the active roster:`);
      parts.push({ head: ['Player', 'Pos', 'Where'], rows: moved.map((p) => [name(p), role(p), whereNow(p, st)]) });
    }
    const came = [...st.active].filter((id) => !was.has(id)).map((id) => game.world.players.get(id)).filter(Boolean);
    if (came.length) {
      say(`New on the active roster:`);
      const how = (p) => (!(p.id in snap.bat) ? 'Acquired' : snap.il?.includes(p.id) ? 'Back from the injured list' : `Called up from ${snap.level?.[p.id] || 'the minors'}`);
      parts.push({ head: ['Player', 'Pos', 'Age', 'How'], rows: came.map((p) => [name(p), role(p), String(p.age), how(p)]) });
    }
    if (!hurt.length && !moved.length && !came.length) say('The active roster is the same 26 you left.');
    const nowHurt = o.players.filter((p) => p.injury && st.active.has(p.id));
    if (nowHurt.length) say(`Hurt but still on the active roster: ${nowHurt.map((p) => `${fullName(p)} (${p.injury.type}, ${dueBack(p)})`).join('; ')}.`);
  }
  return parts;
}
