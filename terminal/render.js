/**
 * render.js — Layout dispatch, footer construction, and direct stdout painting.
 *
 * Bypasses Ink's diff renderer — writes directly to stdout for live phase.
 * Sticky header + scrollable body + scroll indicator + footer.
 */

import { DESK } from '../runtime/commands.js';
import { BRAND, BOLD, DIM, RESET, LIME_D, LIME_M, LABEL, REPORTS_DIR, tui } from './state.js';
import { visLen, ansiTrunc } from '../src/index.js';
import { renderBlocks, presetToBlocks } from './engine.js';
import { estimateCost } from './cost.js';
import { SPINNER_FRAMES } from './splash.js';

let _spinnerTick = 0;

// Focus indicator color — #CDF139 lime
const FOCUS_COLOR = '\x1b[38;2;205;241;57m';

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
  return `${FOCUS_COLOR}${BOLD}▶${RESET}  ${DIM}Tab next · ↑↓ scroll${RESET}`;
}

// ── Help overlay ────────────────────────────────────────────────────────────

/**
 * Render the help overlay (full-screen).
 * For terminals with <12 rows, returns a single summary row.
 */
export function renderHelpOverlay(width) {
  const rows = process.stdout.rows ?? 24;

  if (rows < 12) {
    return `${DIM}n query  ↑↓ scroll  Tab focus  s save  l load  ? close  q quit${RESET}`;
  }

  const sep = `${DIM}${'─'.repeat(width)}${RESET}`;
  const K = (key, desc) => `  ${BRAND}${key.padEnd(26)}${RESET}${DIM}${desc}${RESET}`;

  const lines = [
    '',
    `  ${BRAND}${BOLD}MARKED${RESET}  ${DIM}Keyboard Reference${RESET}`,
    sep,
    '',
    `  ${BRAND}${BOLD}NAVIGATION${RESET}`,
    K('↑↓  /  j k', 'Scroll up / down'),
    K('PgUp  PgDn', 'Scroll one page'),
    K('Space', 'Page down'),
    K('g', 'Jump to top'),
    K('G', 'Jump to bottom'),
    K('Tab', 'Next panel'),
    K('Shift+Tab', 'Previous panel'),
    '',
    `  ${BRAND}${BOLD}ACTIONS${RESET}`,
    K('s', 'Save report to ~/.marked/reports/'),
    K('l', 'Load a saved report'),
    K('n', 'Ask a new research question'),
    K('/marked <key>', 'Save the Marked API key'),
    K('/history', 'Show saved conversation turns'),
    K('/new', 'Start a fresh conversation'),
    K('/model', 'Pick the reasoning provider and model'),
    K('/model claude opus', 'Set provider and model without the picker'),
    K('1-9', 'Run a follow-up query'),
    '',
    `  ${BRAND}${BOLD}THE TEAM${RESET}`,
    ...DESK.map(([name, arg, desc]) => K(`${name}${arg ? ` ${arg}` : ''}`, desc)),
    '',
    `  ${BRAND}${BOLD}DISPLAY${RESET}`,
    K('?', 'Toggle this help'),
    K('Esc', 'Close help / return to splash'),
    K('q', 'Return to splash (agent stays connected)'),
    '',
    `  ${BRAND}${BOLD}SPLASH SCREEN${RESET}`,
    K('Enter', 'Restore last dashboard'),
    K('l', 'Load a saved report'),
    K('q', 'Quit terminal'),
    sep,
    `  ${DIM}Marked runtime owns credentials, data and reasoning.${RESET}`,
  ];

  return lines.join('\n');
}

// Commands the runtime recognises. A slash word outside this list stays plain,
// so the colour is a statement that the command will actually fire.
const DESK_COMMANDS = new Set([
  ...DESK.map(([name]) => name.slice(1)),
  'marked', 'model', 'new', 'history', 'help',
]);

/** Light up a recognised leading command so it reads as activated. */
export function highlightCommand(value) {
  const match = String(value).match(/^\/([a-z]+)(\b[\s\S]*)?$/i);
  if (!match || !DESK_COMMANDS.has(match[1].toLowerCase())) return value;
  return `${BRAND}${BOLD}/${match[1]}${RESET}${match[2] ?? ''}`;
}

export function renderQueryOverlay(width, value = '') {
  const displayValue = /^\/marked\s+\S+$/.test(value)
    ? value.replace(/^(\/marked\s+)\S+$/, (_match, prefix) => `${prefix}${'•'.repeat(value.length - prefix.length)}`)
    : value;
  const field = `${LABEL} query ${RESET}${BRAND}›${RESET} ${highlightCommand(displayValue)}${BRAND}█${RESET}`;
  return ansiTrunc(field, Math.max(1, width - 1));
}

// ── Layout dispatcher ───────────────────────────────────────────────────────

export function runLayout(layoutOrBlocks, panels, width, focused) {
  try {
    if (Array.isArray(layoutOrBlocks)) {
      return renderBlocks(layoutOrBlocks, width);
    }
    const blocks = presetToBlocks(layoutOrBlocks, panels ?? {});
    return renderBlocks(blocks, width);
  } catch (err) {
    return `${DIM}⚠ Render error: ${err.message}${RESET}`;
  }
}

