import { describe, expect, it } from 'vitest';
import { discoverApiModels, discoverSubscriptionModels, supportedOpenAIModels } from './model-discovery.js';

describe('provider model discovery', () => {
  it('keeps supported reasoning models and removes unsupported modalities and duplicate snapshots', () => {
    expect(supportedOpenAIModels([
      { id: 'gpt-6-astra', created: 5 },
      { id: 'gpt-6-astra-2026-08-01', created: 6 },
      { id: 'gpt-realtime-2.1', created: 7 },
      { id: 'gpt-image-2', created: 8 },
      { id: 'text-embedding-3-large', created: 9 },
      { id: 'o3', created: 4 },
    ]).map(model => model.id)).toEqual(['gpt-6-astra', 'o3']);
  });

  it('authenticates API keys against their model endpoints', async () => {
    const calls = [];
    const fetchImpl = async (url, options) => {
      calls.push({ url, options });
      return url.includes('anthropic')
        ? { ok: true, json: async () => ({ data: [{ id: 'claude-opus-5', display_name: 'Claude Opus 5', type: 'model' }] }) }
        : { ok: true, json: async () => ({ data: [{ id: 'gpt-6-astra' }, { id: 'gpt-audio-1.5' }] }) };
    };
    expect(await discoverApiModels('claude-api', 'sk-ant-secret-key-1234', fetchImpl)).toEqual([{ id: 'claude-opus-5', label: 'Claude Opus 5' }]);
    expect(await discoverApiModels('codex-api', 'sk-secret-key-123456', fetchImpl)).toEqual([{ id: 'gpt-6-astra', label: 'gpt-6-astra' }]);
    expect(calls[0].options.headers['x-api-key']).toBe('sk-ant-secret-key-1234');
    expect(calls[1].options.headers.Authorization).toBe('Bearer sk-secret-key-123456');
  });

  it('filters the authenticated ChatGPT subscription catalogue', async () => {
    const models = await discoverSubscriptionModels(async () => ({ stdout: 'gpt-6-astra\ngpt-realtime-2.1\n' }));
    expect(models.map(model => model.id)).toEqual(['gpt-6-astra']);
  });
});
