import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { AgentProvider } from './agent-provider.js';
import { runProcess, parseJsonOutput } from './process.js';
import { researchResultSchema } from './output-schema.js';

export class CodexProvider extends AgentProvider {
  constructor(options = {}) { super({ name: 'codex' }); this.options = options; }

  async run(prompt, options = {}) {
    const schema = options.schema || researchResultSchema;
    this.controller = new AbortController();
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'marked-agent-'));
    const schemaPath = path.join(dir, 'schema.json');
    const outputPath = path.join(dir, 'result.json');
    fs.writeFileSync(schemaPath, JSON.stringify(schema));
    try {
      await runProcess(this.options.command || 'codex', [
        'exec',
        ...(this.options.model ? ['--model', this.options.model] : []), '--ephemeral', '--ignore-user-config', '--sandbox', 'read-only', '--skip-git-repo-check', '--color', 'never',
        '--output-schema', schemaPath, '--output-last-message', outputPath, '-C', options.cwd || process.cwd(), '-',
      ], { cwd: options.cwd, input: prompt, timeoutMs: options.timeoutMs, signal: this.controller.signal });
      return parseJsonOutput(fs.readFileSync(outputPath, 'utf8'));
    } finally {
      this.controller = null;
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }
}
