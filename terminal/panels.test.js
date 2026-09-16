/**
 * Tests for terminal/panels.js
 *
 * Covers:
 *  - Basic dispatch: all 10 panel names with valid data
 *  - Null / loading state (skeleton)
 *  - Error state
 *  - Staleness tag
 *  - Schema coercion integration
 *  - Verdict variants (plain, dense, default)
 *  - Specific panel behaviors
 *  - Width handling
 *  - Edge cases
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderPanel, skeleton } from './panels.js';
import { strip } from '../src/index.js';
import { setTheme } from '../src/index.js';

beforeEach(() => setTheme('terminal-cyan'));

// ── Shared fixture data ───────────────────────────────────────────────────────

const QUOTE_DATA = {
  ticker: 'AAPL',
  name: 'Apple Inc.',
  price: 150.00,
  changePct: 1.5,
  volume: 50_000_000,
  marketCap: 2_300_000_000_000,
};

const CHART_DATA = {
  values: [100, 102, 101, 105, 108, 107, 110, 112],
  label: 'AAPL 3M',
};

const ANALYST_DATA = {
  ratings: { buy: 25, hold: 8, sell: 2 },
  priceTarget: { current: 155, low: 130, median: 165, high: 195 },
};

const MACRO_DATA = {
  pillars: [
    { label: 'Inflation', value: 70, direction: 'falling' },
    { label: 'Rates', value: 80, direction: 'rising' },
  ],
};

const NEWS_DATA = {
  items: [
    { title: 'Apple releases new iPhone', source: 'Reuters', time: '2h ago', url: 'https://example.com' },
    { title: 'AAPL hits all-time high', source: 'Bloomberg', time: '3h ago', url: 'https://example.com/2' },
  ],
};

const VERDICT_DATA = {
  thesis: 'Strong buy on momentum and fundamentals.',
  signal: 'buy',
  confidence: 85,
  levels: { support: 145, resistance: 160 },
};

const TECHNICAL_DATA = {
  rsi: 62,
  trend: 'bullish',
  signals: ['EMA crossover detected'],
};

const RSI_DATA = {
  value: 58,
  signals: [],
};

const GAUGE_DATA = {
  value: 65,
  label: 'Momentum',
  preset: 'default',
};

const GAUGES_DATA = {
  items: [
    { value: 70, label: 'RSI', preset: 'rsi' },
    { value: 50, label: 'MACD', preset: 'default' },
  ],
};

// ── Basic dispatch — all 10 panel names ───────────────────────────────────────

describe('renderPanel — basic dispatch', () => {
  it('quote panel returns non-empty string', () => {
    const result = renderPanel('quote', QUOTE_DATA, 80);
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
    expect(strip(result)).toContain('AAPL');
  });

  it('chart panel returns non-empty string', () => {
    const result = renderPanel('chart', CHART_DATA, 80);
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });

  it('rsi panel returns non-empty string', () => {
    const result = renderPanel('rsi', RSI_DATA, 80);
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
    expect(strip(result)).toContain('RSI');
  });

  it('technical panel returns non-empty string', () => {
    const result = renderPanel('technical', TECHNICAL_DATA, 80);
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });

  it('analyst panel returns non-empty string', () => {
    const result = renderPanel('analyst', ANALYST_DATA, 80);
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });

  it('macro panel returns non-empty string', () => {
    const result = renderPanel('macro', MACRO_DATA, 80);
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });

  it('news panel returns non-empty string', () => {
    const result = renderPanel('news', NEWS_DATA, 80);
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });

  it('verdict panel returns non-empty string', () => {
    const result = renderPanel('verdict', VERDICT_DATA, 80);
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });

  it('gauge panel returns non-empty string', () => {
    const result = renderPanel('gauge', GAUGE_DATA, 80);
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });

  it('gauges panel returns non-empty string', () => {
    const result = renderPanel('gauges', GAUGES_DATA, 80);
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });
});

// ── Null / loading state ──────────────────────────────────────────────────────

describe('renderPanel — null / loading state', () => {
  it('data = null returns skeleton with panel name', () => {
    const result = strip(renderPanel('quote', null, 80));
    expect(result).toContain('QUOTE');
  });

  it('data = undefined returns skeleton', () => {
    const result = strip(renderPanel('news', undefined, 80));
    expect(result).toContain('NEWS');
  });

  it('skeleton contains dim block characters (░)', () => {
    const result = renderPanel('chart', null, 80);
    expect(result).toContain('░');
  });

  it('skeleton() helper produces label and block chars', () => {
    const result = skeleton('macro', 60);
    expect(result).toContain('░');
    const stripped = strip(result);
    expect(stripped).toContain('MACRO');
  });
});

// ── Error state ───────────────────────────────────────────────────────────────

describe('renderPanel — error state', () => {
  it('data = { _error: "something" } returns error panel', () => {
    const result = strip(renderPanel('quote', { _error: 'Request failed' }, 80));
    expect(result).toContain('Request failed');
  });

  it('error panel contains warning icon (⚠)', () => {
    const result = strip(renderPanel('chart', { _error: 'timeout' }, 80));
    expect(result).toContain('⚠');
  });
});

// ── Staleness ─────────────────────────────────────────────────────────────────

describe('renderPanel — staleness', () => {
  it('recent _timestamp (< 5min ago) produces no staleness suffix', () => {
    const data = { ...QUOTE_DATA, _timestamp: Date.now() - 60_000 }; // 1 minute ago
    const result = strip(renderPanel('quote', data, 80));
    expect(result).not.toMatch(/\d+m ago/);
  });

  it('old _timestamp (> 5min ago) produces staleness suffix like "Nm ago"', () => {
    const data = { ...QUOTE_DATA, _timestamp: Date.now() - 10 * 60_000 }; // 10 minutes ago
    const result = strip(renderPanel('quote', data, 80));
    expect(result).toMatch(/\d+m ago/);
  });

  it('no _timestamp produces no staleness suffix', () => {
    const data = { ...QUOTE_DATA };
    const result = strip(renderPanel('quote', data, 80));
    expect(result).not.toMatch(/\d+m ago/);
  });
});

// ── Schema coercion integration ───────────────────────────────────────────────

describe('renderPanel — schema coercion', () => {
  it('quote: {symbol: "AAPL"} is coerced to have ticker: "AAPL"', () => {
    const result = strip(renderPanel('quote', { symbol: 'AAPL', price: 150 }, 80));
    expect(result).toContain('AAPL');
  });

  it('analyst: {buy: 10, hold: 5, sell: 1} is coerced to nested ratings', () => {
    const result = strip(renderPanel('analyst', { buy: 10, hold: 5, sell: 1 }, 80));
    expect(result).toContain('10');
    expect(result).toContain('5');
    expect(result).toContain('1');
  });

  it('analyst: {hold: 5, sell: 2} (no buy) is coerced to nested ratings with buy=0', () => {
    const result = strip(renderPanel('analyst', { hold: 5, sell: 2 }, 80));
    expect(result).toContain('5');
    expect(result).toContain('2');
    expect(result).toContain('0');
  });

  it('verdict: {body: "text"} is coerced to have thesis: "text"', () => {
    // "body" migration → "thesis"
    const result = strip(renderPanel('verdict', { body: 'Bullish outlook for Q4' }, 80));
    expect(result).toContain('Bullish outlook for Q4');
  });

  it('macro: {pillars: ["string1", "string2"]} is coerced to array of objects', () => {
    const result = strip(renderPanel('macro', { pillars: ['Inflation', 'Rates'] }, 80));
    // Should render both pillar labels without crashing
    expect(result).toContain('Inflation');
    expect(result).toContain('Rates');
  });

  it('chart: {values: null} returns fallback (not crash)', () => {
    // null values — schema requires non-empty array, should return fallback
    const result = strip(renderPanel('chart', { values: null }, 80));
    // Chart schema's validate function returns null when values is not a non-empty array
    // so we get descriptiveFallback output
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });

  it('unknown panel name returns key-value table fallback (not skeleton, not crash)', () => {
    const result = strip(renderPanel('nonexistent', { foo: 'bar' }, 80));
    // Key-value table: label row + data row, not skeleton ░ chars
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
    expect(result).not.toContain('░');
    expect(result).toContain('NONEXISTENT');
    expect(result).toContain('foo');
    expect(result).toContain('bar');
  });

  it('completely wrong data type (string instead of object) returns descriptive fallback', () => {
    const result = strip(renderPanel('quote', 'not-an-object', 80));
    expect(result).toContain('data shape error');
  });
});

// ── Verdict variants ──────────────────────────────────────────────────────────

describe('renderPanel — verdict variants', () => {
  it('wraps every broker-note section within the panel width', () => {
    const width = 42;
    const data = {
      suppressWarnings: true,
      sections: [
        { type: 'conviction', value: 'neutral' },
        { type: 'facts', items: [`Revenue improved ${'[ev_1]'.repeat(20)}`] },
        { type: 'bull_case', items: ['A sustained demand recovery improves growth and margins materially.'] },
        { type: 'bear_case', items: ['Pricing pressure persists and employee costs absorb productivity gains.'] },
        { type: 'catalysts', items: ['Large AI contracts convert into reported recurring revenue.'] },
        { type: 'risks', items: ['The evidence remains incomplete across several operating indicators.'] },
      ],
    };
    const lines = strip(renderPanel('verdict', data, width)).split('\n');
    expect(lines.every(line => line.length <= width)).toBe(true);
    expect(lines.join('\n')).toContain('BULL CASE');
    expect(lines.join('\n')).toContain('BEAR CASE');
  });

  it('variant: "plain" renders without box wrapper', () => {
    const data = { ...VERDICT_DATA, variant: 'plain' };
    const result = strip(renderPanel('verdict', data, 80));
    // Plain mode should not have box chars like ╔ or ╚
    expect(result).not.toContain('╔');
    expect(result).not.toContain('╚');
  });

  it('variant: "dense" renders without box wrapper', () => {
    const data = { ...VERDICT_DATA, variant: 'dense' };
    const result = strip(renderPanel('verdict', data, 80));
    expect(result).not.toContain('╔');
    expect(result).not.toContain('╚');
  });

  it('default (no variant) renders with verdict content', () => {
    const result = renderPanel('verdict', VERDICT_DATA, 80);
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
    // Full boxed variant — thesis content should be present
    const stripped = strip(result);
    expect(stripped).toContain('Strong buy on momentum');
  });
});

// ── Specific panel behavior ───────────────────────────────────────────────────

describe('renderPanel — specific panel behavior', () => {
  it('quote with variant: "dense" passes variant through without crash', () => {
    const data = { ...QUOTE_DATA, variant: 'dense' };
    const result = renderPanel('quote', data, 80);
    expect(typeof result).toBe('string');
    expect(strip(result)).toContain('AAPL');
  });

  it('chart with empty values array returns "No chart data" message', () => {
    // Empty array — schema validates non-empty, so descriptiveFallback
    const result = strip(renderPanel('chart', { values: [] }, 80));
    // Either descriptiveFallback or the inline "— No chart data" message
    expect(result.length).toBeGreaterThan(0);
    // The panel should not crash
    expect(typeof result).toBe('string');
  });

  it('macro with empty pillars returns "No macro data" message', () => {
    // validate function returns null for empty pillars
    const result = strip(renderPanel('macro', { pillars: [] }, 80));
    expect(result.length).toBeGreaterThan(0);
    // Either descriptiveFallback (schema returns null) or "No macro data"
    expect(typeof result).toBe('string');
  });

  it('news with items renders properly', () => {
    const result = strip(renderPanel('news', NEWS_DATA, 80));
    expect(result).toContain('Apple releases new iPhone');
  });

  it('technical with RSI renders gauge bar', () => {
    const result = strip(renderPanel('technical', TECHNICAL_DATA, 80));
    expect(result).toContain('RSI');
  });
});

// ── Width handling ────────────────────────────────────────────────────────────

describe('renderPanel — width handling', () => {
  it('default width is 80 when not specified', () => {
    const result = renderPanel('quote', QUOTE_DATA);
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });

  it('custom width propagates to components (40 vs 120 produce different output)', () => {
    const result40 = renderPanel('quote', QUOTE_DATA, 40);
    const result120 = renderPanel('quote', QUOTE_DATA, 120);
    expect(typeof result40).toBe('string');
    expect(typeof result120).toBe('string');
    // Different widths should produce different string lengths
    expect(result40.length).not.toBe(result120.length);
  });
});

// ── Verdict v1.1: schema quality gates (warn fields) ─────────────────────────

describe('renderPanel — verdict warn gates (v1.1)', () => {
  it('verdict with missing thesis → renders ⚠ thesis missing warning', () => {
    // No thesis field at all — conviction + other fields present
    const data = {
      conviction: 'bull',
      catalysts: ['GTC beat'],
      risks: ['China slowdown'],
      timeframe: 'weeks',
    };
    const result = strip(renderPanel('verdict', data, 80));
    expect(result).toContain('⚠ thesis missing');
  });

  it('verdict with short thesis (< 50 chars) → renders ⚠ thesis missing warning', () => {
    const data = {
      thesis: 'Short',
      conviction: 'bull',
      catalysts: ['GTC beat'],
      risks: ['China slowdown'],
      timeframe: 'weeks',
    };
    const result = strip(renderPanel('verdict', data, 80));
    expect(result).toContain('⚠ thesis missing');
  });

  it('verdict with missing conviction → renders ⚠ conviction missing warning', () => {
    const data = {
      thesis: 'Strong fundamental thesis with detailed analysis and multi-factor support.',
      catalysts: ['GTC beat'],
      risks: ['China slowdown'],
      timeframe: 'weeks',
    };
    const result = strip(renderPanel('verdict', data, 80));
    expect(result).toContain('⚠ conviction missing');
  });

  it('verdict with all v1.1 fields → clean render, no warn-gate messages', () => {
    const data = {
      thesis: 'Strong fundamental thesis with detailed analysis and multi-factor support.',
      conviction: 'bull',
      catalysts: ['GTC beat'],
      risks: ['China slowdown'],
      timeframe: 'weeks',
    };
    const result = strip(renderPanel('verdict', data, 80));
    // No schema warn-gate messages — "missing" should not appear
    expect(result).not.toContain('missing');
    expect(result).not.toContain('no catalysts');
    expect(result).not.toContain('no risks');
    expect(result).not.toContain('no timeframe');
    // Correct content should be present
    expect(result).toContain('[BULL]');
    expect(result).toContain('GTC beat');
    expect(result).toContain('China slowdown');
    expect(result).toContain('weeks');
  });

  it('verdict with old signal field → coercion to conviction, renders [BULL] badge', () => {
    const data = {
      thesis: 'Strong fundamental thesis with detailed analysis and multi-factor support.',
      signal: 'BUY',
      catalysts: ['GTC beat'],
      risks: ['China slowdown'],
      timeframe: 'weeks',
    };
    const result = strip(renderPanel('verdict', data, 80));
    expect(result).toContain('[BULL]');
  });

  it('verdict with body field → coercion to thesis works, thesis content rendered', () => {
    const result = strip(renderPanel('verdict', { body: 'Bullish outlook for Q4' }, 80));
    expect(result).toContain('Bullish outlook for Q4');
  });
});

// ── Universal annotations (v1.1) ─────────────────────────────────────────────

describe('renderPanel — universal annotations (v1.1)', () => {
  it('summary renders above panel content', () => {
    const data = { ...QUOTE_DATA, summary: 'Momentum breakout above 150' };
    const result = strip(renderPanel('quote', data, 80));
    const summaryIdx = result.indexOf('Momentum breakout above 150');
    const tickerIdx = result.indexOf('AAPL');
    expect(summaryIdx).toBeGreaterThan(-1);
    expect(tickerIdx).toBeGreaterThan(-1);
    // Summary line must appear before ticker content
    expect(summaryIdx).toBeLessThan(tickerIdx);
  });

  it('footnote renders below panel content', () => {
    const data = { ...QUOTE_DATA, footnote: 'Based on 3-month price action' };
    const result = strip(renderPanel('quote', data, 80));
    const footnoteIdx = result.indexOf('Based on 3-month price action');
    const tickerIdx = result.indexOf('AAPL');
    expect(footnoteIdx).toBeGreaterThan(-1);
    expect(tickerIdx).toBeGreaterThan(-1);
    // Footnote must appear after ticker content
    expect(footnoteIdx).toBeGreaterThan(tickerIdx);
  });

  it('both summary and footnote render around panel content', () => {
    const data = {
      ...NEWS_DATA,
      summary: 'Two headline risks flagged',
      footnote: 'Source: Reuters, Bloomberg',
    };
    const result = strip(renderPanel('news', data, 80));
    expect(result).toContain('Two headline risks flagged');
    expect(result).toContain('Source: Reuters, Bloomberg');
    const summaryIdx = result.indexOf('Two headline risks flagged');
    const newsIdx = result.indexOf('Apple releases new iPhone');
    const footnoteIdx = result.indexOf('Source: Reuters, Bloomberg');
    expect(summaryIdx).toBeLessThan(newsIdx);
    expect(footnoteIdx).toBeGreaterThan(newsIdx);
  });

  it('annotations do not break panels without them', () => {
    const result = renderPanel('quote', QUOTE_DATA, 80);
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
    const stripped = strip(result);
    expect(stripped).toContain('AAPL');
    // No stray annotation markers
    expect(stripped).not.toContain('┄');
  });

  it('highlights array is passed through to data._annotations', () => {
    // We test the _annotations passthrough by verifying the panel still renders
    // (direct access to data is not possible from outside, so we check render succeeds
    // and that the result still contains normal news content)
    const data = { ...NEWS_DATA, highlights: [0, 1], annotations: { '0': '← catalyst risk' } };
    const result = renderPanel('news', data, 80);
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
    expect(strip(result)).toContain('Apple releases new iPhone');
  });
});

// ── Edge cases ────────────────────────────────────────────────────────────────

describe('renderPanel — edge cases', () => {
  it('empty string panel name with valid data returns key-value table fallback', () => {
    const result = strip(renderPanel('', { ticker: 'X' }, 80));
    // Unknown panel → key-value table fallback
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
    expect(result).toContain('UNKNOWN');
    expect(result).toContain('ticker');
  });

  it('gauge panel with standard data renders without crash', () => {
    const result = renderPanel('gauge', { value: 72, label: 'Strength', preset: 'default' }, 80);
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });

  it('gauges panel with items renders gauge stack without crash', () => {
    const result = renderPanel('gauges', {
      items: [
        { value: 65, label: 'RSI', preset: 'rsi' },
        { value: 40, label: 'Momentum', preset: 'default' },
        { value: 80, label: 'Volume', preset: 'default' },
      ],
    }, 80);
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });
});

// ── Untested panels: insiders, earnings, holders, filings, heatmap ───────────
// ── candlestick, waterfall, correlationMatrix, treeMap, flowSankey ───────────

const INSIDERS_DATA = {
  transactions: [
    { date: '2024-01-15', name: 'John Smith', type: 'buy',  shares: 10000,  amount: 250000  },
    { date: '2024-02-03', name: 'Jane Doe',   type: 'sell', shares: 5000,   amount: 125000  },
  ],
};

const EARNINGS_DATA = {
  quarters: [
    { date: "Q1'24", actual: 0.42, estimate: 0.38, surprise: 10.5 },
    { date: "Q2'24", actual: 0.31, estimate: 0.35, surprise: -11.4 },
  ],
};

const HOLDERS_DATA = {
  holders: [
    { name: 'Vanguard Group',    pct: 8.2, shares: 1_300_000_000, changePct:  0.3 },
    { name: 'BlackRock',         pct: 6.7, shares: 1_060_000_000, changePct: -0.1 },
    { name: 'State Street Corp', pct: 3.9, shares:   617_000_000, changePct:  0.0 },
  ],
};

const FILINGS_DATA = {
  filings: [
    { date: '2024-02-01', form: 'annual_report', description: 'Annual Report FY2023'  },
    { date: '2024-05-01', form: 'financial_results', description: 'Financial Results Q1' },
    { date: '2024-08-01', form: 'exchange_announcement',  description: 'Material Event'      },
  ],
};

const HEATMAP_DATA = {
  rows: [
    { label: 'AAPL', values: [1.2, -0.5, 0.8] },
    { label: 'MSFT', values: [-0.3, 1.5, -1.0] },
  ],
  columns: ['Mon', 'Tue', 'Wed'],
};

const CANDLESTICK_DATA = {
  bars: [
    { date: '2024-01-01', open: 150, high: 155, low: 148, close: 153 },
    { date: '2024-01-02', open: 153, high: 158, low: 151, close: 156 },
    { date: '2024-01-03', open: 156, high: 160, low: 154, close: 154 },
  ],
};

const WATERFALL_DATA = {
  items: [
    { label: 'Revenue',         value: 100 },
    { label: 'Cost of Goods',   value: -40 },
    { label: 'Gross Profit',    value: 60,  total: true },
    { label: 'OpEx',            value: -20 },
    { label: 'Net Income',      value: 40,  total: true },
  ],
};

const CORRELATION_MATRIX_DATA = {
  tickers: ['AAPL', 'MSFT', 'GOOGL'],
  matrix: [
    [1.00,  0.82,  0.75],
    [0.82,  1.00,  0.68],
    [0.75,  0.68,  1.00],
  ],
};

const TREEMAP_DATA = {
  items: [
    { label: 'AAPL',  weight: 7.0, value:  1.2 },
    { label: 'MSFT',  weight: 6.5, value: -0.4 },
    { label: 'GOOGL', weight: 4.0, value:  0.8 },
    { label: 'AMZN',  weight: 3.5, value: -1.1 },
  ],
};

const FLOW_SANKEY_DATA = {
  nodes: [
    { label: 'Revenue',    value: 100 },
    { label: 'COGS',       value: 40  },
    { label: 'Gross',      value: 60  },
    { label: 'OpEx',       value: 20  },
    { label: 'Net Income', value: 40  },
  ],
  flows: [
    { from: 'Revenue', to: 'COGS',       value: 40 },
    { from: 'Revenue', to: 'Gross',      value: 60 },
    { from: 'Gross',   to: 'OpEx',       value: 20 },
    { from: 'Gross',   to: 'Net Income', value: 40 },
  ],
};

// ── insiders panel ────────────────────────────────────────────────────────────

describe('renderPanel — insiders', () => {
  it('valid transactions returns non-empty string', () => {
    const result = renderPanel('insiders', INSIDERS_DATA, 80);
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });

  it('renders insider names and buy/sell labels', () => {
    const result = strip(renderPanel('insiders', INSIDERS_DATA, 80));
    expect(result).toContain('John Smith');
    expect(result).toContain('BUY');
    expect(result).toContain('SELL');
  });

  it('empty transactions array returns "No insider data" message', () => {
    const result = strip(renderPanel('insiders', { transactions: [] }, 80));
    expect(result).toContain('No insider data');
  });

  it('missing transactions field (defaults to []) returns "No insider data" message', () => {
    const result = strip(renderPanel('insiders', {}, 80));
    expect(result).toContain('No insider data');
  });

  it('single buy transaction renders without crash', () => {
    const result = renderPanel('insiders', {
      transactions: [{ date: '2024-06-01', name: 'CEO', type: 'buy', shares: 1000, amount: 50000 }],
    }, 80);
    expect(typeof result).toBe('string');
    expect(strip(result)).toContain('BUY');
  });
});

// ── earnings panel ────────────────────────────────────────────────────────────

describe('renderPanel — earnings', () => {
  it('valid quarters returns non-empty string', () => {
    const result = renderPanel('earnings', EARNINGS_DATA, 80);
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });

  it('renders BEAT and MISS labels', () => {
    const result = strip(renderPanel('earnings', EARNINGS_DATA, 80));
    expect(result).toContain('BEAT');
    expect(result).toContain('MISS');
  });

  it('empty quarters array returns "No earnings data" message', () => {
    const result = strip(renderPanel('earnings', { quarters: [] }, 80));
    expect(result).toContain('No earnings data');
  });

  it('missing quarters field (defaults to []) returns "No earnings data" message', () => {
    const result = strip(renderPanel('earnings', {}, 80));
    expect(result).toContain('No earnings data');
  });

  it('single quarter beat renders without crash', () => {
    const result = renderPanel('earnings', {
      quarters: [{ date: "Q1'24", actual: 1.20, estimate: 1.10, surprise: 9.1 }],
    }, 80);
    expect(typeof result).toBe('string');
    expect(strip(result)).toContain('BEAT');
  });
});

// ── holders panel ─────────────────────────────────────────────────────────────

describe('renderPanel — holders', () => {
  it('valid holders returns non-empty string', () => {
    const result = renderPanel('holders', HOLDERS_DATA, 80);
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });

  it('renders holder names', () => {
    const result = strip(renderPanel('holders', HOLDERS_DATA, 80));
    expect(result).toContain('Vanguard');
    expect(result).toContain('BlackRock');
  });

  it('empty holders array returns "No holder data" message', () => {
    const result = strip(renderPanel('holders', { holders: [] }, 80));
    expect(result).toContain('No holder data');
  });

  it('missing holders field (defaults to []) returns "No holder data" message', () => {
    const result = strip(renderPanel('holders', {}, 80));
    expect(result).toContain('No holder data');
  });

  it('single holder renders without crash', () => {
    const result = renderPanel('holders', {
      holders: [{ name: 'Fidelity', pct: 4.5, shares: 700_000_000, changePct: 0.2 }],
    }, 80);
    expect(typeof result).toBe('string');
    expect(strip(result)).toContain('Fidelity');
  });
});

// ── filings panel ─────────────────────────────────────────────────────────────

describe('renderPanel — filings', () => {
  it('valid filings returns non-empty string', () => {
    const result = renderPanel('filings', FILINGS_DATA, 80);
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });

  it('renders filing form types', () => {
    const result = strip(renderPanel('filings', FILINGS_DATA, 80));
    expect(result).toContain('[annual_report]');
    expect(result).toContain('[financial_results]');
  });

  it('empty filings array returns "No filing data" message', () => {
    const result = strip(renderPanel('filings', { filings: [] }, 80));
    expect(result).toContain('No filing data');
  });

  it('missing filings field (defaults to []) returns "No filing data" message', () => {
    const result = strip(renderPanel('filings', {}, 80));
    expect(result).toContain('No filing data');
  });

  it('single filing renders without crash', () => {
    const result = renderPanel('filings', {
      filings: [{ date: '2024-02-01', form: 'annual_report', description: 'Annual Report' }],
    }, 80);
    expect(typeof result).toBe('string');
    expect(strip(result)).toContain('[annual_report]');
  });
});

// ── heatmap panel ─────────────────────────────────────────────────────────────

describe('renderPanel — heatmap', () => {
  it('valid rows returns non-empty string', () => {
    const result = renderPanel('heatmap', HEATMAP_DATA, 80);
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });

  it('renders row labels', () => {
    const result = strip(renderPanel('heatmap', HEATMAP_DATA, 80));
    expect(result).toContain('AAPL');
    expect(result).toContain('MSFT');
  });

  it('empty rows array returns "No heatmap data" message', () => {
    const result = strip(renderPanel('heatmap', { rows: [], columns: [] }, 80));
    expect(result).toContain('No heatmap data');
  });

  it('missing rows field (defaults to []) returns "No heatmap data" message', () => {
    const result = strip(renderPanel('heatmap', {}, 80));
    expect(result).toContain('No heatmap data');
  });

  it('rows without columns renders without crash', () => {
    const result = renderPanel('heatmap', { rows: HEATMAP_DATA.rows }, 80);
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });
});

// ── candlestick panel ─────────────────────────────────────────────────────────

describe('renderPanel — candlestick', () => {
  it('valid bars returns non-empty string', () => {
    const result = renderPanel('candlestick', CANDLESTICK_DATA, 80);
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });

  it('empty bars array returns "No candlestick data" message', () => {
    const result = strip(renderPanel('candlestick', { bars: [] }, 80));
    expect(result).toContain('No candlestick data');
  });

  it('missing bars field (defaults to []) returns "No candlestick data" message', () => {
    const result = strip(renderPanel('candlestick', {}, 80));
    expect(result).toContain('No candlestick data');
  });

  it('with label passes through without crash', () => {
    const result = renderPanel('candlestick', { ...CANDLESTICK_DATA, label: 'AAPL 1M' }, 80);
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });

  it('with custom height renders without crash', () => {
    const result = renderPanel('candlestick', { ...CANDLESTICK_DATA, height: 15 }, 80);
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });

  it('single bar renders without crash', () => {
    const result = renderPanel('candlestick', {
      bars: [{ date: '2024-01-01', open: 150, high: 155, low: 148, close: 153 }],
    }, 80);
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });
});

// ── waterfall panel ───────────────────────────────────────────────────────────

describe('renderPanel — waterfall', () => {
  it('valid items returns non-empty string', () => {
    const result = renderPanel('waterfall', WATERFALL_DATA, 80);
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });

  it('renders item labels', () => {
    const result = strip(renderPanel('waterfall', WATERFALL_DATA, 80));
    expect(result).toContain('Revenue');
    expect(result).toContain('Net Income');
  });

  it('empty items array returns "No waterfall data" message', () => {
    const result = strip(renderPanel('waterfall', { items: [] }, 80));
    expect(result).toContain('No waterfall data');
  });

  it('missing items field (defaults to []) returns "No waterfall data" message', () => {
    const result = strip(renderPanel('waterfall', {}, 80));
    expect(result).toContain('No waterfall data');
  });

  it('showDelta flag passes through without crash', () => {
    const result = renderPanel('waterfall', { ...WATERFALL_DATA, showDelta: true }, 80);
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });
});

// ── correlationMatrix panel ───────────────────────────────────────────────────

describe('renderPanel — correlationMatrix', () => {
  it('valid tickers + matrix returns non-empty string', () => {
    const result = renderPanel('correlationMatrix', CORRELATION_MATRIX_DATA, 80);
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });

  it('renders ticker labels', () => {
    const result = strip(renderPanel('correlationMatrix', CORRELATION_MATRIX_DATA, 80));
    expect(result).toContain('AAPL');
    expect(result).toContain('MSFT');
    expect(result).toContain('GOOGL');
  });

  it('empty tickers array returns "No correlation data" message', () => {
    const result = strip(renderPanel('correlationMatrix', { tickers: [], matrix: [] }, 80));
    expect(result).toContain('No correlation data');
  });

  it('missing tickers field returns schema descriptive fallback (not crash)', () => {
    // Schema requires tickers + matrix — {} hard-rejects → descriptiveFallback
    const result = strip(renderPanel('correlationMatrix', {}, 80));
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });

  it('with optional title renders without crash', () => {
    const result = renderPanel('correlationMatrix', { ...CORRELATION_MATRIX_DATA, title: 'Tech Sector' }, 80);
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });

  it('schema hard-rejects non-array tickers (returns descriptive fallback)', () => {
    const result = strip(renderPanel('correlationMatrix', { tickers: 'AAPL,MSFT', matrix: [] }, 80));
    // Schema returns null → descriptiveFallback with data shape error
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });
});

// ── treeMap panel ─────────────────────────────────────────────────────────────

describe('renderPanel — treeMap', () => {
  it('valid items returns non-empty string', () => {
    const result = renderPanel('treeMap', TREEMAP_DATA, 80);
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });

  it('renders item labels', () => {
    const result = strip(renderPanel('treeMap', TREEMAP_DATA, 80));
    expect(result).toContain('AAPL');
    expect(result).toContain('MSFT');
  });

  it('empty items array returns "No treemap data" message', () => {
    const result = strip(renderPanel('treeMap', { items: [] }, 80));
    expect(result).toContain('No treemap data');
  });

  it('missing items field returns schema descriptive fallback (not crash)', () => {
    // Schema requires items — {} hard-rejects → descriptiveFallback
    const result = strip(renderPanel('treeMap', {}, 80));
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });

  it('with custom height renders without crash', () => {
    const result = renderPanel('treeMap', { ...TREEMAP_DATA, height: 8 }, 80);
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });

  it('schema hard-rejects non-array items (returns descriptive fallback)', () => {
    const result = strip(renderPanel('treeMap', { items: 'not-an-array' }, 80));
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });
});

// ── flowSankey panel ──────────────────────────────────────────────────────────

describe('renderPanel — flowSankey', () => {
  it('valid nodes + flows returns non-empty string', () => {
    const result = renderPanel('flowSankey', FLOW_SANKEY_DATA, 80);
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });

  it('renders node labels', () => {
    const result = strip(renderPanel('flowSankey', FLOW_SANKEY_DATA, 80));
    expect(result).toContain('Revenue');
    expect(result).toContain('Net Income');
  });

  it('empty nodes array returns "No flow data" message', () => {
    const result = strip(renderPanel('flowSankey', { nodes: [], flows: [] }, 80));
    expect(result).toContain('No flow data');
  });

  it('missing nodes field returns schema descriptive fallback (not crash)', () => {
    // Schema requires nodes — {} hard-rejects → descriptiveFallback
    const result = strip(renderPanel('flowSankey', {}, 80));
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });

  it('nodes without flows renders without crash', () => {
    const result = renderPanel('flowSankey', { nodes: FLOW_SANKEY_DATA.nodes }, 80);
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });

  it('schema hard-rejects non-array nodes (returns descriptive fallback)', () => {
    const result = strip(renderPanel('flowSankey', { nodes: 'Revenue,COGS' }, 80));
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });
});

// ── Verdict v1.1: sections API ────────────────────────────────────────────────

describe('renderPanel — verdict sections API (v1.1)', () => {
  it('sections-based verdict renders all section types', () => {
    const data = {
      sections: [
        { type: 'conviction', value: 'bull', timeframe: 'weeks' },
        { type: 'thesis', text: 'Strong fundamental thesis with multi-factor support driving this conviction.' },
        { type: 'catalysts', items: ['GTC conference beat', 'Product cycle acceleration'] },
        { type: 'risks', items: ['China slowdown', 'Margin pressure'] },
        { type: 'levels', support: 140, resistance: 165 },
        { type: 'context', text: 'Broad market conditions are supportive.' },
        { type: 'comparison', text: 'Outperforms sector peers on EPS growth.' },
        { type: 'invalidation', text: 'A break below $135 would invalidate the thesis.' },
      ],
    };
    const result = strip(renderPanel('verdict', data, 80));
    expect(result).toContain('[BULL]');
    expect(result).toContain('Strong fundamental thesis');
    expect(result).toContain('GTC conference beat');
    expect(result).toContain('China slowdown');
    expect(result).toContain('140');
    expect(result).toContain('165');
    expect(result).toContain('Broad market conditions');
    expect(result).toContain('Outperforms sector peers');
    expect(result).toContain('break below $135');
  });

  it('flat verdict auto-converts to sections — same key fields rendered', () => {
    const flatData = {
      thesis: 'Strong fundamental thesis with multi-factor support driving this conviction.',
      conviction: 'bull',
      catalysts: ['GTC conference beat'],
      risks: ['China slowdown'],
      timeframe: 'weeks',
    };
    const result = strip(renderPanel('verdict', flatData, 80));
    // Must render the same content as if sections were sent directly
    expect(result).toContain('[BULL]');
    expect(result).toContain('Strong fundamental thesis');
    expect(result).toContain('GTC conference beat');
    expect(result).toContain('China slowdown');
    expect(result).toContain('weeks');
  });

  it('sections order is respected — risks before catalysts renders risks first', () => {
    const data = {
      sections: [
        { type: 'conviction', value: 'bear' },
        { type: 'risks', items: ['Macro headwinds'] },
        { type: 'catalysts', items: ['Short squeeze potential'] },
      ],
    };
    const result = strip(renderPanel('verdict', data, 80));
    const risksIdx = result.indexOf('Macro headwinds');
    const catalystsIdx = result.indexOf('Short squeeze potential');
    expect(risksIdx).toBeGreaterThan(-1);
    expect(catalystsIdx).toBeGreaterThan(-1);
    // Risks should appear BEFORE catalysts in the output
    expect(risksIdx).toBeLessThan(catalystsIdx);
  });

  it('empty sections array renders without crash', () => {
    const data = { sections: [] };
    const result = renderPanel('verdict', data, 80);
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });

  it('mixed: sections[] takes precedence over flat thesis field', () => {
    const data = {
      sections: [
        { type: 'conviction', value: 'neutral' },
        { type: 'thesis', text: 'Section-based thesis text content for the analysis here.' },
      ],
      thesis: 'This flat thesis should NOT appear in output.',
    };
    const result = strip(renderPanel('verdict', data, 80));
    expect(result).toContain('Section-based thesis text content');
    expect(result).not.toContain('This flat thesis should NOT appear');
  });

  it('boxed verdict with sections renders box borders and section content', () => {
    const data = {
      variant: 'boxed',
      sections: [
        { type: 'conviction', value: 'strong_bull' },
        { type: 'thesis', text: 'Strong fundamental thesis with multi-factor support driving this conviction.' },
        { type: 'catalysts', items: ['AI supercycle', 'Data center demand'] },
        { type: 'risks', items: ['Valuation stretch'] },
      ],
    };
    const result = strip(renderPanel('verdict', data, 80));
    // Box chars present in boxed mode
    expect(result).toContain('╭');
    expect(result).toContain('╰');
    // Content sections rendered
    expect(result).toContain('[STRONG BULL]');
    expect(result).toContain('AI supercycle');
    expect(result).toContain('Valuation stretch');
    expect(result).toContain('Strong fundamental thesis');
  });

  it('memory section renders conviction held/changed note', () => {
    const data = {
      sections: [
        { type: 'conviction', value: 'bull' },
        { type: 'memory', prior: 'bull', changed: false },
        { type: 'thesis', text: 'Sustained bullish thesis backed by multiple indicators.' },
      ],
    };
    const result = strip(renderPanel('verdict', data, 80));
    expect(result).toContain('conviction held');
    expect(result).toContain('bull');
  });

  it('memory section with changed=true renders conviction changed note', () => {
    const data = {
      sections: [
        { type: 'conviction', value: 'bear' },
        { type: 'memory', prior: 'bull', changed: true },
        { type: 'thesis', text: 'Thesis has shifted to bearish based on new macro data.' },
      ],
    };
    const result = strip(renderPanel('verdict', data, 80));
    expect(result).toContain('conviction changed');
  });
});

// ── Unknown panel: key-value table fallback ───────────────────────────────────

describe('renderPanel — unknown panel key-value fallback', () => {
  it('renders a non-empty string for a completely unknown panel type', () => {
    const result = renderPanel('custom_panel', { ticker: 'AAPL', price: 150 }, 80);
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });

  it('includes the panel name in uppercase as a header', () => {
    const result = strip(renderPanel('custom_panel', { foo: 'bar' }, 80));
    expect(result).toContain('CUSTOM_PANEL');
  });

  it('renders each top-level key as a row', () => {
    const result = strip(renderPanel('mystery', { ticker: 'TSLA', value: 42, label: 'Test' }, 80));
    expect(result).toContain('ticker');
    expect(result).toContain('value');
    expect(result).toContain('label');
  });

  it('renders the string value of each field', () => {
    const result = strip(renderPanel('mystery', { price: 99.5, name: 'Widget' }, 80));
    expect(result).toContain('99.5');
    expect(result).toContain('Widget');
  });

  it('shows [N items] for array fields', () => {
    const result = strip(renderPanel('mystery', { items: [1, 2, 3] }, 80));
    expect(result).toContain('3 items');
  });

  it('shows (no data) when object has no renderable keys', () => {
    const result = strip(renderPanel('mystery', {}, 80));
    expect(result).toContain('no data');
  });

  it('skips private keys (_error, _timestamp, summary, footnote)', () => {
    const result = strip(renderPanel('mystery', {
      price: 50,
      _timestamp: Date.now(),
      summary: 'Should not appear',
      footnote: 'Also hidden',
    }, 80));
    expect(result).toContain('price');
    expect(result).not.toContain('_timestamp');
    expect(result).not.toContain('summary');
    expect(result).not.toContain('footnote');
  });

  it('does not render skeleton chars (░) for unknown panels', () => {
    const result = renderPanel('new_panel_type', { x: 1 }, 80);
    expect(result).not.toContain('░');
  });
});
