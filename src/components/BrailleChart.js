/**
 * BrailleChart — smooth price curves using Unicode braille (U+2800-U+28FF).
 *
 * Braille characters encode a 2×4 dot grid per cell:
 *   ⡇ = col 0: rows 0-3, col 1: rows 0-3
 *   Dot positions (bit index):
 *     0  3
 *     1  4
 *     2  5
 *     6  7
 *
 * This gives 2x horizontal × 4x vertical subpixel resolution.
 *
 * Pure function: (data, options) → string (ANSI-colored)
 */
import { fg, c, pc, BOLD, RESET, strip, visLen, padLeft } from '../ansi.js';
import { palette } from '../themes.js';
import { fmtPrice } from '../formatters.js';

// Braille dot bit positions: [row][col]
// Row 0 = top, row 3 = bottom
const DOT_MAP = [
  [0x01, 0x08],  // row 0
  [0x02, 0x10],  // row 1
  [0x04, 0x20],  // row 2
  [0x40, 0x80],  // row 3
];

const BRAILLE_BASE = 0x2800;

/**
 * Render a braille chart.
 *
 * @param {Object} opts
 * @param {number[]} opts.values - Price/data values (left→right, chronological)
 * @param {number} [opts.width=60] - Chart width in terminal columns
 * @param {number} [opts.height=6] - Chart height in terminal rows (each row = 4 subpixels)
 * @param {boolean} [opts.showAxis=true] - Show Y-axis price labels
 * @param {boolean} [opts.showMinMax=true] - Mark min/max values
 * @param {number[]} [opts.volume] - Optional volume data for overlay
 * @param {string} [opts.label] - Chart label (e.g., "6M WEEKLY")
 * @returns {string} Multi-line ANSI string
 */
