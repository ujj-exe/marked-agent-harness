/**
 * Verdict — styled analysis/verdict panel.
 *
 * Renders a structured panel with:
 * - thesis (bold text block)
 * - signal (BUY/SELL/HOLD with color)
 * - key levels (support / resistance)
 * - risk factors (bulleted list)
 *
 * Pure function: (opts) → ANSI string (multi-line)
 *
 * v1.1: Section-based rendering via opts.sections[].
 * When opts.sections exists, iterate sections in order and render each type.
 * Falls back to flat field rendering for backwards compatibility.
 */
import { c, pc, BOLD, DIM, RESET, padRight, padLeft, visLen, strip, boxTop, boxBot, boxRow, boxDivider, boxEmpty, wordWrap } from '../ansi.js';
import { palette } from '../themes.js';
import { coloredSignal, convictionBadge } from '../formatters.js';
import { renderMarkdownInline } from '../markdown.js';

// ── Section renderers (boxed mode) ───────────────────────────────────────────

/**
 * Render a single section into boxed rows.
 * Returns an array of line strings (already ANSI-colored).
 */
function renderSectionBoxed(section, width) {
  const lines = [];

  switch (section.type) {
    case 'conviction':
      // conviction is rendered in the box header — nothing extra in body
      break;

    case 'memory': {
      // dim ┄ row: prior conviction state
      const { prior, changed } = section;
      const note = changed ? ' · conviction changed' : ' — conviction held';
      lines.push(boxRow(`${DIM}┄ ${prior || ''}${note}${RESET}`, width));
      break;
    }

    case 'thesis': {
      const { text } = section;
      if (!text) break;
      lines.push(boxEmpty(width));
      const innerW = width - 4;
      for (const tl of wordWrap(text, innerW)) {
        lines.push(boxRow(c(palette('data'), BOLD + renderMarkdownInline(tl) + RESET), width));
      }
      break;
    }

    case 'catalysts': {
      const { items } = section;
      if (!Array.isArray(items) || items.length === 0) break;
      lines.push(boxEmpty(width));
      lines.push(boxDivider(width, 'CATALYSTS'));
      for (const catalyst of items) {
        const catalystLine = pc('positive', '✦ ') + pc('data', String(catalyst));
        lines.push(boxRow(catalystLine, width));
      }
      break;
    }

    case 'risks': {
      const { items } = section;
      if (!Array.isArray(items) || items.length === 0) break;
      lines.push(boxEmpty(width));
      lines.push(boxDivider(width, 'RISK FACTORS'));
      for (const risk of items) {
        const riskLine = pc('warning', '⚠ ') + pc('data', String(risk));
        lines.push(boxRow(riskLine, width));
      }
      break;
    }

    case 'levels': {
      const { support, resistance, timeframe } = section;
      const hasLevels = support != null || resistance != null;
      if (!hasLevels && !timeframe) break;
      lines.push(boxEmpty(width));
      lines.push(boxDivider(width, 'KEY LEVELS'));
      if (timeframe) {
        const tfVal = c(palette('highlight'), String(timeframe));
        lines.push(boxRow(pc('label', 'Timeframe:  ') + tfVal, width));
      }
      if (support != null) {
        const val = c(palette('highlight'), String(support));
        lines.push(boxRow(pc('label', 'Support:    ') + val, width));
      }
      if (resistance != null) {
        const val = c(palette('highlight'), String(resistance));
        lines.push(boxRow(pc('label', 'Resistance: ') + val, width));
      }
      break;
    }

    case 'context': {
      const { text } = section;
      if (!text) break;
      lines.push(boxEmpty(width));
      lines.push(boxDivider(width, 'CONTEXT'));
      const innerW = width - 4;
      for (const tl of wordWrap(text, innerW)) {
        lines.push(boxRow(pc('muted', renderMarkdownInline(tl)), width));
      }
      break;
    }

    case 'comparison': {
      const { text } = section;
      if (!text) break;
      lines.push(boxEmpty(width));
      lines.push(boxDivider(width, 'COMPARISON'));
      const innerW = width - 4;
      for (const tl of wordWrap(text, innerW)) {
        lines.push(boxRow(pc('data', renderMarkdownInline(tl)), width));
      }
      break;
    }

    case 'invalidation': {
      const { text } = section;
      if (!text) break;
      lines.push(boxEmpty(width));
      lines.push(boxDivider(width, 'INVALIDATION'));
      const innerW = width - 4;
      for (const tl of wordWrap(text, innerW)) {
        lines.push(boxRow(`${DIM}${pc('data', renderMarkdownInline(tl))}${RESET}`, width));
      }
      break;
    }

    default:
      break;
  }

  return lines;
}

