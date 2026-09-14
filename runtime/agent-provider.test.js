import { describe, expect, it } from 'vitest';
import { createAgentProvider } from './providers.js';
import { CodexProvider } from './codex-provider.js';
import { ClaudeCodeProvider } from './claude-provider.js';
import { OpenAICodexProvider } from './openai-codex-provider.js';

describe('agent providers', () => {
  it('selects the requested worker without coupling the orchestrator to its CLI', () => {
    expect(createAgentProvider('claude')).toBeInstanceOf(ClaudeCodeProvider);
    expect(createAgentProvider('codex')).toBeInstanceOf(CodexProvider);
    expect(createAgentProvider('openai-codex')).toBeInstanceOf(OpenAICodexProvider);
  });
});
