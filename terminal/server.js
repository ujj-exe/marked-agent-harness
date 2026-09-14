/**
 * TUI Server — HTTP bridge between the Marked runtime and terminal app.
 *
 * The Marked runtime POSTs render commands to /render.
 * An EventEmitter singleton bridges those commands to the TUI app.
 * State is persisted to ~/.marked/tui.json for Marked runtime PID/port tracking.
 */

import http from 'http';
import net from 'net';
import fs from 'fs';
import path from 'path';
import { EventEmitter } from 'events';
import { MARKED_HOME, TUI_STATE_PATH, ANALYTICS_DIR } from '../config/paths.js';
import { logConnection, logDisconnect, logRender, logRenderError } from './debugLog.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_PORT = 7707;
const STATE_DIR = MARKED_HOME;
const STATE_FILE = TUI_STATE_PATH;
const ANALYTICS_FILE = path.join(ANALYTICS_DIR, 'requests.jsonl');
const ANALYTICS_MAX_BYTES = 5 * 1024 * 1024; // 5 MB
const VALID_ACTIONS = new Set(['render', 'focus', 'layout', 'clear']);
import { createRequire } from 'module';
// __PKG_VERSION__ is replaced by esbuild at bundle time (scripts/build.js define).
// When running from source (tests), fall back to reading package.json.
const _require = createRequire(import.meta.url);
function _resolveVersion() {
  if (typeof __PKG_VERSION__ !== 'undefined') return __PKG_VERSION__;
  try { return _require('../package.json').version; } catch { return '0.0.0'; }
}
const VERSION = _resolveVersion();

// ---------------------------------------------------------------------------
// Analytics — in-memory counters + JSONL file logger
// ---------------------------------------------------------------------------

const analytics = {
  renders: 0,
  patches: 0,
  errors: 0,
  totalBlocks: 0,
  firstRenderAt: null,
  lastRenderAt: null,
  skills: {},  // { analyst: 3, desk: 1 }
};

/**
 * Append a single analytics entry to the JSONL log file.
 * Auto-rotates when the file exceeds ANALYTICS_MAX_BYTES.
 * All I/O errors are silently swallowed — logging must never fail a request.
 */
function logAnalytics(entry) {
  try {
    fs.mkdirSync(ANALYTICS_DIR, { recursive: true });

    // Rotate if file is too large
    try {
      const stat = fs.statSync(ANALYTICS_FILE);
      if (stat.size > ANALYTICS_MAX_BYTES) {
        fs.renameSync(ANALYTICS_FILE, ANALYTICS_FILE + '.bak');
      }
    } catch {
      // File doesn't exist yet — that's fine
    }

    fs.appendFileSync(ANALYTICS_FILE, JSON.stringify(entry) + '\n');
  } catch {
    // Never propagate logging errors
  }
}

// ── Session lock — one Marked runtime per TUI ──────────────────────────────
let _agentSession = null; // { agent: string, connectedAt: number } or null

// Valid theme names from src/themes.js
const VALID_THEMES = new Set([
  'terminal-cyan',
  'bloomberg',
  'monochrome',
  'solarized-dark',
  'dracula',
  'marked',
]);

// ---------------------------------------------------------------------------
// EventEmitter singleton
// ---------------------------------------------------------------------------

export const emitter = new EventEmitter();

/** The runtime that has claimed this TUI, or null. */
export function connectedAgent() { return _agentSession; }
emitter.setMaxListeners(20);


// ---------------------------------------------------------------------------
// Server state
// ---------------------------------------------------------------------------

let _server = null;
let _handlersRegistered = false;
let _shuttingDown = false;
let _port = null;
let _startedAt = null;
let _layout = 'default';
let _panelCount = 0;

// ---------------------------------------------------------------------------
// Port management
// ---------------------------------------------------------------------------

/**
 * Test whether a port is available by attempting to bind to it.
 * Returns a Promise<boolean>.
 */
export function isPortAvailable(port) {
  return new Promise((resolve) => {
    const tester = net.createServer();
    tester.once('error', () => resolve(false));
    tester.once('listening', () => {
      tester.close(() => resolve(true));
    });
    tester.listen(port, '127.0.0.1');
  });
}

/**
 * Find an available port.
 * Tries DEFAULT_PORT first, then up to 5 random ports in [10000, 60000).
 */
