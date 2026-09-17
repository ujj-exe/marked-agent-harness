import { describe, expect, it } from 'vitest';
import { applyMandateToPlan, assessPacketCoverage, buildResearchMandate, needsSemanticPlanReview } from './research-mandate.js';
import { buildDataPlan } from './plan.js';

describe('research mandate', () => {
  it('turns a broker deep dive into explicit answer-level obligations', () => {
    const question = 'Build an investment view on TCS over five years: growth, margins, debt, capex, client mix, AI economics, valuation, peers and what to watch next quarter.';
    const plan = buildDataPlan(question, { declared: { kind: 'company', references: ['TCS'] } });
    const mandate = buildResearchMandate({ question, plan, mode: 'analytical' });
    const ids = mandate.requirements.map(item => item.id);
    expect(ids).toEqual(expect.arrayContaining([
      'financial_performance', 'operating_drivers', 'balance_sheet_and_cash',
      'capital_allocation', 'business_mix', 'valuation_current', 'peer_comparison',
      'ai_economics', 'forward_monitoring',
    ]));
    expect(needsSemanticPlanReview(question, mandate, plan)).toBe(true);
  });

  it('does not turn a factual lookup into a full-company dossier', () => {
    const plan = buildDataPlan('Infosys PAT FY2025');
    const mandate = buildResearchMandate({ question: plan.question, plan, mode: 'factual' });
    const enriched = applyMandateToPlan(plan, mandate);
    expect(mandate.requirements).toEqual([]);
    expect(enriched.concepts).toEqual(plan.concepts);
  });

  it('adds supporting retrieval without manufacturing row-level gaps', () => {
    const question = 'Why has Infosys underperformed versus peers?';
    const plan = buildDataPlan(question, { declared: { kind: 'company', references: ['Infosys'] } });
    const mandate = buildResearchMandate({ question, plan, mode: 'analytical' });
    const enriched = applyMandateToPlan(plan, mandate);
    expect(enriched.datasets).toEqual(expect.arrayContaining(['prices', 'corporate_actions']));
    expect(enriched.concepts).toContain('BasicEarningsPerShare');
    expect(enriched.required_concepts).toEqual(plan.required_concepts);
  });

  it('keeps a multi-year return attribution focused on the requested bridge', () => {
    const question = 'Why has Infosys underperformed over the last three years? Break the return into earnings growth, valuation change, dividends and peer-relative performance versus TCS and Wipro.';
    const plan = buildDataPlan(question, { declared: { kind: 'company', references: ['Infosys', 'TCS', 'Wipro'] } });
    const ids = buildResearchMandate({ question, plan, mode: 'analytical' }).requirements.map(item => item.id);
    expect(ids).toEqual(expect.arrayContaining([
      'security_price_return', 'peer_relative_return', 'earnings_revision_path',
      'financial_performance', 'capital_allocation', 'valuation_current',
      'valuation_history', 'peer_comparison',
    ]));
    expect(ids).not.toEqual(expect.arrayContaining(['balance_sheet_and_cash', 'event_linkage']));
  });

  it('identifies exactly which legs Marked cannot yet cover', () => {
    const mandate = buildResearchMandate({
      question: 'Explain Infosys valuation history and earnings revisions',
      plan: { route: 'financial_analysis', analysis_requirements: [] },
      mode: 'analytical',
    });
    const coverage = assessPacketCoverage(mandate, { financial_facts: [] }, []);
    expect(coverage.find(item => item.id === 'valuation_history').status).toBe('missing');
    expect(coverage.find(item => item.id === 'earnings_revision_path').status).toBe('missing');
  });
});
