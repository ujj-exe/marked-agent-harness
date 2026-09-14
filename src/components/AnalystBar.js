/**
 * AnalystBar — stacked bar showing buy/hold/sell distribution + price targets.
 *
 * Renders:
 *   Buy/Hold/Sell  ████████████████░░░░░░  55 Buy  2 Hold  0 Sell
 *   Price Target   $140.00 ──────────●────── $180.00  (med $165.00)
 *
 * Pure function: (opts) → string (ANSI-colored, multi-line)
 */
import { c, pc, BOLD, RESET, padRight, padLeft, padCenter, visLen, strip } from '../ansi.js';
import { palette } from '../themes.js';
import { fmtPrice } from '../formatters.js';

const BLOCK_FILL = '█';
const BLOCK_EMPTY = '░';
const TARGET_LINE = '─';
const TARGET_DOT = '●';

/**
 * Render the analyst rating bar + price target range.
 *
 * @param {Object} opts
 * @param {Object} opts.ratings - { buy: number, hold: number, sell: number }
 * @param {Object} [opts.priceTarget] - { current: number, low: number, median: number, high: number }
 * @param {number} [opts.width=60] - Total display width
 * @returns {string} Multi-line ANSI string
 */
export function analystBar(opts = {}) {
  const {
    ratings = {},
    priceTarget,
    width = 60,
  } = opts;

  const buy  = Number(ratings.buy  ?? 0);
  const hold = Number(ratings.hold ?? 0);
  const sell = Number(ratings.sell ?? 0);
  const total = buy + hold + sell;

  const lines = [];

  // ── Rating bar ────────────────────────────────────────────────────

  const barWidth = Math.max(10, Math.floor(width * 0.45));

  let bar = '';
  if (total === 0) {
    // All empty
    bar = pc('muted', BLOCK_EMPTY.repeat(barWidth));
  } else {
    const buyFill  = Math.round((buy  / total) * barWidth);
    const holdFill = Math.round((hold / total) * barWidth);
    const sellFill = Math.max(0, barWidth - buyFill - holdFill);

    bar += c(palette('positive'), BLOCK_FILL.repeat(buyFill));
    bar += c(palette('warning'),  BLOCK_FILL.repeat(holdFill));
    bar += c(palette('negative'), BLOCK_FILL.repeat(sellFill));
  }

  // Counts
  const buyLabel  = pc('positive', `${buy} Buy`);
  const holdLabel = pc('warning',  `${hold} Hold`);
  const sellLabel = pc('negative', `${sell} Sell`);

  lines.push(`${bar}  ${buyLabel}  ${holdLabel}  ${sellLabel}`);

  // ── Price target range ────────────────────────────────────────────

  if (priceTarget) {
    const { current, low, median, high } = priceTarget;
    lines.push('');

    const lineWidth = Math.max(10, Math.floor(width * 0.45));

    const currentN = Number(current ?? 0);
    const lowN     = Number(low    ?? 0);
    const medianN  = Number(median ?? 0);
    const highN    = Number(high   ?? 0);

    // Build the range line: LOW ──────●────── HIGH  (med MEDIAN)
    // Position the dot for current price along the low→high range
    let dotPos = 0;
    const range = highN - lowN;
    if (range > 0) {
      dotPos = Math.round(((currentN - lowN) / range) * lineWidth);
      dotPos = Math.max(0, Math.min(lineWidth - 1, dotPos));
    }

    let rangeLine = '';
    for (let i = 0; i < lineWidth; i++) {
      if (i === dotPos) {
        rangeLine += c(palette('highlight'), TARGET_DOT);
      } else {
        rangeLine += pc('muted', TARGET_LINE);
      }
    }

    const lowStr    = pc('muted', fmtPrice(lowN));
    const highStr   = pc('muted', fmtPrice(highN));
    const medStr    = pc('data', `med ${fmtPrice(medianN)}`);
    const curStr    = pc('highlight', fmtPrice(currentN));

    const ptFull = `${pc('label', 'PT')}  ${lowStr} ${rangeLine} ${highStr}  ${medStr}  cur ${curStr}`;
    if (visLen(ptFull) <= width) {
      lines.push(ptFull);
    } else {
      // Narrow: range on first line, med/cur on second
      lines.push(`${pc('label', 'PT')}  ${lowStr} ${rangeLine} ${highStr}`);
      lines.push(`    ${medStr}  cur ${curStr}`);
    }
  }

  return lines.join('\n');
}
