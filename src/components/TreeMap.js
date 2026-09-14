/**
 * TreeMap — proportional block-fill visualization for market-cap weighted data.
 *
 * Fills a width×height character grid with items sized by weight. Each item's
 * area is proportional to its weight. Block characters (█▓▒░) and background
 * colors represent performance tiers. Labels are drawn inside each item's region.
 *
 * Uses a simplified row-based squarify: items are laid out left-to-right in rows,
 * each row's height determined by the total weight of items in that row.
 *
 * Export: treeMap(opts) → multi-line ANSI string
 *
 * opts:
 *   items    {Array<{label, weight, value, color?}>}
 *   width    {number}  total columns (default 60)
 *   height   {number}  total rows (default 10)
 */
import { c, pc, BOLD, RESET, padRight, padLeft, padCenter, visLen, strip } from '../ansi.js';
import { palette } from '../themes.js';

// Block density characters ordered from densest to least dense
const BLOCKS = ['█', '▓', '▒', '░'];

// ── Color helpers ────────────────────────────────────────────────

/**
 * Pick a fill character and color for a cell based on performance value.
 * value > 0 → positive palette; value < 0 → negative palette; neutral → muted.
 */
function cellStyle(value, customColor) {
  if (customColor) return { color: customColor, block: BLOCKS[0] };
  if (value == null) return { color: palette('muted'), block: BLOCKS[3] };
  const v = Number(value);
  if (v > 3)   return { color: palette('positive'), block: BLOCKS[0] };
  if (v > 0)   return { color: palette('positive'), block: BLOCKS[1] };
  if (v === 0) return { color: palette('muted'),    block: BLOCKS[2] };
  if (v > -3)  return { color: palette('negative'), block: BLOCKS[1] };
  return           { color: palette('negative'), block: BLOCKS[0] };
}

// ── Layout ───────────────────────────────────────────────────────

/**
 * Partition items into rows using a greedy strip-based approach.
 * Each row accumulates items until adding the next item would make
 * the row's aspect ratio worse (farther from square).
 *
 * Returns an array of rows; each row is an array of { item, cols } pairs
 * where cols is the column width allocated to that item in this row,
 * and rowH is the row height.
 */
function layoutRows(items, width, height) {
  const totalWeight = items.reduce((s, it) => s + it.weight, 0) || 1;

  const rows = [];
  let remaining = [...items];
  let usedRows = 0;
  const totalRows = height;

  while (remaining.length > 0 && usedRows < totalRows) {
    const rowsLeft = totalRows - usedRows;

    // Determine how many items go in this row
    // We try greedily: keep adding items while the aspect ratio improves
    let bestCount = 1;
    let bestScore = Infinity;

    for (let n = 1; n <= remaining.length; n++) {
      const rowItems = remaining.slice(0, n);
      const rowWeight = rowItems.reduce((s, it) => s + it.weight, 0);
      const rowFrac = rowWeight / totalWeight;

      // Height this row would occupy
      const rowH = Math.max(1, Math.round(rowFrac * totalRows));

      // For each item in the row, compute its column share
      // Score: average |aspect - 1| where aspect = (cols/rowH)
      let score = 0;
      for (const it of rowItems) {
        const itFrac = it.weight / rowWeight;
        const cols = Math.max(1, Math.round(itFrac * width));
        const aspect = rowH > 0 ? cols / rowH : cols;
        score += Math.abs(aspect - 1);
      }
      score /= n;

      if (score < bestScore) {
        bestScore = score;
        bestCount = n;
      } else {
        // Aspect is getting worse — stop
        break;
      }
    }

    const rowItems = remaining.slice(0, bestCount);
    const rowWeight = rowItems.reduce((s, it) => s + it.weight, 0);
    const rowFrac = rowWeight / totalWeight;
    const rowH = usedRows + Math.max(1, Math.round(rowFrac * totalRows)) > totalRows
      ? totalRows - usedRows
      : Math.max(1, Math.round(rowFrac * totalRows));

    // Distribute columns within this row
    let assignedCols = 0;
    const rowCells = rowItems.map((item, idx) => {
      const isLast = idx === rowItems.length - 1;
      const itFrac = rowWeight > 0 ? item.weight / rowWeight : 1 / rowItems.length;
      const cols = isLast
        ? width - assignedCols
        : Math.max(1, Math.round(itFrac * width));
      assignedCols += cols;
      return { item, cols };
    });

    // Normalize: ensure total cols == width
    const totalCols = rowCells.reduce((s, c) => s + c.cols, 0);
    if (totalCols !== width && rowCells.length > 0) {
      rowCells[rowCells.length - 1].cols += width - totalCols;
    }

    rows.push({ cells: rowCells, rowH });
    usedRows += rowH;
    remaining = remaining.slice(bestCount);
  }

  return rows;
}

