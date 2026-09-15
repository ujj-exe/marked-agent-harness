import { describe, it, expect } from 'vitest';
import { resolveSeries, resolveRange, resolveTransform, buildSeries, seriesBlocks, formatValue, CHARTABLE_KEYS, buildComparison, comparisonBlocks } from './chart.js';

const flow = (concept_id, fy, value) => ({
  concept_id, period: `FY${fy}`, value, basis: 'consolidated',
  period_start: `${fy - 1}-04-01`, period_end: `${fy}-03-31`, evidence_id: `ev_${concept_id}_${fy}`,
});
const instant = (concept_id, fy, value) => ({ concept_id, period_end: `${fy}-03-31`, value, basis: 'consolidated' });

const world = () => ({
  symbol: 'RELIANCE', basis: 'consolidated',
  packet: {
    price: { data: Array.from({ length: 40 }, (_, i) => ({
      ts: new Date(Date.now() - (39 - i) * 86400000).toISOString(), close: 1000 + i * 5,
    })) },
    financials: { data: [
      flow('Revenue', 2023, 800), flow('Revenue', 2024, 900), flow('Revenue', 2025, 1000), flow('Revenue', 2026, 1200),
      flow('ProfitAfterTax', 2025, 100), flow('ProfitAfterTax', 2026, 120),
    ] },
    balance: { data: [instant('TotalEquity', 2025, 500), instant('TotalEquity', 2026, 600)] },
  },
});

describe('resolving what to chart', () => {
  it('accepts names, aliases and unambiguous prefixes', () => {
    expect(resolveSeries('revenue').key).toBe('revenue');
    expect(resolveSeries('sales').key).toBe('revenue');
    expect(resolveSeries('roc').key).toBe('roce');
    expect(resolveSeries('ROE').key).toBe('roe');
  });

  it('refuses a prefix that could mean two things', () => {
    // `rev` is both Revenue and Revenue growth — charting either would be a guess.
    expect(resolveSeries('rev')).toBeNull();
  });

  it('refuses the unknown rather than charting something else', () => {
    expect(resolveSeries('wibble')).toBeNull();
    expect(resolveSeries('')).toBeNull();
  });

  it('offers every metric the library computes', () => {
    expect(CHARTABLE_KEYS).toEqual(expect.arrayContaining(['price', 'revenue', 'roe', 'net_debt', 'pat_margin']));
  });

  it('reads ranges and transforms', () => {
    expect(resolveRange('5Y')).toBe('5y');
    expect(resolveRange('7z')).toBeNull();
    expect(resolveTransform('normalized')).toBe('indexed');
    expect(resolveTransform('yoy')).toBe('yoy');
    expect(resolveTransform('nope')).toBeNull();
  });
});

describe('building a series', () => {
  it('reads a reported line item, newest last', () => {
    const series = buildSeries(world(), { series: 'revenue' });
    expect(series.points.map(p => p.label)).toEqual(['FY2023', 'FY2024', 'FY2025', 'FY2026']);
    expect(series.points.at(-1).value).toBe(1200);
    expect(series.unit).toBe('INR');
  });

  it('carries evidence, so a plotted point is traceable', () => {
    const series = buildSeries(world(), { series: 'revenue' });
    expect(series.points.at(-1).evidence).toContain('ev_Revenue_2026');
  });

  it('reads a ratio from the metric library rather than recomputing it', () => {
    const series = buildSeries(world(), { series: 'roe' });
    // PAT 120 / equity 600 = 20%
    expect(series.points.at(-1).value).toBeCloseTo(20, 5);
    expect(series.unit).toBe('%');
  });

  it('honours a range', () => {
    expect(buildSeries(world(), { series: 'revenue', range: '1y' }).points).toHaveLength(1);
    expect(buildSeries(world(), { series: 'revenue', range: 'max' }).points.length).toBeGreaterThan(1);
  });

  it('rebases to 100 when indexed', () => {
    const series = buildSeries(world(), { series: 'revenue', transform: 'indexed' });
    expect(series.points[0].value).toBe(100);
    expect(series.points.at(-1).value).toBeCloseTo(150, 5);  // 1200/800
    expect(series.unit).toBe('index');
  });

  it('computes year-on-year change', () => {
    const series = buildSeries(world(), { series: 'revenue', transform: 'yoy' });
    expect(series.points.at(-1).value).toBeCloseTo(20, 5);   // 1000 → 1200
    expect(series.points).toHaveLength(3);                    // no change for the first year
  });

  it('computes CAGR as a single figure over the span', () => {
    const series = buildSeries(world(), { series: 'revenue', transform: 'cagr' });
    expect(series.points).toHaveLength(1);
    expect(series.points[0].value).toBeCloseTo(14.47, 1);     // (1200/800)^(1/3)-1
    expect(series.note).toMatch(/3 years/);
  });

  it('refuses CAGR on a non-positive endpoint instead of returning NaN', () => {
    const w = world();
    w.packet.financials.data = [flow('Revenue', 2025, -10), flow('Revenue', 2026, 100)];
    const series = buildSeries(w, { series: 'revenue', transform: 'cagr' });
    expect(series.points).toHaveLength(0);
    expect(series.note).toMatch(/positive endpoints/);
  });

  it('filters price by window and keeps it chronological', () => {
    const series = buildSeries(world(), { series: 'price', range: '1m' });
    expect(series.kind).toBe('price');
    expect(series.points.length).toBeLessThanOrEqual(32);
    const labels = series.points.map(p => p.label);
    expect([...labels].sort()).toEqual(labels);
  });

  it('says what is missing rather than drawing an empty chart', () => {
    const series = buildSeries({ basis: 'consolidated', packet: {} }, { series: 'revenue' });
    expect(series.points).toHaveLength(0);
    expect(series.note).toMatch(/not reported/);
  });

  it('never mixes a basis it was not asked for', () => {
    const w = world();
    w.packet.financials.data.push({ ...flow('Revenue', 2026, 99999), basis: 'standalone' });
    expect(buildSeries(w, { series: 'revenue' }).points.at(-1).value).toBe(1200);
  });
});

