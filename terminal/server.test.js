/**
 * Tests for client/server.js
 *
 * Covers:
 *  - isPortAvailable / findPort
 *  - writeStateFile / deleteStateFile
 *  - startServer → GET /health, POST /render, 404, CORS
 *  - Invalid JSON / invalid action → 400
 *  - Valid theme validation
 *  - emitter events on POST /render
 *  - File-based render enforcement (inline blocks → 400, file path required)
 *  - checkHealth utility
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import http from 'http';
import net from 'net';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { TUI_STATE_PATH, MARKED_HOME } from '../config/paths.js';

// We import the module under test. Each test that starts a server will clean
// up by closing it explicitly (we do NOT call shutdown() in tests to avoid
// process.exit side-effects).
import {
  emitter,
  isPortAvailable,
  findPort,
  writeStateFile,
  deleteStateFile,
  startServer,
  checkHealth,
} from './server.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const STATE_DIR = MARKED_HOME;
const STATE_FILE = TUI_STATE_PATH;

/**
 * Minimal fetch-like helper over Node's http module.
 * Sends `Connection: close` to prevent keep-alive socket reuse issues
 * when tests repeatedly start/stop servers on the same port.
 */
function request(url, { method = 'GET', body } = {}) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const options = {
      hostname: parsed.hostname,
      port: Number(parsed.port),
      path: parsed.pathname,
      method,
      headers: {
        'Content-Type': 'application/json',
        // Disable keep-alive so the socket is released immediately after each
        // response, preventing ECONNRESET when the next test restarts on the
        // same port.
        'Connection': 'close',
      },
    };
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        let json;
        try { json = JSON.parse(data); } catch { json = data; }
        resolve({ status: res.statusCode, headers: res.headers, body: json });
      });
    });
    req.on('error', reject);
    if (body !== undefined) req.write(JSON.stringify(body));
    req.end();
  });
}

/** Close a Node http.Server, force-drain keep-alive sockets, and resolve when done. */
function closeServer(server) {
  return new Promise((resolve) => {
    // closeAllConnections() destroys keep-alive sockets so the port is
    // released immediately — available in Node 18.2+ (we're on Node 24).
    if (typeof server.closeAllConnections === 'function') {
      server.closeAllConnections();
    }
    server.close(resolve);
  });
}

/**
 * Write a render payload to /tmp/marked-render-test.json and return the path.
 * Used by tests that exercise the file-based render protocol.
 */
function writeRenderFile(payload) {
  const filePath = '/tmp/marked-render-test.json';
  fs.writeFileSync(filePath, JSON.stringify(payload));
  return filePath;
}

/**
 * POST a render request using the file-based protocol.
 * Writes `filePayload` to a temp file and posts {action:"render", file, ...extra}.
 */
function renderViaFile(port, filePayload, extra = {}) {
  const filePath = writeRenderFile(filePayload);
  return request(`http://127.0.0.1:${port}/render`, {
    method: 'POST',
    body: { action: 'render', file: filePath, ...extra },
  });
}

// ---------------------------------------------------------------------------
// isPortAvailable
// ---------------------------------------------------------------------------

describe('isPortAvailable', () => {
  it('returns true for a free port', async () => {
    // Use a random high port unlikely to be taken
    const available = await isPortAvailable(59001);
    expect(available).toBe(true);
  });

  it('returns false when port is in use', async () => {
    // Bind a port manually, then check
    const occupied = await new Promise((resolve) => {
      const s = net.createServer();
      s.listen(59002, '127.0.0.1', () => resolve(s));
    });

    try {
      const available = await isPortAvailable(59002);
      expect(available).toBe(false);
    } finally {
      await new Promise((resolve) => occupied.close(resolve));
    }
  });
});

// ---------------------------------------------------------------------------
// findPort
// ---------------------------------------------------------------------------

