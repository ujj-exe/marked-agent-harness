/**
 * cost.js — estimate session cost from tool call count.
 *
 * Rough model: each data call costs ~$0.005-0.01 in worker context
 * (input tokens for tool schema + output tokens for response).
 * The LLM generation itself is the bulk — ~$0.03-0.05 per analysis.
 */

// Cost per tool call (rough estimate including input/output tokens)
const COST_PER_TOOL = 0.008;
// Base LLM cost for the analysis generation
const BASE_LLM_COST = 0.04;

/**
 * Estimate session cost from tool call count.
 * @param {number} toolsCalled - Number of Marked data calls made
 * @returns {string} Formatted cost string like "~$0.12"
 */
export function estimateCost(toolsCalled = 0) {
  const cost = BASE_LLM_COST + (toolsCalled * COST_PER_TOOL);
  return `~$${cost.toFixed(2)}`;
}
