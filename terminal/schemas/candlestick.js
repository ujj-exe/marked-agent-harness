/**
 * Schema for the "candlestick" panel.
 *
 * Component: candlestickChart({ bars, width, height, showAxis, label })
 *
 * Expected shape: { bars: Array<{open, high, low, close, volume?}> }
 */
export const schema = {
  type: 'object',
  required: [],
  defaults: {},
  coerce: {},
  validate(data) {
    const warnings = [];

    data.bars = data.bars ?? [];

    if (!Array.isArray(data.bars) || data.bars.length === 0) {
      warnings.push('⚠ bars missing or empty');
    }

    // Coerce OHLCV fields to numbers on each bar
    if (Array.isArray(data.bars)) {
      data.bars = data.bars.map(b => {
        const out = { ...b };
        if (typeof out.open   === 'string') out.open   = Number(out.open);
        if (typeof out.high   === 'string') out.high   = Number(out.high);
        if (typeof out.low    === 'string') out.low    = Number(out.low);
        if (typeof out.close  === 'string') out.close  = Number(out.close);
        if (typeof out.volume === 'string') out.volume = Number(out.volume);
        return out;
      });
    }

    if (warnings.length > 0) return { data, warnings };
    return data;
  },
  shape: 'object with { bars: [{open, high, low, close, volume}] }',
  dataSources: ['marked.prices'],
};
