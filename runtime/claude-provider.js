import { AgentProvider, extractStructuredResult } from './agent-provider.js';
import { runProcess, parseJsonOutput } from './process.js';
import { createNdjsonReader, createProgressTracker } from './stream-events.js';
import { researchResultSchema } from './output-schema.js';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

/** An empty server list — the only MCP config this provider is allowed to see. */
const NO_MCP_CONFIG = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'config', 'no-mcp.json');

export class ClaudeCodeProvider extends AgentProvider {
  constructor(options = {}) { super({ name: 'claude' }); this.options = options; }

  /**
   * @param {string} prompt
   * @param {{cwd?: string, timeoutMs?: number, schema?: object, onProgress?: (state: object) => void}} options
   *   `onProgress` is called as the model thinks and writes. The answer takes
   *   around two minutes and the terminal used to show a spinner for all of it.
   */
  async run(prompt, options = {}) {
    this.controller = new AbortController();
    // The final envelope arrives as one more line on the same stream, so it is
    // captured here rather than parsed back out of the whole transcript.
    let envelope = null;
    const tracker = createProgressTracker(options.onProgress);
    const read = createNdjsonReader(event => {
      if (event?.type === 'result') envelope = event;
      else tracker.handle(event);
    });
    try {
      const result = await runProcess(
        this.options.command || 'claude',
        claudeArgs(this.options, prompt, process.env, options.schema, options.webSearch),
        { cwd: options.cwd, timeoutMs: options.timeoutMs, signal: this.controller.signal, onStdout: read },
      );
      read.finish();
      tracker.finish();
      return extractStructuredResult(envelope ?? parseJsonOutput(result.stdout));
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
export function claudeArgs({ model } = {}, prompt = '', env = process.env, schema = researchResultSchema, webSearch = false) {
  return [
    // This call reasons over a packet and calls no tools, so loading the user's
    // project MCP servers costs a slower session boot (measured: 6.7s → 4.4s)
    // and lets an unrelated project's config leak into a research answer.
    // `--mcp-config` is variadic, so it must never sit directly before the
    // positional prompt — it would read the prompt as another config path.
    '--mcp-config', NO_MCP_CONFIG, '--strict-mcp-config',
    ...(model ? ['--model', model] : []),
    ...(env.ANTHROPIC_API_KEY ? ['--bare'] : []),
    '-p', '--restricted', '--permission-prompts', 'none', '--no-session-persistence',
    ...(webSearch ? ['--tools', 'WebSearch,WebFetch', '--allowedTools', 'WebSearch,WebFetch'] : ['--tools', '']),
    // Streamed, not buffered: the document is the same either way, but this way
    // the terminal can show it being written instead of a spinner. `--verbose`
    // and `--include-partial-messages` are required by the CLI for this format.
    '--output-format', 'stream-json', '--verbose', '--include-partial-messages',
    '--json-schema', JSON.stringify(schema),
    '--append-system-prompt', webSearch
      ? 'You work inside Marked. Use only native WebSearch and WebFetch when the prompt grants them. Never run commands, render UI, write files, or invent facts.'
      : 'You work inside Marked. Never retrieve data, render UI, write files, or invent facts. Use only what the prompt supplies.',
    prompt,
  ];
}

/** The CLI reports failures inside its JSON envelope; surface the readable part. */
function claudeFailure(error) {
  try {
    const envelope = lastResultEvent(String(error.stdout || ''));
    if (envelope.terminal_reason === 'api_error' && !envelope.usage?.input_tokens) {
      return 'the CLI could not authenticate. Sign in with `claude` or set ANTHROPIC_API_KEY.';
    }
    return String(envelope.result || envelope.error || envelope.terminal_reason || error.message).slice(0, 200);
  } catch {
    return String(error.message).slice(0, 200);
  }
}

/** The failure envelope is one line of the stream, not the whole of stdout. */
function lastResultEvent(stdout) {
  const lines = stdout.trim().split('\n').filter(Boolean);
  for (let i = lines.length - 1; i >= 0; i--) {
    try {
      const value = JSON.parse(lines[i]);
      if (value?.type === 'result' || value?.terminal_reason || value?.error) return value;
    } catch { /* not this line */ }
  }
  return JSON.parse(stdout.trim());
}
