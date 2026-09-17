import { describe, expect, it } from 'vitest';
import { applyReview, buildRepairPlan, planReviewSchema, postflightConcern, preflightConcern, reviewPlan, reviewPrompt } from './plan-review.js';
import { buildDataPlan } from './plan.js';

const base = () => ({ ...buildDataPlan('Infosys return on equity'), requires_facts: true });

describe('plan review safety', () => {
  it('discards identifiers Marked does not publish', () => {
    const reviewed = applyReview(base(), {
      verdict: 'revise',
      concepts: ['NetCashFromOperatingActivities', 'FreeCashFlow', 'made_up_metric', 42, null],
    });
    expect(reviewed.concepts).toContain('NetCashFromOperatingActivities');
    expect(reviewed.concepts).not.toContain('FreeCashFlow');
    expect(reviewed.concepts).not.toContain('made_up_metric');
  });

  it('ignores an out-of-vocabulary period, basis or route', () => {
    const plan = base();
    const reviewed = applyReview(plan, { verdict: 'revise', concepts: ['Revenue'], period: 'fortnightly', basis: 'pro-forma', route: 'vibes' });
    expect(reviewed.period).toBe(plan.period);
    expect(reviewed.basis).toBe(plan.basis);
    expect(reviewed.route).toBe(plan.route);
  });

  it('treats a reviewer company name as a candidate, never a replacement', () => {
    // The reviewer has not checked the name against Marked's identity index.
    const reviewed = applyReview(base(), { verdict: 'revise', concepts: ['Revenue'], references: ['Infosys Ltd'] });
    expect(reviewed.references).toEqual(base().references);
    expect(reviewed.reference_candidates).toContain('Infosys Ltd');
  });

  it('never empties a plan, whatever the reviewer says to drop', () => {
    const plan = base();
    const reviewed = applyReview(plan, { verdict: 'revise', unnecessary: plan.concepts });
    expect(reviewed.concepts.length).toBeGreaterThan(0);
  });

  it('leaves the plan untouched on an ok verdict', () => {
    const plan = base();
    expect(applyReview(plan, { verdict: 'ok', reasoning: 'fine' })).toBe(plan);
  });

  it('rejects nonsense fiscal years', () => {
    const reviewed = applyReview(base(), { verdict: 'revise', concepts: ['Revenue'], fiscal_years: [1200, 'x', 2026, 9999] });
    expect(reviewed.fiscal_years).toEqual([2026]);
  });
});

