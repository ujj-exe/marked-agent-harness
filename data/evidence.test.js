import { describe, expect, it } from 'vitest';
import { buildEvidence, validateClaims } from './evidence.js';

describe('evidence', () => {
  it('creates traceable evidence records from Marked facts', () => {
    const [item] = buildEvidence([{ concept_id: 'Revenue', value: '10', period_end: '2025-03-31', basis: 'consolidated', source_url: 'https://source' }], { companyId: 'co_1', dataType: 'financial_fact' });
    expect(item).toMatchObject({ evidence_id: 'ev_001', company_id: 'co_1', data_type: 'financial_fact', period: '2025-03-31', basis: 'consolidated', source_url: 'https://source' });
  });

  it('flags unknown evidence IDs instead of trusting model output', () => {
    const result = { claims: [{ text: 'Revenue rose', evidence_ids: ['ev_001', 'ev_fake'] }] };
    const checked = validateClaims(result, [{ evidence_id: 'ev_001' }]);
    expect(checked.warnings).toHaveLength(1);
    expect(result.claims[0].evidence_ids).toEqual(['ev_001']);
  });

  it('flags factual claims without evidence IDs', () => {
    const checked = validateClaims({ claims: [{ text: 'Revenue rose', classification: 'fact', evidence_ids: [] }] }, []);
    expect(checked.warnings[0]).toMatch(/no evidence/);
  });
});
