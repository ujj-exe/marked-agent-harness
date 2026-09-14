/**
 * MacroDashboard — 5-pillar macro regime display with inline gauges.
 *
 * Renders a multi-line panel showing macro regime pillars (Inflation, Rates,
 * Labor, Growth, Credit) each with a gauge bar, current value, direction arrow,
 * and optional sub-indicators.
 *
 * Pure function: (opts) → ANSI string
 */
import { c, pc, padRight, padLeft, visLen } from '../ansi.js';
import { palette } from '../themes.js';
import { trendArrow } from '../formatters.js';
import { gaugeBar } from './GaugeBar.js';

// Direction arrow colors
function directionArrow(direction) {
  return trendArrow(direction);
}

// Map pillar value (0-100) to a gauge color role
function pillarColorRole(value) {
  if (value == null) return 'muted';
  const v = Number(value);
  if (v >= 70) return 'negative';
  if (v >= 40) return 'warning';
  return 'positive';
}

/**
 * Render a single macro pillar row.
 *
 * @param {Object} pillar
 * @param {string} pillar.label     - Pillar name (e.g. "Inflation")
 * @param {number} pillar.value     - 0-100 gauge value
 * @param {string} pillar.direction - "rising"|"falling"|"neutral" etc.
 * @param {Array}  pillar.indicators - [{name, value, direction}]
 * @param {number} labelWidth       - Fixed width for the label column
 * @param {number} gaugeWidth       - Width of the gauge bar
 * @param {number} totalWidth       - Total row width
 * @returns {string[]} Lines for this pillar
 */
function renderPillar(pillar, labelWidth, gaugeWidth, totalWidth, valueColWidth) {
  const { label = '', value, direction = 'neutral', indicators = [], stateLabel } = pillar;

  const colorRole = pillarColorRole(value);
  const colorHex = palette(colorRole);

  // Label column — fixed width, accent-colored
  const labelStr = padRight(pc('label', label), labelWidth);

  // Gauge bar
  const bar = gaugeBar({
    value: value ?? 0,
    preset: 'percent',
    width: gaugeWidth,
    showValue: false,
    showLabel: false,
  });

  // Value display — show stateLabel text if present, else numeric
  const vColW = valueColWidth || 4;
  const valStr = stateLabel
    ? padLeft(c(colorHex || palette('data'), stateLabel), vColW)
    : value != null
      ? padLeft(c(colorHex || palette('data'), `${Math.round(value)}`), vColW)
      : padLeft(pc('muted', '—'), vColW);

  // Direction arrow
  const arrow = directionArrow(direction);

  // Main row
  const mainRow = labelStr + ' ' + bar + valStr + ' ' + arrow;

  const lines = [mainRow];

  // Sub-indicators — indented, compact
  if (indicators && indicators.length > 0) {
    const indent = ' '.repeat(labelWidth + 1);
    const parts = indicators.map(ind => {
      const indName = pc('muted', ind.name);
      const indVal = ind.value != null
        ? pc('data', String(ind.value))
        : pc('muted', '—');
      const indArrow = ind.direction ? ' ' + directionArrow(ind.direction) : '';
      return `${indName}:${indVal}${indArrow}`;
    });
    // Fit as many per line as possible
    const subRow = indent + parts.join(pc('muted', '  '));
    lines.push(subRow);
  }

  return lines;
}

/**
 * Render the macro dashboard in plain (borderless) variant.
 *
 * @param {Array}  pillars - Pillar objects array
 * @param {number} width   - Total display width
 * @param {string} title   - Panel title
 * @returns {string} Multi-line ANSI string without box borders
 */
function renderPlainMacro(pillars, width, title) {
  if (!pillars || pillars.length === 0) {
    return pc('muted', '(no macro data)');
  }

  const lines = [];
  const BAR_W = 12;

  // Dynamic label width: fit the longest pillar name
  const maxLabelLen = Math.max(8, ...pillars.map(p => (p.label || '').length));
  const labelW = Math.min(maxLabelLen, Math.floor(width * 0.3));

  // Dynamic state column width: fit the longest state label
  const maxStateLen = Math.max(4, ...pillars.map(p => (p.stateLabel || '—').length));
  const stateW = maxStateLen + 1;

  // Compact one-line-per-pillar — delegate bar rendering to gaugeBar
  for (const p of pillars) {
    const label = padRight(pc('label', p.label || ''), labelW);
    const val = Math.max(0, Math.min(100, p.value ?? 50));
    const colorRole = pillarColorRole(val);
    const barColor = palette(colorRole);
    const bar = gaugeBar({
      value: val,
      preset: 'percent',
      width: BAR_W,
      showValue: false,
      showLabel: false,
    });
    const state = p.stateLabel || '—';
    const dir = p.direction || '';
    const arrow = directionArrow(dir);
    const stateStr = padRight(c(barColor, state), stateW);
    lines.push(`${label}${bar}  ${stateStr}${arrow}`);
  }

  return lines.join('\n');
}

/**
 * Render the macro dashboard.
 *
 * @param {Object} opts
 * @param {Array}  opts.pillars - Array of pillar objects:
 *   { label, value, direction, indicators: [{name, value, direction}] }
 * @param {number} [opts.width=80]   - Total display width
 * @param {string} [opts.title]      - Optional panel title
 * @param {string} [opts.variant]    - 'plain' for borderless, default for boxed
 * @returns {string} Multi-line ANSI string
 */
export function macroDashboard(opts = {}) {
  const {
    pillars = [],
    width = 80,
    title = 'MACRO REGIME',
    variant,
  } = opts;

  if (variant === 'plain') return renderPlainMacro(pillars, width, title);

  if (!pillars || pillars.length === 0) {
    return pc('muted', '(no macro data)');
  }

  // Layout constants — dynamic label width from actual data
  const LABEL_WIDTH = Math.min(
    Math.max(12, ...pillars.map(p => (p.label || '').length)),
    Math.floor(width * 0.3),
  );
  const ARROW_WIDTH = 2; // space + arrow char
  // Inner width: total - 2 borders - 2 spaces = width - 4
  const innerWidth = width - 4;
  // Compute value column width from longest stateLabel
  const maxLabel = pillars.reduce((max, p) => Math.max(max, (p.stateLabel || '').length), 0);
  const VALUE_WIDTH = Math.max(4, maxLabel + 1);
  const gaugeWidth = Math.max(4, innerWidth - LABEL_WIDTH - 1 - VALUE_WIDTH - 1 - ARROW_WIDTH);

  const ac = palette('accent');
  const lines = [];

  // Top border with title
  const titleStr = title ? ` ${title} ` : '';
  const topFill = width - 3 - titleStr.length;
  const topLine = c(ac, '╭─') + c(ac, titleStr) + c(ac, '─'.repeat(Math.max(0, topFill)) + '╮');
  lines.push(topLine);

  // Render each pillar
  pillars.forEach((pillar, i) => {
    const pillarLines = renderPillar(pillar, LABEL_WIDTH, gaugeWidth, innerWidth, VALUE_WIDTH);

    pillarLines.forEach(row => {
      // Box row: border + space + content + padding + space + border
      const vl = visLen(row);
      const pad = Math.max(0, innerWidth - vl);
      lines.push(c(ac, '│') + ' ' + row + ' '.repeat(pad) + ' ' + c(ac, '│'));
    });

    // Divider between pillars (not after last)
    if (i < pillars.length - 1) {
      lines.push(c(ac, '├' + '─'.repeat(width - 2) + '┤'));
    }
  });

  // Bottom border
  lines.push(c(ac, '╰' + '─'.repeat(width - 2) + '╯'));

  return lines.join('\n');
}