describe('review loop', () => {
  const plan = base();

  it('survives a reviewer that throws', async () => {
    const agent = { run: async () => { throw new Error('cli exploded'); } };
    const out = await reviewPlan(agent, 'q', plan, {}, { rounds: 2 });
    expect(out.plan).toBe(plan);
    expect(out.reviews[0].error).toMatch(/cli exploded/);
  });

  it('survives a reviewer that answers nonsense', async () => {
    const agent = { run: async () => 'not json at all' };
    const out = await reviewPlan(agent, 'q', plan, {}, { rounds: 2 });
    expect(out.plan).toBe(plan);
    expect(out.reviews[0].error).toMatch(/no usable verdict/);
  });

  it('stops as soon as the reviewer is satisfied', async () => {
    let calls = 0;
    const agent = { run: async () => { calls++; return { verdict: 'ok', reasoning: 'sufficient' }; } };
    await reviewPlan(agent, 'q', plan, {}, { rounds: 3 });
    expect(calls).toBe(1);
  });

  it('counts a swap as a change, so the loop does not stop early', async () => {
    // Three concepts out, three in, nets to zero but is the useful case: this is
    // exactly what a good reviewer did to a real ROE plan.
    const start = { ...plan, concepts: ['ProfitAfterTax', 'TotalEquity', 'return_on_equity', 'net_margin', 'ebitda_margin', 'ebit_margin'] };
    const agent = {
      run: async () => ({ verdict: 'revise', reasoning: 'swap', concepts: ['NetCashFromOperatingActivities', 'Borrowings', 'debt_to_equity'], unnecessary: ['net_margin', 'ebitda_margin', 'ebit_margin'] }),
    };
    const out = await reviewPlan(agent, 'q', start, {}, { rounds: 2 });
    expect(out.reviews[0].added).toContain('NetCashFromOperatingActivities');
    expect(out.reviews[0].removed).toContain('net_margin');
    expect(out.reviews.length).toBe(2);   // a swap counts as a change
  });

  it('reviews a company question even when the planner found no metric', async () => {
    // "Is promoter confidence holding up" needs shareholding and no concepts at
    // all. Gating review on requires_facts skipped exactly the plans that needed
    // correcting most.
    let calls = 0;
    const agent = { run: async () => { calls++; return { verdict: 'revise', reasoning: '', datasets: ['shareholding'] }; } };
    const out = await reviewPlan(agent, 'q', { ...plan, requires_facts: false, concepts: [], required_concepts: [] }, {});
    // Exactly one repair. A loop of model calls is not a harness.
    expect(calls).toBe(1);
    expect(out.plan.datasets).toEqual(['shareholding']);
    expect(out.reviews[0].datasets_added).toEqual(['shareholding']);
  });

  it('does not review a question that is not about a company', async () => {
    let calls = 0;
    const agent = { run: async () => { calls++; return { verdict: 'ok', reasoning: '' }; } };
    await reviewPlan(agent, 'q', { ...plan, subject: 'macro' }, {});
    expect(calls).toBe(0);
  });

  it('keeps only datasets the runtime can actually fetch', () => {
    const reviewed = applyReview(plan, { verdict: 'revise', datasets: ['shareholding', 'astrology', 'filings', 'news'] });
    expect(reviewed.datasets).toEqual(['shareholding', 'filings', 'news']);
  });

  it('keeps only answer requirements enforced by the completion gate', () => {
    const reviewed = applyReview(plan, {
      verdict: 'revise',
      analysis_requirements: ['valuation_history', 'peer_relative_return', 'made_up_leg'],
      references: ['TCS'],
    });
    expect(reviewed.analysis_requirements).toEqual(['valuation_history', 'peer_relative_return']);
    expect(reviewed.references).toContain('TCS');
  });

  it('tells the reviewer the vocabulary and asks for intent first', () => {
    const prompt = reviewPrompt('Is the growth sustainable?', plan, {}, 1);
    expect(prompt).toContain('ProfitAfterTax');
    expect(prompt).toContain('what the person actually wants');
    expect(prompt).toContain(JSON.stringify(planReviewSchema).slice(0, 40));
  });
});

// ── Paying for review only when it is worth it ──────────────────────────────
// A review costs ~40s. On "What was Infosys PAT in FY2025?" that is 40 seconds
// to be told the obvious plan was fine, so triage is deterministic and free and
// the judge is an exception handler.

