/**
 * render.js — Layout dispatch, footer construction, and direct stdout painting.
 *
 * Bypasses Ink's diff renderer — writes directly to stdout for live phase.
 * Sticky header + scrollable body + scroll indicator + footer.
 */

import { CAPABILITIES, DESK, LIVE } from '../runtime/commands.js';
import { BRAND, BOLD, DIM, RESET, LIME_D, LIME_M, LABEL, REPORTS_DIR, tui } from './state.js';
import { visLen, ansiTrunc, fg, palette, wordWrap } from '../src/index.js';
import { shortDate } from '../data/normalization.js';
import { renderBlocks, presetToBlocks } from './engine.js';
import { estimateCost } from './cost.js';
import { SPINNER_FRAMES } from './splash.js';
import { agentLabel } from '../config/models.js';

let _spinnerTick = 0;

// Focus indicator — the theme's highlight, read per use so a theme change
// during a session recolours the ring with everything else.
const FOCUS_COLOR_FOR = () => fg(palette('highlight') || palette('accent'));

// ── Header (TUI chrome) ─────────────────────────────────────────────────────

/**
 * Build the branded header line from Marked runtime state.
 * Always present in live phase — agent doesn't need to send a header block.
 */
export function buildHeader(width) {
  const gradMark = `${LIME_D}▐${LIME_M}█${BRAND}█${RESET}`;
  const title = `${BRAND}${BOLD}MARKED${RESET}`;
  const sep = `${DIM} · ${RESET}`;

  const s = tui.agentState;
  let left = `  ${gradMark} ${title}`;
  if (s?.skill) left += `${sep}${LABEL}:${s.skill}${RESET}`;
  if (s?.query) left += `${sep}${BRAND}${s.query}${RESET}`;

  left = ansiTrunc(left, Math.max(0, width));
  const fillLen = Math.max(0, width - visLen(left));
  return left + `${DIM}${'─'.repeat(fillLen)}${RESET}`;
}

// ── Focus indicator ─────────────────────────────────────────────────────────

/**
 * Render focus indicator prefix for a panel.
 * Active: ▶ [Enter] drill-down  [/] new query
 * Inactive: (empty string)
 */
export function focusIndicator(panelName) {
  if (!panelName || tui.focusedPanel !== panelName) return '';
  return `${FOCUS_COLOR_FOR()}${BOLD}▶${RESET}  ${DIM}Tab next · ↑↓ scroll${RESET}`;
}

// ── Help overlay ────────────────────────────────────────────────────────────

/**
 * Render the help overlay (full-screen).
 * For terminals with <12 rows, returns a single summary row.
 */
