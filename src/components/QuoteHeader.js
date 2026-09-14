/**
 * QuoteHeader — bold ticker + company name + sparkline + price + change + volume + cap.
 *
 * Full width dashboard header:
 * ═══ NVDA  NVIDIA Corporation  $172.70 ▼3.6%  Vol 209.8M  $4.20T ═══
 *
 * Or compact single-line for pulse layout:
 * NVDA $172.70 ▼3.6% │ RSI 37.8 │ ▁▃▅▇▅▃▂▃ │ $4.20T
 *
 * Pure function: (data, options) → string (ANSI-colored)
 */
import { c, pc, fg, BOLD, RESET, strip, visLen, padRight, padLeft } from '../ansi.js';
import { palette } from '../themes.js';
import { fmtPrice, fmtPct, fmtCap, fmtVol, coloredPct } from '../formatters.js';

// Sparkline characters (8 levels)
const SPARK = '▁▂▃▄▅▆▇█';
const SPARK_EMPTY = '·';

/**
 * Render a quote header.
 *
 * @param {Object} opts
 * @param {string} opts.ticker - Symbol (e.g., "NVDA")
 * @param {string} [opts.name] - Company name (e.g., "NVIDIA Corporation")
 * @param {number} opts.price - Current price
 * @param {number} [opts.change] - Price change amount
 * @param {number} [opts.changePct] - Price change percentage
 * @param {number} [opts.volume] - Trading volume
 * @param {number} [opts.marketCap] - Market cap
 * @param {number[]} [opts.sparkData] - Recent prices for sparkline
 * @param {number} [opts.width=80] - Total width
 * @param {'full'|'compact'|'dense'|'minimal'} [opts.variant='full'] - Layout variant
 * @returns {string} ANSI string (single or multi-line)
 */
export function quoteHeader(opts = {}) {
  const {
    ticker,
    name,
    price,
    change,
    changePct,
    volume,
    marketCap,
    sparkData,
    width = 80,
    variant = 'full',
  } = opts;

  if (!ticker) return pc('muted', '—');

  switch (variant) {
    case 'compact': return renderCompact(opts);
    case 'dense':   return renderDense(opts);
    case 'minimal': return renderMinimal(opts);
    default: return renderFull(opts);
  }
}

function renderFull(opts) {
  const { ticker, name, price, change, changePct, volume, marketCap, sparkData, width = 80 } = opts;
  const accentHex = palette('accent');

  // Build parts
  const tickerStr = c(accentHex, BOLD + ticker);
  const nameStr = name ? '  ' + pc('label', name) : '';
  const priceStr = '  ' + pc('data', BOLD + fmtPrice(price));

  const changeStr = changePct != null
    ? '  ' + (changePct >= 0 ? pc('positive', '▲') : pc('negative', '▼')) + coloredPct(changePct)
    : '';

  const volStr = volume != null ? '  ' + pc('label', 'Vol ') + pc('data', fmtVol(volume)) : '';
  const capStr = marketCap != null ? '  ' + pc('data', fmtCap(marketCap)) : '';

  // Sparkline
  const sparkStr = sparkData && sparkData.length > 1
    ? '  ' + renderSparkline(sparkData, 12)
    : '';

  const content = tickerStr + nameStr + priceStr + changeStr + sparkStr + volStr + capStr;
  const contentVis = visLen(strip(content));

  // Frame with ═══ on both sides
  const leftPad = 3; // "═══ "
  const rightPad = 3;
  const totalDecoWidth = leftPad + 1 + rightPad + 1; // ═══ + space + space + ═══
  const available = width - totalDecoWidth;

  const leftDeco = c(accentHex, '═'.repeat(leftPad) + ' ');
  const rightFill = Math.max(1, width - contentVis - leftPad - 2);
  const rightDeco = ' ' + c(accentHex, '═'.repeat(rightFill));

  return leftDeco + content + rightDeco;
}

