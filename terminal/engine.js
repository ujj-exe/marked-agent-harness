/**
 * engine.js — Block-based layout engine.
 *
 * renderBlocks(blocks, width) → ANSI string
 *
 * Agents send a `blocks` array as JSON. Each block is one of:
 *   { panel: name, data: {...}, w?: fraction|chars }
 *   { table: { headers, rows, align } }
 *   { row: [block, ...], gap?: number }
 *   { stack: [block, ...] }
 *   { divider: "TITLE" }
 *   { text: "any string" }
 *   { spacer: N }
 *
 * presetToBlocks(layout, panels) converts legacy { layout, panels } payloads
 * into a blocks array for backward compat.
 */
import { boxDivider, pc, visLen, padRight, padLeft, strip, ansiTrunc, colorTablePercent } from '../src/index.js';
import { renderPanel, skeleton } from './panels.js';
import { PANEL_NAMES_SET } from './state.js';

const TABLE_COLOR_ROLE_ALIASES = {
  green: 'positive',
  red: 'negative',
};

// ── Width resolution ──────────────────────────────────────────────────────────

/**
 * Resolve a `w` spec against a parent width.
 * @param {number|undefined} w  - fraction (0 < w <= 1) or fixed integer chars, or omitted
 * @param {number} parentWidth  - available width to fill
 * @returns {number}
 */
function resolveWidth(w, parentWidth) {
  if (w == null) return parentWidth;
  if (w > 0 && w <= 1) return Math.max(1, Math.floor(parentWidth * w));
  return Math.max(1, Math.floor(w));
}

// ── Side-by-side helper ───────────────────────────────────────────────────────

/**
 * Merge two ANSI strings horizontally, padding the left column to `leftWidth`.
 *
 * @param {string} leftStr
 * @param {string} rightStr
 * @param {number} leftWidth  - visible width to pad the left column to
 * @param {number} rightWidth - (informational) visible width of right column
 * @param {number} [gap=2]    - spaces between columns
 * @returns {string}
 */
export function sideBySide(leftStr, rightStr, leftWidth, rightWidth, gap = 2) {
  const leftLines = leftStr.split('\n');
  const rightLines = rightStr.split('\n');
  const maxLen = Math.max(leftLines.length, rightLines.length);
  const rows = [];
  for (let i = 0; i < maxLen; i++) {
    let l = leftLines[i] ?? '';
    const r = rightLines[i] ?? '';
    // Truncate left column if it overflows leftWidth
    if (visLen(l) > leftWidth) l = ansiTrunc(l, leftWidth);
    const lPad = Math.max(0, leftWidth - visLen(l));
    rows.push(l + ' '.repeat(lPad + gap) + r);
  }
  return rows.join('\n');
}

// ── Table renderer ────────────────────────────────────────────────────────────

/**
 * Render a table block.
 *
 * @param {{ headers: string[], rows: Array<{ cells: string[], colors?: Object }>, align?: string[] }} spec
 * @param {number} width
 * @returns {string}
 */
