// The match engine: a pitch-by-pitch state machine. It imports nothing from the UI or the commentary.
// Call step() to advance one pitch (or one action); it returns the events produced. Manager commands
// passed to command() take effect before the next pitch. Same seed + same commands = same game.

import { Rng } from '../core/rng.js';
import { C, z, shift, matchup, pitchOutcome, battedBall, choosePitch, withPitch } from './model.js';
import { shouldPull, mustPull, pickReliever, stealAttemptChance, wantsIntentionalWalk, wantsSacrifice } from './manager.js';

const POSITIONS = ['P', 'C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF'];

/**
 * Engine player: { id, first, last, bats, throws, pos, role?, r: { contact, power, eye, avoidK, gb, pull,
 *   speed, instincts, steal, range, hands, arm, framing, stuff, movement, control, stamina, hold, pgb } }
 * Team: { id, city, name, abbr, lineup: [{ player, pos }] (9, batting order), bench: [player],
 *   starter: player, bullpen: [player] }
 */
export class Game {
  /**
   * @param {{away:any, home:any, seed:string|number, park?:number, userSide?:'away'|'home'|null,
   *          autoUser?:boolean, extraRunner?:boolean}} opts
   */
  constructor(opts) {
    this.seed = String(opts.seed);
    this.rng = new Rng(this.seed);
    this.env = opts.env ?? null;
    this.park = opts.park ?? opts.env?.hr ?? 1;
    this.userSide = opts.userSide ?? null;
    this.autoUser = opts.autoUser ?? true;
    /** Per side: the manager makes every pitching change himself (the coach only steps in for an exhausted arm). */
    this.manualPen = { home: false, away: false };
    this.extraRunner = opts.extraRunner ?? true;
    this.seq = 0;
    this.inning = 1; this.half = 'top';
    this.outs = 0; this.balls = 0; this.strikes = 0; this.inningErr = 0;
    this.bases = [null, null, null]; // { player, resp } where resp is the pitcher responsible
    this.score = { away: 0, home: 0 };
    this.linescore = { away: [], home: [] };
    this.stats = new Map();
    this.commands = [];
    this.log = [];      // every command applied, with the seq it applied at (for replays)
    this.events = [];
    this.over = false;
    this.side = { away: this.#teamState(opts.away), home: this.#teamState(opts.home) };
    this.gen = this.#play();
  }

  #teamState(team) {
    const fielders = {};
    for (const { player, pos } of team.lineup) if (pos !== 'DH') fielders[pos] = player;
    fielders.P = team.starter;
    const s = {
      team, order: team.lineup.map((x) => ({ player: x.player, pos: x.pos })), idx: 0,
      fielders, bench: [...team.bench], pen: [...team.bullpen], used: new Set([team.starter.id]),
      pitcher: team.starter, hits: 0, errors: 0, lob: 0, visits: 0, infield: 'normal',
      outing: null,
    };
    s.outing = this.#newOuting(team.starter, true);
    return s;
  }

