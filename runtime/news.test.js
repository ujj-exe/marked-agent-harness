import { describe, it, expect } from 'vitest';
import { sortNews, newsBlocks, parseNewsCommand } from './news.js';

const item = (over = {}) => ({
  headline: 'Something happened', publisher: 'The Economic Times',
  source_tier: 'press', published_at: '2026-09-15T18:31:00Z',
  topics: ['crude', 'trade'], regions: ['middle_east'], url: 'https://example.com/a', ...over,
});
const strip = s => s.replace(/\x1b\[[0-9;]*m/g, '');
const table = blocks => blocks.find(b => b.table)?.table;

describe('sortNews', () => {
  // "The exchange said it" and "a newspaper said it" are different claims.
  it('puts official sources above press', () => {
    const sorted = sortNews([item({ headline: 'press' }), item({ headline: 'official', source_tier: 'official' })]);
    expect(sorted[0].headline).toBe('official');
  });

  it('is newest first within a tier', () => {
    const sorted = sortNews([
      item({ headline: 'older', published_at: '2026-09-01T00:00:00Z' }),
      item({ headline: 'newer', published_at: '2026-09-15T00:00:00Z' }),
    ]);
    expect(sorted[0].headline).toBe('newer');
  });
});

describe('newsBlocks', () => {
  it('leads with when, who and what', () => {
    const t = table(newsBlocks([item()]));
    expect(t.headers.slice(0, 4)).toEqual(['Published', '', 'Publisher', 'Headline']);
    expect(t.rows[0].cells[2]).toBe('The Economic Times');
    expect(t.rows[0].cells[3]).toBe('Something happened');
  });

  it('marks the tier, so authority is never read off the publisher name', () => {
    const official = strip(table(newsBlocks([item({ source_tier: 'official' })])).rows[0].cells[1]);
    const press = strip(table(newsBlocks([item()])).rows[0].cells[1]);
    expect(official).toBe('OFF');
    expect(press).toBe('prs');
  });

  it('shows topic and region tags so a reader can see why an item is here', () => {
    expect(table(newsBlocks([item()])).rows[0].cells[4]).toContain('crude');
    expect(table(newsBlocks([item()])).rows[0].cells[4]).toContain('middle_east');
  });

  it('says there is none rather than rendering a bare header', () => {
    expect(newsBlocks([]).map(b => b.text ?? '').join(' ')).toContain('No news');
  });

  it('honours a limit', () => {
    expect(table(newsBlocks(Array.from({ length: 40 }, () => item()), { limit: 5 })).rows).toHaveLength(5);
  });
});

describe('parseNewsCommand', () => {
  it('reads a bare command and a filter', () => {
    expect(parseNewsCommand('/news')).toEqual({ kind: 'news', filter: null });
    expect(parseNewsCommand('/news rates')).toEqual({ kind: 'news', filter: 'rates' });
    expect(parseNewsCommand('/news india')).toEqual({ kind: 'news', filter: 'india' });
  });

  it('claims nothing else', () => {
    expect(parseNewsCommand('newsletter')).toBeNull();
    expect(parseNewsCommand('what is the news about oil')).toBeNull();
  });
});

describe('where a news command applies', () => {
  // A filter names a topic or region, which is market-wide by definition, so
  // it has to reach the global feed even from inside a company world.
  const routes = (input, inWorld) => {
    const news = parseNewsCommand(input);
    return Boolean(news && (!inWorld || news.filter));
  };

  it('sends a filtered request to the global feed from anywhere', () => {
    expect(routes('/news rates', false)).toBe(true);
    expect(routes('/news rates', true)).toBe(true);
  });

  it('leaves a bare /news inside a world to the company tab', () => {
    expect(routes('/news', true)).toBe(false);
    expect(routes('/news', false)).toBe(true);
  });
});
