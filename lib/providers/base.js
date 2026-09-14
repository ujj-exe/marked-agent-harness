/**
 * Portfolio provider abstraction.
 * All broker providers extend this class and normalize to the unified data shape.
 */

export class PortfolioProvider {
  constructor(broker, config = {}) {
    this.broker = broker;
    this.config = config;
    this._connected = false;
  }

  async connect() { throw new Error(`${this.broker}: connect() not implemented`); }
  async disconnect() { this._connected = false; }
  isConnected() { return this._connected; }

  /** @returns {Promise<Account[]>} */
  async getAccounts() { throw new Error(`${this.broker}: getAccounts() not implemented`); }

  /** @returns {Promise<Holding[]>} per account, flattened */
  async getPositions() { throw new Error(`${this.broker}: getPositions() not implemented`); }

  /** @returns {Promise<Balances>} */
  async getBalances() { throw new Error(`${this.broker}: getBalances() not implemented`); }
}

// ---------------------------------------------------------------------------
// Unified data shapes
// ---------------------------------------------------------------------------

/**
 * Normalize raw positions from any broker into the unified holding shape.
 *
 * @param {object[]} raw - broker-specific position objects
 * @param {string}   broker - "ibkr" | "moomoo"
 * @param {string}   accountId
 * @returns {Holding[]}
 */
export function normalizeHoldings(raw, broker, accountId) {
  return raw.map(pos => {
    switch (broker) {
      case 'ibkr': return normalizeIbkr(pos, accountId);
      case 'moomoo': return normalizeMoomoo(pos, accountId);
      default: throw new Error(`Unknown broker: ${broker}`);
    }
  });
}

function normalizeIbkr(pos, accountId) {
  return {
    accountId,
    broker: 'ibkr',
    symbol: pos.contractDesc || pos.ticker || '',
    name: pos.fullName || pos.contractDesc || '',
    quantity: pos.position ?? 0,
    avgCost: pos.avgCost ?? pos.avgPrice ?? 0,
    currentPrice: pos.mktPrice ?? 0,
    marketValue: pos.mktValue ?? 0,
    unrealizedPnl: pos.unrealizedPnl ?? 0,
    unrealizedPnlPct: pos.mktPrice != null && pos.avgCost
      ? ((pos.mktPrice - pos.avgCost) / pos.avgCost) * 100
      : 0,
    realizedPnl: pos.realizedPnl ?? 0,
    currency: pos.currency || 'USD',
    assetClass: mapIbkrAssetClass(pos.assetClass),
    conid: pos.conid,
    _raw: pos,
  };
}

function normalizeMoomoo(pos, accountId) {
  return {
    accountId,
    broker: 'moomoo',
    symbol: pos.code || '',
    name: pos.name || '',
    quantity: pos.qty ?? 0,
    avgCost: pos.costPrice ?? 0,
    currentPrice: pos.price ?? 0,
    marketValue: pos.val ?? 0,
    unrealizedPnl: pos.plVal ?? 0,
    unrealizedPnlPct: pos.plRatio ? pos.plRatio * 100 : 0,
    realizedPnl: 0, // not available in position response
    currency: mapMoomooCurrency(pos.currency),
    assetClass: 'equity', // Moomoo positions are primarily equities
    _raw: pos,
  };
}

function mapIbkrAssetClass(cls) {
  const map = { STK: 'equity', OPT: 'option', FUT: 'future', CASH: 'forex', BOND: 'bond' };
  return map[cls] || 'other';
}

function mapMoomooCurrency(code) {
  const map = { 1: 'HKD', 2: 'USD', 3: 'CNH', 4: 'JPY', 5: 'SGD' };
  return map[code] || 'USD';
}

/**
 * Normalize balances from any broker into the unified shape.
 */
export function normalizeBalances(raw, broker, accountId) {
  switch (broker) {
    case 'ibkr': return normalizeIbkrBalances(raw, accountId);
    case 'moomoo': return normalizeMoomooBalances(raw, accountId);
    default: throw new Error(`Unknown broker: ${broker}`);
  }
}

function normalizeIbkrBalances(summary, accountId) {
  const val = (key) => summary[key]?.amount ?? 0;
  return {
    accountId,
    broker: 'ibkr',
    equity: val('netliquidation'),
    cash: val('totalcashvalue'),
    marketValue: val('grosspositionvalue'),
    buyingPower: val('buyingpower'),
    unrealizedPnl: val('unrealizedpnl'),
    realizedPnl: val('realizedpnl'),
    marginUsed: val('initmarginreq'),
    currency: summary.accountcode?.currency || 'USD',
  };
}

function normalizeMoomooBalances(funds, accountId) {
  return {
    accountId,
    broker: 'moomoo',
    equity: funds.totalAssets ?? 0,
    cash: funds.cash ?? 0,
    marketValue: funds.marketVal ?? 0,
    buyingPower: funds.power ?? 0,
    unrealizedPnl: funds.unrealizedPl ?? 0,
    realizedPnl: funds.realizedPl ?? 0,
    marginUsed: funds.initialMargin ?? 0,
    currency: mapMoomooCurrency(funds.currency),
  };
}

/**
 * Build the full portfolio object from multiple provider results.
 *
 * @param {{ holdings: Holding[], balances: object }[]} results - per-account data
 * @returns {Portfolio}
 */
export function buildPortfolio(results) {
  const allHoldings = results.flatMap(r => r.holdings);
  const totalEquity = results.reduce((sum, r) => sum + (r.balances.equity || 0), 0);

  // Compute weights
  const holdings = allHoldings.map(h => ({
    ...h,
    weight: totalEquity > 0 ? (h.marketValue / totalEquity) * 100 : 0,
  }));

  // Aggregate totals
  const totals = {
    equity: totalEquity,
    cash: results.reduce((sum, r) => sum + (r.balances.cash || 0), 0),
    marketValue: results.reduce((sum, r) => sum + (r.balances.marketValue || 0), 0),
    unrealizedPnl: results.reduce((sum, r) => sum + (r.balances.unrealizedPnl || 0), 0),
    realizedPnl: results.reduce((sum, r) => sum + (r.balances.realizedPnl || 0), 0),
    unrealizedPnlPct: totalEquity > 0
      ? (results.reduce((sum, r) => sum + (r.balances.unrealizedPnl || 0), 0) / totalEquity) * 100
      : 0,
  };

  // Allocation by asset class
  const allocationByAssetClass = {};
  for (const h of holdings) {
    allocationByAssetClass[h.assetClass] = (allocationByAssetClass[h.assetClass] || 0) + h.weight;
  }

  // Concentration: HHI index (sum of squared weights)
  const hhi = holdings.reduce((sum, h) => sum + (h.weight / 100) ** 2, 0);
  const top5Weight = holdings
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 5)
    .reduce((sum, h) => sum + h.weight, 0);

  return {
    holdings: holdings.sort((a, b) => b.marketValue - a.marketValue),
    accounts: results.map(r => r.balances),
    totals,
    allocation: { byAssetClass: allocationByAssetClass },
    concentration: { hhi: Math.round(hhi * 10000) / 10000, top5Weight: Math.round(top5Weight * 100) / 100 },
    _fetchedAt: new Date().toISOString(),
    _brokers: [...new Set(results.map(r => r.balances.broker))],
  };
}
