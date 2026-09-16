import { DERIVED_METRICS, INSTANT_CONCEPTS, REPORTED_CONCEPTS } from '../data/concepts.js';

// Neither planner is the source of truth. Marked's Luna reads the question well
// but returns a display name its own search cannot always resolve and a single
// fiscal year where the question asked for a range; the local extractor knows
// the arithmetic but not the finance. So both are candidates, and a reasoning
// model judges the merged plan against the question before a single fact is
// fetched.
//
// The judge is advisory, never authoritative: every field it returns is checked
// against Marked's published vocabulary, and anything invalid is discarded
// rather than queried. A judge that fails, times out or answers nonsense leaves
// the plan exactly as it was — review can improve a plan, never break one.

const PERIODS = ['annual', 'quarterly', 'instant', 'any'];
const BASES = ['consolidated', 'standalone'];
const ROUTES = [
  'financial_metric_lookup', 'financial_analysis', 'comparison',
  'filing_research', 'event_research', 'factual_lookup',
];

// Datasets the runtime can fetch beyond the income statement. Teaching the
// reviewer that ownership and filings exist is pointless unless it can ask for
// them, so it names them here and the retrieval layer honours the request.
const DATASETS = ['shareholding', 'filings', 'events', 'corporate_actions', 'prices'];

// The judge's output is a diagnosis, not a plan. It says what information the
// results lack; turning that into a retrieval plan is the builder's job, and
// the builder is deterministic. A model that writes plan fields directly is a
// model whose mistakes reach Marked unchecked.
export const planReviewSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['verdict', 'reasoning'],
  properties: {
    verdict: { type: 'string', enum: ['ok', 'revise'] },
    reasoning: { type: 'string' },
    missing: { type: 'array', items: { type: 'string' } },
    unnecessary: { type: 'array', items: { type: 'string' } },
    concepts: { type: 'array', items: { type: 'string' } },
    references: { type: 'array', items: { type: 'string' } },
    fiscal_years: { type: 'array', items: { type: 'integer' } },
    period: { type: 'string', enum: PERIODS },
    basis: { type: 'string', enum: BASES },
    route: { type: 'string', enum: ROUTES },
    datasets: { type: 'array', items: { type: 'string', enum: DATASETS } },
  },
};

export function reviewPrompt(question, plan, candidates, round, catalogue = null, concern = null) {
  const context = {
    question,
    round,
    // Why the plan was sent for review. A reviewer told what already failed
    // fixes that, rather than re-deriving the plan from scratch.
    concern,
    proposed_plan: {
      route: plan.route,
      references: plan.references,
      reference_candidates: plan.reference_candidates ?? plan.references,
      concepts: plan.concepts,
      required_concepts: plan.required_concepts,
      analysis_requirements: plan.analysis_requirements ?? [],
      datasets: plan.datasets ?? [],
      fiscal_years: plan.fiscal_years,
      period: plan.period,
      basis: plan.basis,
    },
    candidate_plans: candidates,
    // Everything Marked holds, so the reviewer can reach for ownership, a credit
    // rating or an earnings call — not only the income statement it happens to
    // have seen in the proposed plan.
    catalogue: {
      ...(catalogue ?? {
        concepts: { reported: REPORTED_CONCEPTS, derived_ratios: DERIVED_METRICS, balance_sheet_point_in_time: INSTANT_CONCEPTS },
      }),
      periods: PERIODS,
      bases: BASES,
      routes: ROUTES,
    },
  };
  return `Return only JSON matching this contract: ${JSON.stringify(planReviewSchema)}

You are reviewing a data-retrieval plan for an Indian-market research question,
before any data is fetched. You are not answering the question.

First work out what the person actually wants, which is often not what the
sentence literally names:

- "is the growth sustainable" is a question about whether reported profit is
  backed by cash and funded without leverage — not a question about growth.
- "is anything unusual" asks for a reconciliation between two things that should
  move together, so both must be retrieved even when only one is named.
- "what's driving X" needs the components of X, not X itself; a series of one
  measure cannot explain its own movement.
- "how is the company doing" is a full profile: revenue, profit, margins, cash
  generation and balance-sheet strength.
- "should I worry about X" asks for the evidence on both sides of X.
- "why has the stock underperformed" is a return-attribution question: company
  and peer/benchmark returns, the earnings/revision path and valuation-multiple
  change are required. Business deterioration alone does not answer it.
- A question naming a ratio needs the ratio's inputs, so the answer can show the
  arithmetic rather than assert the number.

The "concern" field says why this plan was sent to you: either a cheap check
found it suspect, or it was executed and the results did not answer the
question. Fix that specifically.

Then judge one thing: executed as written, would this plan retrieve everything
needed to answer what the person meant, and nothing irrelevant?

Rules:
- Use only identifiers from catalogue.concepts. An identifier outside it is
  discarded, so inventing one silently loses the coverage you intended.
- catalogue lists every dataset Marked holds, with row counts and last write.
  A question is often best answered by data the plan did not consider at all:
  ownership and pledge levels, filings and earnings-call transcripts, corporate
  actions, or the price series. Name those in "missing" when they matter.
- catalogue.limitations says what Marked does not have. Do not ask for it.
- Put any non-financial dataset the question needs in "datasets": ownership and
  pledge changes are shareholding; management commentary and results documents
  are filings; dividends and buybacks are corporate_actions; what the stock did
  is prices. A question can need these and no concepts at all.
- When relative performance is requested without a comparator, add relevant
  listed peers in "references". Those names are resolved against Marked before
  retrieval; do not use a sector label as though it were a company.
- Name every concept the question needs that the plan omits. A question about
  working capital needs inventories, receivables and payables; one about
  earnings quality needs profit and operating cash flow; one about returns needs
  the equity or asset base, not just the profit.
- Balance-sheet concepts are point-in-time; the runtime already fetches those
  separately, so do not change period on their account.
- Prefer more periods to fewer when the question asks about a trend, but do not
  invent fiscal years the question does not imply.
- Say "ok" when the plan is already sufficient. Padding a good plan with
  marginal concepts makes the answer worse, not better.
- State the intent you inferred in one sentence at the start of reasoning, so a
  wrong reading is visible in the audit trail rather than silently acted on.
- Reply "revise" with the fields you would change. Omit fields you would keep.

${JSON.stringify(context)}`;
}

