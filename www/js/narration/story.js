// Watches a game as it happens and notices the stories in it: a debut, a first hit, a cycle in the
// making, a no-hitter, a late lead change, a comeback, a pitcher who has lost the plate or is tiring, a
// hitter who has the pitcher's number. Used by the radio call (live lines) and by the game report
// (past-tense lines), so both tell the same story. It never changes the game.
//
// Each story is { id, vars, when: 'before' | 'after', report: boolean, weight } where id is a key of LINES.

const HITS = new Set(['1B', '2B', '3B', 'HR']);
const REACH = new Set(['1B', '2B', '3B', 'HR', 'BB', 'IBB', 'HBP', 'E', 'FC']);
const ORD = ['', 'first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth', 'ninth', 'tenth', 'eleventh', 'twelfth', 'thirteenth', 'fourteenth', 'fifteenth'];
const NUM = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve'];
const nth = (n) => (n % 100 >= 11 && n % 100 <= 13 ? `${n}th` : `${n}${['th', 'st', 'nd', 'rd'][n % 10] || 'th'}`);
const FASTBALLS = new Set(['Four-seam', 'Sinker']);
const NEED = { '1B': 'single', '2B': 'double', '3B': 'triple', HR: 'home run' };

/**
 * @param {{ teams:{away:any, home:any}, ctx?: { careerHits?:(id)=>number, careerHR?:(id)=>number, seasonHR?:(id)=>number,
 *           debut?:(id)=>boolean, streak?:{away?:{type:string,n:number}, home?:{type:string,n:number}}, bigNote?:string } }} o
 */
export class StoryWatch {
  constructor({ teams, ctx = {} }) {
    this.teams = teams;
    this.ctx = ctx;
    this.done = new Set();     // stories told once
    this.today = new Map();    // batter id -> { types:Set, hits, hr, vs: Map(pitcher -> hits) }
    this.pit = new Map();      // pitcher id -> { bb, k, last:[], early:[], inningHits:{key,n}, runsInning }
    this.reached = { away: 0, home: 0 };
    this.errors = { away: 0, home: 0 };
    this.lead = 0;
    this.worst = { away: 0, home: 0 }; // biggest deficit each club has faced
    this.debuted = new Set();
  }

  once(key) { if (this.done.has(key)) return false; this.done.add(key); return true; }
  bat(id) { if (!this.today.has(id)) this.today.set(id, { types: new Set(), hits: 0, hr: 0, vs: new Map() }); return this.today.get(id); }
  arm(id) { if (!this.pit.has(id)) this.pit.set(id, { bb: 0, k: 0, last: [], early: [], inn: '', innHits: 0, velo: false, wild: '' }); return this.pit.get(id); }

  /** Stories for one engine event. */
  see(e) {
    const f = this[`on_${e.type}`];
    return f ? f.call(this, e) || [] : [];
  }

  on_gameStart() {
    const out = [];
    for (const key of ['away', 'home']) {
      const s = this.ctx.streak?.[key];
      if (s && s.n >= 4 && s.type === 'L') out.push({ id: 'LOSING_STREAK', vars: { city: this.teams[key].city, nWord: NUM[s.n] ?? s.n }, when: 'after' });
    }
    if (this.ctx.bigNote) out.push({ id: 'BIG_GAME', vars: { note: this.ctx.bigNote }, when: 'after' });
    return out;
  }

  on_halfStart(e) {
    const out = [];
    const batting = e.data.batting, fielding = batting === 'away' ? 'home' : 'away';
    const pid = e.data.pitcherId;
    // no-hitter and perfect game watch, from the sixth
    if (e.inning >= 6 && e.board.hits[batting] === 0 && this.once(`nh-${batting}-${e.inning}-${e.half}`)) {
      const perfect = this.reached[batting] === 0;
      out.push(perfect
        ? { id: 'PERFECT_WATCH', vars: { opp: this.teams[batting].city, n: 3 * (e.inning - 1), city: this.teams[fielding].city }, when: 'after' }
        : { id: 'NO_HITTER_WATCH', vars: { opp: this.teams[batting].city, city: this.teams[fielding].city, pit: pid, inn: ORD[e.inning] }, when: 'after' });
    }
    // a winning streak in danger, late
    const s = this.ctx.streak?.[batting];
    const behind = e.board.score[batting] < e.board.score[fielding];
    if (e.inning >= 8 && behind && s && s.type === 'W' && s.n >= 4 && this.once(`streak-${batting}`)) {
      out.push({ id: 'STREAK_ON_LINE', vars: { city: this.teams[batting].city, nWord: NUM[s.n] ?? s.n }, when: 'after' });
    }
    return out;
  }

