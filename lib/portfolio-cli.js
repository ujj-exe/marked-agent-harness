#!/usr/bin/env node

/**
 * Portfolio CLI -- broker connection and portfolio data.
 *
 * Usage:
 *   node lib/portfolio-cli.js                    # fetch portfolio
 *   node lib/portfolio-cli.js connect ibkr <TOKEN> <QUERY_ID>
 *   node lib/portfolio-cli.js connect moomoo [PORT]
 *   node lib/portfolio-cli.js disconnect <broker>
 *   node lib/portfolio-cli.js test <broker>
 *   node lib/portfolio-cli.js probe moomoo
 *   node lib/portfolio-cli.js brokers
 *   node lib/portfolio-cli.js setup <download|configure|start|stop|status|verify-2fa> [args...]
 *
 * All output is JSON to stdout.
 */

import { readFileSync, writeFileSync, mkdirSync, unlinkSync, readdirSync, chmodSync } from 'node:fs';
import { join } from 'node:path';
import { MARKED_HOME } from '../config/paths.js';
import { IbkrProvider } from './providers/ibkr.js';
import { buildPortfolio } from './providers/base.js';

const AUTH_DIR = join(MARKED_HOME, 'auth');
const CACHE_PATH = join(MARKED_HOME, 'portfolio', 'cache.json');
const CACHE_TTL_MS = 5 * 60 * 1000;

// Lazy-load MoomooProvider to avoid futu-sdk/futu-proto ESM resolution
// issues on Node versions with strict module resolution (CI, Node 20).
// futu-proto imports protobufjs/minimal without .js extension which fails.
let _MoomooProvider = null;
async function getMoomooProvider() {
  if (!_MoomooProvider) {
    _MoomooProvider = (await import('./providers/moomoo.js')).MoomooProvider;
  }
  return _MoomooProvider;
}

const SUPPORTED_BROKERS = ['ibkr', 'moomoo'];

async function getProvider(broker) {
  if (broker === 'ibkr') return IbkrProvider;
  if (broker === 'moomoo') return getMoomooProvider();
  return null;
}

// --- Auth ---

function ensureAuthDir() { mkdirSync(AUTH_DIR, { recursive: true, mode: 0o700 }); }
function authPath(b) { return join(AUTH_DIR, `${b}.json`); }
function readAuth(b) { try { return JSON.parse(readFileSync(authPath(b), 'utf8')); } catch { return null; } }
function writeAuth(b, c) { ensureAuthDir(); const p = authPath(b); writeFileSync(p, JSON.stringify(c, null, 2) + '\n', { mode: 0o600 }); chmodSync(p, 0o600); }
function removeAuth(b) { try { unlinkSync(authPath(b)); return true; } catch { return false; } }
function listBrokers() { ensureAuthDir(); try { return readdirSync(AUTH_DIR).filter(f => f.endsWith('.json')).map(f => f.replace('.json', '')).filter(b => SUPPORTED_BROKERS.includes(b)); } catch { return []; } }

// --- Cache ---

function readCache() { try { const c = JSON.parse(readFileSync(CACHE_PATH, 'utf8')); if (Date.now() - new Date(c._fetchedAt).getTime() < CACHE_TTL_MS) return c; } catch {} return null; }
function writeCache(p) { try { mkdirSync(join(MARKED_HOME, 'portfolio'), { recursive: true }); writeFileSync(CACHE_PATH, JSON.stringify(p, null, 2)); } catch {} }

// --- Commands ---

async function cmdStatus() {
  const brokers = listBrokers();
  if (!brokers.length) return { connected: false, brokers: [], message: 'No brokers connected.' };
  const cached = readCache();
  if (cached) return { ...cached, _cached: true };

  const results = [], errors = [];
  for (const broker of brokers) {
    const config = readAuth(broker);
    try {
      const Provider = await getProvider(broker);
      const provider = new Provider(config);
      await provider.connect();
      const [positions, balances] = await Promise.all([provider.getPositions(), provider.getBalances()]);
      for (const bal of balances) {
        results.push({ holdings: positions.filter(p => p.accountId === bal.accountId), balances: bal });
      }
      await provider.disconnect();
    } catch (err) { errors.push({ broker, error: err.message }); }
  }

  if (!results.length && errors.length) return { connected: false, brokers, errors };
  const portfolio = buildPortfolio(results);
  if (errors.length) portfolio._errors = errors;
  writeCache(portfolio);
  return portfolio;
}

