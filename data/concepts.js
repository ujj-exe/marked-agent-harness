// Canonical Marked concept identifiers. Reported facts come from the documented
// financial concept index (GET /v1/financials?concept=…); derived ratios come from
// GET /v1/financial-metrics. Both lists are Marked's, not ours — a request for
// POST /v1/query with an unplannable question returns `supported_concepts` with
// exactly the reported set below.

export const REPORTED_CONCEPTS = [
  'BasicEarningsPerShare', 'Borrowings', 'CashAndCashEquivalents', 'ChangesInInventories',
  'CostOfMaterials', 'CurrentTax', 'DeferredTax', 'DepreciationAndAmortisation',
  'DilutedEarningsPerShare', 'EmployeeBenefitExpense', 'EquityShareCapital', 'ExceptionalItems',
  'FinanceCosts', 'Goodwill', 'Inventories', 'NetCashFromFinancingActivities',
  'NetCashFromInvestingActivities', 'NetCashFromOperatingActivities', 'NetIncreaseInCash',
  'OtherComprehensiveIncome', 'OtherEquity', 'OtherExpenses', 'OtherIncome', 'ProfitAfterTax',
  'ProfitBeforeExceptionalItemsAndTax', 'ProfitBeforeTax', 'PropertyPlantAndEquipment',
  'PurchasesOfStockInTrade', 'Revenue', 'TaxExpense', 'TotalAssets', 'TotalComprehensiveIncome',
  'TotalEquity', 'TotalExpenses', 'TotalIncome', 'TotalLiabilities', 'TradePayables',
  'TradeReceivables',
];

export const DERIVED_METRICS = [
  'ebit', 'ebitda', 'net_margin', 'ebit_margin', 'ebitda_margin', 'effective_tax_rate',
  'interest_coverage', 'return_on_equity', 'return_on_assets', 'debt_to_equity',
  'asset_turnover', 'cash_conversion',
];

// Balance-sheet lines are stocks measured at an instant, not flows measured over
// a period: they carry a period_end and no period_start, so a request for
// period=annual excludes every one of them. Retrieval has to ask for these
// separately or a balance-sheet question returns an empty answer and a gap.
export const INSTANT_CONCEPTS = [
  'Borrowings', 'CashAndCashEquivalents', 'EquityShareCapital', 'Goodwill', 'Inventories',
  'OtherEquity', 'PropertyPlantAndEquipment', 'TotalAssets', 'TotalEquity',
  'TotalLiabilities', 'TradePayables', 'TradeReceivables',
];

export function isInstant(conceptId) {
  return INSTANT_CONCEPTS.includes(conceptId);
}

