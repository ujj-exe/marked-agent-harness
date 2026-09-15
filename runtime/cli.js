#!/usr/bin/env node
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { agentModel, loadConfig, requireApiKey, saveAgent, saveApiKey } from './config.js';
import { MarkedClient } from '../data/marked-client.js';
import { createAgentProvider } from './providers.js';
import { modelLabel } from '../config/models.js';
import { CancelledError, MarkedOrchestrator } from './orchestrator.js';
import { parseMnemonic } from './mnemonics.js';
import { createWorld, parseWorldCommand, worldBlocks, setChartView, worldScope, stepTab } from './world.js';
import { parseCompare, compareBlocks } from './compare.js';
import { parseMarketCommand, marketBlocks } from './market.js';
import { parseNewsCommand, newsBlocks } from './news.js';
import { worldEvidence } from './evidence.js';
import { rememberWorld, restoreWorld, recentWorlds } from './world-state.js';
import { TuiClient } from './tui-client.js';
import { appendConversationTurn, createConversation, formatConversationHistory, loadConversation, saveConversation } from './session.js';
import { CAPABILITIES, DESK, LIVE, parseCapabilityCommand, parseDeskCommand, parseLiveCommand, parseModelCommand } from './commands.js';
import { runCapability } from './capabilities.js';
import { fetchLiveTape, liveTapeBlock } from './live-tape.js';
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

Power workflows
${CAPABILITIES.map(([name, arg, desc]) => row(`${name} ${arg}`, desc)).join('\n')}

Terminal commands
${row('/marked <key>', 'Save a Marked API key without re-running setup')}
${row('/model', 'Pick the reasoning runtime and model')}
${row('/model claude opus', 'Set runtime and model directly, no picker')}
${row('/new', 'Start a fresh conversation')}
${row('/history', 'Show recent conversation turns')}
${row('/live [symbols]', 'Poll live API quotes in a compact tape; /live off disables it')}

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
// Only skip a flag's slots when the flag is actually present: `indexOf` gives
// -1 when it is absent, and -1 + 1 is 0, which silently ate the first word of
// every question typed on the command line.
const skipped = new Set([
  ...(agentIndex >= 0 ? [agentIndex, agentIndex + 1] : []),
  ...(asOfIndex >= 0 ? [asOfIndex, asOfIndex + 1] : []),
]);
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

/**
 * Build the Marked client and orchestrator on first need.
 *
 * This used to live inline in the loop, below the command dispatch, so any
 * command that needed data before reaching it — `/world` among them — ran
 * against an orchestrator that did not exist yet and silently did nothing.
 *
 * @returns {Promise<boolean>} whether a usable orchestrator exists
 */
async function ensureOrchestrator() {
  if (orchestrator) return true;
  try {
    const current = loadConfig();
    data = new MarkedClient({ apiKey: requireApiKey(current), baseUrl: current.apiBase });
    orchestrator = new MarkedOrchestrator({ data, agent, tui, cwd: root });
    return true;
  } catch {
    await tui.notice('No API key · type /marked <your-api-key>');
    return false;
  }
}

/**
 * The market-wide news feed, optionally narrowed.
 *
 * A bare word is tried as a topic and then as a region rather than making the
 * user remember which is which — `/news rates` and `/news india` both work.
 */
async function showNews(filter) {
  try {
    const params = { limit: 30 };
    if (filter) {
      const vocabulary = await data.newsVocabulary().catch(() => null);
      const topics = vocabulary?.data?.topics ?? [];
      const regions = vocabulary?.data?.regions ?? [];
      const wanted = filter.toLowerCase();
      if (topics.includes(wanted)) params.topic = wanted;
      else if (regions.includes(wanted)) params.region = wanted;
      else {
        await tui.notice(`"${filter}" is not a topic or region · try ${topics.slice(0, 6).join(', ')}`);
        return;
      }
    }
    const response = await data.news(params);
    await tui.render({
      blocks: newsBlocks(response?.data ?? [], { title: filter ? `NEWS · ${filter.toUpperCase()}` : 'NEWS' }),
      meta: { as_of: asOf },
    });
  } catch (error) {
    await tui.notice(`News unavailable · ${String(error.message || error).slice(0, 120)}`);
  }
}

