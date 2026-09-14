/**
 * InsiderTimeline — horizontal timeline with buy/sell markers for insider trading.
 *
 * Renders a chronological list of insider transactions with colored markers,
 * directional indicators, and formatted share/dollar amounts.
 *
 * Pure function: (opts) → string (ANSI-colored, multi-line)
 */
import { c, pc, BOLD, RESET, padRight, padLeft, visLen } from '../ansi.js';
import { palette } from '../themes.js';
import { fmtDate, fmtCap, fmtVol } from '../formatters.js';

const BUY_MARKER  = '▲';
const SELL_MARKER = '▼';
const LINE_CHAR   = '─';
const DOT_CHAR    = '●';

/**
 * Format a dollar amount compactly.
 */
function fmtAmount(v) {
  if (v == null) return '—';
  v = Number(v);
  if (v >= 1e9) return `$${(v / 1e9).toFixed(1)}B`;
  if (v >= 1e6) return `$${(v / 1e6).toFixed(1)}M`;
  if (v >= 1e3) return `$${(v / 1e3).toFixed(0)}K`;
  return `$${v.toFixed(0)}`;
}

/**
 * Render an insider trading timeline.
 *
 * @param {Object} opts
 * @param {Array<{date, name, type, shares, amount}>} opts.transactions - Insider transactions
 * @param {number} [opts.width=80] - Total output width
 * @returns {string} Multi-line ANSI string
 */
export function insiderTimeline(opts = {}) {
  const {
    transactions = [],
    width = 80,
  } = opts;

  if (!transactions.length) {
    return pc('muted', 'No insider transactions');
  }

  const lines = [];

  // Column widths — type column is "▼ SELL" = 7 visible chars
  const dateW   = 9;
  const typeW   = 8;
  const sharesW = 10;
  const amtW    = 10;
  const nameW   = Math.max(10, width - dateW - typeW - sharesW - amtW);

  const hDate   = padRight(pc('label', 'DATE'),    dateW);
  const hType   = padRight(pc('label', 'TYPE'),    typeW);
  const hName   = padRight(pc('label', 'INSIDER'), nameW);
  const hShares = padLeft(pc('label', 'SHARES'),   sharesW);
  const hAmt    = padLeft(pc('label', 'AMOUNT'),   amtW);
  lines.push(`${hDate}${hType}${hName}${hShares}${hAmt}`);

  // Divider
  lines.push(pc('muted', LINE_CHAR.repeat(Math.min(width, dateW + typeW + nameW + sharesW + amtW))));

  // Transaction rows
  for (const tx of transactions) {
    const txType = String(tx.type).toLowerCase();
    const isBuy = txType === 'buy';
    const isNeutral = ['grant', 'transfer', 'exercise', 'award', 'gift'].includes(txType);

    const marker   = isBuy ? BUY_MARKER : isNeutral ? '◆' : SELL_MARKER;
    const typeRole = isBuy ? 'positive' : isNeutral ? 'muted' : 'negative';
    const typeStr  = isBuy ? 'BUY' : isNeutral ? txType.toUpperCase().slice(0, 5) : 'SELL';

    const date   = padRight(pc('muted', fmtDate(tx.date)), dateW);
    const type   = padRight(c(palette(typeRole), `${marker} ${typeStr}`), typeW);
    const name   = padRight(pc('data', String(tx.name || '—')), nameW);
    const shares = padLeft(pc('data', fmtVol(tx.shares)), sharesW);
    const amount = padLeft(c(palette(typeRole), fmtAmount(tx.amount ?? tx.value)), amtW);

    lines.push(`${date}${type}${name}${shares}${amount}`);
  }

  return lines.join('\n');
}
