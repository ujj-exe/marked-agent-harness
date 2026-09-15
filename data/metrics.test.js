import { describe, it, expect } from 'vitest';
import { computeMetrics, indexFacts, fiscalYearOf, periodLabel, METRIC_IDS, getMetric, CALCULATION_VERSION } from './metrics.js';

const flow = (concept_id, period, value, extra = {}) =>
  ({ concept_id, period, value, basis: 'consolidated', ...extra });
const instant = (concept_id, period_end, value, extra = {}) =>
  ({ concept_id, period_end, value, basis: 'consolidated', ...extra });

const packet = {
  financials: { data: [
    flow('Revenue', 'FY2026', 1000, { evidence_id: 'ev_rev26' }),
    flow('Revenue', 'FY2025', 800, { evidence_id: 'ev_rev25' }),
    flow('ProfitAfterTax', 'FY2026', 100, { evidence_id: 'ev_pat26' }),
    flow('ProfitAfterTax', 'FY2025', 80),
    flow('ProfitBeforeTax', 'FY2026', 130),
    flow('FinanceCosts', 'FY2026', 20),
    flow('NetCashFromOperatingActivities', 'FY2026', 150),
  ] },
  balance: { data: [
    instant('TotalEquity', '2026-03-31', 500, { evidence_id: 'ev_eq26' }),
    instant('Borrowings', '2026-03-31', 300),
    instant('CashAndCashEquivalents', '2026-03-31', 50),
    instant('TradeReceivables', '2026-03-31', 200),
    instant('Inventories', '2026-03-31', 100),
  ] },
};

const at = (rows, id, period = 'FY2026') => rows.find(r => r.metric_id === id && r.period === period);

describe('fiscal periods', () => {
  it('closes an Indian fiscal year in March', () => {
    expect(fiscalYearOf('2026-03-31')).toBe(2026);
    expect(fiscalYearOf('2026-04-01')).toBe(2027);
    expect(fiscalYearOf('2025-12-31')).toBe(2026);
  });

  it('labels a period however it arrives', () => {
    expect(periodLabel('FY2026')).toBe('FY2026');
    expect(periodLabel('2026-03-31')).toBe('FY2026');
    expect(periodLabel('2026')).toBe('FY2026');
    expect(periodLabel('nonsense')).toBeNull();
  });
});

describe('indexFacts', () => {
  it('aligns a balance-sheet instant to the year its date closes', () => {
    const index = indexFacts([instant('TotalEquity', '2026-03-31', 500)]);
    expect(index.get('FY2026:consolidated').facts.get('TotalEquity').value).toBe(500);
  });

  it('prefers the later-known value, so a restatement wins', () => {
    const index = indexFacts([
      flow('Revenue', 'FY2026', 900, { known_at: '2026-05-01' }),
      flow('Revenue', 'FY2026', 1000, { known_at: '2026-11-01' }),
    ]);
    expect(index.get('FY2026:consolidated').facts.get('Revenue').value).toBe(1000);
  });

  it('ignores rows with no usable number', () => {
    const index = indexFacts([flow('Revenue', 'FY2026', 'n/a'), flow('Revenue', 'FY2026', null)]);
    expect(index.size).toBe(0);
  });
});

