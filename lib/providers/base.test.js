import { describe, it, expect } from 'vitest';
import { normalizeHoldings, normalizeBalances, buildPortfolio } from './base.js';

// ---------------------------------------------------------------------------
// normalizeHoldings
// ---------------------------------------------------------------------------

describe('normalizeHoldings', () => {
  it('ibkr — maps raw IBKR position to unified shape', () => {
    const raw = [{
      contractDesc: 'AAPL',
      fullName: 'Apple Inc',
      position: 100,
      mktPrice: 175.50,
      mktValue: 17550,
      avgCost: 150.00,
      avgPrice: 150.00,
      unrealizedPnl: 2550,
      realizedPnl: 0,
      currency: 'USD',
      assetClass: 'STK',
      conid: '265598',
    }];
    const [h] = normalizeHoldings(raw, 'ibkr', 'U1234567');

    expect(h.accountId).toBe('U1234567');
    expect(h.broker).toBe('ibkr');
    expect(h.symbol).toBe('AAPL');
    expect(h.name).toBe('Apple Inc');
    expect(h.quantity).toBe(100);
    expect(h.avgCost).toBe(150.00);
    expect(h.currentPrice).toBe(175.50);
    expect(h.marketValue).toBe(17550);
    expect(h.unrealizedPnl).toBe(2550);
    expect(typeof h.unrealizedPnlPct).toBe('number');
    expect(h.realizedPnl).toBe(0);
    expect(h.currency).toBe('USD');
    expect(h.assetClass).toBe('equity');
    expect(h._raw).toBe(raw[0]);
  });

  it('moomoo — maps raw Moomoo position to unified shape', () => {
    const raw = [{
      code: '00700',
      name: 'Tencent Holdings',
      qty: 200,
      costPrice: 300.00,
      price: 350.00,
      val: 70000,
      plVal: 10000,
      plRatio: 0.1667,   // 16.67% as decimal
      currency: 1,       // 1 = HKD (numeric enum)
    }];
    const [h] = normalizeHoldings(raw, 'moomoo', 'moo-acct-1');

    expect(h.accountId).toBe('moo-acct-1');
    expect(h.broker).toBe('moomoo');
    expect(h.symbol).toBe('00700');
    expect(h.name).toBe('Tencent Holdings');
    expect(h.quantity).toBe(200);
    expect(h.avgCost).toBe(300.00);
    expect(h.currentPrice).toBe(350.00);
    expect(h.marketValue).toBe(70000);
    expect(h.unrealizedPnl).toBe(10000);
    expect(h.unrealizedPnlPct).toBeCloseTo(16.67, 1);
    expect(h.currency).toBe('HKD');  // mapMoomooCurrency(1)
    expect(h._raw).toBe(raw[0]);
  });

  it('unknown broker — throws an error', () => {
    expect(() => normalizeHoldings([{}], 'unknown', 'acct-1')).toThrow('Unknown broker');
  });

});

// ---------------------------------------------------------------------------
// normalizeBalances
// ---------------------------------------------------------------------------

describe('normalizeBalances', () => {
  it('ibkr — maps nested {amount, currency} summary to flat output', () => {
    const summary = {
      netliquidation: { amount: 100000, currency: 'USD' },
      totalcashvalue: { amount: 20000, currency: 'USD' },
      grosspositionvalue: { amount: 80000, currency: 'USD' },
      buyingpower: { amount: 40000, currency: 'USD' },
      unrealizedpnl: { amount: 5000, currency: 'USD' },
      realizedpnl: { amount: 1000, currency: 'USD' },
      initmarginreq: { amount: 10000, currency: 'USD' },
      accountcode: { currency: 'USD' },
    };
    const bal = normalizeBalances(summary, 'ibkr', 'U1234567');

    expect(bal.accountId).toBe('U1234567');
    expect(bal.broker).toBe('ibkr');
    expect(bal.equity).toBe(100000);
    expect(bal.cash).toBe(20000);
    expect(bal.marketValue).toBe(80000);
    expect(bal.buyingPower).toBe(40000);
    expect(bal.unrealizedPnl).toBe(5000);
    expect(bal.realizedPnl).toBe(1000);
    expect(bal.marginUsed).toBe(10000);
    expect(bal.currency).toBe('USD');
  });

  it('moomoo — maps funds object to unified shape', () => {
    const funds = {
      totalAssets: 85000,
      cash: 15000,
      marketVal: 70000,
      power: 30000,
      unrealizedPl: 8000,
      realizedPl: 2000,
      initialMargin: 5000,
      currency: 2,  // 2 = USD
    };
    const bal = normalizeBalances(funds, 'moomoo', 'moo-1');

    expect(bal.accountId).toBe('moo-1');
    expect(bal.broker).toBe('moomoo');
    expect(bal.equity).toBe(85000);
    expect(bal.cash).toBe(15000);
    expect(bal.marketValue).toBe(70000);
    expect(bal.buyingPower).toBe(30000);
    expect(bal.unrealizedPnl).toBe(8000);
    expect(bal.realizedPnl).toBe(2000);
    expect(bal.marginUsed).toBe(5000);
    expect(bal.currency).toBe('USD');
  });

});

