import { describe, it, expect } from 'vitest';
import { valuation, valuationBlocks, riskFlags, latestSharedPeriod } from './valuation.js';

const f = (concept_id, period, value, extra = {}) =>
  ({ concept_id, period, value, basis: 'consolidated', ...extra });

const world = (overrides = {}) => ({
  basis: 'consolidated',
  packet: {
    quote: { data: { price: 1000, market_cap: 1e13 } },
    financial_facts: [
      f('ProfitAfterTax', 'FY2026', 1e12),
      f('ProfitAfterTax', 'FY2027', 2e11),          // a quarter filed early
      f('BasicEarningsPerShare', 'FY2026', 100),
      f('TotalEquity', 'FY2026', 5e12),
      f('ebitda', 'FY2026', 2e12),
      f('Borrowings', 'FY2026', 1e12),
      f('CashAndCashEquivalents', 'FY2026', 2e11),
    ],
    ...overrides,
  },
});

const row = (v, name) => v.rows.find(r => r.cells[0] === name);

describe('latestSharedPeriod', () => {
  // Profit carries an FY2027 row that per-share profit has no counterpart for.
  it('ignores a period only one concept reports', () => {
    expect(latestSharedPeriod(world(), ['ProfitAfterTax', 'BasicEarningsPerShare'])).toBe('FY2026');
  });

  it('is null when a concept is absent entirely', () => {
    expect(latestSharedPeriod(world(), ['ProfitAfterTax', 'Nope'])).toBeNull();
  });
});

describe('valuation', () => {
  const v = valuation(world());

  it('takes market capitalisation from the live quote', () => {
    expect(row(v, 'Market capitalisation').cells[2]).toBe('live quote');
  });

  // PAT ÷ EPS overstates shares wherever minority interests exist, because EPS
  // is struck on profit attributable to owners.
  it('derives shares from market cap ÷ price, not from PAT ÷ EPS', () => {
    expect(row(v, 'Shares outstanding').cells[2]).toContain('market cap ÷ price');
    expect(v.shares).toBeCloseTo(1e10, 0);           // 1e13 / 1000
  });

  it('computes the multiples', () => {
    expect(row(v, 'P / E').cells[1]).toBe('10.00x');        // 1000 / 100
    expect(row(v, 'EV / EBITDA').cells[1]).toBe('5.40x');   // (1e13 + 8e11) / 2e12
    expect(row(v, 'P / B').cells[1]).toBe('2.00x');         // 1000 / (5e12/1e10)
  });

  it('names what it could not compute rather than leaving a blank', () => {
    const thin = valuation({ basis: 'consolidated', packet: { financial_facts: [] } });
    expect(thin.gaps).toContain('P / E');
    expect(thin.rows.every(r => r.cells[1] !== '—')).toBe(true);
  });

  it('says so on screen', () => {
    const blocks = valuationBlocks({ basis: 'consolidated', packet: { financial_facts: [] } });
    expect(blocks.map(b => b.text ?? '').join(' ')).toContain('not computable');
  });
});

describe('riskFlags', () => {
  it('reads thresholds off computed metrics, with no model involved', () => {
    const flags = riskFlags(world());
    const leverage = flags.find(flag => flag.name === 'Leverage');
    expect(leverage.level).toBe('ok');                  // debt 1e12 / equity 5e12 = 0.2x
    expect(leverage.detail).toContain('0.20×');
  });

  it('raises leverage when debt exceeds equity', () => {
    const w = world();
    w.packet.financial_facts = w.packet.financial_facts.map(r =>
      r.concept_id === 'Borrowings' ? { ...r, value: 1.2e13 } : r);
    expect(riskFlags(w).find(f => f.name === 'Leverage').level).toBe('alarm');
  });

  it('says a signal is unknown rather than letting it pass as calm', () => {
    const flags = riskFlags({ basis: 'consolidated', packet: {} });
    expect(flags.every(flag => flag.level === 'unknown')).toBe(true);
  });

  it('flags a promoter pledge, which has no equivalent outside India', () => {
    const w = world();
    w.packet.shareholding = { data: [{ pledged_pct: 30, period_end: '2026-06-30' }] };
    const pledge = riskFlags(w).find(flag => flag.name === 'Promoter pledge');
    expect(pledge.level).toBe('alarm');
    expect(pledge.detail).toContain('30.0%');
  });
});
