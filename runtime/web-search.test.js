import { describe, expect, it } from 'vitest';
import { webSearchDecision } from './web-search.js';

describe('native web-search policy', () => {
  it('grants search only for an explicit request, a real gap, or missing fresh/external information', () => {
    expect(webSearchDecision({ question: 'Search the web for the latest RBI circular' })).toMatchObject({ enabled: true, reason: 'explicit_web_request' });
    expect(webSearchDecision({ question: 'Why did margins fall?', packet: { data_gaps: [{ concept: 'CostOfMaterials' }] } })).toMatchObject({ enabled: true, reason: 'marked_data_gap' });
    expect(webSearchDecision({ question: 'What is happening in crude today?', intent: { kind: 'macro' } })).toMatchObject({ enabled: true, reason: 'fresh_information_required' });
    expect(webSearchDecision({ question: 'Compare Reliance revenue', intent: { kind: 'compare' }, evidence: [{ evidence_id: 'ev_1' }] })).toMatchObject({ enabled: false, reason: 'marked_packet_sufficient' });
    expect(webSearchDecision({ question: 'Latest peers', packet: { data_gaps: [{}] }, pointInTime: true })).toMatchObject({ enabled: false, reason: 'historical_as_of' });
  });

  it('searches when requested analytical coverage is absent from the packet', () => {
    expect(webSearchDecision({
      question: 'Compare Reliance with relevant peers today and show how valuation changed over five years',
      packet: { companies: [{ company_id: 'reliance' }], financial_facts: [] },
    })).toEqual({ enabled: true, reason: 'requested_context_missing' });
    expect(webSearchDecision({
      question: 'Compare TCS with Infosys, HCLTech, Wipro and Accenture',
      packet: { companies: [{ company_id: 'tcs' }], financial_facts: [] },
    })).toEqual({ enabled: true, reason: 'requested_context_missing' });
  });

  it('searches to complete the legs Marked cannot supply for return attribution', () => {
    expect(webSearchDecision({
      question: 'Why has Infosys underperformed?',
      packet: { data_plan: { analysis_requirements: ['peer_relative_return'] } },
    })).toEqual({ enabled: true, reason: 'performance_attribution_required' });
  });

  it('uses the typed mandate gap instead of guessing from packet shape', () => {
    expect(webSearchDecision({
      question: 'Build an investment view',
      mandateCoverage: [{ id: 'business_mix', material: true, status: 'missing' }],
    })).toEqual({ enabled: true, reason: 'mandate_gap:business_mix' });
  });
});