describe('rendering', () => {
  it('draws fundamentals as labelled bars with a change column', () => {
    const blocks = seriesBlocks(buildSeries(world(), { series: 'revenue' }), { width: 100 });
    const table = blocks.find(b => b.table)?.table;
    expect(table.headers.slice(0, 4)).toEqual(['Period', '', 'Value', 'Δ']);
    expect(table.rows.at(-1).cells[0]).toBe('FY2026');
    expect(table.rows.at(-1).cells[3]).toBe('+20.0%');
  });

  it('draws price as a line', () => {
    const blocks = seriesBlocks(buildSeries(world(), { series: 'price' }), { width: 100 });
    expect(blocks.some(b => b.panel === 'chart')).toBe(true);
  });

  it('shows a negative value as a visible bar, not an absent one', () => {
    const w = world();
    w.packet.financials.data = [flow('Revenue', 2025, -50), flow('Revenue', 2026, 100)];
    const table = seriesBlocks(buildSeries(w, { series: 'revenue' }), { width: 100 }).find(b => b.table).table;
    for (const row of table.rows) expect(row.cells[1].trim().length).toBeGreaterThan(0);
  });

  it('states the reason when there is nothing to draw', () => {
    const blocks = seriesBlocks(buildSeries({ packet: {} }, { series: 'revenue' }));
    expect(blocks.map(b => b.text).join(' ')).toMatch(/not reported/);
  });
});

describe('formatValue', () => {
  it('uses Indian market conventions', () => {
    expect(formatValue(1.2e11, 'INR')).toBe('₹12,000 Cr');
    expect(formatValue(12.345, '%')).toBe('12.35%');
    expect(formatValue(2.014, 'x')).toBe('2.01x');
    expect(formatValue(57.4, 'days')).toBe('57d');
    expect(formatValue(NaN, '%')).toBe('—');
  });
});

describe('comparing a measure across companies', () => {
  const company = (symbol, values) => ({
    symbol, basis: 'consolidated',
    packet: { financials: { data: Object.entries(values).map(([fy, v]) => flow('Revenue', Number(fy), v)) } },
  });
  const a = company('INFY', { 2024: 100, 2025: 120, 2026: 150 });
  const b = company('TCS', { 2024: 200, 2025: 210, 2026: 240 });

  it('rebases an absolute measure, since levels across companies say only who is bigger', () => {
    const c = buildComparison([a, b], { series: 'revenue' });
    expect(c.transform).toBe('indexed');
    expect(c.note).toMatch(/rebased to 100/);
    const fy2026 = c.columns.map(col => col.series.points.find(p => p.label === 'FY2026').value);
    expect(fy2026[0]).toBeCloseTo(150, 5);   // INFY 100 → 150
    expect(fy2026[1]).toBeCloseTo(120, 5);   // TCS 200 → 240
  });

  it('respects a transform that was asked for', () => {
    expect(buildComparison([a, b], { series: 'revenue', transform: 'yoy' }).transform).toBe('yoy');
  });

  it('leaves ratios alone — a margin is already comparable', () => {
    const c = buildComparison([a, b], { series: 'pat_margin' });
    expect(c.transform).toBe('absolute');
  });

  it('shows only periods every company reports', () => {
    const short = company('WIPRO', { 2026: 50 });
    expect(buildComparison([a, short], { series: 'revenue' }).periods).toEqual(['FY2026']);
  });

  it('says so rather than comparing one company with itself', () => {
    const c = buildComparison([a, { symbol: 'X', packet: {} }], { series: 'revenue' });
    expect(c.note).toMatch(/Not enough companies/);
  });

  it('renders a column per company', () => {
    const blocks = comparisonBlocks(buildComparison([a, b], { series: 'revenue' }));
    const table = blocks.find(block => block.table).table;
    expect(table.headers).toEqual(['Period', 'INFY', 'TCS']);
    expect(table.rows.map(r => r.cells[0])).toEqual(['FY2024', 'FY2025', 'FY2026']);
  });
});

describe('chart points cite their facts', () => {
  const w = {
    symbol: 'INFY', basis: 'consolidated',
    packet: { financials: { data: [
      { concept_id: 'Revenue', period: 'FY2025', value: 100, basis: 'consolidated', period_start: '2024-04-01', period_end: '2025-03-31', evidence_id: 'ev_a' },
      { concept_id: 'Revenue', period: 'FY2026', value: 120, basis: 'consolidated', period_start: '2025-04-01', period_end: '2026-03-31', evidence_id: 'ev_b' },
    ] } },
  };

  it('names the evidence behind each plotted point', () => {
    const blocks = seriesBlocks(buildSeries(w, { series: 'revenue' }), { refs: ids => ids.map(id => id.toUpperCase()) });
    const table = blocks.find(b => b.table).table;
    expect(table.headers.at(-1)).toBe('From');
    expect(table.rows.at(-1).cells.at(-1)).toBe('EV_B');
  });

  it('leaves the column out when no reference resolver is given', () => {
    const table = seriesBlocks(buildSeries(w, { series: 'revenue' })).find(b => b.table).table;
    expect(table.headers.at(-1)).toBe('');
  });
});
