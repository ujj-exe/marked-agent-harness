/**
 * IBKR Flex Query Web Service provider.
 *
 * Pure HTTP. No gateway. No daemon. No Java.
 * User provides a token + query ID from their IBKR portal.
 * End-of-day data (positions, balances, P&L).
 *
 * Read-only. No orders.
 */

import https from 'node:https';
import { XMLParser } from 'fast-xml-parser';
import { PortfolioProvider, normalizeHoldings, normalizeBalances } from './base.js';

const FLEX_BASE = 'https://ndcdyn.interactivebrokers.com/AccountManagement/FlexWebService';
const POLL_INTERVAL_MS = 5000;
const MAX_POLLS = 12; // 60s max
const HTTP_TIMEOUT_MS = 30_000;

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '',
  isArray: (name) => ['OpenPosition', 'CashReport', 'FlexStatement'].includes(name),
});

function parseXml(xml) {
  return xmlParser.parse(xml);
}

function xmlTag(xml, tag) {
  const parsed = parseXml(xml);
  const walk = (obj) => {
    if (!obj || typeof obj !== 'object') return null;
    if (tag in obj) return typeof obj[tag] === 'string' ? obj[tag].trim() : String(obj[tag]);
    for (const v of Object.values(obj)) {
      const found = walk(v);
      if (found !== null) return found;
    }
    return null;
  };
  return walk(parsed);
}

function xmlElements(parsed, tag) {
  const results = [];
  const walk = (obj) => {
    if (!obj || typeof obj !== 'object') return;
    if (tag in obj) {
      const val = obj[tag];
      const items = Array.isArray(val) ? val : [val];
      for (const item of items) {
        if (item && typeof item === 'object') results.push(item);
      }
    }
    for (const v of Object.values(obj)) walk(v);
  };
  walk(parsed);
  return results;
}

async function httpGet(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { 'User-Agent': 'Marked/0.1.0' } }, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        if (res.statusCode >= 400) reject(new Error(`HTTP ${res.statusCode}: ${data.slice(0, 200)}`));
        else resolve(data);
      });
    });
    req.on('error', reject);
    req.setTimeout(HTTP_TIMEOUT_MS, () => {
      req.destroy(new Error(`IBKR request timed out after ${HTTP_TIMEOUT_MS / 1000}s`));
    });
  });
}

export class IbkrProvider extends PortfolioProvider {
  constructor(config = {}) {
    super('ibkr', config);
    if (!config.token || !config.queryId) {
      throw new Error('IBKR requires token and queryId');
    }
    this.token = config.token;
    this.queryId = config.queryId;
    this._xml = null;
    this._accounts = [];
  }

  async _fetchStatement() {
    // Step 1: trigger report generation
    const sendUrl = `${FLEX_BASE}/SendRequest?t=${this.token}&q=${this.queryId}&v=3`;
    const sendResp = await httpGet(sendUrl);

    const status = xmlTag(sendResp, 'Status');
    if (status !== 'Success') {
      const code = xmlTag(sendResp, 'ErrorCode');
      const msg = xmlTag(sendResp, 'ErrorMessage');
      if (code === '1003' || code === '1012') throw new Error('IBKR token expired. Regenerate in IBKR portal: Performance & Reports -> Flex Queries.');
      if (code === '1004') throw new Error('Invalid IBKR Query ID. Check the number in your Flex Query settings.');
      if (code === '1005' || code === '1018') throw new Error('IBKR rate limited. Wait 10 minutes and try again.');
      throw new Error(`IBKR Flex Query error [${code}]: ${msg}`);
    }

    const refCode = xmlTag(sendResp, 'ReferenceCode');
    if (!refCode) throw new Error('No ReferenceCode in IBKR response');

    // Step 2: poll until report is ready
    for (let i = 0; i < MAX_POLLS; i++) {
      await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));
      const getUrl = `${FLEX_BASE}/GetStatement?t=${this.token}&q=${refCode}&v=3`;
      const resp = await httpGet(getUrl);
      if (xmlTag(resp, 'ErrorCode') === '1019') continue; // still generating
      const getStatus = xmlTag(resp, 'Status');
      if (getStatus === 'Fail') {
        throw new Error(`IBKR statement fetch failed: ${xmlTag(resp, 'ErrorMessage')}`);
      }
      return resp;
    }
    throw new Error('IBKR statement timed out (60s). Try again in a few minutes.');
  }

  async connect() {
    this._xml = await this._fetchStatement();
    this._parsed = parseXml(this._xml);
    this._connected = true;
    const stmts = xmlElements(this._parsed, 'FlexStatement');
    const accountId = stmts[0]?.accountId || 'unknown';
    this._accounts = [{ id: accountId, broker: 'ibkr', title: `IBKR ${accountId}`, type: 'individual', currency: 'USD' }];
    return { authenticated: true, accounts: this._accounts };
  }

  async disconnect() {
    await super.disconnect();
    this._accounts = [];
    this._xml = null;
    this._parsed = null;
  }

  async getAccounts() { return this._accounts; }

  async getPositions() {
    if (!this._xml) {
      this._xml = await this._fetchStatement();
      this._parsed = parseXml(this._xml);
    }
    const accountId = this._accounts[0]?.id || 'unknown';
    const raw = xmlElements(this._parsed, 'OpenPosition').map(p => ({
      contractDesc: p.symbol || p.description || '',
      fullName: p.description || p.symbol || '',
      position: (Number(p.position) || 0),
      mktPrice: (Number(p.markPrice) || 0),
      mktValue: (Number(p.positionValue) || 0) || (Number(p.markPrice) || 0) * (Number(p.position) || 0),
      avgCost: (Number(p.costBasisPrice) || 0),
      avgPrice: (Number(p.costBasisPrice) || 0),
      unrealizedPnl: (Number(p.fifoPnlUnrealized) || 0),
      realizedPnl: 0, // OpenPosition has no fifoPnlRealized; realized P&L lives in Trades elements
      currency: p.currency || 'USD',
      assetClass: p.assetCategory || 'STK',
      conid: p.conid,
    }));
    return normalizeHoldings(raw, 'ibkr', accountId);
  }

  async getBalances() {
    if (!this._xml) {
      this._xml = await this._fetchStatement();
      this._parsed = parseXml(this._xml);
    }
    const accountId = this._accounts[0]?.id || 'unknown';
    const cash = xmlElements(this._parsed, 'CashReport');
    const base = cash.find(c => c.currency === 'BASE') || cash[0] || {};
    const summary = {
      netliquidation: { amount: (Number(base.endingSettledCash) || 0), currency: 'USD' },
      totalcashvalue: { amount: (Number(base.endingCash) || 0), currency: 'USD' },
      grosspositionvalue: { amount: 0, currency: 'USD' },
      unrealizedpnl: { amount: 0, currency: 'USD' },
      realizedpnl: { amount: 0, currency: 'USD' },
      buyingpower: { amount: 0, currency: 'USD' },
    };
    return [normalizeBalances(summary, 'ibkr', accountId)];
  }
}