export function renderHelpOverlay(width) {
  const rows = process.stdout.rows ?? 24;

  if (rows < 12) {
    return `${DIM}type to ask  ⏎ send  ^C cancel  PgUp/Dn scroll  ^S save  ^G close  ^D quit${RESET}`;
  }

  const sep = `${DIM}${'─'.repeat(width)}${RESET}`;
  const K = (key, desc) => `  ${BRAND}${key.padEnd(26)}${RESET}${DIM}${desc}${RESET}`;

  const lines = [
    '',
    `  ${BRAND}${BOLD}MARKED${RESET}  ${DIM}Keyboard Reference${RESET}`,
    sep,
    '',
    `  ${BRAND}${BOLD}COMMAND LINE${RESET}`,
    K('(just type)', 'The prompt is always open — no key opens it'),
    K('Enter', 'Ask'),
    K('↑ ↓', 'Previous / next question'),
    K('Ctrl+C', 'Cancel the running query, else clear the line'),
    K('Ctrl+U', 'Clear the line'),
    K('Ctrl+D', 'Quit (empty line only)'),
    '',
    `  ${BRAND}${BOLD}COMPANY WORLD${RESET}  ${DIM}a company as a workspace${RESET}`,
    K('/world <company>', 'Open a world — name, ticker, ISIN or CIN'),
    K('overview … evidence', 'Switch tab — including NEWS, ← → to step'),
    K('/chart <measure>', 'revenue · pat · roe · roce · net_debt · margins · price'),
    K('/chart revenue 5y yoy', 'Add a range (1M…MAX) and a view (yoy, indexed, cagr)'),
    K('<any question>', 'Answered about the open company — no need to name it'),
    K('← / →', 'Previous / next tab'),
    K('E12  or  /e 12', 'Open the source behind a number'),
    K('evidence', 'Every fact this world retrieved, with references'),
    K('/world', 'Search — recent companies first, then type to find any'),
    K('/market', 'Rates, the rupee, and the commodity complex'),
    K('/news rates', 'Market news by topic or region — works anywhere'),
    K('/news', 'In a world: that company. Outside: the whole feed'),
    K('/compare A B C', 'Two to five companies, side by side, same arithmetic'),
    K('/exit', 'Leave the world'),
    '',
    `  ${BRAND}${BOLD}FAST PATH${RESET}  ${DIM}data only — no reasoning model, no spend${RESET}`,
    K('RELIANCE', 'A company, straight to its panels'),
    K('FA <company>', 'Financial profile'),
    K('GP <company>', 'Price history'),
    K('OWN <company>', 'Promoter, FII, DII, pledge'),
    K('ANR <company>', 'Announcements and filings'),
    K('CACS <company>', 'Corporate actions and events'),
    '',
    `  ${BRAND}${BOLD}NAVIGATION${RESET}`,
    K('PgUp  PgDn', 'Scroll one page'),
    K('Ctrl+↑  Ctrl+↓', 'Scroll one line'),
    K('Home  End', 'Jump to top / bottom'),
    K('Tab  Shift+Tab', 'Next / previous panel'),
    '',
    `  ${BRAND}${BOLD}ACTIONS${RESET}`,
    K('Ctrl+S  /save', 'Save report to ~/.marked/reports/'),
    K('Ctrl+O  /load', 'Load a saved report'),
    K('Ctrl+G  /help', 'Toggle this help'),
    K('/reset', 'Return to splash (runtime stays connected)'),
    K('/quit', 'Quit the terminal'),
    K('/marked <key>', 'Save the Marked API key'),
    K('/history', 'Show saved conversation turns'),
    K(`${LIVE[0]} ${LIVE[1]}`, LIVE[2]),
    K('/new', 'Start a fresh conversation'),
    K('/model', 'Pick the reasoning provider and model'),
    K('/model claude opus', 'Set provider and model without the picker'),
    K('/1 … /9', 'Run a follow-up query'),
    '',
    `  ${BRAND}${BOLD}THE TEAM${RESET}`,
    ...DESK.map(([name, arg, desc]) => K(`${name}${arg ? ` ${arg}` : ''}`, desc)),
    '',
    `  ${BRAND}${BOLD}POWER WORKFLOWS${RESET}`,
    ...CAPABILITIES.map(([name, arg, desc]) => K(`${name} ${arg}`, desc)),
    '',
    sep,
    `  ${DIM}Marked runtime owns credentials, data and reasoning.${RESET}`,
  ];

  return lines.join('\n');
}

// Commands the runtime recognises. A slash word outside this list stays plain,
// so the colour is a statement that the command will actually fire.
const DESK_COMMANDS = new Set([
  ...DESK.map(([name]) => name.slice(1)),
  ...CAPABILITIES.map(([name]) => name.slice(1)),
  'marked', 'model', 'new', 'history', 'help', 'live',
]);

/** Light up a recognised leading command so it reads as activated. */
export function highlightCommand(value) {
  const match = String(value).match(/^\/([a-z]+)(\b[\s\S]*)?$/i);
  if (!match || !DESK_COMMANDS.has(match[1].toLowerCase())) return value;
  return `${BRAND}${BOLD}/${match[1]}${RESET}${match[2] ?? ''}`;
}

export function renderQueryOverlay(width, value = '') {
  return renderQueryLines(width, value, 1).at(-1);
}

function renderQueryLines(width, value = '', maxLines = 1) {
  const displayValue = /^\/marked\s+\S+$/.test(value)
    ? value.replace(/^(\/marked\s+)\S+$/, (_match, prefix) => `${prefix}${'•'.repeat(value.length - prefix.length)}`)
    : value;
  // Inside a world the prompt carries the company, so the scope is never a
  // thing you have to remember — `INFY ›` says what the next question is about.
  const ticker = tui.scope?.ticker;
  const label = ticker ? ` ${ticker} ` : ' query ';
  const prefix = `${LABEL}${label}${RESET}${BRAND}›${RESET} `;
  const indent = ' '.repeat(visLen(prefix));
  const contentWidth = Math.max(1, width - visLen(prefix) - 1);
  let wrapped = wordWrap(displayValue, contentWidth)
    .flatMap(line => line.length > contentWidth
      ? Array.from({ length: Math.ceil(line.length / contentWidth) }, (_, index) => line.slice(index * contentWidth, (index + 1) * contentWidth))
      : [line]);
  if (!wrapped.length) wrapped = [''];
  if (wrapped.length > maxLines) {
    wrapped = wrapped.slice(-maxLines);
    wrapped[0] = `…${wrapped[0].slice(1)}`;
  }
  return wrapped.map((line, index) => {
    const start = index === 0 ? prefix : indent;
    const cursor = index === wrapped.length - 1 ? `${BRAND}█${RESET}` : '';
    return start + (index === 0 ? highlightCommand(line) : line) + cursor;
  });
}

