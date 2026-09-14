/**
 * Schema for the "analyst" panel.
 *
 * Component: analystBar({ ratings: {buy, hold, sell}, priceTarget: {current, low, median, high}, width })
 *
 * Coercion: flat {buy, hold, sell, target} → nested {ratings, priceTarget}
 */
export const schema = {
  type: 'object',
  required: [],
  defaults: {},
  coerce: {},
  validate(data) {
    // Flat buy/hold/sell → nested ratings (handles partial presence)
    if (!data.ratings && (data.buy != null || data.hold != null || data.sell != null)) {
      data.ratings = {
        buy: Number(data.buy) || 0,
        hold: Number(data.hold) || 0,
        sell: Number(data.sell) || 0,
      };
    }
    // Flat target → nested priceTarget
    if (!data.priceTarget && data.target != null) {
      const t = Number(data.target);
      data.priceTarget = {
        current: data.current != null ? Number(data.current) : 0,
        low: data.low != null ? Number(data.low) : t * 0.7,
        median: t,
        high: data.high != null ? Number(data.high) : t * 1.3,
      };
    }
    return data;
  },
  shape: 'object with { ratings: {buy, hold, sell}, priceTarget: {current, low, median, high} }',
  dataSources: ['marked.metrics', 'marked.filings'],
};
