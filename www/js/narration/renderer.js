// Turns engine events into radio commentary. The engine never sees this module.
//
// The voice follows old-time radio play-by-play: the batter is brought to the plate with his hand, his average and
// who is on deck; every pitch gets its location and the count; a ball in play is told step by step through the
// fielders and runners; the score is given whenever it changes; every full inning closes with both clubs' runs,
// hits and men left on base.
//
// Rules kept from the brief:
// - Field order, never jumping around. Full name on introduction, surname after.
// - The board updates a beat after the words (each event's board rides on its last line).
// - Key moments filters by `key`, never reorders. An at-bat's lead-in lines are marked key only once it ends.
// - No em dashes, no stock phrases, varied sentence length.

import { Rng } from '../core/rng.js';
import { LINES, PRI_HOLD, SETUP_HOLD } from './lines.js';
import { StoryWatch } from './story.js';
import { Colour } from './colour.js';

const NUM = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve'];
const ORD = ['', 'first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth', 'ninth', 'tenth', 'eleventh', 'twelfth', 'thirteenth', 'fourteenth', 'fifteenth'];
const ORDER = ['', 'first', 'second', 'third', 'cleanup', 'fifth', 'sixth', 'seventh', 'eighth', 'ninth'];
const word = (n) => NUM[n] ?? String(n);
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const ord = (n) => ORD[n] ?? `${n}th`;
const plural = (n, w) => `${word(n)} ${w}${n === 1 ? '' : 's'}`;

const POS_NAME = { P: 'pitching', C: 'catching', '1B': 'first base', '2B': 'second base', '3B': 'third base', SS: 'shortstop', LF: 'left field', CF: 'centre field', RF: 'right field', DH: 'designated hitter' };
const TO = { P: 'the mound', C: 'the catcher', '1B': 'first', '2B': 'second', '3B': 'third', SS: 'short', LF: 'left', CF: 'centre', RF: 'right' };
const OF_FOR_DIR = { L: 'LF', C: 'CF', R: 'RF' };
const FIELD_FOR_DIR = { L: 'left field', C: 'centre field', R: 'right field' };
const SPOKEN = { 'Four-seam': 'fastball', Sinker: 'sinker', Cutter: 'cutter', Slider: 'slider', Sweeper: 'sweeper', Curveball: 'curve', Changeup: 'changeup', Splitter: 'splitter' };
const BREAKING = new Set(['Slider', 'Sweeper', 'Curveball']);
const BASE = ['first', 'second', 'third'];

/**
 * @typedef {{text:string|null, cls:string, key:boolean, board:any, hold?:number, when:string, scorer?:any}} Line
 * @typedef {{ fielder:(side:string,pos:string)=>any, order:(side:string)=>{player:any,pos:string}[],
 *             today:(id:string)=>any, lob:(side:string)=>number }} Ctx
 */
export class Narrator {
  /** @param {{seed:string, players:Map<string,any>, teams:{away:any, home:any}, venue:string, weather?:string, ctx:Ctx, story?:any}} o */
  constructor({ seed, players, teams, venue, weather, ctx, story, attendance, year }) {
    this.rng = new Rng(`${seed}-narration`);
    this.players = players;
    this.teams = teams;
    this.venue = venue;
    this.weather = weather;
    this.ctx = ctx;
    this.introduced = new Set();
    this.seenPitchers = new Set();
    this.prev = null;           // board before the current event
    this.curPA = null;          // lines of the at-bat in progress, marked key when it ends
    this.paAside = false;
    this.leadoff = false;
    this.lastPitch = null;
    this.story = story;
    this.watch = new StoryWatch({ teams, ctx: story || {} });
    this.lastLine = {};
    this.colour = new Colour(this, { attendance, year });
    this.paPitches = [];
  }

  /**
   * A line from the data file: weighted pick (never the same line twice running for an event), placeholders filled.
   * Ids in vars.bat, vars.pit and vars.run become names; {Bat}, {Pit} and {Run} are full names.
   */
  say(id, vars = {}, extra = {}) {
    const ev = LINES[id];
    const pool = ev.lines.filter((l) => l.g);
    let opts = pool.length > 1 ? pool.filter((l) => l !== this.lastLine[id]) : pool;
    const total = opts.reduce((a, l) => a + (l.w || 1), 0);
    let r = this.rng.next() * total, line = opts[0];
    for (const l of opts) { r -= l.w || 1; if (r < 0) { line = l; break; } }
    this.lastLine[id] = line;
    return { text: this.fill(line.g, vars), hold: PRI_HOLD[ev.pri], cls: ev.pri >= 2 ? 'big' : 'build', key: false, ...extra };
  }

  fill(t, vars) {
    const names = {};
    for (const k of ['bat', 'pit', 'run']) {
      if (vars[k] == null) continue;
      const id = vars[k];
      const isId = this.players.has(id);
      names[k.toUpperCase()] = isId ? `${this.p(id).first} ${this.p(id).last}` : id;
      names[k] = isId ? (t.includes(`{${k}}`) ? this.name(id) : this.last(id)) : id;
    }
    const out = t.replace(/\{(\w+)\}/g, (m, k) => {
      if (['Bat', 'Pit', 'Run'].includes(k)) return names[k.toUpperCase()] ?? m;
      if (k in names) return names[k];
      return vars[k] ?? m;
    });
    return cap(out);
  }

  // ---------- names ----------
  p(id) { return this.players.get(id); }
  /** Full name the first time, surname after. */
  name(id) {
    const p = this.p(id);
    if (!p) return 'the runner';
    if (this.introduced.has(id)) return p.last;
    this.introduced.add(id);
    return `${p.first} ${p.last}`;
  }
  /** Full name without counting as the introduction (lineups, on deck). */
  full(id) { const p = this.p(id); return p ? (this.introduced.has(id) ? p.last : `${p.first} ${p.last}`) : ''; }
  last(id) { return this.p(id)?.last ?? 'him'; }
  fielder(e, pos) {
    const side = e.half === 'top' ? 'home' : 'away';
    const f = this.ctx.fielder(side, pos);
    return f ? this.name(f.id) : `the ${TO[pos]}`;
  }
  pick(list) { return this.rng.pick(list); }
  when(e) { return `${e.half === 'top' ? 'Top' : 'Bot'} ${e.inning}`; }

  hand(p) { return p.bats === 'L' ? 'the lefty ' : p.bats === 'S' ? 'the switch-hitting ' : ''; }
  avg(p) { return p.avg ? `, batting ${p.avg}` : ''; }
  todayLine(id) {
    const x = this.ctx.today(id);
    if (!x || !x.PA) return '';
    if (!x.AB) return x.BB ? `, walked last time up` : '';
    return x.H ? `, ${word(x.H)} for ${word(x.AB)} today` : `, oh for ${word(x.AB)} today`;
  }
  scoreNow(s) {
    const { away, home } = this.teams;
    return `The score is now ${away.city} ${s.away}, ${home.city} ${s.home}.`;
  }
  scoreIs(s) {
    const { away, home } = this.teams;
    return `The score is ${away.city} ${s.away}, ${home.city} ${s.home}.`;
  }

