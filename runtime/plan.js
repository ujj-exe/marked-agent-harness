import { conceptMatches, extractConcepts, isDerived, isInstant, REPORTED_CONCEPTS } from '../data/concepts.js';
import { selectEquity } from '../data/marked-client.js';
import { validateFinancialFacts } from '../data/evidence.js';
import { parseScreen } from './screen.js';

// The data plan is the runtime's own answer to "what has to be true before a
// reasoning worker is allowed to see this question". It is built locally from
// the question, executed against Marked's deterministic GET routes, and checked
// against the values that actually came back. `needs_plan` from POST /v1/query
// is an instruction to supply one of these, never a research result.

export const ROUTES = [
  'financial_metric_lookup', 'financial_analysis', 'comparison',
  'filing_research', 'event_research', 'factual_lookup',
];

const FACT_ROUTES = new Set(['financial_metric_lookup', 'financial_analysis', 'comparison']);

// "What is X trading at" is one call to the quote endpoint. It has no financial
// concept, so concept-driven planning found nothing, routed it to search and
// ended in a DATA GAP — for a number the runtime could have had immediately.
const PRICE = /\b(?:share price|stock price|share prices|price|quote|trading at|last traded|ltp|market cap|market capitalisation|market capitalization|52[- ]week)\b/i;

// An analysis question is anything that asks about a movement or a judgement
// rather than a number. Routing one of these as a metric lookup hands the
// reasoning worker a bare series and no way to explain it -- which is exactly
// what "only consolidated PAT figures, with no revenue, margin, cost, segment
// or narrative evidence" looked like from the other side.
const ANALYSIS = new RegExp([
  'why', 'because', 'reason', 'explain', 'behind', 'unusual', 'concern', 'problem',
  'driv(?:e|es|en|ing|er|ers)', 'drove', 'caus(?:e|es|ed|ing)',
  'grow(?:th|ing)?', 'grew', 'slow(?:down|ing|ed)?', 'acceler(?:ate|ating|ation)',
  'deceler(?:ate|ating|ation)', 'increas(?:e|ed|ing)', 'decreas(?:e|ed|ing)',
  'declin(?:e|ed|ing)', 'improv(?:e|ed|ing|ement)', 'deterior(?:ate|ating|ation)',
  'expand(?:ed|ing)?', 'expansion', 'contract(?:ed|ing)?', 'contraction', 'compression',
  'fell', 'fall(?:ing)?', 'rose', 'ris(?:e|ing)', 'jump(?:ed)?', 'drop(?:ped)?',
  'chang(?:e|ed|ing)', 'shift(?:ed|ing)?', 'trend(?:ing)?', 'momentum',
  'pressure', 'weak(?:ness|ening)?', 'strength', 'strong', 'headwind', 'tailwind',
  'sustainab(?:le|ility)', 'health(?:y)?', 'quality', 'risk(?:s|y)?',
  'perform(?:s|ed|ing|ance)', 'outperform(?:ed|ing)?', 'underperform(?:ed|ing)?',
  'outlook', 'assess', 'evaluate', 'deep dive', 'how is', 'how has', 'what is happening',
].map(word => `\\b${word}\\b`).join('|'), 'i');

// When an analysis question names no measure, the packet still has to be able to
// answer it. This is the minimum an analyst would pull before forming a view.
const CORE_ANALYSIS_CONCEPTS = [
  'Revenue', 'ProfitAfterTax', 'ProfitBeforeTax', 'TotalExpenses',
  'EmployeeBenefitExpense', 'FinanceCosts', 'DepreciationAndAmortisation', 'OtherIncome',
];

// Absolutes alone do not show operating leverage. Margins do.
const ANALYSIS_RATIOS = ['net_margin', 'ebitda_margin', 'ebit_margin'];
const COMPARISON = /\b(?:vs\.?|versus|compare[d]?|comparison|against|relative to|better than)\b/i;
const FILING = /\b(?:filing|filings|annual report|disclosure|disclosures|investor presentation|transcript|latest report)\b/i;
const EVENT = /\b(?:dividend|buyback|bonus issue|stock split|rights issue|corporate action|what happened|announcement)\b/i;

