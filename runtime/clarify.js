import { DERIVED_METRICS, REPORTED_CONCEPTS, extractConcepts } from '../data/concepts.js';

// Marked does not guess. When a question leaves something open that materially
// changes the answer, the runtime asks instead of picking a reading and
// presenting the result as though it were the only one.
//
// The bar for asking is deliberately high: a question that can be answered well
// is answered, not interrogated. Only two things clear it — a reference that
// resolves to several different companies, and a request whose subject is a
// company but whose measure is absent, which is the difference between a real
// answer and a shrug.

/**
 * The fallback menu. Generic by construction, so it is what the user sees only
 * when the query-specific question could not be produced — a fixed list of six
 * options is the same answer to every question, which is the thing being fixed.
 */
const MEASURE_CHOICES = [
  { name: 'Everything — full financial profile', subtitle: 'revenue, profit, margins, cash flow, balance sheet', append: 'revenue, profit after tax, margins, operating cash flow and total assets' },
  { name: 'Growth and profitability', subtitle: 'revenue, PAT, margins over time', append: 'revenue growth, profit after tax and margins' },
  { name: 'Earnings quality', subtitle: 'does profit convert to cash', append: 'profit after tax versus operating cash flow' },
  { name: 'Margins and cost structure', subtitle: 'where the operating leverage is', append: 'margins, total expenses and employee costs' },
  { name: 'Balance sheet and leverage', subtitle: 'debt, equity, cash', append: 'borrowings, total equity and cash and cash equivalents' },
  { name: 'Latest filings and disclosures', subtitle: 'what the company has said', append: 'latest filings' },
];

/**
 * A reference that matched several companies. Marked will not choose between
 * them, so the user does.
 */
export function companyClarification(error) {
  if (error?.code !== 'AMBIGUOUS_COMPANY' || !error.reference) return null;
  const seen = new Set();
  const choices = (error.choices ?? [])
    .filter(choice => choice?.name && !seen.has(choice.name) && seen.add(choice.name))
    .slice(0, 12);
  if (!choices.length) return null;
  return {
    kind: 'entity',
    reference: error.reference,
    prompt: `Which "${error.reference}" did you mean?`,
    hint: `${choices.length} companies match that name. Marked will not guess between them.`,
    choices,
  };
}

/**
 * Questions the plan itself cannot answer. Returns at most one, because a
 * research tool that asks twice before answering once is not worth using.
 */
export function planClarifications(plan) {
  // Only a company has margins to ask about. A macro or policy question has a
  // capitalised reference too, and asking which measure it reports is nonsense.
  if (!plan || plan.subject !== 'company' || plan.required_concepts?.length) return [];

  if (plan.route === 'comparison') {
    return [{
      kind: 'measure',
      prompt: `Compare ${plan.references.join(' and ')} on what?`,
      hint: 'A comparison needs a measure. Picking one lets Marked retrieve it for both.',
      choices: MEASURE_CHOICES.slice(0, 5),
    }];
  }

  if (plan.route === 'factual_lookup') {
    return [{
      kind: 'measure',
      prompt: `What do you want to know about ${plan.references[0]}?`,
      hint: 'Naming the measure is the difference between a figure and a summary.',
      choices: MEASURE_CHOICES,
    }];
  }
  return [];
}

/**
 * Fold an answer back into the question, so the whole pipeline re-plans from a
 * request that is now specific. Cheaper and far less brittle than threading an
 * override through every layer.
 */
export function applyAnswer(question, clarification, choice) {
  if (!choice) return null;
  if (clarification.kind === 'entity') {
    const pattern = new RegExp(clarification.reference.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    return pattern.test(question)
      ? question.replace(pattern, choice.name)
      : `${question} (${choice.name})`;
  }
  return choice.append ? `${question.replace(/[?.!]+\s*$/, '')} — ${choice.append}` : question;
}

/** Guard: every appended phrase must still resolve to real Marked concepts. */
export function choiceResolvesToConcepts(choice, extractConcepts) {
  const concepts = extractConcepts(choice.append ?? '');
  return concepts.length > 0
    && concepts.every(id => REPORTED_CONCEPTS.includes(id) || DERIVED_METRICS.includes(id));
}

// ── Query-specific questions ────────────────────────────────────────────────
// A menu that reads the same for "Reliance" and for "Dixon after the IPO" is a
// menu that has not understood either. The options are written for the question
// actually asked, then validated: every one must name concepts Marked really
// publishes, or it sends the user round in a circle.

export const clarifySchema = {
  type: 'object',
  additionalProperties: false,
  required: ['prompt', 'options'],
  properties: {
    prompt: { type: 'string' },
    hint: { type: 'string' },
    options: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['label', 'append'],
        properties: {
          label: { type: 'string' },
          detail: { type: 'string' },
          // The phrase appended to the question, which must name real measures:
          // the whole pipeline then replans from a request that is now specific.
          append: { type: 'string' },
        },
      },
    },
  },
};

