/**
 * Schema for the "holders" panel.
 *
 * Component: holderBar({ holders, width, limit })
 *
 * Expected shape: { holders: Array<{name, shares, percent}> }
 */
export const schema = {
  type: 'object',
  required: [],
  defaults: {},
  coerce: {},
  validate(data) {
    const warnings = [];

    data.holders = data.holders ?? [];

    if (!Array.isArray(data.holders) || data.holders.length === 0) {
      warnings.push('⚠ holders missing or empty');
    }

    // Coerce numeric fields on each holder record
    if (Array.isArray(data.holders)) {
      data.holders = data.holders.map(h => {
        const out = { ...h };
        if (typeof out.shares  === 'string') out.shares  = Number(out.shares);
        if (typeof out.percent === 'string') out.percent = Number(out.percent);
        return out;
      });
    }

    if (warnings.length > 0) return { data, warnings };
    return data;
  },
  shape: 'object with { holders: [{name, shares, percent}] }',
  dataSources: ['marked.shareholding'],
};
