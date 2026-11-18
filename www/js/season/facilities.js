// Every club has a stadium, a major league training complex and a minor league complex, each rated 1 to 20. The training
// complexes nudge how quickly players develop (a little: a club at 18 grows players about 10% faster than one at 10). The
// stadium adds to what the owner has to spend. You can ask the board to improve one; owners rarely agree unless the
// club is doing very well, and an improvement is built over the winter and paid for out of the payroll budget.
import { game } from '../state.js';
import { Rng } from '../core/rng.js';
import { owner } from './finance.js';
import { confidence } from './reactions.js';

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

export const KINDS = {
  stadium: { label: 'Stadium', effect: 'A better ground brings in more money, so the owner has a little more to spend on the payroll.' },
  training: { label: 'Major league training complex', effect: 'Players at the major league club develop a little faster, and recover a little sooner.' },
  minors: { label: 'Minor league complex', effect: 'Every player below the majors develops a little faster. It matters most for prospects.' },
};

const rank = (orgId) => game.world.mlb.slice().sort((a, b) => (b.payroll2026 || 0) - (a.payroll2026 || 0)).findIndex((c) => c.org === orgId);

/** A club's facilities, made the first time they are asked for from its size. */
export function facilities(orgId = game.orgId) {
  game.facilities ||= {};
  if (!game.facilities[orgId]) {
    const rng = new Rng(`fac-${orgId}`);
    const base = 6 + (1 - Math.max(0, rank(orgId)) / 29) * 8;
    const mk = () => clamp(Math.round(base + rng.normal(0, 2.2)), 3, 18);
    game.facilities[orgId] = { stadium: mk(), training: mk(), minors: mk(), pending: {}, lastAsk: null };
  }
  return game.facilities[orgId];
}

export const levelWords = (l) => (l <= 4 ? 'poor' : l <= 8 ? 'below average' : l <= 12 ? 'average' : l <= 16 ? 'good' : l <= 19 ? 'excellent' : 'among the best in the game');
/** Growth multiplier for development: 1 at level 10, about 1.1 at 18. */
export const growthMult = (orgId, majors) => 1 + 0.012 * (facilities(orgId)[majors ? 'training' : 'minors'] - 10);
/** The stadium's effect on the budget, as a factor. */
export const stadiumFactor = (orgId) => 1 + 0.006 * (facilities(orgId).stadium - 10);

/** Cost of one step up, a year for three years, out of the payroll budget. */
export const stepCost = (level) => Math.round((1 + level * 0.15) * 1e6 / 5e5) * 5e5;

/**
 * Ask the board for an improvement. Returns { granted, text }. The odds are low unless the owner is happy and the team wins.
 */
export function requestImprovement(kind, orgId = game.orgId) {
  const f = facilities(orgId), own = owner(orgId);
  const now = game.date.getTime();
  if (f.pending[kind]) return { granted: false, text: 'An improvement is already planned for the winter.' };
  if (f[kind] >= 20) return { granted: false, text: 'It cannot get any better.' };
  const recent = f.lastAsk && now - f.lastAsk < 120 * 864e5;
  const rng = new Rng(`facreq-${orgId}-${kind}-${now}-${f.asks || 0}`);
  const rec = game.history?.[game.year - 1]?.clubs?.[orgId] ?? (game.season?.records?.get(orgId) ? { w: game.season.records.get(orgId).w, l: game.season.records.get(orgId).l } : null);
  const pct = rec ? rec.w / Math.max(1, rec.w + rec.l) : 0.5;
  const base = { spender: 0.2, balanced: 0.1, cheap: 0.03 }[own.style];
  const p = clamp(base + (confidence(orgId) - 60) / 100 * 0.25 + Math.max(0, pct - 0.55) * 1.6 - Math.max(0, f[kind] - 12) * 0.02 - (recent ? 0.1 : 0), 0.01, 0.6);
  f.asks = (f.asks || 0) + 1; f.lastAsk = now;
  if (rng.next() < p) {
    f.pending[kind] = game.year + 1;
    return { granted: true, text: `The board agrees to improve the ${KINDS[kind].label.toLowerCase()}. It will be built over the winter and will cost the payroll budget ${(stepCost(f[kind]) / 1e6).toFixed(1)}M a year for three years.` };
  }
  if (recent) own.conf = Math.max(0, (own.conf ?? 60) - 2);
  return { granted: false, text: `The board turns down the request.${recent ? ' They do not like being asked again so soon.' : ''}${pct < 0.5 ? ' "Win some games first," the chairman says.' : ' "Not now," says the owner. "Ask me when the money is easier."'}` };
}

/** Built over the winter: approved improvements go up for you, and other clubs now and then improve or let theirs run down. */
export function buildWinter() {
  const rng = new Rng(`facwinter-${game.year}`);
  for (const c of game.world.mlb) {
    const f = facilities(c.org);
    for (const [kind, yr] of Object.entries(f.pending)) {
      if (yr <= game.year) {
        const cost = stepCost(f[kind]);
        f[kind] = Math.min(20, f[kind] + 1);
        const x = ((owner(c.org).extra ||= {}).payroll ||= {});
        for (let y = game.year; y < game.year + 3; y++) x[y] = (x[y] || 0) - cost;
        delete f.pending[kind];
      }
    }
    if (c.org === game.orgId) continue;
    const r = rank(c.org);
    for (const kind of Object.keys(KINDS)) {
      if (rng.chance(r < 10 ? 0.1 : 0.04)) f[kind] = Math.min(20, f[kind] + 1);
      else if (rng.chance(r > 20 ? 0.08 : 0.02)) f[kind] = Math.max(1, f[kind] - 1);
    }
  }
}
