import { describe, expect, it } from 'vitest';
import { resolveTemporal, resolvedQuestion } from './temporal.js';

describe('Indian financial-year resolution', () => {
  it('resolves last financial year from runtime date', () => {
    const result = resolveTemporal('Infosys earnings last financial year', '2026-09-14T00:00:00Z');
    expect(result).toMatchObject({ label: 'FY2026', fiscal_year: 2026, period_end: '2026-03-31' });
    expect(resolvedQuestion('Infosys earnings last financial year', result)).toContain('exact fiscal-year constraint');
  });

  it('does not rewrite an explicit fiscal year', () => {
    expect(resolveTemporal('Infosys earnings in FY2025', '2026-09-14T00:00:00Z')).toBeNull();
  });
});
