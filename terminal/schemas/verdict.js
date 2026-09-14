/**
 * Schema for the "verdict" panel.
 *
 * Component: verdict({ thesis, conviction, catalysts, risks, levels, timeframe, width })
 *
 * Coercion:
 *   body → thesis migration
 *   signal → conviction migration (BUY→bull, SELL→bear, HOLD→neutral, etc.)
 *
 * Warn gates (v1.1):
 *   thesis, conviction, catalysts, risks, timeframe
 *   Never hard-block render — always show what IS available.
 */

// ── Conviction enum ─────────────────────────────────────────────────────────

export const CONVICTION_VALUES = ['strong_bull', 'bull', 'neutral', 'bear', 'strong_bear'];
export const TIMEFRAME_VALUES = ['days', 'weeks', 'months', 'quarters'];

// ── Signal → Conviction mapping ─────────────────────────────────────────────

const SIGNAL_TO_CONVICTION = {
  'STRONG BUY': 'strong_bull',
  'STRONG_BUY': 'strong_bull',
  'STRONGBUY': 'strong_bull',
  'BUY': 'bull',
  'BULLISH': 'bull',
  'BULL': 'bull',
  'RISK-ON': 'bull',
  'HOLD': 'neutral',
  'NEUTRAL': 'neutral',
  'CAUTIOUS': 'neutral',
  'SELL': 'bear',
  'BEARISH': 'bear',
  'BEAR': 'bear',
  'RISK-OFF': 'bear',
  'STRONG SELL': 'strong_bear',
  'STRONG_SELL': 'strong_bear',
  'STRONGSELL': 'strong_bear',
};

// ── Schema definition ───────────────────────────────────────────────────────

export const schema = {
  type: 'object',
  required: [],
  defaults: {},
  coerce: {
    // body → thesis migration (v1.0 compat)
    body: (val, data) => {
      if (data.body && !data.thesis) data.thesis = data.body;
    },
    // signal → conviction migration (v1.1)
    signal: (val, data) => {
      if (data.signal && !data.conviction) {
        const key = String(data.signal).toUpperCase().trim();
        data.conviction = SIGNAL_TO_CONVICTION[key] || 'neutral';
      }
    },
  },
  // ── Post-coerce hook (runs after all field coercions + defaults) ──────────
  // flat → sections migration (v1.1)
  // If data already has sections[], skip. Otherwise build sections[] from flat fields.
  // Runs after body→thesis and signal→conviction so those are already applied.
  postCoerce: (data) => {
    // sections[] present — extract flat fields for warn gates
    if (data.sections) {
      for (const s of data.sections) {
        if (s.type === 'conviction' && !data.conviction) {
          data.conviction = s.conviction || s.value;
          if (s.timeframe) data.timeframe = s.timeframe;
        }
        if (s.type === 'levels' && s.timeframe && !data.timeframe) data.timeframe = s.timeframe;
        if (s.type === 'thesis' && !data.thesis) data.thesis = s.text;
        if (s.type === 'catalysts' && !data.catalysts) data.catalysts = s.items;
        if (s.type === 'risks' && !data.risks) data.risks = s.items;
      }
      return;
    }

    const sections = [];

    if (data.conviction != null) {
      sections.push({
        type: 'conviction',
        value: data.conviction,
        timeframe: data.timeframe,
      });
    }

    if (data.thesis != null) {
      sections.push({ type: 'thesis', text: data.thesis });
    }

    if (data.catalysts != null) {
      sections.push({ type: 'catalysts', items: data.catalysts });
    }

    if (data.risks != null) {
      sections.push({ type: 'risks', items: data.risks });
    }

    if (data.levels != null) {
      sections.push({
        type: 'levels',
        support: data.levels.support,
        resistance: data.levels.resistance,
      });
    }

    data.sections = sections;
  },

  shape: 'object with { thesis, conviction, catalysts, risks, levels, timeframe }',
  dataSources: [],

  // ── Warn gates (v1.1) ──────────────────────────────────────────────────
  // Fields that SHOULD be present for a complete analysis.
  // Missing → inline ⚠ warning. Never hard-block render.

  warn: ['thesis', 'conviction', 'catalysts', 'risks', 'timeframe'],

  warnValidators: {
    thesis: (val) => typeof val === 'string' && val.length >= 50,
    conviction: (val) => CONVICTION_VALUES.includes(val),
    catalysts: (val) => Array.isArray(val) && val.length >= 1,
    risks: (val) => Array.isArray(val) && val.length >= 1,
    timeframe: (val) => TIMEFRAME_VALUES.includes(val),
  },

  warnMessages: {
    thesis: '⚠ thesis missing — incomplete analysis',
    conviction: '⚠ conviction missing — no directional view',
    catalysts: '⚠ no catalysts specified',
    risks: '⚠ no risks specified',
    timeframe: '⚠ no timeframe specified',
  },
};