export function brailleChart(opts = {}) {
  const {
    values = [],
    width = 60,
    height = 6,
    showAxis = true,
    showMinMax = true,
    fill = false,
    volume,
    label,
  } = opts;

  if (!values.length) {
    return pc('muted', '(no data)');
  }
  if (values.length === 1) {
    return pc('data', `${fmtPrice(values[0])} (single point)`);
  }

  // Dynamic axis width: match actual label length + 1 space separator
  const minVal = Math.min(...values);
  const maxVal = Math.max(...values);
  const maxLabelLen = Math.max(fmtPrice(minVal).length, fmtPrice(maxVal).length);
  const rawAxisWidth = showAxis ? maxLabelLen + 1 : 0;

  // If axis would leave fewer than 12 columns for the chart, drop it
  const axisWidth = (showAxis && width - rawAxisWidth >= 12) ? rawAxisWidth : 0;
  const effectiveShowAxis = axisWidth > 0;

  const chartCols = width - axisWidth;
  if (chartCols < 4) return pc('muted', '(too narrow)');

  // Resample values to chartCols * 2 (2 subpixels per column)
  const subCols = chartCols * 2;
  const resampled = resample(values, subCols);

  // Filter out NaN/Infinity from resampled data (bad agent input)
  const clean = resampled.map(v => Number.isFinite(v) ? v : null);
  const finite = clean.filter(v => v !== null);
  if (!finite.length) return pc('muted', '(no valid data)');

  const min = Math.min(...finite);
  const max = Math.max(...finite);
  const range = max - min || 1;

  // Total subpixel rows = height * 4
  const subRows = height * 4;

  // Map values → subpixel row (0 = top = max, subRows-1 = bottom = min)
  // null entries (NaN/Infinity filtered above) get -1 → skipped during plotting
  const yPositions = clean.map(v =>
    v === null ? -1 : Math.round((1 - (v - min) / range) * (subRows - 1))
  );

  // Build braille grid: [row][col] → dot pattern byte
  const grid = Array.from({ length: height }, () =>
    new Uint8Array(chartCols)
  );

  // Plot points (skip nulls marked as -1)
  for (let sx = 0; sx < subCols; sx++) {
    const y = yPositions[sx];
    if (y < 0) continue;
    const col = Math.floor(sx / 2);
    const dotCol = sx % 2; // 0 or 1
    const row = Math.floor(y / 4);
    const dotRow = y % 4;
    if (row >= 0 && row < height && col >= 0 && col < chartCols) {
      grid[row][col] |= DOT_MAP[dotRow][dotCol];
    }
  }

  // Fill between consecutive points to make connected lines
  for (let sx = 1; sx < subCols; sx++) {
    const y0 = yPositions[sx - 1];
    const y1 = yPositions[sx];
    if (y0 < 0 || y1 < 0) continue; // skip gaps from NaN/Infinity
    if (Math.abs(y1 - y0) > 1) {
      const step = y1 > y0 ? 1 : -1;
      // Interpolate between y0 and y1
      for (let y = y0 + step; y !== y1; y += step) {
        // Spread across the two sub-columns
        const col = Math.floor((sx - 0.5) / 2);
        const dotCol = Math.round((sx - 0.5) % 2) ? 1 : 0;
        const row = Math.floor(y / 4);
        const dotRow = y % 4;
        if (row >= 0 && row < height && col >= 0 && col < chartCols) {
          grid[row][col] |= DOT_MAP[dotRow][dotCol];
        }
      }
    }
  }

  // Area fill: fill dots below the curve to create a solid area chart (when fill=true)
  const fillGrid = Array.from({ length: height }, () =>
    new Uint8Array(chartCols)
  );
  if (fill) for (let sx = 0; sx < subCols; sx++) {
    const y = yPositions[sx];
    if (y < 0) continue;
    const col = Math.floor(sx / 2);
    const dotCol = sx % 2;
    for (let fillY = y + 1; fillY < subRows; fillY++) {
      const fRow = Math.floor(fillY / 4);
      const fDotRow = fillY % 4;
      if (fRow >= 0 && fRow < height && col >= 0 && col < chartCols) {
        if (!(grid[fRow][col] & DOT_MAP[fDotRow][dotCol])) {
          fillGrid[fRow][col] |= DOT_MAP[fDotRow][dotCol];
        }
      }
    }
  }

  // Chart line: always brand lime (accent)
  const chartColor = palette('accent');
  const fillColor = palette('chartLow');

  // Render volume overlay (bottom row, dim blocks)
  let volumeRow = '';
  if (volume && volume.length > 0) {
    const volResampled = resample(volume, chartCols);
    const volMax = Math.max(...volResampled) || 1;
    const volChars = '░▒▓█';
    volumeRow = volResampled
      .map(v => {
        const ratio = v / volMax;
        const idx = Math.min(volChars.length - 1, Math.floor(ratio * volChars.length));
        return volChars[idx];
      })
      .join('');
  }

  // Render lines
  const lines = [];
  const axisLineColor = palette('muted');

  for (let row = 0; row < height; row++) {
    let axis = '';
    if (effectiveShowAxis) {
      if (row === 0) {
        axis = padLeft(pc('muted', fmtPrice(max)), axisWidth);
      } else if (row === height - 1) {
        axis = padLeft(pc('muted', fmtPrice(min)), axisWidth);
      } else if (row === Math.floor(height / 2)) {
        const mid = (max + min) / 2;
        axis = padLeft(pc('muted', fmtPrice(mid)), axisWidth);
      } else {
        axis = ' '.repeat(axisWidth);
      }
    }

    // Convert grid row to braille characters (curve + area fill)
    let rowStr = '';
    for (let col = 0; col < chartCols; col++) {
      const curveBits = grid[row][col];
      const fBits = fillGrid[row][col];
      if (curveBits === 0 && fBits === 0) {
        rowStr += ' ';
      } else if (curveBits !== 0) {
        // Merge curve + fill, render in curve color
        const merged = curveBits | fBits;
        rowStr += c(chartColor, String.fromCharCode(BRAILLE_BASE + merged));
      } else {
        // Fill only — dim
        rowStr += c(fillColor, String.fromCharCode(BRAILLE_BASE + fBits));
      }
    }

    lines.push(axis + rowStr);
  }

  // X-axis baseline: dim horizontal line spanning chart width
  const xAxisPad = effectiveShowAxis ? ' '.repeat(axisWidth) : '';
  lines.push(xAxisPad + c(axisLineColor, '─'.repeat(chartCols)));

  // Volume bar
  if (volumeRow) {
    const volAxis = effectiveShowAxis ? padLeft(pc('muted', 'Vol'), axisWidth) : '';
    lines.push(volAxis + pc('muted', volumeRow));
  }

  // Label
  if (label) {
    const labelAxis = effectiveShowAxis ? ' '.repeat(axisWidth) : '';
    lines.push(labelAxis + pc('label', label));
  }

  return lines.join('\n');
}

/** Resample array to target length via linear interpolation. */
function resample(arr, targetLen) {
  if (arr.length === targetLen) return arr.map(Number);
  const result = [];
  for (let i = 0; i < targetLen; i++) {
    const srcIdx = (i / (targetLen - 1)) * (arr.length - 1);
    const lo = Math.floor(srcIdx);
    const hi = Math.min(lo + 1, arr.length - 1);
    const frac = srcIdx - lo;
    result.push(Number(arr[lo]) * (1 - frac) + Number(arr[hi]) * frac);
  }
  return result;
}
