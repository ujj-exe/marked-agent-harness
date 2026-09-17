import { describe, expect, it } from 'vitest';
import { auditResearchResult, finalizeIncompleteResult } from './completion-gate.js';

const mandate = {
  requirements: [{ id: 'peer_relative_return', label: 'Peer-relative return', material: true }],
};

function result(extra = {}) {
  return {
    summary: 'The stock derated.', thesis: 'The stock derated.', claims: [], material_gaps: [],
    coverage: [], ...extra,
  };
}

describe('research completion gate', () => {
  it('passes only a requirement backed by known evidence', () => {
    const audit = auditResearchResult({
      result: result({
        claims: [{ text: 'The stock lagged its peer.', evidence_ids: ['web_01'], classification: 'external_context' }],
        coverage: [{ requirement: 'peer_relative_return', status: 'complete', evidence_ids: ['web_01'], note: '' }],
      }),
      mandate,
      evidence: [{ evidence_id: 'web_01', data_type: 'web', source_url: 'https://example.com' }],
    });
    expect(audit.passed).toBe(true);
  });

  it('rejects self-certified coverage with no evidence', () => {
    const audit = auditResearchResult({
      result: result({ coverage: [{ requirement: 'peer_relative_return', status: 'complete', evidence_ids: ['made_up'], note: '' }] }),
      mandate,
      evidence: [],
    });
    expect(audit.passed).toBe(false);
    expect(audit.material_issues.map(issue => issue.code)).toEqual(expect.arrayContaining(['unknown_coverage_evidence', 'incomplete_requirement']));
  });

  it('ignores surplus coverage ids when retained claims still prove the requirement', () => {
    const audit = auditResearchResult({
      result: result({
        claims: [{ text: 'The stock lagged its peer.', evidence_ids: ['web_01'], classification: 'external_context' }],
        coverage: [{ requirement: 'peer_relative_return', status: 'complete', evidence_ids: ['web_01', 'made_up'], note: '' }],
      }),
      mandate,
      evidence: [{ evidence_id: 'web_01', data_type: 'web', source_url: 'https://example.com' }],
    });
    expect(audit.passed).toBe(true);
    expect(audit.coverage[0].evidence_ids).toEqual(['web_01']);
  });

  it('does not render an uncited figure from prose after the final repair', () => {
    const answer = result({ summary: 'The stock fell 23%.', thesis: 'The stock fell 23%.' });
    const audit = auditResearchResult({ result: answer, mandate: { requirements: [] }, evidence: [] });
    const final = finalizeIncompleteResult(answer, audit);
    expect(audit.material_issues[0].code).toBe('uncited_numeric_narrative');
    expect(final.thesis).not.toContain('23%');
  });
});
