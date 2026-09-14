import { describe, expect, it } from 'vitest';
import { validateResearchResult } from './output-schema.js';

describe('research result contract', () => {
  it('rejects incomplete worker output', () => {
    expect(() => validateResearchResult({ type: 'research_result' })).toThrow(/missing summary/);
  });

  it('rejects unsupported conviction values', () => {
    expect(() => validateResearchResult({ type: 'research_result', summary: 'x', thesis: 'y', claims: [], risks: [], conviction: 'guaranteed' })).toThrow(/invalid conviction/);
  });
});