// Asking whether profit turns into cash is one question, not two. Naming only
// one side of it still requires both, or the comparison cannot be made and the
// missing half reads as a coverage gap that was never requested.
const EARNINGS_QUALITY = /\b(?:earnings[\s-]quality|quality of earnings|convert(?:s|ed|ing)?[\s-](?:in)?to cash|backed by cash|cash[\s-]conversion|cash generation|accrual)\b/i;
const EARNINGS_VS_CASH = [
  /\b(?:profit|profits|pat|earnings|net income)\b[^.?!]{0,40}\b(?:cash flow|cash flows|operating cash|cfo|cash generation)\b/i,
  /\b(?:cash flow|cash flows|operating cash|cfo|cash generation)\b[^.?!]{0,40}\b(?:profit|profits|pat|earnings|net income|reported earnings)\b/i,
];
const EARNINGS_QUALITY_CONCEPTS = ['ProfitAfterTax', 'NetCashFromOperatingActivities'];

// Phrases that stand for several reported lines rather than one. Marked has no
// single working-capital concept, so asking for it means asking for its parts.
const CONCEPT_GROUPS = [
  [/\bworking capital\b/i, ['Inventories', 'TradeReceivables', 'TradePayables', 'ChangesInInventories']],
  [/\bcapital expenditure\b|\bcapex\b/i, ['PropertyPlantAndEquipment', 'NetCashFromInvestingActivities']],
  [/\bcash conversion cycle\b/i, ['Inventories', 'TradeReceivables', 'TradePayables']],
];

/** Whether the question is really "does the profit turn into cash". */
export function isEarningsQuality(question) {
  const text = String(question ?? '');
  return EARNINGS_QUALITY.test(text) || EARNINGS_VS_CASH.some(pattern => pattern.test(text));
}

// Why a profit number moved is answered by the lines above it. Every id here is
// canonical Marked; none are invented.
const DRIVERS = {
  ProfitAfterTax: ['Revenue', 'TotalIncome', 'TotalExpenses', 'OtherIncome', 'FinanceCosts', 'DepreciationAndAmortisation', 'ExceptionalItems', 'ProfitBeforeTax', 'TaxExpense'],
  // A gap between profit and operating cash is a working-capital story.
  NetCashFromOperatingActivities: ['ProfitAfterTax', 'DepreciationAndAmortisation', 'TradeReceivables', 'Inventories', 'TradePayables', 'ChangesInInventories'],
  ProfitBeforeTax: ['Revenue', 'TotalIncome', 'TotalExpenses', 'OtherIncome', 'FinanceCosts', 'ExceptionalItems'],
  Revenue: ['TotalIncome', 'CostOfMaterials', 'ChangesInInventories', 'PurchasesOfStockInTrade'],
  BasicEarningsPerShare: ['ProfitAfterTax', 'EquityShareCapital'],
};

