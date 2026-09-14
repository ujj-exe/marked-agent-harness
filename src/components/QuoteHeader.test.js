import { describe, it, expect, beforeEach } from 'vitest';
import { quoteHeader } from './QuoteHeader.js';
import { setTheme } from '../themes.js';
import { strip } from '../ansi.js';

beforeEach(() => setTheme('terminal-cyan'));

const NVDA = {
  ticker: 'NVDA',
  name: 'NVIDIA Corporation',
  price: 172.70,
  change: -6.42,
  changePct: -3.6,
  volume: 209_800_000,
  marketCap: 4_200_000_000_000,
  sparkData: [180, 185, 178, 175, 172, 170, 175, 180, 176, 172, 170, 173],
};

describe('QuoteHeader', () => {
  describe('full variant', () => {
    it('renders full header', () => {
      const result = quoteHeader({ ...NVDA, width: 80 });
      expect(result).toMatchSnapshot();
    });

    it('contains ticker and price', () => {
      const result = quoteHeader({ ...NVDA, width: 80 });
      const stripped = strip(result);
      expect(stripped).toContain('NVDA');
      expect(stripped).toContain('₹172.70');
    });

    it('contains company name', () => {
      const result = strip(quoteHeader({ ...NVDA, width: 80 }));
      expect(result).toContain('NVIDIA Corporation');
    });

    it('contains volume and market cap', () => {
      const result = strip(quoteHeader({ ...NVDA, width: 80 }));
      expect(result).toContain('209.8M');
      expect(result).toContain('₹4,20,000 Cr');
    });

    it('shows down arrow for negative change', () => {
      const result = strip(quoteHeader({ ...NVDA, width: 80 }));
      expect(result).toContain('▼');
    });

    it('shows up arrow for positive change', () => {
      const result = strip(quoteHeader({ ...NVDA, changePct: 2.5, width: 80 }));
      expect(result).toContain('▲');
    });

    it('renders without optional fields', () => {
      const result = quoteHeader({ ticker: 'AAPL', price: 250.30, width: 60 });
      expect(result).toMatchSnapshot();
      const stripped = strip(result);
      expect(stripped).toContain('AAPL');
      expect(stripped).toContain('₹250.30');
    });
  });

  describe('compact variant', () => {
    it('renders compact header', () => {
      const result = quoteHeader({ ...NVDA, variant: 'compact' });
      expect(result).toMatchSnapshot();
    });

    it('uses separator bars', () => {
      const result = strip(quoteHeader({ ...NVDA, variant: 'compact' }));
      expect(result).toContain('│');
    });

    it('contains key data', () => {
      const result = strip(quoteHeader({ ...NVDA, variant: 'compact' }));
      expect(result).toContain('NVDA');
      expect(result).toContain('₹172.70');
    });
  });

  describe('minimal variant', () => {
    it('renders minimal header', () => {
      const result = quoteHeader({ ...NVDA, variant: 'minimal' });
      expect(result).toMatchSnapshot();
    });

    it('contains only ticker, price, change', () => {
      const result = strip(quoteHeader({ ...NVDA, variant: 'minimal' }));
      expect(result).toContain('NVDA');
      expect(result).toContain('₹172.70');
      expect(result).toContain('-3.6%');
      // Should not contain volume
      expect(result).not.toContain('209.8M');
    });
  });

  describe('edge cases', () => {
    it('handles missing ticker', () => {
      const result = quoteHeader({ price: 100 });
      expect(strip(result)).toBe('—');
    });

    it('handles very large price', () => {
      const result = strip(quoteHeader({ ticker: 'BRK.A', price: 742_500, width: 60 }));
      expect(result).toContain('₹7,42,500.00');
    });

    it('handles very small price (crypto)', () => {
      const result = strip(quoteHeader({ ticker: 'SHIB', price: 0.00002341, width: 60 }));
      expect(result).toContain('₹0.0000');
    });

    it('handles zero change', () => {
      const result = quoteHeader({ ticker: 'SPY', price: 500, changePct: 0, width: 60 });
      expect(result).toMatchSnapshot();
    });
  });

  // Theme tests
  it('renders in solarized theme', () => {
    setTheme('solarized-dark');
    const result = quoteHeader({ ...NVDA, width: 80 });
    expect(result).toMatchSnapshot();
  });

  it('renders in bloomberg theme', () => {
    setTheme('bloomberg');
    const result = quoteHeader({ ...NVDA, variant: 'compact' });
    expect(result).toMatchSnapshot();
  });
});
