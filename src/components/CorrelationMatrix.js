/**
 * CorrelationMatrix — color-coded correlation grid for a set of tickers.
 *
 * Values range -1 to +1. Color scale:
 *   -1.0 → strong red (negative correlation)
 *    0.0 → neutral (muted/dim)
 *   +1.0 → strong green (positive correlation)
 *
 * Uses bg() from ansi.js for true-color background cells.
 *
 * Pure function: (opts) → ANSI string
 */
import { fg, c, pc, RESET, padRight, padCenter, visLen } from '../ansi.js';
import { palette } from '../themes.js';

// Interpolate between two hex colors by t (0..1)
function lerpHex(hexA, hexB, t) {
  const parse = h => {
    const s = h.replace('#', '');
    return [parseInt(s.slice(0,2),16), parseInt(s.slice(2,4),16), parseInt(s.slice(4,6),16)];
  };
  const [ar, ag, ab] = parse(hexA);
  const [br, bg_, bb] = parse(hexB);
  const r = Math.round(ar + (br - ar) * t);
  const g = Math.round(ag + (bg_ - ag) * t);
  const b = Math.round(ab + (bb - ab) * t);
  return [r, g, b];
}

// Produce bg + fg ANSI for a correlation cell value (-1..+1)
function corrColor(value) {
  const v = Math.max(-1, Math.min(1, Number(value)));

  // Color scale:
  //  v < 0: lerp from neutral dark → red
  //  v > 0: lerp from neutral dark → green
  //  v = 0: neutral dark

  // Derive bg colors by darkening theme palette hex values (scale to ~35%)
  const darken = (hex, factor = 0.35) => {
    const s = hex.replace('#', '');
    const r = Math.round(parseInt(s.slice(0, 2), 16) * factor);
    const g = Math.round(parseInt(s.slice(2, 4), 16) * factor);
    const b = Math.round(parseInt(s.slice(4, 6), 16) * factor);
    return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
  };

  const NEG_STRONG = darken(palette('negative')); // dark bg from theme negative
  const POS_STRONG = darken(palette('positive')); // dark bg from theme positive
  const NEUTRAL    = darken(palette('muted'), 0.3); // near-black neutral from theme muted

  const NEG_TEXT = palette('negative');
  const POS_TEXT = palette('positive');
  const NEU_TEXT = palette('muted');

  let bgRgb, textHex;

  if (v < 0) {
    const t = Math.abs(v); // 0..1
    bgRgb = lerpHex(NEUTRAL, NEG_STRONG, t);
    textHex = v <= -0.3 ? NEG_TEXT : NEU_TEXT;
  } else if (v > 0) {
    const t = v; // 0..1
    bgRgb = lerpHex(NEUTRAL, POS_STRONG, t);
    textHex = v >= 0.3 ? POS_TEXT : NEU_TEXT;
  } else {
    bgRgb = lerpHex(NEUTRAL, NEUTRAL, 0);
    textHex = NEU_TEXT;
  }

  const bgCode = `\x1b[48;2;${bgRgb[0]};${bgRgb[1]};${bgRgb[2]}m`;
  const fgCode = fg(textHex);
  return { bgCode, fgCode };
}

// Format a correlation value for display (e.g. "+0.87", "-0.34", " 1.00")
function fmtCorr(v) {
  if (v == null) return ' —   ';
  const n = Number(v);
  if (Math.abs(n - 1.0) < 0.0001) return ' 1.00';
  const s = n >= 0 ? `+${n.toFixed(2)}` : n.toFixed(2);
  return s.padStart(5);
}

/**
 * Render a correlation matrix.
 *
 * @param {Object} opts
 * @param {string[]} opts.tickers     - List of ticker symbols (row and column labels)
 * @param {number[][]} opts.matrix    - N×N correlation values (-1..+1)
 * @param {number}  [opts.width=80]   - Total display width (used for centering/title)
 * @param {string}  [opts.title]      - Optional panel title
 * @returns {string} Multi-line ANSI string
 */
export function correlationMatrix(opts = {}) {
  const {
    tickers = [],
    matrix = [],
    width = 80,
    title = 'CORRELATION MATRIX',
  } = opts;

  if (!tickers || tickers.length === 0) {
    return pc('muted', '(no correlation data)');
  }

  const n = tickers.length;
  const ac = palette('accent');

  // Cell layout: each cell is 6 chars wide (space + 5 value chars)
  const CELL_W = 6;
  // Ticker label column width
  const maxTickerLen = Math.max(...tickers.map(t => t.length), 4);
  const LABEL_W = maxTickerLen + 1;

  const lines = [];

  // Top border with title
  const titleStr = title ? ` ${title} ` : '';
  const rowWidth = LABEL_W + n * CELL_W + 1; // content row width
  const topFill = Math.max(0, rowWidth - 2 - titleStr.length);
  lines.push(c(ac, '╭─') + c(ac, titleStr) + c(ac, '─'.repeat(topFill) + '╮'));

  // Column header row: spaces for label column then ticker labels
  const headerLabel = ' '.repeat(LABEL_W);
  const headerCols = tickers.map(t => padCenter(pc('label', t), CELL_W)).join('');
  const headerContent = headerLabel + headerCols;
  const headerPad = Math.max(0, rowWidth - 2 - visLen(headerContent));
  lines.push(
    c(ac, '│') + ' ' + headerContent + ' '.repeat(headerPad) + c(ac, '│')
  );

  // Divider after header
  lines.push(c(ac, '├' + '─'.repeat(rowWidth - 2) + '┤'));

  // Data rows
  for (let r = 0; r < n; r++) {
    const rowTicker = padRight(pc('label', tickers[r]), LABEL_W);
    let rowCells = '';

    for (let col = 0; col < n; col++) {
      const val = matrix[r] && matrix[r][col] != null ? matrix[r][col] : null;
      const valueStr = fmtCorr(val);

      if (val == null) {
        rowCells += ' ' + pc('muted', valueStr);
      } else {
        const { bgCode, fgCode } = corrColor(val);
        // Background-colored cell: space + colored value + reset
        rowCells += ' ' + bgCode + fgCode + valueStr + RESET;
      }
    }

    const rowContent = rowTicker + rowCells + ' ';
    const rowVl = visLen(rowContent);
    const rowPad = Math.max(0, rowWidth - 2 - rowVl);
    lines.push(c(ac, '│') + ' ' + rowContent + ' '.repeat(rowPad) + c(ac, '│'));
  }

  // Bottom border
  lines.push(c(ac, '╰' + '─'.repeat(rowWidth - 2) + '╯'));

  return lines.join('\n');
}
