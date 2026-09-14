/**
 * WaterfallChart — horizontal waterfall bars for quarterly financials.
 *
 * Renders each item as a labeled row with a horizontal bar extending left (negative)
 * or right (positive) from a zero axis, plus optional YoY delta indicators.
 *
 * Export: waterfallChart(opts) → multi-line ANSI string
 *
 * opts:
 *   items    {Array<{label, value, previous?}>}
 *   width    {number}  total render width (default 60)
 *   showDelta {boolean} show YoY comparison arrows/pct (default true)
 */
import { c, pc, BOLD, RESET, padRight, padLeft, visLen, strip } from '../ansi.js';
import { palette } from '../themes.js';
import { fmtCap, fmtNumber } from '../formatters.js';

const BLOCK = '█';

// ── Helpers ──────────────────────────────────────────────────────

function fmtVal(v) {
  const abs = Math.abs(v);
  if (abs >= 1e12) return `${(v / 1e12).toFixed(2)}T`;
  if (abs >= 1e9)  return `${(v / 1e9).toFixed(1)}B`;
  if (abs >= 1e6)  return `${(v / 1e6).toFixed(1)}M`;
  if (abs >= 1e3)  return `${(v / 1e3).toFixed(1)}K`;
  return v.toFixed(1);
}

function deltaArrow(current, previous) {
  if (previous == null || previous === 0) return '';
  const pct = ((current - previous) / Math.abs(previous)) * 100;
  const sign = pct >= 0 ? '+' : '';
  const role = pct > 0 ? 'positive' : pct < 0 ? 'negative' : 'muted';
  const arrow = pct > 0 ? '▲' : pct < 0 ? '▼' : '■';
  return pc(role, `${arrow}${sign}${pct.toFixed(1)}%`);
}

/**
 * Render a waterfall chart.
 *
 * @param {Object} opts
 * @param {Array<{label: string, value: number, previous?: number}>} opts.items
 * @param {number} [opts.width=60]
 * @param {boolean} [opts.showDelta=true]
 * @returns {string} Multi-line ANSI string
 */
export function waterfallChart(opts = {}) {
  const {
    items = [],
    width = 60,
    showDelta = true,
  } = opts;

  if (!items.length) return pc('muted', '(no data)');

  // Layout constants
  const LABEL_W  = 12;
  const VALUE_W  = 9;
  const DELTA_W  = showDelta ? 10 : 0;
  // bar area = width - label - space - value - space - delta
  const barAreaW = Math.max(10, width - LABEL_W - 1 - VALUE_W - 1 - DELTA_W);
  // zero sits in the middle of barAreaW
  const halfBar  = Math.floor(barAreaW / 2);

  // Find max absolute value to scale bars
  const maxAbs = Math.max(...items.map(it => Math.abs(it.value)), 1);

  const lines = [];

  // Header divider showing the zero axis position
  const axisCol  = LABEL_W + 1 + halfBar;
  const headerLine =
    ' '.repeat(LABEL_W + 1) +
    pc('muted', '─'.repeat(halfBar)) +
    pc('accent', '┬') +
    pc('muted', '─'.repeat(barAreaW - halfBar - 1));
  lines.push(headerLine);

  for (const item of items) {
    const { label, value, previous } = item;
    const ratio = Math.min(1, Math.abs(value) / maxAbs);
    const barLen = Math.round(ratio * halfBar);

    // Determine color role
    const role = value >= 0 ? 'positive' : 'negative';
    const barColor = palette(role);

    // Build bar segment
    let leftPad = '';
    let bar = '';
    let rightPad = '';

    if (value >= 0) {
      // positive: zero at halfBar, bar extends right
      leftPad  = ' '.repeat(halfBar);
      bar      = c(barColor, BLOCK.repeat(barLen));
      rightPad = ' '.repeat(Math.max(0, halfBar - barLen));
    } else {
      // negative: bar extends left from zero
      const spaces = halfBar - barLen;
      leftPad  = ' '.repeat(spaces);
      bar      = c(barColor, BLOCK.repeat(barLen));
      rightPad = ' '.repeat(halfBar);
    }

    const axis = pc('accent', '│');

    // zero column marker — placed between left pad/bar and right
    let barRow;
    if (value >= 0) {
      barRow = leftPad + axis + bar + rightPad;
    } else {
      barRow = leftPad + bar + axis + rightPad;
    }

    // Trim/pad barRow to exactly barAreaW visible chars (axis char = 1 vis char)
    const barRowVis = visLen(barRow);
    const barRowPadded = barRowVis < barAreaW
      ? barRow + ' '.repeat(barAreaW - barRowVis)
      : barRow;

    // Value column
    const valStr = padLeft(pc(role, fmtVal(value)), VALUE_W);

    // Delta column
    let deltaStr = '';
    if (showDelta) {
      const d = deltaArrow(value, previous);
      deltaStr = d ? ' ' + padRight(d, DELTA_W - 1) : ' ' + ' '.repeat(DELTA_W - 1);
    }

    const labelStr = padRight(pc('label', label), LABEL_W);

    lines.push(labelStr + ' ' + barRowPadded + ' ' + valStr + deltaStr);
  }

  return lines.join('\n');
}
