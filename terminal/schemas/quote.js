/**
 * Schema for the "quote" panel.
 *
 * Component: quoteHeader({ ticker, name, price, changePct, volume, marketCap, variant, width })
 */
export const schema = {
  type: 'object',
  required: ['ticker'],
  defaults: {
    variant: 'full',
    changePct: 0,
    volume: 0,
    marketCap: 0,
  },
  coerce: {
    // symbol → ticker migration
    symbol: (val, data) => {
      if (!data.ticker) data.ticker = val;
    },
  },
  shape: 'object with { ticker }',
  dataSources: ['marked.prices'],
};
