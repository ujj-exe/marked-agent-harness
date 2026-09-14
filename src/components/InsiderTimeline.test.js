import { describe, it, expect, beforeEach } from 'vitest';
import { insiderTimeline } from './InsiderTimeline.js';
import { setTheme } from '../themes.js';
import { strip } from '../ansi.js';

const SAMPLE_TRANSACTIONS = [
  { date: '2024-01-15', name: 'John Smith', type: 'buy',  shares: 10000,  amount: 250000  },
  { date: '2024-02-03', name: 'Jane Doe',   type: 'sell', shares: 5000,   amount: 125000  },
  { date: '2024-03-20', name: 'Bob Carter', type: 'buy',  shares: 50000,  amount: 1200000 },
  { date: '2024-04-01', name: 'Alice Wong', type: 'sell', shares: 100000, amount: 3500000 },
];

beforeEach(() => setTheme('terminal-cyan'));

describe('insiderTimeline', () => {
  it('renders a basic timeline snapshot', () => {
    const result = insiderTimeline({ transactions: SAMPLE_TRANSACTIONS, width: 80 });
    expect(result).toMatchSnapshot();
  });

  it('shows BUY entries with up arrow marker', () => {
    const result = insiderTimeline({ transactions: SAMPLE_TRANSACTIONS });
    const stripped = strip(result);
    expect(stripped).toContain('▲');
    expect(stripped).toContain('BUY');
  });

  it('shows SELL entries with down arrow marker', () => {
    const result = insiderTimeline({ transactions: SAMPLE_TRANSACTIONS });
    const stripped = strip(result);
    expect(stripped).toContain('▼');
    expect(stripped).toContain('SELL');
  });

  it('displays formatted dates', () => {
    const result = insiderTimeline({ transactions: SAMPLE_TRANSACTIONS });
    const stripped = strip(result);
    expect(stripped).toContain('Jan 15');
    expect(stripped).toContain('Feb 3');
  });

  it('displays insider names', () => {
    const result = insiderTimeline({ transactions: SAMPLE_TRANSACTIONS });
    const stripped = strip(result);
    expect(stripped).toContain('John Smith');
    expect(stripped).toContain('Jane Doe');
  });

  it('formats share counts compactly', () => {
    const result = insiderTimeline({ transactions: SAMPLE_TRANSACTIONS });
    const stripped = strip(result);
    // 50000 → "50.0K", 100000 → "100.0K"
    expect(stripped).toContain('K');
  });

  it('formats dollar amounts compactly', () => {
    const result = insiderTimeline({ transactions: SAMPLE_TRANSACTIONS });
    const stripped = strip(result);
    // 1200000 → "$1.2M", 3500000 → "$3.5M"
    expect(stripped).toContain('$');
    expect(stripped).toContain('M');
  });

  it('renders with narrow width', () => {
    const result = insiderTimeline({ transactions: SAMPLE_TRANSACTIONS, width: 60 });
    expect(result).toMatchSnapshot();
  });

  it('renders a single buy transaction', () => {
    const result = insiderTimeline({
      transactions: [{ date: '2024-06-01', name: 'CEO Name', type: 'buy', shares: 1000, amount: 50000 }],
      width: 80,
    });
    const stripped = strip(result);
    expect(stripped).toContain('BUY');
    expect(stripped).toContain('CEO Name');
    expect(result).toMatchSnapshot();
  });

  it('renders a single sell transaction', () => {
    const result = insiderTimeline({
      transactions: [{ date: '2024-06-01', name: 'CFO Name', type: 'sell', shares: 2000, amount: 80000 }],
      width: 80,
    });
    const stripped = strip(result);
    expect(stripped).toContain('SELL');
    expect(result).toMatchSnapshot();
  });

  it('handles empty transactions', () => {
    const result = insiderTimeline({ transactions: [] });
    expect(strip(result)).toContain('No insider');
  });

  it('handles missing amount', () => {
    const result = insiderTimeline({
      transactions: [{ date: '2024-01-01', name: 'Test', type: 'buy', shares: 500, amount: null }],
    });
    expect(strip(result)).toContain('—');
  });

  it('handles large billion-dollar amounts', () => {
    const result = insiderTimeline({
      transactions: [{ date: '2024-01-01', name: 'Buffett', type: 'buy', shares: 1000000, amount: 2500000000 }],
    });
    const stripped = strip(result);
    expect(stripped).toContain('$2.5B');
  });

  it('renders in dracula theme', () => {
    setTheme('dracula');
    const result = insiderTimeline({ transactions: SAMPLE_TRANSACTIONS, width: 80 });
    expect(result).toMatchSnapshot();
  });

  it('renders in bloomberg theme', () => {
    setTheme('bloomberg');
    const result = insiderTimeline({ transactions: SAMPLE_TRANSACTIONS, width: 80 });
    expect(result).toMatchSnapshot();
  });

  it('renders in monochrome theme', () => {
    setTheme('monochrome');
    const result = insiderTimeline({ transactions: SAMPLE_TRANSACTIONS, width: 80 });
    expect(result).toMatchSnapshot();
  });
});