const STOP_WORDS = new Set([
  'why', 'what', 'whats', 'how', 'when', 'which', 'who', 'where', 'did', 'do', 'does', 'is', 'was',
  'were', 'are', 'has', 'have', 'had', 'the', 'a', 'an', 'compare', 'comparison', 'contrast',
  'analyze', 'analyse', 'research', 'review', 'tell', 'me', 'about', 'show', 'give', 'grow', 'grew',
  'growth', 'change', 'changed', 'in', 'for', 'from', 'to', 'of', 'and', 'vs', 'versus', 'last',
  'latest', 'previous', 'current', 'financial', 'fiscal', 'year', 'quarter', 'india', 'indian',
  'between', 'during', 'over', 'explain', 'report', 'reported', 'versus', 'than', 'their', 'its',
  // Imperatives that open a sentence. "Identify the strongest evidence…" made
  // Identify a company, which then made the whole request a comparison between
  // three things that do not exist.
  'identify', 'reconcile', 'summarise', 'summarize', 'outline', 'describe', 'list',
  'find', 'provide', 'include', 'highlight', 'note', 'consider', 'rank', 'rate',
  'state', 'discuss', 'assess', 'evaluate', 'quantify', 'estimate', 'break', 'walk',
  'then', 'finally', 'also', 'lastly', 'next', 'first', 'second', 'third',
  'is', 'are', 'does', 'do', 'can', 'could', 'should', 'would', 'will',
  // Price vocabulary: part of the question, never part of the company name.
  'share', 'shares', 'price', 'prices', 'stock', 'quote', 'trading', 'trade',
  'traded', 'market', 'cap', 'capitalisation', 'capitalization', 'value', 'worth',
  'much', 'many', 'now', 'today', 'currently', 'current', 'at', 'on', 'me', 'my',
]);

/**
 * Parse the semantic request into a retrieval plan: who, which measures, which
 * periods, on what basis.
 */
export function buildDataPlan(question, { temporal = null, asOf = null, declared = null } = {}) {
  const text = String(question ?? '');
  const named = extractConcepts(text);
  // Both sides of the comparison are required, whichever one the phrasing names.
  const grouped = CONCEPT_GROUPS.flatMap(([pattern, ids]) => (pattern.test(text) ? ids : []));
  const wantsQuote = PRICE.test(text);
  const concepts = [...new Set([
    ...(isEarningsQuality(text) ? EARNINGS_QUALITY_CONCEPTS : []),
    ...named,
    ...grouped,
  ])];
  const fiscalYears = extractFiscalYears(text, temporal);
  // A slash command states its subject outright. Extraction is for prose.
  // A screen names no company, so entity extraction has nothing to find and
  // will reach for whatever nouns are present -- which is how "FII" and "DII"
  // became company lookups. Decide the shape first, then skip extraction.
  const screen = parseScreen(text);
  const references = screen
    ? []
    : (declared?.references?.length ? declared.references : extractEntities(text));
  const route = screen ? 'screen' : classifyRoute(text, { concepts, references });
  // What decides macro is the reference, not the prose around it. "RBI" and
  // "NIFTY" are references that are not companies; "asian paints" is a company
  // even when the sentence says "India-market risks", and testing the sentence
  // sent that one to search with a perfectly good plan in hand.
  const entity = references[0];
  const MACRO_INTENTS = new Set(['macro', 'sector', 'derivatives']);
  const subject = screen ? 'universe'
    : declared?.kind && MACRO_INTENTS.has(declared.kind) && !declared.references?.length
    ? 'macro'
    : entity
      ? (MACRO.test(entity) && !concepts.length ? 'macro' : 'company')
      : (MACRO.test(text) ? 'macro' : null);
  const primary = concepts[0] ?? null;
  // Drivers for every measure asked about, not only the first. A question that
  // weighs profit against cash flow needs both the income-statement lines and
  // the working-capital lines to be answerable.
  const withDrivers = route === 'financial_analysis'
    ? [...new Set([
        ...(concepts.length ? concepts : CORE_ANALYSIS_CONCEPTS),
        ...concepts.flatMap(concept => DRIVERS[concept] ?? []),
        ...(concepts.length ? [] : CORE_ANALYSIS_CONCEPTS),
        ...ANALYSIS_RATIOS,
      ])]
    : concepts;

  return {
    route,
    screen,
    subject: screen ? 'universe' : subject,
    question: text,
    intent: route === 'financial_analysis' ? 'financial_analysis' : route,
    references,
    metric: primary,
    concepts: withDrivers.filter(id => REPORTED_CONCEPTS.includes(id) || isDerived(id)),
    required_concepts: concepts,
    fiscal_years: fiscalYears,
    period: /\bq[1-4]\b|\bquarter/i.test(text) ? 'quarterly' : 'annual',
    basis: /\bstandalone\b/i.test(text) ? 'standalone' : 'consolidated',
    as_of: asOf,
    datasets: route === 'price_lookup' ? ['quote'] : wantsQuote && references.length ? ['quote'] : [],
    requires_facts: FACT_ROUTES.has(route) && references.length > 0
      && (concepts.length > 0 || route === 'financial_analysis'),
  };
}

