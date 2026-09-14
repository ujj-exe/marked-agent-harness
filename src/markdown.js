/**
 * Markdown → ANSI renderer for terminal verdict and text panels.
 *
 * Supports:
 *   # heading     → lime/accent bold
 *   **bold**      → bold
 *   *italic*      → dim
 *   `code`        → highlight color
 *   - item        → ✦ bulleted
 *   > quote       → label color + ▌ bar
 *
 * Two modes:
 *   renderMarkdownInline(text)  — inline only (**bold**, *italic*, `code`)
 *   renderMarkdownBlock(text)   — full block + inline (headings, lists, quotes)
 *
 * Pure functions, theme-aware via palette().
 */
import { c, pc, BOLD, DIM, RESET } from './ansi.js';
import { tablePercentColor } from './formatters.js';
import { palette } from './themes.js';

function renderMarkdownTableLine(line) {
  const cells = line.split('|');
  if (cells.length < 3) return renderMarkdownInline(line);

  return cells.map((cell, index) => {
    if (index === 0 || index === cells.length - 1) return cell;

    const leading = cell.match(/^\s*/)?.[0] ?? '';
    const trailing = cell.match(/\s*$/)?.[0] ?? '';
    const inner = cell.slice(leading.length, cell.length - trailing.length);
    const rendered = renderMarkdownInline(inner);
    const hex = tablePercentColor(inner);

    return `${leading}${hex ? c(hex, rendered) : rendered}${trailing}`;
  }).join('|');
}

// ── Inline markdown ─────────────────────────────────────────────────────────

/**
 * Render inline markdown elements within a single line of text.
 * Handles: **bold**, *italic*, `code`
 * Order matters: bold before italic to avoid ** being parsed as two *'s.
 *
 * @param {string} text - Raw text with inline markdown
 * @returns {string} ANSI-colored string
 */
export function renderMarkdownInline(text) {
  let s = String(text);

  // **bold** → ANSI bold
  s = s.replace(/\*\*(.+?)\*\*/g, `${BOLD}$1${RESET}`);

  // *italic* → dim (but not ** which was already consumed)
  s = s.replace(/(?<!\*)\*([^*]+?)\*(?!\*)/g, `${DIM}$1${RESET}`);

  // `code` → highlight color
  s = s.replace(/`([^`]+?)`/g, (_, code) => c(palette('highlight'), code));

  return s;
}

// ── Block markdown ──────────────────────────────────────────────────────────

/**
 * Render a multi-line markdown string into ANSI-colored terminal output.
 * Handles block-level elements (headings, lists, blockquotes) plus inline.
 *
 * @param {string} text - Multi-line markdown text
 * @returns {string} ANSI-colored multi-line string
 */
export function renderMarkdownBlock(text) {
  const lines = String(text).split('\n');
  const result = [];

  for (const raw of lines) {
    const line = raw.trimEnd();

    // ## heading or # heading → accent bold
    const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
    if (headingMatch) {
      const content = renderMarkdownInline(headingMatch[2]);
      result.push(c(palette('accent'), `${BOLD}${content}${RESET}`));
      continue;
    }

    // > blockquote → label color + ▌ bar
    const quoteMatch = line.match(/^>\s?(.*)$/);
    if (quoteMatch) {
      const content = renderMarkdownInline(quoteMatch[1]);
      result.push(c(palette('label'), '▌ ') + content);
      continue;
    }

    // - item or * item → ✦ bulleted
    const listMatch = line.match(/^(\s*)[-*]\s+(.+)$/);
    if (listMatch) {
      const indent = listMatch[1];
      const content = renderMarkdownInline(listMatch[2]);
      result.push(`${indent}${pc('accent', '✦')} ${content}`);
      continue;
    }

    // --- or ___ → horizontal rule (dim line)
    if (/^[-_*]{3,}\s*$/.test(line)) {
      result.push(pc('muted', '─'.repeat(40)));
      continue;
    }

    // Markdown pipe table row → preserve pipes/cell spacing, color only signed % cells
    if (/^\|(?:[^|\n]*\|){2,}\s*$/.test(line)) {
      result.push(renderMarkdownTableLine(line));
      continue;
    }

    // Empty line → preserve
    if (line.trim() === '') {
      result.push('');
      continue;
    }

    // Regular line → inline rendering only
    result.push(renderMarkdownInline(line));
  }

  return result.join('\n');
}
