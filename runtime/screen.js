/**
 * screen.js -- turn a screening question into filters Marked can execute.
 *
 * A screen is the one question shape that names no company. Everything else in
 * the runtime resolves an entity first and retrieves second; asked "which
 * companies have net margin above 10%", that order has nothing to resolve, so
 * the extractor reached for the only nouns present and looked up "Screen NSE",
 * "FII" and "DII" as companies. Detecting the shape before extraction runs is
 * what stops that.
 *
 * Metric names are left as aliases the data service already understands
 * (`revenue_growth`, `promoter_holding`). Restating its vocabulary here would
 * be a second copy to keep in step, and the service reports what it resolved.
 */

// "which companies", "screen for", "find stocks", "top 10 companies by".
const SCREEN = new RegExp([
  '\\bscreen(?:er|ing)?\\b',
  '\\bwhich\\s+(?:companies|stocks|names|firms)\\b',
  '\\b(?:find|list|show)\\s+(?:me\\s+)?(?:all\\s+)?(?:companies|stocks|names|firms)\\b',
  '\\bcompanies\\s+(?:with|where|that\\s+have|having)\\b',
  '\\bstocks\\s+(?:with|where|that\\s+have|having)\\b',
  '\\btop\\s+\\d+\\s+(?:companies|stocks|names|firms)\\b',
].join('|'), 'i');

// Longest first: "net profit margin" must win over "profit margin", and
// "operating profit growth" over "profit growth".
const METRICS = [
  ['net profit margin', 'net_margin'],
  ['net margin', 'net_margin'],
  ['profit margin', 'net_margin'],
  ['operating margin', 'ebit_margin'],
  ['ebit margin', 'ebit_margin'],
  ['ebitda margin', 'ebitda_margin'],
  ['revenue growth', 'revenue_growth'],
  ['sales growth', 'revenue_growth'],
  ['topline growth', 'revenue_growth'],
  ['profit growth', 'profit_growth'],
  ['earnings growth', 'profit_growth'],
  ['pat growth', 'pat_growth'],
  ['promoter holding', 'promoter_holding'],
  ['promoter stake', 'promoter_stake'],
  ['promoter pledge', 'pledged'],
  ['pledged shares', 'pledged'],
  ['pledge', 'pledge'],
  ['fii holding', 'fii_holding'],
  ['fii stake', 'fii_holding'],
  ['dii holding', 'dii_holding'],
  ['dii stake', 'dii_holding'],
  ['mutual fund holding', 'mutual_fund_holding'],
  ['public holding', 'public_holding'],
  ['debt to equity', 'debt_to_equity'],
  ['debt-to-equity', 'debt_to_equity'],
  ['return on equity', 'roe'],
  ['return on assets', 'roa'],
  ['asset turnover', 'asset_turnover'],
  ['cash conversion', 'cash_conversion'],
  ['roe', 'roe'],
  ['roa', 'roa'],
  ['revenue', 'Revenue'],
  ['fii', 'fii_holding'],
  ['dii', 'dii_holding'],
];

const OPERATORS = [
  [/\b(?:at least|no less than|not less than|minimum(?: of)?)\b/i, '>='],
  [/\b(?:at most|no more than|not more than|maximum(?: of)?)\b/i, '<='],
  [/\b(?:above|over|greater than|more than|exceed(?:s|ing)?|higher than|>)\b/i, '>'],
  [/\b(?:below|under|less than|lower than|beneath|<)\b/i, '<'],
  [/\b(?:equal(?:s| to)?|exactly|=)\b/i, '='],
];

// A ratio or a percentage written as a bare number means percent: nobody asks
// for a margin above 0.1. The service compares against fractions, so "10"
// would silently match every company instead of none.
const FRACTIONAL = /_margin$|_growth$|_pct$|^pledge|^promoter|^fii|^dii|^mutual_fund|^public_|^roe$|^roa$/;