/** The same plan shaped as Marked's RetrievalPlan, for POST /v1/query. */
export function markedPlan(plan) {
  // The API's RetrievalPlan accepts reported concepts only. Derived ratios are
  // fetched from /v1/financial-metrics and must not leak into this retry.
  const concepts = plan.concepts.filter(id => !isDerived(id));
  if (!plan.references.length || !concepts.length) return null;
  return {
    route: plan.references.length > 1 ? 'hybrid' : 'exact',
    reference: plan.references[0],
    concepts: concepts.slice(0, 20),
    fiscal_year: plan.fiscal_years.length === 1 ? plan.fiscal_years[0] : null,
    period: plan.period,
    basis: plan.basis,
    ...(plan.as_of ? { as_of: plan.as_of } : {}),
  };
}

/**
 * Run the plan against Marked's deterministic routes and validate every value
 * before it is allowed to count. Returns validated facts plus the gaps, so the
 * caller can fail loudly instead of handing a reasoning worker an empty packet.
 */
export async function executeDataPlan(data, plan, { limit = 300 } = {}) {
  const reported = plan.concepts.filter(id => !isDerived(id));
  const derived = plan.concepts.filter(isDerived);
  const companies = [];
  const requests = [];

  for (const reference of plan.references.slice(0, 5)) {
    const entity = await resolveAny(data, candidatesFor(plan, reference));
    if (entity.error) { companies.push({ reference, error: entity.error, facts: [] }); continue; }

    const security = selectEquity(entity.securities);
    const ticker = security?.symbol || reference;
    const context = { companyId: entity.company.company_id, companyName: entity.company.common_name, ticker };
    const facts = [];
    const rejected = [];

    // Flows and stocks are asked for separately: the same period filter cannot
    // serve both, and using the flow filter on a balance sheet returns nothing.
    for (const [group, period] of [
      [reported.filter(id => !isInstant(id)), plan.period],
      [reported.filter(isInstant), 'any'],
    ]) {
      if (!group.length) continue;
      let basis = plan.basis;
      let rows = await fetchFinancials(data, { ticker, basis, plan, reported: group, period, limit, requests });
      // A company that only files standalone must not read as a coverage gap.
      if (!rows.length && basis === 'consolidated') {
        basis = 'standalone';
        rows = await fetchFinancials(data, { ticker, basis, plan, reported: group, period, limit, requests });
      }
      const checked = validateFinancialFacts(rows, context);
      facts.push(...scopeYears(checked.facts, plan.fiscal_years));
      rejected.push(...checked.rejected);
    }

    if (derived.length) {
      requests.push({ route: '/v1/financial-metrics', ticker, period: plan.period, basis: plan.basis });
      const response = await data.metrics({ ticker, period: plan.period, basis: plan.basis, as_of: plan.as_of ?? undefined });
      const rows = flattenMetricRows(rowsOf(response), derived);
      const checked = validateFinancialFacts(rows, { ...context, dataType: 'metric' });
      facts.push(...scopeYears(checked.facts, plan.fiscal_years));
      rejected.push(...checked.rejected);
    }

    companies.push({ reference, entity, security, facts, rejected });
  }

  // Datasets the reviewer asked for. Fetched per company so ownership, filings
  // and actions land in the packet alongside the numbers they explain.
  for (const company of companies) {
    if (!company.security?.symbol || !plan.datasets?.length) continue;
    company.datasets = {};
    for (const name of plan.datasets) {
      const fetcher = DATASET_FETCHERS[name];
      if (!fetcher) continue;
      try {
        const response = await fetcher(data, company.security.symbol);
        const rows = name === 'quote' && response?.data && !Array.isArray(response.data)
          ? [response.data]
          : rowsOf(response);
        requests.push({ route: `dataset:${name}`, ticker: company.security.symbol, rows: rows.length });
        company.datasets[name] = rows;
      } catch { /* an unavailable dataset is disclosed, not fatal */ }
    }
  }

  const facts = companies.flatMap(company => company.facts);
  return { companies, facts, requests, gaps: factGaps(plan, companies) };
}

