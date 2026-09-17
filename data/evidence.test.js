import { describe, expect, it } from 'vitest';
import { buildEvidence, validateClaims } from './evidence.js';

describe('evidence', () => {
  it('creates traceable evidence records from Marked facts', () => {
    const [item] = buildEvidence([{ concept_id: 'Revenue', value: '10', period_end: '2025-03-31', basis: 'consolidated', source_url: 'https://source' }], { companyId: 'co_1', dataType: 'financial_fact' });
    expect(item).toMatchObject({ evidence_id: 'ev_001', company_id: 'co_1', data_type: 'financial_fact', period: '2025-03-31', basis: 'consolidated', source_url: 'https://source' });
  });

  it('maps normalized news provenance without article text', () => {
    const [item] = buildEvidence([{ headline: 'RBI update', url: 'https://example.com/rbi' }], { dataType: 'news' });
    expect(item).toMatchObject({ title: 'RBI update', source_url: 'https://example.com/rbi', data_type: 'news' });
  });

  it('flags unknown evidence IDs instead of trusting model output', () => {
    const result = { claims: [{ text: 'Revenue rose', evidence_ids: ['ev_001', 'ev_fake'] }] };
    const checked = validateClaims(result, [{ evidence_id: 'ev_001' }]);
    expect(checked.warnings).toHaveLength(1);
    expect(result.claims[0].evidence_ids).toEqual(['ev_001']);
  });

  it('flags factual claims without evidence IDs', () => {
    const result = { claims: [{ text: 'Revenue rose', classification: 'fact', evidence_ids: [] }] };
    const checked = validateClaims(result, []);
    expect(checked.warnings[0]).toMatch(/Omitted unsupported factual claim/);
    expect(result.claims).toEqual([]);
  });

  it('classifies provider-search evidence as external context instead of a Marked fact', () => {
    const result = { claims: [{ text: 'Consensus EPS fell 5%', classification: 'fact', evidence_ids: ['web_01'] }] };
    validateClaims(result, [{ evidence_id: 'web_01', data_type: 'web' }]);
    expect(result.claims[0].classification).toBe('external_context');
  });

  it('accepts normalized news as external context and filing dates as cited facts', () => {
    const result = { claims: [
      { text: 'The publisher reported a contract win.', classification: 'external_context', evidence_ids: ['ev_news'] },
      { text: 'The filing was published on July 28, 2026.', classification: 'fact', evidence_ids: ['ev_filing'] },
    ] };
    const checked = validateClaims(result, [
      { evidence_id: 'ev_news', data_type: 'news' },
      { evidence_id: 'ev_filing', data_type: 'filing' },
    ]);
    expect(checked.warnings).toEqual([]);
    expect(result.claims).toHaveLength(2);
  });
});
