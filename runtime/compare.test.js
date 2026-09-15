import { describe, it, expect } from 'vitest';
import { parseCompare, comparisonTable, leadersTable, compareBlocks, COMPARE_METRICS } from './compare.js';

const flow = (concept_id, fy, value) => ({
  concept_id, period: `FY${fy}`, value, basis: 'consolidated',
  period_start: `${fy - 1}-04-01`, period_end: `${fy}-03-31`,
});
const instant = (concept_id, fy, value) => ({ concept_id, period_end: `${fy}-03-31`, value, basis: 'consolidated' });

const member = (symbol, { pat, equity, borrowings, cash = 50, revenue = 1000 }) => ({
  world: {
    symbol, basis: 'consolidated',
    packet: {
      financials: { data: [flow('Revenue', 2026, revenue), flow('ProfitAfterTax', 2026, pat)] },
      balance: { data: [
        instant('TotalEquity', 2026, equity),
        instant('Borrowings', 2026, borrowings),
        instant('CashAndCashEquivalents', 2026, cash),
      ] },
    },
  },
});

const strong = member('INFY', { pat: 200, equity: 600, borrowings: 0, cash: 300 });
const weak = member('TCS', { pat: 100, equity: 900, borrowings: 400, cash: 50 });

const rowFor = (table, name) => table.rows.find(r => r.cells[0] === name);

describe('parseCompare', () => {
  it('reads the forms people actually type', () => {
    expect(parseCompare('/compare INFY TCS').references).toEqual(['INFY', 'TCS']);
    expect(parseCompare('/compare INFY and TCS').references).toEqual(['INFY', 'TCS']);
    expect(parseCompare('/compare INFY vs TCS').references).toEqual(['INFY', 'TCS']);
    expect(parseCompare('/compare INFY, TCS, HCLTECH').references).toEqual(['INFY', 'TCS', 'HCLTECH']);
  });

  it('needs two names and refuses a crowd', () => {
    expect(parseCompare('/compare INFY').error).toMatch(/2 to 5/);
    expect(parseCompare('/compare a b c d e f').error).toMatch(/at most 5/);
  });

  it('claims nothing else', () => {
    expect(parseCompare('compare these two')).toBeNull();
    expect(parseCompare('/world INFY')).toBeNull();
  });
});

describe('comparisonTable', () => {
  const table = comparisonTable([strong, weak]);

  it('puts one column per company', () => {
    expect(table.headers).toEqual(['Metric', 'INFY', 'TCS']);
  });

  it('computes every column the same way', () => {
    const roe = rowFor(table, 'Return on equity');
    expect(roe.cells[1]).toContain('33.33%');   // 200/600
    expect(roe.cells[2]).toContain('11.11%');   // 100/900
  });

  it('names the period beside the figure, since coverage differs by company', () => {
    expect(rowFor(table, 'Return on equity').cells[1]).toContain('FY2026');
  });

  it('shows a gap rather than dropping a company that lacks the input', () => {
    const thin = { world: { symbol: 'NEW', basis: 'consolidated', packet: { financials: { data: [flow('Revenue', 2026, 50)] } } } };
    const withGap = comparisonTable([strong, thin]);
    expect(rowFor(withGap, 'Return on equity').cells[2]).toBe('—');
  });

  it('says so when nothing at all can be compared', () => {
    const empty = comparisonTable([{ world: { symbol: 'A', packet: {} } }, { world: { symbol: 'B', packet: {} } }]);
    expect(empty.rows[0].cells[0]).toContain('Nothing computable');
  });
});

describe('leadersTable', () => {
  const leaders = leadersTable([strong, weak]);

  it('picks the higher value where higher is better', () => {
    expect(rowFor(leaders, 'Return on equity').cells[1]).toBe('INFY');
  });

  it('picks the lower value where lower is better', () => {
    // INFY has no borrowings, so its debt/equity and net debt are the better ones.
    expect(rowFor(leaders, 'Debt / equity').cells[1]).toBe('INFY');
    expect(rowFor(leaders, 'Net debt').cells[1]).toBe('INFY');
  });

  it('skips a measure only one company can report', () => {
    const thin = { world: { symbol: 'NEW', basis: 'consolidated', packet: {} } };
    expect(rowFor(leadersTable([strong, thin]), 'Return on equity')).toBeUndefined();
  });
});

describe('compareBlocks', () => {
  it('titles the workspace and renders both tables', () => {
    const blocks = compareBlocks([strong, weak]);
    expect(blocks.find(b => b.id === 'compare-title').text).toBe('INFY  ×  TCS');
    expect(blocks.some(b => b.id === 'compare-table')).toBe(true);
    expect(blocks.some(b => b.id === 'compare-leaders')).toBe(true);
  });
});