/** Every (company, concept, fiscal year) the plan asked for and did not get. */
export function factGaps(plan, companies) {
  const gaps = [];
  for (const company of companies) {
    if (company.error) { gaps.push({ reference: company.reference, reason: company.error }); continue; }
    const have = new Set(company.facts.map(fact => `${fact.concept_id}:${fact.fiscal_year}`));
    for (const concept of plan.required_concepts) {
      const years = plan.fiscal_years.length ? plan.fiscal_years : [null];
      for (const year of years) {
        if (year === null) {
          if (!company.facts.some(fact => fact.concept_id === concept)) gaps.push({ reference: company.reference, concept, fiscal_year: null });
        } else if (!have.has(`${concept}:${year}`)) {
          gaps.push({ reference: company.reference, concept, fiscal_year: year });
        }
      }
    }
  }
  return gaps;
}

/** Growth computed from validated facts, carrying its own arithmetic. */
export function derivedGrowth(facts, concept) {
  const series = facts
    .filter(fact => fact.concept_id === concept && Number.isFinite(fact.fiscal_year))
    .sort((a, b) => a.fiscal_year - b.fiscal_year);
  if (series.length < 2) return null;
  const from = series[0];
  const to = series[series.length - 1];
  if (!from.value) return null;
  return {
    concept_id: concept,
    numerator: to.value - from.value,
    denominator: from.value,
    growth_pct: ((to.value - from.value) / Math.abs(from.value)) * 100,
    from_period: from.period,
    to_period: to.period,
    basis: from.basis === to.basis ? from.basis : `${from.basis}→${to.basis}`,
    unit: from.unit,
    currency: from.currency,
    evidence_ids: [from.evidence_id, to.evidence_id].filter(Boolean),
  };
}

/** `/v1/financial-metrics` nests ratios in a `metrics` object; one row each. */
export function flattenMetricRows(rows, wanted = null) {
  return (Array.isArray(rows) ? rows : []).flatMap(row => Object.entries(row.metrics || {})
    .filter(([key]) => !wanted || wanted.includes(key))
    .map(([key, value]) => ({ ...row, concept_id: key, value, unit: row.unit ?? 'ratio' })));
}

const DATASET_FETCHERS = {
  quote: (data, ticker) => data.prices?.({ ticker, latest: true }),
  shareholding: (data, ticker) => data.shareholding?.({ ticker, holders: true, limit: 8 }),
  filings: (data, ticker) => data.filings?.({ ticker, limit: 15 }),
  events: (data, ticker) => data.events?.({ ticker, limit: 15 }),
  corporate_actions: (data, ticker) => data.corporateActions?.({ ticker, limit: 15 }),
  prices: (data, ticker) => data.prices?.({ ticker, latest: false, limit: 60 }),
};

/** Names to try for one reference, best first. */
function candidatesFor(plan, reference) {
  const extra = (plan.reference_candidates ?? []).filter(name => name !== reference);
  return [reference, ...extra];
}

/**
 * Resolve the first name that Marked recognises. An ambiguous name is a question
 * for the user and stops the search; a name that matches nothing just moves on
 * to the next candidate.
 */
