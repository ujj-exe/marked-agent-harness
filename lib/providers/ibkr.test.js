import { describe, it, expect, vi } from 'vitest';
import { IbkrProvider } from './ibkr.js';

const VALID_XML = `<FlexQueryResponse><FlexStatements><FlexStatement accountId="U1234567"><OpenPositions><OpenPosition symbol="AAPL" description="Apple Inc" position="100" markPrice="175.50" positionValue="17550" costBasisPrice="150.00" fifoPnlUnrealized="2550" fifoPnlRealized="0" currency="USD" assetCategory="STK" conid="265598"/></OpenPositions><CashReport currency="BASE" endingSettledCash="50000" endingCash="48000"/></FlexStatement></FlexStatements></FlexQueryResponse>`;

describe('IbkrProvider', () => {
  it('constructor — throws without token or queryId', () => {
    expect(() => new IbkrProvider({})).toThrow('IBKR requires token and queryId');
    expect(() => new IbkrProvider({ token: 'abc' })).toThrow('IBKR requires token and queryId');
    expect(() => new IbkrProvider({ queryId: '123' })).toThrow('IBKR requires token and queryId');
  });

  it('parses OpenPosition XML — returns correctly shaped holdings', async () => {
    const provider = new IbkrProvider({ token: 'test', queryId: '12345' });
    provider._fetchStatement = vi.fn().mockResolvedValue(VALID_XML);

    await provider.connect();
    const positions = await provider.getPositions();

    expect(positions).toHaveLength(1);
    const [h] = positions;
    expect(h.broker).toBe('ibkr');
    expect(h.symbol).toBe('AAPL');
    expect(h.quantity).toBe(100);
    expect(h.currentPrice).toBe(175.50);
    expect(h.marketValue).toBe(17550);
    expect(h.avgCost).toBe(150.00);
    expect(h.unrealizedPnl).toBe(2550);
    expect(h.currency).toBe('USD');
    expect(h.assetClass).toBe('equity');
    expect(h.accountId).toBe('U1234567');
  });

  it('parses CashReport XML — returns correctly shaped balances', async () => {
    const provider = new IbkrProvider({ token: 'test', queryId: '12345' });
    provider._fetchStatement = vi.fn().mockResolvedValue(VALID_XML);

    await provider.connect();
    const balances = await provider.getBalances();

    expect(balances).toHaveLength(1);
    const [b] = balances;
    expect(b.broker).toBe('ibkr');
    expect(b.accountId).toBe('U1234567');
    expect(b.equity).toBe(50000);   // endingSettledCash mapped to netliquidation
    expect(b.cash).toBe(48000);     // endingCash
  });

  it('handles error code 1003 — throws token expired message', async () => {
    const provider = new IbkrProvider({ token: 'test', queryId: '12345' });
    provider._fetchStatement = vi.fn().mockRejectedValue(
      new Error('IBKR token expired. Regenerate in IBKR portal: Performance & Reports -> Flex Queries.')
    );

    await expect(provider.connect()).rejects.toThrow(/token expired/i);
  });

  it('handles error code 1004 — throws invalid query ID message', async () => {
    const provider = new IbkrProvider({ token: 'test', queryId: '12345' });
    provider._fetchStatement = vi.fn().mockRejectedValue(
      new Error('Invalid IBKR Query ID. Check the number in your Flex Query settings.')
    );

    await expect(provider.connect()).rejects.toThrow(/query id/i);
  });

  it('handles error code 1018 — throws rate limited message', async () => {
    const provider = new IbkrProvider({ token: 'test', queryId: '12345' });
    provider._fetchStatement = vi.fn().mockRejectedValue(
      new Error('IBKR rate limited. Wait 10 minutes and try again.')
    );

    await expect(provider.connect()).rejects.toThrow(/rate limited/i);
  });
});
