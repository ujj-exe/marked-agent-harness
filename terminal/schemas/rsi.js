/**
 * Schema for the "rsi" panel.
 *
 * Component: gaugeBar({ value, label, preset, width })
 */
export const schema = {
  type: 'object',
  required: ['value'],
  defaults: {
    signals: [],
  },
  coerce: {
    // Coerce value from string to number
    value: (val, data) => {
      if (typeof val === 'string') {
        const n = Number(val);
        if (!isNaN(n)) data.value = n;
      }
    },
    // Ensure signals is an array
    signals: (val, data) => {
      if (typeof val === 'string') data.signals = [val];
      else if (!Array.isArray(val)) data.signals = [];
    },
  },
  shape: 'object with { value: number }',
  dataSources: ['marked.prices'],
};
