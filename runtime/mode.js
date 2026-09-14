// The data plan already decided what kind of question this is. The template has
// to follow it, or an analysis packet of forty facts renders under a FACTUAL
// heading that tells the worker to answer in one line and leave risks empty.
const ROUTE_MODES = {
  financial_analysis: 'analytical',
  comparison: 'comparative',
  financial_metric_lookup: 'factual',
  filing_research: 'event',
  event_research: 'event',
};

export function classifyOutputMode(question, intent = {}, plan = {}) {
  if (ROUTE_MODES[plan.route]) return ROUTE_MODES[plan.route];
  const text = String(question).toLowerCase();
  if (intent.kind === 'compare' || /\b(?:compare|versus|vs\.?|difference between)\b/.test(text)) return 'comparative';
  if (intent.kind === 'sector' || /\b(?:screen|which companies|top stocks|leaders|laggards|find companies|universe)\b/.test(text) || plan.route === 'filter') return 'screening';
  if (intent.kind === 'watch' || /\b(?:filing|announcement|dividend|bonus|split|buyback|event|what happened)\b/.test(text)) return 'event';
  if (intent.kind === 'desk') return 'research';
  if (['risk', 'derivatives', 'portfolio'].includes(intent.kind)) return 'analytical';
  if (/\b(?:analy[sz]e|quality|why|drivers?|outlook|evaluate|assess|risk|valuation|deep dive)\b/.test(text)) return 'analytical';
  if (/\b(?:research|overview|fundamentals|what should i know|tell me about)\b/.test(text)) return 'research';
  return 'factual';
}