/**
 * The always-on command line.
 *
 * This is the one row that is never taken away: an answer stays on screen
 * while the next question is typed under it, and a question can be typed
 * while one is still running. The right-hand hint is the only part that
 * changes with state, so the field never moves under the cursor.
 */
/** Minimum rows: a rule, one field row, and a hint line. */
export const PROMPT_ROWS = 3;

/**
 * The command line grows with the draft, up to half the terminal height.
 *
 * Giving the field a rule above it and its hints below — rather than crowding
 * both onto one line — is what makes it read as a place to type rather than
 * another status row. The context on the right of the rule says which company
 * the next question will be about, which is the thing you most want to know
 * before asking one.
 *
 * @returns {string[]} at least `PROMPT_ROWS` lines
 */
export function renderPromptBlock(width, value = '', context = undefined, totalRows = process.stdout.rows ?? 24) {
  const s = tui.agentState;
  const running = s && (s.stage === 'gathering' || s.stage === 'analyzing' || s.stage === 'resolving');

  // Rule, with the active scope right-aligned on it.
  // One source for the scope: the ticker on the field and the detail on the
  // rule must never disagree about which company you are in.
  const scopeSource = context === undefined ? tui.scope : context;
  const detail = typeof scopeSource === 'string' ? scopeSource : scopeSource?.detail;
  const scope = detail ? `${DIM} ${detail} ${RESET}` : '';
  const ruleWidth = Math.max(0, width - visLen(scope));
  const rule = `${DIM}${'─'.repeat(ruleWidth)}${RESET}${scope}`;

  const maxFieldRows = Math.max(1, Math.floor(totalRows / 2) - 2);
  const fields = renderQueryLines(Math.max(1, width - 1), value, maxFieldRows);

  const hints = running
    ? [`${BRAND}▸▸${RESET} ${DIM}working${RESET}`, '^C cancel', 'PgUp/Dn scroll']
    : value
      ? [`${BRAND}▸▸${RESET} ${DIM}⏎ to ask${RESET}`, '^C clear', '^G help']
      : [`${BRAND}▸▸${RESET} ${DIM}type to ask${RESET}`, '/help', '^S save', '^O load', '^D quit'];
  const hint = hints[0] + `${DIM}` + hints.slice(1).map(part => `  ${part}`).join('') + `${RESET}`;

  return [rule, ...fields, ansiTrunc(hint, width)];
}

/** Kept for callers that want the field alone. */
export function renderPromptRow(width, value = '') {
  return renderQueryOverlay(Math.max(1, width - 1), value);
}

// ── Layout dispatcher ───────────────────────────────────────────────────────

export function runLayout(layoutOrBlocks, panels, width, focused, rows = null) {
  try {
    const blocks = Array.isArray(layoutOrBlocks)
      ? layoutOrBlocks
      : presetToBlocks(layoutOrBlocks, panels ?? {});
    return fillHeight(blocks, width, rows);
  } catch (err) {
    return `${DIM}⚠ Render error: ${err.message}${RESET}`;
  }
}

/** Chrome around the body: header, footer, scroll indicator, command line. */
/**
 * Render, measure, and give the leftover rows to whatever asked for them.
 *
 * A block builder cannot know how tall its own output will be — that depends
 * on the data, the width and every other block — so guessing a share of the
 * screen left a tall terminal two-thirds empty whenever a company reported few
 * events. Instead the first pass measures, and a block marked `grow` is
 * re-rendered once with the slack added to its height. Two passes, exact, and
 * the builder keeps no arithmetic about screen size at all.
 */
export function fillHeight(blocks, width, rows) {
  const once = renderBlocks(blocks, width);
  if (!rows || !Array.isArray(blocks)) return once;

  const growable = findGrowable(blocks);
  if (!growable) return once;

  const available = rows - 2 - renderPromptBlock(width, tui.queryInput ?? '', tui.scope ?? null, rows).length;
  const used = once.split('\n').length;
  const slack = available - used;
  // One row of slack is not worth a second pass, and negative slack means the
  // view already scrolls — growing it would only add more to scroll past.
  if (slack < 2) return once;

  const current = Number(growable.data?.height) || 0;
  const grown = blocks.map(block => substitute(block, growable, current + slack));
  return renderBlocks(grown, width);
}