export async function findPort() {
  if (await isPortAvailable(DEFAULT_PORT)) {
    return DEFAULT_PORT;
  }

  for (let attempt = 0; attempt < 5; attempt++) {
    const candidate = Math.floor(Math.random() * 50000) + 10000;
    if (await isPortAvailable(candidate)) {
      return candidate;
    }
  }

  throw new Error('Could not find an available port after 5 attempts');
}

// ---------------------------------------------------------------------------
// State file
// ---------------------------------------------------------------------------

/**
 * Write state file atomically (tmp → rename) with mode 0o600.
 */
export function writeStateFile(data) {
  fs.mkdirSync(STATE_DIR, { recursive: true });

  const tmp = STATE_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), { mode: 0o600 });
  fs.renameSync(tmp, STATE_FILE);
}

/**
 * Delete the state file if it exists.
 */
export function deleteStateFile() {
  try {
    fs.unlinkSync(STATE_FILE);
  } catch {
    // ignore — file may not exist
  }
}

// ---------------------------------------------------------------------------
// CORS helpers
// ---------------------------------------------------------------------------

function setCorsHeaders(res) {
  res.setHeader('Access-Control-Allow-Origin', 'http://localhost');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

// ---------------------------------------------------------------------------
// Request body parser
// ---------------------------------------------------------------------------

const MAX_BODY_BYTES = 1_048_576; // 1 MB

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let totalBytes = 0;
    let limitExceeded = false;
    req.on('data', (chunk) => {
      if (limitExceeded) return;
      totalBytes += chunk.length;
      if (totalBytes > MAX_BODY_BYTES) {
        limitExceeded = true;
        const err = new Error('Payload too large');
        err.code = 'PAYLOAD_TOO_LARGE';
        reject(err);
        // Drain remaining data so the socket can be reused cleanly
        req.resume();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (limitExceeded) return;
      const body = Buffer.concat(chunks).toString('utf8');
      try {
        resolve(JSON.parse(body));
      } catch {
        reject(new Error('Invalid JSON'));
      }
    });
    req.on('error', reject);
  });
}

// ---------------------------------------------------------------------------
// HTTP request handler
// ---------------------------------------------------------------------------

/**
 * Thin wrapper that captures timing and writes to the JSONL log after the
 * response is finished.  All logging is in try/catch so it can never interfere
 * with normal request handling.
 */