/**
 * Render a verdict/analysis panel (boxed mode).
 *
 * @param {Object} opts
 * @param {Array}  [opts.sections] - Section array (v1.1 sections API)
 * @param {string} [opts.thesis] - Main thesis text (bold) — flat mode
 * @param {string} [opts.conviction] - Conviction level — flat mode
 * @param {string} [opts.signal] - Legacy signal string
 * @param {string[]} [opts.catalysts] - Catalyst strings — flat mode
 * @param {{support?: number|string, resistance?: number|string}} [opts.levels] - Key levels — flat mode
 * @param {string} [opts.timeframe] - Timeframe — flat mode
 * @param {string[]} [opts.risks] - Risk factors — flat mode
 * @param {string[]} [opts.warnings] - Schema warn-gate messages to render inline
 * @param {number} [opts.width=60] - Total panel width
 * @returns {string} Multi-line ANSI string
 */
export function verdict(opts) {
  const {
    sections,
    thesis,
    conviction,
    signal,
    catalysts = [],
    levels = {},
    timeframe,
    risks = [],
    warnings = [],
    width = 60,
  } = opts;

  const lines = [];

  // ── Sections-based rendering (v1.1) ─────────────────────────────────────
  if (Array.isArray(sections)) {
    // Find conviction section for the header badge
    const convictionSection = sections.find(s => s.type === 'conviction');
    const badge = convictionSection ? convictionBadge(convictionSection.value) : '';
    const headerTitle = badge ? `VERDICT ── ${badge}` : 'VERDICT';
    lines.push(boxTop(width, headerTitle, 2));

    // Render each section in order (skipping conviction — it's in the header)
    for (const section of sections) {
      if (section.type === 'conviction') continue;
      const sectionLines = renderSectionBoxed(section, width);
      for (const l of sectionLines) lines.push(l);
    }

    // Warn-gate messages
    if (warnings.length > 0) {
      lines.push(boxEmpty(width));
      for (const warnMsg of warnings) {
        lines.push(boxRow(pc('warning', warnMsg), width));
      }
    }

    lines.push(boxEmpty(width));
    lines.push(boxBot(width, '', 2));
    return lines.join('\n');
  }

  // ── Flat field rendering (backwards compat) ──────────────────────────────

  // Top border — embed conviction badge when present
  const badge = conviction ? convictionBadge(conviction) : '';
  const headerTitle = badge ? `VERDICT ── ${badge}` : 'VERDICT';
  lines.push(boxTop(width, headerTitle, 2));

  // Thesis section
  if (thesis) {
    lines.push(boxEmpty(width));
    const innerW = width - 4;
    for (const tl of wordWrap(thesis, innerW)) {
      lines.push(boxRow(c(palette('data'), BOLD + renderMarkdownInline(tl) + RESET), width));
    }
  }

  // Legacy signal section (only if no conviction — schema should have coerced signal→conviction)
  if (!conviction && signal) {
    lines.push(boxEmpty(width));
    lines.push(boxDivider(width, 'SIGNAL'));
    const sigStr = pc('label', 'Recommendation: ') + coloredSignal(signal);
    lines.push(boxRow(sigStr, width));
  }

  // Catalysts section
  if (catalysts.length > 0) {
    lines.push(boxEmpty(width));
    lines.push(boxDivider(width, 'CATALYSTS'));
    for (const catalyst of catalysts) {
      const catalystLine = pc('positive', '✦ ') + pc('data', String(catalyst));
      lines.push(boxRow(catalystLine, width));
    }
  }

  // Key levels section
  const hasLevels = levels.support != null || levels.resistance != null;
  if (hasLevels || timeframe) {
    lines.push(boxEmpty(width));
    lines.push(boxDivider(width, 'KEY LEVELS'));
    if (timeframe) {
      const tfVal = c(palette('highlight'), String(timeframe));
      lines.push(boxRow(pc('label', 'Timeframe:  ') + tfVal, width));
    }
    if (levels.support != null) {
      const val = c(palette('highlight'), String(levels.support));
      lines.push(boxRow(pc('label', 'Support:    ') + val, width));
    }
    if (levels.resistance != null) {
      const val = c(palette('highlight'), String(levels.resistance));
      lines.push(boxRow(pc('label', 'Resistance: ') + val, width));
    }
  }

  // Risk factors section
  if (risks.length > 0) {
    lines.push(boxEmpty(width));
    lines.push(boxDivider(width, 'RISK FACTORS'));
    for (const risk of risks) {
      const riskLine = pc('warning', '⚠ ') + pc('data', String(risk));
      lines.push(boxRow(riskLine, width));
    }
  }

  // Warn-gate messages (inline ⚠ dim lines — never hard-blocks render)
  if (warnings.length > 0) {
    lines.push(boxEmpty(width));
    for (const warnMsg of warnings) {
      lines.push(boxRow(pc('warning', warnMsg), width));
    }
  }

  lines.push(boxEmpty(width));
  lines.push(boxBot(width, '', 2));

  return lines.join('\n');
}
