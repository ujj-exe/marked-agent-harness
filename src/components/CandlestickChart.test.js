import { describe, it, expect, beforeEach } from 'vitest';
import { candlestickChart } from './CandlestickChart.js';
import { setTheme } from '../themes.js';
import { strip } from '../ansi.js';

// Use a fixed theme for snapshot stability
beforeEach(() => setTheme('terminal-cyan'));

describe('CandlestickChart', () => {
  // Sample OHLCV bars — a short bullish run followed by a pullback
  const sampleBars = [
    { open: 100, high: 105, low: 98,  close: 103, volume: 1000 },
    { open: 103, high: 108, low: 101, close: 107, volume: 1200 },
    { open: 107, high: 112, low: 104, close: 110, volume: 900  },
    { open: 110, high: 115, low: 107, close: 108, volume: 1500 },
    { open: 108, high: 111, low: 103, close: 105, volume: 1300 },
    { open: 105, high: 109, low: 102, close: 106, volume: 800  },
    { open: 106, high: 113, low: 104, close: 112, volume: 1100 },
    { open: 112, high: 118, low: 110, close: 116, volume: 1400 },
  ];

  it('renders basic chart', () => {
    const result = candlestickChart({ bars: sampleBars, width: 40, height: 8 });
    expect(result).toMatchSnapshot();
  });

  it('renders with default options', () => {
    const result = candlestickChart({ bars: sampleBars });
    expect(result).toMatchSnapshot();
  });

  it('renders without axis', () => {
    const result = candlestickChart({ bars: sampleBars, width: 30, height: 6, showAxis: false });
    expect(result).toMatchSnapshot();
  });

  it('renders with label', () => {
    const result = candlestickChart({ bars: sampleBars, width: 40, height: 6, label: '1D OHLCV' });
    expect(result).toMatchSnapshot();
  });

  it('handles empty bars', () => {
    const result = candlestickChart({ bars: [] });
    expect(strip(result)).toBe('(no data)');
  });

  it('handles single bar', () => {
    const result = candlestickChart({ bars: [{ open: 100, high: 110, low: 90, close: 105 }] });
    const s = strip(result);
    expect(s).toContain('₹100.00');
    expect(s).toContain('₹105.00');
  });

  it('handles all bullish candles', () => {
    const bullBars = [
      { open: 100, high: 106, low: 99,  close: 105, volume: 1000 },
      { open: 105, high: 111, low: 104, close: 110, volume: 1000 },
      { open: 110, high: 116, low: 109, close: 115, volume: 1000 },
      { open: 115, high: 121, low: 114, close: 120, volume: 1000 },
    ];
    const result = candlestickChart({ bars: bullBars, width: 30, height: 6 });
    expect(result).toMatchSnapshot();
  });

  it('handles all bearish candles', () => {
    const bearBars = [
      { open: 120, high: 121, low: 114, close: 115, volume: 1000 },
      { open: 115, high: 116, low: 109, close: 110, volume: 1000 },
      { open: 110, high: 111, low: 104, close: 105, volume: 1000 },
      { open: 105, high: 106, low: 99,  close: 100, volume: 1000 },
    ];
    const result = candlestickChart({ bars: bearBars, width: 30, height: 6 });
    expect(result).toMatchSnapshot();
  });

  it('handles doji (open == close)', () => {
    const dojiBars = [
      { open: 100, high: 108, low: 92, close: 100, volume: 500 },
      { open: 100, high: 105, low: 95, close: 100, volume: 500 },
    ];
    const result = candlestickChart({ bars: dojiBars, width: 20, height: 6 });
    expect(result).toMatchSnapshot();
  });

  it('handles flat price (no range)', () => {
    const flatBars = [
      { open: 100, high: 100, low: 100, close: 100, volume: 500 },
      { open: 100, high: 100, low: 100, close: 100, volume: 500 },
      { open: 100, high: 100, low: 100, close: 100, volume: 500 },
    ];
    const result = candlestickChart({ bars: flatBars, width: 20, height: 4 });
    expect(result).toMatchSnapshot();
  });

  it('strips cleanly (no broken ANSI)', () => {
    const result = candlestickChart({ bars: sampleBars, width: 40, height: 8 });
    const stripped = strip(result);
    expect(stripped).not.toContain('\x1b');
  });

  it('output has expected number of lines for given height', () => {
    const result = candlestickChart({ bars: sampleBars, width: 40, height: 6, showAxis: true });
    const lines = result.split('\n');
    expect(lines.length).toBe(6);
  });

  it('output has extra line when label is provided', () => {
    const result = candlestickChart({ bars: sampleBars, width: 40, height: 6, label: 'TEST' });
    const lines = result.split('\n');
    expect(lines.length).toBe(7);
  });

  it('axis labels contain price values', () => {
    const result = candlestickChart({ bars: sampleBars, width: 40, height: 8, showAxis: true });
    const stripped = strip(result);
    // Should contain the max high and min low somewhere in axis
    expect(stripped).toContain('₹');
  });

  it('too narrow returns fallback', () => {
    const result = candlestickChart({ bars: sampleBars, width: 3, height: 6, showAxis: true });
    expect(strip(result)).toBe('(too narrow)');
  });

  // Theme tests
  it('renders in bloomberg theme', () => {
    setTheme('bloomberg');
    const result = candlestickChart({ bars: sampleBars, width: 30, height: 6 });
    expect(result).toMatchSnapshot();
  });

  it('renders in monochrome theme', () => {
    setTheme('monochrome');
    const result = candlestickChart({ bars: sampleBars, width: 30, height: 6 });
    expect(result).toMatchSnapshot();
  });

  it('renders in dracula theme', () => {
    setTheme('dracula');
    const result = candlestickChart({ bars: sampleBars, width: 30, height: 6 });
    expect(result).toMatchSnapshot();
  });
});