function handleRequest(req, res) {
  const _reqStart = Date.now();

  // After the response is sent, write the log entry
  res.on('finish', () => {
    try {
      const duration_ms = Date.now() - _reqStart;
      const status = res.statusCode;
      const { method, url: path } = req;

      if (path === '/render') {
        // render-specific fields are appended by the render handler via _pendingRenderLog
        const pending = req._pendingRenderLog || {};
        logAnalytics({
          ts: new Date().toISOString(),
          method,
          path,
          status,
          duration_ms,
          ...pending,
          error: pending.error ?? null,
        });
        // Update in-memory counters for successful renders
        if (status === 200) {
          const now = new Date().toISOString();
          analytics.renders++;
          if (pending.patch) analytics.patches++;
          if (pending.blocks_count) analytics.totalBlocks += pending.blocks_count;
          if (!analytics.firstRenderAt) analytics.firstRenderAt = now;
          analytics.lastRenderAt = now;
          if (pending.skill) {
            if (analytics.skills[pending.skill] !== undefined || Object.keys(analytics.skills).length < 50) {
              analytics.skills[pending.skill] = (analytics.skills[pending.skill] || 0) + 1;
            }
          }
          logRender(
            pending.skill ?? 'unknown',
            pending.blocks_count ?? 0,
            pending.patch ?? false,
            pending.stage ?? 'unknown',
          );
        } else {
          analytics.errors++;
          logRenderError(status, pending.error ?? '');
        }
      } else {
        const entry = {
          ts: new Date().toISOString(),
          method,
          path,
          status,
          duration_ms,
        };
        if (status >= 400) {
          entry.error = req._responseError || null;
        }
        logAnalytics(entry);
        if (status >= 400) analytics.errors++;
      }
    } catch {
      // Never propagate logging errors
    }
  });

  setCorsHeaders(res);

  // Pre-flight
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const { method, url } = req;

  // GET /health — capability negotiation handshake
  if (method === 'GET' && url === '/health') {
    const now = Date.now();
    const uptime = _startedAt ? Math.floor((now - _startedAt) / 1000) : 0;
    const { columns, rows } = process.stdout;
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 'ok',
      pid: process.pid,
      port: _port,
      version: VERSION,
      uptime,
      layout: _layout,
      panelCount: _panelCount,
      startedAt: _startedAt,
      width: columns ?? 80,
      height: rows ?? 24,
      theme: 'marked',
      capabilities: ['patch', 'sections', 'focus', 'state', 'memory', 'connect'],
      agent: _agentSession,
    }));
    return;
  }

  // POST /connect — runtime claims this TUI session
  if (method === 'POST' && url === '/connect') {
    readBody(req)
      .then((payload) => {
        const agentId = payload?.agent || 'unknown';

        // If another agent holds the session, reject
        if (_agentSession && _agentSession.agent !== agentId) {
          res.writeHead(409, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            error: 'occupied',
            agent: _agentSession.agent,
            connectedAt: _agentSession.connectedAt,
            message: `TUI occupied by ${_agentSession.agent}. Disconnect the active runtime first.`,
          }));
          return;
        }

        const modelId = payload?.model || null;
        _agentSession = {
          agent: agentId,
          model: modelId,
          query: payload?.query || null,
          connectedAt: Date.now(),
        };
        logConnection(agentId, modelId);
        // Update splash with connection status
        const label = modelId ? `${agentId} · ${modelId}` : agentId;
        emitter.emit('_splash', {
          msg: `Connected · ${label}`,
          agent: _agentSession,
        });
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'connected', agent: agentId, model: modelId }));
      })
      .catch((err) => {
        if (err?.code === 'PAYLOAD_TOO_LARGE') {
          res.writeHead(413, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Payload too large', maxBytes: MAX_BODY_BYTES }));
        } else {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Invalid JSON' }));
        }
      });
    return;
  }

  // POST /disconnect — runtime releases this TUI session
  if (method === 'POST' && url === '/disconnect') {
    readBody(req)
      .then((payload) => {
        const agentId = payload?.agent;

        // Require the agent field
        if (!agentId) {
          res.writeHead(403, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Agent ID mismatch' }));
          return;
        }

        // No active session
        if (!_agentSession) {
          res.writeHead(409, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'No agent connected' }));
          return;
        }

        // Agent ID must match the connected session
        if (_agentSession.agent !== agentId) {
          res.writeHead(403, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Agent ID mismatch' }));
          return;
        }

        logDisconnect(agentId);
        _agentSession = null;
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'disconnected' }));
      })
      .catch((err) => {
        if (err?.code === 'PAYLOAD_TOO_LARGE') {
          res.writeHead(413, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Payload too large', maxBytes: MAX_BODY_BYTES }));
        } else {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Invalid JSON' }));
        }
      });
    return;
  }

  // POST /notice — runtime-owned status message for the TUI splash
  if (method === 'POST' && url === '/notice') {
    readBody(req)
      .then((payload) => {
        if (!_agentSession || payload?.agent !== _agentSession.agent) {
          res.writeHead(403, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Agent ID mismatch' }));
          return;
        }
        const message = typeof payload.message === 'string' ? payload.message.slice(0, 240) : '';
        emitter.emit('_splash', { msg: message, reset: payload.reset !== false });
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'ok' }));
      })
      .catch(() => {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid JSON' }));
      });
    return;
  }

  // POST /render — requires active session via /connect + agent identity match
  if (method === 'POST' && url === '/render') {
    if (!_agentSession) {
      req._pendingRenderLog = { error: 'No agent connected' };
      res.writeHead(403, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'No agent connected. POST /connect first.' }));
      return;
    }
    readBody(req)
      .then((payload) => {
        // Verify caller matches connected agent
        const callerId = payload?.agent;
        if (callerId && callerId !== _agentSession.agent) {
          req._pendingRenderLog = { error: 'Agent ID mismatch' };
          res.writeHead(403, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Agent ID mismatch', connected: _agentSession.agent }));
          return;
        }
        const action = payload?.action;
        if (!VALID_ACTIONS.has(action)) {
          req._pendingRenderLog = { agent: callerId, error: `Invalid action "${action}"` };
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            error: `Invalid action "${action}". Must be one of: ${[...VALID_ACTIONS].join(', ')}`,
          }));
          return;
        }

        // ── File-based enforcement for render action ─────────────────────────
        // The render action requires blocks to be in a file, not inline.
        // Other actions (focus, layout, clear) still accept inline payloads.
        if (action === 'render') {
          // Reject if blocks are sent inline
          if (payload.blocks !== undefined) {
            req._pendingRenderLog = { agent: callerId, error: 'Inline blocks not accepted' };
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
              error: 'Inline blocks not accepted. Write blocks to a file and POST {"action":"render","file":"/path/to/file.json"}',
            }));
            return;
          }

          // Require a file path
          if (!payload.file) {
            req._pendingRenderLog = { agent: callerId, error: 'Missing "file" field' };
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
              error: 'Missing "file" field. Write blocks to a file and POST {"action":"render","file":"/path/to/file.json"}',
            }));
            return;
          }

          const filePath = path.resolve(payload.file);

          // Security: only allow files under /tmp/
          if (!filePath.startsWith('/tmp/')) {
            req._pendingRenderLog = { agent: callerId, error: 'File path must be under /tmp/' };
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
              error: 'File path must be under /tmp/. Got: ' + filePath,
            }));
            return;
          }

          // Read the file
          let fileContents;
          try {
            const stat = fs.statSync(filePath);
            if (stat.size > MAX_BODY_BYTES) {
              req._pendingRenderLog = { agent: callerId, error: 'File too large' };
              res.writeHead(413, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: 'File too large', maxBytes: MAX_BODY_BYTES }));
              return;
            }
            fileContents = fs.readFileSync(filePath, 'utf8');
          } catch (readErr) {
            if (readErr.code === 'ENOENT') {
              req._pendingRenderLog = { agent: callerId, error: `File not found: ${filePath}` };
              res.writeHead(404, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: `File not found: ${filePath}` }));
            } else {
              req._pendingRenderLog = { agent: callerId, error: `Could not read file: ${readErr.message}` };
              res.writeHead(500, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: `Could not read file: ${readErr.message}` }));
            }
            return;
          }

          let filePayload;
          try {
            filePayload = JSON.parse(fileContents);
          } catch {
            req._pendingRenderLog = { agent: callerId, error: `Invalid JSON in file: ${filePath}` };
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: `Invalid JSON in file: ${filePath}` }));
            return;
          }

          // Merge file contents into payload (blocks, _state, meta, theme, patch, layout, panels)
          // Progressive rendering uses patch: true — the app layer (state.js applyPatch)
          // handles merging by block type/id. Server passes blocks through as-is.
          if (filePayload.blocks !== undefined) payload.blocks = filePayload.blocks;
          if (filePayload._state !== undefined) payload._state = filePayload._state;
          if (filePayload.meta !== undefined) payload.meta = filePayload.meta;
          if (filePayload.theme !== undefined) payload.theme = filePayload.theme;
          if (filePayload.patch !== undefined) payload.patch = filePayload.patch;
          if (filePayload.layout !== undefined) payload.layout = filePayload.layout;
          if (filePayload.panels !== undefined) payload.panels = filePayload.panels;
        }
        // ────────────────────────────────────────────────────────────────────

        // Accept optional theme in payload — validate if present
        if (payload.theme !== undefined && !VALID_THEMES.has(payload.theme)) {
          req._pendingRenderLog = { agent: payload.agent, error: `Unknown theme "${payload.theme}"` };
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            error: `Unknown theme "${payload.theme}". Valid: ${[...VALID_THEMES].join(', ')}`,
          }));
          return;
        }

        // Update tracked server state from layout/panel/blocks hints
        if (payload.layout) _layout = payload.layout;
        if (Array.isArray(payload.blocks)) _layout = 'blocks';
        if (typeof payload.panelCount === 'number') _panelCount = payload.panelCount;

        try {
          emitter.emit(action, payload);
        } catch (emitErr) {
          req._pendingRenderLog = {
            agent: payload.agent,
            skill: payload._state?.skill,
            action,
            error: `Render error: ${emitErr.message}`,
          };
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: `Render error: ${emitErr.message}` }));
          return;
        }

        // Annotate pending log fields for the res.on('finish') analytics hook
        if (action === 'render') {
          req._pendingRenderLog = {
            skill: payload._state?.skill ?? payload.meta?.skill ?? 'unknown',
            blocks_count: Array.isArray(payload.blocks) ? payload.blocks.length : 0,
            patch: !!payload.patch,
            stage: payload._state?.stage ?? 'unknown',
          };
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
      })
      .catch((err) => {
        if (err?.code === 'PAYLOAD_TOO_LARGE') {
          req._pendingRenderLog = { error: 'Payload too large' };
          res.writeHead(413, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Payload too large', maxBytes: MAX_BODY_BYTES }));
        } else {
          req._pendingRenderLog = { error: 'Invalid JSON in request body' };
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Invalid JSON in request body' }));
        }
      });
    return;
  }

  // GET /stats — session analytics summary
  if (method === 'GET' && url === '/stats') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(analytics));
    return;
  }

  // 404 for everything else
  req._responseError = 'Not found';
  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not found' }));
}

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