// ---------------------------------------------------------------------------
// buildPortfolio
// ---------------------------------------------------------------------------

describe('buildPortfolio', () => {
  it('empty results — returns zeroed-out portfolio', () => {
    const p = buildPortfolio([]);
    expect(p.holdings).toEqual([]);
    expect(p.totals.equity).toBe(0);
    expect(p.totals.cash).toBe(0);
    expect(p.totals.marketValue).toBe(0);
    expect(p.accounts).toEqual([]);
    expect(p._brokers).toEqual([]);
  });

  it('single account — weights sum to ~100% and totals are correct', () => {
    const result = {
      holdings: [
        { accountId: 'acct1', broker: 'ibkr', symbol: 'AAPL', marketValue: 60000, assetClass: 'equity' },
        { accountId: 'acct1', broker: 'ibkr', symbol: 'MSFT', marketValue: 40000, assetClass: 'equity' },
      ],
      balances: { accountId: 'acct1', broker: 'ibkr', equity: 100000, cash: 5000, marketValue: 100000, unrealizedPnl: 8000, realizedPnl: 1000 },
    };
    const p = buildPortfolio([result]);

    const totalWeight = p.holdings.reduce((sum, h) => sum + h.weight, 0);
    expect(totalWeight).toBeCloseTo(100, 1);
    expect(p.totals.equity).toBe(100000);
    expect(p.totals.cash).toBe(5000);
    expect(p.accounts).toHaveLength(1);
    expect(p._brokers).toEqual(['ibkr']);
  });

  it('multi-account — combines totals and _brokers contains both brokers', () => {
    const r1 = {
      holdings: [{ accountId: 'a1', broker: 'ibkr', symbol: 'AAPL', marketValue: 50000, assetClass: 'equity' }],
      balances: { accountId: 'a1', broker: 'ibkr', equity: 50000, cash: 5000, marketValue: 50000, unrealizedPnl: 3000, realizedPnl: 0 },
    };
    const r2 = {
      holdings: [{ accountId: 'a2', broker: 'moomoo', symbol: 'BABA', marketValue: 30000, assetClass: 'equity' }],
      balances: { accountId: 'a2', broker: 'moomoo', equity: 30000, cash: 2000, marketValue: 30000, unrealizedPnl: 1500, realizedPnl: 0 },
    };
    const p = buildPortfolio([r1, r2]);

    expect(p.totals.equity).toBe(80000);
    expect(p.totals.cash).toBe(7000);
    expect(p.holdings).toHaveLength(2);
    expect(p._brokers).toContain('ibkr');
    expect(p._brokers).toContain('moomoo');
    expect(p._brokers).toHaveLength(2);
  });

  it('HHI math — single holding is 1.0000, four equal holdings is 0.25', () => {
    // Single holding = 100% concentration → HHI = 1.0
    const single = {
      holdings: [{ accountId: 'a', broker: 'ibkr', symbol: 'AAPL', marketValue: 100000, assetClass: 'equity' }],
      balances: { accountId: 'a', broker: 'ibkr', equity: 100000, cash: 0, marketValue: 100000, unrealizedPnl: 0, realizedPnl: 0 },
    };
    const p1 = buildPortfolio([single]);
    expect(p1.concentration.hhi).toBe(1.0);

    // Four equal holdings → each weight = 25% → HHI = 4 × (0.25)² = 0.25
    const equal = {
      holdings: [
        { accountId: 'a', broker: 'ibkr', symbol: 'A', marketValue: 25000, assetClass: 'equity' },
        { accountId: 'a', broker: 'ibkr', symbol: 'B', marketValue: 25000, assetClass: 'equity' },
        { accountId: 'a', broker: 'ibkr', symbol: 'C', marketValue: 25000, assetClass: 'equity' },
        { accountId: 'a', broker: 'ibkr', symbol: 'D', marketValue: 25000, assetClass: 'equity' },
      ],
      balances: { accountId: 'a', broker: 'ibkr', equity: 100000, cash: 0, marketValue: 100000, unrealizedPnl: 0, realizedPnl: 0 },
    };
    const p2 = buildPortfolio([equal]);
    expect(p2.concentration.hhi).toBe(0.25);
  });

  it('zero equity guard — weights and unrealizedPnlPct are 0, not NaN/Infinity', () => {
    const result = {
      holdings: [
        { accountId: 'a', broker: 'ibkr', symbol: 'AAPL', marketValue: 0, assetClass: 'equity' },
      ],
      balances: { accountId: 'a', broker: 'ibkr', equity: 0, cash: 0, marketValue: 0, unrealizedPnl: 0, realizedPnl: 0 },
    };
    const p = buildPortfolio([result]);

    for (const h of p.holdings) {
      expect(Number.isNaN(h.weight)).toBe(false);
      expect(Number.isFinite(h.weight) || h.weight === 0).toBe(true);
      expect(h.weight).toBe(0);
    }
    expect(p.totals.unrealizedPnlPct).toBe(0);
  });
});
