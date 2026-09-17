import { ClaudeCodeProvider } from './claude-provider.js';
import { CodexProvider } from './codex-provider.js';
import { OpenAICodexProvider } from './openai-codex-provider.js';
export { AGENTS } from '../config/models.js';

export function createAgentProvider(name, options = {}) {
  if (name === 'claude') return new ClaudeCodeProvider(options);
  if (name === 'claude-api') return new ClaudeCodeProvider({ ...options, name });
  if (name === 'codex') return new CodexProvider(options);
  if (name === 'codex-api') return new OpenAICodexProvider({ ...options, name, provider: 'openai' });
  if (name === 'openai-codex') return new OpenAICodexProvider(options);
  throw new Error(`Unknown agent provider: ${name}`);
}