function renderCompact(opts) {
  const { ticker, price, changePct, volume, marketCap, sparkData, width = 80 } = opts;
  const sep = pc('muted', ' │ ');

  const parts = [];
  parts.push(pc('accent', BOLD + ticker));
  parts.push(pc('data', fmtPrice(price)));

  if (changePct != null) {
    const arrow = changePct >= 0 ? pc('positive', '▲') : pc('negative', '▼');
    parts.push(arrow + coloredPct(changePct));
  }

  let line = parts.join(' ');

  // Progressively add fields only if they fit within width
  if (sparkData && sparkData.length > 1) {
    const candidate = line + sep + renderSparkline(sparkData, 8);
    if (visLen(candidate) <= width) line = candidate;
  }
  if (volume != null) {
    const candidate = line + sep + pc('label', 'Vol ') + pc('data', fmtVol(volume));
    if (visLen(candidate) <= width) line = candidate;
  }
  if (marketCap != null) {
    const candidate = line + sep + pc('data', fmtCap(marketCap));
    if (visLen(candidate) <= width) line = candidate;
  }

  return line;
}

function renderMinimal(opts) {
  const { ticker, price, changePct } = opts;
  const parts = [pc('accent', ticker), pc('data', fmtPrice(price))];
  if (changePct != null) parts.push(coloredPct(changePct));
  return parts.join(' ');
}

/**
 * Dense single-line: NVDA  NVIDIA Corporation  $172.70 ▼3.6%  Vol 209.8M  $4.20T
 * Truncates company name to fit within width.
 */
function renderDense(opts) {
  const { ticker, name, price, changePct, volume, marketCap, width = 80 } = opts;

  const tickerStr  = c(palette('accent'), BOLD + ticker);
  const priceStr   = pc('data', fmtPrice(price));
  const changeStr  = changePct != null
    ? (changePct >= 0 ? pc('positive', '▲') : pc('negative', '▼')) + coloredPct(changePct)
    : '';
  const volStr     = volume    != null ? pc('label', 'Vol ') + pc('data', fmtVol(volume))  : '';
  const capStr     = marketCap != null ? pc('data', fmtCap(marketCap)) : '';

  // Build fixed parts (no name yet) to measure available space for name
  const fixedParts = [tickerStr, priceStr];
  if (changeStr) fixedParts.push(changeStr);
  if (volStr)    fixedParts.push(volStr);
  if (capStr)    fixedParts.push(capStr);
  const fixedJoined = fixedParts.join('  ');
  const fixedVis = visLen(fixedJoined);

  // Name budget: space left after fixed parts (ticker + 2sp gap + name + 2sp gap + rest)
  // Minimum 0 visible chars for name.
  const nameBudget = Math.max(0, width - fixedVis - 4); // 2 spaces each side of name

  let nameStr = '';
  if (name && nameBudget > 4) {
    const raw = String(name);
    const truncated = raw.length > nameBudget ? raw.slice(0, nameBudget - 1) + '…' : raw;
    nameStr = pc('label', truncated);
  }

  // Assemble: ticker  [name  ]price  change  vol  cap
  const parts = [tickerStr];
  if (nameStr) parts.push(nameStr);
  parts.push(priceStr);
  if (changeStr) parts.push(changeStr);
  if (volStr)    parts.push(volStr);
  if (capStr)    parts.push(capStr);

  return parts.join('  ');
}

/**
 * Render sparkline from array of values.
 */
function renderSparkline(values, width = 12) {
  if (!values || values.length < 2) return '';

  // Resample to width
  const resampled = [];
  for (let i = 0; i < width; i++) {
    const idx = Math.floor(i * values.length / width);
    resampled.push(Number(values[Math.min(idx, values.length - 1)]));
  }

  const min = Math.min(...resampled);
  const max = Math.max(...resampled);
  const range = max - min || 1;

  const isUp = resampled[resampled.length - 1] >= resampled[0];
  const color = palette(isUp ? 'positive' : 'negative');

  const chars = resampled.map(v => {
    const idx = Math.round(((v - min) / range) * (SPARK.length - 1));
    return SPARK[Math.max(0, Math.min(SPARK.length - 1, idx))];
  });

  return c(color, chars.join(''));
}