// Longest phrase first — matching is greedy so "profit before tax" never resolves as "profit".
const ALIASES = [
  ['profit attributable to owners', 'ProfitAfterTax'],
  ['profit attributable to shareholders', 'ProfitAfterTax'],
  ['profit before exceptional items and tax', 'ProfitBeforeExceptionalItemsAndTax'],
  ['net cash from operating activities', 'NetCashFromOperatingActivities'],
  ['net cash from investing activities', 'NetCashFromInvestingActivities'],
  ['net cash from financing activities', 'NetCashFromFinancingActivities'],
  ['cash flow from operating activities', 'NetCashFromOperatingActivities'],
  ['cash generated from operations', 'NetCashFromOperatingActivities'],
  ['cash flow from operations', 'NetCashFromOperatingActivities'],
  ['cash from operations', 'NetCashFromOperatingActivities'],
  ['operating cash flow', 'NetCashFromOperatingActivities'],
  ['operational cash flow', 'NetCashFromOperatingActivities'],
  ['investing cash flow', 'NetCashFromInvestingActivities'],
  ['financing cash flow', 'NetCashFromFinancingActivities'],
  ['cash flow from investing', 'NetCashFromInvestingActivities'],
  ['cash flow from financing', 'NetCashFromFinancingActivities'],
  // Marked publishes no free-cash-flow concept. Operating cash flow is the
  // measured half; capex is carried as a driver so the reader can net it
  // themselves rather than be handed a number nobody reported.
  ['free cash flow', 'NetCashFromOperatingActivities'],
  ['fcf', 'NetCashFromOperatingActivities'],
  // Bare "cash flow" means the operating statement in every question that pairs
  // it with earnings. It is emphatically not the cash balance.
  ['cash flows', 'NetCashFromOperatingActivities'],
  ['cash flow', 'NetCashFromOperatingActivities'],
  ['cash generation', 'NetCashFromOperatingActivities'],
  // The balance sheet line needs to be asked for explicitly.
  ['cash and cash equivalents', 'CashAndCashEquivalents'],
  ['cash on the balance sheet', 'CashAndCashEquivalents'],
  ['cash on balance sheet', 'CashAndCashEquivalents'],
  ['cash balance', 'CashAndCashEquivalents'],
  ['cash position', 'CashAndCashEquivalents'],
  ['cash reserves', 'CashAndCashEquivalents'],
  ['cash pile', 'CashAndCashEquivalents'],
  ['liquidity', 'CashAndCashEquivalents'],
  ['treasury', 'CashAndCashEquivalents'],
  ['property plant and equipment', 'PropertyPlantAndEquipment'],
  ['depreciation and amortisation', 'DepreciationAndAmortisation'],
  ['depreciation and amortization', 'DepreciationAndAmortisation'],
  ['employee benefit expense', 'EmployeeBenefitExpense'],
  ['other comprehensive income', 'OtherComprehensiveIncome'],
  ['total comprehensive income', 'TotalComprehensiveIncome'],
  ['diluted earnings per share', 'DilutedEarningsPerShare'],
  ['basic earnings per share', 'BasicEarningsPerShare'],
  ['earnings per share', 'BasicEarningsPerShare'],
  ['revenue from operations', 'Revenue'],
  ['effective tax rate', 'effective_tax_rate'],
  ['interest coverage', 'interest_coverage'],
  ['cash conversion', 'cash_conversion'],
  ['asset turnover', 'asset_turnover'],
  ['return on equity', 'return_on_equity'],
  ['return on assets', 'return_on_assets'],
  ['debt to equity', 'debt_to_equity'],
  ['debt-to-equity', 'debt_to_equity'],
  ['trade receivables', 'TradeReceivables'],
  ['trade payables', 'TradePayables'],
  ['exceptional items', 'ExceptionalItems'],
  ['finance costs', 'FinanceCosts'],
  ['interest expense', 'FinanceCosts'],
  ['interest cost', 'FinanceCosts'],
  ['profit after tax', 'ProfitAfterTax'],
  ['profit before tax', 'ProfitBeforeTax'],
  ['pre-tax profit', 'ProfitBeforeTax'],
  ['pretax profit', 'ProfitBeforeTax'],
  ['operating profit', 'ebit'],
  ['operating income', 'ebit'],
  ['operating margin', 'ebit_margin'],
  ['ebitda margin', 'ebitda_margin'],
  ['ebit margin', 'ebit_margin'],
  ['profit margin', 'net_margin'],
  ['net margin', 'net_margin'],
  ['gross margin', 'ebitda_margin'],
  ['margins', 'net_margin'],
  ['margin', 'net_margin'],
  ['profitability', 'net_margin'],
  ['net profit', 'ProfitAfterTax'],
  ['net income', 'ProfitAfterTax'],
  ['bottom line', 'ProfitAfterTax'],
  ['total expenses', 'TotalExpenses'],
  ['other expenses', 'OtherExpenses'],
  ['total income', 'TotalIncome'],
  ['other income', 'OtherIncome'],
  ['total assets', 'TotalAssets'],
  ['total equity', 'TotalEquity'],
  ['net worth', 'TotalEquity'],
  ['shareholders equity', 'TotalEquity'],
  ['tax expense', 'TaxExpense'],
  ['cost of materials', 'CostOfMaterials'],
  ['top line', 'Revenue'],
  ['topline', 'Revenue'],
  ['turnover', 'Revenue'],
  ['borrowings', 'Borrowings'],
  ['inventories', 'Inventories'],
  ['inventory', 'Inventories'],
  ['receivables', 'TradeReceivables'],
  ['payables', 'TradePayables'],
  ['goodwill', 'Goodwill'],
  ['ebitda', 'ebitda'],
  ['ebit', 'ebit'],
  ['earnings', 'ProfitAfterTax'],
  ['profits', 'ProfitAfterTax'],
  ['profit', 'ProfitAfterTax'],
  ['revenue', 'Revenue'],
  ['sales', 'Revenue'],
  ['eps', 'BasicEarningsPerShare'],
  ['pat', 'ProfitAfterTax'],
  ['pbt', 'ProfitBeforeTax'],
  ['roe', 'return_on_equity'],
  ['roa', 'return_on_assets'],
  ['cfo', 'NetCashFromOperatingActivities'],
  ['capex', 'PropertyPlantAndEquipment'],
  ['debt', 'Borrowings'],
  ['tax', 'TaxExpense'],
];

const BY_ID = new Map([...REPORTED_CONCEPTS, ...DERIVED_METRICS].map(id => [id.toLowerCase(), id]));

export function isDerived(conceptId) {
  return DERIVED_METRICS.includes(conceptId);
}

export function resolveConcept(text) {
  const value = String(text ?? '').trim().toLowerCase();
  if (!value) return null;
  if (BY_ID.has(value)) return BY_ID.get(value);
  const alias = ALIASES.find(([phrase]) => phrase === value);
  return alias ? alias[1] : null;
}

/**
 * Every canonical concept named in a question, with the span of text that named
 * it. Callers strip those spans before looking for company names, so "PAT" in
 * "Reliance Industries' PAT" is not mistaken for part of the company.
 */
export function conceptMatches(question) {
  const text = String(question ?? '').toLowerCase();
  const found = [];
  for (const [phrase, id] of ALIASES) {
    for (const match of text.matchAll(wordBoundary(phrase))) {
      // A longer alias already covering this span wins: "profit before tax" beats "profit".
      if (found.some(item => item.start <= match.index && match.index < item.end)) continue;
      found.push({ id, start: match.index, end: match.index + phrase.length });
    }
  }
  return found.sort((a, b) => a.start - b.start);
}

/** Concept identifiers named in a question, in the order the words appear. */
export function extractConcepts(question) {
  return [...new Set(conceptMatches(question).map(item => item.id))];
}

function wordBoundary(phrase) {
  return new RegExp(`(?<![a-z0-9])${phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![a-z0-9])`, 'g');
}
