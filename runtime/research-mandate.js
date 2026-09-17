/**
 * The research contract between planning, retrieval and synthesis.
 *
 * A retrieval plan says which endpoints to call. A mandate says what the
 * finished answer must establish. Keeping those separate prevents a successful
 * API call from being mistaken for a complete answer.
 */

export const ANALYSIS_REQUIREMENTS = [
  'financial_performance',
  'operating_drivers',
  'balance_sheet_and_cash',
  'capital_allocation',
  'business_mix',
  'ownership_change',
  'event_linkage',
  'management_commentary',
  'valuation_current',
  'valuation_history',
  'security_price_return',
  'peer_relative_return',
  'earnings_revision_path',
  'peer_comparison',
  'ai_economics',
  'forward_monitoring',
];

const LABELS = {
  financial_performance: 'Revenue, earnings and margin path',
  operating_drivers: 'Operating drivers and unit economics',
  balance_sheet_and_cash: 'Cash conversion, leverage and balance sheet',
  capital_allocation: 'Capex and capital allocation',
  business_mix: 'Segment, client and geographic mix',
  ownership_change: 'Ownership and shareholding change',
  event_linkage: 'Events and filings linked to the numbers',
  management_commentary: 'Management commentary reconciled with reported data',
  valuation_current: 'Current valuation',
  valuation_history: 'Historical valuation change',
  security_price_return: 'Security price and total return',
  peer_relative_return: 'Peer-relative return',
  earnings_revision_path: 'Earnings expectations and revision path',
  peer_comparison: 'Like-for-like peer comparison',
  ai_economics: 'AI revenue, productivity and delivery-model economics',
  forward_monitoring: 'Catalysts, risks and leading indicators',
};

const RULES = [
  [/\b(?:revenue|sales|profit|pat|earnings|growth|margin|financial performance)\b/i, ['financial_performance']],
  [/\b(?:pricing|utili[sz]ation|attrition|employee costs?|cost structure|deal wins?|operating leverage|unit economics|margin)\b/i, ['operating_drivers']],
  [/\b(?:debt|borrowings?|leverage|cash conversion|cash generation|balance sheet|working capital)\b/i, ['balance_sheet_and_cash']],
  [/\b(?:capex|capital expenditure|capital allocation|dividends?|buybacks?|payout)\b/i, ['capital_allocation']],
  [/\b(?:segment mix|client mix|geographic mix|geography mix|vertical mix|revenue mix)\b/i, ['business_mix']],
  [/\b(?:shareholding|shareholders?|promoter|fii|dii|ownership|pledge)\b/i, ['ownership_change']],
  [/\b(?:events?|filings?|annual reports?|disclosures?|what changed|drove those changes)\b/i, ['event_linkage']],
  [/\b(?:management commentary|management claims?|earnings call|transcript|guidance)\b/i, ['management_commentary']],
  [/\b(?:valuation|p\s*\/\s*e|price[ -]to[ -]earnings|ev\s*\/\s*ebitda|multiple)\b/i, ['valuation_current']],
  [/\b(?:valuation|p\s*\/\s*e|ev\s*\/\s*ebitda|multiple)\b.{0,80}\b(?:history|historical|change|changed|over|years?)\b|\b(?:history|historical|change|changed|over|years?)\b.{0,80}\b(?:valuation|p\s*\/\s*e|ev\s*\/\s*ebitda|multiple)\b/i, ['valuation_history']],
  [/\b(?:underperform|outperform|lagged|shareholder return|total return|stock return|share-price return)\b/i, ['security_price_return', 'peer_relative_return', 'earnings_revision_path', 'valuation_history']],
  [/\b(?:peers?|competitors?|comparable companies|compare|versus|vs\.?)\b/i, ['peer_comparison']],
  [/\b(?:earnings revisions?|estimate revisions?|consensus expectations?|expectations changed)\b/i, ['earnings_revision_path']],
  [/\b(?:artificial intelligence|ai|genai|generative ai)\b/i, ['ai_economics']],
  [/\b(?:catalysts?|risks?|watch(?:ing)?|next (?:few )?quarters?|bull case|bear case|leading indicators?|change your view)\b/i, ['forward_monitoring']],
];