function renderTable(spec, width) {
  const { headers = [], rows = [], align = [] } = spec;
  const colCount = Math.max(headers.length, ...rows.map(r => r.cells?.length ?? 0));
  if (colCount === 0) return pc('muted', '— empty table');

  // Calculate raw column widths from max content width
  const colWidths = [];
  for (let c = 0; c < colCount; c++) {
    const headerLen = visLen(String(headers[c] ?? ''));
    const maxCellLen = Math.max(
      headerLen,
      ...rows.map(r => visLen(String(r.cells?.[c] ?? '')))
    );
    colWidths.push(maxCellLen + 2); // +2 padding
  }

  // Narrow the widest column before dropping any.
  //
  // A single verbose cell — one filing title — used to cost the whole column
  // its place, so an events table rendered Date and Type and silently lost
  // every Title. Shrinking the widest column truncates that one cell instead,
  // which loses a few characters rather than a field. Columns are still
  // dropped if the table cannot fit even at the minimum width.
  const MIN_COL = 8;
  let totalWidth = colWidths.reduce((a, b) => a + b, 0);
  while (totalWidth > width) {
    let widest = 0;
    for (let c = 1; c < colCount; c++) if (colWidths[c] > colWidths[widest]) widest = c;
    if (colWidths[widest] <= MIN_COL) break;
    const trim = Math.min(colWidths[widest] - MIN_COL, totalWidth - width);
    colWidths[widest] -= trim;
    totalWidth -= trim;
  }

  // Only now, if it still does not fit, give up the rightmost columns.
  let visibleCols = colCount;
  while (totalWidth > width && visibleCols > 1) {
    totalWidth -= colWidths[visibleCols - 1];
    visibleCols--;
  }

  /**
   * Format a single cell value.
   * @param {string} val
   * @param {number} col
   * @param {string} [role]
   * @returns {string}
   */
  function formatCell(val, col, role) {
    let str = String(val ?? '');
    // A cell that was cut should say so. Silently clipping reads as the whole
    // value, which is the one thing a table of reported figures must not do.
    if (visLen(str) > colWidths[col]) str = ansiTrunc(str, Math.max(1, colWidths[col] - 2)) + '…';
    const autoColored = role ? str : colorTablePercent(str);
    const hasAutoColor = autoColored !== str;
    const w = colWidths[col];
    const a = align[col] ?? 'left';
    let padded;
    if (a === 'right') {
      // Right-aligned cells put all their padding on the left, so the value
      // ended up flush against the next column — "5.25%rates". One column of
      // the cell's own width is kept as a gutter.
      padded = padLeft(autoColored, Math.max(1, w - 1)) + ' ';
    } else if (a === 'center') {
      const vis = visLen(autoColored);
      const leftPad = Math.floor((w - vis) / 2);
      const rightPad = w - vis - leftPad;
      padded = ' '.repeat(Math.max(0, leftPad)) + autoColored + ' '.repeat(Math.max(0, rightPad));
    } else {
      padded = padRight(autoColored, w);
    }
    if (role) return pc(role, padded);
    if (hasAutoColor) return padded;
    return pc('data', padded);
  }

  const lines = [];

  // Header row (dim label color)
  if (headers.length > 0) {
    const headerCells = [];
    for (let c = 0; c < visibleCols; c++) {
      headerCells.push(pc('label', formatCell(headers[c] ?? '', c)));
    }
    lines.push(headerCells.join(''));
  }

  // Data rows
  for (const row of rows) {
    const cells = [];
    for (let c = 0; c < visibleCols; c++) {
      const val = row.cells?.[c] ?? '';
      const rawRole = row.colors?.[String(c)] ?? null;
      const role = typeof rawRole === 'string'
        ? (TABLE_COLOR_ROLE_ALIASES[rawRole.trim().toLowerCase()] ?? rawRole)
        : rawRole;
      cells.push(formatCell(val, c, role));
    }
    lines.push(cells.join(''));
  }

  return lines.join('\n');
}

// ── Row renderer ──────────────────────────────────────────────────────────────

/**
 * Render a row block — children side by side.
 *
 * @param {Array} children   - Array of child block specs
 * @param {number} width     - Total available width
 * @param {number} [gap=2]   - Gap between children
 * @returns {string}
 */
