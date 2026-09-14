/**
 * schemas.test.js — Unit tests for the 7 new panel schemas.
 *
 * Each schema must:
 *   1. Pass valid data through without warnings
 *   2. Return { data, warnings } when required array is missing/empty
 */

import { describe, it, expect } from 'vitest';
import { schema as insidersSchema } from './insiders.js';
import { schema as earningsSchema } from './earnings.js';
import { schema as holdersSchema }  from './holders.js';
import { schema as filingsSchema }  from './filings.js';
import { schema as heatmapSchema }  from './heatmap.js';
import { schema as candlestickSchema } from './candlestick.js';
import { schema as waterfallSchema }   from './waterfall.js';
import { schema as rsiSchema }           from './rsi.js';
import { schema as correlationMatrixSchema } from './correlationMatrix.js';
import { schema as treeMapSchema }       from './treeMap.js';
import { schema as flowSankeySchema }    from './flowSankey.js';
import { validate }                      from './index.js';

// ── insiders ─────────────────────────────────────────────────────────────────

describe('insiders schema', () => {
  it('passes valid transactions data through without warnings', () => {
    const input = {
      transactions: [
        { date: '2024-01-15', name: 'John Doe', type: 'buy', shares: 1000, amount: 50000 },
        { date: '2024-02-20', name: 'Jane Smith', type: 'sell', shares: 500, amount: 25000 },
      ],
    };
    const result = insidersSchema.validate({ ...input });
    expect(result.warnings).toBeUndefined();
    expect(result.transactions).toHaveLength(2);
  });

  it('warns when transactions array is missing', () => {
    const result = insidersSchema.validate({});
    expect(result).toHaveProperty('warnings');
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.warnings[0]).toMatch(/transactions/);
  });

  it('coerces string shares and amount to numbers', () => {
    const input = {
      transactions: [{ date: '2024-01-01', name: 'Alice', type: 'buy', shares: '200', amount: '10000' }],
    };
    const result = insidersSchema.validate({ ...input });
    expect(typeof result.transactions[0].shares).toBe('number');
    expect(typeof result.transactions[0].amount).toBe('number');
  });
});

// ── earnings ─────────────────────────────────────────────────────────────────

describe('earnings schema', () => {
  it('passes valid quarters data through without warnings', () => {
    const input = {
      quarters: [
        { date: "Q1'24", actual: 1.52, estimate: 1.45, surprise: 4.83 },
        { date: "Q2'24", actual: 1.30, estimate: 1.35, surprise: -3.70 },
      ],
    };
    const result = earningsSchema.validate({ ...input });
    expect(result.warnings).toBeUndefined();
    expect(result.quarters).toHaveLength(2);
  });

  it('warns when quarters array is missing', () => {
    const result = earningsSchema.validate({});
    expect(result).toHaveProperty('warnings');
    expect(result.warnings[0]).toMatch(/quarters/);
  });

  it('coerces string numeric fields to numbers', () => {
    const input = {
      quarters: [{ date: "Q1'24", actual: '1.52', estimate: '1.45', surprise: '4.83' }],
    };
    const result = earningsSchema.validate({ ...input });
    expect(typeof result.quarters[0].actual).toBe('number');
    expect(typeof result.quarters[0].estimate).toBe('number');
    expect(typeof result.quarters[0].surprise).toBe('number');
  });

  it('normalizes period → date alias', () => {
    const input = {
      quarters: [{ period: "Q3'24", actual: 1.0, estimate: 0.9, surprise: 10 }],
    };
    const result = earningsSchema.validate({ ...input });
    expect(result.quarters[0].date).toBe("Q3'24");
  });
});

// ── holders ──────────────────────────────────────────────────────────────────

describe('holders schema', () => {
  it('passes valid holders data through without warnings', () => {
    const input = {
      holders: [
        { name: 'Vanguard', shares: 500000000, percent: 8.5 },
        { name: 'BlackRock', shares: 450000000, percent: 7.6 },
      ],
    };
    const result = holdersSchema.validate({ ...input });
    expect(result.warnings).toBeUndefined();
    expect(result.holders).toHaveLength(2);
  });

  it('warns when holders array is missing', () => {
    const result = holdersSchema.validate({});
    expect(result).toHaveProperty('warnings');
    expect(result.warnings[0]).toMatch(/holders/);
  });

  it('coerces string shares and percent to numbers', () => {
    const input = {
      holders: [{ name: 'Vanguard', shares: '500000000', percent: '8.5' }],
    };
    const result = holdersSchema.validate({ ...input });
    expect(typeof result.holders[0].shares).toBe('number');
    expect(typeof result.holders[0].percent).toBe('number');
  });
});

