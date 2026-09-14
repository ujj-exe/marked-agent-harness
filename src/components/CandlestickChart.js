/**
 * CandlestickChart — OHLCV candlestick chart using box drawing + half-block characters.
 *
 * Each candle occupies a fixed column width:
 *   - Wicks rendered with │ / thin vertical bar
 *   - Body rendered with █ (filled, bearish) or ░ (hollow, bullish)
 *   - Half-blocks (▀ ▄) used at wick/body transition boundaries for sub-row precision
 *
 * Pure function: (opts) → string (ANSI-colored, multi-line)
 */
import { c, pc, strip, padLeft } from '../ansi.js';
import { palette } from '../themes.js';
import { fmtPrice } from '../formatters.js';

// Characters used for candle rendering
const WICK_CHAR     = '│';  // thin vertical wick
const BODY_BULL     = '░';  // bullish hollow body (close > open, positive)
const BODY_BEAR     = '█';  // bearish filled body (close < open, negative)
const SPACE         = ' ';

/**
 * Render a candlestick chart.
 *
 * @param {Object} opts
 * @param {Array<{open,high,low,close,volume}>} opts.bars - OHLCV candle data (left→right, chronological)
 * @param {number} [opts.width=60]      - Total chart width in terminal columns
 * @param {number} [opts.height=10]     - Chart height in terminal rows
 * @param {boolean} [opts.showAxis=true] - Show Y-axis price labels
 * @param {string} [opts.label]          - Chart label shown below chart
 * @returns {string} Multi-line ANSI string
 */
export function candlestickChart(opts = {}) {
  const {
    bars = [],
    width = 60,
    height = 10,
    showAxis = true,
    label,
  } = opts;

  if (!bars.length) {
    return pc('muted', '(no data)');
  }
  if (bars.length === 1) {
    const b = bars[0];
    return pc('data', `O:${fmtPrice(b.open)} H:${fmtPrice(b.high)} L:${fmtPrice(b.low)} C:${fmtPrice(b.close)}`);
  }

  const axisWidth = showAxis ? 9 : 0;  // "$1,234.56" = 9 chars including trailing space
  const chartCols = width - axisWidth;
  if (chartCols < 3) return pc('muted', '(too narrow)');

  // Determine price range across all bars
  const allHighs = bars.map(b => Number(b.high));
  const allLows  = bars.map(b => Number(b.low));
  const priceMax = Math.max(...allHighs);
  const priceMin = Math.min(...allLows);
  const priceRange = priceMax - priceMin || 1;

  // Dynamic candle width: fill the chart space, min 2 cols per candle (body + gap)
  const minCandleW = 2;
  const maxCandles = Math.floor(chartCols / minCandleW);
  const visibleBars = bars.length > maxCandles ? bars.slice(bars.length - maxCandles) : bars;
  const numCandles = visibleBars.length;
  const candleColW = Math.max(minCandleW, Math.floor(chartCols / numCandles));

  // Map price → row (0 = top = priceMax, height-1 = bottom = priceMin)
  function priceToRow(price) {
    return Math.round((1 - (price - priceMin) / priceRange) * (height - 1));
  }

  // Build a 2D character grid: [row][col] = { char, color }
  // cols = numCandles * candleColW
  const gridCols = numCandles * candleColW;
  // grid[row][col] = { ch: string, color: string|null }
  const grid = Array.from({ length: height }, () =>
    Array.from({ length: gridCols }, () => ({ ch: SPACE, color: null }))
  );

  const posColor = palette('positive');
  const negColor = palette('negative');
  const wickColor = palette('muted');

  for (let ci = 0; ci < numCandles; ci++) {
    const bar = visibleBars[ci];
    const open  = Number(bar.open);
    const high  = Number(bar.high);
    const low   = Number(bar.low);
    const close = Number(bar.close);

    const isBull = close >= open;
    const candleColor = isBull ? posColor : negColor;
    const bodyChar    = isBull ? BODY_BULL : BODY_BEAR;

    const highRow  = priceToRow(high);
    const lowRow   = priceToRow(low);
    const bodyTop  = priceToRow(Math.max(open, close));
    const bodyBot  = priceToRow(Math.min(open, close));

    const col = ci * candleColW;  // center column for this candle

    // Draw wick (full range of candle)
    for (let r = highRow; r <= lowRow; r++) {
      if (r >= 0 && r < height) {
        const isBody = r >= bodyTop && r <= bodyBot;
        if (isBody) {
          grid[r][col] = { ch: bodyChar, color: candleColor };
        } else {
          grid[r][col] = { ch: WICK_CHAR, color: wickColor };
        }
      }
    }
  }

  // Render lines
  const lines = [];

  // Compute axis label positions: top, mid, bottom
  const axisRows = new Set();
  if (showAxis) {
    axisRows.add(0);
    axisRows.add(Math.floor((height - 1) / 2));
    axisRows.add(height - 1);
  }

  for (let r = 0; r < height; r++) {
    let axisStr = '';
    if (showAxis) {
      if (axisRows.has(r)) {
        let price;
        if (r === 0) price = priceMax;
        else if (r === height - 1) price = priceMin;
        else price = (priceMax + priceMin) / 2;
        axisStr = padLeft(pc('muted', fmtPrice(price)), axisWidth - 1) + ' ';
      } else {
        axisStr = ' '.repeat(axisWidth);
      }
    }

    let rowStr = '';
    for (let col = 0; col < gridCols; col++) {
      const cell = grid[r][col];
      if (cell.color) {
        rowStr += c(cell.color, cell.ch);
      } else {
        rowStr += cell.ch;
      }
    }

    lines.push(axisStr + rowStr);
  }

  // Label
  if (label) {
    const labelPad = showAxis ? ' '.repeat(axisWidth) : '';
    lines.push(labelPad + pc('label', label));
  }

  return lines.join('\n');
}
