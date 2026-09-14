import { describe, expect, it } from 'vitest';
import { buildDataPlan, derivedGrowth, executeDataPlan, extractEntities, extractFiscalYears, markedPlan } from './plan.js';
import { extractConcepts, isDerived, resolveConcept } from '../data/concepts.js';

describe('financial metric normalization', () => {
  it('maps the common names of a concept onto one canonical Marked identifier', () => {
    for (const alias of ['PAT', 'profit after tax', 'net profit', 'net income', 'profit attributable to owners', 'earnings']) {
      expect(resolveConcept(alias)).toBe('ProfitAfterTax');
    }
    expect(resolveConcept('EPS')).toBe('BasicEarningsPerShare');
    expect(resolveConcept('revenue')).toBe('Revenue');
    expect(resolveConcept('EBITDA')).toBe('ebitda');
    expect(resolveConcept('operating profit')).toBe('ebit');
  });

  it('prefers the longer concept phrase over the substring inside it', () => {
    expect(extractConcepts('profit before tax')).toEqual(['ProfitBeforeTax']);
    expect(extractConcepts('net profit and revenue')).toEqual(['ProfitAfterTax', 'Revenue']);
  });

  it('never invents an identifier for an unknown measure', () => {
    expect(resolveConcept('vibes')).toBeNull();
    expect(extractConcepts('what is the mood in the market')).toEqual([]);
  });
});

describe('intent extraction', () => {
  it('pulls entity, metric and every requested period out of the failing question', () => {
    const plan = buildDataPlan("Why did Reliance Industries' PAT grow from FY2024 to FY2026?");
    expect(plan.references).toEqual(['Reliance Industries']);
    expect(plan.metric).toBe('ProfitAfterTax');
    expect(plan.fiscal_years).toEqual([2024, 2025, 2026]);
    expect(plan.route).toBe('financial_analysis');
    expect(plan.requires_facts).toBe(true);
  });

  it('separates the company from the metric it is asked about', () => {
    expect(extractEntities('What was Infosys PAT in FY2025?')).toEqual(['Infosys']);
    expect(extractEntities('TCS vs Infosys PAT FY2025')).toEqual(['TCS', 'Infosys']);
    expect(extractEntities('Infosys earnings last financial year')).toEqual(['Infosys']);
  });

  it('expands a fiscal-year range to the years nobody named', () => {
    expect(extractFiscalYears('FY2024 to FY2026')).toEqual([2024, 2025, 2026]);
    expect(extractFiscalYears('FY24-FY26')).toEqual([2024, 2025, 2026]);
    expect(extractFiscalYears('in FY2025')).toEqual([2025]);
    expect(extractFiscalYears('last financial year', { fiscal_year: 2026 })).toEqual([2026]);
  });
});

describe('query routing', () => {
  const route = question => buildDataPlan(question).route;

  it('distinguishes lookup, comparison, analysis, filing and event questions', () => {
    expect(route('What was Infosys PAT in FY2025?')).toBe('financial_metric_lookup');
    expect(route('Compare Infosys and TCS PAT in FY2025')).toBe('comparison');
    expect(route('Why did Reliance PAT grow from FY2024 to FY2026?')).toBe('financial_analysis');
    expect(route("What changed in Reliance's latest filing?")).toBe('filing_research');
    expect(route('Did Reliance declare a dividend this year?')).toBe('event_research');
    expect(route('What is the RBI policy outlook?')).toBe('factual_lookup');
  });

  it('only demands facts when a measure and a company are both named', () => {
    expect(buildDataPlan('What is the RBI policy outlook?').requires_facts).toBe(false);
    expect(buildDataPlan('What is PAT?').requires_facts).toBe(false);
  });
});

// ── Execution ───────────────────────────────────────────────────────────────

function fact(concept, fiscalYear, value) {
  return {
    fact_id: `f_${concept}_${fiscalYear}`, concept_id: concept, fiscal_year: fiscalYear,
    period_end: `${fiscalYear}-03-31`, basis: 'consolidated', value: String(value), unit: 'INR', scale: 1,
    company_id: 'co_ril', company_name: 'Reliance Industries', ticker: 'RELIANCE',
    source_url: `https://nsearchives.nseindia.com/${concept}-${fiscalYear}.xml`, known_at: `${fiscalYear}-05-01T00:00:00Z`,
  };
}