describe('computeMetrics', () => {
  const rows = computeMetrics(packet, { company_id: 'c1', basis: 'consolidated' });

  it('computes margins and growth from flows', () => {
    expect(at(rows, 'pat_margin').value).toBe(10);          // 100/1000
    expect(at(rows, 'revenue_growth').value).toBe(25);      // (1000-800)/800
  });

  it('computes balance-sheet ratios by pairing instants with flows', () => {
    expect(at(rows, 'roe').value).toBe(20);                 // 100/500
    expect(at(rows, 'net_debt').value).toBe(250);           // 300-50
    expect(at(rows, 'debt_to_equity').value).toBe(0.6);     // 300/500
    expect(at(rows, 'roce').value).toBe(18.75);             // (130+20)/(500+300)
    expect(at(rows, 'receivable_days').value).toBe(73);     // 200/1000*365
    expect(at(rows, 'inventory_days').value).toBe(36.5);
  });

  it('carries the §15.2 contract on every result', () => {
    const roe = at(rows, 'roe');
    for (const key of ['metric_id', 'metric_name', 'unit', 'period', 'basis', 'company_id',
                       'calculation_version', 'input_evidence_ids', 'formula', 'status']) {
      expect(roe).toHaveProperty(key);
    }
    expect(roe.calculation_version).toBe(CALCULATION_VERSION);
    expect(roe.classification).toBe('derived metric');
  });

  it('traces a derived number back to the facts it consumed', () => {
    expect(at(rows, 'roe').input_evidence_ids).toEqual(expect.arrayContaining(['ev_pat26', 'ev_eq26']));
    expect(at(rows, 'revenue_growth').input_evidence_ids).toEqual(expect.arrayContaining(['ev_rev26', 'ev_rev25']));
  });

  it('names the missing input instead of omitting the metric', () => {
    const thin = computeMetrics({ financials: { data: [flow('Revenue', 'FY2026', 1000)] } }, {});
    const roe = at(thin, 'roe');
    expect(roe.status).toBe('gap');
    expect(roe.value).toBeNull();
    expect(roe.missing_inputs).toContain('TotalEquity');
  });

  it('refuses a growth rate off a negative base rather than inventing one', () => {
    const loss = computeMetrics({ financials: { data: [
      flow('ProfitAfterTax', 'FY2026', 50), flow('ProfitAfterTax', 'FY2025', -20),
    ] } }, {});
    expect(at(loss, 'pat_growth').status).toBe('undefined');
    expect(at(loss, 'pat_growth').reason).toMatch(/zero or negative/);
  });

  it('refuses a ratio on a denominator too small to mean anything', () => {
    const tiny = computeMetrics({
      financials: { data: [flow('ProfitAfterTax', 'FY2026', 1000)] },
      balance: { data: [instant('TotalEquity', '2026-03-31', 0.0000001)] },
    }, {});
    expect(at(tiny, 'roe').status).toBe('undefined');
  });

  it('never mixes bases', () => {
    const mixed = computeMetrics({ financials: { data: [
      flow('Revenue', 'FY2026', 1000),
      { concept_id: 'ProfitAfterTax', period: 'FY2026', value: 999, basis: 'standalone' },
    ] } }, { basis: 'consolidated' });
    expect(at(mixed, 'pat_margin').status).toBe('gap');
  });

  it('reports every metric for every period, gaps included', () => {
    const periods = new Set(rows.map(r => r.period));
    expect(periods.has('FY2026')).toBe(true);
    for (const period of periods) {
      expect(rows.filter(r => r.period === period)).toHaveLength(METRIC_IDS.length);
    }
  });

  it('exposes each metric definition for other surfaces to read', () => {
    for (const id of METRIC_IDS) expect(getMetric(id).formula).toBeTruthy();
    expect(getMetric('nope')).toBeNull();
  });
});

describe('period alignment', () => {
  // A fourth quarter and a full year both end on 31 March; only period_start
  // tells them apart. Reading Q4 profit as the year's put ROE at 1.9% for a
  // company whose real return is ~9%.
  const q4 = { concept_id: 'ProfitAfterTax', period_start: '2026-01-01', period_end: '2026-03-31', value: 25, basis: 'consolidated' };
  const fy = { concept_id: 'ProfitAfterTax', period_start: '2025-04-01', period_end: '2026-03-31', value: 100, basis: 'consolidated' };

  it('takes the full year, not the quarter that ends on the same day', () => {
    const index = indexFacts([q4, fy]);
    expect(index.get('FY2026:consolidated').facts.get('ProfitAfterTax').value).toBe(100);
  });

  it('refuses to use a quarter at all when no annual figure exists', () => {
    const index = indexFacts([q4]);
    expect(index.get('FY2026:consolidated')).toBeUndefined();
  });

  it('keeps instants, which have no span to measure', () => {
    const index = indexFacts([{ concept_id: 'TotalEquity', period_end: '2026-03-31', value: 500, basis: 'consolidated' }]);
    expect(index.get('FY2026:consolidated').facts.get('TotalEquity').value).toBe(500);
  });

  it('prefers a year-end balance sheet over a half-year one', () => {
    const index = indexFacts([
      { concept_id: 'TotalEquity', period_end: '2025-09-30', value: 400, basis: 'consolidated', known_at: '2025-10-20' },
      { concept_id: 'TotalEquity', period_end: '2026-03-31', value: 500, basis: 'consolidated', known_at: '2026-04-20' },
    ]);
    expect(index.get('FY2026:consolidated').facts.get('TotalEquity').value).toBe(500);
  });

  it('applies the reported scale rather than the bare number', () => {
    const index = indexFacts([{ concept_id: 'Revenue', period_start: '2025-04-01', period_end: '2026-03-31', value: 12, scale: 10000000, basis: 'consolidated' }]);
    expect(index.get('FY2026:consolidated').facts.get('Revenue').value).toBe(120000000);
  });
});
