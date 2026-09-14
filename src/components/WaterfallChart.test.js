import { describe, it, expect, beforeEach } from 'vitest';
import { waterfallChart } from './WaterfallChart.js';
import { setTheme } from '../themes.js';
import { strip } from '../ansi.js';

beforeEach(() => setTheme('terminal-cyan'));

describe('WaterfallChart', () => {
  const quarterlyItems = [
    { label: 'Revenue',   value:  12500000000, previous:  11000000000 },
    { label: 'COGS',      value:  -5200000000, previous:  -4800000000 },
    { label: 'Gross',     value:   7300000000, previous:   6200000000 },
    { label: 'OpEx',      value:  -3100000000, previous:  -2900000000 },
    { label: 'Net Inc',   value:   4200000000, previous:   3300000000 },
  ];

  it('renders basic waterfall chart', () => {
    const result = waterfallChart({ items: quarterlyItems, width: 60 });
    expect(result).toMatchSnapshot();
  });

  it('renders with default width', () => {
    const result = waterfallChart({ items: quarterlyItems });
    expect(result).toMatchSnapshot();
  });

  it('renders without delta', () => {
    const result = waterfallChart({ items: quarterlyItems, width: 60, showDelta: false });
    expect(result).toMatchSnapshot();
  });

  it('contains all item labels', () => {
    const result = waterfallChart({ items: quarterlyItems, width: 60 });
    const stripped = strip(result);
    expect(stripped).toContain('Revenue');
    expect(stripped).toContain('COGS');
    expect(stripped).toContain('Gross');
    expect(stripped).toContain('OpEx');
    expect(stripped).toContain('Net Inc');
  });

  it('shows positive values with up arrows when previous provided', () => {
    const items = [{ label: 'Revenue', value: 1200000, previous: 1000000 }];
    const result = waterfallChart({ items, width: 60 });
    const stripped = strip(result);
    expect(stripped).toContain('▲');
    expect(stripped).toContain('+20.0%');
  });

  it('shows negative values with down arrows when value declined', () => {
    const items = [{ label: 'Loss', value: -800000, previous: -500000 }];
    const result = waterfallChart({ items, width: 60 });
    const stripped = strip(result);
    // value went from -500K to -800K, more negative → decline
    expect(stripped).toContain('▼');
  });

  it('handles no previous value (no delta arrow)', () => {
    const items = [{ label: 'Revenue', value: 5000000 }];
    const result = waterfallChart({ items, width: 60 });
    const stripped = strip(result);
    // Should not crash and should show the value
    expect(stripped).toContain('Revenue');
    expect(stripped).not.toContain('undefined');
    expect(stripped).not.toContain('NaN');
  });

  it('handles single item', () => {
    const items = [{ label: 'Only', value: 3000000, previous: 2500000 }];
    const result = waterfallChart({ items, width: 60 });
    expect(result).toMatchSnapshot();
  });

  it('handles zero value', () => {
    const items = [
      { label: 'Baseline', value: 0, previous: 1000000 },
    ];
    const result = waterfallChart({ items, width: 60 });
    const stripped = strip(result);
    expect(stripped).toContain('Baseline');
    expect(stripped).not.toContain('NaN');
  });

  it('handles all negative values', () => {
    const items = [
      { label: 'Loss Q1', value: -1000000, previous: -900000 },
      { label: 'Loss Q2', value: -1500000, previous: -1200000 },
      { label: 'Loss Q3', value: -800000,  previous: -1100000 },
    ];
    const result = waterfallChart({ items, width: 60 });
    expect(result).toMatchSnapshot();
  });

  it('handles large trillion-scale values', () => {
    const items = [
      { label: 'Market Cap', value: 2500000000000, previous: 2200000000000 },
      { label: 'Revenue',    value: 383000000000,  previous: 365000000000  },
    ];
    const result = waterfallChart({ items, width: 60 });
    const stripped = strip(result);
    expect(stripped).toContain('T');
    expect(stripped).not.toContain('NaN');
  });

  it('handles mixed positive and negative', () => {
    const items = [
      { label: 'Income',  value:  500000 },
      { label: 'Expense', value: -300000 },
      { label: 'Net',     value:  200000 },
    ];
    const result = waterfallChart({ items, width: 60 });
    expect(result).toMatchSnapshot();
  });

  it('handles empty items array', () => {
    const result = waterfallChart({ items: [] });
    expect(strip(result)).toBe('(no data)');
  });

  it('handles no opts', () => {
    const result = waterfallChart();
    expect(strip(result)).toBe('(no data)');
  });

  it('strips cleanly — no broken ANSI', () => {
    const result = waterfallChart({ items: quarterlyItems, width: 60 });
    const stripped = strip(result);
    expect(stripped).not.toContain('\x1b');
  });

  it('renders with narrow width', () => {
    const items = [
      { label: 'Rev', value: 1000000, previous: 800000 },
      { label: 'Exp', value: -400000, previous: -350000 },
    ];
    const result = waterfallChart({ items, width: 40, showDelta: false });
    expect(result).toMatchSnapshot();
  });

  // Theme variants
  it('renders in bloomberg theme', () => {
    setTheme('bloomberg');
    const result = waterfallChart({ items: quarterlyItems, width: 60 });
    expect(result).toMatchSnapshot();
  });

  it('renders in dracula theme', () => {
    setTheme('dracula');
    const result = waterfallChart({ items: quarterlyItems, width: 60 });
    expect(result).toMatchSnapshot();
  });

  it('renders in monochrome theme', () => {
    setTheme('monochrome');
    const result = waterfallChart({ items: quarterlyItems, width: 60 });
    expect(result).toMatchSnapshot();
  });
});