/** The first block marked `grow`, wherever it sits in the tree. */
function findGrowable(blocks) {
  for (const block of blocks) {
    if (block?.grow && block.data) return block;
    const children = block?.row ?? block?.stack;
    if (Array.isArray(children)) {
      const found = findGrowable(children);
      if (found) return found;
    }
  }
  return null;
}

function substitute(block, target, height) {
  if (block === target) return { ...block, data: { ...block.data, height } };
  if (Array.isArray(block?.row)) return { ...block, row: block.row.map(child => substitute(child, target, height)) };
  if (Array.isArray(block?.stack)) return { ...block, stack: block.stack.map(child => substitute(child, target, height)) };
  return block;
}

// ── Footer ──────────────────────────────────────────────────────────────────

function fitSides(left, right, width) {
  if (visLen(right) >= width) return ansiTrunc(right, Math.max(0, width));
  left = ansiTrunc(left, Math.max(0, width - visLen(right) - 1));
  return left + ' '.repeat(Math.max(1, width - visLen(left) - visLen(right))) + right;
}

export function buildFooter(width) {
  const m = tui.renderMeta;
  const s = tui.agentState;

  const gradMark = `${LIME_D}▐${LIME_M}█${BRAND}█${RESET}`;
  const meshLabel = `${BRAND}${BOLD}MARKED${RESET}`;

  const sep = `${DIM} · ${RESET}`;

  // Agent state: show progress during gathering/analyzing
  if (s && (s.stage === 'gathering' || s.stage === 'analyzing')) {
    const spin = `${BRAND}${SPINNER_FRAMES[_spinnerTick % SPINNER_FRAMES.length]}${RESET}`;
    const progress = s.progress;
    const label = progress?.phase === 'writing' ? 'Writing' : s.stage === 'gathering' ? 'Gathering' : 'Analyzing';
    const parts = [
      `  ${gradMark} ${spin}`,
      `${DIM}${label}${RESET}`,
    ];
    if (s.skill) parts.push(`${LABEL}:${s.skill}${RESET}`);
    if (s.query) parts.push(`${BRAND}${s.query}${RESET}`);
    if (s.tools) {
      const { called, total, current } = s.tools;
      parts.push(`${DIM}${called ?? 0}/${total ?? '?'}${RESET}`);
      if (current) parts.push(`${DIM}${current}${RESET}`);
    }
    if (progress?.phase === 'thinking') parts.push(`${DIM}${(progress.elapsedMs / 1000).toFixed(1)}s${RESET}`);
    if (progress?.phase === 'writing') {
      if (progress.completed?.length) parts.push(`${LABEL}${progress.completed.slice(-2).join(', ')}${RESET}`);
      const width = 8;
      const filled = Math.min(width, Math.floor(width * (progress.outputTokens || 0) / (progress.targetTokens || 1)));
      parts.push(`${BRAND}${'█'.repeat(filled)}${DIM}${'░'.repeat(width - filled)}${RESET}`);
      parts.push(`${DIM}~${(progress.outputTokens || 0).toLocaleString('en-IN')} tok${RESET}`);
      if (progress.etaSeconds != null) parts.push(`${DIM}~${progress.etaSeconds}s left${RESET}`);
    }
    const left = parts.join(` ${DIM}·${RESET} `);
    const keys = '';   // the command line's hint row carries ^C while running
    return fitSides(left, keys, width);
  }

  // Complete or idle state: standard footer with meta
  // Cost: prefer agent-provided meta.cost; fall back to estimate from tool call count.
  // Agent provides cost without tilde prefix (e.g. "$0.12"); we add "~" to both paths.
  const toolsCalled = tui.agentState?.tools?.called;
  const costStr = m.cost
    ? `${DIM}~${m.cost}${RESET}`
    : toolsCalled != null
      ? `${DIM}${estimateCost(toolsCalled)}${RESET}`
      : null;

  // Agent + model: prefer agentState (always set on connect), fall back to renderMeta
  const agentLabel = s?.agent;
  const modelLabel = s?.model || m.model;
  const toolsLabel = s?.tools?.called != null ? `${s.tools.called} tools` : (m.tools ? `${m.tools} tools` : null);

  const meta = [
    agentLabel ? `${DIM}${agentLabel}${RESET}` : null,
    modelLabel ? `${DIM}${modelLabel}${RESET}` : null,
    toolsLabel ? `${DIM}${toolsLabel}${RESET}` : null,
    costStr,
    m.as_of ? `${DIM}${shortDate(m.as_of)} IST${RESET}` : null,
  ].filter(Boolean).join(sep);

  const left = `  ${gradMark} ${meshLabel}` + (meta ? `${sep}${meta}` : '');

  // Keys live on the command line's hint row now. Repeating them here put the
  // same five shortcuts on screen twice; the footer keeps what only it knows.
  const keys = s?.stage === 'complete' && s?.follow_ups?.length > 0
    ? `${DIM}/1-/${s.follow_ups.length} to drill${RESET}`
    : '';

  return fitSides(left, keys, width);
}

