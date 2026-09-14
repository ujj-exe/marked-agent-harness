/**
 * Schema for the "technical" panel.
 *
 * Renders RSI gauge, MACD, trend, support/resistance, signal, gauges, and signals.
 */
export const schema = {
  type: 'object',
  required: [],
  defaults: {
    signals: [],
    gauges: [],
  },
  coerce: {
    // Ensure signals is always an array
    signals: (val, data) => {
      if (typeof val === 'string') data.signals = [val];
      else if (!Array.isArray(val)) data.signals = [];
    },
    // Ensure gauges is always an array
    gauges: (val, data) => {
      if (!Array.isArray(val)) data.gauges = [];
    },
    // Coerce numeric fields
    rsi: (val, data) => {
      if (typeof val === 'string') {
        const n = Number(val);
        if (!isNaN(n)) data.rsi = n;
      }
    },
    macd: (val, data) => {
      if (typeof val === 'string') {
        const n = Number(val);
        if (!isNaN(n)) data.macd = n;
      }
    },
    // Normalize confidence to 0-1 scale. Some sources provide 0-100.
    confidence: (val, data) => {
      if (val != null) {
        const n = Number(val);
        if (!isNaN(n) && n > 1) data.confidence = n / 100;
      }
    },
  },
  shape: 'object with optional { rsi, macd, trend, signals, gauges }',
  dataSources: ['marked.prices'],
};