export function clarifyPrompt(question, plan, catalogue) {
  return `Return only JSON matching this contract: ${JSON.stringify(clarifySchema)}

A person asked this question and the runtime could not tell which measures to
retrieve. Write the one question worth asking back, and the answers worth
offering — for this question, not for companies in general.

Question: ${JSON.stringify(question)}
Subject: ${JSON.stringify(plan.references)}
Route: ${plan.route}

Rules:
- The prompt is one short question in the user's own terms.
- Offer three to six options, ordered most-likely-first. Each needs a short
  label, a detail saying what it would show, and "append": a phrase naming the
  measures to retrieve, written in plain financial English.
- Every phrase in "append" must name measures from this vocabulary, or the
  option retrieves nothing: ${JSON.stringify({ reported: REPORTED_CONCEPTS, derived: DERIVED_METRICS })}
- Make the options genuinely different from each other. Two options that fetch
  the same numbers waste the question.
- If the question hints at a concern — a recent IPO, a stock that has run, a
  margin worry — let the options follow that concern rather than listing the
  financial statements in order.
${catalogue?.limitations ? `- Marked cannot provide: ${catalogue.limitations.join('; ')}` : ''}`;
}

/**
 * Ask the reasoning provider for a question tailored to this query. Returns
 * null on any failure, so the caller falls back to the fixed menu rather than
 * losing the clarification entirely.
 */
export async function generateClarification(agent, question, plan, { cwd, timeoutMs = 60000, catalogue = null } = {}) {
  if (!agent?.run) return null;
  let generated;
  try {
    generated = await agent.run(clarifyPrompt(question, plan, catalogue), { cwd, timeoutMs, schema: clarifySchema });
  } catch { return null; }
  if (!generated || typeof generated !== 'object' || typeof generated.prompt !== 'string') return null;

  const options = (Array.isArray(generated.options) ? generated.options : [])
    .filter(option => option?.label && option?.append)
    // Name and detail share one line in the overlay; long labels wrapped badly.
    .map(option => ({ name: String(option.label).slice(0, 46), subtitle: String(option.detail ?? '').slice(0, 54), append: String(option.append) }))
    .filter(option => choiceResolvesToConcepts(option, extractConcepts))
    .slice(0, 6);
  if (options.length < 2) return null;

  return {
    kind: 'measure',
    generated: true,
    prompt: String(generated.prompt).slice(0, 120),
    hint: String(generated.hint ?? '').slice(0, 100),
    choices: options,
  };
}

// ── The entity step ─────────────────────────────────────────────────────────
// "reliance" matches seven listed companies — Industries, Power, Infrastructure,
// Communications and more. Resolution picks one of them and says nothing, which
// is a silent wrong answer whenever the user meant a different one. Asking is
// cheap; being confidently wrong about which company is not.

/** True when the reference names exactly one of these candidates outright. */
function namedExactly(candidates, reference) {
  const needle = String(reference).trim().toLowerCase();
  return candidates.filter(name => String(name).trim().toLowerCase() === needle).length === 1;
}

/**
 * Which company did they mean? Null when there is only one, or when the
 * reference already names one exactly — asking then is noise.
 */
export async function entityClarification(data, reference, { limit = 10 } = {}) {
  if (typeof data?.search !== 'function' || !reference) return null;
  let hits;
  try {
    const found = await data.search({ query: reference, kinds: ['company'], limit });
    hits = Array.isArray(found?.data) ? found.data : [];
  } catch { return null; }

  const seen = new Set();
  const choices = hits
    .filter(hit => !hit.kind || hit.kind === 'company')
    .map(hit => ({
      name: hit.common_name || hit.legal_name || hit.company_name || hit.title || hit.name,
      subtitle: hit.symbol || hit.ticker || hit.sector || '',
    }))
    .filter(choice => choice.name && !seen.has(choice.name) && seen.add(choice.name));

  if (choices.length < 2) return null;
  if (namedExactly(choices.map(choice => choice.name), reference)) return null;

  return {
    kind: 'entity',
    reference,
    prompt: `Which "${reference}" did you mean?`,
    hint: `${choices.length} listed companies match. Marked will not pick one for you.`,
    choices: choices.slice(0, 12),
  };
}

/**
 * The next question worth asking, in order: who, then what. Returns null when
 * the request is specific enough to run.
 */
export async function nextClarification(data, agent, question, plan, { cwd, catalogue = null } = {}) {
  if (!plan || plan.subject !== 'company') return null;

  const entity = await entityClarification(data, plan.references[0]);
  if (entity) return entity;

  const [fallback] = planClarifications(plan);
  if (!fallback) return null;
  const generated = await generateClarification(agent, question, plan, { cwd, catalogue }).catch(() => null);
  return generated ?? fallback;
}