/** The metric a clause is about, longest name first so prefixes cannot win. */
function metricIn(clause) {
  for (const [phrase, metric] of METRICS) {
    if (new RegExp(`\\b${phrase.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')}\\b`, 'i').test(clause)) {
      return metric;
    }
  }
  return null;
}

function operatorIn(clause) {
  for (const [pattern, operator] of OPERATORS) if (pattern.test(clause)) return operator;
  return null;
}

/**
 * Normalise a written threshold to what the service compares against.
 * Returns null when the number is missing, so a clause without one is dropped
 * rather than screened on a guess.
 */
function thresholdIn(clause, metric) {
  const match = clause.match(/(-?\d+(?:\.\d+)?)\s*(%|percent|per cent)?/i);
  if (!match) return null;
  const value = Number(match[1]);
  if (!Number.isFinite(value)) return null;
  if (!FRACTIONAL.test(metric)) return value;
  // Explicit percent, or a bare number too large to be a fraction.
  return match[2] || Math.abs(value) > 1 ? value / 100 : value;
}

/** Fiscal year stated in the question, as a four-digit year. */
function fiscalYearIn(text) {
  const match = text.match(/\bFY\s?'?(\d{4}|\d{2})\b|\b(?:financial|fiscal)\s+year\s+(\d{4})\b/i);
  if (!match) return null;
  const raw = match[1] ?? match[2];
  const year = Number(raw);
  if (!Number.isFinite(year)) return null;
  return raw.length === 2 ? 2000 + year : year;
}

/**
 * Parse a screening question, or return null when it is not one.
 *
 * Null is the important case: it leaves every other question on the path it
 * already took, so this can only add a route and never divert one.
 */
export function parseScreen(text, { limit = 25 } = {}) {
  const question = String(text ?? '');
  if (!SCREEN.test(question)) return null;

  // Split on connectives so each clause carries one metric and one threshold.
  const clauses = question.split(/\band\b|\bwith\b|,|;|\bwhere\b|\bthat have\b/i);
  const filters = [];
  const dropped = [];
  for (const clause of clauses) {
    const metric = metricIn(clause);
    if (!metric) continue;
    const operator = operatorIn(clause);
    const value = operator === null ? null : thresholdIn(clause, metric);
    if (operator === null || value === null) { dropped.push(metric); continue; }
    if (!filters.some(filter => filter.metric === metric)) {
      filters.push({ metric, operator, value });
    }
  }
  if (!filters.length) return { filters: [], dropped, question };

  const topN = question.match(/\btop\s+(\d+)\b/i);
  return {
    filters,
    dropped,
    question,
    // Sorting on the first filter puts the strongest names at the top, which is
    // what "top 5" asks for and costs nothing when it was not asked.
    sort: filters[0].metric,
    descending: !/\bsmallest|lowest|least|bottom\b/i.test(question),
    fiscal_year: fiscalYearIn(question),
    period: /\bq[1-4]\b|\bquarterly\b|\bquarter\b/i.test(question) ? 'quarterly' : 'annual',
    basis: /\bstandalone\b/i.test(question) ? 'standalone' : 'consolidated',
    limit: Math.min(topN ? Number(topN[1]) : limit, 50),
  };
}

/**
 * Ratios the data cannot mean. A near-zero revenue denominator produces a
 * margin of 198 (19,800%), and a screen sorts exactly those to the top, so
 * the implausible rows are the first thing a user would see.
 */
export function plausible(company) {
  const metrics = company?.metrics ?? {};
  return Object.entries(metrics).every(([metric, value]) => {
    if (value === null || value === undefined) return true;
    if (!Number.isFinite(Number(value))) return false;
    const magnitude = Math.abs(Number(value));
    if (/_margin$/.test(metric)) return magnitude <= 2;          // 200%
    if (/_pct$|^pledged|^promoter|^fii|^dii|^mutual_fund|^public/.test(metric)) {
      return magnitude <= 100.0001;
    }
    if (/_growth$/.test(metric)) return magnitude <= 100;        // 10,000%
    return true;
  });
}
