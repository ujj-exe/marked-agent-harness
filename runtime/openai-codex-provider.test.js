import { describe, expect, it } from 'vitest';
import { OpenAICodexProvider } from './openai-codex-provider.js';

describe('OpenAI Codex provider', () => {
  it('uses the local auth bridge without putting credentials in argv', () => {
    const provider = new OpenAICodexProvider({ model: 'gpt-6-astra' });
    expect(provider.name).toBe('openai-codex');
    expect(provider.options).toEqual({ model: 'gpt-6-astra', provider: 'openai-codex' });
    expect(JSON.stringify(provider.options)).not.toMatch(/token|secret|api.?key/i);
  });

  it('keeps an OpenAI API key out of argv-visible options', () => {
    const provider = new OpenAICodexProvider({ name: 'codex-api', provider: 'openai', apiKey: 'sk-secret' });
    expect(provider.name).toBe('codex-api');
    expect(provider.options).toEqual({ provider: 'openai' });
    expect(JSON.stringify(provider)).not.toContain('sk-secret');
  });
});