  /** @param {any[]} events @returns {Line[]} */
  render(events) {
    const out = [];
    for (const e of events) {
      const stories = this.watch.see(e);
      const tell = (when) => stories.filter((x) => x.when === when && LINES[x.id]?.lines.some((l) => l.g)).map((x) => ({ ...this.say(x.id, x.vars), cls: 'colour', key: LINES[x.id].pri >= 1 }));
      const lines = [...tell('before'), ...(this[`on_${e.type}`]?.(e) ?? []), ...tell('after')];
      lines.forEach((l, i) => {
        if (l.text) l.text = l.text.replace(/(?<!\.)\.\.(?!\.)/g, '.');
        // same object, not a copy: an at-bat's lead-in lines are marked key later, when it ends
        l.cls ??= 'build';
        l.key ??= false;
        l.board = i === lines.length - 1 ? e.board : null;
        l.when = this.when(e);
        l.seq = e.seq;
        out.push(l);
      });
      if (!lines.length) out.push({ text: null, cls: 'none', key: false, board: e.board, when: this.when(e), seq: e.seq });
      this.prev = e.board;
    }
    return out;
  }

  /** Lines belonging to the at-bat in progress, so they can be promoted to key moments when it ends. */
  track(lines) { if (this.curPA) this.curPA.push(...lines); return lines; }

  // ---------- game ----------

  on_gameStart() {
    const { away, home } = this.teams;
    const lines = [
      { text: `It's a fine night for baseball here at ${this.venue}, for a game between the visiting ${away.full ?? `${away.city} ${away.name}`} and the home ${home.full ?? `${home.city} ${home.name}`}.`, cls: 'sum', key: true, hold: 1.4 },
    ];
    if (away.record && home.record) lines.push({ text: `${away.city} come in at ${away.record.replace('-', ' and ')}. ${home.city} are ${home.record.replace('-', ' and ')}.`, cls: 'build', hold: 1 });
    if (this.weather) {
      const [sky, temp] = this.weather.split(',').map((x) => x.trim());
      const deg = temp ? temp.replace(/\u00B0C|°C/, ' degrees') : '';
      lines.push({ text: /roof/i.test(sky) ? `The roof is closed here, ${deg ? `and it is ${deg} inside` : 'out of the weather'}.` : `${cap(sky.toLowerCase())} skies${deg ? ` and ${deg}` : ''} at first pitch.`, cls: 'build', hold: 0.9 });
    }
    for (const key of ['away', 'home']) {
      const t = this.teams[key];
      lines.push({ text: `Here is the starting lineup for ${t.city}.`, cls: 'sum', hold: 0.8 });
      this.ctx.order(key).forEach((o, i) => {
        const spot = i === 0 ? 'Leading off' : i === 3 ? 'Batting cleanup' : `Batting ${ORDER[i + 1]}`;
        const where = { C: 'catching', DH: 'the designated hitter', '1B': 'at first base', '2B': 'at second base', '3B': 'at third base', SS: 'at shortstop', LF: 'in left', CF: 'in centre', RF: 'in right' }[o.pos] ?? `at ${o.pos}`;
        lines.push({ text: o.pos === 'DH' ? `${spot}, ${where}, ${this.full(o.player.id)}.` : `${spot} and ${where}, ${this.full(o.player.id)}.`, cls: 'build', hold: 0.55 });
      });
    }
    return lines;
  }

  on_gameEnd(e) {
    const { away, home } = this.teams;
    const s = e.data.score, b = e.board;
    const w = s.home > s.away ? home : away;
    const tot = (key) => `${plural(s[key], 'run')} on ${plural(b.hits[key], 'hit')} and ${lobWords(this.ctx.lob(key))}`;
    const fin = this.story?.finale;
    const wonKey = s.home > s.away ? 'home' : 'away';
    const clinched = fin && (fin.wins[w.city] ?? 0) + (fin.after ? 0 : 1) >= fin.need;
    if (fin?.ws && clinched) return this.championsFinale(e, w, wonKey, tot);
    const loseKey = wonKey === 'home' ? 'away' : 'home', lose = this.teams[loseKey];
    const big = clinched ? this.seriesFinale(w, lose, fin, wonKey) : this.raceFinale(w, lose, wonKey, loseKey);
    return [
      ...big,
      ...(this.ended ? [] : [{ text: `${w.city} take the game${e.data.innings > 9 ? ` in ${word(e.data.innings)} innings` : ''}.`, cls: 'end', key: true, hold: 2 }]),
      { text: `Final statistics for ${home.city} are ${tot('home')}. ${away.city} have ${tot('away')}.`, cls: 'sum', key: true, hold: 1.6 },
      { text: `The final score is ${away.city} ${s.away}, ${home.city} ${s.home}. Thanks for joining us, and we'll see you next time!`, cls: 'sum', key: true, hold: 2 },
    ];
  }

  /** The last out of a Wild Card, Division or Championship Series: who moves on, and who goes home. */
  seriesFinale(w, lose, fin, wonKey) {
    const r = this.rng, L = (text, cls, hold) => ({ text, cls, key: true, hold });
    const home = wonKey === 'home';
    const seed = fin.seeds?.[w.city];
    const lg = fin.league ? (fin.league.startsWith('American') ? 'American League' : 'National League') : '';
    const fans = home ? r.pick([`${this.venue} is on its feet and nobody is leaving.`, `The crowd at ${this.venue} will not stop cheering.`]) : `The ${w.city} fans who travelled are singing, and the home crowd is quiet.`;
    if (fin.round === 'LCS') return [
      L(`That's it! ${w.city} win the pennant!`, 'end', 3),
      L(`${w.city} are the ${lg} champions, and they are going to the World Series!`, 'end', 2.6),
      L(`${fans} The ${w.name} are pouring out of the dugout.`, 'big', 2.2),
      L(`${lose.city} fought all the way, and the ${lose.name} stand and watch the celebration on the field. It ends their year.`, 'build', 1.8),
    ];
    if (fin.round === 'DS') return [
      L(`${w.city} win the series and move on to the Championship Series!`, 'end', 2.6),
      L(`${fans}`, 'big', 2),
      L(`For ${lose.city} the season is over. The ${lose.name} came in with hopes of more, and now the winter starts early.`, 'build', 1.8),
    ];
    return [
      L(`${w.city} take the Wild Card Series and advance!`, 'end', 2.6),
      L(`${fans}${seed > 3 ? ` A wild card club, and they are through to the Division Series.` : ''}`, 'big', 2),
      L(`${lose.city} are out. One short series, and the season is over for the ${lose.name}.`, 'build', 1.8),
    ];
  }

