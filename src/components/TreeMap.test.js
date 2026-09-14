import { describe, it, expect, beforeEach } from 'vitest';
import { treeMap } from './TreeMap.js';
import { setTheme } from '../themes.js';
import { strip } from '../ansi.js';

beforeEach(() => setTheme('terminal-cyan'));

describe('TreeMap', () => {
  const sectorItems = [
    { label: 'Technology',  weight: 28.5, value:  4.2 },
    { label: 'Healthcare',  weight: 13.1, value: -1.8 },
    { label: 'Financials',  weight: 12.7, value:  0.9 },
    { label: 'Consumer',    weight: 10.4, value:  2.1 },
    { label: 'Industrials', weight:  8.9, value: -0.5 },
    { label: 'Energy',      weight:  4.2, value: -3.7 },
  ];

  it('renders basic treemap', () => {
    const result = treeMap({ items: sectorItems, width: 60, height: 10 });
    expect(result).toMatchSnapshot();
  });

  it('renders with default options', () => {
    const result = treeMap({ items: sectorItems });
    expect(result).toMatchSnapshot();
  });

  it('outputs exactly `height` lines', () => {
    const result = treeMap({ items: sectorItems, width: 60, height: 8 });
    const lines = result.split('\n');
    expect(lines).toHaveLength(8);
  });

  it('each line is at most width visible chars', () => {
    const result = treeMap({ items: sectorItems, width: 60, height: 10 });
    const lines = result.split('\n');
    for (const line of lines) {
      expect(strip(line).length).toBeLessThanOrEqual(60);
    }
  });

  it('contains top-weight item label', () => {
    const result = treeMap({ items: sectorItems, width: 60, height: 10 });
    const stripped = strip(result);
    expect(stripped).toContain('Technology');
  });

  it('handles single item', () => {
    const items = [{ label: 'AAPL', weight: 100, value: 2.3 }];
    const result = treeMap({ items, width: 40, height: 6 });
    expect(result).toMatchSnapshot();
    const stripped = strip(result);
    expect(stripped).toContain('AAPL');
  });

  it('handles two items equal weight', () => {
    const items = [
      { label: 'MSFT', weight: 50, value:  1.5 },
      { label: 'GOOG', weight: 50, value: -1.2 },
    ];
    const result = treeMap({ items, width: 40, height: 6 });
    expect(result).toMatchSnapshot();
  });

  it('handles highly skewed weights', () => {
    const items = [
      { label: 'Dominant', weight: 95, value: 3.0 },
      { label: 'Tiny',     weight:  5, value: 0.1 },
    ];
    const result = treeMap({ items, width: 40, height: 8 });
    const stripped = strip(result);
    expect(stripped).toContain('Dominant');
    expect(result).toMatchSnapshot();
  });

  it('renders positive performance with positive block chars', () => {
    const items = [{ label: 'Bull', weight: 100, value: 5.0 }];
    const result = treeMap({ items, width: 20, height: 4 });
    // Strong positive (>3%) gets BLOCKS[0] = █
    const stripped = strip(result);
    expect(stripped).toContain('█');
  });

  it('renders negative performance with correct chars', () => {
    const items = [{ label: 'Bear', weight: 100, value: -5.0 }];
    const result = treeMap({ items, width: 20, height: 4 });
    const stripped = strip(result);
    expect(stripped).toContain('█');
  });

  it('handles custom color override', () => {
    const items = [
      { label: 'Custom', weight: 100, value: 1.0, color: '#ff00ff' },
    ];
    const result = treeMap({ items, width: 20, height: 4 });
    // Should not crash and should contain the label
    expect(strip(result)).toContain('Custom');
    expect(result).toMatchSnapshot();
  });

  it('handles zero weight items (filtered out)', () => {
    const items = [
      { label: 'Valid', weight: 80, value: 2.0 },
      { label: 'Zero',  weight:  0, value: 1.0 },
    ];
    const result = treeMap({ items, width: 40, height: 6 });
    const stripped = strip(result);
    expect(stripped).toContain('Valid');
    expect(stripped).not.toContain('Zero');
  });

  it('handles all zero weights', () => {
    const items = [
      { label: 'A', weight: 0 },
      { label: 'B', weight: 0 },
    ];
    const result = treeMap({ items });
    expect(strip(result)).toBe('(no data)');
  });

  it('handles empty items array', () => {
    const result = treeMap({ items: [] });
    expect(strip(result)).toBe('(no data)');
  });

  it('handles no opts', () => {
    const result = treeMap();
    expect(strip(result)).toBe('(no data)');
  });

  it('handles null/undefined value (neutral styling)', () => {
    const items = [
      { label: 'NoVal', weight: 100 },
    ];
    const result = treeMap({ items, width: 20, height: 4 });
    const stripped = strip(result);
    expect(stripped).toContain('NoVal');
    expect(stripped).not.toContain('NaN');
  });

  it('strips cleanly — no broken ANSI', () => {
    const result = treeMap({ items: sectorItems, width: 60, height: 10 });
    const stripped = strip(result);
    expect(stripped).not.toContain('\x1b');
  });

  it('handles many small items', () => {
    const items = Array.from({ length: 10 }, (_, i) => ({
      label: `S${i + 1}`,
      weight: 10,
      value: (i - 5) * 1.5,
    }));
    const result = treeMap({ items, width: 60, height: 10 });
    expect(result).toMatchSnapshot();
  });

  it('renders narrow layout', () => {
    const result = treeMap({ items: sectorItems, width: 30, height: 8 });
    expect(result).toMatchSnapshot();
  });

  it('renders tall layout', () => {
    const result = treeMap({ items: sectorItems, width: 60, height: 20 });
    const lines = result.split('\n');
    expect(lines).toHaveLength(20);
  });

  // Theme variants
  it('renders in bloomberg theme', () => {
    setTheme('bloomberg');
    const result = treeMap({ items: sectorItems, width: 60, height: 10 });
    expect(result).toMatchSnapshot();
  });

  it('renders in dracula theme', () => {
    setTheme('dracula');
    const result = treeMap({ items: sectorItems, width: 60, height: 10 });
    expect(result).toMatchSnapshot();
  });

  it('renders in monochrome theme', () => {
    setTheme('monochrome');
    const result = treeMap({ items: sectorItems, width: 60, height: 10 });
    expect(result).toMatchSnapshot();
  });
});
