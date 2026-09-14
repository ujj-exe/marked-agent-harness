import { describe, it, expect, beforeEach } from 'vitest';
import { heatMap } from './HeatMap.js';
import { setTheme } from '../themes.js';
import { strip } from '../ansi.js';

// Use a fixed theme for snapshot stability
beforeEach(() => setTheme('terminal-cyan'));

describe('HeatMap', () => {
  // Sample sector performance data
  const sectorRows = [
    { label: 'Technology', values: [3.2, -1.5, 0.8,  2.1] },
    { label: 'Healthcare',  values: [-0.5, 1.2, -2.3, 0.4] },
    { label: 'Energy',      values: [1.8, 3.5, -0.9, -1.1] },
    { label: 'Finance',     values: [0.3, -0.8, 1.5,  2.7] },
  ];
  const sectorCols = ['1D', '1W', '1M', '3M'];

  it('renders basic heatmap', () => {
    const result = heatMap({ rows: sectorRows, columns: sectorCols, width: 50 });
    expect(result).toMatchSnapshot();
  });

  it('renders with default width', () => {
    const result = heatMap({ rows: sectorRows, columns: sectorCols });
    expect(result).toMatchSnapshot();
  });

  it('renders sequential color scale', () => {
    const result = heatMap({
      rows: sectorRows,
      columns: sectorCols,
      width: 50,
      colorScale: 'sequential',
    });
    expect(result).toMatchSnapshot();
  });

  it('renders diverging color scale (default)', () => {
    const result = heatMap({
      rows: sectorRows,
      columns: sectorCols,
      width: 50,
      colorScale: 'diverging',
    });
    expect(result).toMatchSnapshot();
  });

  it('handles empty rows', () => {
    const result = heatMap({ rows: [], columns: sectorCols });
    expect(strip(result)).toBe('(no data)');
  });

  it('handles empty columns', () => {
    const result = heatMap({ rows: sectorRows, columns: [] });
    expect(strip(result)).toBe('(no data)');
  });

  it('handles single row single column', () => {
    const result = heatMap({
      rows: [{ label: 'SPY', values: [2.5] }],
      columns: ['1D'],
      width: 30,
    });
    expect(result).toMatchSnapshot();
  });

  it('handles all positive values', () => {
    const posRows = [
      { label: 'A', values: [1, 2, 3] },
      { label: 'B', values: [4, 5, 6] },
    ];
    const result = heatMap({ rows: posRows, columns: ['X', 'Y', 'Z'], width: 40 });
    expect(result).toMatchSnapshot();
  });

  it('handles all negative values', () => {
    const negRows = [
      { label: 'A', values: [-1, -2, -3] },
      { label: 'B', values: [-4, -5, -6] },
    ];
    const result = heatMap({ rows: negRows, columns: ['X', 'Y', 'Z'], width: 40 });
    expect(result).toMatchSnapshot();
  });

  it('handles null/missing values gracefully', () => {
    const sparseRows = [
      { label: 'Row1', values: [1.0, null, 3.0] },
      { label: 'Row2', values: [null, 2.0, null] },
    ];
    const result = heatMap({ rows: sparseRows, columns: ['A', 'B', 'C'], width: 40 });
    expect(result).toMatchSnapshot();
  });

  it('renders correlation matrix (square, -1 to 1)', () => {
    const assets = ['AAPL', 'GOOG', 'MSFT', 'AMZN'];
    const corrRows = [
      { label: 'AAPL', values: [1.00,  0.75,  0.68,  0.52] },
      { label: 'GOOG', values: [0.75,  1.00,  0.71,  0.63] },
      { label: 'MSFT', values: [0.68,  0.71,  1.00,  0.58] },
      { label: 'AMZN', values: [0.52,  0.63,  0.58,  1.00] },
    ];
    const result = heatMap({ rows: corrRows, columns: assets, width: 55, colorScale: 'diverging' });
    expect(result).toMatchSnapshot();
  });

  it('strips cleanly (no broken ANSI)', () => {
    const result = heatMap({ rows: sectorRows, columns: sectorCols, width: 50 });
    const stripped = strip(result);
    expect(stripped).not.toContain('\x1b');
  });

  it('output contains row labels', () => {
    const result = heatMap({ rows: sectorRows, columns: sectorCols, width: 50 });
    const stripped = strip(result);
    expect(stripped).toContain('Technology');
    expect(stripped).toContain('Healthcare');
    expect(stripped).toContain('Energy');
    expect(stripped).toContain('Finance');
  });

  it('output contains column labels', () => {
    const result = heatMap({ rows: sectorRows, columns: sectorCols, width: 50 });
    const stripped = strip(result);
    expect(stripped).toContain('1D');
    expect(stripped).toContain('1W');
    expect(stripped).toContain('1M');
    expect(stripped).toContain('3M');
  });

  it('output line count equals rows + 1 header', () => {
    const result = heatMap({ rows: sectorRows, columns: sectorCols, width: 50 });
    const lines = result.split('\n');
    // header row + one line per data row
    expect(lines.length).toBe(sectorRows.length + 1);
  });

  it('renders large numbers (integer display)', () => {
    const largeRows = [
      { label: 'Alpha', values: [150, -200, 300] },
      { label: 'Beta',  values: [-100, 250, -175] },
    ];
    const result = heatMap({ rows: largeRows, columns: ['Q1', 'Q2', 'Q3'], width: 50 });
    expect(result).toMatchSnapshot();
  });

  // Theme tests
  it('renders in bloomberg theme', () => {
    setTheme('bloomberg');
    const result = heatMap({ rows: sectorRows, columns: sectorCols, width: 50 });
    expect(result).toMatchSnapshot();
  });

  it('renders in monochrome theme', () => {
    setTheme('monochrome');
    const result = heatMap({ rows: sectorRows, columns: sectorCols, width: 50 });
    expect(result).toMatchSnapshot();
  });

  it('renders in solarized-dark theme', () => {
    setTheme('solarized-dark');
    const result = heatMap({ rows: sectorRows, columns: sectorCols, width: 50 });
    expect(result).toMatchSnapshot();
  });
});