describe('review triage', () => {
  const company = extra => ({ subject: 'company', required_concepts: ['ProfitAfterTax'], datasets: [], ...extra });

  it('leaves a plan that resolved a measure alone', () => {
    expect(preflightConcern(company())).toBeNull();
  });

  it('flags a company question that resolved no measure at all', () => {
    expect(preflightConcern(company({ required_concepts: [] }))).toMatch(/no measure/);
    // …unless it already knows which dataset to read.
    expect(preflightConcern(company({ required_concepts: [], datasets: ['shareholding'] }))).toBeNull();
  });

  it('flags two planners that share no concepts', () => {
    const disagree = company({ candidates: { local: { concepts: ['Revenue'] }, marked: { concepts: ['Borrowings'] } } });
    expect(preflightConcern(disagree)).toMatch(/no concepts in common/);
    const agree = company({ candidates: { local: { concepts: ['Revenue', 'ProfitAfterTax'] }, marked: { concepts: ['Revenue'] } } });
    expect(preflightConcern(agree)).toBeNull();
  });

  it('never reviews a question that is not about a company', () => {
    expect(preflightConcern({ subject: 'macro', required_concepts: [] })).toBeNull();
    expect(postflightConcern({ subject: 'macro' }, { facts: [] })).toBeNull();
  });

  it('is the results that decide: nothing back means the plan was wrong', () => {
    expect(postflightConcern(company(), { facts: [] })).toMatch(/no facts at all/);
  });

  it('treats one missing line as coverage, most of them as a broken plan', () => {
    const plan = company({ required_concepts: ['Revenue', 'ProfitAfterTax', 'NetCashFromOperatingActivities', 'TotalEquity'] });
    const got = ids => ({ facts: ids.map(id => ({ concept_id: id })) });
    // Three of four present: the fourth is a genuine coverage gap, reported as one.
    expect(postflightConcern(plan, got(['Revenue', 'ProfitAfterTax', 'NetCashFromOperatingActivities']))).toBeNull();
    // Half of it missing: the plan asked for the wrong things.
    expect(postflightConcern(plan, got(['Revenue', 'ProfitAfterTax']))).toMatch(/2 of 4/);
  });

  it('does not accept a one-company packet for peer-relative performance', () => {
    const plan = company({ analysis_requirements: ['peer_relative_return'] });
    expect(postflightConcern(plan, { facts: [{ concept_id: 'ProfitAfterTax' }], companies: [{ entity: {} }] }))
      .toMatch(/peer or benchmark/);
  });

  it('says nothing when the plan asked for nothing to begin with', () => {
    expect(postflightConcern(company({ required_concepts: [] }), { facts: [] })).toBeNull();
  });
});

// ── The builder is the deterministic half ───────────────────────────────────
// Probabilistic planning, deterministic execution, probabilistic diagnosis,
// deterministic validation, bounded repair. The judge never writes to Marked.

describe('query/plan builder', () => {
  const plan = () => ({ ...buildDataPlan('Infosys revenue'), requires_facts: true, subject: 'company' });

  it('is the only thing that turns a diagnosis into a plan', () => {
    const repaired = buildRepairPlan(plan(), {
      verdict: 'revise',
      reasoning: 'returns need the equity base',
      concepts: ['TotalEquity', 'NotAConcept'],
      datasets: ['shareholding', 'astrology'],
      period: 'annual',
      basis: 'nonsense',
    });
    expect(repaired.concepts).toContain('TotalEquity');
    expect(repaired.concepts).not.toContain('NotAConcept');
    expect(repaired.datasets).toEqual(['shareholding']);
    expect(repaired.basis).toBe(plan().basis);          // the bad enum is dropped
  });

  it('adds resolved peer candidates when return attribution requires them', () => {
    const before = { ...plan(), references: ['INFY'], analysis_requirements: ['peer_relative_return'] };
    const repaired = buildRepairPlan(before, {
      verdict: 'revise', reasoning: 'peer return required', references: ['TCS', 'HCLTech', 'Wipro'],
    });
    expect(repaired.references).toEqual(['INFY', 'TCS', 'HCLTech', 'Wipro']);
  });

  it('bounds the repair to one round by default', async () => {
    let calls = 0;
    const agent = { run: async () => { calls++; return { verdict: 'revise', reasoning: 'more', concepts: ['TotalEquity'] }; } };
    await reviewPlan(agent, 'q', plan(), {});
    expect(calls).toBe(1);
  });

  it('leaves the plan exactly as it was when the diagnosis is unusable', async () => {
    const before = plan();
    for (const bad of [null, 'text', { verdict: 'maybe' }, {}]) {
      const out = await reviewPlan({ run: async () => bad }, 'q', before, {});
      expect(out.plan).toBe(before);
    }
  });
});