// ── Footer ──────────────────────────────────────────────────────────────────

export function buildFooter(width) {
  const m = tui.renderMeta;
  const s = tui.agentState;

  const gradMark = `${LIME_D}▐${LIME_M}█${BRAND}█${RESET}`;
  const meshLabel = `${BRAND}${BOLD}MARKED${RESET}`;

  const sep = `${DIM} · ${RESET}`;

  // Agent state: show progress during gathering/analyzing
  if (s && (s.stage === 'gathering' || s.stage === 'analyzing')) {
    const spin = `${BRAND}${SPINNER_FRAMES[_spinnerTick % SPINNER_FRAMES.length]}${RESET}`;
    const parts = [
      `  ${gradMark} ${spin}`,
      s.stage === 'gathering' ? `${DIM}Gathering${RESET}` : `${DIM}Analyzing${RESET}`,
    ];
    if (s.skill) parts.push(`${LABEL}:${s.skill}${RESET}`);
    if (s.query) parts.push(`${BRAND}${s.query}${RESET}`);
    if (s.tools) {
      const { called, total, current } = s.tools;
      parts.push(`${DIM}${called ?? 0}/${total ?? '?'}${RESET}`);
      if (current) parts.push(`${DIM}${current}${RESET}`);
    }
    const left = parts.join(` ${DIM}·${RESET} `);
    const keys = `${DIM}n new query  ↑↓ scroll  q quit${RESET}`;
    const leftVis = visLen(left);
    const rightVis = visLen(keys);
    const gap = Math.max(2, width - leftVis - rightVis);
    return left + ' '.repeat(gap) + keys;
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
    m.as_of ? `${DIM}${m.as_of}${RESET}` : null,
  ].filter(Boolean).join(sep);

  const left = `  ${gradMark} ${meshLabel}` + (meta ? `${sep}${meta}` : '');

  // Show follow-ups hint when complete
  let keys;
  if (s?.stage === 'complete' && s?.follow_ups?.length > 0) {
    keys = `${DIM}n new query  1-${s.follow_ups.length} drill  ↑↓ scroll  s save  q quit${RESET}`;
  } else {
    keys = `${DIM}n new query  ↑↓ scroll  s save  l load  q quit${RESET}`;
  }

  const leftVis  = visLen(left);
  const rightVis = visLen(keys);
  const gap = Math.max(2, width - leftVis - rightVis);

  return left + ' '.repeat(gap) + keys;
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
  lines.push('');
  if (tui.modelList.length === 0) {
    lines.push(`  ${DIM}No reasoning providers available${RESET}`);
    return lines.join('\n');
  }
  let provider = null;
  tui.modelList.forEach((entry, i) => {
    if (entry.agent !== provider) {
      provider = entry.agent;
      const providerLabel = provider === 'claude' ? 'Claude Code CLI' : provider === 'codex' ? 'Codex CLI' : 'OpenAI Codex';
      lines.push(`  ${DIM}${providerLabel}${RESET}`);
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

    if (totalLines <= rows) {
      // Content fits — footer is on the last content line
      process.stdout.write(`\x1b[${totalLines};1H${padded}`);
    } else {
      // Content overflows — footer is pinned to the last terminal row
      process.stdout.write(`\x1b[${rows - 1};1H${padded}`);
    }
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
    lines.push(`  ${BRAND}${f.key}${RESET}  ${DIM}${f.label}${RESET}`);
  }
  lines.push(`  ${DIM}q${RESET}  ${DIM}Done — return to Marked runtime${RESET}`);
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
  paintWithScroll();
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

  if (totalLines <= rows) {
    if (clear) {
      process.stdout.write('\x1b[2J\x1b[H' + displayContent);
    } else {
      // Overwrite in place — pad each line to full width to cover old content
      const padded = allLines.map(l => l + ' '.repeat(Math.max(0, w - visLen(l)))).join('\n');
      process.stdout.write('\x1b[H' + padded);
      // Clear any leftover rows below
      for (let r = totalLines + 1; r <= rows; r++) {
        process.stdout.write(`\x1b[${r};1H\x1b[2K`);
      }
    }
    return;
  }

  // Content overflows — sticky header + scrollable body + indicator row
  const stickyLine = allLines[0];
  const bodyLines  = allLines.slice(1, allLines.length - 1);
  const footerLine = allLines[allLines.length - 1];
  const bodyRows   = rows - 3; // sticky(1) + footer(1) + indicator(1)

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
    `  ↑↓/jk scroll  PgUp/Dn  g top  G end${RESET}`;

  // Truncate sticky header to prevent wrap
  const safeHeader = visLen(stickyLine) > w ? ansiTrunc(stickyLine, w) : stickyLine;

  // Render with explicit cursor addressing per row — no wrap issues
  const allOutput = [safeHeader, ...viewLines, footerLine, indicator];
  let buf = '\x1b[2J'; // clear screen
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
