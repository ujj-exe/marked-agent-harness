import { describe, it, expect, beforeEach } from 'vitest';
import { setTheme } from './themes.js';
import { strip } from './ansi.js';
import {
  fmtPrice, fmtPct, fmtCap, fmtVol,
  convictionBadge, coloredPct,
  coloredSignal,
  tablePercentColor,
  colorTablePercent,
} from './formatters.js';

beforeEach(() => setTheme('marked'));

// ── fmtPrice ──────────────────────────────────────────────────────────────────

describe('fmtPrice', () => {
  it('formats prices >= 1000 with commas and 2 decimals', () => {
    expect(fmtPrice(1234.5)).toBe('₹1,234.50');
    expect(fmtPrice(50000)).toBe('₹50,000.00');
  });

  it('formats prices 1-999 with 2 decimals', () => {
    expect(fmtPrice(45.6)).toBe('₹45.60');
    expect(fmtPrice(1)).toBe('₹1.00');
    expect(fmtPrice(999.99)).toBe('₹999.99');
  });

  it('formats sub-dollar prices with 4 decimals', () => {
    expect(fmtPrice(0.0042)).toBe('₹0.0042');
    expect(fmtPrice(0.5)).toBe('₹0.5000');
  });

  it('returns — for null/undefined', () => {
    expect(fmtPrice(null)).toBe('—');
    expect(fmtPrice(undefined)).toBe('—');
  });

  it('coerces string to number', () => {
    expect(fmtPrice('150')).toBe('₹150.00');
  });
});

// ── fmtPct ────────────────────────────────────────────────────────────────────

describe('fmtPct', () => {
  it('formats positive percentages with + sign by default', () => {
    expect(fmtPct(5.2)).toBe('+5.2%');
    expect(fmtPct(0)).toBe('+0.0%');
  });

  it('formats negative percentages with - sign', () => {
    expect(fmtPct(-3.5)).toBe('-3.5%');
  });

  it('hides sign when showSign=false', () => {
    expect(fmtPct(5.2, false)).toBe('5.2%');
    expect(fmtPct(-3.5, false)).toBe('-3.5%');
  });

  it('returns — for null/undefined', () => {
    expect(fmtPct(null)).toBe('—');
    expect(fmtPct(undefined)).toBe('—');
  });
});

// ── fmtCap ────────────────────────────────────────────────────────────────────

describe('fmtCap', () => {
  // Crore, and Indian digit grouping. An Indian market participant reads
  // "₹2,50,000 Cr", never "$2.50T" — wrong currency and a scale nobody quotes.
  it('formats large caps in crore', () => {
    expect(fmtCap(2.5e12)).toBe('₹2,50,000 Cr');
    expect(fmtCap(1.7e13)).toBe('₹17,00,000 Cr');
    expect(fmtCap(1e7)).toBe('₹1 Cr');
  });

  it('formats smaller amounts in lakh', () => {
    expect(fmtCap(5e5)).toBe('₹5 L');
    expect(fmtCap(1.5e5)).toBe('₹1.5 L');
  });

  it('leaves small amounts in rupees', () => {
    expect(fmtCap(2500)).toBe('₹2,500');
  });

  it('formats small values with locale string', () => {
    expect(fmtCap(50000)).toBe('₹50,000');
  });

  it('returns — for null/undefined', () => {
    expect(fmtCap(null)).toBe('—');
    expect(fmtCap(undefined)).toBe('—');
  });
});

// ── fmtVol ────────────────────────────────────────────────────────────────────

describe('fmtVol', () => {
  it('formats billions', () => {
    expect(fmtVol(2.5e9)).toBe('2.5B');
  });

  it('formats millions', () => {
    expect(fmtVol(1.2e6)).toBe('1.2M');
    expect(fmtVol(500e3)).toBe('500.0K');
  });

  it('formats thousands', () => {
    expect(fmtVol(5500)).toBe('5.5K');
  });

  it('formats small values as integer', () => {
    expect(fmtVol(123)).toBe('123');
  });

  it('returns — for null/undefined', () => {
    expect(fmtVol(null)).toBe('—');
    expect(fmtVol(undefined)).toBe('—');
  });
});

// ── convictionBadge ───────────────────────────────────────────────────────────

