import { describe, expect, it } from 'vitest';
import { OpenAICodexProvider } from './openai-codex-provider.js';

describe('OpenAI Codex provider', () => {
  it('uses the local auth bridge without putting credentials in argv', () => {
    const provider = new OpenAICodexProvider({ model: 'gpt-6-astra' });
    expect(provider.name).toBe('openai-codex');
    expect(provider.options).toEqual({ model: 'gpt-6-astra' });
    expect(JSON.stringify(provider.options)).not.toMatch(/token|secret|api.?key/i);
  });
});
