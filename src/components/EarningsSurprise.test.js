import { describe, it, expect, beforeEach } from 'vitest';
import { earningsSurprise } from './EarningsSurprise.js';
import { setTheme } from '../themes.js';
import { strip } from '../ansi.js';

beforeEach(() => setTheme('terminal-cyan'));

const SAMPLE_QUARTERS = [
  { date: "Q1'24", actual: 0.42, estimate: 0.38, surprise: 10.5 },
  { date: "Q2'24", actual: 0.31, estimate: 0.35, surprise: -11.4 },
  { date: "Q3'24", actual: 0.55, estimate: 0.52, surprise: 5.8 },
  { date: "Q4'24", actual: 0.48, estimate: 0.50, surprise: -4.0 },
];

describe('earningsSurprise', () => {
  it('renders basic timeline', () => {
    const result = earningsSurprise({ quarters: SAMPLE_QUARTERS });
    expect(result).toMatchSnapshot();
  });

  it('contains BEAT for positive surprise', () => {
    const result = earningsSurprise({ quarters: SAMPLE_QUARTERS });
    const stripped = strip(result);
    expect(stripped).toContain('BEAT');
  });

  it('contains MISS for negative surprise', () => {
    const result = earningsSurprise({ quarters: SAMPLE_QUARTERS });
    const stripped = strip(result);
    expect(stripped).toContain('MISS');
  });

  it('shows quarter dates', () => {
    const result = earningsSurprise({ quarters: SAMPLE_QUARTERS });
    const stripped = strip(result);
    expect(stripped).toContain("Q1'24");
    expect(stripped).toContain("Q4'24");
  });

  it('shows EPS values', () => {
    const result = earningsSurprise({ quarters: SAMPLE_QUARTERS });
    const stripped = strip(result);
    expect(stripped).toContain('$0.42');
    expect(stripped).toContain('$0.38');
  });

  it('shows surprise percentages with sign', () => {
    const result = earningsSurprise({ quarters: SAMPLE_QUARTERS });
    const stripped = strip(result);
    expect(stripped).toContain('+10.5%');
    expect(stripped).toContain('-11.4%');
  });

  it('handles empty quarters array', () => {
    const result = earningsSurprise({ quarters: [] });
    expect(strip(result)).toBe('No earnings data');
  });

  it('handles single quarter beat', () => {
    const result = earningsSurprise({
      quarters: [{ date: "Q1'24", actual: 1.20, estimate: 1.10, surprise: 9.1 }],
    });
    expect(result).toMatchSnapshot();
    expect(strip(result)).toContain('BEAT');
    expect(strip(result)).not.toContain('MISS');
  });

  it('handles single quarter miss', () => {
    const result = earningsSurprise({
      quarters: [{ date: "Q2'24", actual: 0.90, estimate: 1.00, surprise: -10.0 }],
    });
    expect(result).toMatchSnapshot();
    expect(strip(result)).toContain('MISS');
    expect(strip(result)).not.toContain('BEAT');
  });

  it('handles zero surprise (no surprise data — shows actual EPS only)', () => {
    const result = earningsSurprise({
      quarters: [{ date: "Q3'24", actual: 0.50, estimate: 0.50, surprise: 0.0 }],
    });
    const stripped = strip(result);
    expect(stripped).toContain('$0.50');
    expect(stripped).not.toContain('BEAT');
    expect(stripped).not.toContain('MISS');
  });

  it('handles large EPS values', () => {
    const result = earningsSurprise({
      quarters: [{ date: "Q1'24", actual: 12.50, estimate: 11.80, surprise: 5.9 }],
    });
    const stripped = strip(result);
    expect(stripped).toContain('$12.50');
    expect(stripped).toContain('$11.80');
  });

  it('renders without connector', () => {
    const result = earningsSurprise({ quarters: SAMPLE_QUARTERS, showConnector: false });
    expect(result).toMatchSnapshot();
  });

  it('renders correct number of lines', () => {
    const result = earningsSurprise({ quarters: SAMPLE_QUARTERS });
    const lines = result.split('\n');
    expect(lines).toHaveLength(4);
  });

  // Theme variants
  it('renders in bloomberg theme', () => {
    setTheme('bloomberg');
    const result = earningsSurprise({ quarters: SAMPLE_QUARTERS.slice(0, 2) });
    expect(result).toMatchSnapshot();
  });

  it('renders in dracula theme', () => {
    setTheme('dracula');
    const result = earningsSurprise({ quarters: SAMPLE_QUARTERS.slice(0, 2) });
    expect(result).toMatchSnapshot();
  });

  it('renders in monochrome theme', () => {
    setTheme('monochrome');
    const result = earningsSurprise({ quarters: SAMPLE_QUARTERS.slice(0, 2) });
    expect(result).toMatchSnapshot();
  });
});