describe('convictionBadge', () => {
  it('returns empty string for falsy input', () => {
    expect(convictionBadge('')).toBe('');
    expect(convictionBadge(null)).toBe('');
    expect(convictionBadge(undefined)).toBe('');
  });

  it('renders [STRONG BULL] for strong_bull', () => {
    const result = convictionBadge('strong_bull');
    expect(strip(result)).toBe('[STRONG BULL]');
    // bold is encoded as combined SGR: \x1b[1;38;2;...
    expect(result).toContain('\x1b[1;38;2;');
  });

  it('renders [BULL] for bull', () => {
    const result = convictionBadge('bull');
    expect(strip(result)).toBe('[BULL]');
  });

  it('renders [NEUTRAL] for neutral', () => {
    const result = convictionBadge('neutral');
    expect(strip(result)).toBe('[NEUTRAL]');
  });

  it('renders [BEAR] for bear', () => {
    const result = convictionBadge('bear');
    expect(strip(result)).toBe('[BEAR]');
  });

  it('renders [STRONG BEAR] for strong_bear', () => {
    const result = convictionBadge('strong_bear');
    expect(strip(result)).toBe('[STRONG BEAR]');
    // bold is encoded as combined SGR: \x1b[1;38;2;...
    expect(result).toContain('\x1b[1;38;2;');
  });

  it('uppercases unknown conviction values', () => {
    const result = convictionBadge('custom_value');
    expect(strip(result)).toBe('[CUSTOM_VALUE]');
  });

  it('contains ANSI color codes', () => {
    const result = convictionBadge('bull');
    expect(result).toContain('\x1b[');
  });
});

// ── coloredPct ────────────────────────────────────────────────────────────────

describe('coloredPct', () => {
  it('colors positive percent green (positive role)', () => {
    const result = coloredPct(5.2);
    expect(strip(result)).toBe('+5.2%');
    expect(result).toContain('\x1b[38;2;0;255;136m'); // Marked positive = #00ff88
  });

  it('colors negative percent red (negative role)', () => {
    const result = coloredPct(-3.5);
    expect(strip(result)).toBe('-3.5%');
    expect(result).toContain('\x1b[38;2;255;92;48m'); // Marked negative = #FF5C30
  });

  it('colors zero with muted role', () => {
    const result = coloredPct(0);
    expect(strip(result)).toBe('0.0%');
  });

  it('returns muted — for null', () => {
    const result = coloredPct(null);
    expect(strip(result)).toBe('—');
  });

  it('returns muted — for undefined', () => {
    const result = coloredPct(undefined);
    expect(strip(result)).toBe('—');
  });
});

// ── table percent helpers ────────────────────────────────────────────────────

describe('table percent helpers', () => {
  it('returns market green for positive signed percent strings', () => {
    expect(tablePercentColor('+1.44%')).toBe('#72C66B');
  });

  it('returns market red for negative signed percent strings', () => {
    expect(tablePercentColor('-2.87%')).toBe('#E7775A');
  });

  it('does not match unsigned or non-percent values', () => {
    expect(tablePercentColor('18%')).toBe('');
    expect(tablePercentColor('RSI 44.2')).toBe('');
    expect(tablePercentColor('BUY')).toBe('');
  });

  it('wraps signed percent strings in ANSI color for table use', () => {
    const result = colorTablePercent('+30.4%');
    expect(strip(result)).toBe('+30.4%');
    expect(result).toContain('\x1b[38;2;114;198;107m');
  });
});

// ── coloredSignal ─────────────────────────────────────────────────────────────

describe('coloredSignal', () => {
  it('returns muted — for falsy signal', () => {
    expect(strip(coloredSignal(''))).toBe('—');
    expect(strip(coloredSignal(null))).toBe('—');
  });

  it('colors BUY signal with positive role', () => {
    const result = coloredSignal('BUY');
    expect(strip(result)).toBe('BUY');
  });

  it('colors SELL signal with negative role', () => {
    const result = coloredSignal('SELL');
    expect(strip(result)).toBe('SELL');
  });

  it('colors HOLD signal with warning role', () => {
    const result = coloredSignal('HOLD');
    expect(strip(result)).toBe('HOLD');
  });

  it('handles lowercase signal', () => {
    const result = coloredSignal('buy');
    expect(strip(result)).toBe('BUY');
  });

  it('appends confidence percentage when provided (0-1 scale)', () => {
    const result = coloredSignal('BUY', 0.85);
    expect(strip(result)).toBe('BUY 85%');
  });

  it('appends confidence percentage of 100% for confidence=1', () => {
    const result = coloredSignal('BUY', 1);
    expect(strip(result)).toBe('BUY 100%');
  });

  it('omits confidence when not provided', () => {
    const result = coloredSignal('SELL');
    expect(strip(result)).toBe('SELL');
    expect(strip(result)).not.toContain('%');
  });

  it('colors BULLISH as positive', () => {
    const result = coloredSignal('BULLISH');
    expect(strip(result)).toBe('BULLISH');
  });

  it('colors BEARISH as negative', () => {
    const result = coloredSignal('BEARISH');
    expect(strip(result)).toBe('BEARISH');
  });

  it('colors CAUTIOUS as warning', () => {
    const result = coloredSignal('CAUTIOUS');
    expect(strip(result)).toBe('CAUTIOUS');
  });

  it('colors unknown signal with muted role', () => {
    const result = coloredSignal('SIDEWAYS');
    expect(strip(result)).toBe('SIDEWAYS');
  });
});
