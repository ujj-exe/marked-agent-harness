#!/usr/bin/env node
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { agentModel, loadConfig, requireApiKey, saveAgent, saveApiKey } from './config.js';
import { MarkedClient } from '../data/marked-client.js';
import { createAgentProvider } from './providers.js';
import { modelLabel } from '../config/models.js';
import { MarkedOrchestrator } from './orchestrator.js';
import { TuiClient } from './tui-client.js';
import { appendConversationTurn, createConversation, formatConversationHistory, loadConversation, saveConversation } from './session.js';
import { DESK, parseDeskCommand, parseModelCommand } from './commands.js';
import { applyAnswer, companyClarification, nextClarification } from './clarify.js';
import { resolvePlan } from './plan.js';
import { runOnboarding } from './onboarding.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let config = loadConfig();
const rawArgs = process.argv.slice(2);
const shouldOnboard = rawArgs.includes('--onboard');
const args = rawArgs.filter(arg => arg !== '--onboard');
const hasHelp = args.includes('--help') || args.includes('-h');

if (hasHelp) {
  const row = (left, right) => `  ${left.padEnd(32)}${right}`;
  console.log(`Marked: a domain-specific agentic harness for Indian equity research.

Usage: marked [options] [research question]

Run with no question to open the terminal and type queries there.

Options
${row('--onboard', 'Re-run setup: API key, runtime and model')}
${row('--agent <name>', 'Reasoning runtime for this run: claude, codex, openai-codex')}
${row('--as-of <ISO-8601>', 'Answer as of a past timestamp instead of now')}
${row('--help, -h', 'Show this help')}

The team. Type these as a query, in the terminal or on the command line
${DESK.map(([name, arg, desc]) => row(`${name}${arg ? ` ${arg}` : ''}`, desc)).join('\n')}

Terminal commands
${row('/marked <key>', 'Save a Marked API key without re-running setup')}
${row('/model', 'Pick the reasoning runtime and model')}
${row('/model claude opus', 'Set runtime and model directly, no picker')}
${row('/new', 'Start a fresh conversation')}
${row('/history', 'Show recent conversation turns')}

Keys
${row('n', 'Ask a question')}
${row('?', 'Full keyboard reference')}
${row('s · l', 'Save a report · load a saved one')}
${row('1-9', 'Run a suggested follow-up')}
${row('q', 'Back to the home screen, or quit from there')}

Companion commands
${row('marked-onboard', 'Re-run setup')}
${row('marked-auth', 'Sign in to OpenAI Codex (login · status · models · logout)')}
${row('marked-chart', 'Render a chart from a saved report')}

Config lives in ~/.marked/config.json. Get an API key at https://marked.run`);
  process.exit(0);
}

const agentIndex = args.indexOf('--agent');
const agentArg = agentIndex >= 0 ? args[agentIndex + 1] : config.agent;
const asOfIndex = args.indexOf('--as-of');
const asOf = asOfIndex >= 0 ? args[asOfIndex + 1] : new Date().toISOString();
if (asOfIndex >= 0 && (!asOf || Number.isNaN(Date.parse(asOf)))) {
  console.error('marked: --as-of must be a valid ISO-8601 timestamp.');
  process.exit(1);
}
const skipped = new Set([agentIndex, agentIndex + 1, asOfIndex, asOfIndex + 1]);
const initialQuestion = args.filter((_, index) => !skipped.has(index)).join(' ').trim();
let startAgent = agentArg || config.agent;
let agent;
let data;
let orchestrator;
let tui;
let conversation = loadConversation();

/** Put one clarification to the user; returns the sharpened question or null. */
async function askClarification(clarification, question) {
  if (!clarification) return null;
  const answer = await tui.ask(clarification);
  return answer.choice ? applyAnswer(question, clarification, answer.choice) : null;
}

let stopped = false;
const stop = async () => { if (stopped) return; stopped = true; agent?.cancel(); await tui?.stop(); };
process.on('SIGINT', () => stop().finally(() => process.exit(130)));
process.on('SIGTERM', () => stop().finally(() => process.exit(143)));