/** Keep only what Marked actually publishes. */
function cleanConcepts(concepts) {
  return [...new Set((Array.isArray(concepts) ? concepts : [])
    .filter(id => typeof id === 'string')
    .filter(id => REPORTED_CONCEPTS.includes(id) || DERIVED_METRICS.includes(id)))];
}

function cleanYears(years) {
  return [...new Set((Array.isArray(years) ? years : [])
    .map(Number)
    .filter(year => Number.isInteger(year) && year >= 1990 && year <= 2100))]
    .sort((a, b) => a - b);
}

/**
 * The Query/Plan Builder: a diagnosis in, a concrete retrieval plan out.
 *
 * Deterministic by design. Every identifier is checked against what Marked
 * publishes, every enum against its vocabulary, and anything that fails is
 * dropped rather than queried — so the worst a wrong diagnosis can do is leave
 * the plan as it was. This is the step that makes a probabilistic judge safe.
 */
export function buildRepairPlan(plan, review) {
  if (!review || review.verdict !== 'revise') return plan;

  const added = cleanConcepts(review.concepts);
  const dropped = new Set(cleanConcepts(review.unnecessary));
  const concepts = [...new Set([...plan.concepts, ...added])].filter(id => !dropped.has(id));
  const required = [...new Set([...plan.required_concepts, ...added])].filter(id => !dropped.has(id));
  const years = cleanYears(review.fiscal_years);

  // A reviewer's company name is another candidate for resolution, never a
  // replacement: it has not been checked against Marked's identity index.
  const references = (Array.isArray(review.references) ? review.references : [])
    .filter(name => typeof name === 'string' && name.trim() && name.length <= 80);
  const activeReferences = plan.analysis_requirements?.includes('peer_relative_return')
    ? [...new Set([...plan.references, ...references])].slice(0, 5)
    : plan.references;

  const datasets = (Array.isArray(review.datasets) ? review.datasets : []).filter(name => DATASETS.includes(name));

  return {
    ...plan,
    datasets: [...new Set([...(plan.datasets ?? []), ...datasets])],
    concepts: concepts.length ? concepts : plan.concepts,
    required_concepts: required.length ? required : plan.required_concepts,
    fiscal_years: years.length ? years : plan.fiscal_years,
    period: PERIODS.includes(review.period) ? review.period : plan.period,
    basis: BASES.includes(review.basis) ? review.basis : plan.basis,
    route: ROUTES.includes(review.route) ? review.route : plan.route,
    references: activeReferences,
    reference_candidates: [...new Set([...(plan.reference_candidates ?? plan.references), ...references])],
    requires_facts: plan.requires_facts || Boolean(required.length && plan.references.length),
  };
}

/**
 * Review the plan until the judge is satisfied or the rounds run out. Returns
 * the plan plus the trail, so the packet can show why it retrieved what it did.
 */
