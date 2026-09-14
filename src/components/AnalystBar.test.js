import { describe, it, expect, beforeEach } from 'vitest';
import { analystBar } from './AnalystBar.js';
import { setTheme } from '../themes.js';
import { strip } from '../ansi.js';

beforeEach(() => setTheme('terminal-cyan'));

const SAMPLE_RATINGS = { buy: 25, hold: 8, sell: 2 };
const SAMPLE_TARGET  = { current: 155.00, low: 130.00, median: 165.00, high: 195.00 };

describe('analystBar', () => {
  it('renders basic bar with ratings', () => {
    const result = analystBar({ ratings: SAMPLE_RATINGS });
    expect(result).toMatchSnapshot();
  });

  it('shows buy count', () => {
    const result = analystBar({ ratings: SAMPLE_RATINGS });
    expect(strip(result)).toContain('25 Buy');
  });

  it('shows hold count', () => {
    const result = analystBar({ ratings: SAMPLE_RATINGS });
    expect(strip(result)).toContain('8 Hold');
  });

  it('shows sell count', () => {
    const result = analystBar({ ratings: SAMPLE_RATINGS });
    expect(strip(result)).toContain('2 Sell');
  });

  it('renders with price target', () => {
    const result = analystBar({ ratings: SAMPLE_RATINGS, priceTarget: SAMPLE_TARGET });
    expect(result).toMatchSnapshot();
  });

  it('shows price target low and high', () => {
    const result = analystBar({ ratings: SAMPLE_RATINGS, priceTarget: SAMPLE_TARGET });
    const stripped = strip(result);
    expect(stripped).toContain('₹130.00');
    expect(stripped).toContain('₹195.00');
  });

  it('shows median price target', () => {
    const result = analystBar({ ratings: SAMPLE_RATINGS, priceTarget: SAMPLE_TARGET });
    const stripped = strip(result);
    expect(stripped).toContain('med ₹165.00');
  });

  it('shows current price in target section', () => {
    const result = analystBar({ ratings: SAMPLE_RATINGS, priceTarget: SAMPLE_TARGET });
    const stripped = strip(result);
    expect(stripped).toContain('₹155.00');
  });

  it('handles zero total ratings', () => {
    const result = analystBar({ ratings: { buy: 0, hold: 0, sell: 0 } });
    expect(result).toMatchSnapshot();
    expect(strip(result)).toContain('0 Buy');
    expect(strip(result)).toContain('0 Hold');
    expect(strip(result)).toContain('0 Sell');
  });

  it('handles all-buy ratings', () => {
    const result = analystBar({ ratings: { buy: 20, hold: 0, sell: 0 } });
    expect(result).toMatchSnapshot();
    expect(strip(result)).toContain('20 Buy');
  });

  it('handles all-sell ratings', () => {
    const result = analystBar({ ratings: { buy: 0, hold: 0, sell: 10 } });
    expect(result).toMatchSnapshot();
    expect(strip(result)).toContain('10 Sell');
  });

  it('handles missing ratings fields (defaults to 0)', () => {
    const result = analystBar({ ratings: { buy: 5 } });
    const stripped = strip(result);
    expect(stripped).toContain('5 Buy');
    expect(stripped).toContain('0 Hold');
    expect(stripped).toContain('0 Sell');
  });

  it('renders without price target (single line)', () => {
    const result = analystBar({ ratings: SAMPLE_RATINGS });
    // Without price target, no blank line or PT section
    expect(result.split('\n')).toHaveLength(1);
  });

  it('renders with price target (multi-line)', () => {
    const result = analystBar({ ratings: SAMPLE_RATINGS, priceTarget: SAMPLE_TARGET });
    // With price target: bar + blank + PT range + overflow labels = 3-4 lines
    const lineCount = result.split('\n').length;
    expect(lineCount).toBeGreaterThanOrEqual(3);
    expect(lineCount).toBeLessThanOrEqual(4);
  });

  it('renders custom width', () => {
    const result = analystBar({ ratings: SAMPLE_RATINGS, width: 80 });
    expect(result).toMatchSnapshot();
  });

  it('target dot positions correctly when current is at low', () => {
    const result = analystBar({
      ratings: SAMPLE_RATINGS,
      priceTarget: { current: 130.00, low: 130.00, median: 160.00, high: 190.00 },
    });
    expect(result).toMatchSnapshot();
  });

  it('target dot positions correctly when current is at high', () => {
    const result = analystBar({
      ratings: SAMPLE_RATINGS,
      priceTarget: { current: 190.00, low: 130.00, median: 160.00, high: 190.00 },
    });
    expect(result).toMatchSnapshot();
  });

  // Theme variants
  it('renders in bloomberg theme', () => {
    setTheme('bloomberg');
    const result = analystBar({ ratings: SAMPLE_RATINGS, priceTarget: SAMPLE_TARGET });
    expect(result).toMatchSnapshot();
  });

  it('renders in dracula theme', () => {
    setTheme('dracula');
    const result = analystBar({ ratings: SAMPLE_RATINGS, priceTarget: SAMPLE_TARGET });
    expect(result).toMatchSnapshot();
  });

  it('renders in monochrome theme', () => {
    setTheme('monochrome');
    const result = analystBar({ ratings: SAMPLE_RATINGS, priceTarget: SAMPLE_TARGET });
    expect(result).toMatchSnapshot();
  });
});
