/**
 * logo.js — Brand mark for Marked.
 *
 * Candlestick-inspired mark (3 bars — bull/neutral/bear) + bold wordmark.
 * 4 rows, ~45 chars wide. Monospace-native, asymmetric.
 */

import { fg, palette, shade } from '../src/index.js';

const BOLD   = '\x1b[1m';
const DIM    = '\x1b[2m';
const RESET  = '\x1b[0m';

// The three brand shades are derived from the active accent rather than
// frozen at import, so `logoBlock()` and `wordmark()` follow a theme change.
function ramp() {
  const accent = palette('accent') || '#ffffff';
  return { BRAND: fg(accent), LIME_M: fg(shade(accent, 0.78)), LIME_D: fg(shade(accent, 0.5)) };
}

export function logoBlock() {
  const { BRAND, LIME_M, LIME_D } = ramp();
  return [
    `${LIME_D}  ▐${RESET} ${LIME_M}▐▌${RESET} ${BRAND}█${RESET}   ${BRAND}${BOLD}MARKED${RESET}`,
    `${LIME_D}  █${RESET} ${LIME_M}██${RESET} ${BRAND}█${RESET}   ${BRAND}${BOLD}INDIA${RESET}`,
    `${LIME_M}  █${RESET} ${BRAND}██${RESET} ${LIME_D}▐${RESET}`,
    `${BRAND}  ▐${RESET} ${LIME_D}▐▌${RESET} ${LIME_M}▐${RESET}   ${DIM}The view that matters.${RESET}`,
  ];
}

/**
 * Render the full brand identity block.
 * @returns {string}
 */
export function brandBlock() {
  return logoBlock().join('\n');
}

// ── Wordmark ────────────────────────────────────────────────────────────────
// Block-letter MARKED, 6 rows × 51 columns. Solid blocks carry the brand lime;
// the bevel glyphs that give the letters their depth are dropped a shade, which
// is what reads as the drop shadow on a dark terminal.

const WORDMARK_ROWS = [
  '\u2588\u2588\u2588\u2557   \u2588\u2588\u2588\u2557 \u2588\u2588\u2588\u2588\u2588\u2557 \u2588\u2588\u2588\u2588\u2588\u2588\u2557 \u2588\u2588\u2557  \u2588\u2588\u2557\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2557\u2588\u2588\u2588\u2588\u2588\u2588\u2557 ',
  '\u2588\u2588\u2588\u2588\u2557 \u2588\u2588\u2588\u2588\u2551\u2588\u2588\u2554\u2550\u2550\u2588\u2588\u2557\u2588\u2588\u2554\u2550\u2550\u2588\u2588\u2557\u2588\u2588\u2551 \u2588\u2588\u2554\u255d\u2588\u2588\u2554\u2550\u2550\u2550\u2550\u255d\u2588\u2588\u2554\u2550\u2550\u2588\u2588\u2557',
  '\u2588\u2588\u2554\u2588\u2588\u2588\u2588\u2554\u2588\u2588\u2551\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2551\u2588\u2588\u2588\u2588\u2588\u2588\u2554\u255d\u2588\u2588\u2588\u2588\u2588\u2554\u255d \u2588\u2588\u2588\u2588\u2588\u2557  \u2588\u2588\u2551  \u2588\u2588\u2551',
  '\u2588\u2588\u2551\u255a\u2588\u2588\u2554\u255d\u2588\u2588\u2551\u2588\u2588\u2554\u2550\u2550\u2588\u2588\u2551\u2588\u2588\u2554\u2550\u2550\u2588\u2588\u2557\u2588\u2588\u2554\u2550\u2588\u2588\u2557 \u2588\u2588\u2554\u2550\u2550\u255d  \u2588\u2588\u2551  \u2588\u2588\u2551',
  '\u2588\u2588\u2551 \u255a\u2550\u255d \u2588\u2588\u2551\u2588\u2588\u2551  \u2588\u2588\u2551\u2588\u2588\u2551  \u2588\u2588\u2551\u2588\u2588\u2551  \u2588\u2588\u2557\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2557\u2588\u2588\u2588\u2588\u2588\u2588\u2554\u255d',
  '\u255a\u2550\u255d     \u255a\u2550\u255d\u255a\u2550\u255d  \u255a\u2550\u255d\u255a\u2550\u255d  \u255a\u2550\u255d\u255a\u2550\u255d  \u255a\u2550\u255d\u255a\u2550\u2550\u2550\u2550\u2550\u2550\u255d\u255a\u2550\u2550\u2550\u2550\u2550\u255d ',
];

export const WORDMARK_WIDTH = WORDMARK_ROWS[0].length;

/** The wordmark: accent blocks over dimmer bevels, in the active theme. */
export function wordmark() {
  const { BRAND, LIME_D } = ramp();
  return WORDMARK_ROWS.map(row =>
    row.replace(/\u2588+|[^\u2588 ]+/g, run =>
      (run[0] === '\u2588' ? BRAND + BOLD : LIME_D) + run + RESET));
}
