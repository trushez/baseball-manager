// The look follows the club you manage: a neutral graphite base with the club's colours tinting the sidebar,
// tabs and buttons, and its second colour as the accent. Dark or very bright kits are pulled into a range
// where text stays readable. Called from the shell whenever a screen is shown.
const rgb = (hex) => { const n = parseInt(hex.replace('#', ''), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const hex = (c) => `#${c.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('')}`;
const mix = (a, b, t) => { const x = rgb(a), y = rgb(b); return hex(x.map((v, i) => v * (1 - t) + y[i] * t)); };
const lum = (h) => { const [r, g, b] = rgb(h).map((v) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };

/** The variables for a club's colours. */
export function themeFor(club) {
  let A = club?.kitA || '#3a4a66', B = club?.kitB || '#e2a24a';
  // a kit colour too bright to tint a dark interface is darkened; one with no colour in it is warmed a little
  while (lum(A) > 0.22) A = mix(A, '#000000', 0.12);
  // a kit colour too dull to show is lifted so the club's colour is felt
  for (let i = 0; i < 8 && lum(A) < 0.035; i++) A = mix(A, '#ffffff', 0.1);
  // the accent has to read on a dark panel: lightened until it does
  let guard = 0;
  while (lum(B) < 0.32 && guard++ < 12) B = mix(B, '#ffffff', 0.12);
  const side = mix('#23262b', A, 0.62);
  return {
    '--page': '#15171a', '--panel': '#1c1f23', '--panel-2': '#252a30', '--line': '#3e444b',
    '--text': '#f1f3f4', '--soft': '#b3b9be',
    '--side': side, '--side-line': mix(side, '#ffffff', 0.14), '--side-hover': mix(side, '#ffffff', 0.08),
    '--title': mix('#2a2d31', A, 0.92), '--title-line': mix(A, '#ffffff', 0.35),
    '--tab': mix('#22262b', A, 0.34), '--tab-hover': mix('#30353b', A, 0.5),
    '--yellow': B, '--dim': mix('#b3b9be', '#15171a', 0.5),
  };
}

let applied = '';
/** Put a club's colours on the page. */
export function applyTheme(club) {
  if (typeof document === 'undefined') return;
  const key = `${club?.kitA}-${club?.kitB}`;
  if (key === applied) return;
  applied = key;
  const root = document.documentElement;
  for (const [k, v] of Object.entries(themeFor(club))) root.style.setProperty(k, v);
}