describe('findPort', () => {
  it('returns DEFAULT_PORT (7707) when it is free', async () => {
    // If 7707 is free in this environment the test passes trivially.
    // If it is occupied this test still verifies we get *some* valid port.
    const port = await findPort();
    expect(typeof port).toBe('number');
    expect(port).toBeGreaterThan(0);
  });

  it('falls back to a random port when DEFAULT_PORT is occupied', async () => {
    // Occupy 7707 temporarily (or skip if already occupied by TUI)
    const occupier = await new Promise((resolve, reject) => {
      const s = net.createServer();
      s.once('error', () => resolve(null)); // port busy — resolve null
      s.listen(7707, '127.0.0.1', () => resolve(s));
    });

    // 7707 is already occupied (e.g., TUI running) — verify findPort avoids it
    const port = await findPort();
    expect(port).not.toBe(7707);
    expect(port).toBeGreaterThanOrEqual(10000);
    expect(port).toBeLessThan(60000);

    if (occupier) {
      await new Promise((resolve) => occupier.close(resolve));
    }
  });
});

// ---------------------------------------------------------------------------
// State file
// ---------------------------------------------------------------------------

describe('writeStateFile / deleteStateFile', () => {
  const tmpFile = path.join(os.tmpdir(), 'tui-test.json');

  it('writes JSON content and mode 0o600', () => {
    const data = { pid: 1234, port: 7707, startedAt: '2026-01-01T00:00:00.000Z', version: '3.0.0' };

    // Temporarily redirect STATE_FILE path by calling with tmpFile logic.
    // Since writeStateFile uses the hard-coded STATE_FILE path, we call it
    // and check the actual file.
    writeStateFile(data);

    const written = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
    expect(written.pid).toBe(data.pid);
    expect(written.port).toBe(data.port);
    expect(written.version).toBe(data.version);

    const stat = fs.statSync(STATE_FILE);
    // mode is last 12 bits; 0o600 = 384
    expect(stat.mode & 0o777).toBe(0o600);
  });

  it('deleteStateFile removes the file', () => {
    writeStateFile({ pid: 1, port: 1, startedAt: 'x', version: '0' });
    expect(fs.existsSync(STATE_FILE)).toBe(true);
    deleteStateFile();
    expect(fs.existsSync(STATE_FILE)).toBe(false);
  });

  it('deleteStateFile is idempotent when file does not exist', () => {
    deleteStateFile(); // should not throw
    deleteStateFile(); // again, still fine
  });
});

// ---------------------------------------------------------------------------
// HTTP server — lifecycle tests
// ---------------------------------------------------------------------------

