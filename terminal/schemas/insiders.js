/**
 * Schema for the "insiders" panel.
 *
 * Component: insiderTimeline({ transactions, width })
 *
 * Expected shape: { transactions: Array<{date, name, type, shares, amount}> }
 */
export const schema = {
  type: 'object',
  required: [],
  defaults: {},
  coerce: {},
  validate(data) {
    const warnings = [];

    // Normalize top-level array → { transactions }
    if (Array.isArray(data.transactions)) {
      // already correct shape
    } else if (Array.isArray(data)) {
      data = { transactions: data };
    } else {
      data.transactions = data.transactions ?? [];
    }

    if (!Array.isArray(data.transactions) || data.transactions.length === 0) {
      warnings.push('⚠ transactions missing or empty');
    }

    // Coerce numeric fields on each transaction
    if (Array.isArray(data.transactions)) {
      data.transactions = data.transactions.map(tx => {
        const out = { ...tx };
        if (typeof out.shares === 'string') out.shares = Number(out.shares);
        if (typeof out.amount === 'string') out.amount = Number(out.amount);
        if (typeof out.value  === 'string') out.value  = Number(out.value);
        return out;
      });
    }

    if (warnings.length > 0) return { data, warnings };
    return data;
  },
  shape: 'object with { transactions: [{date, name, type, shares, amount}] }',
  dataSources: ['marked.filings', 'marked.events'],
};
