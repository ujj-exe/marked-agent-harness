import { describe, it, expect, beforeEach } from 'vitest';
import { brailleChart } from './BrailleChart.js';
import { setTheme } from '../themes.js';
import { strip } from '../ansi.js';

// Use a fixed theme for snapshot stability
beforeEach(() => setTheme('terminal-cyan'));

describe('BrailleChart', () => {
  const samplePrices = [
    150, 153, 157, 162, 158, 155, 160, 168, 175, 180,
    178, 182, 185, 179, 172, 170, 168, 165, 170, 172,
  ];

  it('renders basic chart', () => {
    const result = brailleChart({ values: samplePrices, width: 40, height: 4 });
    expect(result).toMatchSnapshot();
  });

  it('renders with default options', () => {
    const result = brailleChart({ values: samplePrices });
    expect(result).toMatchSnapshot();
  });

  it('renders without axis', () => {
    const result = brailleChart({ values: samplePrices, width: 30, height: 3, showAxis: false });
    expect(result).toMatchSnapshot();
  });

  it('renders with volume overlay', () => {
    const vol = [100, 120, 90, 150, 200, 180, 160, 140, 110, 130,
                 170, 190, 210, 160, 140, 120, 100, 130, 150, 160];
    const result = brailleChart({ values: samplePrices, volume: vol, width: 40, height: 4 });
    expect(result).toMatchSnapshot();
  });

  it('renders with label', () => {
    const result = brailleChart({ values: samplePrices, width: 40, height: 3, label: '6M WEEKLY' });
    expect(result).toMatchSnapshot();
  });

  it('handles empty values', () => {
    const result = brailleChart({ values: [] });
    expect(strip(result)).toBe('(no data)');
  });

  it('handles single value', () => {
    const result = brailleChart({ values: [42.5] });
    expect(strip(result)).toContain('₹42.50');
  });

  it('handles flat line (all same value)', () => {
    const result = brailleChart({ values: [100, 100, 100, 100, 100], width: 20, height: 3 });
    expect(result).toMatchSnapshot();
  });

  it('handles downtrend', () => {
    const downtrend = [200, 195, 185, 175, 160, 150, 140, 135, 130, 125];
    const result = brailleChart({ values: downtrend, width: 30, height: 3 });
    expect(result).toMatchSnapshot();
  });

  it('handles uptrend', () => {
    const uptrend = [100, 105, 112, 120, 130, 142, 155, 170, 185, 200];
    const result = brailleChart({ values: uptrend, width: 30, height: 3 });
    expect(result).toMatchSnapshot();
  });

  it('strips cleanly (no broken ANSI)', () => {
    const result = brailleChart({ values: samplePrices, width: 40, height: 4 });
    const stripped = strip(result);
    // Should not contain any escape sequences
    expect(stripped).not.toContain('\x1b');
  });

  it('respects width constraint', () => {
    const result = brailleChart({ values: samplePrices, width: 40, height: 4, showAxis: true });
    const lines = result.split('\n');
    for (const line of lines) {
      expect(strip(line).length).toBeLessThanOrEqual(40);
    }
  });

  // Theme tests
  it('renders in bloomberg theme', () => {
    setTheme('bloomberg');
    const result = brailleChart({ values: samplePrices, width: 30, height: 3 });
    expect(result).toMatchSnapshot();
  });

  it('renders in monochrome theme', () => {
    setTheme('monochrome');
    const result = brailleChart({ values: samplePrices, width: 30, height: 3 });
    expect(result).toMatchSnapshot();
  });
});
