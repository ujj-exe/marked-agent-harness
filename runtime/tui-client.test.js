import { describe, expect, it } from 'vitest';
import { TuiClient } from './tui-client.js';

describe('TuiClient query channel', () => {
  it('delivers a query to the waiting Marked runtime', async () => {
    const tui = new TuiClient();
    const pending = tui.waitForQuery();
    tui.receiveQuery('Compare TCS and Infosys');
    await expect(pending).resolves.toBe('Compare TCS and Infosys');
  });

  it('queues a query submitted before the runtime waits', async () => {
    const tui = new TuiClient();
    tui.receiveQuery('Analyze Reliance Industries');
    await expect(tui.waitForQuery()).resolves.toBe('Analyze Reliance Industries');
  });
});
