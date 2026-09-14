/**
 * GaugeBar — block-element gauge for RSI, sentiment, confidence values.
 *
 * Renders: ◼◼◼◼◼◼◻◻◻◻  37.8  OVERSOLD
 *
 * Supports:
 * - Configurable thresholds with color zones
 * - Labels and value display
 * - Marker for current value position
 * - Multiple gauge presets (RSI, sentiment, confidence)
 *
 * Pure function: (data, options) → string (ANSI-colored)
 */
import { c, pc, BOLD, RESET, padRight, padLeft, visLen } from '../ansi.js';
import { palette } from '../themes.js';

const BLOCK_FULL = '█';
const BLOCK_EMPTY = '░';

// Preset threshold configurations
const PRESETS = {
  rsi: {
    min: 0,
    max: 100,
    zones: [
      { from: 0, to: 30, role: 'positive', label: 'OVERSOLD' },
      { from: 30, to: 70, role: 'data', label: '' },
      { from: 70, to: 100, role: 'negative', label: 'OVERBOUGHT' },
    ],
  },
  sentiment: {
    min: -1,
    max: 1,
    zones: [
      { from: -1, to: -0.3, role: 'negative', label: 'BEARISH' },
      { from: -0.3, to: 0.3, role: 'warning', label: 'NEUTRAL' },
      { from: 0.3, to: 1, role: 'positive', label: 'BULLISH' },
    ],
  },
  confidence: {
    min: 0,
    max: 100,
    zones: [
      { from: 0, to: 33, role: 'negative', label: 'LOW' },
      { from: 33, to: 66, role: 'warning', label: 'MEDIUM' },
      { from: 66, to: 100, role: 'positive', label: 'HIGH' },
    ],
  },
  percent: {
    min: 0,
    max: 100,
    zones: [
      { from: 0, to: 100, role: 'accent', label: '' },
    ],
  },
  macro: {
    min: 0,
    max: 8,
    zones: [
      { from: 0, to: 2, role: 'positive', label: '' },
      { from: 2, to: 4, role: 'warning', label: '' },
      { from: 4, to: 8, role: 'negative', label: '' },
    ],
  },
  fear_greed: {
    min: 0,
    max: 100,
    zones: [
      { from: 0, to: 25, role: 'negative', label: 'EXTREME FEAR' },
      { from: 25, to: 45, role: 'negative', label: 'FEAR' },
      { from: 45, to: 55, role: 'warning', label: 'NEUTRAL' },
      { from: 55, to: 75, role: 'positive', label: 'GREED' },
      { from: 75, to: 100, role: 'positive', label: 'EXTREME GREED' },
    ],
  },
  pe_ratio: {
    min: 0,
    max: 50,
    zones: [
      { from: 0, to: 15, role: 'positive', label: 'VALUE' },
      { from: 15, to: 25, role: 'data', label: 'FAIR' },
      { from: 25, to: 35, role: 'warning', label: 'GROWTH' },
      { from: 35, to: 50, role: 'negative', label: 'EXPENSIVE' },
    ],
  },
  short_interest: {
    min: 0,
    max: 100,
    zones: [
      { from: 0, to: 5, role: 'data', label: '' },
      { from: 5, to: 15, role: 'warning', label: 'ELEVATED' },
      { from: 15, to: 30, role: 'negative', label: 'HIGH' },
      { from: 30, to: 100, role: 'negative', label: 'SQUEEZE RISK' },
    ],
  },
  volatility: {
    min: 0,
    max: 80,
    zones: [
      { from: 0, to: 15, role: 'positive', label: 'LOW' },
      { from: 15, to: 25, role: 'data', label: '' },
      { from: 25, to: 35, role: 'warning', label: 'ELEVATED' },
      { from: 35, to: 80, role: 'negative', label: 'HIGH' },
    ],
  },
  vix: {
    min: 0,
    max: 80,
    zones: [
      { from: 0, to: 15, role: 'positive', label: 'CALM' },
      { from: 15, to: 25, role: 'data', label: '' },
      { from: 25, to: 35, role: 'warning', label: 'ELEVATED' },
      { from: 35, to: 50, role: 'negative', label: 'FEAR' },
      { from: 50, to: 80, role: 'negative', label: 'EXTREME FEAR' },
    ],
  },
};

