import { DERIVED_METRICS, INSTANT_CONCEPTS, REPORTED_CONCEPTS } from './concepts.js';

// What Marked actually holds, asked of Marked rather than asserted here. A plan
// reviewer that only knows the income statement will never reach for ownership,
// a credit rating or an earnings call, because it does not know they exist.
//
// The live half (row counts, freshness, which datasets are switched on, which
// event types are actually present) comes from the API. The stable half is the
// documented request vocabulary, which is part of the contract rather than the
// data. A catalogue is fetched once per process: it changes on the scale of
// releases, not queries, and a research run should not spend requests on it.

// From the documented stable indexes in Marked's agent contract.
export const FILING_TYPES = [
  'annual_report', 'financial_results', 'shareholding_pattern', 'investor_presentation',
  'earnings_call_transcript', 'credit_rating', 'insider_trading',
  'dividend', 'buyback', 'bonus_issue', 'stock_split', 'rights_issue',
];
export const CORPORATE_ACTIONS = ['dividend', 'buyback', 'bonus_issue', 'stock_split', 'rights_issue'];
export const OWNERSHIP_FIELDS = ['promoter_pct', 'fii_pct', 'dii_pct', 'mutual_fund_pct', 'public_pct', 'pledged_pct'];
export const PRICE_INTERVALS = ['1m', '5m', '15m', '30m', '1h', '1d'];
export const SEARCH_KINDS = ['company', 'security', 'concept', 'document', 'announcement', 'event'];

let cached = null;

/** Everything the reviewer should know about what can be retrieved. */
export async function datasetCatalogue(data) {
  if (cached) return cached;
  const catalogue = {
    concepts: {
      reported: REPORTED_CONCEPTS,
      derived_ratios: DERIVED_METRICS,
      // These carry a period_end and no period_start, so they are fetched with
      // period=any; asking for them annually returns nothing.
      balance_sheet_point_in_time: INSTANT_CONCEPTS,
      // Any reported concept also has a growth field, e.g. Revenue_growth.
      growth_fields: 'append _growth to any reported concept',
    },
    ownership_fields: OWNERSHIP_FIELDS,
    filing_types: FILING_TYPES,
    corporate_action_types: CORPORATE_ACTIONS,
    price_intervals: PRICE_INTERVALS,
    search_kinds: SEARCH_KINDS,
    retrievable_by_the_runtime: [
      'financial facts by concept, period and basis',
      'derived ratios by period',
      'filings and their documents',
      'company events and announcements',
      'corporate actions',
      'shareholding snapshots including promoter, FII, DII and pledge',
      'daily price candles and the latest quote',
    ],
    limitations: [
      'insider activity returns disclosure documents, not parsed trade records',
      'there is no free-cash-flow concept; operating cash flow and capex are reported separately',
      'a missing metric is an unavailable input, never zero',
      'segment-level and geography-level breakdowns are not published as facts',
      'price-series coverage must be checked against the requested return horizon',
      'consensus estimate and earnings-revision history is not published',
    ],
  };

  try {
    const index = await data?.request?.('/v1/', {});
    const body = index?.data;
    if (body) {
      catalogue.endpoints = body.endpoints;
      // Row counts and freshness let the reviewer avoid planning against a
      // dataset that is switched off or has not been written to in months.
      catalogue.datasets = Object.fromEntries(Object.entries(body.datasets ?? {})
        .map(([name, meta]) => [name, { rows: meta.rows, available: meta.available, last_write: meta.last_write }]));
    }
  } catch { /* the contract half is still worth having */ }

  try {
    const types = await data?.events?.({ types: true });
    const rows = Array.isArray(types?.data) ? types.data : [];
    if (rows.length) {
      catalogue.event_types = rows
        .filter(row => row.event_type)
        .slice(0, 40)
        .map(row => `${row.event_type} (${row.events})`);
    }
  } catch { /* event filtering stays loose without it */ }

  cached = catalogue;
  return catalogue;
}

/** Test seam: the catalogue is cached for the life of the process. */
export function resetCatalogue() { cached = null; }
