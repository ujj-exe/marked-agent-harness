/**
 * HolderBar — stacked horizontal bars for institutional ownership breakdown.
 *
 * Renders top-N holders as colored proportional bars with name and % labels.
 *
 * Pure function: (opts) → string (ANSI-colored, multi-line)
 */
import { c, pc, BOLD, RESET, padRight, padLeft, visLen, strip } from '../ansi.js';
import { palette } from '../themes.js';
import { fmtVol, fmtPct } from '../formatters.js';

const BLOCK_FULL  = '█';
const BLOCK_LIGHT = '░';

// Cycle through these palette roles for each holder bar
const BAR_ROLES = ['accent', 'positive', 'warning', 'highlight', 'chartHigh'];

/**
 * Render institutional holder bars.
 *
 * @param {Object} opts
 * @param {Array<{name, shares, percent}>} opts.holders - Holder records
 * @param {number} [opts.width=80] - Total output width
 * @param {number} [opts.limit=5] - Max holders to display
 * @returns {string} Multi-line ANSI string
 */
export function holderBar(opts = {}) {
  const {
    holders = [],
    width = 80,
    limit = 5,
  } = opts;

  if (!holders.length) {
    return pc('muted', 'No holder data');
  }

  const visible = holders.slice(0, limit);
  const lines   = [];

  // Fixed column widths
  const pctW    = 7;  // "100.0%" right-aligned
  const sharesW = 9;  // shares compact right-aligned
  const barW    = Math.max(4, width - pctW - sharesW - 4); // remaining for name+bar
  const nameW   = Math.min(20, Math.floor(barW * 0.35));
  const fillW   = barW - nameW - 1; // 1 for space

  // Header
  const hName   = padRight(pc('label', 'HOLDER'), nameW);
  const hBar    = padRight(pc('label', ''), fillW);
  const hPct    = padLeft(pc('label', '%OWN'), pctW);
  const hShares = padLeft(pc('label', 'SHARES'), sharesW);
  lines.push(`${hName} ${hBar} ${hPct} ${hShares}`);
  lines.push(pc('muted', '─'.repeat(Math.min(width, nameW + fillW + pctW + sharesW + 3))));

  // Find max percent for scaling bars
  const maxPct = Math.max(...visible.map(h => Number(h.percent) || 0), 1);

  for (let i = 0; i < visible.length; i++) {
    const h     = visible[i];
    const pct   = Number(h.percent) || 0;
    const role  = BAR_ROLES[i % BAR_ROLES.length];
    const color = palette(role);

    const filled = Math.max(1, Math.round((pct / maxPct) * fillW));
    const empty  = fillW - filled;

    const name   = padRight(pc('data', String(h.name || '—')), nameW);
    const bar    = c(color, BLOCK_FULL.repeat(filled)) + pc('muted', BLOCK_LIGHT.repeat(empty));
    const pctStr = padLeft(c(color, fmtPct(pct, false)), pctW);
    const shares = padLeft(pc('muted', fmtVol(h.shares)), sharesW);

    lines.push(`${name} ${bar} ${pctStr} ${shares}`);
  }

  return lines.join('\n');
}
