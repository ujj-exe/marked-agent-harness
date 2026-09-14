/**
 * HeatMap — color-coded value grid using true-color background cells.
 *
 * Each cell has its background color interpolated between:
 *   - diverging: negative (red) → neutral (dark/muted) → positive (green)
 *   - sequential: low (dark) → high (bright accent)
 *
 * Row and column labels are displayed.
 *
 * Pure function: (opts) → string (ANSI-colored, multi-line)
 */
import { pc, strip, padLeft, padRight, padCenter } from '../ansi.js';
import { palette } from '../themes.js';

// ── Color interpolation helpers ───────────────────────────────────

/**
 * Darken a hex color by multiplying each channel by `factor` (0..1).
 * Used to derive near-black background shades from theme palette values.
 */
function darken(hex, factor = 0.35) {
  const s = hex.replace('#', '');
  const r = Math.round(parseInt(s.slice(0, 2), 16) * factor);
  const g = Math.round(parseInt(s.slice(2, 4), 16) * factor);
  const b = Math.round(parseInt(s.slice(4, 6), 16) * factor);
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

function hexToRgb(hex) {
  const h = hex.replace('#', '');
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

function rgbToHex(r, g, b) {
  return '#' +
    Math.round(r).toString(16).padStart(2, '0') +
    Math.round(g).toString(16).padStart(2, '0') +
    Math.round(b).toString(16).padStart(2, '0');
}

/**
 * Interpolate between two hex colors by factor t ∈ [0, 1].
 */
function lerpColor(hexA, hexB, t) {
  const [ar, ag, ab] = hexToRgb(hexA);
  const [br, bg_, bb] = hexToRgb(hexB);
  return rgbToHex(
    ar + (br - ar) * t,
    ag + (bg_ - ag) * t,
    ab + (bb - ab) * t,
  );
}

/**
 * Map a normalized value in [-1, 1] to a background color (diverging scale).
 * 0 → neutral/dark, -1 → negative color, +1 → positive color
 */
function divergingColor(norm) {
  const neutralHex = darken(palette('muted') || '#555555', 0.3);  // near-black neutral from theme muted
  const posHex     = palette('positive') || '#00ff88';
  const negHex     = palette('negative') || '#ff4444';

  if (norm >= 0) {
    return lerpColor(neutralHex, posHex, Math.min(norm, 1));
  } else {
    return lerpColor(neutralHex, negHex, Math.min(-norm, 1));
  }
}

/**
 * Map a normalized value in [0, 1] to a background color (sequential scale).
 * 0 → chartLow, 1 → chartHigh
 */
function sequentialColor(norm) {
  const lowHex  = palette('chartLow')  || '#005566';
  const highHex = palette('chartHigh') || '#00d4ff';
  return lerpColor(lowHex, highHex, Math.min(Math.max(norm, 0), 1));
}

// ── Value formatters for cell display ────────────────────────────

function fmtCellValue(v) {
  if (v == null) return ' — ';
  v = Number(v);
  if (Math.abs(v) >= 100) return `${v.toFixed(0)}`;
  if (Math.abs(v) >= 10)  return `${v.toFixed(1)}`;
  return `${v.toFixed(2)}`;
}

// ── HeatMap component ─────────────────────────────────────────────

/**
 * Render a heatmap grid.
 *
 * @param {Object} opts
 * @param {Array<{label: string, values: number[]}>} opts.rows     - Row definitions
 * @param {string[]} opts.columns                                   - Column labels
 * @param {number} [opts.width=60]                                  - Total width in terminal columns
 * @param {'diverging'|'sequential'} [opts.colorScale='diverging']  - Color scale type
 * @returns {string} Multi-line ANSI string
 */
export function heatMap(opts) {
  const {
    rows = [],
    columns = [],
    width = 60,
    colorScale = 'diverging',
  } = opts;

  if (!rows.length || !columns.length) {
    return pc('muted', '(no data)');
  }

  const numCols = columns.length;
  const numRows = rows.length;

  // Determine label column width
  const maxRowLabelLen = Math.max(...rows.map(r => strip(r.label || '').length), 3);
  const rowLabelW = Math.min(maxRowLabelLen + 1, 12);  // cap at 12

  // Distribute remaining width across data columns
  const availW = Math.max(width - rowLabelW, numCols * 3);
  const cellW  = Math.max(3, Math.floor(availW / numCols));

  // Gather all values for normalization
  const allValues = rows.flatMap(r => (r.values || []).map(Number).filter(v => !isNaN(v)));
  if (!allValues.length) return pc('muted', '(no data)');

  let vMin, vMax, vAbs;
  if (colorScale === 'diverging') {
    vAbs = Math.max(Math.abs(Math.min(...allValues)), Math.abs(Math.max(...allValues))) || 1;
  } else {
    vMin = Math.min(...allValues);
    vMax = Math.max(...allValues);
    const vRange = vMax - vMin || 1;
    vAbs = vRange;
  }

  function normalizeValue(v) {
    if (colorScale === 'diverging') {
      return v / vAbs;  // -1 to 1
    } else {
      return (v - vMin) / vAbs;  // 0 to 1
    }
  }

  function getCellBg(v) {
    const norm = normalizeValue(v);
    return colorScale === 'diverging'
      ? divergingColor(norm)
      : sequentialColor(norm);
  }

  // Determine text color: use light on dark bg, dark on light bg
  // Simple heuristic: always use white fg (data color) for readability
  const textColor = palette('data') || '#ffffff';

  const lines = [];

  // ── Header row (column labels) ─────────────────────────────────
  let headerLine = ' '.repeat(rowLabelW);
  for (const colLabel of columns) {
    const truncated = strip(colLabel).slice(0, cellW - 1);
    headerLine += padCenter(pc('label', truncated), cellW);
  }
  lines.push(headerLine);

  // ── Data rows ─────────────────────────────────────────────────
  for (const row of rows) {
    const rowLabel  = strip(row.label || '').slice(0, rowLabelW - 1);
    let line = padRight(pc('label', rowLabel), rowLabelW);

    const values = row.values || [];
    for (let ci = 0; ci < numCols; ci++) {
      const v = values[ci];
      if (v == null || isNaN(Number(v))) {
        // Empty cell
        line += ' '.repeat(cellW);
        continue;
      }

      const bgHex   = getCellBg(Number(v));
      const display = fmtCellValue(Number(v));
      // Pad display to cellW - 2 (leaving 1-char padding on each side)
      const innerW  = Math.max(cellW - 2, 1);
      const padded  = padCenter(display, innerW);
      // bg color + text color + content + reset
      const ESC = '\x1b[';
      const [br, bg_, bb] = hexToRgb(bgHex);
      const [tr, tg, tb] = hexToRgb(textColor);
      const bgCode = `${ESC}48;2;${br};${bg_};${bb}m`;
      const fgCode = `${ESC}38;2;${tr};${tg};${tb}m`;
      line += ' ' + bgCode + fgCode + padded + `${ESC}0m` + ' ';
    }

    lines.push(line);
  }

  return lines.join('\n');
}
