import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { AgentProvider } from './agent-provider.js';
import { parseJsonOutput, runProcess } from './process.js';
import { researchResultSchema } from './output-schema.js';

export class OpenAICodexProvider extends AgentProvider {
  #apiKey;
  constructor({ apiKey, name = 'openai-codex', provider = 'openai-codex', ...options } = {}) {
    super({ name });
    this.options = { ...options, provider };
    this.#apiKey = apiKey;
  }

  async run(prompt, options = {}) {
    this.controller = new AbortController();
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'marked-codex-'));
    const schemaPath = path.join(dir, 'schema.json');
    fs.writeFileSync(schemaPath, JSON.stringify(options.schema || researchResultSchema), { mode: 0o600 });
    try {
      const args = ['--provider', this.options.provider, ...(this.options.model ? ['--model', this.options.model] : []), '--schema', schemaPath];
      if (options.webSearch) args.push('--web-search');
      const result = await runProcess(this.options.command || 'marked-codex', args, {
        cwd: options.cwd,
        env: this.#apiKey ? { ...process.env, OPENAI_API_KEY: this.#apiKey } : process.env,
        input: prompt,
        timeoutMs: options.timeoutMs,
        signal: this.controller.signal,
      });
      return parseJsonOutput(result.stdout);
    } finally {
      this.controller = null;
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }
}