const CONCEPTS = {
  financial_performance: ['Revenue', 'ProfitAfterTax', 'BasicEarningsPerShare', 'net_margin', 'ebitda_margin', 'ebit_margin'],
  operating_drivers: ['Revenue', 'TotalExpenses', 'EmployeeBenefitExpense', 'FinanceCosts', 'DepreciationAndAmortisation', 'ebitda_margin', 'ebit_margin'],
  balance_sheet_and_cash: ['ProfitAfterTax', 'NetCashFromOperatingActivities', 'Borrowings', 'CashAndCashEquivalents', 'TotalEquity', 'TradeReceivables', 'Inventories', 'TradePayables'],
  capital_allocation: ['NetCashFromOperatingActivities', 'NetCashFromInvestingActivities', 'PropertyPlantAndEquipment', 'Borrowings', 'CashAndCashEquivalents'],
  valuation_current: ['BasicEarningsPerShare', 'ebitda', 'TotalEquity', 'Borrowings', 'CashAndCashEquivalents'],
  valuation_history: ['BasicEarningsPerShare', 'ebitda'],
  security_price_return: ['BasicEarningsPerShare', 'ProfitAfterTax'],
  peer_relative_return: ['BasicEarningsPerShare', 'ProfitAfterTax'],
  peer_comparison: ['Revenue', 'ProfitAfterTax', 'BasicEarningsPerShare', 'net_margin', 'ebitda_margin'],
};

const DATASETS = {
  business_mix: ['filings'],
  ownership_change: ['shareholding'],
  event_linkage: ['filings', 'events', 'corporate_actions'],
  management_commentary: ['filings'],
  capital_allocation: ['corporate_actions'],
  valuation_current: ['quote'],
  valuation_history: ['prices'],
  security_price_return: ['prices', 'corporate_actions'],
  peer_relative_return: ['prices', 'corporate_actions'],
  ai_economics: ['filings', 'news'],
  forward_monitoring: ['events', 'filings', 'news'],
};

/** Build the answer-level contract from the question and the retrieval plan. */
export function buildResearchMandate({ question, plan = {}, mode = 'research' } = {}) {
  const text = String(question ?? '');
  const ids = new Set((plan.analysis_requirements ?? []).filter(id => ANALYSIS_REQUIREMENTS.includes(id)));
  const researchMode = ['analytical', 'research', 'comparative'].includes(mode)
    || ['financial_analysis', 'comparison'].includes(plan.route);
  if (researchMode) {
    for (const [pattern, requirements] of RULES) {
      if (pattern.test(text)) requirements.forEach(id => ids.add(id));
    }
  }

  const deep = /\b(?:deep dive|investment view|proper (?:investment )?view|full analysis)\b/i.test(text);
  if (deep && researchMode) {
    ['financial_performance', 'operating_drivers', 'balance_sheet_and_cash', 'event_linkage', 'valuation_current', 'forward_monitoring']
      .forEach(id => ids.add(id));
  }
  if (researchMode && !ids.size && /\b(?:analy[sz]e|research|investment view|overview|fundamentals|how is .{1,50} doing)\b/i.test(text)) {
    ['financial_performance', 'operating_drivers', 'balance_sheet_and_cash', 'event_linkage', 'valuation_current', 'forward_monitoring']
      .forEach(id => ids.add(id));
  }
  if (plan.route === 'financial_analysis' && !ids.size) {
    ids.add('financial_performance');
    ids.add('operating_drivers');
  }
  if (plan.route === 'comparison') ids.add('peer_comparison');
  if (['filing_research', 'event_research'].includes(plan.route)) ids.add('event_linkage');

  const requirements = [...ids].map(id => ({
    id,
    label: LABELS[id],
    material: true,
  }));
  return {
    version: 1,
    question: text,
    mode,
    requirements,
    completion_policy: 'Every material requirement must be supported, explicitly unavailable after retrieval, or omitted from the conclusion.',
    source_policy: 'Marked is canonical when available; otherwise use primary sources, then reputable secondary sources.',
  };
}

/** Add the deterministic retrieval implications of a mandate to a plan. */
export function applyMandateToPlan(plan, mandate) {
  const ids = mandate.requirements.map(item => item.id);
  const concepts = ids.flatMap(id => CONCEPTS[id] ?? []);
  const datasets = ids.flatMap(id => DATASETS[id] ?? []);
  return {
    ...plan,
    analysis_requirements: [...new Set([...(plan.analysis_requirements ?? []), ...ids])],
    concepts: [...new Set([...(plan.concepts ?? []), ...concepts])],
    // Supporting concepts improve the packet, but only concepts explicitly
    // requested by the retrieval plan become row-level data gaps. Answer-level
    // completeness is enforced by the mandate gate below.
    required_concepts: [...new Set(plan.required_concepts ?? [])],
    datasets: [...new Set([...(plan.datasets ?? []), ...datasets])],
    requires_facts: plan.requires_facts || Boolean(plan.references?.length && concepts.length),
  };
}