// ── Load overlay ────────────────────────────────────────────────────────────

export function renderLoadOverlay(width) {
  const lines = [];
  lines.push('');
  lines.push(`  ${BRAND}▐${RESET}${DIM} Marked${RESET}  ${LABEL}Load Report${RESET}`);
  lines.push(`  ${DIM}↑↓ navigate · Enter load · Esc cancel${RESET}`);
  lines.push('');
  if (tui.loadList.length === 0) {
    lines.push(`  ${DIM}No saved reports in ${REPORTS_DIR}${RESET}`);
  } else {
    tui.loadList.forEach((f, i) => {
      const active = i === tui.loadIdx;
      const cursor = active ? `${BRAND}▶${RESET}` : ' ';
      const label  = active ? `${LABEL}${f}${RESET}` : `${DIM}${f}${RESET}`;
      lines.push(`  ${cursor} ${label}`);
    });
  }
  return lines.join('\n');
}

// ── Clarification overlay ───────────────────────────────────────────────────
// The runtime could not resolve something and is asking rather than guessing.

export function renderAskOverlay(width) {
  const step = tui.askStep ? `${DIM}STEP ${tui.askStep.current} OF ${tui.askStep.total}${RESET}  ` : '';
  const lines = ['', `  ${LIME_D}▐${LIME_M}█${BRAND}█${RESET} ${BRAND}${BOLD}MARKED${RESET}  ${step}${LABEL}${tui.askStep?.title || 'SELECT'}${RESET}`];
  lines.push(`${DIM}${'─'.repeat(width)}${RESET}`, '', `  ${BRAND}${tui.askPrompt || 'Which one?'}${RESET}`);
  if (tui.askHint) lines.push(`  ${DIM}${ansiTrunc(tui.askHint, Math.max(20, width - 4))}${RESET}`);
  lines.push(`  ${DIM}↑↓ navigate · Enter choose · Esc cancel${RESET}`, '');
  tui.askList.forEach((choice, i) => {
    const active = i === tui.askIdx;
    const cursor = active ? `${BRAND}▶${RESET}` : ' ';
    const label = ansiTrunc(choice.name || String(choice), Math.max(20, width - 30));
    const subtitle = choice.subtitle ? `${DIM}  ${choice.subtitle}${RESET}` : '';
    lines.push(`  ${cursor} ${active ? `${LABEL}${label}${RESET}` : `${DIM}${label}${RESET}`}${subtitle}`);
  });
  return lines.join('\n');
}

export function renderInputOverlay(width) {
  const step = tui.inputStep ? `${DIM}STEP ${tui.inputStep.current} OF ${tui.inputStep.total}${RESET}  ` : '';
  const value = tui.inputSecret ? '•'.repeat(tui.inputValue.length) : tui.inputValue;
  return [
    '',
    `  ${LIME_D}▐${LIME_M}█${BRAND}█${RESET} ${BRAND}${BOLD}MARKED${RESET}  ${step}${LABEL}${tui.inputStep?.title || 'SETUP'}${RESET}`,
    `${DIM}${'─'.repeat(width)}${RESET}`,
    '',
    `  ${BRAND}${tui.inputPrompt}${RESET}`,
    tui.inputHint ? `  ${DIM}${ansiTrunc(tui.inputHint, Math.max(20, width - 4))}${RESET}` : '',
    '',
    ansiTrunc(`  ${LABEL}›${RESET} ${value}${BRAND}█${RESET}`, Math.max(1, width - 1)),
    '',
    `  ${DIM}Enter continue · Esc cancel${RESET}`,
  ].filter((line, index, lines) => line || lines[index - 1] !== '').join('\n');
}

