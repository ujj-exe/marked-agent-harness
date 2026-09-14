/**
 * Schema for treeMap panel.
 *
 * Expected shape: { items: [{label, weight, value?, color?}] }
 * Optional: height (number, default 10)
 */
export const schema = {
  required: ['items'],

  coerce: {
    items: (val, data) => {
      if (!Array.isArray(val)) {
        data.items = [];
        return;
      }
      // Coerce numeric fields (weight, value) on each item
      data.items = val.map(item => {
        if (typeof item !== 'object' || item === null) return item;
        const out = { ...item };
        if (typeof out.weight === 'string') out.weight = Number(out.weight);
        if (typeof out.value  === 'string') out.value  = Number(out.value);
        return out;
      });
    },
    height: (val, data) => {
      data.height = Number(val) || 10;
    },
  },

  defaults: {
    height: 10,
  },
  dataSources: ['marked.metrics', 'marked.shareholding'],
};
