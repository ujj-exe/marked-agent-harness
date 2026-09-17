import fs from 'node:fs';
import path from 'node:path';
import { CONFIG_PATH } from '../config/paths.js';
import { agentLabel, modelsFor, requiresApiKey } from '../config/models.js';
import { validateProviderKey, writeConfig } from './config.js';
import { runProcess } from './process.js';

const step = (current, title) => ({ current, total: 4, title });

const API_BASE = 'https://api.marked.run';

/** Show what setup is doing while it waits, so a slow probe is not a dead screen. */
const working = (tui, title, text) => tui.render({
  _state: { stage: 'asking', agent: 'onboarding' },
  blocks: [{ divider: title }, { text }],
});

/**
 * Ask Marked whether this key is real. Only an explicit rejection counts:
 * if the API is unreachable we cannot tell, and blocking setup on a network
 * blip is worse than letting the first query report the problem.
 */
async function keyRejected(apiKey, fetchImpl) {
  try {
    const response = await fetchImpl(`${API_BASE}/v1/companies?limit=1`, {
      headers: { Accept: 'application/json', 'X-API-Key': apiKey },
    });
    return response.status === 401 || response.status === 403;
  } catch { return false; }
}

function commandExists(name, env = process.env) {
  return String(env.PATH || '').split(path.delimiter).some(dir => {
    try { fs.accessSync(path.join(dir, name), fs.constants.X_OK); return true; } catch { return false; }
  });
}

async function command(name, args, options = {}) {
  return runProcess(name, args, options);
}

async function codexSignedIn(runCommand) {
  try {
    const result = await runCommand('marked-auth', ['status']);
    return Boolean(JSON.parse(result.stdout).logged_in);
  } catch { return false; }
}

async function loginCodex(tui, runCommand) {
  let output = '';
  await runCommand('marked-auth', ['login'], {
    onStdout: chunk => {
      output += chunk;
      void tui.render({
        _state: { stage: 'asking', agent: 'onboarding' },
        blocks: [
          { divider: 'STEP 3 OF 4 · OPENAI CODEX' },
          { text: output.trim() || 'Requesting a sign-in code…' },
        ],
      });
    },
  });
}

async function discoveredModels(agent, runCommand) {
  if (agent !== 'openai-codex') return modelsFor(agent);
  try {
    const result = await runCommand('marked-auth', ['models']);
    const live = result.stdout.split('\n').map(value => value.trim()).filter(Boolean);
    if (live.length) return live.map(id => ({ id, label: id }));
  } catch {}
  return modelsFor(agent).filter(model => model.id);
}

export async function runOnboarding(tui, {
  cwd = process.cwd(),
  hasCommand = commandExists,
  runCommand = command,
  fetchImpl = globalThis.fetch,
} = {}) {
  const scope = await tui.ask({
    step: step(1, 'INSTALL SCOPE'),
    prompt: 'Where should Marked keep this configuration?',
    hint: 'The terminal command remains available globally.',
    choices: [
      { name: 'Global', subtitle: '~/.marked/config.json', value: 'global' },
      { name: 'This repository', subtitle: path.join(cwd, '.marked/config.json'), value: 'repo' },
    ],
  });
  if (!scope.choice) throw new Error('Setup cancelled');
  const target = scope.choice.value === 'repo' ? path.join(cwd, '.marked', 'config.json') : CONFIG_PATH;

  let apiKey = '';
  let hint = 'Get a key at https://marked.run · input is hidden';
  while (true) {
    const answer = await tui.input({
      step: step(2, 'CONNECT MARKED'),
      prompt: 'Paste your Marked API key',
      hint,
      secret: true,
    });
    if (answer.cancelled) throw new Error('Setup cancelled');
    apiKey = answer.value.trim();
    if (!/^mk_(?:live|test)_[A-Za-z0-9_-]{20,}$/.test(apiKey)) {
      hint = 'Marked keys start with mk_live_ or mk_test_ · try again';
      continue;
    }
    await working(tui, 'STEP 2 OF 4 · CONNECT MARKED', 'Checking this key with Marked…');
    if (!await keyRejected(apiKey, fetchImpl)) break;
    hint = 'Marked rejected that key · get one at https://marked.run';
  }

  await working(tui, 'STEP 3 OF 4 · CHOOSE RUNTIME', 'Looking for Claude Code, Codex, and existing Codex sign-in…');
  const claude = hasCommand('claude');
  const codex = hasCommand('codex');
  const codexApi = hasCommand('marked-codex');
  const auth = await codexSignedIn(runCommand);
  const runtime = await tui.ask({
    step: step(3, 'CHOOSE RUNTIME'),
    prompt: 'Choose the reasoning runtime',
    hint: `Detected · Claude Code ${claude ? '✓' : '○'} · Codex CLI ${codex ? '✓' : '○'} · Codex auth ${auth ? '✓' : '○'}`,
    choices: [
      ...(claude ? [{ name: 'Claude Code CLI', subtitle: 'Use the installed Claude CLI', value: 'claude' }] : []),
      ...(claude ? [{ name: 'Claude API key', subtitle: 'Usage billed by Anthropic', value: 'claude-api' }] : []),
      ...(codex ? [{ name: 'Codex CLI', subtitle: 'Use the installed Codex CLI', value: 'codex' }] : []),
      ...(codexApi ? [{ name: 'OpenAI API key', subtitle: 'Usage billed by OpenAI', value: 'codex-api' }] : []),
      { name: 'OpenAI Codex', subtitle: 'Use your ChatGPT/Codex subscription', value: 'openai-codex' },
    ],
  });
  if (!runtime.choice) throw new Error('Setup cancelled');
  const agent = runtime.choice.value;
  if (agent === 'openai-codex' && !auth) await loginCodex(tui, runCommand);

  const providerKeys = {};
  if (requiresApiKey(agent)) {
    let hint = 'Input is hidden and stored locally with mode 0600';
    while (true) {
      const answer = await tui.input({
        step: step(3, 'CONNECT MODEL API'),
        prompt: `Paste your ${agentLabel(agent)}`,
        hint,
        secret: true,
      });
      if (answer.cancelled) throw new Error('Setup cancelled');
      try {
        providerKeys[agent] = validateProviderKey(agent, answer.value);
        break;
      } catch (error) {
        hint = `${error.message} · try again`;
      }
    }
  }

  const available = await discoveredModels(agent, runCommand);
  const model = await tui.ask({
    step: step(4, 'CHOOSE MODEL'),
    prompt: 'Choose a model',
    hint: agent === 'openai-codex' ? 'Models available to this ChatGPT account' : `Models available through ${agent}`,
    choices: available.map(entry => ({ name: entry.label, value: entry.id })),
  });
  if (!model.choice) throw new Error('Setup cancelled');

  let previous = {};
  try { previous = JSON.parse(fs.readFileSync(target, 'utf8')); } catch {}
  writeConfig({
    ...previous,
    apiKey,
    apiBase: 'https://api.marked.run',
    agent,
    models: { ...previous.models, [agent]: model.choice.value ?? null },
    providerKeys: { ...previous.providerKeys, ...providerKeys },
  }, target);
  // Reset to the desk: the splash is the home screen, and a setup summary the
  // user cannot act on is a worse landing than the commands they came for.
  await tui.notice(`Marked is ready · ${agent}${model.choice.value ? ` · ${model.choice.value}` : ''} · press n to ask`);
  return { agent, model: model.choice.value ?? null, target };
}
