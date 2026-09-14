export const LABELS = {
  BasicEarningsPerShare: 'Earnings per share (basic)',
  DilutedEarningsPerShare: 'Earnings per share (diluted)',
  ChangesInInventories: 'Inventory change',
  CostOfMaterials: 'Materials cost',
  CurrentTax: 'Current tax',
  DeferredTax: 'Deferred tax',
  DepreciationAndAmortisation: 'Depreciation & amortisation',
  EmployeeBenefitExpense: 'Employee costs',
  FinanceCosts: 'Finance costs',
  NetCashFromFinancingActivities: 'Cash flow from financing',
  NetCashFromInvestingActivities: 'Cash flow from investing',
  NetCashFromOperatingActivities: 'Cash flow from operations',
  NetIncreaseInCash: 'Net change in cash',
  OtherComprehensiveIncome: 'Other comprehensive income',
  OtherExpenses: 'Other expenses',
  OtherIncome: 'Other income',
  ProfitAfterTax: 'Profit after tax',
  ProfitBeforeExceptionalItemsAndTax: 'Profit before exceptional items & tax',
  ProfitBeforeTax: 'Profit before tax',
  PurchasesOfStockInTrade: 'Purchases of stock-in-trade',
  Revenue: 'Revenue',
  TaxExpense: 'Tax expense',
  TotalComprehensiveIncome: 'Total comprehensive income',
  TotalExpenses: 'Total expenses',
  TotalIncome: 'Total income',
  ebit: 'EBIT',
  ebitda: 'EBITDA',
  net_margin: 'Net margin',
  ebit_margin: 'EBIT margin',
  ebitda_margin: 'EBITDA margin',
  effective_tax_rate: 'Effective tax rate',
  interest_coverage: 'Interest coverage',
  cash_conversion: 'Cash conversion',
};

export function normalizeFinancialRows(financials, metrics) {
  const facts = records(financials?.data ?? financials).map(item => normalizeRow(item, item.concept_id, LABELS[item.concept_id] ? 'reported metric' : 'raw fact'));
  const derived = records(metrics?.data ?? metrics).flatMap(item => Object.entries(item.metrics || {})
    .map(([key, value]) => normalizeRow({ ...item, value }, key, 'derived metric')));
  const unique = new Map();
  for (const row of [...facts, ...derived]) {
    const key = `${row.metric_id}:${row.period}`;
    if (!unique.has(key) || row.classification === 'derived metric') unique.set(key, row);
  }
  return [...unique.values()]
    .sort((a, b) => String(b.period).localeCompare(String(a.period)) || a.metric.localeCompare(b.metric))
    .slice(0, 16);
}

function normalizeRow(item, metricId, classification) {
  const metric = metricId || 'reported fact';
  const value = Number(item.value);
  return {
    metric_id: metric,
    metric: LABELS[metric] || humanize(metric),
    value: formatValue(value, metric, item.unit, item.scale),
    period: item.fiscal_year ? `FY${item.fiscal_year}` : item.period_end || '—',
    basis: item.basis ? humanize(item.basis) : '—',
    classification,
  };
}

function formatValue(value, metric, unit = 'INR', scale = 1) {
  if (!Number.isFinite(value)) return '—';
  if (isPercent(metric)) return `${trimNumber(value * 100, 2)}%`;
  if (metric === 'interest_coverage' || metric === 'cash_conversion') return `${trimNumber(value, 2)}x`;
  if (unit !== 'INR') return trimNumber(value, 2);
  if (/EarningsPerShare/i.test(metric)) return `₹${trimNumber(value * Number(scale || 1), 2)}`;
  return formatRupees(value * Number(scale || 1));
}

function formatRupees(value) {
  const sign = value < 0 ? '-' : '';
  const absolute = Math.abs(value);
  if (absolute >= 1e7) return `${sign}₹${trimNumber(absolute / 1e7, absolute >= 1e9 ? 0 : 1)} Cr`;
  if (absolute >= 1e5) return `${sign}₹${trimNumber(absolute / 1e5, 1)} L`;
  return `${sign}₹${trimNumber(absolute, 2)}`;
}

function trimNumber(value, decimals) {
  return Number(value.toFixed(decimals)).toLocaleString('en-IN', { maximumFractionDigits: decimals });
}

export function isPercent(metric) {
  return /margin|tax_rate|growth|yield|return|percent|ratio/i.test(metric);
}

export function humanize(value) {
  return String(value).replace(/[_-]+/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2').replace(/\b\w/g, char => char.toUpperCase());
}

function records(value) {
  if (Array.isArray(value)) return value.filter(item => item && typeof item === 'object');
  if (!value || typeof value !== 'object') return [];
  for (const key of ['items', 'results', 'records', 'data']) {
    if (Array.isArray(value[key])) return records(value[key]);
  }
  return [value];
}
