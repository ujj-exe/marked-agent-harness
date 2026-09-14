/**
 * Schema for the "gauges" panel (multiple gauge bars stacked).
 *
 * Component: gaugeStack(items) where items = [{value, label, preset, width}]
 */
export const schema = {
  type: 'object',
  required: ['items'],
  defaults: {},
  coerce: {
    // string[] → [{label, value, direction}]
    items: (val, data) => {
      if (Array.isArray(val)) {
        data.items = val.map(item => {
          if (typeof item === 'string') {
            return { label: item, value: 0, direction: '' };
          }
          return item;
        });
      }
    },
  },
  validate: (data) => {
    if (!Array.isArray(data.items) || data.items.length === 0) return null;
    return data;
  },
  shape: 'object with { items: [{value, label, preset}] }',
  dataSources: ['india-macro-provider'],
};