/**
 * Start the HTTP server.
 * Finds an available port, binds, writes state file, registers signal handlers.
 * Returns {server, port}.
 */
export async function startServer(overridePort) {
  const requestedPort = overridePort != null ? overridePort : await findPort();
  _startedAt = Date.now();

  const server = http.createServer(handleRequest);
  _server = server;

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(requestedPort, '127.0.0.1', () => resolve());
  });

  // After listen, read the actual port (handles port 0 → OS-assigned)
  const port = server.address().port;
  _port = port;

  writeStateFile({
    pid: process.pid,
    port,
    startedAt: new Date(_startedAt).toISOString(),
    version: VERSION,
  });

  logAnalytics({
    ts: new Date().toISOString(),
    event: 'server_start',
    port,
    version: VERSION,
    pid: process.pid,
  });

  // Only register signal handlers once (module-level flag, not listenerCount)
  if (!_handlersRegistered) {
    process.on('SIGTERM', shutdown);
    process.on('SIGINT', shutdown);
    _handlersRegistered = true;
  }

  return { server, port };
}

/**
 * Graceful shutdown: delete state file, close server, exit.
 */
export function shutdown() {
  if (_shuttingDown) return;
  _shuttingDown = true;
  logAnalytics({
    ts: new Date().toISOString(),
    event: 'server_stop',
    duration_s: _startedAt ? Math.floor((Date.now() - _startedAt) / 1000) : 0,
    renders: analytics.renders,
    errors: analytics.errors,
  });
  deleteStateFile();
  if (_server) {
    // closeAllConnections() force-drains keep-alive sockets (Node 18.2+)
    if (typeof _server.closeAllConnections === 'function') {
      _server.closeAllConnections();
    }
    _server.close(() => process.exit(0));
    // Force exit if server doesn't close within 3s
    setTimeout(() => process.exit(0), 3000).unref();
  } else {
    process.exit(0);
  }
}

