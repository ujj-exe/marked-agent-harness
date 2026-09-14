/**
 * Schema validation + coercion layer.
 *
 * validate(panelName, data) → coerced data | { data, warnings } | null
 *
 * Three return paths:
 *   null                  → shape completely wrong (hard reject)
 *   { data, warnings }    → warn gates fired (soft — still renders)
 *   plain object          → clean pass
 *
 * Loads per-panel schema, runs coercion (type fixing, field renaming, defaults).
 * Logs coercion events to stderr for debugging.
 */

// ── Schema registry ─────────────────────────────────────────────────────────
// Static imports for all known schemas — synchronous, no async overhead in hot path.
import { logSchemaCoercion, logSchemaMissing, logSchemaWarnings } from '../debugLog.js';
import { schema as quoteSchema } from './quote.js';
import { schema as chartSchema } from './chart.js';
import { schema as technicalSchema } from './technical.js';
import { schema as rsiSchema } from './rsi.js';
import { schema as analystSchema } from './analyst.js';
import { schema as macroSchema } from './macro.js';
import { schema as newsSchema } from './news.js';
import { schema as verdictSchema } from './verdict.js';
import { schema as gaugeSchema } from './gauge.js';
import { schema as gaugesSchema } from './gauges.js';
import { schema as correlationMatrixSchema } from './correlationMatrix.js';
import { schema as treeMapSchema } from './treeMap.js';
import { schema as flowSankeySchema } from './flowSankey.js';
import { schema as insidersSchema } from './insiders.js';
import { schema as earningsSchema } from './earnings.js';
import { schema as holdersSchema } from './holders.js';
import { schema as filingsSchema } from './filings.js';
import { schema as heatmapSchema } from './heatmap.js';
import { schema as candlestickSchema } from './candlestick.js';
import { schema as waterfallSchema } from './waterfall.js';

const schemas = {
  quote: quoteSchema,
  chart: chartSchema,
  technical: technicalSchema,
  rsi: rsiSchema,
  analyst: analystSchema,
  macro: macroSchema,
  news: newsSchema,
  verdict: verdictSchema,
  gauge: gaugeSchema,
  gauges: gaugesSchema,
  correlationMatrix: correlationMatrixSchema,
  treeMap: treeMapSchema,
  flowSankey: flowSankeySchema,
  insiders: insidersSchema,
  earnings: earningsSchema,
  holders: holdersSchema,
  filings: filingsSchema,
  heatmap: heatmapSchema,
  candlestick: candlestickSchema,
  waterfall: waterfallSchema,
};

// ── Logging ─────────────────────────────────────────────────────────────────

function logCoercion(panelName, field, fromType, toType) {
  try {
    process.stderr.write(`[schema] ${panelName}: coerced ${field} from ${fromType} to ${toType}\n`);
  } catch {
    // stderr not available (e.g. in tests) — ignore
  }
}

// ── Validate ────────────────────────────────────────────────────────────────

/**
 * Validate and coerce panel data against its schema.
 *
 * @param {string} name - Panel name (e.g. 'quote', 'chart')
 * @param {*} data - Raw data from agent POST
 * @returns {Object|null|{data: Object, warnings: string[]}}
 *   - null if shape is completely wrong (hard reject)
 *   - { data, warnings } if warn gates fire (soft warn, still renders)
 *   - plain coerced data object if everything passes
 */
export function validate(name, data) {
  // Completely wrong shape: data must be a non-null object
  if (data == null || typeof data !== 'object' || Array.isArray(data)) {
    return null;
  }

  const schema = schemas[name];
  if (!schema) {
    // Unknown panel type — pass through without validation
    return data;
  }

  // Work on a shallow copy to avoid mutating the original
  const result = { ...data };

  // ── Global defaults — applied before per-schema rules ──────────
  // Only applies when the schema does not define its own default for the field.
  if (result.variant === undefined && !schema.defaults?.hasOwnProperty('variant')) {
    result.variant = 'dense';
  }

  // ── Run coercions ───────────────────────────────────────────────
  if (schema.coerce) {
    for (const [field, coerceFn] of Object.entries(schema.coerce)) {
      if (field in result) {
        const before = result[field];
        const beforeType = typeof before;
        try {
          coerceFn(before, result);
        } catch (err) {
          // Coerce failed — keep the original value, log and continue
          logCoercion(name, field, beforeType, `ERROR: ${err.message}`);
          logSchemaCoercion(name, field, beforeType, `ERROR: ${err.message}`);
          continue;
        }
        const after = result[field];
        if (after !== before && typeof after !== beforeType) {
          logCoercion(name, field, beforeType, typeof after);
          logSchemaCoercion(name, field, beforeType, typeof after);
        }
      }
    }
  }

  // ── Apply defaults for missing fields ─────────────────────────
  if (schema.defaults) {
    for (const [field, defaultVal] of Object.entries(schema.defaults)) {
      if (result[field] == null) {
        result[field] = defaultVal;
      }
    }
  }

  // ── Post-coerce hook (runs after coercions + defaults) ─────────
  if (typeof schema.postCoerce === 'function') {
    schema.postCoerce(result);
  }

  // ── Check required fields ─────────────────────────────────────
  if (schema.required?.length) {
    for (const field of schema.required) {
      if (result[field] == null) {
        logCoercion(name, field, 'undefined', 'required');
        logSchemaMissing(name, field);
        return null;
      }
    }
  }

  // ── Custom validate function ──────────────────────────────────
  if (typeof schema.validate === 'function') {
    return schema.validate(result);
  }

  // ── Warn gates (soft validation — never hard-blocks render) ───
  if (!result.suppressWarnings && schema.warn?.length && schema.warnValidators) {
    const warnings = [];
    for (const field of schema.warn) {
      const validator = schema.warnValidators[field];
      if (validator && !validator(result[field])) {
        const msg = schema.warnMessages?.[field] ?? `⚠ ${field} missing`;
        warnings.push(msg);
      }
    }
    if (warnings.length > 0) {
      logSchemaWarnings(name, warnings);
      return { data: result, warnings };
    }
  }

  return result;
}

/**
 * Get warnings for a panel without full validate() flow.
 * Future use: for panels that want to check warnings on already-coerced data,
 * e.g. when building generic warn-gate rendering for all panel types.
 *
 * @param {string} name - Panel name
 * @param {Object} data - Already-coerced data
 * @returns {string[]} Array of warning message strings (empty if none)
 */
export function getWarnings(name, data) {
  const schema = schemas[name];
  if (data?.suppressWarnings || !schema?.warn?.length || !schema.warnValidators) return [];

  const warnings = [];
  for (const field of schema.warn) {
    const validator = schema.warnValidators[field];
    if (validator && !validator(data[field])) {
      const msg = schema.warnMessages?.[field] ?? `⚠ ${field} missing`;
      warnings.push(msg);
    }
  }
  return warnings;
}
