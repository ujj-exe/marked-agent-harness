/**
 * io.js — HTTP helpers, Marked API health, report save/load.
 *
 * No React dependencies. Pure I/O and network functions.
 */

import http from 'http';
import fs from 'fs';
import path from 'path';
import { BRAND, BOLD, DIM, RESET, REPORTS_DIR, tui } from './state.js';
import { emitter, connectedAgent } from './server.js';

// ── HTTP helpers (no external deps) ─────────────────────────────────────────

export function httpGet(url) {
  return new Promise((resolve, reject) => {
    const req = http.get(url, { timeout: 3000 }, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => {
        try { resolve(JSON.parse(data)); } catch { resolve(data); }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
  });
}

export function httpPost(url, body) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const parsed = new URL(url);
    const req = http.request({
      hostname: parsed.hostname,
      port: parsed.port,
      path: parsed.pathname,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) },
      timeout: 10000,
    }, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => {
        try { resolve(JSON.parse(data)); } catch { resolve(data); }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
    req.write(payload);
    req.end();
  });
}

/**
 * Health check on startup — probe the Marked API, update splash status.
 * Never auto-fetches data or transitions to live. TUI stays on splash
 * until the Marked runtime connects via POST /render.
 */
export async function healthCheck() {
  // The probe is slower than /connect, so landing late must not stamp
  // "Waiting for Marked API" over a runtime that is already attached.
  if (connectedAgent()) return;
  let markedUp = false;
  try {
    const response = await fetch('https://api.marked.run/v1/');
    markedUp = response.status !== 401 && response.status < 500;
  } catch { markedUp = false; }

  if (connectedAgent()) return;
  emitter.emit('_splash', { msg: markedUp ? 'Waiting for Marked runtime' : 'Waiting for Marked API' });
}

export async function submitQuery(question) {
  const runtimeUrl = process.env.MARKED_RUNTIME_URL;
  if (!runtimeUrl) throw new Error('Marked runtime query channel unavailable');
  const response = await fetch(`${runtimeUrl}/query`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ question }),
  });
  if (!response.ok) throw new Error((await response.text()).slice(0, 240));
}

// ── Report save/load ────────────────────────────────────────────────────────

export function saveReport() {
  if (!tui.lastBlocks) return null;
  try {
    fs.mkdirSync(REPORTS_DIR, { recursive: true });
    const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 16);
    const textBlock = tui.lastBlocks.find(b => b.text);
    const ticker = textBlock?.text?.match(/·\s+([A-Z/]+)/)?.[1]?.replace(/\s/g, '-') ?? 'report';
    const filename = `${ts}-${ticker}.json`;
    fs.writeFileSync(
      path.join(REPORTS_DIR, filename),
      JSON.stringify({ blocks: tui.lastBlocks, meta: tui.renderMeta, saved_at: new Date().toISOString() }, null, 2),
    );
    return filename;
  } catch { return null; }
}

export function listReports() {
  try {
    if (!fs.existsSync(REPORTS_DIR)) return [];
    return fs.readdirSync(REPORTS_DIR)
      .filter(f => f.endsWith('.json'))
      .sort()
      .reverse()
      .slice(0, 20);
  } catch { return []; }
}