/** News naming this company, fetched once per world. */
async function loadNews(world) {
  if (Array.isArray(world.news) || !await ensureOrchestrator()) return;
  try {
    const response = await data.news({ ticker: world.symbol, limit: 30 });
    world.news = Array.isArray(response?.data) ? response.data : [];
  } catch {
    world.news = [];
  }
}

/**
 * Companies sharing this one's sector, fetched once.
 *
 * The sector string has to match exactly — it is the company's own reported
 * classification, not a category we invent.
 */
async function loadPeers(world) {
  if (world.peers || !world.sector || !await ensureOrchestrator()) return;
  try {
    const response = await data.companies({ sector: world.sector, limit: 25 });
    const rows = Array.isArray(response?.data) ? response.data : [];
    world.peers = rows.filter(row => row.company_id !== world.company_id).slice(0, 20);
  } catch {
    world.peers = [];
  }
}

// What the search overlay is currently showing, so a pick refers to the same
// list the user was looking at.
let searchHits = [];

/**
 * Companies matching what has been typed so far.
 *
 * Exact ticker and ISIN matches lead: someone who types INFY means INFY, and
 * burying it under fuzzy name matches would be the wrong answer quickly.
 */
async function searchCompanies(query) {
  const text = String(query ?? '').trim();
  if (text.length < 2 || !await ensureOrchestrator()) { searchHits = []; return []; }
  try {
    const response = await data.search({ query: text, kinds: ['company', 'security'], limit: 20 });
    const rows = Array.isArray(response?.data) ? response.data : [];

    // A search result is `{kind, title, subtitle, company_id, score}`: a
    // security carries its symbol in `title` and "NSE CASH EQ" in `subtitle`.
    // One company can appear as several rows — a company record plus its NSE
    // and BSE listings — and they are all one world.
    const companies = new Map();
    const take = (key) => companies.get(key) ?? companies.set(key, { name: null, symbol: null, exchange: null, score: 0 }).get(key);

    for (const row of rows) {
      const key = row.company_id ?? row.title;
      if (!key) continue;
      const hit = take(key);
      hit.score = Math.max(hit.score, Number(row.score) || 0);
      if (row.kind === 'company') { hit.name ??= row.title; continue; }

      // Futures and options are not the company; a ticker search should not
      // offer INFY26NOVFUT above INFY.
      const segment = String(row.subtitle ?? '');
      if (!/CASH\s*EQ/i.test(segment)) continue;
      const exchange = segment.split(/\s+/)[0] || null;
      // Prefer the NSE listing when a company has both.
      if (!hit.symbol || (exchange === 'NSE' && hit.exchange !== 'NSE')) {
        hit.symbol = row.title;
        hit.exchange = exchange;
      }
    }

    const wanted = text.toUpperCase();
    searchHits = [...companies.values()]
      .filter(hit => hit.name || hit.symbol)
      .map(hit => ({
        name: hit.name ?? hit.symbol,
        symbol: hit.symbol,
        exchange: hit.exchange,
        isin: null,
        reference: hit.symbol ?? hit.name,
      }))
      .sort((a, b) => exactness(b, wanted) - exactness(a, wanted))
      .slice(0, 10);
    return searchHits;
  } catch {
    searchHits = [];
    return [];
  }
}

function exactness(hit, wanted) {
  if (String(hit.symbol ?? '').toUpperCase() === wanted) return 4;
  if (String(hit.name ?? '').toUpperCase() === wanted) return 3;
  if (String(hit.name ?? '').toUpperCase().startsWith(wanted)) return 2;
  if (String(hit.symbol ?? '').toUpperCase().startsWith(wanted)) return 1;
  return 0;
}

/**
 * Fetch the restatement trail for one evidence reference.
 *
 * Every version of a number that was ever published, which is the question a
 * reader actually has when they open a source. Fetched on demand rather than
 * for all 134 records up front, and cached on the record so reopening is free.
 */
async function loadTrail(world, ref) {
  const record = worldEvidence(world).byRef.get(String(ref).toUpperCase());
  if (!record || record.trail || record.trail_error) return;
  const concept = record.metric;
  // Instants and flows both carry a period end; without one there is no
  // identity to ask about.
  const periodEnd = record.period_end ?? record.period;
  const reference = world.symbol || world.company_id;
  if (!concept || !periodEnd || !reference || !/^\d{4}-\d{2}-\d{2}$/.test(String(periodEnd))) {
    record.trail_error = 'this record has no period-end date to trace';
    return;
  }
  try {
    const response = await data.provenance({
      reference, concept, periodEnd: String(periodEnd), basis: record.basis ?? 'consolidated',
    });
    record.trail = Array.isArray(response?.data) ? response.data : [];
  } catch (error) {
    record.trail_error = String(error.message || error).slice(0, 120);
  }
}