// ── Cell rendering ───────────────────────────────────────────────

/**
 * Render a single cell of width `cols` and height `rowH`.
 * Returns an array of `rowH` strings each `cols` chars wide (visual).
 */
function renderCell(item, cols, rowH) {
  const { label = '', value, color: customColor } = item;
  const { color, block } = cellStyle(value, customColor);

  // Build fill line: repeat block to fill cols
  const fillLine = block.repeat(cols);

  const lines = [];
  for (let r = 0; r < rowH; r++) {
    // Middle row(s) get the label; others get solid fill
    const isLabelRow = rowH === 1 ? true : r === Math.floor(rowH / 2);
    const isValueRow = rowH > 2 && r === Math.floor(rowH / 2) + 1;

    if (isLabelRow && cols >= 3) {
      // Truncate label to fit; pad with block chars
      const maxLabelLen = cols - 2;
      let lbl = label.length > maxLabelLen ? label.slice(0, maxLabelLen) : label;
      const padTotal = cols - lbl.length;
      const padL = Math.floor(padTotal / 2);
      const padR = padTotal - padL;
      const line =
        c(color, block.repeat(padL)) +
        c(color, BOLD) + c(color, lbl) + RESET +
        c(color, block.repeat(padR));
      lines.push(line);
    } else if (isValueRow && value != null && cols >= 5) {
      // Show value on the row below label
      const v = Number(value);
      const valStr = v >= 0 ? `+${v.toFixed(1)}%` : `${v.toFixed(1)}%`;
      const maxLen = cols - 2;
      const display = valStr.length > maxLen ? valStr.slice(0, maxLen) : valStr;
      const padTotal = cols - display.length;
      const padL = Math.floor(padTotal / 2);
      const padR = padTotal - padL;
      lines.push(
        c(color, block.repeat(padL)) +
        c(color, display) +
        c(color, block.repeat(padR))
      );
    } else {
      lines.push(c(color, fillLine));
    }
  }

  return lines;
}

// ── Public API ───────────────────────────────────────────────────

/**
 * Render a treemap.
 *
 * @param {Object} opts
 * @param {Array<{label: string, weight: number, value?: number, color?: string}>} opts.items
 * @param {number} [opts.width=60]
 * @param {number} [opts.height=10]
 * @returns {string} Multi-line ANSI string
 */
export function treeMap(opts = {}) {
  const {
    items = [],
    width = 60,
    height = 10,
  } = opts;

  if (!items.length) return pc('muted', '(no data)');

  // Filter out zero/negative weights; normalize
  const validItems = items
    .map(it => ({ ...it, weight: Math.max(0, Number(it.weight) || 0) }))
    .filter(it => it.weight > 0);

  if (!validItems.length) return pc('muted', '(no data)');

  const rows = layoutRows(validItems, width, height);

  // Render each row
  const outputLines = [];

  for (const { cells, rowH } of rows) {
    // Render each cell for this row
    const cellLines = cells.map(({ item, cols }) => renderCell(item, cols, rowH));

    // Combine cell lines horizontally
    for (let r = 0; r < rowH; r++) {
      let line = '';
      for (let ci = 0; ci < cellLines.length; ci++) {
        line += cellLines[ci][r] || '';
      }
      outputLines.push(line);
    }
  }

  // Pad output to exactly `height` lines
  while (outputLines.length < height) {
    outputLines.push(pc('muted', ' '.repeat(width)));
  }

  return outputLines.slice(0, height).join('\n');
}
