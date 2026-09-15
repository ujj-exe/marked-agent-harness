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

/**
 * What an analyst reads first, in the order they read it.
 *
 * The cap below used to fall on an alphabetical sort, so a company with many
 * concepts filled all its slots with A–E line items and Revenue, PAT and the
 * margins — the numbers the page exists for — were dropped without a word.
 * Anything not named here keeps its alphabetical order behind these.
 */
const MATERIAL_ORDER = [
  'Revenue', 'TotalIncome', 'ebitda', 'ebitda_margin', 'ebit', 'ebit_margin',
  'ProfitBeforeTax', 'ProfitAfterTax', 'net_margin',
  'BasicEarningsPerShare', 'DilutedEarningsPerShare',
  'NetCashFromOperatingActivities', 'cash_conversion',
  'NetCashFromInvestingActivities', 'NetCashFromFinancingActivities',
  'FinanceCosts', 'interest_coverage', 'DepreciationAndAmortisation',
  'TotalExpenses', 'EmployeeBenefitExpense', 'CostOfMaterials',
  'TaxExpense', 'effective_tax_rate',
];
const MATERIAL_RANK = new Map(MATERIAL_ORDER.map((id, index) => [id, index]));
const rank = (id) => MATERIAL_RANK.get(id) ?? MATERIAL_ORDER.length;

/**
 * @param {object} financials reported facts
 * @param {object} metrics derived metrics
 * @param {{limit?: number}} options `limit` caps the rows returned; a table
 *   that scrolls should ask for more than a summary does.
 */
export function normalizeFinancialRows(financials, metrics, { limit = 16 } = {}) {
  const facts = records(financials?.data ?? financials).map(item => normalizeRow(item, item.concept_id, LABELS[item.concept_id] ? 'reported metric' : 'raw fact'));
  const derived = records(metrics?.data ?? metrics).flatMap(item => Object.entries(item.metrics || {})
    .map(([key, value]) => normalizeRow({ ...item, value }, key, 'derived metric')));
  const unique = new Map();
  for (const row of [...facts, ...derived]) {
    const key = `${row.metric_id}:${row.period}`;
    if (!unique.has(key) || row.classification === 'derived metric') unique.set(key, row);
  }
  return [...unique.values()]
    .sort((a, b) =>
      String(b.period).localeCompare(String(a.period))
      || rank(a.metric_id) - rank(b.metric_id)
      || a.metric.localeCompare(b.metric))
    .slice(0, limit);
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

/**
 * A timestamp an Indian analyst can read at a glance, in IST.
 *
 * The API returns UTC ISO-8601 with an offset — 25 characters that push real
 * content off the right edge of a table (the renderer drops whole columns to
 * fit). A date-only value stays a date: inventing a time for it would imply a
 * precision the source never had.
 */
export function shortDate(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return '—';
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return formatIst(new Date(`${raw}T00:00:00Z`), false);
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return raw.slice(0, 16);
  return formatIst(parsed, /T\d{2}:\d{2}/.test(raw) && !/T00:00:00/.test(raw));
}

const IST_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function formatIst(date, withTime) {
  const ist = new Date(date.getTime() + (5.5 * 60 * 60 * 1000));
  const day = String(ist.getUTCDate()).padStart(2, '0');
  const month = IST_MONTHS[ist.getUTCMonth()];
  const year = String(ist.getUTCFullYear()).slice(2);
  if (!withTime) return `${day} ${month} ${year}`;
  const hh = String(ist.getUTCHours()).padStart(2, '0');
  const mm = String(ist.getUTCMinutes()).padStart(2, '0');
  return `${day} ${month} ${year} ${hh}:${mm}`;
}