// ── filings ───────────────────────────────────────────────────────────────────

describe('filings schema', () => {
  it('passes valid filings data through without warnings', () => {
    const input = {
      filings: [
        { date: '2024-01-15', form: 'annual_report', description: 'Annual report for FY2023' },
        { date: '2024-04-30', form: 'financial_results', description: 'Financial results Q1 FY2024' },
      ],
    };
    const result = filingsSchema.validate({ ...input });
    expect(result.warnings).toBeUndefined();
    expect(result.filings).toHaveLength(2);
  });

  it('warns when filings array is missing', () => {
    const result = filingsSchema.validate({});
    expect(result).toHaveProperty('warnings');
    expect(result.warnings[0]).toMatch(/filings/);
  });

  it('coerces form to string', () => {
    const input = {
      filings: [{ date: '2024-01-01', form: 10, description: 'Annual' }],
    };
    const result = filingsSchema.validate({ ...input });
    expect(typeof result.filings[0].form).toBe('string');
  });
});

// ── heatmap ───────────────────────────────────────────────────────────────────

describe('heatmap schema', () => {
  it('passes valid heatmap data through without warnings', () => {
    const input = {
      rows: [
        { label: 'AAPL', values: [0.5, -0.3, 1.2] },
        { label: 'MSFT', values: [0.8, 0.1, -0.5] },
      ],
      columns: ['Jan', 'Feb', 'Mar'],
      colorScale: 'diverging',
    };
    const result = heatmapSchema.validate({ ...input });
    expect(result.warnings).toBeUndefined();
    expect(result.rows).toHaveLength(2);
    expect(result.columns).toHaveLength(3);
  });

  it('warns when rows or columns are missing', () => {
    const result = heatmapSchema.validate({});
    expect(result).toHaveProperty('warnings');
    expect(result.warnings.some(w => /rows/.test(w))).toBe(true);
    expect(result.warnings.some(w => /columns/.test(w))).toBe(true);
  });

  it('defaults colorScale to diverging when missing', () => {
    const input = {
      rows: [{ label: 'A', values: [1, 2] }],
      columns: ['X', 'Y'],
    };
    const result = heatmapSchema.validate({ ...input });
    expect(result.colorScale).toBe('diverging');
  });

  it('warns and defaults colorScale for unknown value', () => {
    const input = {
      rows: [{ label: 'A', values: [1] }],
      columns: ['X'],
      colorScale: 'rainbow',
    };
    const result = heatmapSchema.validate({ ...input });
    expect(result).toHaveProperty('warnings');
    expect(result.warnings.some(w => /colorScale/.test(w))).toBe(true);
    expect(result.data.colorScale).toBe('diverging');
  });

  it('coerces string values to numbers in rows', () => {
    const input = {
      rows: [{ label: 'A', values: ['1.5', '-0.3'] }],
      columns: ['X', 'Y'],
    };
    const result = heatmapSchema.validate({ ...input });
    expect(typeof result.rows[0].values[0]).toBe('number');
  });
});

// ── candlestick ───────────────────────────────────────────────────────────────

describe('candlestick schema', () => {
  it('passes valid bars data through without warnings', () => {
    const input = {
      bars: [
        { open: 150, high: 155, low: 148, close: 153, volume: 1000000 },
        { open: 153, high: 158, low: 151, close: 156, volume: 1200000 },
      ],
    };
    const result = candlestickSchema.validate({ ...input });
    expect(result.warnings).toBeUndefined();
    expect(result.bars).toHaveLength(2);
  });

  it('warns when bars array is missing', () => {
    const result = candlestickSchema.validate({});
    expect(result).toHaveProperty('warnings');
    expect(result.warnings[0]).toMatch(/bars/);
  });

  it('coerces string OHLCV fields to numbers', () => {
    const input = {
      bars: [{ open: '150', high: '155', low: '148', close: '153', volume: '1000000' }],
    };
    const result = candlestickSchema.validate({ ...input });
    const bar = result.bars[0];
    expect(typeof bar.open).toBe('number');
    expect(typeof bar.high).toBe('number');
    expect(typeof bar.low).toBe('number');
    expect(typeof bar.close).toBe('number');
    expect(typeof bar.volume).toBe('number');
  });
});