function renderRow(children, width, gap = 2) {
  if (!children?.length) return '';

  // Width-aware: stack vertically if each child would get fewer than 25 cols
  const hasExplicitWidths = children.some(child => child.w != null);
  const colsPerChild = Math.floor((width - 2 * Math.max(0, children.length - 1)) / children.length);
  if (!hasExplicitWidths && colsPerChild < 25) {
    return children.map(child => renderBlock(child, width)).join('\n');
  }

  const totalGap = gap * Math.max(0, children.length - 1);
  const availableWidth = width - totalGap;

  // First pass: calculate explicit widths and count auto-width children
  const childWidths = children.map(child => {
    if (child.w != null) return resolveWidth(child.w, availableWidth);
    return null; // auto
  });

  const explicitTotal = childWidths.reduce((sum, w) => sum + (w ?? 0), 0);
  const autoCount = childWidths.filter(w => w == null).length;
  const autoWidth = autoCount > 0
    ? Math.max(1, Math.floor((availableWidth - explicitTotal) / autoCount))
    : 0;

  const resolvedWidths = childWidths.map(w => w ?? autoWidth);

  // Render each child at its resolved width.
  // Strip `w` from children — the row already resolved it. Passing it through
  // would cause renderBlock to apply the fraction a second time.
  const rendered = children.map((child, i) => {
    const { w: _w, ...childWithoutW } = child;
    return renderBlock(childWithoutW, resolvedWidths[i]);
  });

  // Align content below the longest summary/annotation prefix.
  // Summary lines start with '┄' (from renderSummary). Count leading summary
  // lines in each child, then pad shorter children so content starts at the
  // same vertical position.
  const summaryLineCounts = rendered.map(str => {
    const lines = str.split('\n');
    let count = 0;
    for (const line of lines) {
      if (strip(line).startsWith('┄')) count++;
      else break;
    }
    return count;
  });
  const maxSummaryLines = Math.max(...summaryLineCounts);
  if (maxSummaryLines > 0) {
    for (let i = 0; i < rendered.length; i++) {
      const pad = maxSummaryLines - summaryLineCounts[i];
      if (pad > 0) {
        rendered[i] = '\n'.repeat(pad) + rendered[i];
      }
    }
  }

  // Merge horizontally, left to right.
  //
  // The accumulated block grows with every fold, so the left width has to grow
  // with it. Passing the previous *column's* width truncated everything
  // already merged down to that column — a three-column row silently lost its
  // middle child, and no error said so.
  let result = rendered[0];
  let leftWidth = resolvedWidths[0];
  for (let i = 1; i < rendered.length; i++) {
    result = sideBySide(result, rendered[i], leftWidth, resolvedWidths[i], gap);
    leftWidth += gap + resolvedWidths[i];
  }
  return result;
}

// ── Block dispatcher ──────────────────────────────────────────────────────────

/**
 * Render a single block spec.
 *
 * @param {Object} block  - Block spec
 * @param {number} width  - Available width for this block
 * @returns {string}
 */
// Panel names supported as shorthand block keys: { quote: {...} } → { panel: 'quote', data: {...} }
// (imported as PANEL_NAMES_SET from state.js)

export function renderBlock(block, width) {
  if (!block || typeof block !== 'object') return '';

  // panel block — explicit form: { panel: 'quote', data: {...} }
  if (block.panel != null) {
    const blockWidth = resolveWidth(block.w, width);
    return renderPanel(block.panel, block.data ?? null, blockWidth);
  }

  // shorthand form: { quote: {...} } → renderPanel('quote', {...}, width)
  for (const key of PANEL_NAMES_SET) {
    if (block[key] != null) {
      return renderPanel(key, block[key], resolveWidth(block.w, width));
    }
  }

  // table block
  if (block.table != null) {
    return renderTable(block.table, width);
  }

  // row block (side-by-side)
  if (Array.isArray(block.row)) {
    return renderRow(block.row, width, block.gap ?? 2);
  }

  // stack block (vertical stack — like renderBlocks but for a sub-group)
  if (Array.isArray(block.stack)) {
    return block.stack.map(child => renderBlock(child, width)).join('\n');
  }

  // divider block
  if (block.divider != null) {
    return boxDivider(width, String(block.divider));
  }

  // text block — auto-color header pattern
  if (block.text != null) {
    const t = String(block.text);
    if (t.startsWith('▐██')) return pc('accent', t);
    return t;
  }

  // spacer block
  if (block.spacer != null) {
    const n = Math.max(0, Number(block.spacer) || 0);
    return n === 0 ? '' : '\n'.repeat(n - 1);
  }

  return '';
}

// ── Main entry ────────────────────────────────────────────────────────────────

/**
 * Render an array of block specs to an ANSI string.
 *
 * @param {Array}  blocks - Array of block specs
 * @param {number} [width=80] - Terminal width
 * @returns {string} Multi-line ANSI string
 */
export function renderBlocks(blocks, width = 80) {
  if (!Array.isArray(blocks) || blocks.length === 0) return '';
  return blocks.map(block => renderBlock(block, width)).join('\n');
}

// ── Backward compat: preset → blocks ─────────────────────────────────────────

/**
 * Convert a legacy { layout, panels } payload into a blocks array.
 *
 * Supported layouts: "deep-dive", "compare", "macro", "pulse"
 *
 * @param {string} layout  - Layout name
 * @param {Object} panels  - Panel data map
 * @returns {Array}        - Blocks array suitable for renderBlocks()
 */