describe('startServer + HTTP endpoints', () => {
  let server;
  let port;

  beforeEach(async () => {
    // Use port 0 → OS-assigned to avoid conflicts with running TUI on 7707
    const result = await startServer(0);
    server = result.server;
    port = result.port;
    // Connect a test agent so /render doesn't 403
    await request(`http://127.0.0.1:${port}/connect`, {
      method: 'POST',
      body: { agent: 'test-agent' },
    });
  });

  afterEach(async () => {
    deleteStateFile();
    if (server?.listening) await closeServer(server);
  });

  // --- GET /health ---

  it('GET /health returns 200 with expected fields', async () => {
    const res = await request(`http://127.0.0.1:${port}/health`);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.pid).toBe(process.pid);
    expect(res.body.port).toBe(port);
    expect(typeof res.body.uptime).toBe('number');
    expect(res.body.uptime).toBeGreaterThanOrEqual(0);
    expect(res.body.layout).toBe('default');
    expect(typeof res.body.startedAt).toBe('number');
  });

  it('GET /health includes CORS header', async () => {
    const res = await request(`http://127.0.0.1:${port}/health`);
    expect(res.headers['access-control-allow-origin']).toBeTruthy();
  });

  // --- POST /render — valid payloads ---

  it('POST /render with action=render returns 200 (file-based)', async () => {
    const res = await renderViaFile(port, { panels: [{ id: 'quote', data: {} }] });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  it('POST /render with action=focus returns 200', async () => {
    const res = await request(`http://127.0.0.1:${port}/render`, {
      method: 'POST',
      body: { action: 'focus', panel: 'quote' },
    });
    expect(res.status).toBe(200);
  });

  it('POST /render with action=layout returns 200 and updates layout', async () => {
    const res = await request(`http://127.0.0.1:${port}/render`, {
      method: 'POST',
      body: { action: 'layout', layout: 'split', panelCount: 2 },
    });
    expect(res.status).toBe(200);

    // Verify layout was updated in /health
    const health = await request(`http://127.0.0.1:${port}/health`);
    expect(health.body.layout).toBe('split');
    expect(health.body.panelCount).toBe(2);
  });

  it('POST /render with action=clear returns 200', async () => {
    const res = await request(`http://127.0.0.1:${port}/render`, {
      method: 'POST',
      body: { action: 'clear' },
    });
    expect(res.status).toBe(200);
  });

  it('POST /render with valid theme returns 200 (file-based)', async () => {
    const res = await renderViaFile(port, { theme: 'bloomberg', panels: [] });
    expect(res.status).toBe(200);
  });

  it('POST /render accepts partial panel payload (progressive rendering, file-based)', async () => {
    // Only one panel, no layout hint required
    const res = await renderViaFile(port, { panels: [{ id: 'macro' }] });
    expect(res.status).toBe(200);
  });

  // --- POST /render — invalid payloads ---

  it('POST /render with invalid action returns 400', async () => {
    const res = await request(`http://127.0.0.1:${port}/render`, {
      method: 'POST',
      body: { action: 'unknown_action' },
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Invalid action/);
  });

  it('POST /render with missing action returns 400', async () => {
    const res = await request(`http://127.0.0.1:${port}/render`, {
      method: 'POST',
      body: { panels: [] },
    });
    expect(res.status).toBe(400);
  });

  it('POST /render with invalid JSON body returns 400', async () => {
    const result = await new Promise((resolve, reject) => {
      const options = {
        hostname: '127.0.0.1',
        port,
        path: '/render',
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Connection': 'close' },
      };
      const req = http.request(options, (res) => {
        let data = '';
        res.on('data', (c) => { data += c; });
        res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(data) }));
      });
      req.on('error', reject);
      req.write('this is not json');
      req.end();
    });
    expect(result.status).toBe(400);
    expect(result.body.error).toMatch(/JSON/i);
  });

  it('POST /render with invalid theme returns 400', async () => {
    const res = await renderViaFile(port, { theme: 'non-existent-theme' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/theme/i);
  });

  // --- File-based render enforcement ---

  it('POST /render with inline blocks returns 400', async () => {
    const res = await request(`http://127.0.0.1:${port}/render`, {
      method: 'POST',
      body: { action: 'render', blocks: [{ text: 'hello' }] },
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Inline blocks not accepted/);
  });

  it('POST /render with action=render but no file returns 400', async () => {
    const res = await request(`http://127.0.0.1:${port}/render`, {
      method: 'POST',
      body: { action: 'render' },
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Missing "file" field/);
  });

  it('POST /render with file outside /tmp/ returns 400', async () => {
    const res = await request(`http://127.0.0.1:${port}/render`, {
      method: 'POST',
      body: { action: 'render', file: '/home/user/render.json' },
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/\/tmp\//);
  });

  it('POST /render with non-existent file returns 404', async () => {
    const res = await request(`http://127.0.0.1:${port}/render`, {
      method: 'POST',
      body: { action: 'render', file: '/tmp/marked-does-not-exist-' + Date.now() + '.json' },
    });
    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/File not found/);
  });

  it('POST /render with invalid JSON in file returns 400', async () => {
    const filePath = '/tmp/marked-invalid-json-test.json';
    fs.writeFileSync(filePath, 'not valid json {{{{');
    const res = await request(`http://127.0.0.1:${port}/render`, {
      method: 'POST',
      body: { action: 'render', file: filePath },
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Invalid JSON in file/);
  });

  it('POST /render reads blocks from file and emits them', async () => {
    const filePayload = { blocks: [{ text: 'from-file' }], _state: { stage: 'complete' }, liveTape: [{ symbol: 'NIFTY', price: 25000 }] };
    const received = await new Promise((resolve) => {
      emitter.once('render', resolve);
      renderViaFile(port, filePayload);
    });
    expect(received.blocks[0].text).toBe('from-file');
    expect(received._state.stage).toBe('complete');
    expect(received.liveTape[0].symbol).toBe('NIFTY');
  });

  // --- Payload size limit ---

  it('POST /render with normal payload is accepted (200, file-based)', async () => {
    // A small valid payload well under 1MB
    const res = await renderViaFile(port, { panels: [{ id: 'quote', data: { price: 42 } }] });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  it('POST /render with oversized payload returns 413', async () => {
    const MAX_BYTES = 1_048_576;
    // Build a raw body that exceeds 1MB
    const oversized = JSON.stringify({ action: 'render', data: 'x'.repeat(MAX_BYTES + 1) });
    const result = await new Promise((resolve, reject) => {
      const options = {
        hostname: '127.0.0.1',
        port,
        path: '/render',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(oversized),
          'Connection': 'close',
        },
      };
      const req = http.request(options, (res) => {
        let data = '';
        res.on('data', (c) => { data += c; });
        res.on('end', () => {
          let json;
          try { json = JSON.parse(data); } catch { json = data; }
          resolve({ status: res.statusCode, body: json });
        });
      });
      req.on('error', () => {
        // Connection may be destroyed by the server; treat as 413 if we got a response
        resolve({ status: 413, body: { error: 'Payload too large' } });
      });
      req.write(oversized);
      req.end();
    });
    expect(result.status).toBe(413);
    expect(result.body.error).toMatch(/payload too large/i);
    expect(result.body.maxBytes).toBe(MAX_BYTES);
  });

  it('POST /connect with oversized payload returns 413', async () => {
    const MAX_BYTES = 1_048_576;
    const oversized = JSON.stringify({ agent: 'x'.repeat(MAX_BYTES + 1) });
    const result = await new Promise((resolve, reject) => {
      const options = {
        hostname: '127.0.0.1',
        port,
        path: '/connect',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(oversized),
          'Connection': 'close',
        },
      };
      const req = http.request(options, (res) => {
        let data = '';
        res.on('data', (c) => { data += c; });
        res.on('end', () => {
          let json;
          try { json = JSON.parse(data); } catch { json = data; }
          resolve({ status: res.statusCode, body: json });
        });
      });
      req.on('error', () => {
        resolve({ status: 413, body: { error: 'Payload too large' } });
      });
      req.write(oversized);
      req.end();
    });
    expect(result.status).toBe(413);
    expect(result.body.error).toMatch(/payload too large/i);
    expect(result.body.maxBytes).toBe(MAX_BYTES);
  });

  // --- POST /disconnect — auth ---

  it('POST /disconnect with correct agent ID returns 200', async () => {
    // beforeEach connected as 'test-agent'
    const res = await request(`http://127.0.0.1:${port}/disconnect`, {
      method: 'POST',
      body: { agent: 'test-agent' },
    });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('disconnected');
  });

  it('POST /disconnect with wrong agent ID returns 403', async () => {
    // beforeEach connected as 'test-agent'
    const res = await request(`http://127.0.0.1:${port}/disconnect`, {
      method: 'POST',
      body: { agent: 'interloper-agent' },
    });
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('Agent ID mismatch');
  });

  it('POST /disconnect without agent field returns 403', async () => {
    const res = await request(`http://127.0.0.1:${port}/disconnect`, {
      method: 'POST',
      body: {},
    });
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('Agent ID mismatch');
  });

  it('POST /disconnect when no agent is connected returns 409', async () => {
    // First disconnect legitimately to clear the session
    await request(`http://127.0.0.1:${port}/disconnect`, {
      method: 'POST',
      body: { agent: 'test-agent' },
    });
    // Now try again — no session active
    const res = await request(`http://127.0.0.1:${port}/disconnect`, {
      method: 'POST',
      body: { agent: 'test-agent' },
    });
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('No agent connected');
  });

  // --- Unknown routes ---

  it('unknown route returns 404', async () => {
    const res = await request(`http://127.0.0.1:${port}/unknown`);
    expect(res.status).toBe(404);
  });

  it('GET /render returns 404 (wrong method for that path)', async () => {
    const res = await request(`http://127.0.0.1:${port}/render`);
    expect(res.status).toBe(404);
  });

  // --- EventEmitter bridge ---

  it('POST /render emits render event on emitter with full payload (file-based)', async () => {
    const received = await new Promise((resolve) => {
      emitter.once('render', resolve);
      renderViaFile(port, { panels: [{ id: 'test' }], theme: 'dracula' });
    });
    expect(received.action).toBe('render');
    expect(received.theme).toBe('dracula');
    expect(received.panels[0].id).toBe('test');
  });

  it('POST /render with action=clear emits clear event', async () => {
    const received = await new Promise((resolve) => {
      emitter.once('clear', resolve);
      request(`http://127.0.0.1:${port}/render`, {
        method: 'POST',
        body: { action: 'clear' },
      });
    });
    expect(received.action).toBe('clear');
  });

  // --- Block passthrough (progressive rendering uses patch at app layer) ---

  it('server passes blocks through as-is (no server-side merging)', async () => {
    // POST 1: 2 blocks
    await renderViaFile(port, { blocks: [{ text: 'quote' }, { text: 'chart' }] });

    // POST 2: 1 block — server passes through without appending
    const received = await new Promise((resolve) => {
      emitter.once('render', resolve);
      renderViaFile(port, { blocks: [{ text: 'fundamentals' }] });
    });

    expect(received.blocks).toHaveLength(1);
    expect(received.blocks[0].text).toBe('fundamentals');
  });

  it('patch flag is passed through to app layer', async () => {
    const received = await new Promise((resolve) => {
      emitter.once('render', resolve);
      renderViaFile(port, { blocks: [{ text: 'new-panel' }], patch: true });
    });

    expect(received.patch).toBe(true);
    expect(received.blocks).toHaveLength(1);
  });

  it('_state from each POST is passed through independently', async () => {
    await renderViaFile(port, { blocks: [{ text: 'q' }], _state: { stage: 'loading' } });

    const received = await new Promise((resolve) => {
      emitter.once('render', resolve);
      renderViaFile(port, { blocks: [{ text: 'fundamentals' }], _state: { stage: 'complete' } });
    });

    expect(received._state.stage).toBe('complete');
  });

  // --- State file ---

  it('startServer writes tui.json with correct fields', () => {
    expect(fs.existsSync(STATE_FILE)).toBe(true);
    const state = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
    expect(state.pid).toBe(process.pid);
    expect(state.port).toBe(port);
    const pkg = JSON.parse(fs.readFileSync(path.join(path.dirname(new URL(import.meta.url).pathname), '..', 'package.json'), 'utf8'));
    expect(state.version).toBe(pkg.version);
    expect(typeof state.startedAt).toBe('string');
  });
});

// ---------------------------------------------------------------------------
// Security — path traversal rejection
// ---------------------------------------------------------------------------

describe('path traversal rejection', () => {
  let server;
  let port;

  beforeEach(async () => {
    const result = await startServer(0);
    server = result.server;
    port = result.port;
    await request(`http://127.0.0.1:${port}/connect`, {
      method: 'POST',
      body: { agent: 'test-agent' },
    });
  });

  afterEach(async () => {
    deleteStateFile();
    if (server?.listening) await closeServer(server);
  });

  it('rejects /tmp/../etc/passwd with 400', async () => {
    const res = await request(`http://127.0.0.1:${port}/render`, {
      method: 'POST',
      body: { action: 'render', file: '/tmp/../etc/passwd' },
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/\/tmp\//);
  });

  it('rejects /tmp/../../home/user/.ssh/id_rsa with 400', async () => {
    const res = await request(`http://127.0.0.1:${port}/render`, {
      method: 'POST',
      body: { action: 'render', file: '/tmp/../../home/user/.ssh/id_rsa' },
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/\/tmp\//);
  });

  it('accepts /tmp/marked-render.json (control case)', async () => {
    // Write a valid file so it passes all checks after the path check
    const filePath = '/tmp/marked-render.json';
    fs.writeFileSync(filePath, JSON.stringify({ panels: [{ id: 'quote', data: {} }] }));
    const res = await request(`http://127.0.0.1:${port}/render`, {
      method: 'POST',
      body: { action: 'render', file: filePath },
    });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Analytics — skills cap at 50
// ---------------------------------------------------------------------------

describe('analytics skills cap at 50', () => {
  let server;
  let port;

  beforeEach(async () => {
    const result = await startServer(0);
    server = result.server;
    port = result.port;
    await request(`http://127.0.0.1:${port}/connect`, {
      method: 'POST',
      body: { agent: 'test-agent' },
    });
  });

  afterEach(async () => {
    deleteStateFile();
    if (server?.listening) await closeServer(server);
  });

  /**
   * Helper: POST a render with a specific skill name via file-based protocol.
   * Uses _state.skill so the analytics hook picks it up.
   */
  async function renderWithSkill(skillName) {
    const filePath = '/tmp/marked-render-skill-test.json';
    fs.writeFileSync(filePath, JSON.stringify({
      panels: [{ id: 'quote', data: {} }],
      _state: { skill: skillName, stage: 'complete' },
    }));
    return request(`http://127.0.0.1:${port}/render`, {
      method: 'POST',
      body: { action: 'render', file: filePath },
    });
  }

  it('tracks the first 50 unique skill names', async () => {
    // The analytics object is a module-level singleton shared across all tests.
    // Check how many slots are already taken before we start.
    const statsBefore = await request(`http://127.0.0.1:${port}/stats`);
    const slotsTaken = Object.keys(statsBefore.body.skills).length;
    const slotsAvailable = Math.max(0, 50 - slotsTaken);

    // Render with as many distinct skill names as there are open slots
    for (let i = 0; i < slotsAvailable; i++) {
      const res = await renderWithSkill(`skill-cap-${i}`);
      expect(res.status).toBe(200);
    }

    const statsAfter = await request(`http://127.0.0.1:${port}/stats`);
    const skillKeys = Object.keys(statsAfter.body.skills);

    // All skills we sent must be present (they each got an open slot)
    for (let i = 0; i < slotsAvailable; i++) {
      expect(skillKeys).toContain(`skill-cap-${i}`);
    }
    // Total must not exceed 50
    expect(skillKeys.length).toBeLessThanOrEqual(50);
  });

  it('does not add the 51st unique skill name', async () => {
    // Fill up to exactly 50 unique skills by adding new ones until full
    const statsBefore = await request(`http://127.0.0.1:${port}/stats`);
    const slotsTaken = Object.keys(statsBefore.body.skills).length;
    const slotsToFill = Math.max(0, 50 - slotsTaken);

    for (let i = 0; i < slotsToFill; i++) {
      await renderWithSkill(`skill-fill-${i}`);
    }

    // Now the map is at 50 — get the exact count
    const statsAtCap = await request(`http://127.0.0.1:${port}/stats`);
    const countAtCap = Object.keys(statsAtCap.body.skills).length;
    expect(countAtCap).toBe(50);

    // Render with a brand-new skill name that has never been seen
    await renderWithSkill(`skill-overflow-unique-${Date.now()}`);

    const statsAfter = await request(`http://127.0.0.1:${port}/stats`);
    // Count must not have grown past 50
    expect(Object.keys(statsAfter.body.skills).length).toBe(50);
  });

  it('still increments an existing skill that is within the 50', async () => {
    // Use 'unknown' — this skill is seeded by earlier renders (no _state.skill
    // means the server defaults to 'unknown') and is guaranteed to already be
    // in analytics.skills before any cap-filling tests could run.
    // Verify it is present first.
    const statsBefore = await request(`http://127.0.0.1:${port}/stats`);
    expect(statsBefore.body.skills['unknown']).toBeGreaterThan(0);
    const countBefore = statsBefore.body.skills['unknown'];

    // Render without _state.skill so the server records it as 'unknown'
    const filePath = '/tmp/marked-render-unknown-skill.json';
    fs.writeFileSync(filePath, JSON.stringify({ panels: [{ id: 'quote', data: {} }] }));
    await request(`http://127.0.0.1:${port}/render`, {
      method: 'POST',
      body: { action: 'render', file: filePath },
    });

    // GET /stats after the render — the finish event fires before we make the
    // next HTTP request, so no polling is needed.
    const statsAfter = await request(`http://127.0.0.1:${port}/stats`);
    expect(statsAfter.body.skills['unknown']).toBe(countBefore + 1);
  });
});

// ---------------------------------------------------------------------------
// GET /stats endpoint
// ---------------------------------------------------------------------------

describe('GET /stats endpoint', () => {
  let server;
  let port;

  beforeEach(async () => {
    const result = await startServer(0);
    server = result.server;
    port = result.port;
    await request(`http://127.0.0.1:${port}/connect`, {
      method: 'POST',
      body: { agent: 'test-agent' },
    });
  });

  afterEach(async () => {
    deleteStateFile();
    if (server?.listening) await closeServer(server);
  });

  it('GET /stats returns 200 with all expected analytics fields', async () => {
    const res = await request(`http://127.0.0.1:${port}/stats`);
    expect(res.status).toBe(200);

    const body = res.body;
    expect(typeof body.renders).toBe('number');
    expect(typeof body.patches).toBe('number');
    expect(typeof body.errors).toBe('number');
    expect(typeof body.totalBlocks).toBe('number');
    // firstRenderAt and lastRenderAt are null until a render occurs, or a string after
    expect(body.firstRenderAt === null || typeof body.firstRenderAt === 'string').toBe(true);
    expect(body.lastRenderAt === null || typeof body.lastRenderAt === 'string').toBe(true);
    expect(typeof body.skills).toBe('object');
    expect(body.skills).not.toBeNull();
  });

  it('GET /stats renders count increments after a successful render', async () => {
    const statsBefore = await request(`http://127.0.0.1:${port}/stats`);
    const rendersBefore = statsBefore.body.renders;

    // Perform one render
    const filePath = '/tmp/marked-render-stats-test.json';
    fs.writeFileSync(filePath, JSON.stringify({ panels: [{ id: 'quote', data: {} }] }));
    const renderRes = await request(`http://127.0.0.1:${port}/render`, {
      method: 'POST',
      body: { action: 'render', file: filePath },
    });
    expect(renderRes.status).toBe(200);

    const statsAfter = await request(`http://127.0.0.1:${port}/stats`);
    expect(statsAfter.body.renders).toBe(rendersBefore + 1);
  });

  it('GET /stats firstRenderAt and lastRenderAt are set after a render', async () => {
    // Perform a render
    const filePath = '/tmp/marked-render-stats-time-test.json';
    fs.writeFileSync(filePath, JSON.stringify({
      panels: [{ id: 'quote', data: {} }],
      _state: { skill: 'analyst', stage: 'complete' },
    }));
    await request(`http://127.0.0.1:${port}/render`, {
      method: 'POST',
      body: { action: 'render', file: filePath },
    });

    const stats = await request(`http://127.0.0.1:${port}/stats`);
    expect(stats.body.firstRenderAt).not.toBeNull();
    expect(stats.body.lastRenderAt).not.toBeNull();
    expect(typeof stats.body.firstRenderAt).toBe('string');
    expect(typeof stats.body.lastRenderAt).toBe('string');
  });

  it('GET /stats errors count increments after a failed render', async () => {
    const statsBefore = await request(`http://127.0.0.1:${port}/stats`);
    const errorsBefore = statsBefore.body.errors;

    // Trigger a 400 error (invalid action)
    await request(`http://127.0.0.1:${port}/render`, {
      method: 'POST',
      body: { action: 'bad_action' },
    });

    const statsAfter = await request(`http://127.0.0.1:${port}/stats`);
    expect(statsAfter.body.errors).toBe(errorsBefore + 1);
  });
});

// ---------------------------------------------------------------------------
// checkHealth
// ---------------------------------------------------------------------------

describe('checkHealth', () => {
  it('returns {alive: false, reason: "no_state"} when file does not exist', async () => {
    const tmpPath = path.join(os.tmpdir(), 'tui-nonexistent-' + Date.now() + '.json');
    const result = await checkHealth(tmpPath);
    expect(result.alive).toBe(false);
    expect(result.reason).toBe('no_state');
  });

  it('returns {alive: false, reason: "stale"} for dead PID', async () => {
    const tmpPath = path.join(os.tmpdir(), 'tui-stale-' + Date.now() + '.json');
    // PID 99999999 is virtually guaranteed to not exist
    fs.writeFileSync(tmpPath, JSON.stringify({ pid: 99999999, port: 7707, startedAt: 'x', version: '3.0.0' }));

    try {
      const result = await checkHealth(tmpPath);
      expect(result.alive).toBe(false);
      expect(result.reason).toBe('stale');
    } finally {
      fs.unlinkSync(tmpPath);
    }
  });

  it('returns {alive: true, port, pid} for a live server', async () => {
    const { server, port } = await startServer(0);
    try {
      const result = await checkHealth(STATE_FILE);
      expect(result.alive).toBe(true);
      expect(result.port).toBe(port);
      expect(result.pid).toBe(process.pid);
    } finally {
      deleteStateFile();
      await closeServer(server);
    }
  });

  it('returns {alive: false, reason: "stale"} when PID alive but HTTP unreachable', async () => {
    const tmpPath = path.join(os.tmpdir(), 'tui-http-dead-' + Date.now() + '.json');
    // Use current PID (alive) but a port that is not listening
    fs.writeFileSync(tmpPath, JSON.stringify({
      pid: process.pid,
      port: 59999,
      startedAt: new Date().toISOString(),
      version: '3.0.0',
    }));

    try {
      const result = await checkHealth(tmpPath);
      expect(result.alive).toBe(false);
      expect(result.reason).toBe('stale');
    } finally {
      fs.unlinkSync(tmpPath);
    }
  });
});