async function cmdConnect(broker, args) {
  if (!broker) return { error: 'Usage: connect <ibkr|moomoo>' };
  if (!SUPPORTED_BROKERS.includes(broker)) return { error: `Unknown broker: ${broker}. Supported: ibkr, moomoo` };
  if (readAuth(broker)) return { already_connected: true, broker, message: `${broker} already configured. Run disconnect first.` };

  let config;
  switch (broker) {
    case 'ibkr': {
      const [token, queryId] = args;
      if (!token || !queryId) return {
        error: 'Usage: connect ibkr <TOKEN> <QUERY_ID>',
        setup: ['Log into portal.interactivebrokers.com', 'Performance & Reports -> Flex Queries', 'Create Activity Flex Query (Open Positions + Cash Report)', 'Note the Query ID', 'Generate Flex Web Service token', 'Run: connect ibkr <TOKEN> <QUERY_ID>'],
        time: '5 minutes',
      };
      config = { broker: 'ibkr', token, queryId, connectedAt: new Date().toISOString() };
      break;
    }
    case 'moomoo': {
      const port = parseInt(args[0] || '33333');
      config = { broker: 'moomoo', host: '127.0.0.1', port, connectedAt: new Date().toISOString() };
      break;
    }
  }

  writeAuth(broker, config);
  const safe = { ...config };
  for (const k of ['token']) if (safe[k]) safe[k] = '***';
  return { connected: true, broker, config: safe };
}

async function cmdDisconnect(broker) {
  if (!broker) return { error: 'Usage: disconnect <ibkr|moomoo>' };
  return removeAuth(broker)
    ? { disconnected: true, broker }
    : { disconnected: false, broker, message: 'Was not connected.' };
}

async function cmdTest(broker) {
  if (!broker) return { error: 'Usage: test <ibkr|moomoo>' };
  const config = readAuth(broker);
  if (!config) return { error: `${broker} not connected.` };
  try {
    const Provider = await getProvider(broker);
    const provider = new Provider(config);
    const result = await provider.connect();
    await provider.disconnect();
    return { success: true, broker, ...result };
  } catch (err) { return { success: false, broker, error: err.message }; }
}

async function cmdProbe(broker) {
  if (broker === 'moomoo') {
    const { createConnection } = await import('node:net');
    const alive = await new Promise((resolve) => {
      const sock = createConnection({ host: '127.0.0.1', port: 11111 }, () => { sock.destroy(); resolve(true); });
      sock.on('error', () => resolve(false));
      sock.setTimeout(2000, () => { sock.destroy(); resolve(false); });
    });
    return { broker, detected: alive, port: 11111 };
  }
  return { error: `Probe only supported for moomoo` };
}

async function cmdBrokers() {
  const brokers = listBrokers().map(b => {
    const c = { ...readAuth(b) };
    for (const k of ['token']) if (c[k]) c[k] = '***';
    return c;
  });
  return { brokers, supported: ['ibkr', 'moomoo'] };
}

// --- Main ---

const [,, cmd, arg, ...extra] = process.argv;
let result;
try {
  switch (cmd) {
    case undefined: case 'status': result = await cmdStatus(); break;
    case 'connect': result = await cmdConnect(arg, extra); break;
    case 'disconnect': result = await cmdDisconnect(arg); break;
    case 'test': result = await cmdTest(arg); break;
    case 'probe': result = await cmdProbe(arg); break;
    case 'brokers': result = await cmdBrokers(); break;
    case 'setup': {
      const { execSync } = await import('node:child_process');
      const scriptPath = new URL('../bin/setup-opend.sh', import.meta.url).pathname;
      try {
        const output = execSync(`bash "${scriptPath}" ${[arg, ...extra].filter(Boolean).join(' ')}`, { encoding: 'utf8', timeout: 120000 });
        result = JSON.parse(output);
      } catch (err) {
        result = { error: err.message, stderr: err.stderr?.slice(0, 500) };
      }
      break;
    }
    default: result = { error: `Unknown command: ${cmd}` };
  }
} catch (err) { result = { error: err.message }; }
process.stdout.write(JSON.stringify(result, null, 2) + '\n');
