import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { configPath } from './paths.js';

// Which reasoning providers Marked can drive, and which model each one may use.
// Both are CLIs Marked shells out to, so the model is whatever that CLI accepts
// for `--model`. Claude publishes stable aliases that always resolve to the
// latest model; Codex ships its current catalogue on disk, so read that rather
// than curate a list here that goes stale on the next release.

export const AGENTS = ['claude', 'claude-api', 'codex', 'openai-codex', 'codex-api'];
export const API_KEY_AGENTS = ['claude-api', 'codex-api'];

const AGENT_LABELS = {
  claude: 'Claude Code CLI',
  'claude-api': 'Claude API',
  codex: 'Codex CLI',
  'codex-api': 'ChatGPT API',
  'openai-codex': 'ChatGPT subscription',
};
const AGENT_ALIASES = {
  chatgpt: 'openai-codex',
  'chatgpt-subscription': 'openai-codex',
  'chatgpt-api': 'codex-api',
};

const CODEX_MODELS_CACHE = path.join(os.homedir(), '.codex', 'models_cache.json');

// `claude --help`: "Provide an alias for the latest model (e.g. 'fable',
// 'opus', or 'sonnet') or a model's full name".
const CLAUDE_MODELS = [
  { id: 'opus', label: 'Opus — deepest reasoning' },
  { id: 'fable', label: 'Fable — fast frontier' },
  { id: 'sonnet', label: 'Sonnet — balanced' },
  { id: 'haiku', label: 'Haiku — cheapest' },
];

const CODEX_FALLBACK = [
  'gpt-6-astra', 'gpt-reserve', 'gpt-5.6-sol', 'gpt-5.6-terra',
  'gpt-5.6-luna', 'gpt-daybreak-blue-latest', 'gpt-5.5',
].map(id => ({ id, label: id }));

// A model id becomes an argv entry. Nothing exotic gets to be one.
const VALID_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;

/** Every model on offer for one provider, best first, with a "default" row. */
export function modelsFor(agent) {
  if (API_KEY_AGENTS.includes(agent)) {
    const stored = storedModels(agent);
    const configured = providerKeyConfigured(agent);
    return [
      stored.length
        ? { id: 'connect', label: 'Replace API key · rediscover models' }
        : configured
          ? { id: 'discover', label: 'Discover models using configured key' }
          : { id: 'connect', label: 'Set API key · discover models' },
      ...stored,
    ];
  }
  if (agent === 'openai-codex') {
    const stored = storedModels(agent);
    return [
      stored.length
        ? { id: 'authenticate', label: 'Sign in again · refresh subscription models' }
        : subscriptionConfigured()
          ? { id: 'discover-auth', label: 'Discover models using subscription auth' }
          : { id: 'authenticate', label: 'Sign in · discover subscription models' },
      ...stored,
    ];
  }
  const models = agent.startsWith('claude') ? CLAUDE_MODELS : codexModels();
  return [
    ...(agent === 'codex-api' ? [] : [{ id: null, label: `Default (whatever ${agentLabel(agent)} is configured to use)` }]),
    ...models.filter(model => VALID_ID.test(model.id)),
  ];
}

/** The flat provider × model list the picker renders. */
export function listModels() {
  return AGENTS.flatMap(agent => {
    const status = API_KEY_AGENTS.includes(agent)
      ? providerKeyConfigured(agent) ? 'key set' : 'key not set'
      : agent === 'openai-codex'
        ? subscriptionConfigured() ? 'signed in' : 'not signed in'
        : null;
    return modelsFor(agent).map(model => ({ agent, status, ...model }));
  });
}

export function isKnownModel(agent, modelId) {
  if (!AGENTS.includes(agent)) return false;
  if (!modelId) return true;
  return modelsFor(agent).some(model => model.id === modelId);
}

/** The provider and model currently in force, read from ~/.marked/config.json. */
export function currentModel() {
  let file = {};
  try { file = JSON.parse(fs.readFileSync(configPath(), 'utf8')); } catch {}
  const agent = resolveAgent(process.env.MARKED_AGENT || file.agent || 'codex');
  return { agent, model: process.env.MARKED_MODEL || file.models?.[agent] || null };
}

export function modelLabel(agent, modelId) {
  const label = agentLabel(agent);
  return modelId ? `${label} · ${modelId}` : label;
}

export function agentLabel(agent) { return AGENT_LABELS[agent] ?? agent; }
export function requiresApiKey(agent) { return API_KEY_AGENTS.includes(agent); }
export function resolveAgent(agent) {
  const value = String(agent ?? '').toLowerCase();
  return AGENT_ALIASES[value] ?? value;
}

function storedModels(agent) {
  try {
    const file = JSON.parse(fs.readFileSync(configPath(), 'utf8'));
    const models = file.providerModels?.[agent];
    return Array.isArray(models)
      ? models.filter(model => model && VALID_ID.test(model.id)).map(model => ({ id: model.id, label: String(model.label || model.id).slice(0, 80) }))
      : [];
  } catch { return []; }
}

function providerKeyConfigured(agent) {
  if (agent === 'claude-api' && process.env.ANTHROPIC_API_KEY) return true;
  if (agent === 'codex-api' && process.env.OPENAI_API_KEY) return true;
  try {
    const file = JSON.parse(fs.readFileSync(configPath(), 'utf8'));
    return Boolean(file.providerKeys?.[agent]);
  } catch { return false; }
}

function subscriptionConfigured() {
  try {
    const authPath = process.env.MARKED_AUTH_FILE || path.join(os.homedir(), '.marked', 'auth.json');
    const file = JSON.parse(fs.readFileSync(authPath, 'utf8'));
    return Boolean(file.providers?.['openai-codex']?.tokens?.access_token);
  } catch { return false; }
}

function codexModels() {
  try {
    const cache = JSON.parse(fs.readFileSync(CODEX_MODELS_CACHE, 'utf8'));
    const models = (Array.isArray(cache.models) ? cache.models : [])
      .filter(model => model?.visibility === 'list' && typeof model.slug === 'string')
      .sort((a, b) => (a.priority ?? 999) - (b.priority ?? 999))
      .map(model => ({ id: model.slug, label: String(model.display_name || model.slug).slice(0, 60) }));
    return models.length ? models : CODEX_FALLBACK;
  } catch {
    return CODEX_FALLBACK;
  }
}