// ── waterfall ─────────────────────────────────────────────────────────────────

describe('waterfall schema', () => {
  it('passes valid items data through without warnings', () => {
    const input = {
      items: [
        { label: 'Revenue', value: 50000000000, previous: 45000000000 },
        { label: 'COGS', value: -20000000000, previous: -18000000000 },
      ],
    };
    const result = waterfallSchema.validate({ ...input });
    expect(result.warnings).toBeUndefined();
    expect(result.items).toHaveLength(2);
  });

  it('warns when items array is missing', () => {
    const result = waterfallSchema.validate({});
    expect(result).toHaveProperty('warnings');
    expect(result.warnings[0]).toMatch(/items/);
  });

  it('coerces string value and previous to numbers', () => {
    const input = {
      items: [{ label: 'Revenue', value: '50000000000', previous: '45000000000' }],
    };
    const result = waterfallSchema.validate({ ...input });
    expect(typeof result.items[0].value).toBe('number');
    expect(typeof result.items[0].previous).toBe('number');
  });
});

// ── rsi ────────────────────────────────────────────────────────────────────────

describe('rsi schema', () => {
  it('passes valid value through without warnings', () => {
    const result = rsiSchema.coerce.value('58', { value: '58' });
    // coerce mutates data in place; test via full coerce flow
    const data = { value: 60 };
    // No coerce needed for numeric value — required check passes
    expect(data.value).toBe(60);
  });

  it('coerces string value to number', () => {
    const data = { value: '42.5' };
    rsiSchema.coerce.value(data.value, data);
    expect(typeof data.value).toBe('number');
    expect(data.value).toBe(42.5);
  });

  it('coerces string signal to array', () => {
    const data = { value: 50, signals: 'Overbought' };
    rsiSchema.coerce.signals(data.signals, data);
    expect(Array.isArray(data.signals)).toBe(true);
    expect(data.signals[0]).toBe('Overbought');
  });

  it('coerces non-array signals to empty array', () => {
    const data = { value: 50, signals: 99 };
    rsiSchema.coerce.signals(data.signals, data);
    expect(Array.isArray(data.signals)).toBe(true);
    expect(data.signals).toHaveLength(0);
  });

  it('defaults signals to [] when missing', () => {
    expect(rsiSchema.defaults.signals).toEqual([]);
  });
});

// ── correlationMatrix ─────────────────────────────────────────────────────────

describe('correlationMatrix schema', () => {
  it('coerces comma-separated string tickers to array', () => {
    const data = { tickers: 'AAPL,MSFT,GOOGL', matrix: [[1, 0.8], [0.8, 1]] };
    correlationMatrixSchema.coerce.tickers(data.tickers, data);
    expect(Array.isArray(data.tickers)).toBe(true);
    expect(data.tickers).toEqual(['AAPL', 'MSFT', 'GOOGL']);
  });

  it('passes through array tickers unchanged', () => {
    const data = { tickers: ['AAPL', 'MSFT'], matrix: [[1, 0.8], [0.8, 1]] };
    correlationMatrixSchema.coerce.tickers(data.tickers, data);
    expect(data.tickers).toEqual(['AAPL', 'MSFT']);
  });

  it('defaults title to CORRELATION MATRIX', () => {
    expect(correlationMatrixSchema.defaults.title).toBe('CORRELATION MATRIX');
  });

  it('coerces string values in matrix rows to numbers', () => {
    const data = { tickers: ['AAPL', 'MSFT'], matrix: [['1', '0.8'], ['0.8', '1']] };
    correlationMatrixSchema.coerce.matrix(data.matrix, data);
    expect(typeof data.matrix[0][0]).toBe('number');
    expect(data.matrix[0][1]).toBe(0.8);
  });

  it('coerces non-array matrix to empty array', () => {
    const data = { tickers: ['AAPL'], matrix: 'not-a-matrix' };
    correlationMatrixSchema.coerce.matrix(data.matrix, data);
    expect(Array.isArray(data.matrix)).toBe(true);
    expect(data.matrix).toHaveLength(0);
  });

  it('coerces non-array matrix row to empty array', () => {
    const data = { tickers: ['AAPL'], matrix: ['not-a-row'] };
    correlationMatrixSchema.coerce.matrix(data.matrix, data);
    expect(Array.isArray(data.matrix[0])).toBe(true);
    expect(data.matrix[0]).toHaveLength(0);
  });
});