  /** The end of a regular season game that decided a race: a division won, a place in October, a season ended. */
  raceFinale(w, lose, wonKey, loseKey) {
    const L = (text, cls, hold) => ({ text, cls, key: true, hold });
    const out = [];
    const c = this.story?.clinch?.[wonKey];
    const home = wonKey === 'home';
    if (c?.div) out.push(
      L(`${w.city} have won the ${c.div}!`, 'end', 3),
      L(home ? `${this.venue} erupts. The ${w.name} have clinched the division title in front of their own fans, and the champagne is coming out.` : `The ${w.name} have clinched the division on the road. The players are hugging in front of the visitors' dugout, and the ${w.city} fans in the stands are on their feet.`, 'big', 2.4),
    );
    else if (c?.spot) out.push(
      L(`${w.city} are going to the postseason!`, 'end', 2.8),
      L(home ? `${this.venue} is celebrating. The ${w.name} have clinched a place in October, and the division is still to play for.` : `The ${w.name} have clinched a place in October, away from home, and the dugout is jumping.`, 'big', 2.2),
    );
    if (this.story?.elim?.[loseKey]) out.push(L(`And that is the end for ${lose.city}. The ${lose.name} are eliminated from the postseason race, and the rest of the schedule is about next year.`, 'build', 2));
    return out;
  }

  /** The last out of the World Series: the winners' celebration, the crowd, the trophy. */
  championsFinale(e, w, wonKey, tot) {
    const { away, home } = this.teams;
    const lose = w === home ? away : home;
    const s = e.data.score;
    const arm = this.ctx.fielder(wonKey, 'P');
    const closer = arm ? this.last(arm.id) : 'the closer';
    const away_ = w === away;
    const r = this.rng;
    const L = (text, cls, hold) => ({ text, cls, key: true, hold });
    return [
      L(`It's over! ${w.city} win the World Series!`, 'end', 3),
      L(`${w.city} are the champions of baseball!`, 'end', 3),
      L(r.pick([
        `${closer} throws his arms up and disappears under a pile of teammates in the middle of the infield. The whole ${w.name} bench is pouring over the rail.`,
        `The ${w.name} spill out of the dugout and run to the mound, and ${closer} is lost somewhere in the middle of the biggest hug in baseball.`]), 'big', 2.4),
      L(away_
        ? `The ${w.city} fans who made the trip are singing in the stands, and the ${lose.city} crowd stands in a stunned, respectful quiet.`
        : r.pick([`${this.venue} is shaking. Fans who have waited all year are in tears, hugging strangers, and nobody is making for the exits.`,
          `The noise in ${this.venue} is something you feel in your chest. Thousands of ${w.city} fans are on their feet and not one of them wants to go home.`]), 'big', 2.4),
      L(`Across the field the ${lose.name} stand on the top step and applaud the winners. They gave everything over these games, and it will hurt for a long time.`, 'build', 1.8),
      L(`The trophy is on its way to the field. ${w.city} players are chanting, the champagne is coming, and the ${w.name} are world champions.`, 'big', 2.2),
      L(`Final statistics for ${this.teams.home.city} are ${tot('home')}. ${this.teams.away.city} have ${tot('away')}.`, 'sum', 1.6),
      L(`The final score is ${away.city} ${s.away}, ${home.city} ${s.home}. ${w.city} are the World Series champions. What a season, and thanks for being with us for all of it.`, 'sum', 2.4),
    ];
  }

  on_halfStart(e) {
    const bt = this.teams[e.data.batting];
    const ft = this.teams[e.data.batting === 'away' ? 'home' : 'away'];
    const lines = [{ text: `${bt.city} bat in the ${e.half} of the ${ord(e.inning)}.${e.inning > 1 || e.half === 'bottom' ? ` ${this.scoreIs(e.board.score)}` : ''}`, cls: 'sum', key: false, hold: 1.1 }];
    const pid = e.data.pitcherId;
    if (!this.seenPitchers.has(pid)) {
      this.seenPitchers.add(pid);
      const p = this.p(pid);
      lines.push({ text: `${this.name(pid)} takes the mound for ${ft.city}${p?.era ? `, with an earned run average of ${p.era}` : ''}.`, cls: 'build', hold: 1 });
    }
    if (e.data.extraRunner) lines.push({ text: `${this.name(e.data.extraRunner)} starts the inning at second base.`, cls: 'build', key: true });
    this.leadoff = true;
    return lines;
  }

  on_halfEnd(e) {
    if (e.data.walkOff || this.ended) return [];
    const { away, home } = this.teams;
    const b = e.board;
    if (e.half === 'top') {
      const bt = away;
      const r = e.data.runs, hits = e.data.hits;
      const what = r ? `${cap(plural(r, 'run'))} on ${plural(hits, 'hit')} for ${bt.city}.`
        : hits ? `No runs, ${plural(hits, 'hit')}${e.data.lob ? `, ${word(e.data.lob)} left on` : ''}.` : this.say('QUIET_INNING').text;
      const after = e.inning === 1 ? 'After half an inning' : `After ${word(e.inning - 1)} and a half`;
      const score = b.score.away === b.score.home ? (b.score.away === 0 ? `${after}, no score.` : `${after}, we're tied at ${b.score.away}.`) : `${after}, ${away.city} ${b.score.away}, ${home.city} ${b.score.home}.`;
      return [{ text: `${what} ${score}`, cls: 'sum', key: false, hold: 1.5 }];
    }
    // after a full inning, both clubs' totals as the radio men gave them
    const tot = (key) => `${plural(b.score[key], 'run')} on ${plural(b.hits[key], 'hit')} and ${lobWords(this.ctx.lob(key))}`;
    return [
      { text: `After ${plural(e.inning, 'inning')} of play, ${home.city} have ${tot('home')}.`, cls: 'sum', key: false, hold: 1.3 },
      { text: `${away.city} have ${tot('away')}.`, cls: 'sum', key: false, hold: 1.3 },
    ];
  }

  // ---------- at-bat ----------

  on_paStart(e) {
    this.paAside = false;
    this.lastFoul = false;
    this.curPA = [];
    const b = e.board;
    const p = this.p(e.data.batterId);
    const bt = this.teams[e.half === 'top' ? 'away' : 'home'];
    const order = this.ctx.order(e.half === 'top' ? 'away' : 'home');
    const next = order[e.data.order % 9]?.player;
    this.paPitches = [];
    const who = `${this.hand(p)}${this.name(p.id)}`;
    const intro = this.leadoff
      ? `${cap(who)} leads off the inning for ${bt.city}${this.avg(p)}${this.todayLine(p.id)}.`
      : this.pick([`Coming to the plate is ${who}${this.avg(p)}${this.todayLine(p.id)}.`, `Up steps ${who}${this.avg(p)}${this.todayLine(p.id)}.`,
        `Here's ${who}${this.avg(p)}${this.todayLine(p.id)}.`, `Next for ${bt.city}, ${who}${this.avg(p)}${this.todayLine(p.id)}.`]);
    // for Key moments mode only: where we are, so a key at-bat makes sense on its own
    const keyIntro = { text: this.card(e, `${this.last(b.pitcherId)} pitching to ${this.full(p.id)}.`), cls: 'sum', hold: 1.3, keyIntro: true };
    this.curIntro = keyIntro;
    const lines = [keyIntro, { text: `${intro}${next ? ` On deck is ${this.full(next.id)}.` : ''}`, cls: 'build', hold: 1.1 }];
    if (!this.leadoff) lines.push({ text: situation(b.bases, b.outs), cls: 'build', hold: 0.8 });
    this.leadoff = false;
    return [...this.track(lines), ...this.colour.beforePA(e)];
  }

