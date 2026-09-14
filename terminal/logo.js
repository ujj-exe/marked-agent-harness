/**
 * logo.js — Brand mark for Marked.
 *
 * Candlestick-inspired mark (3 bars — bull/neutral/bear) + bold wordmark.
 * 4 rows, ~45 chars wide. Monospace-native, asymmetric.
 */

const BRAND = '\x1b[38;2;192;255;0m';    // #C0FF00 lime
const LIME_D = '\x1b[38;2;100;180;0m';   // dark lime
const LIME_M = '\x1b[38;2;155;220;0m';   // mid lime
const BOLD   = '\x1b[1m';
const DIM    = '\x1b[2m';
const RESET  = '\x1b[0m';

export const LOGO_B = [
  `${LIME_D}  ▐${RESET} ${LIME_M}▐▌${RESET} ${BRAND}█${RESET}   ${BRAND}${BOLD}MARKED${RESET}`,
  `${LIME_D}  █${RESET} ${LIME_M}██${RESET} ${BRAND}█${RESET}   ${BRAND}${BOLD}INDIA${RESET}`,
  `${LIME_M}  █${RESET} ${BRAND}██${RESET} ${LIME_D}▐${RESET}`,
  `${BRAND}  ▐${RESET} ${LIME_D}▐▌${RESET} ${LIME_M}▐${RESET}   ${DIM}The view that matters.${RESET}`,
];

/**
 * Render the full brand identity block.
 * @returns {string}
 */
export function brandBlock() {
  return LOGO_B.join('\n');
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

/** The wordmark, lime blocks over dimmer bevels. */
export const WORDMARK = WORDMARK_ROWS.map(row =>
  row.replace(/\u2588+|[^\u2588 ]+/g, run =>
    (run[0] === '\u2588' ? BRAND + BOLD : LIME_D) + run + RESET));
