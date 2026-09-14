export class AgentProvider {
  constructor({ name }) { this.name = name; this.controller = null; }
  async run() { throw new Error(`${this.name} provider is not implemented`); }
  cancel() { this.controller?.abort(); }
  status() { return { provider: this.name, running: Boolean(this.controller) }; }
}

/**
 * The CLI answers with an envelope whose payload may be an object or the same
 * object serialised as a string. Returning the string unparsed looked like a
 * provider that had answered nothing.
 */
export function extractStructuredResult(value) {
  for (const candidate of [value?.structured_output, value?.result]) {
    if (candidate && typeof candidate === 'object') return candidate;
    if (typeof candidate === 'string' && candidate.trim().startsWith('{')) {
      try { return JSON.parse(candidate); } catch { /* fall through to the next candidate */ }
    }
  }
  if (typeof value?.result === 'string') return value.result;
  return value;
}