try {
  tui = new TuiClient({ appPath: path.join(root, 'terminal', 'dist', 'app.mjs'), model: modelLabel(startAgent, agentModel(config, startAgent)) });
  await tui.start();
  if (shouldOnboard || !config.apiKey) {
    const setup = await runOnboarding(tui);
    config = loadConfig();
    startAgent = setup.agent;
    await tui.setModel(modelLabel(setup.agent, setup.model));
  }
  agent = createAgentProvider(startAgent, { model: agentModel(config, startAgent) });
  let question = initialQuestion;
  while (true) {
    question = question || await tui.waitForQuery();
    if (!question) break;

    const command = question.match(/^\/marked(?:\s+(\S+))?\s*$/);
    if (command) {
      try {
        if (!command[1]) throw new Error('Paste the key like: /marked mk_live_…');
        saveApiKey(command[1]);
        const saved = loadConfig();
        data = new MarkedClient({ apiKey: requireApiKey(saved), baseUrl: saved.apiBase });
        orchestrator = new MarkedOrchestrator({ data, agent, tui, cwd: root });
        await tui.notice('Marked API key saved locally · press n for a query');
      } catch (error) {
        await tui.notice(error.message);
      }
      question = '';
      continue;
    }

    const selection = parseModelCommand(question);
    if (selection) {
      try {
        if (selection.error) throw new Error(selection.error);
        // A bare /model is handled by the TUI picker; treat it here as a no-op report.
        const chosen = selection.agent ? saveAgent(selection.agent, selection.model) : { agent: agent.name, model: agentModel(loadConfig(), agent.name) };
        if (selection.agent) {
          agent.cancel();
          agent = createAgentProvider(chosen.agent, { model: chosen.model });
          if (orchestrator) orchestrator.agent = agent;
        }
        const label = modelLabel(chosen.agent, chosen.model);
        await tui.setModel(label);
        await tui.notice(`Reasoning model · ${label}`, { reset: false });
      } catch (error) {
        await tui.notice(error.message);
      }
      question = '';
      continue;
    }

    if (/^\/new\s*$/.test(question)) {
      conversation = createConversation();
      saveConversation(conversation);
      await tui.notice('New Marked conversation started');
      question = '';
      continue;
    }

    if (/^\/history\s*$/.test(question)) {
      await tui.notice(formatConversationHistory(conversation, 5).slice(0, 230));
      question = '';
      continue;
    }

    const deskCommand = parseDeskCommand(question);
    if (deskCommand?.error) {
      await tui.notice(deskCommand.error);
      question = '';
      continue;
    }
    // A pick that arrives when nothing is being asked is stale — the overlay was
    // dismissed, or the answer raced the runtime. Drop it silently; reporting it
    // as an unknown command turns a double keypress into a dead query.
    if (/^\/pick\b/i.test(question)) { question = ''; continue; }

    if (!deskCommand && question.startsWith('/')) {
      await tui.notice('Unknown command · press ? for help');
      question = '';
      continue;
    }
    if (deskCommand) question = deskCommand.query;

    if (!data) {
      try {
        const current = loadConfig();
        data = new MarkedClient({ apiKey: requireApiKey(current), baseUrl: current.apiBase });
        orchestrator = new MarkedOrchestrator({ data, agent, tui, cwd: root });
      } catch {
        await tui.notice('No API key · press n and enter /marked <your-api-key>');
        question = '';
        continue;
      }
    }

    // A question the runtime cannot answer well is a question worth asking back.
    // Clarify what the plan leaves open before spending a research run on a
    // reading the user never chose.
    let plan;

    // An unresolved name is the same problem one layer down: ask, then run the
    // same research with the answer substituted in.
    // Retrieve first. The query builder is the last step, not the first: the
    // user's attention is spent only when Marked's planner, this runtime's
    // extractor and the reviewer have all failed to answer the question.
    let attempts = 0;
    while (attempts++ < 3) {
      let session;
      try {
        session = await orchestrator.run(question, { agentName: agent.name, asOf, conversation, intentOverride: deskCommand?.intent, plan });
      } catch (error) {
        const resolved = await askClarification(companyClarification(error), question);
        if (resolved) { question = resolved; plan = undefined; continue; }
        const message = String(error.message || error).replace(/mk_(?:live|test)_[A-Za-z0-9_-]+/g, 'mk_…');
        await tui.notice(`Query failed · ${message}`);
        break;
      }

      if (session.unresolved && attempts < 3) {
        const pending = await nextClarification(data, agent, question, session.data_plan, { cwd: root });
        const sharpened = await askClarification(pending, question);
        if (sharpened) { question = sharpened; plan = undefined; continue; }
      }

      conversation = appendConversationTurn(conversation, session);
      saveConversation(conversation);
      break;
    }
    question = '';
  }
  await stop();
} catch (error) {
  console.error(`marked: ${error.message}`);
  if (process.env.MARKED_DEBUG) console.error(error.stack || error);
  await stop();
  process.exitCode = 1;
}
