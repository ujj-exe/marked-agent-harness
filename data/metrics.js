/**
 * metrics.js — the deterministic financial metric layer.
 *
 * Every derived number in Marked is computed here, once, so a margin on a
 * chart, in a table, in a screen and in an AI answer is the same margin. The
 * reasoning model explains these; it never calculates them.
 *
 * Three rules make the results trustworthy rather than merely present:
 *
 *   1. A metric is computed only when every input exists for the same period
 *      and basis. A missing input produces a named gap, never a guess.
 *   2. A denominator at or near zero produces an `undefined` state with the
 *      reason attached, not an enormous ratio that sorts to the top of a screen.
 *   3. Each result carries the evidence ids of the facts it consumed, so a
 *      derived number can always be traced back to the filings behind it.
 *
 * Balance-sheet inputs are instants: a value at a date, not across a period.
 * They are aligned to the fiscal year their date closes, which is what lets
 * ROE pair a full-year profit with the equity it was earned on.
 */

export const CALCULATION_VERSION = 'metrics@1';

/** Indian fiscal years run April–March, so a date in Jan–Mar closes the prior year. */
export function fiscalYearOf(dateLike) {
  const date = dateLike instanceof Date ? dateLike : new Date(String(dateLike));
  if (Number.isNaN(date.getTime())) return null;
  const year = date.getUTCFullYear();
  return date.getUTCMonth() >= 3 ? year + 1 : year;
}

/** `FY2026` from anything that names a year. */
export function periodLabel(value) {
  const raw = String(value ?? '');
  const explicit = raw.match(/FY\s?(\d{4})/i);
  if (explicit) return `FY${explicit[1]}`;
  const year = fiscalYearOf(raw) ?? (raw.match(/^\d{4}$/) ? Number(raw) : null);
  return year ? `FY${year}` : null;
}

const CURRENCY = 'INR';
const PERCENT = '%';
const RATIO = 'x';
const DAYS = 'days';

/**
 * The metric library.
 *
 * `inputs` are concept ids; `compute` receives them by name and returns a
 * number, `null` for "cannot be defined here", or throws nothing at all. The
 * registry is the contract — charts, tables and screens all read it, so a
 * metric cannot mean one thing in one surface and something else in another.
 */
export const METRICS = [
  {
    id: 'revenue_growth', name: 'Revenue growth', unit: PERCENT,
    inputs: ['Revenue'], prior: ['Revenue'], formula: '(Revenue − Revenue prior) / Revenue prior',
    compute: ({ Revenue }, prior) => ratio(Revenue - prior.Revenue, prior.Revenue, 100),
  },
  {
    id: 'pat_growth', name: 'PAT growth', unit: PERCENT,
    inputs: ['ProfitAfterTax'], prior: ['ProfitAfterTax'],
    formula: '(PAT − PAT prior) / PAT prior',
    // A negative base makes a growth rate meaningless: −100 to −50 is not −50%.
    compute: ({ ProfitAfterTax }, prior) =>
      prior.ProfitAfterTax <= 0 ? null : ratio(ProfitAfterTax - prior.ProfitAfterTax, prior.ProfitAfterTax, 100),
  },
  {
    id: 'pat_margin', name: 'PAT margin', unit: PERCENT,
    inputs: ['ProfitAfterTax', 'Revenue'], formula: 'PAT / Revenue',
    compute: ({ ProfitAfterTax, Revenue }) => ratio(ProfitAfterTax, Revenue, 100),
  },
  {
    id: 'roe', name: 'Return on equity', unit: PERCENT,
    inputs: ['ProfitAfterTax', 'TotalEquity'], formula: 'PAT / Total equity',
    compute: ({ ProfitAfterTax, TotalEquity }) => ratio(ProfitAfterTax, TotalEquity, 100),
  },
  {
    id: 'roce', name: 'Return on capital employed', unit: PERCENT,
    inputs: ['ProfitBeforeTax', 'FinanceCosts', 'TotalEquity', 'Borrowings'],
    formula: '(PBT + finance costs) / (total equity + borrowings)',
    compute: ({ ProfitBeforeTax, FinanceCosts, TotalEquity, Borrowings }) =>
      ratio(ProfitBeforeTax + FinanceCosts, TotalEquity + Borrowings, 100),
  },
  {
    id: 'net_debt', name: 'Net debt', unit: CURRENCY,
    inputs: ['Borrowings', 'CashAndCashEquivalents'], formula: 'Borrowings − cash',
    compute: ({ Borrowings, CashAndCashEquivalents }) => Borrowings - CashAndCashEquivalents,
  },
  {
    id: 'debt_to_equity', name: 'Debt / equity', unit: RATIO,
    inputs: ['Borrowings', 'TotalEquity'], formula: 'Borrowings / total equity',
    compute: ({ Borrowings, TotalEquity }) => ratio(Borrowings, TotalEquity, 1),
  },
  {
    id: 'receivable_days', name: 'Receivable days', unit: DAYS,
    inputs: ['TradeReceivables', 'Revenue'], formula: 'Trade receivables / revenue × 365',
    compute: ({ TradeReceivables, Revenue }) => ratio(TradeReceivables, Revenue, 365),
  },
  {
    id: 'inventory_days', name: 'Inventory days', unit: DAYS,
    inputs: ['Inventories', 'Revenue'], formula: 'Inventories / revenue × 365',
    compute: ({ Inventories, Revenue }) => ratio(Inventories, Revenue, 365),
  },
  {
    id: 'ocf_to_pat', name: 'Cash conversion', unit: RATIO,
    inputs: ['NetCashFromOperatingActivities', 'ProfitAfterTax'],
    formula: 'Operating cash flow / PAT',
    compute: ({ NetCashFromOperatingActivities, ProfitAfterTax }) =>
      ProfitAfterTax <= 0 ? null : ratio(NetCashFromOperatingActivities, ProfitAfterTax, 1),
  },
];