  on_paStart(e) {
    const out = [];
    const id = e.data.batterId;
    if (this.ctx.debut?.(id) && !this.debuted.has(id)) {
      this.debuted.add(id);
      out.push({ id: 'DEBUT', vars: { bat: id }, when: 'after', report: true, weight: 3 });
    }
    // three of the four hits, late in the game
    const t = this.today.get(id);
    if (t && t.types.size === 3 && e.inning >= 6) {
      const need = ['1B', '2B', '3B', 'HR'].find((k) => !t.types.has(k));
      if (this.once(`cycle-watch-${id}-${e.inning}`)) out.push({ id: 'CYCLE_WATCH', vars: { bat: id, need: NEED[need] }, when: 'after' });
    }
    return out;
  }

  on_pitch(e) {
    const out = [];
    const pid = e.board.pitcherId;
    const a = this.arm(pid);
    a.last.push(e.data.result === 'ball' ? 1 : 0);
    if (a.last.length > 9) a.last.shift();
    if (FASTBALLS.has(e.data.pitch)) {
      if (e.data.n <= 30) a.early.push(e.data.mph);
      else if (!a.velo && e.data.n >= 75 && a.early.length >= 4) {
        const early = a.early.reduce((x, y) => x + y, 0) / a.early.length;
        if (early - e.data.mph >= 2.5) {
          a.velo = true;
          out.push({ id: 'LOSING_VELOCITY', vars: { pit: pid, mph: e.data.mph, early: Math.round(early) }, when: 'after' });
        }
      }
    }
    const inn = `${e.inning}${e.half}`;
    const balls = a.last.reduce((x, y) => x + y, 0);
    if (a.last.length === 9 && balls >= 7 && !a.wild && a.bb < 3) {
      a.wild = inn;
      out.push({ id: 'WILD_STREAK', vars: { pit: pid, nWord: NUM[balls], m: 'nine' }, when: 'after' });
    }
    return out;
  }

