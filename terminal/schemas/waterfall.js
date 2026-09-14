/**
 * Schema for the "waterfall" panel.
 *
 * Component: waterfallChart({ items, width, showDelta })
 *
 * Expected shape: { items: Array<{label, value, previous?}> }
 */
export const schema = {
  type: 'object',
  required: [],
  defaults: {},
  coerce: {},
  validate(data) {
    const warnings = [];

    data.items = data.items ?? [];

    if (!Array.isArray(data.items) || data.items.length === 0) {
      warnings.push('⚠ items missing or empty');
    }

    // Coerce numeric fields on each item
    if (Array.isArray(data.items)) {
      data.items = data.items.map(item => {
        const out = { ...item };
        if (typeof out.value    === 'string') out.value    = Number(out.value);
        if (typeof out.previous === 'string') out.previous = Number(out.previous);
        return out;
      });
    }

    if (warnings.length > 0) return { data, warnings };
    return data;
  },
  shape: 'object with { items: [{label, value, previous?}] }',
  dataSources: ['marked.financials'],
};
