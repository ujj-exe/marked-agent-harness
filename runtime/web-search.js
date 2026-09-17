const EXPLICIT = /\b(?:search|browse|look|check|find|verify)\s+(?:the\s+)?(?:web|internet|online)\b|\bweb[ -]?search\b/i;
const FRESH = /\b(?:latest|current|currently|today|tonight|yesterday|breaking|just announced|this (?:week|month)|recent news|what(?:'s| is) happening now)\b/i;
const PEERS = /\b(?:peers?|competitors?|comparable companies|compares? with)\b/i;
const COMPARISON = /\b(?:compare|comparison|versus|vs\.?|relative to)\b/i;
const VALUATION_HISTORY = /\b(?:valuation|p\/e|price[ -]to[ -]earnings|ev\/ebitda)\b.{0,60}\b(?:history|historical|change[ds]?|over|during|years?)\b|\b(?:history|historical|change[ds]?|over|during|years?)\b.{0,60}\b(?:valuation|p\/e|price[ -]to[ -]earnings|ev\/ebitda)\b/i;
const SEGMENT_MIX = /\bsegment(?: mix| breakdown| contribution| revenue| profit)?\b/i;

/** Decide whether the final provider receives its native web-search tool. */
export function webSearchDecision({ question, intent = {}, packet = {}, evidence = [], pointInTime = false, mandateCoverage = [] }) {
  const text = String(question ?? '');
  if (EXPLICIT.test(text)) return { enabled: true, reason: 'explicit_web_request' };

  // Native search cannot reliably recreate a historical information boundary.
  if (pointInTime) {
    return { enabled: false, reason: 'historical_as_of' };
  }

  const missingRequirement = mandateCoverage.find(item => item.material && item.status !== 'covered');
  if (missingRequirement) {
    return { enabled: true, reason: `mandate_gap:${missingRequirement.id}` };
  }

  const gaps = [packet.unresolved, ...(Array.isArray(packet.data_gaps) ? packet.data_gaps : [])].filter(Boolean);
  if (gaps.length) return { enabled: true, reason: 'marked_data_gap' };

  if (packet.data_plan?.analysis_requirements?.includes('peer_relative_return')) {
    return { enabled: true, reason: 'performance_attribution_required' };
  }

  const companies = Array.isArray(packet.companies) ? packet.companies : [];
  const facts = Array.isArray(packet.financial_facts) ? packet.financial_facts : [];
  if (((PEERS.test(text) || COMPARISON.test(text)) && companies.length === 1)
    || (VALUATION_HISTORY.test(text) && !facts.some(fact => /valuation|price.*earnings|ev.*ebitda/i.test(fact.concept_id ?? '')))
    || (SEGMENT_MIX.test(text) && !facts.some(fact => fact.segment))) {
    return { enabled: true, reason: 'requested_context_missing' };
  }

  if (FRESH.test(text) && !hasFreshSource(packet, evidence)) {
    return { enabled: true, reason: 'fresh_information_required' };
  }

  if (['macro', 'sector', 'derivatives', 'query'].includes(intent.kind) && !evidence.length) {
    return { enabled: true, reason: 'external_context_required' };
  }

  return { enabled: false, reason: 'marked_packet_sufficient' };
}

function hasFreshSource(packet, evidence) {
  const cutoff = Date.now() - 48 * 60 * 60 * 1000;
  const dates = [
    ...(packet.news?.data ?? packet.news ?? []).map?.(item => item.published_at) ?? [],
    ...evidence.map(item => item.known_at ?? item.filing_date ?? item.retrieved_at),
  ];
  return dates.some(value => Number.isFinite(Date.parse(value)) && Date.parse(value) >= cutoff);
}
