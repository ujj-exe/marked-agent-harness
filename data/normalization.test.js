import { describe, expect, it } from 'vitest';
import { normalizeFinancialRows } from './normalization.js';

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
