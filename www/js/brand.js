// The game's own names, used with the fictional players it ships with: no league, championship or award a
// real-world body owns a name for appears on screen. Real-player data packs keep the real names.
// The code and the data still say MLB, American League and so on; only what is shown changes, so a save is
// the same whichever names are on screen. To change a name, change it here.
import { game } from './state.js';

export const NAMES = {
  body: 'United Baseball League', short: 'UBL',
  leagues: { 'American League': 'Liberty League', 'National League': 'Union League' },
  abbr: { AL: 'LL', NL: 'UL' },
  final: 'Title Series',
};

const SWAPS = [
  [/\bMajor League Baseball\b/g, NAMES.body],
  [/\bMLB\b/g, NAMES.short],
  [/\bAmerican League\b/g, NAMES.leagues['American League']],
  [/\bNational League\b/g, NAMES.leagues['National League']],
  [/\bAL(CS|DS|WC)?\b/g, (m, x = '') => `${NAMES.abbr.AL}${x}`],
  [/\bNL(CS|DS|WC)?\b/g, (m, x = '') => `${NAMES.abbr.NL}${x}`],
  [/\bWorld Series\b/g, NAMES.final],
  [/\bCy Young Award\b/g, 'Pitcher of the Year award'],
  [/\bCy Youngs\b/g, 'Pitcher of the Year awards'],
  [/\bCy Young\b/g, 'Pitcher of the Year'],
  [/\bGold Glove(s?)\b/g, (m, s) => `Fielding Award${s}`],
  [/\bSilver Slugger(s?)\b/g, (m, s) => `Slugger Award${s}`],
  [/\bHank Aaron Award\b/g, 'Hitter of the Year award'],
];
const ANY = /\b(Major League Baseball|MLB|American League|National League|AL|NL|ALCS|NLCS|ALDS|NLDS|ALWC|NLWC|World Series|Cy Youngs?|Gold Gloves?|Silver Sluggers?|Hank Aaron)\b/;

/** Is the game showing its own names? Only with a pack that says it is fictional. */
export const ownNames = () => !!game.world?.dataInfo?.fictional;

/** A piece of text with the game's own names in it (unchanged with real players). */
export function brand(s) {
  if (typeof s !== 'string' || !ownNames() || !ANY.test(s)) return s;
  for (const [re, to] of SWAPS) s = s.replace(re, to);
  return s;
}

function fixText(node) {
  const v = node.nodeValue;
  if (v && ANY.test(v)) { const b = brand(v); if (b !== v) node.nodeValue = b; }
}
function fixTree(root) {
  if (root.nodeType === 3) { fixText(root); return; }
  if (root.nodeType !== 1 || root.closest?.('input, textarea')) return;
  const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let n = w.nextNode(); n; n = w.nextNode()) fixText(n);
  for (const el of root.querySelectorAll?.('[title], [aria-label]') || []) for (const a of ['title', 'aria-label']) { const v = el.getAttribute(a); if (v && ANY.test(v)) el.setAttribute(a, brand(v)); }
}

/** Watch everything drawn on screen and put the game's own names in, whatever code wrote the text. */
export function installBranding() {
  if (typeof MutationObserver === 'undefined') return;
  new MutationObserver((list) => {
    if (!ownNames()) return;
    for (const m of list) {
      if (m.type === 'characterData') fixText(m.target);
      else for (const n of m.addedNodes) fixTree(n);
    }
  }).observe(document.body, { childList: true, subtree: true, characterData: true });
}