// ── Model picker overlay ────────────────────────────────────────────────────

export function renderModelOverlay(width) {
  const lines = [];
  lines.push('');
  lines.push(`  ${BRAND}▐${RESET}${DIM} Marked${RESET}  ${LABEL}Reasoning Model${RESET}`);
  lines.push(`  ${DIM}↑↓ navigate · Enter select · Esc cancel${RESET}`);
  // The runtime reads one command at a time, so a pick made during a run is
  // queued behind it. Saying so beats looking broken for three minutes.
  const stage = tui.agentState?.stage;
  if (stage === 'resolving' || stage === 'gathering' || stage === 'analyzing') {
    lines.push(`  ${palette('warning') ? fg(palette('warning')) : ''}a query is running — this applies to the next one, or ^C to cancel it first${RESET}`);
  }
  lines.push('');
  if (tui.modelList.length === 0) {
    lines.push(`  ${DIM}No reasoning providers available${RESET}`);
    return lines.join('\n');
  }
  let provider = null;
  tui.modelList.forEach((entry, i) => {
    if (entry.agent !== provider) {
      provider = entry.agent;
      lines.push(`  ${DIM}${agentLabel(provider)}${RESET}`);
    }
    const active = i === tui.modelIdx;
    const current = entry.agent === tui.modelCurrent?.agent && (entry.id ?? null) === (tui.modelCurrent?.model ?? null);
    const cursor = active ? `${BRAND}▶${RESET}` : ' ';
    const mark = current ? `${BRAND}●${RESET}` : ' ';
    const text = ansiTrunc(entry.label, Math.max(20, width - 10));
    lines.push(`  ${cursor} ${mark} ${active ? `${LABEL}${text}${RESET}` : `${DIM}${text}${RESET}`}`);
  });
  return lines.join('\n');
}

// ── Shimmer animation ───────────────────────────────────────────────────────

const SHIMMER_SEQ = ['░','░','▒','▓','▒','░','░'];
let _shimmerOffset = 0;

/**
 * Apply shimmer effect to skeleton-only lines (lines that are ONLY ░ chars + whitespace).
 * Does NOT touch component content like holder bars that use ░ for empty regions.
 */
export function applyShimmer(content) {
  _shimmerOffset++;
  return content.replace(/^([ ]*)(░{20,})$/gm, (_match, prefix, run) => {
    const chars = [];
    for (let i = 0; i < run.length; i++) {
      const idx = (i + _shimmerOffset) % SHIMMER_SEQ.length;
      chars.push(SHIMMER_SEQ[idx]);
    }
    return prefix + chars.join('');
  });
}

// ── Render animation timer ──────────────────────────────────────────────────

let _animTimer = null;

/**
 * Spinner animation — repaints ONLY the footer line on each tick.
 * Full screen repaints are expensive and cause timer drift. The spinner
 * only lives in the footer, so we cursor-address that single line.
 * Full repaints happen on render events and scroll input, not here.
 */
/**
 * The terminal row the footer occupies.
 *
 * Both the full paint and the 110ms spinner repaint need this, and they must
 * agree: when they drifted apart the spinner drew a second footer on top of
 * the scroll indicator. The prompt always owns the last row.
 *
 * @param {number} totalLines lines in `tui.lastContent`
 * @param {number} rows terminal height
 */
export function footerRow(totalLines, rows, promptRows = tui.promptRows ?? PROMPT_ROWS) {
  const rowsForContent = rows - promptRows;
  if (totalLines <= rowsForContent) return totalLines;
  return rows - promptRows - 1;                   // …footer, indicator, then the prompt block
}

export function startRenderAnimation() {
  stopRenderAnimation();
  const tick = () => {
    if (!tui.lastContent) { _animTimer = setTimeout(tick, 110); return; }
    const s = tui.agentState;
    if (!s || (s.stage !== 'gathering' && s.stage !== 'analyzing')) {
      _animTimer = null;
      return;
    }
    _spinnerTick++;
    const w = process.stdout.columns ?? 80;
    const rows = process.stdout.rows ?? 24;
    const allLines = tui.lastContent.split('\n');
    const totalLines = allLines.length;
    const footer = buildFooter(w);
    const padded = footer + ' '.repeat(Math.max(0, w - visLen(footer)));

    process.stdout.write(`\x1b[${footerRow(totalLines, rows)};1H${padded}`);
    _animTimer = setTimeout(tick, 110);
  };
  _animTimer = setTimeout(tick, 110);
}

