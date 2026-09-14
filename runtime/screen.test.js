import { describe, expect, it } from 'vitest';
import { parseScreen, plausible } from './screen.js';
import { buildDataPlan } from './plan.js';

const DEMO = 'Screen NSE companies with revenue growth above 20% and net margin '
  + 'above 10% in FY2025. For the top 5, pull 12 quarters of revenue and net '
  + 'margin, the last year of daily prices, and the latest promoter/FII/DII shareholding.';

describe('screen parsing', () => {
  it('reads the question that used to resolve FII as a company', () => {
    const screen = parseScreen(DEMO);
    expect(screen.filters).toEqual([
      { metric: 'revenue_growth', operator: '>', value: 0.2 },
      { metric: 'net_margin', operator: '>', value: 0.1 },
    ]);
    expect(screen.fiscal_year).toBe(2025);
    expect(screen.limit).toBe(5);
    expect(screen.basis).toBe('consolidated');
  });

  it('routes the screen without inventing a company to resolve', () => {
    const plan = buildDataPlan(DEMO, {});
    expect(plan.route).toBe('screen');
    expect(plan.subject).toBe('universe');
    // The whole defect in one assertion: no entity is extracted, so nothing
    // downstream can look up "Screen NSE", "FII" or "DII".
    expect(plan.references).toEqual([]);
  });

  it('leaves every other question alone', () => {
    expect(parseScreen('What was PAT of Reliance in FY2025?')).toBeNull();
    expect(parseScreen('Compare TCS and Infosys')).toBeNull();
    expect(buildDataPlan('Analyze Reliance Industries', {}).route).not.toBe('screen');
  });

  it('reads a bare number on a rate as a percentage', () => {
    // 10 means 10%, and comparing 10 against a fraction matches nobody.
    expect(parseScreen('which companies have net margin above 10')
      .filters[0].value).toBeCloseTo(0.1);
    expect(parseScreen('which companies have net margin above 10%')
      .filters[0].value).toBeCloseTo(0.1);
    // An absolute concept keeps its units.
    expect(parseScreen('find companies with revenue above 5000')
      .filters[0]).toEqual({ metric: 'Revenue', operator: '>', value: 5000 });
  });

  it('keeps a metric named without a threshold out of the filters', () => {
    const screen = parseScreen('which companies have promoter holding above 50% and good fii holding');
    expect(screen.filters).toEqual([
      { metric: 'promoter_holding', operator: '>', value: 0.5 },
    ]);
    expect(screen.dropped).toContain('fii_holding');
  });

  it('reports a screen with no usable threshold instead of screening on nothing', () => {
    const screen = parseScreen('screen companies by net margin');
    expect(screen.filters).toEqual([]);
    expect(screen.dropped).toContain('net_margin');
  });

  it('honours direction and period words', () => {
    const screen = parseScreen('which companies have debt to equity below 0.5 quarterly standalone');
    expect(screen.filters[0]).toEqual({ metric: 'debt_to_equity', operator: '<', value: 0.5 });
    expect(screen.period).toBe('quarterly');
    expect(screen.basis).toBe('standalone');
  });
});

describe('plausibility', () => {
  it('withholds a ratio the data cannot mean', () => {
    // Gayatri Highways came back at 198, a near-zero revenue denominator, and
    // a screen sorts precisely those to the top.
    expect(plausible({ metrics: { net_margin: 198.4 } })).toBe(false);
    expect(plausible({ metrics: { net_margin: 0.69 } })).toBe(true);
    expect(plausible({ metrics: { promoter_pct: 140 } })).toBe(false);
    expect(plausible({ metrics: { promoter_pct: 74.9 } })).toBe(true);
    expect(plausible({ metrics: { Revenue_growth: 85.6 } })).toBe(true);
    expect(plausible({ metrics: { net_margin: null } })).toBe(true);
  });
});