  on_paEnd(e) {
    const out = [];
    const d = e.data, b = e.board;
    const batting = e.half === 'top' ? 'away' : 'home', fielding = batting === 'away' ? 'home' : 'away';
    const city = this.teams[batting].city, opp = this.teams[fielding].city;
    const t = this.bat(d.batterId), a = this.arm(d.pitcherId);
    const inn = `${e.inning}${e.half}`;
    if (a.inn !== inn) { a.inn = inn; a.innHits = 0; }
    if (REACH.has(d.result)) this.reached[batting]++;

    if (HITS.has(d.result)) {
      const before = b.hits[batting] - 1;
      // a no-hit bid broken up late
      if (before === 0 && e.inning >= 6) out.push({ id: 'NO_HITTER_BROKEN', vars: { bat: d.batterId, pit: d.pitcherId, city, inn: ORD[e.inning] }, when: 'after', report: true, weight: 3 });
      t.types.add(d.result);
      t.hits++;
      t.vs.set(d.pitcherId, (t.vs.get(d.pitcherId) || 0) + 1);
      a.innHits++;
      const career = this.ctx.careerHits?.(d.batterId);
      if (career === 0 && t.hits === 1) out.push({ id: 'FIRST_HIT', vars: { bat: d.batterId }, when: 'after', report: true, weight: 4 });
      if (d.result === 'HR') {
        t.hr++;
        if (this.ctx.careerHR?.(d.batterId) === 0 && t.hr === 1) out.push({ id: 'FIRST_HR', vars: { bat: d.batterId }, when: 'after', report: true, weight: 4 });
        const season = (this.ctx.seasonHR?.(d.batterId) ?? -100) + t.hr;
        if (season >= 10 && (season % 10 === 0 || (season >= 40 && season % 5 === 0))) out.push({ id: 'HR_MILESTONE', vars: { bat: d.batterId, n: season, nth: nth(season) }, when: 'after', report: true, weight: 3 });
        if (t.hr === 2) out.push({ id: 'TWO_HR_GAME', vars: { bat: d.batterId }, when: 'after', report: true, weight: 2 });
        if (t.hr === 3) out.push({ id: 'THREE_HR_GAME', vars: { bat: d.batterId }, when: 'after', report: true, weight: 4 });
      }
      if (t.types.size === 4 && this.once(`cycle-${d.batterId}`)) out.push({ id: 'CYCLE', vars: { bat: d.batterId }, when: 'after', report: true, weight: 5 });
      if (t.vs.get(d.pitcherId) === 3 || (t.vs.get(d.pitcherId) === 2 && t.hits === 2 && e.inning >= 4)) {
        if (this.once(`number-${d.batterId}-${d.pitcherId}`)) out.push({ id: 'HAS_HIS_NUMBER', vars: { bat: d.batterId, pit: d.pitcherId, nWord: NUM[t.vs.get(d.pitcherId)] }, when: 'after' });
      }
      if (a.innHits >= 3 && (d.scored?.length || 0) > 0 && this.once(`squared-${d.pitcherId}-${inn}`)) {
        out.push({ id: 'SQUARED_UP', vars: { pit: d.pitcherId, opp: city, nWord: NUM[a.innHits], inn: ORD[e.inning] }, when: 'after', report: a.innHits >= 4, weight: 1 });
      }
    }
    if (d.result === 'BB' || d.result === 'HBP') {
      if (d.result === 'BB') a.bb++;
      if (a.bb >= 3 && d.result === 'BB' && this.once(`bb-${d.pitcherId}-${a.bb}`)) out.push({ id: 'CONTROL_TROUBLE', vars: { pit: d.pitcherId, n: a.bb, nWord: NUM[a.bb] }, when: 'after', report: a.bb >= 5, weight: 1 });
    }
    if (d.result === 'K') {
      a.k++;
      if (a.k >= 10 && (a.k === 10 || a.k % 2 === 0)) out.push({ id: 'STRIKEOUT_TALLY', vars: { pit: d.pitcherId, n: a.k }, when: 'after', report: a.k >= 10, weight: 2 });
    }
    if (d.result === 'E') {
      this.errors[fielding]++;
      const n = this.errors[fielding];
      if (n >= 2) out.push({ id: 'SLOPPY_DEFENCE', vars: { city: opp, n, nWord: NUM[n] }, when: 'after', report: n >= 3, weight: 1 });
    }
    // a tiring starter who starts letting men on
    if (REACH.has(d.result) && b.pitchCount >= 105 && this.once(`tired-${d.pitcherId}`)) out.push({ id: 'TIRED_ARM', vars: { pit: d.pitcherId, n: b.pitchCount }, when: 'after' });

    // the score: lead changes late, ties late, comebacks
    if (d.scored?.length) out.push(...this.scoreChange(e, batting));
    return out;
  }

  scoreChange(e, batting) {
    const out = [];
    const s = e.board.score;
    const now = Math.sign(s.home - s.away);
    const fielding = batting === 'away' ? 'home' : 'away';
    this.worst[fielding] = Math.max(this.worst[fielding], s[batting] - s[fielding]);
    const deficit = this.worst[batting];
    const ahead = s[batting] > s[fielding];
    const city = this.teams[batting].city;
    const walkOff = e.half === 'bottom' && e.inning >= 9 && ahead;
    if (ahead && now !== this.lead && deficit >= 4 && this.once(`comeback-${batting}`)) {
      out.push({ id: 'COMEBACK', vars: { city, n: deficit, nWord: NUM[deficit] ?? deficit }, when: 'after', report: true, weight: 4 });
    } else if (ahead && now !== this.lead && e.inning >= 8 && !walkOff) {
      out.push({ id: 'LATE_LEAD_CHANGE', vars: { city, inn: ORD[e.inning] }, when: 'after', report: false });
    } else if (now === 0 && this.lead !== 0 && e.inning >= 8) {
      out.push({ id: 'LATE_TIE', vars: { city, inn: ORD[e.inning] }, when: 'after', report: false });
    }
    this.lead = now;
    return out;
  }

  on_gameEnd(e) {
    const out = [];
    for (const key of ['away', 'home']) {
      const other = key === 'away' ? 'home' : 'away';
      if (e.board.hits[other] === 0) out.push({ id: 'NO_HITTER', vars: { city: this.teams[key].city }, when: 'before', report: true, weight: 6 });
    }
    return out;
  }
}