function client(rows) {
  return {
    resolveCompany: async reference => ({
      company: { company_id: 'co_ril', common_name: reference },
      securities: [{ exchange: 'NSE', symbol: 'RELIANCE', segment: 'CASH', security_type: 'EQ' }],
    }),
    financials: async () => ({ data: rows }),
    metrics: async () => ({ data: [] }),
  };
}

describe('plan execution', () => {
  it('retrieves every requested period as its own validated fact', async () => {
    const plan = buildDataPlan('Reliance PAT FY2024 to FY2026');
    const executed = await executeDataPlan(client([
      fact('ProfitAfterTax', 2024, 790200000000),
      fact('ProfitAfterTax', 2025, 810000000000),
      fact('ProfitAfterTax', 2026, 957540000000),
    ]), plan);
    expect(executed.facts).toHaveLength(3);
    expect(executed.facts.map(item => item.period)).toEqual(['FY2024', 'FY2025', 'FY2026']);
    expect(executed.facts.every(item => Number.isFinite(item.value) && item.unit === 'INR' && item.basis === 'consolidated')).toBe(true);
    expect(executed.gaps).toEqual([]);
  });

  it('reports a missing year as a gap instead of quietly shortening the series', async () => {
    const plan = buildDataPlan('Reliance PAT FY2024 to FY2026');
    const executed = await executeDataPlan(client([
      fact('ProfitAfterTax', 2024, 790200000000),
      fact('ProfitAfterTax', 2026, 957540000000),
    ]), plan);
    expect(executed.gaps).toContainEqual({ reference: 'Reliance', concept: 'ProfitAfterTax', fiscal_year: 2025 });
  });

  it('rejects a row that carries no usable value or identity', async () => {
    const executed = await executeDataPlan(client([
      { concept_id: 'ProfitAfterTax', fiscal_year: 2025, basis: 'consolidated', unit: 'INR', company_id: 'co_ril' },
      fact('ProfitAfterTax', 2025, 810000000000),
    ]), buildDataPlan('Reliance PAT FY2025'));
    expect(executed.facts).toHaveLength(1);
    expect(executed.companies[0].rejected[0].reason).toMatch(/missing value/);
  });

  it('keeps the arithmetic behind a derived growth figure', () => {
    const facts = [
      { concept_id: 'ProfitAfterTax', fiscal_year: 2024, period: 'FY2024', value: 100, basis: 'consolidated', unit: 'INR', currency: 'INR', evidence_id: 'ev_001' },
      { concept_id: 'ProfitAfterTax', fiscal_year: 2026, period: 'FY2026', value: 125, basis: 'consolidated', unit: 'INR', currency: 'INR', evidence_id: 'ev_002' },
    ];
    expect(derivedGrowth(facts, 'ProfitAfterTax')).toMatchObject({
      numerator: 25, denominator: 100, growth_pct: 25, from_period: 'FY2024', to_period: 'FY2026',
      basis: 'consolidated', unit: 'INR', evidence_ids: ['ev_001', 'ev_002'],
    });
  });
});

describe('marked retrieval plan', () => {
  it('shapes a RetrievalPlan Marked accepts when it asks for one', () => {
    const plan = markedPlan(buildDataPlan('What was Infosys PAT in FY2025?'));
    expect(plan).toMatchObject({ route: 'exact', reference: 'Infosys', fiscal_year: 2025, period: 'annual', basis: 'consolidated' });
    expect(plan.concepts).toContain('ProfitAfterTax');
  });

  it('offers no plan when there is nothing concrete to plan with', () => {
    expect(markedPlan(buildDataPlan('What is the RBI policy outlook?'))).toBeNull();
  });
});

// ── Cash flow is not the cash balance ───────────────────────────────────────
// "cash flow versus reported earnings" planned CashAndCashEquivalents, then
// reported a DATA GAP for a metric nobody asked about. A semantically different
// concept substituted for the requested one is a planning bug, not a gap.