/** Evidence Marked already supplies for each answer requirement. */
export function assessPacketCoverage(mandate, packet = {}, evidence = []) {
  const facts = packet.financial_facts ?? [];
  const concepts = new Set(facts.map(fact => fact.concept_id));
  const evidenceByType = type => evidence.filter(item => item.data_type === type && item.evidence_id).map(item => item.evidence_id);
  const evidenceByMetric = metrics => evidence
    .filter(item => metrics.includes(item.metric ?? item.concept_id) && item.evidence_id)
    .map(item => item.evidence_id);
  const companies = packet.companies ?? [];
  const narrative = JSON.stringify(packet.narrative_evidence ?? packet.filings ?? '');
  const hasNarrative = narrative.length > 10 && narrative !== '[]';
  const coverage = requirement => {
    switch (requirement.id) {
      case 'financial_performance':
        return hit(concepts.has('Revenue') && concepts.has('ProfitAfterTax'), evidenceByMetric(['Revenue', 'ProfitAfterTax', 'BasicEarningsPerShare']));
      case 'operating_drivers':
        return hit(['TotalExpenses', 'EmployeeBenefitExpense', 'ebitda_margin', 'ebit_margin'].some(id => concepts.has(id)), evidenceByMetric(['TotalExpenses', 'EmployeeBenefitExpense', 'ebitda_margin', 'ebit_margin']));
      case 'balance_sheet_and_cash':
        return hit(['NetCashFromOperatingActivities', 'Borrowings', 'CashAndCashEquivalents'].some(id => concepts.has(id)), evidenceByMetric(['NetCashFromOperatingActivities', 'Borrowings', 'CashAndCashEquivalents', 'TotalEquity']));
      case 'capital_allocation':
        return hit(['NetCashFromInvestingActivities', 'PropertyPlantAndEquipment'].some(id => concepts.has(id)) || evidenceByType('corporate_action').length, [...evidenceByMetric(['NetCashFromInvestingActivities', 'PropertyPlantAndEquipment']), ...evidenceByType('corporate_action')]);
      case 'business_mix':
        return hit(/segment|geograph|client|vertical/i.test(narrative), evidenceByType('filing_evidence'));
      case 'ownership_change':
        return hit(evidenceByType('shareholding').length > 0, evidenceByType('shareholding'));
      case 'event_linkage':
        return hit(hasNarrative || evidenceByType('event').length > 0 || evidenceByType('corporate_action').length > 0, [...evidenceByType('filing_evidence'), ...evidenceByType('filing'), ...evidenceByType('event'), ...evidenceByType('corporate_action')]);
      case 'management_commentary':
        return hit(hasNarrative, [...evidenceByType('filing_evidence'), ...evidenceByType('filing')]);
      case 'valuation_current':
        return hit(Boolean(packet.workspace_context?.valuation || packet.quote || companies.some(company => company.datasets?.quote?.length) || concepts.has('BasicEarningsPerShare')), [...evidenceByMetric(['BasicEarningsPerShare', 'ebitda', 'TotalEquity', 'Borrowings']), ...evidenceByType('market_price')]);
      case 'valuation_history':
        return hit(false, []); // Price history is not a historical multiple series.
      case 'security_price_return':
        return hit(evidenceByType('market_price').length > 0, evidenceByType('market_price'));
      case 'peer_relative_return':
        return hit(evidenceByType('market_price').length >= 2, evidenceByType('market_price'));
      case 'earnings_revision_path':
        return hit(false, []); // The Marked catalogue explicitly has no consensus history.
      case 'peer_comparison': {
        const companyCount = companies.filter(company => company.entity || company.company).length;
        return hit(companyCount >= 2, evidenceByMetric(['Revenue', 'ProfitAfterTax', 'BasicEarningsPerShare', 'net_margin', 'ebitda_margin']));
      }
      case 'ai_economics':
        return hit(/\bai\b|artificial intelligence|genai/i.test(narrative), [...evidenceByType('filing_evidence'), ...evidenceByType('filing'), ...evidenceByType('news')]);
      case 'forward_monitoring':
        return hit(hasNarrative || evidenceByType('event').length > 0 || evidenceByType('news').length > 0, [...evidenceByType('filing_evidence'), ...evidenceByType('event'), ...evidenceByType('news')]);
      default:
        return hit(false, []);
    }
  };

  return mandate.requirements.map(requirement => ({ ...requirement, ...coverage(requirement) }));
}

function hit(covered, evidenceIds) {
  return { status: covered ? 'covered' : 'missing', evidence_ids: [...new Set(evidenceIds)] };
}

/** Whether a semantic plan review is worth its latency before retrieval. */
export function needsSemanticPlanReview(question, mandate, plan) {
  if (plan?.subject !== 'company') return false;
  const words = String(question ?? '').trim().split(/\s+/).filter(Boolean).length;
  return mandate.requirements.length >= 4
    || words >= 45
    || mandate.requirements.some(item => ['peer_relative_return', 'earnings_revision_path', 'business_mix', 'ai_economics'].includes(item.id));
}
