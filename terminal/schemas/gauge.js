/**
 * Schema for the "gauge" panel (single gauge bar).
 *
 * Component: gaugeBar({ value, label, preset, width, showValue, showLabel })
 */
export const schema = {
  type: 'object',
  required: ['value'],
  defaults: {
    showValue: true,
    showLabel: true,
  },
  coerce: {
    // Coerce value from string to number
    value: (val, data) => {
      if (typeof val === 'string') {
        const n = Number(val);
        if (!isNaN(n)) data.value = n;
      }
    },
  },
  shape: 'object with { value: number }',
  dataSources: ['india-macro-provider'],
};
