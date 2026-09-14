import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { configPath } from './paths.js';

// Which reasoning providers Marked can drive, and which model each one may use.
// Both are CLIs Marked shells out to, so the model is whatever that CLI accepts
// for `--model`. Claude publishes stable aliases that always resolve to the
// latest model; Codex ships its current catalogue on disk, so read that rather
// than curate a list here that goes stale on the next release.

export const AGENTS = ['claude', 'codex', 'openai-codex'];

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
  const models = agent === 'claude' ? CLAUDE_MODELS : codexModels();
  return [
    { id: null, label: `Default (whatever ${agent} is configured to use)` },
    ...models.filter(model => VALID_ID.test(model.id)),
  ];
}

/** The flat provider × model list the picker renders. */
export function listModels() {
  return AGENTS.flatMap(agent => modelsFor(agent).map(model => ({ agent, ...model })));
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
  const agent = process.env.MARKED_AGENT || file.agent || 'codex';
  return { agent, model: process.env.MARKED_MODEL || file.models?.[agent] || null };
}

export function modelLabel(agent, modelId) {
  return modelId ? `${agent} · ${modelId}` : agent;
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
