import fs from 'node:fs';
import path from 'node:path';
import { CONFIG_PATH } from '../config/paths.js';
import { modelsFor } from '../config/models.js';
import { writeConfig } from './config.js';
import { runProcess } from './process.js';

const step = (current, title) => ({ current, total: 4, title });

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
  while (!/^mk_(?:live|test)_[A-Za-z0-9_-]{20,}$/.test(apiKey)) {
    const answer = await tui.input({
      step: step(2, 'CONNECT MARKED'),
      prompt: 'Paste your Marked API key',
      hint: 'Get a key at https://app.marked.run/dashboard · input is hidden',
      secret: true,
    });
    if (answer.cancelled) throw new Error('Setup cancelled');
    apiKey = answer.value.trim();
  }

  const claude = hasCommand('claude');
  const codex = hasCommand('codex');
  const auth = await codexSignedIn(runCommand);
  const runtime = await tui.ask({
    step: step(3, 'CHOOSE RUNTIME'),
    prompt: 'Choose the reasoning runtime',
    hint: `Detected · Claude Code ${claude ? '✓' : '○'} · Codex CLI ${codex ? '✓' : '○'} · Codex auth ${auth ? '✓' : '○'}`,
    choices: [
      ...(claude ? [{ name: 'Claude Code CLI', subtitle: 'Use the installed Claude CLI', value: 'claude' }] : []),
      ...(codex ? [{ name: 'Codex CLI', subtitle: 'Use the installed Codex CLI', value: 'codex' }] : []),
      { name: 'OpenAI Codex', subtitle: 'Use your ChatGPT/Codex subscription', value: 'openai-codex' },
    ],
  });
  if (!runtime.choice) throw new Error('Setup cancelled');
  const agent = runtime.choice.value;
  if (agent === 'openai-codex' && !auth) await loginCodex(tui, runCommand);

  const available = await discoveredModels(agent, runCommand);
  const model = await tui.ask({
    step: step(4, 'CHOOSE MODEL'),
    prompt: 'Choose a model',
    hint: agent === 'openai-codex' ? 'Models available to this ChatGPT account' : `Models available through ${agent}`,
    choices: available.map(entry => ({ name: entry.label, value: entry.id })),
  });
  if (!model.choice) throw new Error('Setup cancelled');

  writeConfig({
    apiKey,
    apiBase: 'https://api.marked.run',
    agent,
    models: { [agent]: model.choice.value ?? null },
  }, target);
  await tui.render({
    _state: { stage: 'complete', agent, model: model.choice.value },
    blocks: [
      { divider: 'MARKED IS READY' },
      { text: `✓ Setup complete\n\nRuntime  ${agent}\nModel    ${model.choice.value || 'default'}\nConfig   ${target}\n\nPress n to ask your first question.` },
    ],
  });
  return { agent, model: model.choice.value ?? null, target };
}
