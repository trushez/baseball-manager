// A player's honours: the real ones from his career before the game (game/data/honours.json, made by
// tools/fetch-honours.js from the MLB Stats API) and those won in the game (p.hon, from season/awards.js).
// Also each real season's main award winners and champions, for the league history.

/** MLB Stats API award ids, as the game words them. */
export const AWARD_NAME = {
  ALAS: 'All-Star', NLAS: 'All-Star', ALMVP: 'AL MVP', NLMVP: 'NL MVP', ALCY: 'AL Cy Young', NLCY: 'NL Cy Young',
  ALROY: 'AL Rookie of the Year', NLROY: 'NL Rookie of the Year', ALGG: 'AL Gold Glove', NLGG: 'NL Gold Glove',
  ALPG: 'AL Platinum Glove', NLPG: 'NL Platinum Glove', ALSS: 'AL Silver Slugger', NLSS: 'NL Silver Slugger',
  WSMVP: 'World Series MVP', ALCSMVP: 'ALCS MVP', NLCSMVP: 'NLCS MVP', ASMVP: 'All-Star Game MVP',
  ALHAA: 'AL Hank Aaron Award', NLHAA: 'NL Hank Aaron Award', ALREL: 'AL Reliever of the Year', NLREL: 'NL Reliever of the Year',
  ALCPOY: 'AL Comeback Player of the Year', NLCPOY: 'NL Comeback Player of the Year', MLBAFIRST: 'All-MLB First Team', MLBSECOND: 'All-MLB Second Team',
  ALMOY: 'AL Manager of the Year', NLMOY: 'NL Manager of the Year',
};

let REAL = null; // the loaded file, for the league history

/** Lay the real honours over the world's players (each gets p.realHon: [[year, text], ...]). */
export function applyHonours(world, data) {
  REAL = data || null;
  if (!data?.players) return 0;
  const byMlb = new Map(world.list.filter((p) => p.mlb_id).map((p) => [String(p.mlb_id), p]));
  let n = 0;
  for (const [id, rows] of Object.entries(data.players)) {
    const p = byMlb.get(String(id));
    if (!p) continue;
    p.realHon = rows.filter(([, c]) => AWARD_NAME[c]).map(([y, c]) => [y, AWARD_NAME[c]]);
    n += p.realHon.length;
  }
  return n;
}
export const realHonours = () => REAL;

/** Every honour, oldest first, as [year, text]: the real career and then the game's. */
export function honours(p) {
  const game = (p.hon || []).map((t) => { const m = /^(\d{4}) (.*)$/.exec(t); return m ? [Number(m[1]), m[2]] : [0, t]; });
  return [...(p.realHon || []), ...game].sort((a, b) => a[0] - b[0]);
}

// the order honours are named in a summary
const RANK = ['MVP', 'Cy Young', 'World Series MVP', 'Rookie of the Year', 'All-Star', 'Platinum Glove', 'Gold Glove', 'Silver Slugger', 'Reliever of the Year', 'Hank Aaron Award', 'ALCS MVP', 'NLCS MVP', 'All-Star Game MVP', 'Comeback Player of the Year', 'All-MLB First Team', 'All-MLB Second Team'];
/** The kind of honour, without the league or position: "AL Gold Glove (SS)" is a Gold Glove. */
export const honourKind = (text) => text.replace(/ \(.*\)$/, '').replace(/^(AL|NL) /, '');

/** His honours in a few words, biggest first: "9x All-Star, 3x MVP, Rookie of the Year 2017, 4x Silver Slugger". */
export function honourSummary(p, max = 5) {
  const count = new Map();
  for (const [y, t] of honours(p)) {
    const k = honourKind(t);
    if (!count.has(k)) count.set(k, []);
    count.get(k).push(y);
  }
  return [...count].sort((a, b) => (RANK.indexOf(a[0]) + 1 || 99) - (RANK.indexOf(b[0]) + 1 || 99)).slice(0, max)
    .map(([k, ys]) => (ys.length > 1 ? `${ys.length}x ${k}` : `${k} ${ys[0]}`)).join(', ');
}

/** How many of a kind of honour he has ("All-Star", "MVP", "Gold Glove"). */
export const honourCount = (p, kind) => honours(p).filter(([, t]) => honourKind(t) === kind).length;