  #newOuting(p, starter) {
    return { player: p, starter, pc: 0, outs: 0, runs: 0, bf: 0, faced: new Map(), startInning: this.inning, cleared: false };
  }

  /**
   * Why this side cannot change its pitcher right now, or null if it can: never in the middle of an at-bat, and a pitcher
   * must face three batters or finish the half-inning he came in for.
   */
  pitchChangeBlock(key, { midOk = false } = {}) {
    if (this.over) return 'The game is over.';
    if (key !== this.fieldingKey) return 'Pitching changes are made when your team is in the field.';
    if (!midOk && (this.balls || this.strikes)) return 'A pitcher cannot be changed in the middle of an at-bat. Wait until it ends.';
    const o = this.side[key].outing;
    if (!o.cleared && o.bf < 3) return `${o.player.last} has to face at least three batters, or the end of the inning, before he can be replaced (he has faced ${o.bf}).`;
    return null;
  }

  /** Is the only thing stopping a change the three-batter rule? Then a change asked for now is held until it ends. */
  pitchChangeWaits(key) {
    if (this.over || key !== this.fieldingKey) return false;
    const o = this.side[key].outing;
    return !o.cleared && o.bf < 3;
  }

  // ---------- public API ----------

  /** Queue a manager command for `side`: { type, ... }. Applied before the next pitch. */
  command(side, cmd) { this.commands.push({ side, ...cmd }); }

  /** Advance until at least one event is produced. Returns the new events. */
  step() {
    const start = this.events.length;
    while (!this.over && this.events.length === start) {
      const r = this.gen.next();
      if (r.done) this.over = true;
    }
    return this.events.slice(start);
  }

  /** Run to the end. */
  playAll() { while (!this.over) this.step(); return this; }

  get batting() { return this.side[this.half === 'top' ? 'away' : 'home']; }
  get fielding() { return this.side[this.half === 'top' ? 'home' : 'away']; }
  get battingKey() { return this.half === 'top' ? 'away' : 'home'; }
  get fieldingKey() { return this.half === 'top' ? 'home' : 'away'; }
  get batter() { const b = this.batting; return b.order[b.idx].player; }

  board() {
    return {
      inning: this.inning, half: this.half, outs: this.outs, balls: this.balls, strikes: this.strikes,
      bases: this.bases.map((r) => r?.player.id ?? null),
      score: { ...this.score },
      hits: { away: this.side.away.hits, home: this.side.home.hits },
      errors: { away: this.side.away.errors, home: this.side.home.errors },
      batterId: this.batter.id, pitcherId: this.fielding.pitcher.id, pitchCount: this.fielding.outing.pc,
    };
  }

  /** Per-player box score line. */
  line(id) {
    if (!this.stats.has(id)) this.stats.set(id, {
      PA: 0, AB: 0, H: 0, '2B': 0, '3B': 0, HR: 0, R: 0, RBI: 0, BB: 0, HBP: 0, K: 0, SB: 0, CS: 0, SF: 0, GDP: 0,
      pOuts: 0, pH: 0, pR: 0, pER: 0, pBB: 0, pHBP: 0, pK: 0, pHR: 0, pitches: 0, BF: 0, GS: 0,
    });
    return this.stats.get(id);
  }

  // ---------- internals ----------

  #emit(type, data = {}, imp = 0) {
    this.events.push({ seq: this.seq++, inning: this.inning, half: this.half, type, data, imp, board: this.board() });
  }

  *#play() {
    this.line(this.side.away.pitcher.id).GS = 1;
    this.line(this.side.home.pitcher.id).GS = 1;
    this.#emit('gameStart', { away: this.side.away.team.id, home: this.side.home.team.id }, 1);
    for (;;) {
      yield* this.#halfInning();
      if (this.#gameOver()) break;
      if (this.half === 'top') this.half = 'bottom';
      else { this.half = 'top'; this.inning++; }
    }
    this.over = true;
    this.#emit('gameEnd', { score: { ...this.score }, innings: this.inning }, 1);
  }

  #gameOver() {
    const { away, home } = this.score;
    if (this.inning < 9) return false;
    if (this.half === 'top') return home > away; // home leads after the top of the 9th or later
    return home !== away;                        // after a full inning, any lead ends it
  }

  *#halfInning() {
    this.outs = 0; this.balls = 0; this.strikes = 0; this.inningErr = 0;
    this.bases = [null, null, null];
    this.batting.outing.cleared = true; // the side that just fielded has finished its half-inning: its pitcher has met the three-batter rule
    const bat = this.batting, fld = this.fielding;
    const runsBefore = this.score[this.battingKey], hitsBefore = bat.hits;
    this.#halfStartDecisions();
    if (this.extraRunner && this.inning >= 10) {
      const prev = bat.order[(bat.idx + 8) % 9].player;
      this.bases[1] = { player: prev, resp: null };
    }
    this.#emit('halfStart', { batting: this.battingKey, pitcherId: fld.pitcher.id, extraRunner: this.bases[1]?.player.id ?? null }, 0.2);
    while (this.outs < 3) {
      const ended = yield* this.#plateAppearance();
      if (this.#walkOff()) break;
      if (ended === 'inningOver') break;
    }
    const lob = this.bases.filter(Boolean).length;
    if (this.outs >= 3) bat.lob += lob;
    const runs = this.score[this.battingKey] - runsBefore;
    this.linescore[this.battingKey].push(runs);
    this.#emit('halfEnd', { runs, hits: bat.hits - hitsBefore, lob: this.outs >= 3 ? lob : 0, walkOff: this.#walkOff() }, runs ? 0.6 : 0.3);
  }

  #walkOff() {
    return this.half === 'bottom' && this.inning >= 9 && this.score.home > this.score.away;
  }

  #halfStartDecisions() {
    // the fielding side may change pitchers between innings
    const key = this.fieldingKey;
    const planned = this.side[key].planned;
    if (planned) {
      this.side[key].planned = null;
      const p = this.side[key].pen.find((x) => x.id === planned);
      if (p && p !== this.side[key].pitcher && !this.pitchChangeBlock(key)) { this.#changePitcher(key, p); return; }
    }
    if (this.#penAuto(key) && !this.pitchChangeBlock(key)) {
      const s = this.side[key];
      if (shouldPull(this, s, { betweenInnings: true })) this.#changePitcher(key, pickReliever(this, s));
    }
  }

  #aiControls(key) { return key !== this.userSide || this.autoUser; }
  #penAuto(key) { return this.#aiControls(key) && !this.manualPen[key]; }
  setManualPen(key, on) { this.manualPen[key] = !!on; }
  /** Would the computer change pitchers now? Used to prompt a manager who has taken the bullpen over. */
  pullAdvice(key, betweenInnings = false) { return !this.over && !this.pitchChangeBlock(key) && shouldPull(this, this.side[key], { betweenInnings }); }

  #aiAlignment(key) {
    if (this.outs === 2) return 'normal';
    const lead = this.score[key] - this.score[key === 'home' ? 'away' : 'home'];
    if (this.bases[2] && this.inning >= 7 && lead >= -1 && lead <= 1) return 'in';
    if (this.bases[0]) return 'dp';
    return 'normal';
  }

  /** Apply queued commands and AI decisions before a pitch. Returns per-pitch intents. */
  #decisions(firstPitch) {
    const intents = { steal: false, ibb: false, bunt: false, hitRun: false };
    const cmds = this.commands.splice(0);
    const userKeys = new Set();
    const midAtBat = !!(this.balls || this.strikes);
    for (const c of cmds) {
      // a pitching change asked for in the middle of an at-bat waits for it to end
      if (c.type === 'pitch' && midAtBat) { this.commands.push(c); continue; }
      // ...and so does one asked for before the pitcher has faced three batters: it goes in at the first chance
      if (c.type === 'pitch' && this.pitchChangeWaits(c.side)) { this.commands.push(c); continue; }
      this.log.push({ seq: this.seq, ...c });
      userKeys.add(c.side);
      this.#applyCommand(c, intents);
    }
    // AI for the fielding side: pitching changes before a batter
    const fk = this.fieldingKey;
    if (firstPitch && !userKeys.has(fk)) {
      const s = this.side[fk];
      if (!this.pitchChangeBlock(fk) && (this.#penAuto(fk) ? shouldPull(this, s, {}) : mustPull(s))) this.#changePitcher(fk, pickReliever(this, s));
    }
    // AI for the fielding side: infield alignment for the situation
    if (firstPitch && this.#aiControls(fk) && !userKeys.has(fk)) {
      const s = this.side[fk];
      const mode = this.#aiAlignment(fk);
      if (mode !== s.infield) { s.infield = mode; this.#emit('alignment', { side: fk, mode }, 0.1); }
    }
    // AI for the fielding side: the intentional walk, following the club's instruction
    if (firstPitch && this.#aiControls(fk) && !userKeys.has(fk) && wantsIntentionalWalk(this, this.side[fk])) intents.ibb = true;
    // AI for the batting side: the sacrifice bunt, following the club's instruction
    const bk = this.battingKey;
    if (firstPitch && !intents.ibb && this.#aiControls(bk) && !userKeys.has(bk) && wantsSacrifice(this, this.side[bk])) intents.bunt = true;
    // AI for the batting side: steals
    if (this.#aiControls(bk) && !intents.steal && this.bases[0] && !this.bases[1]) {
      if (this.rng.chance(stealAttemptChance(this, this.bases[0].player))) intents.steal = true;
    }
    return intents;
  }

  #applyCommand(c, intents) {
    const s = this.side[c.side];
    const isFielding = c.side === this.fieldingKey;
    switch (c.type) {
      case 'pitch': {
        const p = s.pen.find((x) => x.id === c.playerId);
        if (isFielding && p && !this.pitchChangeBlock(c.side)) this.#changePitcher(c.side, p);
        else if (!isFielding && p) s.planned = p.id; // batting: he takes the mound when the team next takes the field
        break;
      }
      case 'visit':
        if (isFielding && s.visits < 5) { s.visits++; s.outing.pc = Math.max(0, s.outing.pc - 4); this.#emit('visit', { side: c.side, pitcherId: s.pitcher.id }, 0.2); }
        break;
      case 'ibb': if (isFielding) intents.ibb = true; break;
      case 'infield':
        if (isFielding && s.infield !== c.mode) { s.infield = c.mode; this.#emit('alignment', { side: c.side, mode: c.mode }, 0.1); }
        break;
      case 'steal': if (!isFielding && this.bases[0] && !this.bases[1]) intents.steal = true; break;
      case 'bunt': if (!isFielding) intents.bunt = true; break;
      case 'hitRun': if (!isFielding) intents.hitRun = true; break;
      case 'ph': if (!isFielding) this.#pinchHit(c.side, c.playerId); break;
      case 'pr': if (!isFielding) this.#pinchRun(c.side, c.playerId, c.base); break;
      case 'def': if (isFielding) this.#defSub(c.side, c.inId, c.outId); break;
    }
  }

  #changePitcher(key, p) {
    const s = this.side[key];
    if (!p || p === s.pitcher) return;
    const out = s.pitcher;
    const outPc = s.outing.pc;
    s.pen = s.pen.filter((x) => x !== p);
    s.used.add(p.id);
    s.pitcher = p;
    s.fielders.P = p;
    s.outing = this.#newOuting(p, false);
    this.#emit('sub', { side: key, kind: 'pitcher', outId: out.id, inId: p.id, outPc }, 0.4);
  }

  #pinchHit(key, id) {
    const s = this.side[key];
    const p = s.bench.find((x) => x.id === id);
    if (!p) return;
    const slot = s.order[s.idx];
    const out = slot.player;
    s.bench = s.bench.filter((x) => x !== p);
    slot.player = p; // takes the position of the man he replaced; defence is sorted next inning
    if (slot.pos !== 'DH') s.fielders[slot.pos] = p;
    this.#emit('sub', { side: key, kind: 'ph', outId: out.id, inId: p.id }, 0.4);
  }

  #pinchRun(key, id, base) {
    const s = this.side[key];
    const p = s.bench.find((x) => x.id === id);
    const r = this.bases[base];
    if (!p || !r) return;
    const slot = s.order.find((o) => o.player === r.player);
    s.bench = s.bench.filter((x) => x !== p);
    if (slot) { slot.player = p; if (slot.pos !== 'DH') s.fielders[slot.pos] = p; }
    this.#emit('sub', { side: key, kind: 'pr', outId: r.player.id, inId: p.id, base }, 0.3);
    r.player = p;
  }

  #defSub(key, inId, outId) {
    const s = this.side[key];
    const p = s.bench.find((x) => x.id === inId);
    const slot = s.order.find((o) => o.player.id === outId);
    if (!p || !slot) return;
    s.bench = s.bench.filter((x) => x !== p);
    slot.player = p;
    if (slot.pos !== 'DH') s.fielders[slot.pos] = p;
    this.#emit('sub', { side: key, kind: 'def', outId, inId, pos: slot.pos }, 0.3);
  }

  *#plateAppearance() {
    const bat = this.batting, fld = this.fielding;
    this.balls = 0; this.strikes = 0;
    // AI pitching changes happen before the batter is announced; commands are read again before every pitch
    this.#decisions(true);
    let intents;
    const batter = this.batter;
    let pitcher = null, o = null, faced = 1;
    const meet = () => {
      // (re)read the pitcher each pitch: a change mid at-bat leaves the count as it is
      if (fld.pitcher === pitcher) return;
      pitcher = fld.pitcher; o = fld.outing;
      faced = (o.faced.get(batter.id) || 0) + 1;
      o.faced.set(batter.id, faced);
    };
    meet();
    this.#emit('paStart', { batterId: batter.id, pitcherId: pitcher.id, order: bat.idx + 1, faced }, 0.1);
    yield;

    for (;;) {
      intents = this.#decisions(false);
      meet();
      if (intents.ibb) { this.#walk(batter, 'IBB'); this.#nextBatter(); return 'pa'; }
      if (intents.bunt) { this.#bunt(batter); this.#nextBatter(); return 'pa'; }

      const m = matchup(batter, pitcher, { fatigue: this.#fatigue(o), tto: faced, park: this.park, hitF: this.env?.hit ?? 1, lev: this.#leverage(), catcher: fld.fielders.C, strikes: this.strikes, third: !!this.bases[2], outs: this.outs, fx: { pit: fld.team.sx?.pitch, def: fld.team.sx?.defence, off: bat.team.sx?.offence } });

      // steal attempt on this pitch
      if (intents.steal && this.bases[0] && !this.bases[1]) {
        const ended = this.#steal(0);
        yield;
        if (ended) return 'inningOver';
      }
      // wild pitch / passed ball
      if (this.bases.some(Boolean) && this.rng.chance(C.wildPitchPerPitch * Math.exp(-0.3 * m.control - 0.3 * z(fld.fielders.C?.r.block) - 0.12 * m.hp))) {
        this.#wildPitch(pitcher);
        yield;
        if (this.#walkOff()) return 'inningOver';
      }

      const framing = z(fld.fielders.C?.r.framing);
      const approach = intents.hitRun ? 0.6 : (this.balls === 3 && this.strikes < 2 ? -0.2 : 0);
      // the pitch is chosen first, and what it is changes what happens
      const pitchName = choosePitch(this.rng, pitcher, this.balls, this.strikes);
      const mp = withPitch(m, pitcher, pitchName);
      const po = pitchOutcome(this.rng, mp, this.balls, this.strikes, { framing, approach, zone: this.env?.zone ?? 0, around: this.#around() });
      o.pc++;
      this.line(pitcher.id).pitches++;
      const pitchType = this.#pitchType(pitcher, pitchName, this.#fatigue(o));
      const res = po.result;

      if (res === 'ball') this.balls++;
      else if (res === 'called' || res === 'swinging') this.strikes++;
      else if (res === 'foul' && this.strikes < 2) this.strikes++;
      this.#emit('pitch', { n: o.pc, pitch: pitchType.name, mph: pitchType.mph, result: res, inZone: po.inZone }, 0.05);
      yield;

      if (res === 'hbp') { this.#hbp(batter); this.#nextBatter(); return 'pa'; }
      if (this.balls >= 4) { this.#walk(batter, 'BB'); this.#nextBatter(); return 'pa'; }
      if (this.strikes >= 3) { this.#strikeout(batter, res); this.#nextBatter(); return 'pa'; }
      if (res === 'inplay') {
        const hand = batter.bats === 'S' ? (pitcher.throws === 'L' ? 'R' : 'L') : batter.bats;
        const bb = battedBall(this.rng, mp, hand, po.inZone, (pos) => fld.fielders[pos]);
        this.#ballInPlay(batter, bb, m);
        this.#nextBatter();
        return 'pa';
      }
    }
  }

  #nextBatter() {
    const b = this.batting;
    b.idx = (b.idx + 1) % 9;
    this.balls = 0; this.strikes = 0;
  }

  #fatigue(o) {
    const st = z(o.player.r.stamina) * 10;
    const limit = o.starter ? C.starterLimitBase + 1.5 * st : C.relieverLimitBase + 0.6 * st;
    return Math.min(C.maxFatigue, Math.max(0, o.pc - limit) * C.fatiguePerPitch);
  }

  /** The radio call for a pitch already chosen: its speed, from his velocity, the pitch and how tired he is. */
  #pitchType(p, name, fatigue = 0) {
    const base = 93 + z(p.r.velocity ?? p.r.stuff) * 2.2 - Math.min(3.5, fatigue * 2.5);
    const off = { 'Four-seam': 0, Sinker: -1, Cutter: -4, Slider: -8, Sweeper: -10, Curveball: -12, Changeup: -9, Splitter: -7 }[name] ?? -8;
    const mph = Math.round(base + off + this.rng.normal(0, off === 0 || off === -1 ? 0.8 : 1));
    return { name, mph };
  }

  /** How free the pitcher is to work around the hitter: first base open, a runner or two on, the score. */
  #around() {
    const [b1, b2, b3] = this.bases;
    let a = !b1 ? (b2 || b3 ? 1 : 0.7) : b2 && b3 ? 0.08 : 0.35;
    const diff = Math.abs(this.score.home - this.score.away);
    if (diff >= 5) a *= 0.4;
    else if (this.inning >= 7 && diff <= 2) a *= 1.2;
    return a;
  }

  // ---------- outcomes ----------

  #credit(pitcherId, key, n = 1) { this.line(pitcherId)[key] += n; }

  #paEnd(result, data, imp) {
    this.#emit('paEnd', { result, ...data }, imp);
  }

  #leverage() {
    const diff = Math.abs(this.score.home - this.score.away);
    const late = this.inning >= 7 ? 1.4 : 1;
    return late * (diff <= 1 ? 1.3 : diff <= 3 ? 1 : 0.6);
  }

  /** A run is earned unless the runner reached on an error or scores on the error play itself. */
  #score(runner, rbiTo, unearned = false) {
    const key = this.battingKey;
    this.score[key]++;
    this.line(runner.player.id).R++;
    if (rbiTo) this.line(rbiTo.id).RBI++;
    const resp = runner.resp ?? this.fielding.pitcher.id;
    this.line(resp).pR++;
    // earned unless the runner reached on an error, the run scores on the error play, or errors have given the pitcher outs he never got (an error means the inning should already be over)
    if (!unearned && !runner.unearned && this.outs + this.inningErr < 3) this.line(resp).pER++;
    const s = this.fielding;
    if (s.outing.player.id === resp) s.outing.runs++;
    return runner.player.id;
  }

  #walk(batter, kind) {
    const pid = this.fielding.pitcher.id;
    const L = this.line(batter.id);
    L.PA++; L.BB++;
    this.#credit(pid, 'pBB'); this.#credit(pid, 'BF');
    this.fielding.outing.bf++;
    const scored = this.#forceAdvance(batter, batter);
    this.#paEnd(kind, { batterId: batter.id, pitcherId: pid, scored }, scored.length ? 0.6 * this.#leverage() : 0.25 * this.#leverage());
  }

  #hbp(batter) {
    const pid = this.fielding.pitcher.id;
    const L = this.line(batter.id);
    L.PA++; L.HBP++;
    this.#credit(pid, 'pHBP'); this.#credit(pid, 'BF');
    this.fielding.outing.bf++;
    const scored = this.#forceAdvance(batter, batter);
    this.#paEnd('HBP', { batterId: batter.id, pitcherId: pid, scored }, 0.3 * this.#leverage());
  }

  /** Walk-style advance: batter to first, forced runners move up. */
  #forceAdvance(batter, rbiTo) {
    const b = this.bases, scored = [];
    const resp = this.fielding.pitcher.id;
    if (b[0]) {
      if (b[1]) {
        if (b[2]) scored.push(this.#score(b[2], rbiTo));
        b[2] = b[1];
      }
      b[1] = b[0];
    }
    b[0] = { player: batter, resp };
    return scored;
  }

  #strikeout(batter, how) {
    const pid = this.fielding.pitcher.id;
    const L = this.line(batter.id);
    L.PA++; L.AB++; L.K++;
    this.#credit(pid, 'pK'); this.#credit(pid, 'BF'); this.#credit(pid, 'pOuts');
    this.fielding.outing.bf++; this.fielding.outing.outs++;
    this.outs++;
    this.#paEnd('K', { batterId: batter.id, pitcherId: pid, looking: how === 'called', scored: [] }, (this.bases.some(Boolean) ? 0.45 : 0.25) * this.#leverage());
  }

  #outs(n) {
    this.outs += n;
    this.#credit(this.fielding.pitcher.id, 'pOuts', n);
    this.fielding.outing.outs += n;
  }

  #ballInPlay(batter, bb, m) {
    const fld = this.fielding;
    const pid = fld.pitcher.id;
    const L = this.line(batter.id);
    L.PA++;
    fld.outing.bf++;
    this.#credit(pid, 'BF');
    const b = this.bases;
    const resp = pid;
    const sp = (r) => z(r.player.r.speed);
    const ofArm = z(fld.fielders[{ L: 'LF', C: 'CF', R: 'RF' }[bb.dir]]?.r.arm);
    let scored = [], result, outsOnPlay = 0, rbi = true, imp = 0.2;
    const moves = [];

    if (bb.hit) {
      L.AB++; L.H++;
      this.batting.hits++;
      this.#credit(pid, 'pH');
      if (bb.hit === 'HR') {
        L.HR++; this.#credit(pid, 'pHR');
        for (let i = 2; i >= 0; i--) if (b[i]) scored.push(this.#score(b[i], batter));
        scored.push(this.#score({ player: batter, resp }, batter));
        this.bases = [null, null, null];
        result = 'HR'; imp = 1;
      } else if (bb.hit === '3B') {
        L['3B']++;
        for (let i = 2; i >= 0; i--) if (b[i]) scored.push(this.#score(b[i], batter));
        this.bases = [null, null, { player: batter, resp }];
        result = '3B'; imp = 0.7;
      } else if (bb.hit === '2B') {
        L['2B']++;
        if (b[2]) scored.push(this.#score(b[2], batter));
        if (b[1]) scored.push(this.#score(b[1], batter));
        let third = null;
        if (b[0]) {
          if (this.rng.chance(shift(0.42, 0.5 * sp(b[0]) + (this.outs === 2 ? 0.7 : 0) - 0.3 * ofArm))) scored.push(this.#score(b[0], batter));
          else third = b[0];
        }
        this.bases = [null, { player: batter, resp }, third];
        result = '2B'; imp = 0.6;
      } else {
        // single
        if (b[2]) scored.push(this.#score(b[2], batter));
        let third = null, second = null;
        if (b[1]) {
          if (this.rng.chance(shift(0.64, 0.5 * sp(b[1]) + (this.outs === 2 ? 0.9 : 0) - 0.35 * ofArm))) scored.push(this.#score(b[1], batter));
          else third = b[1];
        }
        if (b[0]) {
          const toThird = !third && bb.type !== 'GB' && this.rng.chance(shift(bb.dir === 'R' ? 0.40 : 0.22, 0.5 * sp(b[0]) - 0.3 * ofArm));
          if (toThird) third = b[0]; else second = b[0];
        }
        this.bases = [{ player: batter, resp }, second, third];
        result = '1B'; imp = 0.45;
      }
      if (scored.length) imp = Math.max(imp, 0.75);
    } else if (bb.error) {
      L.AB++;
      fld.errors++; this.inningErr++;
      if (b[2]) scored.push(this.#score(b[2], null, true));
      this.bases = [{ player: batter, resp, unearned: true }, b[0], b[1]];
      result = 'E'; rbi = false; imp = 0.5;
    } else if (bb.type === 'GB') {
      L.AB++;
      const infieldIn = fld.infield === 'in';
      if (b[0] && this.outs < 2 && this.rng.chance(shift(C.dpOnGB, -0.45 * m.speed + 0.15 * (z(fld.fielders.SS?.r.turn) + z(fld.fielders['2B']?.r.turn)) + (fld.infield === 'dp' ? 0.2 : 0) - (infieldIn ? 0.3 : 0)))) {
        // double play: runner from first and batter out; others move up if the inning goes on
        L.GDP++;
        this.#outs(2); outsOnPlay = 2;
        const r2 = b[1], r3 = b[2];
        this.bases = [null, null, null];
        if (this.outs < 3) {
          if (r3) scored.push(this.#score(r3, null));
          if (r2) this.bases[2] = r2;
        }
        result = 'DP'; rbi = false; imp = 0.55;
      } else if (b[0] && this.outs < 2 && this.rng.chance(0.45)) {
        // fielder's choice: lead runner forced at second, batter safe at first
        this.#outs(1); outsOnPlay = 1;
        const r2 = b[1], r3 = b[2];
        this.bases = [{ player: batter, resp }, null, null];
        if (r2) this.bases[2] = r2;
        if (r3 && this.outs < 3) {
          if (r2 || this.rng.chance(infieldIn ? 0.25 : 0.55)) scored.push(this.#score(r3, batter));
          else this.bases[2] = r3;
        }
        result = 'FC';
      } else {
        this.#outs(1); outsOnPlay = 1;
        if (this.outs < 3) {
          const nb = [null, null, null];
          if (b[2]) {
            const forced = b[0] && b[1];
            if (forced || this.rng.chance(infieldIn ? 0.22 : 0.52)) scored.push(this.#score(b[2], batter));
            else nb[2] = b[2];
          }
          if (b[1]) { if (!nb[2] && (b[0] || this.rng.chance(0.55))) nb[2] = b[1]; else nb[1] = b[1]; }
          if (b[0]) { if (!nb[1]) nb[1] = b[0]; else nb[0] = b[0]; }
          this.bases = nb;
        }
        result = 'GO';
      }
    } else if (bb.type === 'FB' || bb.type === 'LD') {
      this.#outs(1); outsOnPlay = 1;
      result = bb.type === 'FB' ? 'FO' : 'LO';
      if (bb.type === 'FB' && this.outs < 3 && b[2] && this.rng.chance(shift(0.78, 0.4 * sp(b[2]) - 0.3 * ofArm))) {
        scored.push(this.#score(b[2], batter));
        this.bases[2] = null;
        L.SF++;
        result = 'SF';
        if (b[1] && this.rng.chance(0.30)) { this.bases[2] = b[1]; this.bases[1] = null; }
      } else if (bb.type === 'FB' && this.outs < 3 && b[1] && !b[2] && this.rng.chance(0.28)) {
        this.bases[2] = b[1]; this.bases[1] = null;
      } else if (bb.type === 'LD' && this.outs < 3 && b[0] && this.rng.chance(0.05)) {
        this.#outs(1); outsOnPlay = 2; this.bases[0] = null; result = 'LDP';
      }
      if (result !== 'SF') L.AB++;
    } else {
      L.AB++;
      this.#outs(1); outsOnPlay = 1;
      result = 'PO';
    }

    this.#paEnd(result, {
      batterId: batter.id, pitcherId: pid, bip: bb.type, dir: bb.dir, fielder: bb.fielderPos,
      scored, outsOnPlay, moves,
    }, Math.min(1, imp * this.#leverage()));
  }

  #bunt(batter) {
    const fld = this.fielding, pid = fld.pitcher.id;
    const L = this.line(batter.id);
    L.PA++; fld.outing.bf++; this.#credit(pid, 'BF');
    const b = this.bases;
    const ok = this.rng.chance(shift(0.70, 0.3 * z(batter.r.bunt)));
    this.#outs(1);
    if (ok && this.outs < 3) {
      this.bases = [null, b[0], b[1] || b[2] ? (b[1] || b[2]) : null];
      if (b[2] && b[1]) this.bases[2] = b[1]; // runner from third holds unless squeezed
      if (b[2] && !b[1]) this.bases[2] = b[2];
      this.#paEnd('SAC', { batterId: batter.id, pitcherId: pid, scored: [], outsOnPlay: 1 }, 0.35);
    } else {
      L.AB++;
      // lead runner thrown out instead: batter on first
      if (b[0]) { this.bases = [{ player: batter, resp: pid }, null, b[2]]; if (b[1]) this.bases[2] = b[1]; }
      this.#paEnd('BUNT_OUT', { batterId: batter.id, pitcherId: pid, scored: [], outsOnPlay: 1 }, 0.35);
    }
  }

  /** Steal of second. Returns true if it ended the inning. */
  #steal(from) {
    const r = this.bases[from];
    const fld = this.fielding;
    const p = shift(C.stealSuccess, 0.45 * z(r.player.r.speed) + 0.30 * z(r.player.r.steal) - 0.35 * z(fld.fielders.C?.r.cthrow ?? fld.fielders.C?.r.arm) - 0.25 * z(fld.pitcher.r.hold));
    const ok = this.rng.chance(p);
    if (ok) {
      this.bases[from + 1] = r; this.bases[from] = null;
      this.line(r.player.id).SB++;
    } else {
      this.bases[from] = null;
      this.line(r.player.id).CS++;
      this.#outs(1);
    }
    this.#emit('steal', { runnerId: r.player.id, from: from + 1, to: from + 2, success: ok }, 0.5 * this.#leverage());
    return this.outs >= 3;
  }

  #wildPitch(pitcher) {
    const b = this.bases, scored = [];
    if (b[2]) scored.push(this.#score(b[2], null));
    this.bases = [null, b[0], b[1]];
    this.#emit('wildPitch', { pitcherId: pitcher.id, scored }, scored.length ? 0.6 : 0.3);
  }
}

export { POSITIONS };
