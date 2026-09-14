/**
 * Schema for the "filings" panel.
 *
 * Component: filingTimeline({ filings, width })
 *
 * Expected shape: { filings: Array<{date, form, description}> }
 */
export const schema = {
  type: 'object',
  required: [],
  defaults: {},
  coerce: {},
  validate(data) {
    const warnings = [];

    data.filings = data.filings ?? [];

    if (!Array.isArray(data.filings) || data.filings.length === 0) {
      warnings.push('⚠ filings missing or empty');
    }

    // Coerce each filing entry — ensure strings
    if (Array.isArray(data.filings)) {
      data.filings = data.filings.map(f => {
        const out = { ...f };
        if (out.form        != null) out.form        = String(out.form);
        if (out.description != null) out.description = String(out.description);
        return out;
      });
    }

    if (warnings.length > 0) return { data, warnings };
    return data;
  },
  shape: 'object with { filings: [{date, form, description}] }',
  dataSources: ['marked.filings', 'marked.events'],
};
