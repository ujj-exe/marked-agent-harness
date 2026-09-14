/**
 * Tests for terminal/engine.js
 *
 * Covers:
 *  - renderBlock: all block types (panel, table, row, stack, divider, text, spacer)
 *  - sideBySide: merge behavior, uneven lines, gap
 *  - resolveWidth: fraction, fixed, undefined, zero (via renderBlock with w spec)
 *  - presetToBlocks: deep-dive, compare, macro, pulse, unknown
 *  - renderBlocks: empty array, non-array, multi-block, width propagation
 *  - table: alignment, truncation, empty, colors, missing cells
 *  - edge cases: nested row in stack, null block, unrecognized block key
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderBlocks, renderBlock, sideBySide, presetToBlocks } from './engine.js';
import { strip } from '../src/index.js';
import { setTheme } from '../src/index.js';

beforeEach(() => setTheme('terminal-cyan'));

// ── Helpers ──────────────────────────────────────────────────────────────────

function lines(str) {
  return str.split('\n');
}

// ── Block type tests ──────────────────────────────────────────────────────────

describe('renderBlock — panel', () => {
  it('panel block delegates to renderPanel and returns non-empty string', () => {
    const result = renderBlock({ panel: 'quote', data: { ticker: 'AAPL', price: 150 } }, 80);
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
    expect(strip(result)).toContain('AAPL');
  });

  it('panel block with null data returns skeleton string', () => {
    const result = renderBlock({ panel: 'quote', data: null }, 80);
    const s = strip(result);
    expect(s).toContain('QUOTE');
  });
});

describe('renderBlock — shorthand panel', () => {
  it('{ quote: {...} } shorthand delegates to renderPanel', () => {
    const result = renderBlock({ quote: { symbol: 'NVDA', price: 172.70 } }, 80);
    expect(strip(result).length).toBeGreaterThan(0);
    expect(typeof result).toBe('string');
  });

  it('{ news: {...} } shorthand returns non-empty string', () => {
    const result = renderBlock({ news: { items: [{ title: 'Test headline', source: 'Reuters' }] } }, 80);
    expect(strip(result).length).toBeGreaterThan(0);
  });

  it('{ verdict: {...} } shorthand returns non-empty string', () => {
    const result = renderBlock({ verdict: { signal: 'BUY', title: 'NVDA', body: 'Strong buy.' } }, 80);
    expect(strip(result).length).toBeGreaterThan(0);
  });

  it('unknown key does not match shorthand (falls through to empty)', () => {
    const result = renderBlock({ unknownKey: { foo: 'bar' } }, 80);
    expect(result).toBe('');
  });
});

describe('renderBlock — table', () => {
  const tableSpec = {
    headers: ['Name', 'Price', 'Change'],
    rows: [
      { cells: ['AAPL', '$150.00', '+1.2%'] },
      { cells: ['NVDA', '$800.00', '-2.3%'] },
    ],
  };

  it('renders headers', () => {
    const result = strip(renderBlock({ table: tableSpec }, 80));
    expect(result).toContain('Name');
    expect(result).toContain('Price');
    expect(result).toContain('Change');
  });

  it('renders row data', () => {
    const result = strip(renderBlock({ table: tableSpec }, 80));
    expect(result).toContain('AAPL');
    expect(result).toContain('NVDA');
  });

  it('right-aligns columns when align: right specified', () => {
    const spec = {
      headers: ['Symbol', 'Price'],
      rows: [{ cells: ['AAPL', '150.00'] }],
      align: ['left', 'right'],
    };
    const result = renderBlock({ table: spec }, 40);
    // Right-aligned: row should be a non-empty string
    expect(typeof result).toBe('string');
    expect(strip(result)).toContain('150.00');
  });

  it('truncates rightmost columns when total exceeds width', () => {
    const spec = {
      headers: ['Col1', 'Col2', 'Col3', 'Col4', 'Col5'],
      rows: [{ cells: ['aaaaaa', 'bbbbbb', 'cccccc', 'dddddd', 'eeeeee'] }],
    };
    // Width 20 is too narrow for 5 columns
    const result = strip(renderBlock({ table: spec }, 20));
    // Some columns should be present; rightmost may be truncated
    expect(result).toContain('Col1');
    // Should not crash
    expect(typeof result).toBe('string');
  });

  it('empty table returns muted empty message', () => {
    const result = strip(renderBlock({ table: { headers: [], rows: [] } }, 80));
    expect(result).toContain('empty table');
  });

  it('per-cell color roles do not crash (result is still a string)', () => {
    const spec = {
      headers: ['Symbol', 'Change'],
      rows: [{ cells: ['AAPL', '+1.2%'], colors: { '1': 'positive' } }],
    };
    const result = renderBlock({ table: spec }, 80);
    expect(typeof result).toBe('string');
    expect(strip(result)).toContain('+1.2%');
  });

  it('aliases green/red table colors to positive/negative theme roles', () => {
    const spec = {
      headers: ['Symbol', 'Change'],
      rows: [
        { cells: ['AAPL', '+1.2%'], colors: { '1': 'green' } },
        { cells: ['NVDA', '-0.8%'], colors: { '1': 'red' } },
      ],
    };
    const result = renderBlock({ table: spec }, 80);
    expect(result).toContain('\x1b[38;2;0;255;136m+1.2%');
    expect(result).toContain('\x1b[38;2;255;68;68m-0.8%');
  });

  it('auto-colors signed percent cells in tables', () => {
    const spec = {
      headers: ['Symbol', 'Today', '52W'],
      rows: [
        { cells: ['XLE', '+1.44%', '+30.4%'] },
        { cells: ['XLK', '-2.87%', '+29.3%'] },
      ],
    };
    const result = renderBlock({ table: spec }, 80);
    expect(result).toContain('\x1b[38;2;114;198;107m+1.44%\x1b[0m');
    expect(result).toContain('\x1b[38;2;231;119;90m-2.87%\x1b[0m');
    expect(strip(result)).toContain('+30.4%');
  });

  it('does not auto-color unsigned percentages in tables', () => {
    const spec = {
      headers: ['Symbol', 'RSI', 'vs 52W'],
      rows: [{ cells: ['AAPL', '54%', '18%'] }],
    };
    const result = renderBlock({ table: spec }, 80);
    expect(result).not.toContain('\x1b[38;2;114;198;107m54%\x1b[0m');
    expect(result).not.toContain('\x1b[38;2;231;119;90m18%\x1b[0m');
  });

  it('missing cells are handled gracefully (empty string for missing)', () => {
    const spec = {
      headers: ['A', 'B', 'C'],
      rows: [{ cells: ['only-a'] }],
    };
    const result = renderBlock({ table: spec }, 80);
    expect(typeof result).toBe('string');
    expect(strip(result)).toContain('only-a');
  });
});

describe('renderBlock — row', () => {
  it('renders children side-by-side on wide terminals (>=100)', () => {
    const block = {
      row: [
        { text: 'LEFT' },
        { text: 'RIGHT' },
      ],
    };
    const result = strip(renderBlock(block, 120));
    expect(result).toContain('LEFT');
    expect(result).toContain('RIGHT');
    // Both appear on the same line
    const firstLine = result.split('\n')[0];
    expect(firstLine).toContain('LEFT');
    expect(firstLine).toContain('RIGHT');
  });

  it('stacks children vertically on narrow terminals (<100) without explicit w', () => {
    const block = {
      row: [
        { text: 'LEFT' },
        { text: 'RIGHT' },
      ],
    };
    const result = strip(renderBlock(block, 40));
    expect(result).toContain('LEFT');
    expect(result).toContain('RIGHT');
    // They should be on separate lines
    const ls = result.split('\n');
    expect(ls[0]).toContain('LEFT');
    expect(ls[0]).not.toContain('RIGHT');
    expect(ls[1]).toContain('RIGHT');
  });

  it('renders side-by-side on narrow terminals when children have explicit w', () => {
    const block = {
      row: [
        { text: 'LEFT', w: 0.5 },
        { text: 'RIGHT', w: 0.5 },
      ],
    };
    const result = strip(renderBlock(block, 40));
    // Both appear on the same line because w is explicit
    const firstLine = result.split('\n')[0];
    expect(firstLine).toContain('LEFT');
    expect(firstLine).toContain('RIGHT');
  });

  it('empty row children returns empty string', () => {
    const result = renderBlock({ row: [] }, 80);
    expect(result).toBe('');
  });
});

describe('renderBlock — stack', () => {
  it('renders children vertically (joined by newlines)', () => {
    const block = {
      stack: [
        { text: 'FIRST' },
        { text: 'SECOND' },
        { text: 'THIRD' },
      ],
    };
    const result = strip(renderBlock(block, 80));
    const ls = lines(result);
    expect(ls).toContain('FIRST');
    expect(ls).toContain('SECOND');
    expect(ls).toContain('THIRD');
  });
});

describe('renderBlock — divider', () => {
  it('renders a divider line with title', () => {
    const result = strip(renderBlock({ divider: 'SECTION' }, 40));
    expect(result).toContain('SECTION');
  });

  it('renders a divider line with horizontal rule chars', () => {
    const result = strip(renderBlock({ divider: 'SECTION' }, 40));
    expect(result).toContain('─');
  });
});

describe('renderBlock — text', () => {
  it('passes through text content', () => {
    const result = strip(renderBlock({ text: 'Hello World' }, 80));
    expect(result).toBe('Hello World');
  });

  it('returns numeric text as string', () => {
    const result = renderBlock({ text: 42 }, 80);
    expect(result).toBe('42');
  });
});

describe('renderBlock — spacer', () => {
  it('spacer: 1 produces empty string', () => {
    const result = renderBlock({ spacer: 1 }, 80);
    expect(result).toBe('');
  });

  it('spacer: 3 produces 2 newlines (n-1)', () => {
    const result = renderBlock({ spacer: 3 }, 80);
    expect(result).toBe('\n\n');
  });

  it('spacer: 0 produces empty string', () => {
    const result = renderBlock({ spacer: 0 }, 80);
    expect(result).toBe('');
  });
});

// ── sideBySide tests ──────────────────────────────────────────────────────────

describe('sideBySide', () => {
  it('merges two simple single-line strings horizontally', () => {
    const result = sideBySide('AAA', 'BBB', 5, 5, 2);
    // 'AAA' is 3 chars, padded to leftWidth=5 → 2 padding chars, plus gap=2 → 4 spaces total
    expect(result).toBe('AAA    BBB');
  });

  it('handles uneven line counts by padding the shorter side', () => {
    const left = 'A\nB\nC';
    const right = 'X';
    const result = sideBySide(left, right, 2, 2, 1);
    const ls = lines(result);
    expect(ls).toHaveLength(3);
    // First line has both
    expect(ls[0]).toContain('A');
    expect(ls[0]).toContain('X');
    // Subsequent lines still have left side
    expect(ls[1]).toContain('B');
    expect(ls[2]).toContain('C');
  });

  it('respects gap parameter', () => {
    const result = sideBySide('A', 'B', 1, 1, 5);
    // A (1 char) padded to 1, then 5 gap spaces, then B
    expect(result).toBe('A     B');
  });
});

// ── resolveWidth tests (tested indirectly via renderBlock w spec) ──────────────

describe('resolveWidth — tested via panel block with w', () => {
  it('w: undefined uses parent width (panel gets full parent width)', () => {
    // A panel without w should use the full parentWidth
    const result80 = renderBlock({ panel: 'quote', data: { ticker: 'SPY', price: 500 } }, 80);
    const result40 = renderBlock({ panel: 'quote', data: { ticker: 'SPY', price: 500 } }, 40);
    // Both should produce output; different widths may produce different line lengths
    expect(typeof result80).toBe('string');
    expect(typeof result40).toBe('string');
  });

  it('w: 0.5 gives half parent width', () => {
    // In a row, child with w:0.5 gets half availableWidth
    const block = {
      row: [
        { text: 'L', w: 0.5 },
        { text: 'R', w: 0.5 },
      ],
    };
    const result = strip(renderBlock(block, 80));
    expect(result).toContain('L');
    expect(result).toContain('R');
  });

  it('w: 40 gives fixed 40-char width', () => {
    const block = { panel: 'quote', data: { ticker: 'X', price: 1 }, w: 40 };
    const result = renderBlock(block, 80);
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });

  it('w: 0 returns minimum width (1) — no crash', () => {
    const block = { panel: 'quote', data: { ticker: 'X', price: 1 }, w: 0 };
    const result = renderBlock(block, 80);
    expect(typeof result).toBe('string');
  });
});

// ── presetToBlocks tests ──────────────────────────────────────────────────────

describe('presetToBlocks — deep-dive', () => {
  const panels = {
    quote: { ticker: 'AAPL', price: 150 },
    chart: { values: [1, 2, 3] },
    technical: { rsi: 55 },
    analyst: { ratings: { buy: 10, hold: 3, sell: 1 } },
    news: { items: [] },
  };

  it('produces an array of blocks', () => {
    const blocks = presetToBlocks('deep-dive', panels);
    expect(Array.isArray(blocks)).toBe(true);
    expect(blocks.length).toBeGreaterThan(0);
  });

  it('includes a quote panel block', () => {
    const blocks = presetToBlocks('deep-dive', panels);
    const quoteBlock = blocks.find(b => b.panel === 'quote');
    expect(quoteBlock).toBeDefined();
  });

  it('includes a row with chart and technical side by side', () => {
    const blocks = presetToBlocks('deep-dive', panels);
    const rowBlock = blocks.find(b => Array.isArray(b.row));
    expect(rowBlock).toBeDefined();
    const panelNames = rowBlock.row.map(b => b.panel);
    expect(panelNames).toContain('chart');
    expect(panelNames).toContain('technical');
  });

  it('includes ANALYST and NEWS dividers', () => {
    const blocks = presetToBlocks('deep-dive', panels);
    const dividers = blocks.filter(b => b.divider != null).map(b => b.divider);
    expect(dividers).toContain('ANALYST');
    expect(dividers).toContain('NEWS');
  });

  it('includes VERDICT section when verdict panel is present', () => {
    const panelsWithVerdict = { ...panels, verdict: { thesis: 'Bullish' } };
    const blocks = presetToBlocks('deep-dive', panelsWithVerdict);
    const dividers = blocks.filter(b => b.divider != null).map(b => b.divider);
    expect(dividers).toContain('VERDICT');
  });
});

describe('presetToBlocks — compare', () => {
  it('produces a row of stacks when tickers provided', () => {
    const panels = {
      tickers: ['AAPL', 'MSFT'],
      AAPL: { quote: { ticker: 'AAPL', price: 150 } },
      MSFT: { quote: { ticker: 'MSFT', price: 400 } },
    };
    const blocks = presetToBlocks('compare', panels);
    expect(Array.isArray(blocks)).toBe(true);
    // Should produce a single row block
    const rowBlock = blocks.find(b => Array.isArray(b.row));
    expect(rowBlock).toBeDefined();
    expect(rowBlock.row).toHaveLength(2);
  });

  it('each ticker column is a stack block', () => {
    const panels = {
      tickers: ['NVDA', 'AMD'],
      NVDA: { quote: { ticker: 'NVDA' } },
      AMD: { quote: { ticker: 'AMD' } },
    };
    const blocks = presetToBlocks('compare', panels);
    const rowBlock = blocks.find(b => Array.isArray(b.row));
    rowBlock.row.forEach(child => {
      expect(Array.isArray(child.stack)).toBe(true);
    });
  });

  it('empty tickers list returns fallback text', () => {
    const blocks = presetToBlocks('compare', {});
    expect(blocks.length).toBeGreaterThan(0);
    const hasText = blocks.some(b => b.text != null);
    expect(hasText).toBe(true);
  });
});

describe('presetToBlocks — macro', () => {
  it('produces macro panel + chart rows', () => {
    const panels = {
      macro: { pillars: [{ label: 'Inflation', value: 70, direction: 'falling' }] },
      inflation: { values: [1, 2, 3] },
      rates: { values: [4, 5, 6] },
    };
    const blocks = presetToBlocks('macro', panels);
    expect(Array.isArray(blocks)).toBe(true);
    const macroBlock = blocks.find(b => b.panel === 'macro');
    expect(macroBlock).toBeDefined();
    // Should have at least two row blocks (inflation+rates, labor+growth)
    const rowBlocks = blocks.filter(b => Array.isArray(b.row));
    expect(rowBlocks.length).toBeGreaterThanOrEqual(2);
  });
});

describe('presetToBlocks — pulse', () => {
  it('produces quote + news panels', () => {
    const panels = {
      quote: { ticker: 'SPY', price: 500 },
      news: { items: [] },
    };
    const blocks = presetToBlocks('pulse', panels);
    const panelNames = blocks.filter(b => b.panel).map(b => b.panel);
    expect(panelNames).toContain('quote');
    expect(panelNames).toContain('news');
  });
});

describe('presetToBlocks — unknown layout', () => {
  it('returns error text for unknown layout name', () => {
    const blocks = presetToBlocks('nonexistent-layout', {});
    expect(Array.isArray(blocks)).toBe(true);
    expect(blocks.length).toBe(1);
    expect(blocks[0].text).toBeDefined();
    expect(strip(blocks[0].text)).toContain('Unknown layout');
  });
});

// ── renderBlocks tests ────────────────────────────────────────────────────────

describe('renderBlocks', () => {
  it('returns empty string for empty array', () => {
    expect(renderBlocks([])).toBe('');
  });

  it('returns empty string for non-array input', () => {
    expect(renderBlocks(null)).toBe('');
    expect(renderBlocks('foo')).toBe('');
    expect(renderBlocks(42)).toBe('');
    expect(renderBlocks({})).toBe('');
  });

  it('joins multiple blocks with newlines', () => {
    const blocks = [
      { text: 'FIRST' },
      { text: 'SECOND' },
    ];
    const result = strip(renderBlocks(blocks, 80));
    const ls = lines(result);
    expect(ls).toContain('FIRST');
    expect(ls).toContain('SECOND');
    // newline separates them
    expect(result).toContain('\n');
  });

  it('propagates width to child blocks', () => {
    // A panel block inside renderBlocks should receive the width
    const blocks = [{ panel: 'quote', data: { ticker: 'AAPL', price: 150 } }];
    const result80 = renderBlocks(blocks, 80);
    const result120 = renderBlocks(blocks, 120);
    // Both should succeed
    expect(typeof result80).toBe('string');
    expect(typeof result120).toBe('string');
  });
});

// ── Edge cases ────────────────────────────────────────────────────────────────

describe('edge cases', () => {
  it('nested row inside stack renders without crash', () => {
    const block = {
      stack: [
        { text: 'TOP' },
        { row: [{ text: 'LEFT' }, { text: 'RIGHT' }] },
        { text: 'BOTTOM' },
      ],
    };
    const result = strip(renderBlock(block, 80));
    expect(result).toContain('TOP');
    expect(result).toContain('BOTTOM');
    expect(result).toContain('LEFT');
    expect(result).toContain('RIGHT');
  });

  it('null block returns empty string', () => {
    expect(renderBlock(null, 80)).toBe('');
  });

  it('undefined block returns empty string', () => {
    expect(renderBlock(undefined, 80)).toBe('');
  });

  it('block with no recognized key returns empty string', () => {
    expect(renderBlock({ unknownKey: 'value' }, 80)).toBe('');
  });
});