async function resolveAny(data, names) {
  let last = `Company not found: ${names[0]}`;
  for (const name of names) {
    try { return await data.resolveCompany(name); }
    catch (error) {
      if (error?.code === 'AMBIGUOUS_COMPANY') throw error;
      last = error.message;
    }
  }
  return { error: last };
}

async function fetchFinancials(data, { ticker, basis, plan, reported, period, limit, requests }) {
  const params = { ticker, period: period ?? plan.period, basis, concept: reported.join(','), limit, ...(plan.as_of ? { as_of: plan.as_of } : {}) };
  requests.push({ route: '/v1/financials', ...params });
  return rowsOf(await data.financials(params));
}

function scopeYears(facts, fiscalYears) {
  if (!fiscalYears.length) return facts;
  return facts.filter(fact => fiscalYears.includes(fact.fiscal_year));
}

function rowsOf(response) {
  const value = response?.data ?? response;
  if (Array.isArray(value)) return value.filter(item => item && typeof item === 'object');
  for (const key of ['facts', 'items', 'results', 'records', 'data']) {
    if (Array.isArray(value?.[key])) return value[key].filter(item => item && typeof item === 'object');
  }
  return [];
}

// Macro and policy questions read as analysis but have no company behind them;
// routing one as company analysis sends "RBI" to entity resolution.
const MACRO = /\b(?:rbi|repo|inflation|cpi|wpi|gdp|pmi|liquidity|rupee|inr|crude|bond yield|fiscal|monetary|policy|sector|industry|nifty|sensex|market)\b/i;

function classifyRoute(text, { concepts, references }) {
  // "evidence for and against" is not a comparison between two companies.
  const comparing = /\b(?:vs\.?|versus)\b|\bcompare[d]?\b|\bcomparison\b/i.test(text);
  if (comparing && references.length > 1) return 'comparison';
  // A price question with no financial concept behind it is just a quote.
  if (PRICE.test(text) && !concepts.length && references.length) return 'price_lookup';
  if (FILING.test(text)) return 'filing_research';
  if (EVENT.test(text)) return 'event_research';
  if (MACRO.test(text) && !concepts.length) return 'factual_lookup';
  // A question about how a company is doing is analysis whether or not it names
  // a measure -- "how is Infosys performing" needs the same packet as "why did
  // Infosys margin fall", and answering it from a one-metric lookup is the
  // surface-level result this route exists to prevent.
  if (ANALYSIS.test(text) && (concepts.length || references.length)) return 'financial_analysis';
  if (concepts.length) return 'financial_metric_lookup';
  return 'factual_lookup';
}

const FY = /\bFY\s?'?(\d{4}|\d{2})\b|\b(?:financial|fiscal)\s+year\s+(\d{4})\b/gi;
const RANGE = /\b(?:to|through|until|till|and|[-–—])\b|[-–—]/;

export function extractFiscalYears(question, temporal = null) {
  const text = String(question ?? '');
  const hits = [...text.matchAll(FY)].map(match => ({
    year: normalizeYear(match[1] ?? match[2]),
    index: match.index,
    end: match.index + match[0].length,
  })).filter(hit => hit.year);
  if (!hits.length) return temporal?.fiscal_year ? [temporal.fiscal_year] : [];

  const years = new Set(hits.map(hit => hit.year));
  // "FY2024 to FY2026" asks for FY2025 as well, even though nothing names it.
  for (let index = 1; index < hits.length; index++) {
    const between = text.slice(hits[index - 1].end, hits[index].index);
    if (!RANGE.test(between)) continue;
    const [low, high] = [hits[index - 1].year, hits[index].year].sort((a, b) => a - b);
    if (high - low > 20) continue;
    for (let year = low; year <= high; year++) years.add(year);
  }
  return [...years].sort((a, b) => a - b);
}