export async function reviewPlan(agent, question, plan, candidates, { rounds = 1, cwd, timeoutMs = 60000, onRound, schema = planReviewSchema, catalogue = null, concern = null } = {}) {
  // A question can need ownership or filings and no financial concept at all,
  // so the gate is "is this about a company", not "did the planner find a
  // metric" — the latter is exactly what review exists to correct.
  if (!agent?.run || !plan || plan.subject !== 'company') return { plan, reviews: [] };
  let current = plan;
  const reviews = [];

  for (let round = 1; round <= rounds; round++) {
    let review;
    try {
      // The provider must be told the contract, or it answers with the research
      // schema and every verdict reads as unusable.
      review = await agent.run(reviewPrompt(question, current, candidates, round, catalogue, concern), { cwd, timeoutMs, schema });
    } catch (error) {
      reviews.push({ round, error: String(error.message || error).slice(0, 200) });
      break;
    }
    if (!review || typeof review !== 'object' || !['ok', 'revise'].includes(review.verdict)) {
      reviews.push({ round, error: 'reviewer returned no usable verdict' });
      break;
    }
    const before = new Set(current.concepts);
    const datasetsBefore = new Set(current.datasets ?? []);
    current = buildRepairPlan(current, review);
    // Compare the sets, not the counts: a revision that swaps three concepts for
    // three others is the most useful kind and nets to zero.
    const added = current.concepts.filter(id => !before.has(id));
    const removed = [...before].filter(id => !current.concepts.includes(id));
    const entry = {
      round,
      verdict: review.verdict,
      reasoning: String(review.reasoning ?? '').slice(0, 600),
      missing: Array.isArray(review.missing) ? review.missing.slice(0, 12) : [],
      added,
      removed,
    };
    reviews.push(entry);
    await onRound?.(entry);
    // Stop when the reviewer is satisfied, or when a revision changed nothing —
    // another round would ask the same question and get the same answer.
    // The delta, not the running total: a second round that re-states the same
    // datasets has changed nothing and will keep changing nothing.
    const datasetsAdded = (current.datasets ?? []).filter(name => !datasetsBefore.has(name));
    entry.datasets = current.datasets ?? [];
    entry.datasets_added = datasetsAdded;
    if (review.verdict === 'ok' || (!added.length && !removed.length && !datasetsAdded.length)) break;
  }
  return { plan: current, reviews };
}

// ── When to spend a review ──────────────────────────────────────────────────
// Reviewing costs about forty seconds. On "What was Infosys PAT in FY2025?"
// that is forty seconds to be told the obvious plan was fine. So the judge is
// an exception handler, not a tollbooth: cheap deterministic triage decides,
// and the expensive opinion is bought only when there is real evidence the plan
// will not answer the question.

/** Do the two planners actually disagree about what to fetch? */
function plannersDisagree(candidates) {
  const marked = candidates?.marked;
  const local = candidates?.local;
  if (!marked || !local) return false;
  const a = new Set(marked.concepts ?? []);
  const b = new Set(local.concepts ?? []);
  if (!a.size || !b.size) return false;
  const shared = [...a].filter(id => b.has(id)).length;
  // Disjoint concept sets mean one of them has misread the question.
  return shared === 0;
}

/**
 * Why this plan is suspect before anything is fetched, or null to proceed.
 * Deterministic and free.
 */
export function preflightConcern(plan) {
  if (!plan || plan.subject !== 'company') return null;
  if (!plan.required_concepts?.length && !plan.datasets?.length) {
    return 'the question is about a company but no measure was resolved';
  }
  if (plannersDisagree(plan.candidates)) {
    return 'the two planners proposed no concepts in common';
  }
  return null;
}

/**
 * Why the retrieval failed the question, or null when it answered it. This is
 * the signal that matters: a plan is broken when its results are, and that is
 * knowable only after the cheap attempt has been made.
 */
export function postflightConcern(plan, executed) {
  if (!plan || plan.subject !== 'company' || !executed) return null;
  if (plan.analysis_requirements?.includes('peer_relative_return')
    && executed.companies?.filter(company => company.entity).length < 2) {
    return 'relative performance needs at least one resolved peer or benchmark';
  }
  const required = plan.required_concepts ?? [];
  if (!required.length) return null;
  if (!executed.facts.length) return 'retrieval returned no facts at all';

  const retrieved = new Set(executed.facts.map(fact => fact.concept_id));
  const absent = required.filter(id => !retrieved.has(id));
  // One missing line is a coverage gap and gets reported as one. Most of the
  // request missing means the plan asked for the wrong things.
  if (absent.length && absent.length >= Math.ceil(required.length / 2)) {
    return `${absent.length} of ${required.length} requested concepts returned nothing: ${absent.slice(0, 6).join(', ')}`;
  }
  return null;
}

/** Kept for callers that still use the old name. */
export const applyReview = buildRepairPlan;
