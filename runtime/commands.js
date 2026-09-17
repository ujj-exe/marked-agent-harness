import { AGENTS, isKnownModel, resolveAgent } from '../config/models.js';

const DEFAULTS = {
  macro: 'Analyze the current India macro outlook across RBI policy, inflation, growth, liquidity, the rupee and rates.',
  sector: 'Screen Indian sectors for current leadership, laggards, rotation and key drivers.',
  desk: 'Give me an India market desk pulse covering current market events, sector leadership and material risks.',
  risk: 'Analyze the key current risks and event catalysts in Indian markets.',
  options: 'Analyze current NIFTY options positioning, open interest and skew.',
  futures: 'Analyze current Indian futures positioning across NIFTY, rates and commodities.',
};

/**
 * The desk, and the only description of it. The splash grid, the `?` overlay
 * and `marked --help` all read this list, so a command cannot be advertised
 * in one place and missing from another.
 */
export const DESK = [
  ['/analyst',  '<company>',   'filings, fundamentals, or any research question'],
  ['/compare',  '<a> and <b>',           '2 to 5 names, separated by and / vs / comma'],
  ['/macro',    '',                      'RBI, inflation, growth, the regime behind the trade'],
  ['/sector',   '<sector>',              'rotations, thematics, and the names moving money'],
  ['/desk',     '<company>',             'market pulse, 3 seconds, everything that matters'],
  ['/risk',     '<company>',             'event impact, catalyst timing, what could go wrong'],
  ['/options',  '<symbol>',              'chains, OI skew, positioning, where smart money leans'],
  ['/futures',  '<symbol>',              'commodities, rates futures, the cross-asset tape'],
  ['/watch',    '<companies>',           'what moved, conviction logged'],
];

export const CAPABILITIES = [
  ['/thesis', '<company>', 'save or re-evaluate a living thesis'],
  ['/diff', '<company> [FYx FYy]', 'changes since the last check or between two years'],
  ['/rewind', '<company> <YYYY-MM-DD>', 'research using only that point in time'],
  ['/signal', '<screen rules>', 'compile natural language into a universe screen'],
  ['/claims', '<company>', 'test management narrative against reported facts'],
];

export const LIVE = ['/live', '<symbols>', 'poll live API quotes in a compact tape'];

const COMMANDS = new Set(DESK.map(([name]) => name.slice(1)));
const ROUTES = { macro: 'macro', sector: 'sector', desk: 'desk', risk: 'risk', options: 'derivatives', futures: 'derivatives', watch: 'watch' };

export function parseDeskCommand(input) {
  const match = String(input).trim().match(/^\/([a-z]+)(?:\s+([\s\S]*))?$/i);
  if (!match || !COMMANDS.has(match[1].toLowerCase())) return null;

  const command = match[1].toLowerCase();
  const args = match[2]?.trim();
  if (command === 'analyst') {
    return args
      ? result(command, `Analyze ${args}`, { kind: 'company', references: [args] })
      : error(command, 'Usage: /analyst <company or research question>');
  }
  if (command === 'compare') {
    const references = compareReferences(args);
    return references.length >= 2 && references.length <= 5
      ? result(command, `Compare ${references.join(' and ')}`, { kind: 'compare', references })
      : error(command, 'Usage: /compare <company> and <company> · supports 2–5 companies');
  }
  if (command === 'watch' && !args) return error(command, 'Usage: /watch <companies or watchlist question>');

  const query = args ? {
    macro: `Analyze Indian macro conditions: ${args}`,
    sector: `Indian sector research: ${args}`,
    desk: `India market desk query: ${args}`,
    risk: `Analyze India-market risks and event impact: ${args}`,
    options: `Analyze Indian options positioning: ${args}`,
    futures: `Analyze Indian futures positioning: ${args}`,
    watch: `Watchlist update for: ${args}`,
  }[command] : DEFAULTS[command];
  // Commands that take a company scope it explicitly; macro and sector do not.
  const SCOPED = new Set(['desk', 'risk', 'watch', 'options', 'futures']);
  const references = args && SCOPED.has(command) ? [args] : [];
  return result(command, query, { kind: ROUTES[command], references });
}

export function expandDeskCommand(input) {
  return parseDeskCommand(input)?.query || null;
}

