import { ANALYSIS_REQUIREMENTS } from './research-mandate.js';

export const researchResultSchema = {
  type: 'object',
  additionalProperties: false,
  required: [
    'type', 'summary', 'conviction', 'thesis', 'bull_case', 'bear_case',
    'catalysts', 'risks', 'invalidation', 'levels', 'claims', 'sources',
    'context', 'follow_ups', 'coverage', 'material_gaps',
  ],
  properties: {
    type: { type: 'string', const: 'research_result' },
    summary: { type: 'string' },
    conviction: { type: 'string', enum: ['strong_bull', 'bull', 'neutral', 'bear', 'strong_bear', 'mixed', 'uncertain'] },
    thesis: { type: 'string' },
    bull_case: { type: 'array', items: { type: 'string' } },
    bear_case: { type: 'array', items: { type: 'string' } },
    catalysts: { type: 'array', items: { type: 'string' } },
    risks: { type: 'array', items: { type: 'string' } },
    invalidation: { type: 'array', items: { type: 'string' } },
    levels: { type: 'array', items: { type: 'string' } },
    claims: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['text', 'evidence_ids', 'classification'],
        properties: {
          text: { type: 'string' },
          evidence_ids: { type: 'array', items: { type: 'string' } },
          classification: { type: 'string', enum: ['fact', 'inference', 'opinion', 'external_context'] },
        },
      },
    },
    sources: { type: 'array', items: { type: 'string' } },
    coverage: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['requirement', 'status', 'evidence_ids', 'note'],
        properties: {
          requirement: { type: 'string', enum: ANALYSIS_REQUIREMENTS },
          status: { type: 'string', enum: ['complete', 'partial', 'unavailable'] },
          evidence_ids: { type: 'array', items: { type: 'string' } },
          note: { type: 'string' },
        },
      },
    },
    material_gaps: { type: 'array', items: { type: 'string' } },
    context: { type: 'string' },
    follow_ups: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['label', 'question'], properties: { label: { type: 'string' }, question: { type: 'string' } } } },
  },
};

export function promptForResult() {
  return `Return only JSON matching this contract: ${JSON.stringify(researchResultSchema)}`;
}

export function validateResearchResult(result) {
  if (!result || typeof result !== 'object') throw new Error('Agent result must be a JSON object');
  for (const field of ['type', 'summary', 'thesis', 'claims', 'risks']) {
    if (result[field] === undefined) throw new Error(`Agent result is missing ${field}`);
  }
  if (result.type !== 'research_result') throw new Error('Agent result has an invalid type');
  if (!Array.isArray(result.claims) || !Array.isArray(result.risks)) throw new Error('Agent result has invalid claims or risks');
  // Older provider bridges and tests can omit these fields; the schema sent to
  // production providers requires them. Normalising here keeps saved sessions
  // readable across upgrades without weakening the live contract.
  if (!Array.isArray(result.coverage)) result.coverage = [];
  if (!Array.isArray(result.material_gaps)) result.material_gaps = [];
  if (result.conviction && !researchResultSchema.properties.conviction.enum.includes(result.conviction)) throw new Error('Agent result has an invalid conviction');
  for (const claim of result.claims) {
    if (!claim || typeof claim.text !== 'string' || !Array.isArray(claim.evidence_ids)) throw new Error('Agent result has an invalid claim');
  }
  return result;
}