/**
 * Render a gauge bar.
 *
 * @param {Object} opts
 * @param {number} opts.value - Current value
 * @param {string} [opts.label] - Label text (e.g., "RSI(14)")
 * @param {string} [opts.preset='percent'] - Preset name: rsi, sentiment, confidence, percent
 * @param {number} [opts.width=20] - Bar width in characters
 * @param {number} [opts.min] - Override preset min
 * @param {number} [opts.max] - Override preset max
 * @param {Array} [opts.zones] - Override preset zones
 * @param {boolean} [opts.showValue=true] - Show numeric value
 * @param {boolean} [opts.showLabel=true] - Show zone label
 * @param {string} [opts.valueFormat] - Value format (default auto from preset)
 * @returns {string} Single-line ANSI string
 */
export function gaugeBar(opts) {
  const {
    value,
    label,
    preset = 'percent',
    width = 20,
    showValue = true,
    showLabel = true,
    valueFormat,
  } = opts;

  if (value == null) return pc('muted', '—');

  const config = PRESETS[preset] || PRESETS.percent;
  const min = opts.min ?? config.min;
  const max = opts.max ?? config.max;
  const zones = opts.zones ?? config.zones;

  const v = Number(value);
  const ratio = Math.max(0, Math.min(1, (v - min) / (max - min || 1)));
  const filled = Math.round(ratio * width);

  // Determine which zone the value falls in
  const zone = zones.find(z => v >= z.from && v < z.to) || zones[zones.length - 1];
  const barColor = palette(zone.role);

  // Build the bar
  let bar = '';
  for (let i = 0; i < width; i++) {
    if (i < filled) {
      bar += c(barColor, BLOCK_FULL);
    } else {
      bar += pc('muted', BLOCK_EMPTY);
    }
  }

  // Assemble parts
  const parts = [];
  if (label) {
    parts.push(pc('label', label));
  }
  parts.push(bar);
  if (showValue) {
    const formatted = valueFormat
      ? valueFormat.replace('{v}', v)
      : formatValue(v, preset);
    parts.push(c(barColor, formatted));
  }
  if (showLabel && zone.label) {
    parts.push(c(barColor, zone.label));
  }

  return parts.join('  ');
}

/**
 * Render multiple gauges stacked vertically (for macro dashboard).
 *
 * @param {Array<Object>} gauges - Array of gauge configs
 * @param {number} [labelWidth=12] - Width for labels column
 * @returns {string} Multi-line ANSI string
 */
export function gaugeStack(gauges, labelWidth) {
  // Dynamic label width: fit the longest label
  const lw = labelWidth ?? Math.max(12, ...gauges.map(g => (g.label || '').length));
  return gauges
    .map(g => {
      const lbl = g.label ? padRight(pc('label', g.label), lw) : '';
      const bar = gaugeBar({ ...g, label: undefined });
      return lbl + bar;
    })
    .join('\n');
}

function formatValue(v, preset) {
  switch (preset) {
    case 'rsi': return v.toFixed(1);
    case 'sentiment': return v >= 0 ? `+${v.toFixed(2)}` : v.toFixed(2);
    case 'confidence': return `${Math.round(v)}%`;
    case 'percent': return `${Math.round(v)}%`;
    case 'macro': return `${v.toFixed(2)}%`;
    case 'fear_greed': return `${Math.round(v)}`;
    case 'pe_ratio': return `${v.toFixed(1)}x`;
    case 'short_interest': return `${v.toFixed(1)}%`;
    case 'volatility': return v.toFixed(1);
    case 'vix': return v.toFixed(1);
    default: return v.toFixed(1);
  }
}
