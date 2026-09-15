import fs, { readFile } from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { TUI_STATE_PATH } from '../config/paths.js';

export class TuiClient {
  constructor({ appPath, agent = 'marked-runtime', model = 'runtime', fetchImpl = globalThis.fetch } = {}) {
    this.appPath = appPath;
    this.agent = agent;
    this.model = model;
    this.fetch = fetchImpl;
    this.child = null;
    this.port = null;
    this.tempDir = null;
    this.queryServer = null;
    this.queryQueue = [];
    this.queryWaiters = [];
    this.onCancel = null;
  }

  async start() {
    await this.startQueryServer();
    this.child = spawn(process.execPath, [this.appPath], {
      stdio: 'inherit',
      env: { ...process.env, MARKED_RUNTIME_URL: `http://127.0.0.1:${this.queryServer.address().port}` },
    });
    this.child.once('close', () => this.receiveQuery(null));
    for (let i = 0; i < 80; i++) {
      try {
        let port = 7707;
        try { port = JSON.parse(await readFile(TUI_STATE_PATH, 'utf8')).port || port; } catch {}
        const state = await (await this.fetch(`http://127.0.0.1:${port}/health`)).json();
        this.port = state.port;
        await this.post('/connect', { agent: this.agent, model: this.model });
        return;
      } catch { await new Promise(resolve => setTimeout(resolve, 100)); }
    }
    this.child.kill('SIGTERM');
    throw new Error('Marked TUI did not become ready');
  }

  async startQueryServer() {
    this.queryServer = http.createServer(async (req, res) => {
      if (req.method !== 'POST' || req.url !== '/query') {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Not found' }));
        return;
      }
      let body = '';
      for await (const chunk of req) {
        body += chunk;
        if (body.length > 16_384) {
          res.writeHead(413, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Query too long' }));
          req.destroy();
          return;
        }
      }
      try {
        const question = JSON.parse(body).question?.trim();
        if (!question) throw new Error('A research question is required');
        this.receiveQuery(question);
        res.writeHead(202, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'accepted' }));
      } catch (error) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: error.message }));
      }
    });
    await new Promise((resolve, reject) => {
      this.queryServer.once('error', reject);
      this.queryServer.listen(0, '127.0.0.1', resolve);
    });
  }

  receiveQuery(question) {
    // A cancel is about the job already running, so it must not join the queue
    // behind it — queued, it would be read as the *next* question and the run
    // the user abandoned would finish anyway.
    if (typeof question === 'string' && /^\/cancel\s*$/i.test(question.trim())) {
      this.onCancel?.();
      return;
    }
    const waiter = this.queryWaiters.shift();
    if (waiter) waiter(question);
    else this.queryQueue.push(question);
  }

  waitForQuery() {
    if (this.queryQueue.length) return Promise.resolve(this.queryQueue.shift());
    return new Promise(resolve => this.queryWaiters.push(resolve));
  }

  /** Re-claim the session so the header shows the provider now in use. */
  async setModel(model) {
    this.model = model;
    if (!this.port) return;
    try { await this.post('/connect', { agent: this.agent, model }); } catch {}
  }

  /** Put a question to the user and wait for the answer they pick. */
  async ask({ prompt, hint, choices, step }) {
    await this.render({ patch: true, _state: { stage: 'asking', ask: { prompt, hint, choices, step } } });
    // Ignore anything that is not an answer to this question: a leftover pick
    // from a dismissed overlay must not be read as the user's choice here.
    for (let attempt = 0; attempt < 4; attempt++) {
      const reply = await this.waitForQuery();
      if (reply === null) return { cancelled: true };
      const match = String(reply).trim().match(/^\/pick\s+(\d+|cancel)$/i);
      if (!match) return { cancelled: true, reply };
      if (match[1].toLowerCase() === 'cancel') return { cancelled: true };
      const index = Number(match[1]) - 1;
      if (index >= 0 && index < choices.length) return { choice: choices[index] };
    }
    return { cancelled: true };
  }

  async input({ prompt, hint, secret = false, step }) {
    await this.render({ patch: true, _state: { stage: 'asking', input: { prompt, hint, secret, step } } });
    const reply = await this.waitForQuery();
    const match = String(reply || '').trim().match(/^\/input\s+(\S+)$/);
    if (!match || match[1] === 'cancel') return { cancelled: true };
    try { return { value: Buffer.from(match[1], 'base64url').toString('utf8') }; }
    catch { return { cancelled: true }; }
  }

  async post(route, payload) {
    const response = await this.fetch(`http://127.0.0.1:${this.port}${route}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
    });
    const text = await response.text();
    if (!response.ok) throw new Error(`Marked TUI request failed (${response.status}): ${text.slice(0, 240)}`);
    return text ? JSON.parse(text) : {};
  }

  async render(payload) {
    this.tempDir ||= await fs.mkdtemp('/tmp/marked-render-');
    const file = path.join(this.tempDir, 'render.json');
    await fs.writeFile(file, JSON.stringify(payload));
    return this.post('/render', { action: 'render', agent: this.agent, file });
  }

  async stop() {
    try { if (this.port) await this.post('/disconnect', { agent: this.agent }); } catch {}
    this.child?.kill('SIGTERM');
    await new Promise(resolve => this.queryServer?.close(() => resolve()) || resolve());
    if (this.tempDir) await fs.rm(this.tempDir, { recursive: true, force: true });
  }

  async notice(message, { reset = true } = {}) {
    if (!this.port) return;
    // Cosmetic: if the TUI has gone away, losing the message is not worth
    // tearing the runtime down for.
    try { return await this.post('/notice', { agent: this.agent, message, reset }); } catch {}
  }
}