  /** The status card that opens a highlight: inning, who is pitching to whom (or what has happened), the outs and runners, and the score. */
  card(e, what) {
    const b = e.board, sc = b.score;
    const lead = sc.away === sc.home ? `All square at ${sc.away}.` : sc.away > sc.home ? `${this.teams.away.city} lead ${sc.away}-${sc.home}.` : `${this.teams.home.city} lead ${sc.home}-${sc.away}.`;
    return `${e.half === 'top' ? 'Top' : 'Bottom'} of the ${ord(e.inning)}. ${what} ${situation(b.bases, b.outs)} ${lead}`;
  }

  /** The state of the game in a phrase: inning, outs, score from the batting side's view, and who is on. */
  spot(e, b) {
    const top = e.half === 'top', diff = top ? b.score.away - b.score.home : b.score.home - b.score.away;
    const when = `${top ? 'top' : 'bottom'} of the ${ord(e.inning)}`;
    const outs = b.outs === 0 ? 'nobody out' : b.outs === 1 ? 'one out' : 'two out';
    const score = diff === 0 ? 'the game tied' : diff < 0 ? `${this.battingSide(e)} down ${word(-diff)}` : `${this.battingSide(e)} up ${word(diff)}`;
    const on = b.bases.map((x, i) => (x ? BASE[i] : null)).filter(Boolean);
    const runners = on.length === 3 ? 'the bases loaded' : on.length === 2 ? `runners on ${on[0]} and ${on[1]}` : on.length ? `a runner on ${on[0]}` : 'nobody on';
    const tying = diff < 0 && -diff <= on.length + 1; // the tying run is on base or at the plate
    const late = e.inning >= 7 && Math.abs(diff) <= 2;
    return { when, outs, score, runners, on, diff, tying, late, close: Math.abs(diff) <= 1, risp: b.bases[1] || b.bases[2] };
  }
  battingSide(e) { return this.teams?.[e.half === 'top' ? 'away' : 'home']?.city ?? 'the batting side'; }

  /**
   * A line that builds the moment: the count and the stakes, chosen from the count first. Full counts always get one;
   * other counts get one when the count, the inning or the runners give it something to say.
   */
  tense(e, b, n) {
    const pit = this.last(b.pitcherId), bat = this.last(b.batterId);
    const sp = this.spot(e, b), r = this.rng;
    const stakes = sp.late || sp.risp || sp.on.length;
    const where = `${sp.outs}, ${sp.runners}, ${sp.score}`;
    const key = `${b.balls}-${b.strikes}`;
    const recent = (this.recentTense ||= []);
    const P = (arr) => { const fresh = arr.filter((t) => !recent.includes(t)); const t = r.pick(fresh.length ? fresh : arr); recent.push(t); if (recent.length > 10) recent.shift(); return t; };
    const last = this.paPitches.at(-1);
    let text = null, hold = 0.7;
    if (key === '3-2') {
      hold = 1.1;
      if (sp.late || (sp.risp && sp.close)) text = P([
        `Full count, ${where}, in the ${sp.when}. Everything comes down to this pitch.`,
        `Three and two in the ${sp.when}, ${where}. ${pit} has to throw a strike and ${bat} has to be ready for anything.`,
        `The count is full, ${sp.outs}, ${sp.runners}. You could hear a pin drop. ${pit} looks in for the sign.`,
        `Three and two, ${sp.score}${sp.risp ? ', and the runner in scoring position will be moving on contact' : ''}. Nobody in the ballpark is sitting.`]);
      else if (sp.on.length) text = P([
        `Full count with ${sp.runners}, ${sp.outs}. The runners go on the pitch, and ${pit} cannot afford to miss.`,
        `Three and two, ${sp.runners}. Something has to give.`,
        `${pit} has nowhere to hide: full count, ${sp.runners}, ${sp.outs}.`]);
      else text = P([
        `Full count, ${sp.outs}. ${pit} has to find the plate and ${bat} has to protect it.`,
        `Three and two. ${bat} is looking for one pitch to drive, and ${pit} is not going to give him a gift.`,
        `The count is full. This is the pitch of the at-bat.`,
        `${pit} shakes off a sign, then nods. Full count, ${sp.outs}.`]);
    } else if (key === '3-0' || key === '3-1') {
      hold = 0.8;
      text = P([
        `${word(b.balls)} balls${b.strikes ? ' and a strike' : ''}. ${pit} has to come into the zone, and ${bat} knows it.`,
        `${bat} can sit on a fastball here${stakes ? `, ${sp.outs}, ${sp.runners}` : ''}.`,
        `${pit} cannot walk him${sp.on.length === 3 ? ' with the bases loaded' : sp.on.length ? ' with runners on' : ''}. He gets the sign and steadies himself.`]);
    } else if (key === '2-2') {
      hold = 0.85;
      text = P([
        `Two and two. One pitch could settle this${stakes ? `, ${sp.outs}, ${sp.runners}` : ''}.`,
        `Even count, and neither man has the edge. ${pit} looks in.`,
        `Two balls, two strikes. ${bat} will have to protect now.`]);
    } else if (b.strikes === 2) {
      hold = 0.75;
      text = P([
        `${pit} is one strike away${stakes ? `, ${sp.outs}, ${sp.runners}` : ''}. ${bat} has to protect the plate.`,
        `Two strikes. ${bat} widens his stance and shortens up.`,
        `${pit} can waste one here, and he knows it. He takes his time.`,
        last?.result === 'foul' ? `${bat} has fought that one off and he is still in this. ${pit} gets a new sign.` : `${pit} steps off, rubs up the ball and goes back to work on ${bat}.`,
        last?.result === 'foul' ? `That was close to a hit. ${bat} knows he cannot keep getting away with it.` : `${bat} steps out, taps the dirt off his cleats and digs back in.`,
        `${pit} shakes off the first sign, then nods at the second.`,
        `${bat} is looking for anything he can handle, and ${pit} is looking for the chase.`,
        sp.late ? `One strike from getting out of it in the ${sp.when}, ${sp.score}.` : `${bat} is in a hole and he knows it.`]);
    } else if (b.balls === 0 && b.strikes === 0) {
      hold = 0.6;
      text = stakes && sp.late ? P([
        `${bat} steps in with ${sp.runners} in the ${sp.when}, ${sp.outs}, ${sp.score}. ${pit} gets the sign for the first pitch.`,
        `The ${sp.when}, ${sp.outs}, ${sp.runners}. ${pit} looks in to start ${bat} off.`])
        : sp.on.length ? P([`${pit} comes set with ${sp.runners}. First pitch to ${bat}.`, `First pitch coming, ${sp.runners}. ${pit} checks the runner and looks in.`])
          : P([`${pit} gets the sign. First pitch to ${bat}.`, `${bat} digs in. ${pit} looks in for the first pitch.`, `${pit} rocks and fires the first pitch.`]);
    } else if (b.balls >= 2 && b.strikes <= 1) {
      hold = 0.7;
      text = P([
        `${pit} is behind in the count${stakes ? `, ${sp.outs}, ${sp.runners}` : ''}, and ${bat} is looking for something to hit.`,
        `${bat} is in a hitter's count and he knows it. ${pit} has to throw a strike.`,
        `${pit} needs to get back into this at-bat.`]);
    } else if (stakes && r.chance(0.6)) {
      hold = 0.65;
      text = P([
        `${sp.outs[0].toUpperCase()}${sp.outs.slice(1)}, ${sp.runners}. ${pit} looks in.`,
        `${cap(sp.runners)}, ${sp.score}. ${pit} deals.`,
        sp.late ? `The ${sp.when}, ${sp.score}. The crowd is up.` : `${pit} checks the runner and comes home.`]);
    }
    return text ? [{ text, cls: 'setup', hold }] : null;
  }