/**
 * Open a comparison workspace.
 *
 * Each company is retrieved exactly as a world is — one packet, no reasoning
 * provider — and the table is built from those packets, so a figure here and
 * the same figure inside a world cannot disagree.
 */
async function openComparison(references) {
  if (!await ensureOrchestrator()) return;
  const members = [];
  for (const reference of references) {
    const world = await openWorld(reference, 0, { render: false });
    // A name that cannot be resolved is reported by openWorld; carrying on with
    // the rest beats abandoning a four-company comparison over one typo.
    if (world) members.push({ world });
  }
  if (members.length < 2) {
    await tui.notice('A comparison needs at least two companies that resolve');
    return;
  }
  await tui.render({
    blocks: compareBlocks(members),
    meta: { as_of: asOf },
    scope: { ticker: members.map(m => m.world.symbol).join('×'), detail: `${members.length} companies · CONSOLIDATED` },
  });
}

/**
 * Resolve a reference and open its Company World.
 *
 * The retrieval is the same `dataOnly` company run the fast path already uses,
 * so the user watches the panels fill as usual; the world then replaces that
 * render with its own tabbed view of the packet that run produced. Nothing is
 * fetched twice, and no reasoning provider is launched — a world is data.
 *
 * An ambiguous name is put back to the user before anything is fetched, so a
 * world never opens on a company nobody chose.
 *
 * @returns {Promise<object|null>} the world, or null if it could not be opened
 */
async function openWorld(reference, attempt = 0, { render = true } = {}) {
  if (!await ensureOrchestrator()) return null;
  try {
    const session = await orchestrator.run(reference, {
      agentName: agent.name,
      asOf,
      intentOverride: { kind: 'company', references: [reference] },
      dataOnly: true,
      suppressBlocks: true,
    });
    const packet = session.packet ?? {};
    if (!packet.entity || !packet.security) {
      await tui.notice(`No tradable security resolved for "${reference}"`);
      return null;
    }
    const { width, height } = await tui.dimensions();
    // Fresh data, remembered view: the packet is always re-retrieved, only the
    // tab and chart come back from last time.
    const world = restoreWorld(createWorld({ entity: packet.entity, security: packet.security, packet, evidence: session.evidence ?? [], asOf, width, height }));
    if (world.tab === 'peers') await loadPeers(world);
    if (world.tab === 'news') await loadNews(world);
    if (render) {
      rememberWorld(world);
      await tui.render({ blocks: worldBlocks(world), meta: { as_of: asOf }, scope: worldScope(world) });
    }
    return world;
  } catch (error) {
    if (error instanceof CancelledError || error?.cancelled) {
      await tui.notice('Cancelled');
      return null;
    }
    const sharpened = attempt === 0 ? await askClarification(companyClarification(error), reference) : null;
    if (sharpened) return openWorld(sharpened, attempt + 1, { render });
    await tui.notice(`Could not open a world for "${reference}" · ${String(error.message || error).slice(0, 120)}`);
    return null;
  }
}