// ---------------------------------------------------------------------------
// Health check utility (for bin scripts / orchestrators)
// ---------------------------------------------------------------------------

/**
 * Read tui.json, verify the process is alive, and HTTP-ping /health.
 * Returns one of:
 *   {alive: true, port, pid}
 *   {alive: false, reason: 'stale'|'no_state', port?, pid?}
 */
export async function checkHealth(stateFilePath = STATE_FILE) {
  let state;
  try {
    const raw = fs.readFileSync(stateFilePath, 'utf8');
    state = JSON.parse(raw);
  } catch {
    return { alive: false, reason: 'no_state' };
  }

  const { pid, port } = state;

  // Check if PID is alive
  try {
    process.kill(pid, 0);
  } catch {
    return { alive: false, reason: 'stale', pid, port };
  }

  // HTTP health check
  try {
    await httpGet(`http://127.0.0.1:${port}/health`);
    return { alive: true, port, pid };
  } catch {
    return { alive: false, reason: 'stale', pid, port };
  }
}

/**
 * Minimal HTTP GET helper (no external deps).
 */
function httpGet(url) {
  return new Promise((resolve, reject) => {
    const req = http.get(url, { timeout: 2000 }, (res) => {
      let body = '';
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => resolve({ statusCode: res.statusCode, body }));
    });
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('timeout'));
    });
  });
}