export function parseLiveCommand(input) {
  const match = String(input).trim().match(/^\/live(?:\s+([\s\S]*))?$/i);
  if (!match) return null;
  const raw = match[1]?.trim();
  if (!raw) return { symbols: ['NIFTY', 'BANKNIFTY', 'INDIAVIX'], error: null };
  if (/^(?:off|stop|clear)$/i.test(raw)) return { symbols: [], error: null };
  const symbols = [...new Set(raw.split(/[\s,]+/).map(symbol => symbol.toUpperCase()).filter(Boolean))];
  if (!symbols.length || symbols.length > 8 || symbols.some(symbol => !/^\^?[A-Z0-9._-]{1,20}$/.test(symbol))) {
    return { symbols: [], error: 'Usage: /live [NIFTY BANKNIFTY INDIAVIX | RELIANCE INFY] · /live off' };
  }
  return { symbols, error: null };
}

/** Explicit opt-in workflows. Ordinary questions never enter this path. */
export function parseCapabilityCommand(input) {
  const match = String(input).trim().match(/^\/(thesis|diff|rewind|signal|claims)(?:\s+([\s\S]+))?$/i);
  if (!match) return null;
  const kind = match[1].toLowerCase();
  const args = match[2]?.trim();
  if (!args) return { kind, error: `Usage: ${CAPABILITIES.find(([name]) => name === `/${kind}`).slice(0, 2).join(' ')}` };

  if (kind === 'rewind') {
    const first = args.match(/^(\d{4}-\d{2}-\d{2})\s+(.+)$/);
    const last = args.match(/^(.+?)\s+(\d{4}-\d{2}-\d{2})$/);
    const date = first?.[1] ?? last?.[2];
    const reference = first?.[2] ?? last?.[1];
    if (!date || Number.isNaN(Date.parse(`${date}T23:59:59.999Z`))) {
      return { kind, error: 'Usage: /rewind <company> <YYYY-MM-DD>' };
    }
    return { kind, reference: reference.trim(), date, error: null };
  }

  if (kind === 'diff') {
    const periods = args.match(/^(.+?)\s+FY'?([0-9]{2,4})\s+FY'?([0-9]{2,4})$/i);
    if (periods) {
      const year = value => Number(value) < 100 ? 2000 + Number(value) : Number(value);
      return { kind, reference: periods[1].trim(), periods: [`FY${year(periods[2])}`, `FY${year(periods[3])}`], error: null };
    }
  }

  return kind === 'signal'
    ? { kind, expression: args, error: null }
    : { kind, reference: args, error: null };
}

function compareReferences(args = '') {
  const references = String(args).split(/\s*(?:,|\bvs(?:\.|\b)|\bversus\b|\band\b)\s*/i).map(value => value.trim()).filter(Boolean);
  if (references.length === 1) {
    const tickers = references[0].split(/\s+/);
    if (tickers.length === 2 && /^[A-Z][A-Z0-9:._-]{1,14}$/.test(tickers[0]) && /^[A-Za-z][A-Za-z0-9:._-]{1,14}$/.test(tickers[1])) return tickers;
  }
  return references;
}

function result(command, query, intent = null) { return { command, query, intent, error: null }; }
function error(command, message) { return { command, query: null, intent: null, error: message }; }

/**
 * `/model` opens the picker, `/model codex` switches provider, and
 * `/model codex gpt-6-astra` (or `codex:gpt-6-astra`) pins a model too.
 * Returns null for anything that is not the command.
 */
export function parseModelCommand(input) {
  const match = String(input).trim().match(/^\/models?(?:\s+(\S+)(?:\s+(\S+))?)?$/i);
  if (!match) return null;
  if (!match[1]) return { agent: null };

  const [reference, inlineModel] = match[1].split(':');
  const agent = resolveAgent(reference);
  const named = match[2] ?? inlineModel;
  if (!AGENTS.includes(agent)) return { agent: null, error: `Unknown provider "${reference}". Choose claude, claude-api, codex, chatgpt, or chatgpt-api.` };
  // No model named keeps whatever this provider was last set to; `default`
  // clears it back to the CLI's own configuration.
  if (named === undefined) return { agent };
  const model = named.toLowerCase() === 'default' ? null : named;
  if (model && !isKnownModel(agent, model)) return { agent: null, error: `${agent} does not offer model "${model}".` };
  return { agent, model };
}
