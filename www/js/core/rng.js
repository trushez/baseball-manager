// Seeded random number generator (sfc32).
// Same seed gives the same sequence on every machine, so any match can be replayed exactly.
// State is four 32-bit integers and can be saved and restored mid-game.

/**
 * Turn any string into four 32-bit seed words (cyrb128 hash).
 * @param {string} str
 * @returns {[number, number, number, number]}
 */
export function hashSeed(str) {
  let h1 = 1779033703, h2 = 3144134277, h3 = 1013904242, h4 = 2773480762;
  for (let i = 0; i < str.length; i++) {
    const k = str.charCodeAt(i);
    h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
    h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
    h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
    h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
  }
  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
  h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
  h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
  h1 ^= h2 ^ h3 ^ h4; h2 ^= h1; h3 ^= h1; h4 ^= h1;
  return [h1 >>> 0, h2 >>> 0, h3 >>> 0, h4 >>> 0];
}

export class Rng {
  /** @param {string | number} seed */
  constructor(seed) {
    const [a, b, c, d] = hashSeed(String(seed));
    this.a = a; this.b = b; this.c = c; this.d = d;
    for (let i = 0; i < 15; i++) this.nextU32(); // warm up
  }

  /** @returns {number} unsigned 32-bit integer */
  nextU32() {
    let { a, b, c, d } = this;
    const t = (((a + b) | 0) + d) | 0;
    d = (d + 1) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    c = (c + t) | 0;
    this.a = a; this.b = b; this.c = c; this.d = d;
    return t >>> 0;
  }

  /** @returns {number} float in [0, 1) */
  next() { return this.nextU32() / 4294967296; }

  /** @param {number} min @param {number} max inclusive @returns {number} */
  int(min, max) { return min + Math.floor(this.next() * (max - min + 1)); }

  /** @param {number} p probability 0..1 @returns {boolean} */
  chance(p) { return this.next() < p; }

  /** Normal distribution (Box-Muller). @param {number} mean @param {number} sd */
  normal(mean = 0, sd = 1) {
    let u = 0;
    while (u === 0) u = this.next();
    const v = this.next();
    return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  /**
   * Pick a key from a table of weights, e.g. { ball: 0.38, strike: 0.2, foul: 0.18, inPlay: 0.24 }.
   * Keys are visited in sorted order so results never depend on object insertion order.
   * @template {string} K
   * @param {Record<K, number>} weights
   * @returns {K}
   */
  weighted(weights) {
    const keys = /** @type {K[]} */ (Object.keys(weights).sort());
    let total = 0;
    for (const k of keys) total += weights[k];
    let r = this.next() * total;
    for (const k of keys) {
      r -= weights[k];
      if (r < 0) return k;
    }
    return keys[keys.length - 1];
  }

  /** @template T @param {T[]} arr @returns {T} */
  pick(arr) { return arr[Math.floor(this.next() * arr.length)]; }

  /** @returns {{a:number,b:number,c:number,d:number}} */
  getState() { return { a: this.a, b: this.b, c: this.c, d: this.d }; }

  /** @param {{a:number,b:number,c:number,d:number}} s */
  setState(s) { this.a = s.a | 0; this.b = s.b | 0; this.c = s.c | 0; this.d = s.d | 0; }
}
