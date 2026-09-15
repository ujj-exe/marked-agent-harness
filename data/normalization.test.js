import { describe, expect, it } from 'vitest';
import { normalizeFinancialRows, shortDate } from './normalization.js';

describe('financial display normalization', () => {
  it('turns reported and derived facts into analyst-facing rows', () => {
    const rows = normalizeFinancialRows({ data: [{ concept_id: 'ChangesInInventories', value: '-302630000000', unit: 'INR', fiscal_year: 2023, basis: 'consolidated' }] }, {
      data: [{ fiscal_year: 2023, basis: 'consolidated', unit: 'INR', metrics: { net_margin: 0.089 } }],
    });
    expect(rows).toEqual(expect.arrayContaining([
      expect.objectContaining({ metric: 'Inventory change', value: '-₹30,263 Cr', classification: 'reported metric' }),
      expect.objectContaining({ metric: 'Net margin', value: '8.9%', classification: 'derived metric' }),
    ]));
  });
});

describe('shortDate', () => {
  // The API returns 25-character UTC ISO strings. The table renderer drops
  // whole rightmost columns when a row overflows, so a long date silently cost
  // the Title column its place on screen.
  it('renders a UTC timestamp in IST', () => {
    expect(shortDate('2026-09-11T12:48:50+00:00')).toBe('11 Sep 26 18:18');
  });

  it('keeps a date-only value a date rather than inventing a time', () => {
    expect(shortDate('2026-06-05')).toBe('05 Jun 26');
    expect(shortDate('2026-09-11T00:00:00+00:00')).toBe('11 Sep 26');
  });

  it('crosses the date boundary correctly when IST rolls over', () => {
    expect(shortDate('2026-09-11T20:00:00+00:00')).toBe('12 Sep 26 01:30');
  });

  it('is short enough not to crowd a table off the screen', () => {
    expect(shortDate('2026-09-11T12:48:50+00:00').length).toBeLessThanOrEqual(16);
  });

  it('shows a gap for a missing date and passes through an unparseable one', () => {
    expect(shortDate(null)).toBe('—');
    expect(shortDate('')).toBe('—');
    expect(shortDate('garbage')).toBe('garbage');
  });
});
