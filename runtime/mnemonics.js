/**
 * mnemonics.js — the fast half of the command line.
 *
 * A question goes to the planner and then to a reasoning provider, which costs
 * a minute and a model call. But `RELIANCE` is not a question: it is a request
 * for a company's current state, and the answer is entirely in Marked's own
 * data. These forms skip the provider completely and render the retrieved
 * panels as the answer.
 *
 * The vocabulary is deliberately Bloomberg's, because the people who want a
 * two-letter command already know that one: DES, FA, OWN, CACS, ANR, GP.
 *
 * Anything not matched here returns null and takes the normal route. That is
 * the important property — this is a shortcut, never a gate.
 */

/** Mnemonic → the retrieval emphasis runCompany already understands. */
const MNEMONICS = new Map([
  ['des',  { route: 'factual_lookup', label: 'profile' }],
  ['fa',   { route: 'factual_lookup', label: 'financials' }],
  ['gp',   { route: 'factual_lookup', label: 'price' }],
  ['own',  { route: 'factual_lookup', label: 'ownership' }],
  ['hds',  { route: 'factual_lookup', label: 'ownership' }],
  ['anr',  { route: 'filing_research', label: 'announcements' }],
  ['cacs', { route: 'event_research',  label: 'corporate actions' }],
  ['cn',   { route: 'event_research',  label: 'events' }],
]);

// A ticker or a short name: one token, no sentence punctuation. Length is
// capped so a long word is treated as prose, and `?` anywhere means a question.
const REFERENCE = /^[A-Za-z][A-Za-z0-9&.:_-]{1,19}$/;

// Words that are one token and look like a ticker but are plainly a question
// or a command, so they must never be read as a company.
const NOT_A_REFERENCE = new Set(['help', 'quit', 'exit', 'new', 'model', 'history', 'reset', 'why', 'how', 'what', 'who', 'when']);

/**
 * @returns {{ mnemonic: string|null, reference: string, route: string, label: string }|null}
 */
export function parseMnemonic(input) {
  const text = String(input ?? '').trim();
  if (!text || text.startsWith('/') || text.includes('?')) return null;

  const parts = text.split(/\s+/);
  if (parts.length > 2) return null;

  if (parts.length === 2) {
    const entry = MNEMONICS.get(parts[0].toLowerCase());
    if (!entry || !REFERENCE.test(parts[1])) return null;
    return { mnemonic: parts[0].toLowerCase(), reference: parts[1], ...entry };
  }

  // A lone token is a company only when it could not be a word someone typed
  // meaning something else.
  const token = parts[0];
  if (!REFERENCE.test(token) || NOT_A_REFERENCE.has(token.toLowerCase())) return null;
  // Require either an explicit ticker shape (all caps) or a capitalised name.
  if (!/^[A-Z][A-Z0-9&.:_-]*$/.test(token) && !/^[A-Z][a-z]/.test(token)) return null;
  return { mnemonic: null, reference: token, route: 'factual_lookup', label: 'profile' };
}