  /** One line before every pitch, from the situation as it stands. */
  setup(e) {
    const b = this.prev ?? e.board;
    const nn = this.paPitches.length;
    const mine = this.tense(e, b, nn);
    if (mine && !(nn >= 7 && this.rng.chance(0.4))) return this.track(mine.map((l) => ({ ...l, text: l.text.replace(/\s+/g, ' ') })));
    const late = e.inning >= 8 && Math.abs(b.score.home - b.score.away) <= 1;
    const on = b.bases.findIndex(Boolean);
    let id = 'PITCH_SETUP';
    const last = this.paPitches.at(-1), n = this.paPitches.length;
    if (b.balls === 3 && b.strikes === 2 && on >= 0) id = 'PITCH_SETUP_FULL_RUNNERS';
    else if (n >= 7 && this.rng.chance(0.5)) id = 'PITCH_SETUP_LONG';
    else if (last?.result === 'swinging' && this.rng.chance(0.45)) id = 'PITCH_SETUP_AFTER_MISS';
    else if (last?.result === 'foul' && b.strikes === 2 && this.rng.chance(0.45)) id = 'PITCH_SETUP_AFTER_FOUL';
    else if (b.strikes === 2 && b.balls <= 1 && this.rng.chance(0.4)) id = 'PITCH_SETUP_AHEAD';
    else if (b.balls >= 2 && b.strikes === 0 && this.rng.chance(0.5)) id = 'PITCH_SETUP_BEHIND';
    else if (late && this.rng.chance(0.25)) id = 'PITCH_SETUP_TENSE';
    else if (b.strikes === 2 && this.rng.chance(0.5)) id = 'PITCH_SETUP_TWO_STRIKES';
    else if (b.balls === 3 && this.rng.chance(0.5)) id = 'PITCH_SETUP_THREE_BALLS';
    else if (on >= 0 && on < 2 && this.rng.chance(0.2)) id = 'PITCH_SETUP_RUNNER';
    const l = this.say(id, { pit: this.last(b.pitcherId), bat: this.last(b.batterId), base: BASE[on], n: word(n + 1) });
    return this.track([{ ...l, cls: 'setup', hold: SETUP_HOLD }]);
  }

  on_pitch(e) {
    const setup = this.setup(e);
    return [...setup, ...this.pitchCall(e)];
  }

  pitchCall(e) {
    const d = e.data, b = e.board;
    const pitcher = this.last(b.pitcherId);
    this.lastPitch = d;
    this.paPitches.push(d);
    if (this.paPitches.length === 1) this.countBefore = [0, 0];
    if (d.result === 'inplay') {
      const spoken = SPOKEN[d.pitch] ?? d.pitch.toLowerCase();
      let text;
      if (BREAKING.has(d.pitch) && this.rng.chance(0.35)) text = `${pitcher} hangs a ${spoken}.`;
      else if (spoken === 'fastball' || spoken === 'sinker') text = `${pitcher} throws a ${d.mph >= 98 ? 'blazing' : d.mph >= 96 ? 'sizzling' : d.mph >= 94 ? 'hard' : 'speedy'} ${spoken}${this.rng.chance(0.3) ? `, ${d.mph} on the gun` : ''}.`;
      else text = this.pick([`${pitcher} gives him one to hit!`, `${pitcher} deals the ${spoken}.`, `Here's the ${spoken}...`]);
      return this.track([{ text, cls: 'build', hold: 0.7 }]);
    }
    // the last pitch of a walk, strikeout or hit-by-pitch is called with the result
    if (d.result === 'hbp' || b.balls >= 4 || b.strikes >= 3) return [];

    const prev = this.paPitches.at(-2);
    const bat = this.last(b.batterId);
    const spoken = SPOKEN[d.pitch] ?? (d.pitch || 'pitch').toLowerCase();
    const named = (spoken === 'fastball' || spoken === 'sinker') && d.mph >= 96 && this.rng.chance(0.35) ? `${d.mph} mile an hour ${spoken}` : spoken;
    // what was thrown, as it follows on from the pitch before
    let lead = null;
    if (this.rng.chance(0.7)) {
      if (!prev) lead = this.pick([`First pitch, a ${named}`, `${pitcher} starts him off with a ${named}`, `The first pitch is a ${named}`]);
      else if (SPOKEN[prev.pitch] === spoken || prev.pitch === d.pitch) lead = this.pick([`Another ${named}`, `${cap(spoken)} again`, 'The same pitch']);
      else lead = this.pick([`Now the ${named}`, `He comes back with the ${named}`, `This time the ${named}`, `${pitcher} goes to the ${named}`]);
    }
    let what;
    if (d.result === 'ball') what = this.rng.chance(0.15) ? 'in the dirt' : this.pick([`${loc(this.rng)} for a ball`, `just misses ${loc(this.rng)}`, `misses ${loc(this.rng)}`]);
    else if (d.result === 'called') what = this.pick([`called strike ${strikeLoc(this.rng)}`, `taken for a strike ${strikeLoc(this.rng)}`, 'right there for a called strike', `and he gets the call ${strikeLoc(this.rng)}`]);
    else if (d.result === 'swinging') what = d.inZone ? this.pick(['swung on and missed', `${bat} swings right through it`, 'swing and a miss']) : this.pick([`${bat} chases it ${loc(this.rng)} and misses`, 'he goes after it and misses', 'swing and a miss on a pitch out of the zone']);
    else what = (this.countBefore?.[1] === 2) && this.lastFoul ? this.pick(['fouled away again', 'and he fouls that one off too', 'still alive, fouled back']) : this.pick(['fouled back', 'fouled off', 'fouled into the seats', 'hit foul down the line', `${bat} gets a piece of it, foul`]);
    let text = lead ? `${lead}, ${what}.` : `${cap(what)}.`;
    if (d.result === 'called' && !this.paAside && this.rng.chance(0.1)) {
      this.paAside = true;
      text += ` ${this.pick([`${bat} doesn't like that call.`, 'That call could have gone either way.', 'The catcher framed that one nicely.'])}`;
    }
    this.lastFoul = d.result === 'foul';
    text += ` ${countFlow(this.rng, prev ? this.countBefore : [0, 0], [b.balls, b.strikes], pitcher, bat)}`;
    this.countBefore = [b.balls, b.strikes];
    // never say the same thing twice in a row
    for (let i = 0; i < 4 && text === this.lastText; i++) text = text.replace(/^[^.]*\./, this.pick(['Fouled off.', 'Another one fouled away.', 'He gets a piece of it.', 'Foul ball.']));
    this.lastText = text;
    if (!this.paAside && d.n >= 95 && d.n % 5 <= 1 && d.n < 140) {
      this.paAside = true;
      text += ` That's ${d.n} pitches for ${pitcher}.`;
    }
    return this.track([{ text, cls: 'pitch', hold: 0.75 }]);
  }

