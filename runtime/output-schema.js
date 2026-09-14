export const researchResultSchema = {
  type: 'object',
  additionalProperties: false,
  required: [
    'type', 'summary', 'conviction', 'thesis', 'bull_case', 'bear_case',
    'catalysts', 'risks', 'invalidation', 'levels', 'claims', 'sources',
    'context', 'follow_ups',
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
  if (result.conviction && !researchResultSchema.properties.conviction.enum.includes(result.conviction)) throw new Error('Agent result has an invalid conviction');
  for (const claim of result.claims) {
    if (!claim || typeof claim.text !== 'string' || !Array.isArray(claim.evidence_ids)) throw new Error('Agent result has an invalid claim');
  }
  return result;
}
