/**
 * Schema for the "earnings" panel.
 *
 * Component: earningsSurprise({ quarters, width, showConnector })
 *
 * Expected shape: { quarters: Array<{date, actual, estimate, surprise}> }
 */
export const schema = {
  type: 'object',
  required: [],
  defaults: {},
  coerce: {},
  validate(data) {
    const warnings = [];

    data.quarters = data.quarters ?? [];

    if (!Array.isArray(data.quarters) || data.quarters.length === 0) {
      warnings.push('⚠ quarters missing or empty');
    }

    // Coerce numeric fields on each quarter record
    if (Array.isArray(data.quarters)) {
      data.quarters = data.quarters.map(q => {
        const out = { ...q };
        if (typeof out.actual   === 'string') out.actual   = Number(out.actual);
        if (typeof out.estimate === 'string') out.estimate = Number(out.estimate);
        if (typeof out.surprise === 'string') out.surprise = Number(out.surprise);
        // Normalize period → date alias
        if (!out.date && out.period) out.date = out.period;
        return out;
      });
    }

    if (warnings.length > 0) return { data, warnings };
    return data;
  },
  shape: 'object with { quarters: [{date, actual, estimate, surprise}] }',
  dataSources: ['marked.financials', 'marked.filings'],
};
