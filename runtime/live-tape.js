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

export function liveTapeBlock(rows) {
  return {
    table: {
      headers: ['LIVE TAPE', 'Price', 'Change', 'Status', 'As of'],
      rows: rows.map(row => ({ cells: [
        row.symbol,
        row.error ? '—' : formatNumber(row.price),
        row.error ? '—' : formatChange(row.change_percent),
        row.error ? 'unavailable' : `${row.is_stale ? 'STALE · ' : ''}${row.market_status || '—'}`,
        row.error ? row.error : formatTime(row.as_of),
      ] })),
    },
    id: 'live-tape',
  };
}

function formatNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number.toLocaleString('en-IN', { maximumFractionDigits: 2 }) : '—';
}

function formatChange(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return '—';
  return `${number > 0 ? '+' : ''}${number.toFixed(2)}%`;
}

function formatTime(value) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}
