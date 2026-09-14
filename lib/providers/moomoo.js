/**
 * Moomoo/Futu OpenD provider with auto-detect.
 *
 * Connection strategy (handled by SKILL.md, not this code):
 *   1. Probe localhost:11111 -- Moomoo desktop app embeds OpenD
 *   2. If not found, agent offers to install/start OpenD
 *   3. This provider connects via WebSocket (default port 33333)
 *
 * Read-only. No orders.
 */

import { createConnection } from 'node:net';
import { getFutuApi } from 'futu-sdk';
import { PortfolioProvider, normalizeHoldings, normalizeBalances } from './base.js';

const DEFAULT_HOST = '127.0.0.1';
const DEFAULT_PORT = 33333;
const PROBE_PORT = 11111;

const MARKETS = { HK: 1, US: 2, CN: 3, HKCC: 4, FUTURES: 5, SG: 6 };
const TRD_ENV = { SIMULATE: 0, REAL: 1 };

export class MoomooProvider extends PortfolioProvider {
  constructor(config = {}) {
    super('moomoo', config);
    this.host = config.host || DEFAULT_HOST;
    this.port = config.port || DEFAULT_PORT;
    this.clientKey = config.clientKey || '';
    this.trdEnv = config.simulate ? TRD_ENV.SIMULATE : TRD_ENV.REAL;
    this._webRequest = null;
    this._webSocket = null;
    this._accounts = [];
    this._warnings = [];
  }

  /**
   * Probe if OpenD is reachable on TCP port 11111 (OpenD process detection).
   * Returns true/false without throwing.
   */
  static async probe(host = DEFAULT_HOST, port = PROBE_PORT) {
    return new Promise((resolve) => {
      const sock = createConnection({ host, port }, () => {
        sock.destroy();
        resolve(true);
      });
      sock.on('error', () => resolve(false));
      sock.setTimeout(2000, () => { sock.destroy(); resolve(false); });
    });
  }

  async connect() {
    // Quick probe to check if OpenD process is running (TCP 11111)
    const alive = await MoomooProvider.probe(this.host, PROBE_PORT);
    if (!alive) {
      throw new Error(
        `Moomoo OpenD not detected at ${this.host}:${PROBE_PORT}.\n` +
        'Options:\n' +
        '  1. Start the Moomoo desktop app (macOS/Windows — OpenD runs embedded)\n' +
        '  2. Run: bin/setup-opend.sh download && bin/setup-opend.sh configure <account>\n' +
        '  3. The agent can install and configure OpenD automatically (Linux)'
      );
    }

    const wsUrl = `ws://${this.host}:${this.port}`;
    const { webRequest, webSocket } = getFutuApi(wsUrl, this.clientKey);
    this._webRequest = webRequest;
    this._webSocket = webSocket;

    // Discover accounts
    const { accList } = await webRequest.GetAccList({ userID: 0, needGeneralSecAccount: true });
    this._accounts = (accList || []).filter(a => a.trdEnv === this.trdEnv);

    if (this._accounts.length === 0) {
      throw new Error('No trading accounts found. Check Moomoo account permissions.');
    }

    this._connected = true;
    return {
      authenticated: true,
      accounts: this._accounts.map(a => ({
        id: String(a.accID),
        title: `Moomoo ${a.accID}`,
        type: a.accType === 1 ? 'securities' : 'futures',
        markets: a.trdMarketAuthList || [],
      })),
    };
  }

  async disconnect() {
    if (this._webSocket) {
      try { this._webSocket.close(); } catch { /* ignore */ }
      this._webSocket = null;
    }
    this._webRequest = null;
    this._accounts = [];
    this._warnings = [];
    await super.disconnect();
  }

  getWarnings() { return this._warnings; }

  async getAccounts() {
    return this._accounts.map(a => ({
      id: String(a.accID),
      broker: 'moomoo',
      title: `Moomoo ${a.accID}`,
      type: a.accType === 1 ? 'securities' : 'futures',
      markets: a.trdMarketAuthList || [],
    }));
  }

  async getPositions() {
    const allPositions = [];
    for (const acct of this._accounts) {
      const markets = acct.trdMarketAuthList || [];
      for (const trdMarket of markets) {
        try {
          const { positionList } = await this._webRequest.GetPositionList({
            header: { trdEnv: this.trdEnv, accID: acct.accID, trdMarket },
            refreshCache: false,
          });
          allPositions.push(...normalizeHoldings(positionList || [], 'moomoo', String(acct.accID)));
        } catch (err) { this._warnings.push({ method: 'getPositions', market: trdMarket, error: err.message }); }
      }
    }
    return allPositions;
  }

  async getBalances() {
    const balances = [];
    for (const acct of this._accounts) {
      const markets = acct.trdMarketAuthList || [];
      const primaryMarket = markets.includes(MARKETS.US) ? MARKETS.US : markets[0] || MARKETS.HK;
      try {
        const { funds } = await this._webRequest.GetFunds({
          header: { trdEnv: this.trdEnv, accID: acct.accID, trdMarket: primaryMarket },
          refreshCache: false,
        });
        balances.push(normalizeBalances(funds || {}, 'moomoo', String(acct.accID)));
      } catch (err) { this._warnings.push({ method: 'getBalances', account: String(acct.accID), error: err.message }); }
    }
    return balances;
  }
}
