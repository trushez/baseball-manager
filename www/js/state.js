// The running game: the loaded world, who you are, which club you manage, the date, and every
// organisation's roster decisions (created by the assistant the first time a club is looked at).
// blankGame() is the one list of what a new career starts with; save.js saves every field on the game
// object except the few named in TRANSIENT, so a new field is saved without touching the save code.

/** Fresh luck for this sitting: mixed into every game's dice, so loading a save and replaying gives new results. */
export const newLuck = () => Math.random().toString(36).slice(2, 10);

/** Fields that belong to this sitting only and are never saved. */
export const TRANSIENT = new Set(['luck', 'world', 'defaultData', 'saveName', 'compareWith', 'startBg', 'startRoute', 'lastAuto', 'broken', 'savedMark']);

/** Everything a career starts with. Fields not listed start undefined and are created where first used. */
export function blankGame() {
  return {
    luck: newLuck(), // not saved; made new on every load
    world: null,
    manager: '',
    orgId: null,
    date: new Date(2026, 10, 2), // 2 November 2026: the off-season begins with the real end-of-season rosters
    year: 2027,           // the season being played, or about to be (the winter before it)
    orgStates: new Map(),
    shortlist: new Set(),
    compareWith: null,
    phase: 'offseason',   // offseason, spring, regular, post, over
    season: null,         // schedule, results and records (season/sim.js)
    inbox: [],            // messages, newest last (season/inbox.js)
    freeAgents: [],       // ids of players without a club
    finance: {},          // owners, budgets and goals by organisation (season/finance.js)
    settings: defaultSettings(),
    saveName: null,
    awards: {}, h2h: {}, history: {}, managers: {}, mgrOf: {}, staff: {},
    cbt: {}, agentRel: {}, promises: [], arbSettled: {}, negotiations: {}, winter: null, market: null,
    advised: new Set(), deadlineSeen: {}, dl: null, facilities: {}, gms: {}, planReview: null, rumours: null,
  };
}

export const game = blankGame();

/** Start again from a blank career, keeping the fields given (usually the loaded world). */
export function resetGame(keep = {}) {
  for (const k of Object.keys(game)) delete game[k];
  Object.assign(game, blankGame(), keep);
  return game;
}

/** Game Options. explainMoves: explain each roster move before it is made; autoPlay: the assistant runs your club. */
export function defaultSettings() {
  return { stops: { myGames: true, injuries: true, important: true, postseason: true, replies: true, winterDays: true }, pace: 'normal', autosave: 'stop', explainMoves: true, followUps: true, autoPlay: false, unsackable: false, fog: true, manualBullpen: false,
    news: { previews: true, recaps: true, weekly: true, farm: true, scores: true, stories: true, form: true } };
}

/** The seasons from this one on, for contract columns. */
export const yearsAhead = (n = 4) => Array.from({ length: n }, (_, i) => game.year + i);

export const org = (id = game.orgId) => game.world.orgs.get(id);

// The assistant that sets up a club's roster lives in club/depth.js, which needs this module; it hands its function
// over when it loads (registerAutoOrg) rather than this module importing it, so the two do not import each other.
let autoOrg = null;
export const registerAutoOrg = (fn) => { autoOrg = fn; };

/** Roster decisions for an organisation. */
export function orgState(id = game.orgId) {
  if (!game.orgStates.has(id)) {
    if (!autoOrg) throw new Error('club/depth.js must be loaded before a club roster is set up');
    game.orgStates.set(id, autoOrg(org(id)));
  }
  return game.orgStates.get(id);
}

export const userClub = () => org().club;
export const isUserOrg = (id) => id === game.orgId;

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export const dayName = (d = game.date) => DAYS[d.getDay()];
export const shortDate = (d = game.date) => `${d.getDate()}.${d.getMonth() + 1}.${String(d.getFullYear()).slice(2)}`;
export const longDate = (d = game.date) => `${dayName(d)} ${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;

/** The assistant plays your club: you asked for it in Game Options, or you are out of work. */
export const holiday = { on: false }; // on holiday: the assistant runs everything until you come back (never saved)
export const autoClub = () => !!game.settings?.autoPlay || !!game.jobs?.jobless || holiday.on;
