import { describe, it, expect } from 'vitest';
import { marketBlocks, parseMarketCommand } from './market.js';

const strip = s => s.replace(/\x1b\[[0-9;]*m/g, '');
const context = {
  data: {
    as_of: '2026-09-15T18:58:42Z',
    fx: { USDINR: { available: true, name: 'US dollar / Indian rupee', unit: 'INR per USD', value: 95.945, change_1d: 0.96, change_1m: 0.57, as_of: '2026-09-15T16:49:56Z' } },
    commodities: { BRENT: { available: true, name: 'Brent crude', unit: 'USD per barrel', value: 109.15, change_1d: 3.28, change_1m: 23.3, as_of: '2026-09-15T04:00:00Z' } },
    macro: {
      IN_REPO_RATE: { available: true, name: 'RBI policy repo rate', category: 'rates', unit: 'percent', value: 5.25, observation_period: '2026-09-15', known_at: '2026-09-15T18:47:01Z', revision: 0 },
      IN_GDP_CONSTANT: { available: false, reason: 'not_ingested', name: 'India real GDP' },
    },
  },
};

/** Tables live inside `row`/`stack` wrappers too, so walk the tree. */
const tables = (blocks) => blocks.flatMap(b => {
  if (b?.table) return [b.table];
  const children = b?.row ?? b?.stack;
  return Array.isArray(children) ? tables(children) : [];
});

describe('marketBlocks', () => {
  it('shows rates, currency and commodities', () => {
    const out = tables(marketBlocks(context));
    const joined = out.flatMap(t => t.rows).map(r => strip(r.cells.join(' '))).join('\n');
    expect(joined).toContain('RBI policy repo rate');
    expect(joined).toContain('US dollar / Indian rupee');
    expect(joined).toContain('Brent crude');
  });

  it('writes a percent unit as a suffix and leaves others to the column', () => {
    const joined = tables(marketBlocks(context)).flatMap(t => t.rows).map(r => strip(r.cells.join('|'))).join('\n');
    expect(joined).toContain('5.25%');
    expect(joined).toContain('109.15');
  });

  // The API says which series it has not ingested; hiding that would present a
  // shorter table as a complete one.
  it('reports series that were not ingested rather than omitting them silently', () => {
    const text = marketBlocks(context).map(b => b.text ?? '').join(' ');
    expect(text).toContain('not ingested');
    expect(text).toContain('IN_GDP_CONSTANT');
  });

  it('keeps an unavailable series out of the value rows', () => {
    const joined = tables(marketBlocks(context)).flatMap(t => t.rows).map(r => strip(r.cells.join(' '))).join('\n');
    expect(joined).not.toContain('India real GDP');
  });

  it('says so when nothing came back', () => {
    expect(marketBlocks({ data: {} }).map(b => b.text ?? '').join(' ')).toContain('No market context');
  });
});

describe('parseMarketCommand', () => {
  it('reads the command and its aliases', () => {
    expect(parseMarketCommand('/market')).toEqual({ kind: 'market' });
    expect(parseMarketCommand('/context')).toEqual({ kind: 'market' });
    expect(parseMarketCommand('/marketing')).toBeNull();
    expect(parseMarketCommand('how is the market')).toBeNull();
  });
});
