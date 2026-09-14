import { AgentProvider, extractStructuredResult } from './agent-provider.js';
import { runProcess, parseJsonOutput } from './process.js';
import { researchResultSchema } from './output-schema.js';

export class ClaudeCodeProvider extends AgentProvider {
  constructor(options = {}) { super({ name: 'claude' }); this.options = options; }

  async run(prompt, options = {}) {
    this.controller = new AbortController();
    try {
      const result = await runProcess(this.options.command || 'claude', claudeArgs(this.options, prompt, process.env, options.schema), { cwd: options.cwd, timeoutMs: options.timeoutMs, signal: this.controller.signal });
      return extractStructuredResult(parseJsonOutput(result.stdout));
    } catch (error) {
      throw new Error(`claude · ${claudeFailure(error)}`);
    } finally { this.controller = null; }
  }
}

/**
 * `--bare` reads credentials strictly from ANTHROPIC_API_KEY and never from OAuth
 * or the keychain, so asking for it on a subscription login produces an api_error
 * with no explanation. Take the isolation only when a key is actually present.
 */
export function claudeArgs({ model } = {}, prompt = '', env = process.env, schema = researchResultSchema) {
  return [
    ...(model ? ['--model', model] : []),
    ...(env.ANTHROPIC_API_KEY ? ['--bare'] : []),
    '-p', '--restricted', '--permission-prompts', 'none', '--no-session-persistence',
    '--output-format', 'json', '--json-schema', JSON.stringify(schema),
    '--append-system-prompt', 'You work inside Marked. Never retrieve data, render UI, write files, or invent facts. Use only what the prompt supplies.',
    prompt,
  ];
}

/** The CLI reports failures inside its JSON envelope; surface the readable part. */
function claudeFailure(error) {
  try {
    const envelope = JSON.parse(String(error.stdout || '').trim());
    if (envelope.terminal_reason === 'api_error' && !envelope.usage?.input_tokens) {
      return 'the CLI could not authenticate. Sign in with `claude` or set ANTHROPIC_API_KEY.';
    }
    return String(envelope.result || envelope.error || envelope.terminal_reason || error.message).slice(0, 200);
  } catch {
    return String(error.message).slice(0, 200);
  }
}
