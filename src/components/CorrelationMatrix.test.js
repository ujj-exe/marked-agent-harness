import { describe, it, expect, beforeEach } from 'vitest';
import { correlationMatrix } from './CorrelationMatrix.js';
import { setTheme } from '../themes.js';
import { strip } from '../ansi.js';

beforeEach(() => setTheme('terminal-cyan'));

// Sample 4-ticker correlation data
const TICKERS_4 = ['SPY', 'QQQ', 'GLD', 'TLT'];
const MATRIX_4 = [
  [ 1.00,  0.95, -0.23, -0.45],
  [ 0.95,  1.00, -0.18, -0.52],
  [-0.23, -0.18,  1.00,  0.34],
  [-0.45, -0.52,  0.34,  1.00],
];

// 2-ticker minimal
const TICKERS_2 = ['AAPL', 'MSFT'];
const MATRIX_2 = [
  [1.00, 0.87],
  [0.87, 1.00],
];

// Single ticker edge case
const TICKERS_1 = ['BTC'];
const MATRIX_1 = [[1.00]];

describe('CorrelationMatrix', () => {
  it('renders 4-ticker matrix', () => {
    const result = correlationMatrix({ tickers: TICKERS_4, matrix: MATRIX_4, width: 80 });
    expect(result).toMatchSnapshot();
  });

  it('contains all ticker labels', () => {
    const result = strip(correlationMatrix({ tickers: TICKERS_4, matrix: MATRIX_4, width: 80 }));
    expect(result).toContain('SPY');
    expect(result).toContain('QQQ');
    expect(result).toContain('GLD');
    expect(result).toContain('TLT');
  });

  it('shows diagonal as 1.00', () => {
    const result = strip(correlationMatrix({ tickers: TICKERS_4, matrix: MATRIX_4, width: 80 }));
    expect(result).toContain('1.00');
  });

  it('shows positive correlations with + sign', () => {
    const result = strip(correlationMatrix({ tickers: TICKERS_4, matrix: MATRIX_4, width: 80 }));
    expect(result).toContain('+0.95');
  });

  it('shows negative correlations with - sign', () => {
    const result = strip(correlationMatrix({ tickers: TICKERS_4, matrix: MATRIX_4, width: 80 }));
    expect(result).toContain('-0.45');
  });

  it('renders 2-ticker matrix', () => {
    const result = correlationMatrix({ tickers: TICKERS_2, matrix: MATRIX_2, width: 60 });
    expect(result).toMatchSnapshot();
    expect(strip(result)).toContain('AAPL');
    expect(strip(result)).toContain('MSFT');
    expect(strip(result)).toContain('+0.87');
  });

  it('renders single-ticker matrix', () => {
    const result = correlationMatrix({ tickers: TICKERS_1, matrix: MATRIX_1, width: 40 });
    expect(result).toMatchSnapshot();
    expect(strip(result)).toContain('BTC');
    expect(strip(result)).toContain('1.00');
  });

  it('handles empty tickers', () => {
    const result = strip(correlationMatrix({ tickers: [], matrix: [], width: 80 }));
    expect(result).toContain('no correlation data');
  });

  it('handles no opts argument', () => {
    const result = strip(correlationMatrix());
    expect(result).toContain('no correlation data');
  });

  it('renders custom title', () => {
    const result = strip(correlationMatrix({ tickers: TICKERS_2, matrix: MATRIX_2, title: 'ASSET CORR' }));
    expect(result).toContain('ASSET CORR');
  });

  it('renders default title', () => {
    const result = strip(correlationMatrix({ tickers: TICKERS_2, matrix: MATRIX_2 }));
    expect(result).toContain('CORRELATION MATRIX');
  });

  it('output contains box borders', () => {
    const result = strip(correlationMatrix({ tickers: TICKERS_4, matrix: MATRIX_4, width: 80 }));
    expect(result).toContain('│');
    expect(result).toContain('─');
  });

  it('handles null cell values', () => {
    const matrix = [[1.00, null], [null, 1.00]];
    const result = correlationMatrix({ tickers: ['A', 'B'], matrix });
    expect(result).toMatchSnapshot();
    const stripped = strip(result);
    expect(stripped).toContain('—');
  });

  it('clamps values outside -1..+1', () => {
    const matrix = [[1.00, 1.50], [-1.50, 1.00]];
    const result = correlationMatrix({ tickers: ['X', 'Y'], matrix });
    expect(result).toMatchSnapshot();
    // Should not crash or show values outside range in a broken way
    const stripped = strip(result);
    expect(stripped).toContain('X');
    expect(stripped).toContain('Y');
  });

  it('renders 3-ticker crypto matrix', () => {
    const tickers = ['BTC', 'ETH', 'SOL'];
    const matrix = [
      [1.00, 0.82, 0.74],
      [0.82, 1.00, 0.91],
      [0.74, 0.91, 1.00],
    ];
    const result = correlationMatrix({ tickers, matrix, width: 70 });
    expect(result).toMatchSnapshot();
  });

  // Theme variants
  it('renders in bloomberg theme', () => {
    setTheme('bloomberg');
    const result = correlationMatrix({ tickers: TICKERS_4, matrix: MATRIX_4, width: 80 });
    expect(result).toMatchSnapshot();
  });

  it('renders in dracula theme', () => {
    setTheme('dracula');
    const result = correlationMatrix({ tickers: TICKERS_4, matrix: MATRIX_4, width: 80 });
    expect(result).toMatchSnapshot();
  });

  it('renders in monochrome theme', () => {
    setTheme('monochrome');
    const result = correlationMatrix({ tickers: TICKERS_4, matrix: MATRIX_4, width: 80 });
    expect(result).toMatchSnapshot();
  });
});
