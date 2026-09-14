/**
 * Schema for the "macro" panel.
 *
 * Component: macroDashboard({ pillars: [{label, value, direction, indicators}], width, title })
 *
 * Agents often send { pillar, state, direction } (per SKILL.md).
 * Coercion normalizes to { label, value, stateLabel, direction }.
 */

// Map common state strings to a 0-100 gauge value
const STATE_MAP = {
  sticky:       65,
  hot:          80,
  accelerating: 75,
  rising:       70,
  elevated:     60,
  resilient:    55,
  stable:       50,
  mixed:        50,
  neutral:      50,
  normalizing:  45,
  cooling:      40,
  slowing:      35,
  weakening:    30,
  contracting:  20,
  restrictive:  70,
  tight:        65,
  tightening:   60,
  loose:        30,
  easing:       35,
};

function stateToValue(state) {
  if (state == null) return null;
  const raw = String(state).toLowerCase().trim();
  // Extract first word — agent may send "STICKY (CPI 3.1%)" or "SLOWING (GDP 0.4%)"
  const firstWord = raw.split(/[\s(]/)[0];
  return STATE_MAP[firstWord] ?? STATE_MAP[raw] ?? 50;
}

export const schema = {
  type: 'object',
  required: ['pillars'],
  defaults: {},
  coerce: {
    pillars: (val, data) => {
      if (Array.isArray(val)) {
        data.pillars = val.map(item => {
          if (typeof item === 'string') {
            return { label: item, value: 0, direction: '' };
          }
          const out = { ...item };
          // pillar → label
          if (out.pillar && !out.label) {
            out.label = out.pillar;
            delete out.pillar;
          }
          // state → stateLabel + numeric value
          if (out.state != null) {
            const stateStr = String(out.state);
            // Extract clean label: first word only (e.g., "STICKY" from "STICKY (CPI 3.1%)")
            out.stateLabel = stateStr.split(/\s*\(/)[0].toUpperCase();
            // Derive gauge value from state; override agent's value if it's 0 or missing
            const derived = stateToValue(stateStr);
            if (out.value == null || out.value === 0) out.value = derived;
            delete out.state;
          }
          return out;
        });
      }
    },
  },
  validate: (data) => {
    if (!Array.isArray(data.pillars) || data.pillars.length === 0) return null;
    return data;
  },
  shape: 'object with { pillars: [{label, value, direction}] }',
  dataSources: ['india-macro-provider', 'marked.events'],
};
