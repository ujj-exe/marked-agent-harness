/**
 * Schema for correlationMatrix panel.
 *
 * Expected shape: { tickers: string[], matrix: number[][] }
 * Optional: title (string)
 */
export const schema = {
  required: ['tickers', 'matrix'],

  coerce: {
    tickers: (val, data) => {
      if (typeof val === 'string') data.tickers = val.split(',').map(s => s.trim());
    },
    // Coerce matrix: ensure it's an array of arrays with numeric values
    matrix: (val, data) => {
      if (!Array.isArray(val)) {
        data.matrix = [];
        return;
      }
      data.matrix = val.map(row => {
        if (!Array.isArray(row)) return [];
        return row.map(v => (typeof v === 'string' ? Number(v) : v));
      });
    },
  },

  defaults: {
    title: 'CORRELATION MATRIX',
  },
  dataSources: [],
};
