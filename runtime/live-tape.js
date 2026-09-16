const DEFAULT_EXCHANGE = 'NSE';

export async function fetchLiveTape(data, symbols) {
  const rows = await Promise.all(symbols.map(async symbol => {
    try {
      const response = await data.quote({ symbol, exchange: DEFAULT_EXCHANGE });
      return { symbol, ...(response.data ?? response), error: null };
    } catch (error) {
      return { symbol, error: error.message || 'quote unavailable' };
    }
  }));
  return rows;
}

export const liveTapePayload = rows => ({ liveTape: rows });