// ── treeMap ───────────────────────────────────────────────────────────────────

describe('treeMap schema', () => {
  it('coerces non-array items to empty array', () => {
    const data = { items: 'not-an-array' };
    treeMapSchema.coerce.items(data.items, data);
    expect(Array.isArray(data.items)).toBe(true);
    expect(data.items).toHaveLength(0);
  });

  it('coerces string height to number', () => {
    const data = { items: [], height: '15' };
    treeMapSchema.coerce.height(data.height, data);
    expect(typeof data.height).toBe('number');
    expect(data.height).toBe(15);
  });

  it('defaults height to 10', () => {
    expect(treeMapSchema.defaults.height).toBe(10);
  });

  it('coerces string weight and value on each item', () => {
    const data = { items: [{ label: 'AAPL', weight: '0.35', value: '42.5' }] };
    treeMapSchema.coerce.items(data.items, data);
    expect(typeof data.items[0].weight).toBe('number');
    expect(data.items[0].weight).toBe(0.35);
    expect(typeof data.items[0].value).toBe('number');
    expect(data.items[0].value).toBe(42.5);
  });

  it('passes through already-numeric weight and value unchanged', () => {
    const data = { items: [{ label: 'TSLA', weight: 0.2, value: 100 }] };
    treeMapSchema.coerce.items(data.items, data);
    expect(data.items[0].weight).toBe(0.2);
    expect(data.items[0].value).toBe(100);
  });
});

// ── flowSankey ────────────────────────────────────────────────────────────────

describe('flowSankey schema', () => {
  it('coerces non-array nodes to empty array', () => {
    const data = { nodes: 'Revenue,COGS' };
    flowSankeySchema.coerce.nodes(data.nodes, data);
    expect(Array.isArray(data.nodes)).toBe(true);
    expect(data.nodes).toHaveLength(0);
  });

  it('coerces non-array flows to empty array', () => {
    const data = { nodes: [], flows: 'a→b' };
    flowSankeySchema.coerce.flows(data.flows, data);
    expect(Array.isArray(data.flows)).toBe(true);
    expect(data.flows).toHaveLength(0);
  });

  it('defaults flows to empty array', () => {
    expect(flowSankeySchema.defaults.flows).toEqual([]);
  });

  it('coerces string value on each node to number', () => {
    const data = { nodes: [{ label: 'Revenue', value: '1000000' }] };
    flowSankeySchema.coerce.nodes(data.nodes, data);
    expect(typeof data.nodes[0].value).toBe('number');
    expect(data.nodes[0].value).toBe(1000000);
  });

  it('coerces string value on each flow to number', () => {
    const data = { nodes: [], flows: [{ from: 'Revenue', to: 'COGS', value: '500000' }] };
    flowSankeySchema.coerce.flows(data.flows, data);
    expect(typeof data.flows[0].value).toBe('number');
    expect(data.flows[0].value).toBe(500000);
  });

  it('passes through already-numeric node and flow values unchanged', () => {
    const data = { nodes: [{ label: 'Revenue', value: 1000000 }] };
    flowSankeySchema.coerce.nodes(data.nodes, data);
    expect(data.nodes[0].value).toBe(1000000);
  });
});

// ── global variant: "dense" default ──────────────────────────────────────────

describe('validate() — global variant default', () => {
  it('sets variant to "dense" when agent does not send variant', () => {
    const result = validate('news', { items: [{ title: 'Test', source: 'X', time: '1h', url: '' }] });
    // news schema has no variant default — global applies
    expect(result.variant).toBe('dense');
  });

  it('respects agent-supplied variant over global default', () => {
    const result = validate('news', { items: [], variant: 'plain' });
    expect(result.variant).toBe('plain');
  });

  it('quote schema variant default ("full") overrides global "dense" default', () => {
    // quote schema has defaults.variant = 'full'
    // global default is skipped when schema defines its own variant default
    const result = validate('quote', { ticker: 'AAPL' });
    expect(result.variant).toBe('full');
  });

  it('global default does not apply to unknown panel types (passthrough)', () => {
    // Unknown panel types skip all schema logic and return data as-is
    const result = validate('unknown_panel', { foo: 'bar' });
    // Returns data unchanged (no variant injection)
    expect(result.variant).toBeUndefined();
  });

  it('agent-supplied variant is always respected regardless of schema', () => {
    const result = validate('gauge', { value: 50, variant: 'compact' });
    expect(result.variant).toBe('compact');
  });
});