function normalizeYear(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  if (number >= 1900 && number <= 2200) return number;
  if (number >= 0 && number < 100) return 2000 + number;
  return null;
}

const EXPLICIT_REFERENCE = /\b(?:NSE|BSE):[A-Za-z0-9._-]+\b|\bINE[A-Z0-9]{9}\b/g;

/**
 * Pull company references out of a question that also names metrics and
 * periods, so "Why did Reliance Industries' PAT grow from FY2024 to FY2026?"
 * resolves to Reliance Industries rather than to the whole sentence.
 */
export function extractEntities(question) {
  const original = String(question ?? '');
  // A name after a colon is the subject of a desk command ("…risks: asian
  // paints"), which users type in lower case. Capitalised-run matching cannot
  // see it, so take the tail literally before falling back to the general rule.
  const tail = original.match(/:\s*([^:?!.]{2,60})\s*$/);
  if (tail && !/\d/.test(tail[1])) {
    const named = tail[1].trim().split(/\s+/).filter(word => !STOP_WORDS.has(word.toLowerCase()));
    if (named.length && named.length <= 5) return [named.join(' ')];
  }
  const explicit = original.match(EXPLICIT_REFERENCE) || [];
  // Blank the metric and period spans in place so character offsets stay valid.
  const chars = [...original];
  for (const span of conceptMatches(original)) chars.fill(' ', span.start, span.end);
  let text = chars.join('').replace(EXPLICIT_REFERENCE, ' ').replace(FY, ' ');

  const names = [];
  for (const run of capitalisedRuns(text)) {
    const kept = [];
    for (const word of run.split(/\s+/)) {
      if (STOP_WORDS.has(word.toLowerCase().replace(/[.'’]+$/, ''))) {
        if (kept.length) { names.push(kept.join(' ')); kept.length = 0; }
        continue;
      }
      kept.push(word.replace(/['’]s?$/, ''));
    }
    if (kept.length) names.push(kept.join(' '));
  }
  const found = [...new Set([...explicit, ...names])].filter(Boolean);
  if (found.length) return found.slice(0, 5);

  // Nothing capitalised survived. People type "reliance stock price" and
  // "asian paints" in lower case, and a matcher that only sees capitals decides
  // those questions have no subject at all. Fall back to whatever words are
  // left once the question's own vocabulary is removed.
  const remaining = text
    .split(/[^A-Za-z0-9&.'-]+/)
    .filter(word => word && !STOP_WORDS.has(word.toLowerCase().replace(/[.'’]+$/, '')));
  return remaining.length && remaining.length <= 4 ? [remaining.join(' ')] : [];
}

function capitalisedRuns(text) {
  return text.match(/[A-Z][A-Za-z0-9&.]*(?:\s+[A-Z][A-Za-z0-9&.]*)*/g) || [];
}


// ── Semantic planning ───────────────────────────────────────────────────────
// Marked ships a planner that reads the question and returns a typed
// RetrievalPlan. It understands finance; a keyword table in this file does not,
// and every phrasing it misses becomes another entry nobody thought to add.
// So the server plans, and this module's extraction becomes two narrower jobs:
// the fallback when the planner is unavailable, and the arithmetic the planner
// does not do (expanding "FY2024 to FY2026" into the year nobody named).
//
// Nothing the planner returns is trusted unvalidated: a concept it invents is
// dropped, and a reference that reads as prose loses to the local one.

/** Concepts Marked actually publishes. Anything else is discarded, not queried. */
function knownConcepts(concepts) {
  return (Array.isArray(concepts) ? concepts : [])
    .filter(id => typeof id === 'string')
    .filter(id => REPORTED_CONCEPTS.includes(id) || isDerived(id));
}

function usableReference(reference) {
  const text = String(reference ?? '').trim();
  return Boolean(text) && text.length <= 80 && text.split(/\s+/).length <= 6;
}

export function mergePlans(local, luna) {
  const concepts = knownConcepts(luna.concepts);
  if (!concepts.length && !usableReference(luna.reference)) return local;
  const required = concepts.length ? concepts : local.required_concepts;
  const references = usableReference(luna.reference) ? [luna.reference] : local.references;
  // Routing ran before the company was known, because a lower-case name is
  // invisible to capitalised-run extraction. "reliance stock price" therefore
  // looked like a question with no subject. Re-route now that there is one.
  const route = local.references.length === 0 && references.length
    ? classifyRoute(local.question ?? '', { concepts: local.required_concepts, references })
    : local.route;
  return {
    ...local,
    planned_by: 'marked',
    route,
    datasets: [...new Set([...(local.datasets ?? []), ...(route === 'price_lookup' ? ['quote'] : [])])],
    references,
    // Neither planner's name is authoritative: Luna returns a display name that
    // Marked's own search may not resolve ("Dixon Technologies" fails where
    // "Dixon" succeeds). Keep both and let resolution decide.
    reference_candidates: [...new Set([
      ...(usableReference(luna.reference) ? [luna.reference] : []),
      ...local.references,
    ])],
    // A resolved company outranks macro words in the surrounding prose — unless
    // the thing resolved is itself macro, which is how "/macro" ends up with
    // the central bank as its "company".
    // A declared macro subject is never overridden by whatever Luna resolved.
    subject: local.subject === 'macro' ? 'macro'
      : usableReference(luna.reference) && !MACRO.test(luna.reference) ? 'company'
      : local.subject,
    // The planner's concepts lead; anything the question named explicitly and
    // the planner missed is still retrieved rather than silently dropped.
    concepts: [...new Set([...concepts, ...local.concepts])],
    required_concepts: [...new Set([...required, ...local.required_concepts])],
    period: luna.period ?? local.period,
    basis: luna.basis ?? local.basis,
    // A range the question stated beats a single year the planner picked.
    fiscal_years: local.fiscal_years.length
      ? local.fiscal_years
      : (Number.isFinite(luna.fiscal_year) ? [luna.fiscal_year] : []),
    search_text: luna.search_text ?? null,
    requires_facts: FACT_ROUTES.has(local.route) || Boolean(required.length),
  };
}

/**
 * The plan for a question: Marked's if it can produce one, this module's if not.
 * Never throws — a planner that is down degrades to local extraction rather
 * than failing the research.
 */
export async function resolvePlan(data, question, { temporal = null, asOf = null, declared = null } = {}) {
  const local = buildDataPlan(question, { temporal, asOf, declared });
  local.candidates = { local: { references: local.references, concepts: local.concepts, fiscal_years: local.fiscal_years, route: local.route }, marked: null };
  if (typeof data?.query !== 'function') return local;
  try {
    // A Company World has already resolved its subject. Give that context to
    // the server planner without changing the user's saved question.
    const planningQuestion = declared?.kind === 'company' && declared.references?.length
      ? `${declared.references[0]}: ${question}`
      : String(question);
    // One call plans and carries the narrative evidence. Asking twice would cost
    // two requests against the workspace quota for the same answer.
    const response = await data.query({ query: planningQuestion, limit: 30 });
    const body = response?.data;
    if (!body || body.status === 'needs_plan' || !body.plan) return local;
    const merged = mergePlans(local, body.plan);
    merged.narrative = Array.isArray(body.evidence?.documents) ? body.evidence.documents : [];
    // Both candidates travel with the plan: the reviewer judges the merge, and
    // seeing where the two planners disagreed is most of the signal.
    merged.candidates = {
      local: { references: local.references, concepts: local.concepts, fiscal_years: local.fiscal_years, route: local.route },
      marked: { reference: body.plan.reference, concepts: body.plan.concepts, fiscal_year: body.plan.fiscal_year, period: body.plan.period, basis: body.plan.basis, route: body.plan.route },
    };
    return merged;
  } catch {
    return local;
  }
}