/** Every concept the library reads — used to request exactly these and no more. */
export const REQUIRED_CONCEPTS = [...new Set(METRICS.flatMap(m => [...m.inputs, ...(m.prior ?? [])]))];

const BY_ID = new Map(METRICS.map(metric => [metric.id, metric]));
export const METRIC_IDS = METRICS.map(metric => metric.id);
export const getMetric = (id) => BY_ID.get(id) ?? null;

/**
 * Index facts by period label and concept, keeping the latest-known value.
 *
 * Flows carry a period; instants carry only a date, which is mapped to the
 * fiscal year it closes so the two can be read side by side.
 */
export function indexFacts(rows = []) {
  const byPeriod = new Map();
  for (const row of rows) {
    const concept = row.concept_id;
    if (!concept) continue;
    // `scale` is a multiplier the filing reported in: ignoring it turns lakhs
    // into units and a balance sheet into nonsense.
    const raw = Number(row.value ?? row.absolute);
    const scale = Number(row.scale);
    const value = Number.isFinite(raw) ? raw * (Number.isFinite(scale) && scale !== 0 ? scale : 1) : NaN;
    if (!Number.isFinite(value)) continue;

    const period = periodLabel(row.period ?? row.fiscal_year ?? row.period_end);
    if (!period) continue;

    const span = spanDays(row.period_start, row.period_end);
    // A fourth quarter and a full year both end on 31 March and are told apart
    // only by where they start. Reading Q4 profit as the year's turned every
    // return ratio into a quarter of its true value. Rejected before the period
    // is created, so a quarter-only year does not become an empty bucket.
    if (span !== null && span < FULL_YEAR_DAYS) continue;

    const basis = String(row.basis ?? 'consolidated').toLowerCase();
    const key = `${period}:${basis}`;
    if (!byPeriod.has(key)) byPeriod.set(key, { period, basis, facts: new Map() });
    const bucket = byPeriod.get(key).facts;
    const existing = bucket.get(concept);
    const knownAt = row.known_at ?? row.retrieved_at ?? null;
    const candidate = {
      value, known_at: knownAt, evidence_id: row.evidence_id ?? null,
      unit: row.unit ?? null, period_end: row.period_end ?? null, span,
      // An instant has no span. A balance sheet dated 30 September is a
      // half-year position, so a year-end reading outranks an interim one.
      instant: span === null,
      yearEnd: isFiscalYearEnd(row.period_end),
    };
    if (!existing || prefer(candidate, existing)) bucket.set(concept, candidate);
  }
  return byPeriod;
}

// A financial year is 365 days; filings round the edges, so allow a fortnight.
const FULL_YEAR_DAYS = 350;

/** Year-end over interim; then later knowledge, so a restatement supersedes. */
function prefer(candidate, existing) {
  if (candidate.instant && existing.instant && candidate.yearEnd !== existing.yearEnd) {
    return candidate.yearEnd;
  }
  return String(candidate.known_at ?? '') >= String(existing.known_at ?? '');
}