export function presetToBlocks(layout, panels) {
  switch (layout) {
    case 'deep-dive':
      return deepDiveBlocks(panels);
    case 'compare':
      return compareBlocks(panels);
    case 'macro':
      return macroBlocks(panels);
    case 'pulse':
      return pulseBlocks(panels);
    default:
      return [{ text: pc('muted', `Unknown layout: ${layout}`) }];
  }
}

// ── deep-dive preset ──────────────────────────────────────────────────────────

function deepDiveBlocks(panels) {
  const toolCount = Object.values(panels).filter(v => v != null && !v._error).length;
  const sources = buildSourceList(panels);
  const footerText = pc('muted', `Marked · ${sources} · ${toolCount} data calls`);

  return [
    { panel: 'quote', data: panels.quote ?? null },
    { spacer: 1 },
    { row: [
      { panel: 'chart', data: panels.chart ?? null, w: 0.7 },
      { panel: 'technical', data: panels.technical ?? null, w: 0.3 },
    ]},
    { spacer: 1 },
    { divider: 'ANALYST' },
    { panel: 'analyst', data: panels.analyst ?? null },
    { spacer: 1 },
    { divider: 'NEWS' },
    { panel: 'news', data: panels.news ?? null },
    { spacer: 1 },
    ...(panels.verdict !== undefined ? [
      { divider: 'VERDICT' },
      { panel: 'verdict', data: panels.verdict ?? null },
      { spacer: 1 },
    ] : []),
    { text: footerText },
  ];
}

// ── compare preset ────────────────────────────────────────────────────────────

function compareBlocks(panels) {
  // Determine tickers list (same logic as compare.js)
  let tickers = [];
  if (Array.isArray(panels.tickers)) {
    tickers = panels.tickers.slice(0, 5);
  } else {
    const metaKeys = new Set(['_timestamp', '_error', 'focused']);
    tickers = Object.keys(panels).filter(k => !metaKeys.has(k)).slice(0, 5);
  }

  if (tickers.length === 0) {
    return [{ text: pc('muted', '  No tickers to compare.') }];
  }

  // Build per-ticker panel data (support nested or flat key shapes)
  function tickerPanels(t) {
    if (panels[t] && typeof panels[t] === 'object' && !Array.isArray(panels[t])) {
      return panels[t];
    }
    // Flat keys: NVDA_quote → { quote: ... }
    const sub = {};
    for (const key of Object.keys(panels)) {
      if (key.startsWith(`${t}_`)) {
        sub[key.slice(t.length + 1)] = panels[key];
      }
    }
    return Object.keys(sub).length > 0 ? sub : {};
  }

  // Each ticker column is a vertical stack (quote → chart → analyst)
  // rendered via a special "stack" pseudo-block, then placed side-by-side
  const rowChildren = tickers.map(t => {
    const td = tickerPanels(t);
    return {
      stack: [
        { panel: 'quote', data: { ...(td.quote ?? {}), variant: 'compact' } },
        { panel: 'chart', data: td.chart ?? null },
        { panel: 'analyst', data: td.analyst ?? null },
      ],
    };
  });

  return [{ row: rowChildren }];
}

// ── macro preset ──────────────────────────────────────────────────────────────

function macroBlocks(panels) {
  return [
    { panel: 'macro', data: panels.macro ?? null },
    { spacer: 1 },
    { row: [
      { panel: 'chart', data: panels.inflation ?? null, w: 0.5 },
      { panel: 'chart', data: panels.rates ?? null, w: 0.5 },
    ]},
    { row: [
      { panel: 'chart', data: panels.labor ?? null, w: 0.5 },
      { panel: 'chart', data: panels.growth ?? null, w: 0.5 },
    ]},
  ];
}

// ── pulse preset ──────────────────────────────────────────────────────────────

function pulseBlocks(panels) {
  return [
    { panel: 'quote', data: panels.quote ?? null },
    { panel: 'news', data: panels.news ?? null },
  ];
}

// ── Footer helpers (shared with presets) ──────────────────────────────────────

function buildSourceList(panels) {
  const sources = new Set();
  if (panels.quote || panels.chart || panels.analyst || panels.technical || panels.filings || panels.insider || panels.holders) sources.add('Marked');
  if (panels.macro) sources.add('India macro provider');
  if (panels.news) sources.add('external news');
  return [...sources].join(' + ') || 'Marked';
}