describe('cash concepts', () => {
  it('separates the flow statement from the balance sheet line', () => {
    expect(extractConcepts('cash flow')).toEqual(['NetCashFromOperatingActivities']);
    expect(extractConcepts('operating cash flow')).toEqual(['NetCashFromOperatingActivities']);
    expect(extractConcepts('cash flow from operations')).toEqual(['NetCashFromOperatingActivities']);
    expect(extractConcepts('free cash flow')).toEqual(['NetCashFromOperatingActivities']);
    expect(extractConcepts('cash and cash equivalents')).toEqual(['CashAndCashEquivalents']);
    expect(extractConcepts('cash balance')).toEqual(['CashAndCashEquivalents']);
    expect(extractConcepts('cash conversion')).toEqual(['cash_conversion']);
  });

  it('asks for the cash balance only when the question is about liquidity', () => {
    for (const question of ['cash flow versus earnings', 'is profit converting to cash']) {
      expect(buildDataPlan(question).required_concepts).not.toContain('CashAndCashEquivalents');
    }
    for (const question of ['What is the cash balance?', 'How is its liquidity?', 'cash on the balance sheet']) {
      expect(buildDataPlan(question).required_concepts).toContain('CashAndCashEquivalents');
    }
  });

  it('retrieves both sides whenever earnings are weighed against cash', () => {
    const questions = [
      "Is there anything unusual in Kaynes Technology's cash flow versus reported earnings?",
      'Is profit converting to cash?',
      'Compare PAT and operating cash flow.',
      'Does Kaynes have an earnings-quality problem?',
      'Is profit backed by cash?',
    ];
    for (const question of questions) {
      const plan = buildDataPlan(question);
      expect(plan.required_concepts).toContain('ProfitAfterTax');
      expect(plan.required_concepts).toContain('NetCashFromOperatingActivities');
      expect(plan.required_concepts).not.toContain('CashAndCashEquivalents');
    }
  });

  it('leaves an ordinary metric question alone', () => {
    expect(buildDataPlan('What was Infosys PAT in FY2025?').required_concepts).toEqual(['ProfitAfterTax']);
    expect(buildDataPlan('What is Reliance revenue?').required_concepts).toEqual(['Revenue']);
  });

  it('keeps reported facts and derived ratios apart', () => {
    // cash_conversion is computed by Marked; the two cash-flow lines are reported.
    expect(isDerived('cash_conversion')).toBe(true);
    expect(isDerived('NetCashFromOperatingActivities')).toBe(false);
    expect(isDerived('CashAndCashEquivalents')).toBe(false);
    const plan = buildDataPlan('Reliance cash conversion');
    expect(plan.concepts.filter(isDerived)).toEqual(['cash_conversion']);
  });

  it('carries working capital as the driver of a profit-to-cash gap', () => {
    const plan = buildDataPlan('Why is Kaynes cash flow below its profit?');
    for (const driver of ['TradeReceivables', 'Inventories', 'TradePayables']) {
      expect(plan.concepts).toContain(driver);
    }
  });
});

// ── Price questions ─────────────────────────────────────────────────────────
// "What is the latest share price of X" is one call to the quote endpoint. It
// has no financial concept, so concept-driven planning found nothing, routed it
// to search, and ended in a DATA GAP for a number already sitting in the API.

describe('price lookup', () => {
  const plan = question => buildDataPlan(question);

  it('routes a quote question straight to the quote dataset', () => {
    for (const question of ['what is the latest share price of reliance', 'reliance stock price', 'what is TCS trading at', 'Reliance market cap']) {
      expect(plan(question).route).toBe('price_lookup');
      expect(plan(question).datasets).toEqual(['quote']);
    }
  });

  it('does not hijack a question that names a financial measure', () => {
    // "share price" and "earnings per share" both contain "share".
    expect(plan('What was Infosys PAT in FY2025?').route).toBe('financial_metric_lookup');
    expect(plan('Infosys earnings per share FY2025').route).toBe('financial_metric_lookup');
    expect(plan('Infosys earnings per share FY2025').datasets).toEqual([]);
  });

  it('reads a company name nobody capitalised', () => {
    // People type "reliance stock price". A matcher that only sees capitals
    // decides that question has no subject at all.
    expect(extractEntities('what is the latest share price of reliance')).toEqual(['reliance']);
    expect(extractEntities('reliance stock price')).toEqual(['reliance']);
    expect(extractEntities('asian paints margins')).toEqual(['asian paints']);
  });

  it('still prefers a properly capitalised name when there is one', () => {
    expect(extractEntities('What was Infosys PAT in FY2025?')).toEqual(['Infosys']);
    expect(extractEntities('TCS vs Infosys PAT FY2025')).toEqual(['TCS', 'Infosys']);
  });

  it('finds no subject in a question that has none', () => {
    expect(extractEntities('what is the share price')).toEqual([]);
  });
});
