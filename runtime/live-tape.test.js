import { describe, expect, it } from 'vitest';
import { fetchLiveTape, liveTapePayload } from './live-tape.js';

describe('live tape', () => {
  it('fetches all symbols and keeps individual quote failures visible', async () => {
    const rows = await fetchLiveTape({ quote: async ({ symbol }) => {
      if (symbol === 'BAD') throw new Error('missing');
      return { data: { price: 1428.2, change_percent: 0.42, market_status: 'REGULAR', as_of: '2026-09-15T08:00:00Z' } };
    } }, ['RELIANCE', 'BAD']);
    expect(rows[0]).toMatchObject({ symbol: 'RELIANCE', price: 1428.2 });
    expect(rows[1]).toMatchObject({ symbol: 'BAD', error: 'missing' });
  });

  it('updates homepage tape state without injecting a screen block', () => {
    expect(liveTapePayload([{ symbol: 'RELIANCE' }])).toEqual({ liveTape: [{ symbol: 'RELIANCE' }] });
  });
});
