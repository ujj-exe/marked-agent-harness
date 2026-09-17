import { describe, expect, it } from 'vitest';
import { createAgentProvider } from './providers.js';
import { CodexProvider } from './codex-provider.js';
import { ClaudeCodeProvider } from './claude-provider.js';
import { OpenAICodexProvider } from './openai-codex-provider.js';

describe('agent providers', () => {
  it('selects the requested worker without coupling the orchestrator to its CLI', () => {
    expect(createAgentProvider('claude')).toBeInstanceOf(ClaudeCodeProvider);
    expect(createAgentProvider('claude-api', { apiKey: 'sk-ant-secret' })).toBeInstanceOf(ClaudeCodeProvider);
    expect(createAgentProvider('codex')).toBeInstanceOf(CodexProvider);
    expect(createAgentProvider('codex-api', { apiKey: 'sk-secret' })).toBeInstanceOf(OpenAICodexProvider);
    expect(createAgentProvider('openai-codex')).toBeInstanceOf(OpenAICodexProvider);
    expect(createAgentProvider('claude-api').name).toBe('claude-api');
    expect(createAgentProvider('codex-api').name).toBe('codex-api');
  });
});