  on_paEnd(e) {
    const d = e.data, b = e.board;
    const before = this.prev ?? b;
    const bat = this.last(d.batterId);
    const P = this.last(d.pitcherId);
    const scored = d.scored || [];
    const runs = scored.length;
    const L = [];
    const say = (text, hold = 0.6, cls = 'build') => L.push({ text, hold, cls });
    const F = (pos) => this.fielder(e, pos);
    const of = OF_FOR_DIR[d.dir] || 'CF';
    const field = FIELD_FOR_DIR[d.dir] || 'centre field';
    const infield = ['P', 'C', '1B', '2B', '3B', 'SS'].includes(d.fielder);
    const toward = { L: 'towards third', C: 'up the middle', R: 'towards first' }[d.dir] || 'up the middle';

    switch (d.result) {
      case 'K':
        L.push({ ...this.say(d.looking ? 'K_LOOKING' : 'K_SWINGING', { bat: d.batterId, pit: d.pitcherId, loc: strikeLoc(this.rng) }), cls: 'k' });
        break;
      case 'BB': L.push(this.say(runs ? 'BASES_LOADED_WALK' : 'WALK', { bat: d.batterId, loc: loc(this.rng) })); this.forced(before, b, scored, say); break;
      case 'IBB': say(`${P} intentionally walks ${bat}.`, 1); this.forced(before, b, scored, say); break;
      case 'HBP': say(`An inside pitch grazes ${bat}, who tosses the bat and jogs to first.`, 1.1); this.forced(before, b, scored, say); break;

      case 'HR': {
        L.push({ ...this.say('HR_CALL', { bat: d.batterId, field, fielder: F(of) }), cls: 'hr', hold: 2.4 });
        L.push({ ...this.say(runs === 4 ? 'HR_SLAM' : runs > 1 ? 'HR_MULTI' : 'HR_SOLO', { bat: d.batterId, runsWord: word(runs) }), cls: 'hr', hold: 2.4 });
        break;
      }
      case '3B':
        L.push(this.say('TRIPLE_HIT', { bat: d.batterId, field }));
        say(`${bat} runs for first... he's going for second... he's going for third!`, 0.7);
        say(`${F(of)} makes the throw... Safe! A triple for ${bat}.`, 0.9, 'big');
        this.runners(before, b, scored, d, say, F, of, true);
        break;
      case '2B':
        if (d.bip === 'GB') say(`${bat} smashes a ground ball down the line!`, 0.6); else L.push(this.say('DOUBLE_LINER', { bat: d.batterId, field }));
        this.runners(before, b, scored, d, say, F, of, true);
        say(`${bat} is going for second! ${F(of)} makes the throw... Safe! A double for ${bat}.`, 0.9, 'big');
        break;
      case '1B':
        if (d.bip === 'GB') {
          L.push(this.say('GROUNDER_HIT', { bat: d.batterId, toward }));
          say(`${this.say('RUNS_FOR_FIRST', { bat: d.batterId }).text} ${infield ? this.say('GETS_PAST', { fielder: F(d.fielder) }).text : `The ball shoots into ${TO[of]}.`}`, 0.6);
        } else {
          L.push(this.say('LINER_HIT', { bat: d.batterId, to: TO[d.fielder] ?? TO[of] }));
          say(`${bat} hustles for first! ${infield ? `${F(d.fielder)} can't reach it!` : `The ball drops in front of ${F(of)}.`}`, 0.6);
        }
        say(d.bip === 'GB' || infield ? this.say('OF_PICKS_UP', { fielder: F(of), field }).text : `${F(of)} fields it on a hop. A base hit for ${bat}.`, 0.6, 'big');
        this.runners(before, b, scored, d, say, F, of, false);
        break;

      case 'GO':
        L.push(this.say('GROUNDER_OUT', { bat: d.batterId, to: TO[d.fielder] }));
        say(d.fielder === '1B' ? `${F('1B')} picks it up and runs to the bag for the out.`
          : d.fielder === 'P' ? `${F('P')} fields it and throws to first. Out!`
            : `${F(d.fielder)} throws to ${F('1B')} and gets the out!`, 0.9);
        this.runners(before, b, scored, d, say, F, of, false);
        break;
      case 'FC':
        say(`${bat} hits a grounder to ${TO[d.fielder]}.`, 0.6);
        say(`${F(d.fielder)} throws to second to get the lead runner. ${bat} is safe at first.`, 0.9);
        this.runners(before, b, scored, d, say, F, of, false);
        break;
      case 'DP': {
        const pivot = ['SS', '3B', 'P'].includes(d.fielder) ? '2B' : 'SS';
        say(`${bat} hits a grounder to ${TO[d.fielder]}.`, 0.6);
        say(`${F(d.fielder)} to ${F(pivot)}, on to first... Double play!`, 1.1, 'big');
        this.runners(before, b, scored, d, say, F, of, false);
        break;
      }
      case 'LDP': say(`${bat} lines one right at ${F(d.fielder)}, and he doubles off the runner! Double play!`, 1.1, 'big'); break;
      case 'FO':
        say(`${bat} lifts a fly ball to ${TO[d.fielder]}.`, 0.6);
        L.push({ ...this.say('FLY_CAUGHT', { fielder: F(d.fielder) }), hold: 0.9 });
        this.runners(before, b, scored, d, say, F, of, false);
        break;
      case 'SF':
        say(`${bat} lifts a fly ball to ${TO[d.fielder]}, deep enough.`, 0.6);
        say(`${F(d.fielder)} makes the catch. ${this.last(scored[0])} tags up... he's going for home... Safe!`, 1, 'big');
        break;
      case 'LO': L.push({ ...this.say('LINE_OUT', { bat: d.batterId, to: TO[d.fielder], fielder: F(d.fielder) }), hold: 1 }); break;
      case 'PO': say(`${bat} pops it up. ${F(d.fielder)} squares it up for the out.`, 0.9); break;
      case 'E':
        if (d.bip === 'GB') {
          say(`${bat} hits a grounder to ${TO[d.fielder]}.`, 0.6);
          say(`${F(d.fielder)} boots it! ${bat} is safe on the error.`, 1, 'big');
        } else {
          say(`${bat} lifts a ${d.bip === 'LD' ? 'sinking liner' : 'fly ball'} to ${TO[d.fielder]}.`, 0.6);
          L.push({ ...this.say('ERROR_DROP', { bat: d.batterId, fielder: F(d.fielder) }), cls: 'big' });
        }
        this.runners(before, b, scored, d, say, F, of, false);
        break;
      case 'SAC': say(`${bat} lays down a bunt! ${F('P')} throws to first for the out, and the runner moves up.`, 1); break;
      case 'BUNT_OUT': say(`${bat} bunts it right back to ${F('P')}, who gets the lead runner.`, 1); break;
      default: say(`${bat} is out.`, 0.9);
    }

    // what he did, for the colour next time up; a pitcher's run of outs
    const OUTS = new Set(['K', 'GO', 'FO', 'LO', 'PO', 'DP', 'LDP', 'SF', 'SAC', 'BUNT_OUT', 'FC']);
    (this.didLog ||= {})[d.batterId] = [...(this.didLog[d.batterId] || []), d.result];
    this.retired ||= {};
    this.retired[d.pitcherId] = OUTS.has(d.result) ? (this.retired[d.pitcherId] || 0) + (d.result === 'DP' || d.result === 'LDP' ? 2 : 1) : 0;
    // the outs, between batters
    if (b.outs > before.outs && b.outs < 3 && !runs && L.length && this.rng.chance(0.65)) {
      const last = L[L.length - 1];
      last.text += ` ${this.pick(b.outs === 1 ? ['One away.', 'One out.', "That's one down."] : ['Two away.', 'Two outs now.', "That's two down."])}`;
    }
    if (runs) {
      const s = b.score;
      if (e.half === 'bottom' && e.inning >= 9 && s.home > s.away) {
        L.push({ ...this.say('WALK_OFF', { city: this.teams.home.city, inn: ord(e.inning) }), hold: 2.4, cls: 'end' });
      } else {
        say(s.away === s.home ? `We're all tied up at ${s.away}.` : this.scoreNow(s), 1.8, 'run');
      }
      L.push(...this.colour.afterRuns(e, d.result === 'HR'));
    }

    // key moments: runs, big plays, and anything the engine rates as important
    // key moments are the plays a highlights reel would keep: runs, big hits, and the tense moments late on
    const margin = Math.abs(b.score.home - b.score.away);
    const late = e.inning >= 7 && margin <= 2;
    const risp = !!(before.bases[1] || before.bases[2]), onBase = before.bases.some(Boolean), loaded = before.bases.every(Boolean);
    const key = runs > 0 || ['HR', '3B'].includes(d.result)
      || ['DP', 'LDP'].includes(d.result)                                  // a double play always ends something
      || e.imp >= 0.8                                                       // the engine's own rating, which already weighs the situation
      || (loaded && d.result !== 'BB')                                       // the bases loaded and nothing scored: that is a moment
      || (risp && before.outs === 2 && ['K', 'GO', 'FO', 'LO', 'PO', 'FC'].includes(d.result)) // the inning-ending out with a man in scoring position
      || (d.result === 'E' && onBase)
      || (late && (e.imp >= 0.5 || (d.result === 'K' && risp)));
    // a key at-bat: the lead-in, the last pitch or two and the result; not every pitch before it
    if (key) {
      if (this.curIntro) this.curIntro.key = true;
      for (const l of L) l.key = true;
    }
    this.curIntro = null;
    this.curPA = null;

    this.endCall(e, L, d.result);
    // CM-style scorer label under the team bar: the batter who drove the runs in, or the runner if nobody did
    if (runs) {
      const rbiResult = !['DP', 'LDP', 'E'].includes(d.result);
      L[L.length - 1].scorer = { side: e.half === 'top' ? 'away' : 'home', inning: e.inning, pid: rbiResult ? d.batterId : scored[0], label: rbiResult
        ? `${bat}${d.result === 'HR' ? (runs > 1 ? ` (${runs}-run HR)` : ' (HR)') : ''}`
        : `${listNames(scored.map((id) => this.last(id)))}${d.result === 'E' ? ' (E)' : ''}` };
    }
    // the outcome itself carries the run colours
    if (runs && d.result !== 'HR') L.filter((l) => l.cls === 'big').forEach((l) => { l.cls = 'run'; });
    return L;
  }

  /** Which side has won if this play ended the game, else null. */
  winner(e) {
    const b = e.board, { away, home } = b.score;
    if (e.inning < 9) return null;
    if (e.half === 'bottom' && home > away) return 'home'; // walked off
    if (b.outs >= 3 && e.half === 'top' && home > away) return 'home';
    if (b.outs >= 3 && e.half === 'bottom' && away > home) return 'away';
    return null;
  }

  /** The radio call for the end: on the last play itself, then who has won and by how much. */
  endCall(e, L, result) {
    const w = this.winner(e);
    if (!w || this.ended || !L.length) return;
    this.ended = true;
    const s = e.board.score, W = this.teams[w], Lo = this.teams[w === 'home' ? 'away' : 'home'];
    const hi = Math.max(s.home, s.away), lo = Math.min(s.home, s.away);
    const walkOff = e.half === 'bottom' && w === 'home';
    const last = L[L.length - 1];
    if (!walkOff) {
      // the out that ends it says so at once
      const shout = result === 'K' ? this.pick(["And that's the ball game!", "He got him! That's the ball game!", 'Ball game over!'])
        : ['DP', 'LDP'].includes(result) ? this.pick(['Double play! Ball game over!', "Two for the price of one, and that's the ball game!"])
          : result === 'CS' ? "He's out at second! And that ends the game!"
            : this.pick(["And that's the ball game!", 'Ball game over!', 'And the game is over!']);
      last.text = `${last.text} ${shout}`;
      last.cls = 'end';
      last.hold = 2.4;
    }
    // straight after the call that ended it (a crowd line can wait)
    const at = walkOff ? L.findLastIndex((l) => l.cls === 'end') + 1 : L.length;
    L.splice(at, 0, { text: this.pick([
      `${W.city} win it, ${word(hi)} to ${word(lo)}!`,
      `The ${W.name} win! The final, ${W.city} ${hi}, ${Lo.city} ${lo}.`,
      hi - lo === 1 && !walkOff ? `${W.city} hang on to win it by a run, ${hi} to ${lo}!` : `It's all over: ${W.city} ${hi}, ${Lo.city} ${lo}!`,
    ]), cls: 'end', key: true, hold: 2.6 });
    for (const l of L) l.key = true;
    for (const l of L.slice(at + 1)) if (l.cls === 'end') l.cls = 'colour';
  }

  /** Forced runners on a walk or hit batsman. */
  forced(before, after, scored, say) {
    const moved = [];
    for (let i = 2; i >= 0; i--) {
      const id = before.bases[i];
      if (!id) continue;
      if (scored.includes(id)) moved.push(`${this.last(id)} is forced home`);
      else if (after.bases[i] !== id) {
        const j = after.bases.indexOf(id);
        if (j > i) moved.push(`${this.last(id)} moves to ${BASE[j]}`);
      }
    }
    if (moved.length) say(`${cap(moved.join(', and '))}.`, 0.9, scored.length ? 'big' : 'build');
  }

  /** Where every runner went on a ball in play, told lead runner first. */
  runners(before, after, scored, d, say, F, of, extraBase) {
    let thrown = false;
    for (let i = 2; i >= 0; i--) {
      const id = before.bases[i];
      if (!id) continue;
      const n = this.last(id);
      if (scored.includes(id)) {
        // a runner scoring from first, or from second on a single, makes it close
        const close = (i === 0 && extraBase) || (i === 1 && !extraBase && d.result === '1B');
        if (close && !thrown) { say(`${n} is going for home! ${F(of)} makes the throw... Safe!`, 0.9, 'big'); thrown = true; }
        else say(this.say('RUNNER_SCORES', { run: id }).text, 0.7, 'big');
        continue;
      }
      const j = after.bases.indexOf(id);
      if (j === -1) continue; // put out on the play; the out is in the call already
      if (j > i) say(this.say('RUNNER_ADVANCES', { run: id, base: BASE[j] }).text, 0.6);
      else if (j === i && (d.result === '1B' || d.result === '2B')) say(`${n} holds at ${BASE[j]}.`, 0.6);
    }
  }

  // ---------- other events ----------

  on_steal(e) {
    const n = this.last(e.data.runnerId);
    const c = this.fielder(e, 'C');
    // a caught stealing, or any steal late in a close game, is a key moment
    const key = !e.data.success || (e.inning >= 7 && Math.abs(e.board.score.home - e.board.score.away) <= 2);
    if (key && this.curIntro) this.curIntro.key = true;
    const out = [
      { ...this.say('STEAL', { run: e.data.runnerId, base: BASE[e.data.to - 1] }), cls: 'big', key, hold: 0.6 },
      { ...this.say(e.data.success ? 'STEAL_SAFE' : 'STEAL_OUT', { catcher: c, run: e.data.runnerId }), cls: 'big', key, hold: 1 },
    ];
    if (!e.data.success) this.endCall(e, out, 'CS');
    return out;
  }

  on_wildPitch(e) {
    const s = e.data.scored || [];
    const c = this.fielder(e, 'C');
    if (s.length && this.curIntro) this.curIntro.key = true;
    const out = [{ text: `The pitch is in the dirt and gets away from ${c}! ${s.length ? `${this.last(s[0])} comes in to score!` : 'The runners move up.'}`,
      cls: s.length ? 'run' : 'build', key: s.length > 0, hold: 1.1,
      scorer: s.length ? { side: e.half === 'top' ? 'away' : 'home', label: `${this.last(s[0])} (WP)`, inning: e.inning, pid: s[0] } : null }];
    if (s.length) this.endCall(e, out, 'WP');
    return out;
  }

  on_sub(e) {
    const club = this.teams[e.data.side];
    const out = this.last(e.data.outId), inP = this.p(e.data.inId), inN = this.name(e.data.inId);
    if (e.data.kind === 'pitcher') {
      this.seenPitchers.add(e.data.inId);
      return [
        { text: this.card(e, `A pitching change for ${club.city}.`), cls: 'sum', key: true, hold: 1.2, keyIntro: true },
        { text: `That's it for ${out}, after ${e.data.outPc} pitches.`, cls: 'quiet', key: true, hold: 1 },
        { text: `Taking the ball for ${club.city} is ${inP?.throws === 'L' ? 'the left-hander ' : ''}${inN}${inP?.era ? `, earned run average ${inP.era}` : ''}.`, cls: 'quiet', key: true, hold: 1.2 },
      ];
    }
    if (e.data.kind === 'ph') return [{ text: `${inN} will pinch hit for ${out}.${inP?.avg ? ` The new hitter bats ${inP.avg}.` : ''}`, cls: 'quiet', key: true, hold: 1.2 }];
    if (e.data.kind === 'pr') return [{ text: `${inN} will run for ${out} at ${BASE[e.data.base]}.`, cls: 'quiet', key: true }];
    return [{ text: `${inN} comes in to play ${POS_NAME[e.data.pos] ?? e.data.pos}, replacing ${out}.`, cls: 'quiet' }];
  }

  on_visit(e) {
    return [{ ...this.say('VISIT', { pit: e.data.pitcherId }), cls: 'quiet', key: false }];
  }

  on_alignment(e) {
    const t = { dp: 'Infield set for a double play.', in: 'The infield is playing in.', normal: 'Infield back at normal positions.' }[e.data.mode];
    return t ? [{ text: t, cls: 'build', hold: 0.6 }] : [];
  }
}

// ---------- phrasing helpers ----------

function loc(rng) {
  return rng.pick(['high', 'low', 'inside', 'outside', 'high and inside', 'low and outside', 'low and inside', 'high and outside', 'low']);
}
function strikeLoc(rng) {
  return rng.pick(['at the knees', 'across the letters', 'at the belt', 'on the outside corner', 'on the inside corner']);
}
function countCall(rng, b, s) {
  if (b === 3 && s === 2) return rng.pick(["It's a full count.", 'Full count.']);
  if (b === 1 && s === 1) return rng.pick(["It's a ball and a strike.", 'The count is a ball and a strike.']);
  const B = ['No balls', 'One ball', 'Two balls', 'Three balls'][b], S = ['no strikes', 'one strike', 'two strikes'][s];
  return rng.chance(0.55) ? `Here comes the ${['oh', 'one', 'two', 'three'][b]} and ${['oh', 'one', 'two'][s]}.` : `${B} and ${S}.`;
}
/** The count, called with where it has gone: ahead, behind, back to even, full. */
function countFlow(rng, [pb, ps], [b, s], pit, bat) {
  const words = `${['Oh', 'One', 'Two', 'Three'][b]} and ${['oh', 'one', 'two'][s]}`;
  if (b === 3 && s === 2) return rng.pick(pb === 3 && ps === 2 ? ['Still full.', 'The count stays full.'] : ["And the count runs full.", 'Three and two.', 'Full count.']);
  if (b === s && b > 0 && (pb !== ps)) return rng.pick([`Back to even at ${['', 'one', 'two'][b]} and ${['', 'one', 'two'][b]}.`, `${words}.`]);
  if (s === 2 && b <= 1) return rng.pick([`${words}, and ${pit} is ahead.`, `${words}.`, `${pit} is ahead, ${words.toLowerCase()}.`]);
  if (b >= 2 && s === 0) return rng.pick([`${words}. ${bat} is ahead in the count.`, `${words}.`, `${pit} is behind now, ${words.toLowerCase()}.`]);
  if (b === 3) return rng.pick([`${words}.`, `${words}, and ${pit} is on the edge.`]);
  return countCall(rng, b, s);
}
function situation(bases, outs) {
  const [f, s, t] = bases.map(Boolean);
  const o = outs === 1 ? 'There is one out' : `There are ${outs === 0 ? 'no' : word(outs)} outs`;
  let r;
  if (f && s && t) r = 'the bases are loaded';
  else if (f && s) r = 'runners on first and second';
  else if (f && t) r = 'runners on first and third';
  else if (s && t) r = 'runners on second and third';
  else if (f) r = 'a runner on first';
  else if (s) r = 'a runner on second';
  else if (t) r = 'a runner on third';
  else r = 'nobody on';
  return `${o} and ${r}.`;
}
function lobWords(n) { return n ? `${word(n)} left on base` : 'nobody left on base'; }

function listNames(names) {
  if (names.length <= 1) return names.join('');
  return `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`;
}