export function stopRenderAnimation() {
  if (_animTimer) { clearTimeout(_animTimer); _animTimer = null; }
}

// ── Direct stdout painting ──────────────────────────────────────────────────

/**
 * Build the action bar shown in COMPLETE state when follow_ups exist.
 */
function buildActionBar(width) {
  const s = tui.agentState;
  if (!s || s.stage !== 'complete' || !s.follow_ups?.length) return '';

  const lines = [];
  lines.push(`${DIM}┄┄ WHAT'S NEXT ${'┄'.repeat(Math.max(0, width - 18))}${RESET}`);
  for (const f of s.follow_ups) {
    lines.push(`  ${BRAND}/${f.key}${RESET}  ${DIM}${f.label}${RESET}`);
  }
  lines.push(`  ${DIM}/reset${RESET}  ${DIM}Done — return to Marked runtime${RESET}`);
  lines.push(`${DIM}${'─'.repeat(width)}${RESET}`);
  return lines.join('\n');
}

export function paintScreen(content, resetScroll = true) {
  const w = process.stdout.columns ?? 80;
  const header = buildHeader(w);
  const actionBar = buildActionBar(w);
  const footer = buildFooter(w);
  // Strip duplicate headers: if agent sent a header-style line with the brand mark,
  // the TUI already renders its own header — drop duplicate runtime headers.
  // Only match lines that START with the brand mark pattern (▐██ MARKED),
  // not lines that happen to mention the product name in body text.
  const lines = content.split('\n');
  const filtered = lines.filter(l => {
    const stripped = l.replace(/\x1b\[[0-9;]*m/g, '').trimStart();
    return !stripped.startsWith('▐') || !stripped.includes('MARKED');
  });
  // Strip leading blank lines left by filter removal
  let startIdx = 0;
  while (startIdx < filtered.length && filtered[startIdx].replace(/\x1b\[[0-9;]*m/g, '').trim() === '') startIdx++;
  const cleanContent = filtered.slice(startIdx).join('\n');
  tui.lastContent = header + '\n' + cleanContent + (actionBar ? '\n' + actionBar : '') + '\n' + footer;
  if (resetScroll) tui.scrollOffset = 0;
  paintWithScroll(resetScroll);
}

export function paintWithScroll(clear = true) {
  const rows = process.stdout.rows ?? 24;
  // Apply shimmer during gathering/analyzing
  const s = tui.agentState;
  const isAnimating = s && (s.stage === 'gathering' || s.stage === 'analyzing');
  let displayContent = isAnimating ? applyShimmer(tui.lastContent) : tui.lastContent;
  // Rebuild footer on each paint to update spinner frame
  if (isAnimating) {
    const w = process.stdout.columns ?? 80;
    const lines = displayContent.split('\n');
    lines[lines.length - 1] = buildFooter(w);
    displayContent = lines.join('\n');
  }
  const w = process.stdout.columns ?? 80;
  const allLines = displayContent.split('\n');
  const totalLines = allLines.length;

  // Always rebuild header from live agent state
  allLines[0] = buildHeader(w);
  displayContent = allLines.join('\n');

  // The command line owns the last rows in every path, so reserve its current
  // adaptive height before deciding whether the content fits.
  // before deciding whether the content fits.
  const promptBlock = renderPromptBlock(w, tui.queryInput ?? '', tui.scope ?? null, rows);
  const promptRows = promptBlock.length;
  tui.promptRows = promptRows;
  const paintPrompt = () => promptBlock
    .map((line, index) => `\x1b[${rows - promptRows + 1 + index};1H\x1b[2K${line}`)
    .join('');
  const rowsForContent = rows - promptRows;

  if (totalLines <= rowsForContent) {
    if (clear) {
      process.stdout.write('\x1b[2J\x1b[H' + displayContent + paintPrompt());
    } else {
      // Overwrite in place — pad each line to full width to cover old content
      const padded = allLines.map(l => l + ' '.repeat(Math.max(0, w - visLen(l)))).join('\n');
      process.stdout.write('\x1b[H' + padded);
      // Clear any leftover rows below, stopping short of the prompt block.
      for (let r = totalLines + 1; r <= rows - promptRows; r++) {
        process.stdout.write(`\x1b[${r};1H\x1b[2K`);
      }
      process.stdout.write(paintPrompt());
    }
    return;
  }

  // Content overflows — sticky header + scrollable body + indicator row
  const stickyLine = allLines[0];
  const bodyLines  = allLines.slice(1, allLines.length - 1);
  const footerLine = allLines[allLines.length - 1];
  const bodyRows   = Math.max(0, rows - 3 - promptRows); // sticky + footer + indicator + the prompt block

  const maxOffset = Math.max(0, bodyLines.length - bodyRows);
  tui.scrollOffset = Math.max(0, Math.min(tui.scrollOffset, maxOffset));
  const offset = tui.scrollOffset;
  const viewLines = bodyLines.slice(offset, offset + bodyRows);

  const atTop = offset === 0;
  const atBottom = offset >= maxOffset;
  const pct = maxOffset > 0 ? Math.round((offset / maxOffset) * 100) : 0;
  const indicator = `${DIM}` +
    (atTop ? ' ' : ' ▲ ') +
    `${offset + 1}–${Math.min(offset + viewLines.length, bodyLines.length)}/${bodyLines.length}` +
    (atBottom ? '' : ' ▼') +
    ` ${atBottom ? 'END' : pct + '%'}` +
    `  PgUp/Dn page  ^↑/^↓ line  Home/End ends${RESET}`;

  // Truncate sticky header to prevent wrap
  const safeHeader = visLen(stickyLine) > w ? ansiTrunc(stickyLine, w) : stickyLine;

  // Render with explicit cursor addressing per row — no wrap issues
  const allOutput = [safeHeader, ...viewLines, footerLine, indicator, ...promptBlock];
  let buf = clear ? '\x1b[2J' : '';
  for (let r = 0; r < allOutput.length; r++) {
    const line = allOutput[r];
    buf += `\x1b[${r + 1};1H`; // cursor to row r+1, col 1
    if (!clear) {
      // Pad to width to cover old content
      buf += line + ' '.repeat(Math.max(0, w - visLen(line)));
    } else {
      buf += line;
    }
  }
  buf += `\x1b[${rows};1H`; // park cursor at bottom
  process.stdout.write(buf);
}

/**
 * World search.
 *
 * Results arrive from the runtime as the user types — the terminal holds no
 * API key, so every keystroke's lookup is a round trip. The list is drawn even
 * while a newer query is in flight, because a list that blanks between
 * keystrokes reads as broken.
 */
export function renderSearchOverlay(width) {
  const lines = [
    '',
    `  ${LIME_D}▐${LIME_M}█${BRAND}█${RESET} ${BRAND}${BOLD}MARKED${RESET}  ${LABEL}WORLD SEARCH${RESET}`,
    `${DIM}${'─'.repeat(width)}${RESET}`,
    '',
    `  ${LABEL} find ${RESET}${BRAND}›${RESET} ${tui.searchQuery || ''}${BRAND}█${RESET}`,
    `  ${DIM}name · ticker · ISIN · CIN${tui.searchBusy ? ' · searching…' : ''}${RESET}`,
    `  ${DIM}↑↓ navigate · Enter open · Esc cancel${RESET}`,
    '',
  ];

  if (!tui.searchQuery) {
    if (tui.searchResults.length) {
      lines.push(`  ${DIM}RECENT${RESET}`);
      tui.searchResults.forEach((hit, index) => {
        const active = index === tui.searchIdx;
        const cursor = active ? `${BRAND}▶${RESET}` : ' ';
        const name = ansiTrunc(hit.name ?? '', Math.max(20, Math.floor(width * 0.45)));
        const detail = [hit.symbol, hit.tab].filter(Boolean).join(' · ');
        lines.push(`  ${cursor} ${active ? `${BOLD}${LABEL}${name}${RESET}` : name}   ${DIM}${detail}${RESET}`);
      });
      return lines.join('\n');
    }
    lines.push(`  ${DIM}Type to search every listed company Marked covers.${RESET}`);
    return lines.join('\n');
  }
  if (!tui.searchResults.length) {
    lines.push(`  ${DIM}${tui.searchBusy ? 'Searching…' : `Nothing matches “${tui.searchQuery}”`}${RESET}`);
    return lines.join('\n');
  }

  tui.searchResults.forEach((hit, index) => {
    const active = index === tui.searchIdx;
    const cursor = active ? `${BRAND}▶${RESET}` : ' ';
    const name = ansiTrunc(hit.name ?? '', Math.max(20, Math.floor(width * 0.45)));
    const detail = [hit.symbol, hit.exchange, hit.isin].filter(Boolean).join(' · ');
    lines.push(`  ${cursor} ${active ? `${BOLD}${LABEL}${name}${RESET}` : name}   ${DIM}${detail}${RESET}`);
  });
  return lines.join('\n');
}
