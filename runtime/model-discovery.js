import { runProcess } from './process.js';

const UNSUPPORTED_OPENAI = /(?:audio|realtime|live|image|dall-e|sora|tts|transcri|whisper|embed|moderation|search-preview|computer-use|deep-research|chatgpt|(?:^|-)chat(?:-|$)|instruct|babbage|davinci)/i;
const SUPPORTED_OPENAI = /^(?:gpt-(?:4|5|6|daybreak|reserve)|o[134](?:-|$))/i;

export function supportedOpenAIModels(rows = []) {
  const candidates = rows
    .map(item => typeof item === 'string' ? { id: item, label: item } : {
      id: item?.id ?? item?.slug,
      label: item?.display_name ?? item?.name ?? item?.id ?? item?.slug,
      created: Number(item?.created) || 0,
    })
    .filter(item => typeof item.id === 'string' && SUPPORTED_OPENAI.test(item.id) && !UNSUPPORTED_OPENAI.test(item.id));
  const ids = new Set(candidates.map(item => item.id));
  return candidates
    .filter(item => {
      const base = item.id.replace(/-(?:\d{4}-\d{2}-\d{2}|\d{8})$/, '');
      return base === item.id || !ids.has(base);
    })
    .sort((a, b) => b.created - a.created || a.id.localeCompare(b.id))
    .map(({ id, label }) => ({ id, label }));
}

export async function discoverApiModels(agent, apiKey, fetchImpl = globalThis.fetch) {
  const claude = agent === 'claude-api';
  const response = await fetchImpl(claude
    ? 'https://api.anthropic.com/v1/models?limit=1000'
    : 'https://api.openai.com/v1/models', {
    headers: claude
      ? { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', Accept: 'application/json' }
      : { Authorization: `Bearer ${apiKey}`, Accept: 'application/json' },
  });
  if (!response.ok) throw new Error(`${claude ? 'Claude' : 'ChatGPT'} API key was rejected (HTTP ${response.status}).`);
  const payload = await response.json();
  const models = claude
    ? (payload.data ?? []).filter(item => item?.type === 'model' && /^claude-/i.test(item.id)).map(item => ({ id: item.id, label: item.display_name || item.id }))
    : supportedOpenAIModels(payload.data);
  if (!models.length) throw new Error(`This ${claude ? 'Claude' : 'ChatGPT'} API key exposes no supported research models.`);
  return models;
}

export async function discoverSubscriptionModels(run = runProcess) {
  const result = await run('marked-auth', ['models']);
  const models = supportedOpenAIModels(result.stdout.split('\n').map(id => id.trim()).filter(Boolean));
  if (!models.length) throw new Error('ChatGPT subscription exposes no supported research models.');
  return models;
}