let stopped = false;
let liveTimer = null;
let liveSymbols = [];
let liveRefresh = null;
const stopLive = () => { if (liveTimer) clearInterval(liveTimer); liveTimer = null; liveSymbols = []; };
const refreshLive = async () => {
  if (!data || !liveSymbols.length || liveRefresh) return;
  liveRefresh = fetchLiveTape(data, liveSymbols)
    .then(rows => tui.render({ patch: true, blocks: [liveTapeBlock(rows)], liveTape: rows }))
    .catch(() => {})
    .finally(() => { liveRefresh = null; });
  await liveRefresh;
};
const startLive = async symbols => {
  stopLive();
  liveSymbols = symbols;
  if (!liveSymbols.length) {
    await tui.render({ patch: true, liveTape: [], blocks: [{ text: 'Live tape disabled', id: 'live-tape' }] });
    return;
  }
  await refreshLive();
  liveTimer = setInterval(refreshLive, 15_000);
  liveTimer.unref?.();
};
const stop = async () => { if (stopped) return; stopped = true; stopLive(); agent?.cancel(); await tui?.stop(); };
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
  // `orchestrator` is rebuilt when the key or model changes, so resolve it at
  // call time rather than capturing whichever instance existed at startup.
  tui.onCancel = () => { orchestrator?.abort(); agent?.cancel?.(); };
  // The open Company World, or null. It is a mode the user enters; every
  // interaction outside it behaves exactly as it did before.
  let world = null;
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

    // `/compare INFY TCS HCLTECH` — the same metric library across companies,
    // so every column was computed the same way.
    // Global surfaces: market context and the news feed. Both work inside a
    // world and outside one, and neither disturbs the open workspace.
    const market = parseMarketCommand(question);
    if (market) {
      if (await ensureOrchestrator()) {
        try {
          const context = await data.marketContext();
          await tui.render({ blocks: marketBlocks(context), meta: { as_of: asOf } });
        } catch (error) {
          await tui.notice(`Market context unavailable · ${String(error.message || error).slice(0, 120)}`);
        }
      }
      question = '';
      continue;
    }

    // A bare `/news` inside a world means this company's news, which the NEWS
    // tab already is, so it falls through to the tab. A topic or region is
    // explicitly market-wide, so it reaches the global feed from anywhere —
    // otherwise `/news rates` inside a world was simply an unknown command.
    const news = parseNewsCommand(question);
    if (news && (!world || news.filter)) {
      if (await ensureOrchestrator()) await showNews(news.filter);
      question = '';
      continue;
    }

    const compare = parseCompare(question);
    if (compare) {
      if (compare.error) await tui.notice(compare.error);
      else await openComparison(compare.references);
      question = '';
      continue;
    }

    const worldCommand = parseWorldCommand(question, { inWorld: Boolean(world) });
    if (worldCommand) {
      if (worldCommand.error) {
        await tui.notice(worldCommand.error);
      } else if (worldCommand.kind === 'exit') {
        world = null;
        await tui.render({ patch: true, scope: null });
        await tui.notice('Left the world · normal Marked interaction restored');
      } else if (worldCommand.kind === 'chart') {
        const outcome = setChartView(world, worldCommand.args);
        if (outcome.error) await tui.notice(outcome.error);
        else {
          // Comparators are retrieved once and parked on the world, so moving
          // between tabs and measures never fetches them again.
          for (const reference of outcome.view.versus ?? []) {
            const key = reference.toUpperCase();
            if (world.comparators[key]) continue;
            const other = await openWorld(reference, 0, { render: false });
            if (other) world.comparators[key] = other;
            else outcome.view.versus = outcome.view.versus.filter(name => name.toUpperCase() !== key);
          }
          await tui.render({ blocks: worldBlocks(world), meta: { as_of: world.as_of }, scope: worldScope(world) });
        }
      } else if (worldCommand.kind === 'search') {
        // Opening search with nothing typed offers where you have been, which
        // is the answer often enough to be worth the zero keystrokes.
        if (await ensureOrchestrator()) {
          searchHits = recentWorlds();
          await tui.render({ patch: true, _state: { search: { query: '', results: searchHits } } });
        }
      } else if (worldCommand.kind === 'searching') {
        await tui.render({ patch: true, _state: { search: { query: worldCommand.query, results: await searchCompanies(worldCommand.query) } } });
      } else if (worldCommand.kind === 'searchCancel') {
        searchHits = [];
      } else if (worldCommand.kind === 'searchPick') {
        const hit = searchHits[worldCommand.index];
        if (hit) world = await openWorld(hit.reference);
        else await tui.notice('That result is no longer on screen');
      } else if (worldCommand.kind === 'evidence') {
        world.evidenceRef = worldCommand.ref;
        world.tab = 'evidence';
        await loadTrail(world, worldCommand.ref);
        await tui.render({ blocks: worldBlocks(world), meta: { as_of: world.as_of }, scope: worldScope(world) });
      } else if (worldCommand.kind === 'step') {
        world.evidenceRef = null;
        world.tab = stepTab(world.tab, worldCommand.delta);
        if (world.tab === 'peers') await loadPeers(world);
        if (world.tab === 'news') await loadNews(world);
        rememberWorld(world);
        await tui.render({ blocks: worldBlocks(world), meta: { as_of: world.as_of }, scope: worldScope(world) });
      } else if (worldCommand.kind === 'tab') {
        if (worldCommand.tab !== 'evidence') world.evidenceRef = null;
        world.tab = worldCommand.tab;
        if (worldCommand.tab === 'peers') await loadPeers(world);
        if (worldCommand.tab === 'news') await loadNews(world);
        rememberWorld(world);
        // No refetch: the tab is a view over the packet already in memory.
        await tui.render({ blocks: worldBlocks(world), meta: { as_of: world.as_of }, scope: worldScope(world) });
      } else {
        world = await openWorld(worldCommand.reference);
      }
      question = '';
      continue;
    }

    const deskCommand = parseDeskCommand(question);
    const capability = parseCapabilityCommand(question);
    const live = parseLiveCommand(question);
    if (capability?.error) {
      await tui.notice(capability.error);
      question = '';
      continue;
    }
    if (live?.error) {
      await tui.notice(live.error);
      question = '';
      continue;
    }
    if (deskCommand?.error) {
      await tui.notice(deskCommand.error);
      question = '';
      continue;
    }
    // A pick that arrives when nothing is being asked is stale — the overlay was
    // dismissed, or the answer raced the runtime. Drop it silently; reporting it
    // as an unknown command turns a double keypress into a dead query.
    if (/^\/pick\b/i.test(question)) { question = ''; continue; }

    if (!deskCommand && !capability && !live && question.startsWith('/')) {
      await tui.notice('Unknown command · press ? for help');
      question = '';
      continue;
    }
    if (deskCommand) question = deskCommand.query;

    if (!await ensureOrchestrator()) { question = ''; continue; }

    if (live) {
      await startLive(live.symbols);
      question = '';
      continue;
    }

    if (capability) {
      try {
        const session = await runCapability(capability, { orchestrator, tui, agentName: agent.name, asOf, conversation });
        conversation = appendConversationTurn(conversation, session);
        saveConversation(conversation);
      } catch (error) {
        if (error instanceof CancelledError || error?.cancelled || /\bcancelled\b/i.test(String(error?.message ?? ''))) {
          await tui.notice('Cancelled');
        } else {
          await tui.notice(`Workflow failed · ${String(error.message || error).slice(0, 180)}`);
        }
      }
      question = '';
      continue;
    }

    // The fast half of the command line. `RELIANCE` and `FA INFY` are requests
    // for state, not questions about it, so they take the planner's place
    // entirely: resolve the name, retrieve, render, done — no plan review, no
    // reasoning provider, nothing spent. Anything else returns null here and
    // takes the full route below, unchanged.
    const mnemonic = parseMnemonic(question);
    let mnemonicAnswered = false;
    if (mnemonic) {
      try {
        const session = await orchestrator.run(mnemonic.reference, {
          agentName: agent.name, asOf, conversation,
          intentOverride: { kind: 'company', references: [mnemonic.reference] },
          route: mnemonic.route,
          dataOnly: true,
        });
        conversation = appendConversationTurn(conversation, session);
        saveConversation(conversation);
        mnemonicAnswered = true;
      } catch (error) {
        if (error instanceof CancelledError || error?.cancelled) {
          await tui.notice('Cancelled');
          mnemonicAnswered = true;
        }
        // Otherwise the token was probably a word, not a company. Say nothing
        // and fall through: the full route reads it as the question it was.
      }
    }
    if (mnemonicAnswered) { question = ''; continue; }

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
        session = await orchestrator.run(question, {
          agentName: agent.name, asOf, conversation, plan,
          // Inside a world the company is settled, so the question inherits it
          // rather than being re-resolved from whatever name it happens to
          // contain. This is what lets "why did margins fall?" work at all.
          intentOverride: deskCommand?.intent
            ?? (world ? { kind: 'company', references: [world.common_name || world.company_name] } : undefined),
        });
      } catch (error) {
        // An abandoned run is a choice, not a fault: say so plainly and keep
        // the session, rather than reporting the user's own Ctrl-C as a failure.
        if (error instanceof CancelledError || error?.cancelled || /\bcancelled\b/i.test(String(error?.message ?? ''))) {
          await tui.notice('Cancelled');
          break;
        }
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
      if (world && session.result) {
        // The verdict belongs to this company, so it lands in its Research tab
        // instead of replacing the workspace the user is standing in.
        world.research = { result: session.result, warnings: session.validation_warnings, mode: session.mode };
        world.tab = 'research';
        await tui.render({ blocks: worldBlocks(world), meta: { as_of: world.as_of }, scope: worldScope(world) });
      }
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