/** Days a flow covers, or null when the row is an instant. */
function spanDays(start, end) {
  if (!start || !end) return null;
  const from = new Date(String(start));
  const to = new Date(String(end));
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return null;
  return Math.round((to - from) / 86400000);
}

function isFiscalYearEnd(dateLike) {
  if (!dateLike) return false;
  const date = new Date(String(dateLike));
  return !Number.isNaN(date.getTime()) && date.getUTCMonth() === 2 && date.getUTCDate() === 31;
}

/**
 * Compute every metric that can be computed, and say why the rest cannot.
 *
 * @param {{financials?: object, balance?: object}} packet raw API envelopes
 * @param {{company_id?: string, security_id?: string, basis?: string, asOf?: string}} context
 * @returns {Array<object>} one record per metric per period, per §15.2
 */
export function computeMetrics(packet = {}, context = {}) {
  // Prefer the validated facts: they carry evidence ids, so a derived number
  // can name the filings it was built from. The raw envelopes are the fallback
  // for callers that never ran the validation gate.
  const validated = records(packet.financial_facts);
  const rows = validated.length
    ? validated
    : [...records(packet.financials), ...records(packet.balance)];
  const index = indexFacts(rows);
  const wantBasis = String(context.basis ?? 'consolidated').toLowerCase();

  const periods = [...index.values()]
    .filter(bucket => bucket.basis === wantBasis)
    .sort((a, b) => b.period.localeCompare(a.period));

  const results = [];
  for (const bucket of periods) {
    const priorLabel = `FY${Number(bucket.period.slice(2)) - 1}`;
    const prior = index.get(`${priorLabel}:${wantBasis}`)?.facts ?? new Map();
    for (const metric of METRICS) {
      results.push(evaluate(metric, bucket, prior, context));
    }
  }
  return results;
}

function evaluate(metric, bucket, priorFacts, context) {
  const base = {
    metric_id: metric.id,
    metric_name: metric.name,
    unit: metric.unit,
    period: bucket.period,
    basis: bucket.basis,
    company_id: context.company_id ?? null,
    security_id: context.security_id ?? null,
    calculation_version: CALCULATION_VERSION,
    formula: metric.formula,
    as_of: context.asOf ?? null,
    classification: 'derived metric',
  };

  const values = {};
  const evidence = [];
  const missing = [];
  let knownAt = null;

  for (const concept of metric.inputs) {
    const fact = bucket.facts.get(concept);
    if (!fact) { missing.push(concept); continue; }
    values[concept] = fact.value;
    if (fact.evidence_id) evidence.push(fact.evidence_id);
    if (!knownAt || String(fact.known_at ?? '') > knownAt) knownAt = fact.known_at ?? knownAt;
  }
  const priorValues = {};
  for (const concept of metric.prior ?? []) {
    const fact = priorFacts.get(concept);
    if (!fact) { missing.push(`${concept} (prior year)`); continue; }
    priorValues[concept] = fact.value;
    if (fact.evidence_id) evidence.push(fact.evidence_id);
  }

  if (missing.length) {
    return { ...base, value: null, status: 'gap', missing_inputs: missing, input_evidence_ids: evidence, known_at: knownAt };
  }

  const value = metric.compute(values, priorValues);
  if (value === null || !Number.isFinite(value)) {
    return {
      ...base, value: null, status: 'undefined', input_evidence_ids: evidence, known_at: knownAt,
      reason: 'the formula has no meaning for these inputs — a zero or negative base',
    };
  }
  return { ...base, value: round(value, metric.unit), status: 'ok', input_evidence_ids: evidence, known_at: knownAt };
}

/**
 * Divide, refusing a denominator too near zero to mean anything.
 *
 * A screen sorts on these, so a ratio built on a rounding-error denominator
 * would put exactly the least meaningful rows at the top.
 */
function ratio(numerator, denominator, scale) {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator)) return null;
  if (denominator === 0) return null;
  if (Math.abs(denominator) < Math.abs(numerator) * 1e-6) return null;
  return (numerator / denominator) * scale;
}

function round(value, unit) {
  if (unit === PERCENT) return Math.round(value * 100) / 100;
  if (unit === RATIO) return Math.round(value * 1000) / 1000;
  if (unit === DAYS) return Math.round(value * 10) / 10;
  return Math.round(value);
}

function records(value) {
  const data = value?.data ?? value;
  return Array.isArray(data) ? data : [];
}
