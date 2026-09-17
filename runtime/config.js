import fs from 'node:fs';
import path from 'node:path';
import { CONFIG_PATH, MARKED_HOME, configPath } from '../config/paths.js';
import { AGENTS, API_KEY_AGENTS, isKnownModel } from '../config/models.js';

export function loadConfig() {
  let file = {};
  try { file = JSON.parse(fs.readFileSync(configPath(), 'utf8')); } catch {}
  return {
    ...file,
    apiKey: process.env.MARKED_API_KEY || file.apiKey || file.api_key || '',
    apiBase: process.env.MARKED_API_BASE || file.apiBase || 'https://api.marked.run',
    agent: process.env.MARKED_AGENT || file.agent || 'codex',
    models: { ...file.models, ...(process.env.MARKED_MODEL ? { [process.env.MARKED_AGENT || file.agent || 'codex']: process.env.MARKED_MODEL } : {}) },
    providerKeys: file.providerKeys ?? {},
    home: MARKED_HOME,
  };
}

export function saveApiKey(apiKey, target = configPath()) {
  if (!/^mk_(?:live|test)_[A-Za-z0-9_-]{20,}$/.test(apiKey)) {
    throw new Error('Marked API keys must start with mk_live_ or mk_test_.');
  }
  writeConfig({ ...loadConfig(), apiKey }, target);
}

export function validateProviderKey(agent, apiKey) {
  const key = String(apiKey ?? '').trim();
  if (agent === 'claude-api' && !/^sk-ant-[A-Za-z0-9_-]{16,}$/.test(key)) {
    throw new Error('Claude API keys must start with sk-ant-.');
  }
  if (agent === 'codex-api' && !/^sk-[A-Za-z0-9_-]{16,}$/.test(key)) {
    throw new Error('OpenAI API keys must start with sk-.');
  }
  if (!API_KEY_AGENTS.includes(agent)) throw new Error(`${agent} does not use a Marked-managed API key.`);
  return key;
}

export function saveProviderKey(agent, apiKey, target = configPath()) {
  const current = loadConfig();
  const key = validateProviderKey(agent, apiKey);
  writeConfig({ ...current, providerKeys: { ...current.providerKeys, [agent]: key } }, target);
  return key;
}

export function agentApiKey(config = loadConfig(), agent = config.agent, env = process.env) {
  if (agent === 'claude-api') return env.ANTHROPIC_API_KEY || config.providerKeys?.[agent] || '';
  if (agent === 'codex-api') return env.OPENAI_API_KEY || config.providerKeys?.[agent] || '';
  return '';
}

export function writeConfig(file, target = CONFIG_PATH) {
  const directory = target === CONFIG_PATH ? MARKED_HOME : path.dirname(target);
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  try { fs.chmodSync(directory, 0o700); } catch {}
  delete file.home;
  const tmp = `${target}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, JSON.stringify(file, null, 2) + '\n', { mode: 0o600 });
  fs.chmodSync(tmp, 0o600);
  fs.renameSync(tmp, target);
}

/**
 * Remember the provider, and the model chosen for it. Each provider keeps its
 * own model, so switching back and forth does not lose either choice.
 */
export function saveAgent(agent, model, target = configPath()) {
  if (!AGENTS.includes(agent)) throw new Error(`Unknown agent: ${agent}. Choose ${AGENTS.join(' or ')}.`);
  if (model !== undefined && !isKnownModel(agent, model)) throw new Error(`${agent} does not offer model "${model}".`);
  const current = loadConfig();
  const models = model === undefined ? current.models : { ...current.models, [agent]: model };
  writeConfig({ ...current, agent, models }, target);
  return { agent, model: models?.[agent] ?? null };
}

/** The model this provider should run with, if one was chosen. */
export function agentModel(config, agent = config.agent) {
  return config.models?.[agent] ?? null;
}

export function requireApiKey(config = loadConfig()) {
  if (!config.apiKey) throw new Error('Missing MARKED_API_KEY. Set it in the environment or ~/.marked/config.json.');
  return config.apiKey;
}
