/**
 * splash.js — Splash screen renderer.
 *
 * Three responsive layouts: wide (≥82 cols), medium (≥48), narrow.
 * Figlet wordmark + desk grid + runtime status + version + pulse animation.
 */

import { BRAND, BOLD, DIM, RESET, LABEL, VERSION } from './state.js';
import { logoBlock, wordmark, WORDMARK_WIDTH } from './logo.js';
import { fg, palette, shade } from '../src/index.js';
import { DESK } from '../runtime/commands.js';

// Pulse: ▐██ breathes accent → bright → accent → dim → recover. Seven frames
// derived from the accent, so the breath stays in the theme's own hue.
export function pulseColors() {
  const accent = palette('accent') || '#ffffff';
  return [
    fg(accent),
    fg(shade(accent, 1.18)),
    fg(shade(accent, 1.38)),
    fg(shade(accent, 1.18)),
    fg(accent),
    fg(shade(accent, 0.72)),
    fg(accent),
  ];
}

export const SPINNER_FRAMES = ['⠋','⠙','⠹','⠸','⠼','⠴','⠦','⠧','⠇','⠏'];

export { DESK };

export const RUNTIME_AGENTS = ['marked', 'claude', 'codex', 'openai-codex'];

/**
 * Render the splash screen as an ANSI string.
 * @param {string} msg - Status message
 * @param {number} width - Terminal width
 * @param {number} pulseFrame - Animation frame counter
 * @param {number} maxRows - Max terminal rows available
 * @returns {string} ANSI splash screen
 */
// The status line used to be pushed to the last row, which on a tall terminal
// left a screen of dead space between the desk and the prompt. One blank row
// keeps the block together; the pad only grows if the terminal is short enough
// that the content would otherwise collide with the status.
const BOTTOM_ROWS = 2;
function padToStatus(lines, maxRows, gap = 1) {
  const target = Math.min(maxRows - BOTTOM_ROWS, lines.length + gap);
  while (lines.length < target) lines.push('');
}

/**
 * Render the splash screen as an ANSI string.
 */
export function renderSplash(msg, width, pulseFrame = 0, maxRows = 999, liveTape = []) {
  const pulse = pulseColors();
  const pc = pulse[pulseFrame % pulse.length];
  const mark  = `${pc}${BOLD}▐██${RESET}`;
  const spin  = `${pc}${SPINNER_FRAMES[pulseFrame % SPINNER_FRAMES.length]}${RESET}`;
  const vStr = `${BRAND}${VERSION.current}${RESET}`;
  const status = /^update available/i.test(msg)
    ? `${fg(palette('warning') || '#ffffff')}${BOLD}${msg}${RESET}`
    : `${DIM}${msg}${RESET}`;

  const pad = (s) => {
    const vis = s.replace(/\x1b\[[0-9;]*m/g, '').length;
    return ' '.repeat(Math.max(0, Math.floor((width - vis) / 2))) + s;
  };
  const sep = (ch = '─') => `${DIM}${ch.repeat(width)}${RESET}`;
  const L = (left, right, w = width) => {
    const lv = left.replace(/\x1b\[[0-9;]*m/g, '').length;
    const rv = right.replace(/\x1b\[[0-9;]*m/g, '').length;
    return left + ' '.repeat(Math.max(1, w - lv - rv)) + right;
  };

  const lines = [];

  // ── WIDE: brand mark + two-column desk ──────────────────────────────────
  if (width >= 82 && maxRows >= 22) {
    lines.push('');
    // Block wordmark when it fits with the two-space gutter, compact mark otherwise.
    if (width >= WORDMARK_WIDTH + 4 && maxRows >= 26) {
      for (const row of wordmark()) lines.push(`  ${row}`);
      lines.push('');
      lines.push(`  ${DIM}INDIA  ·  The view that matters.${RESET}`);
    } else {
      // Logo row 4 already contains "The view that matters."
      for (const row of logoBlock()) lines.push(`  ${row}`);
    }
    lines.push(sep());
    lines.push('');

    // Two-column: desk left, runtime workers + version right
    const colW = Math.floor(width / 2) - 2;
    lines.push(L(
      `  ${BRAND}${BOLD}THE TEAM${RESET}  ${DIM}every seat takes a position${RESET}`,
      `${DIM}RUNTIME WORKERS${RESET}  `,
    ));
    const runtimeW = 'RUNTIME WORKERS'.length; // match header width
    lines.push(L(
      `  ${DIM}${'─'.repeat(colW - 2)}${RESET}`,
      `${DIM}${'─'.repeat(runtimeW)}${RESET}  `,
    ));

    const tapeLines = liveTape.slice(0, 2).map(quote => {
      const price = Number(quote.price);
      const change = Number(quote.change_percent);
      const priceText = Number.isFinite(price) ? price.toLocaleString('en-IN', { maximumFractionDigits: 2 }) : '—';
      const changeText = Number.isFinite(change) ? `${change > 0 ? '+' : ''}${change.toFixed(2)}%` : '—';
      return `  ${LABEL}${quote.symbol || '—'}${RESET} ${DIM}${priceText} ${changeText}${quote.is_stale ? ' STALE' : ''}${RESET}`;
    });
    const runtimeLines = [
      ...RUNTIME_AGENTS.map(a => `  ${BRAND}●${RESET} ${DIM}${a.padEnd(8)}${RESET} ${DIM}connected${RESET}`),
      '',
      `  ${vStr}`,
      ...(tapeLines.length ? [`  ${LABEL}LIVE TAPE${RESET}`, ...tapeLines] : [`  ${DIM}LIVE TAPE · /live to connect${RESET}`]),
    ];

    DESK.forEach(([ name, arg, desc ], i) => {
      const command = `${BRAND}${BOLD}${name}${RESET}${arg ? ` ${LABEL}${arg}${RESET}` : ''}`;
      const pad = ' '.repeat(Math.max(1, 24 - name.length - (arg ? arg.length + 1 : 0)));
      const left  = `  ${command}${pad}${DIM}${desc}${RESET}`;
      const right = runtimeLines[i] ? `${runtimeLines[i]}  ` : '';
      lines.push(L(left, right));
    });

    lines.push('');
    lines.push(sep());

    // Pad to push hints + spinner to fixed bottom rows
    padToStatus(lines, maxRows);
    lines.push(`  ${DIM}type a company or a question${RESET}  ${DIM}·${RESET}  ${DIM}/model${RESET}  ${DIM}^O${RESET} ${DIM}load${RESET}  ${DIM}^G${RESET} ${DIM}help${RESET}  ${DIM}^D${RESET} ${DIM}quit${RESET}`);
    lines.push(L(
      `  ${spin} ${status}`,
      `${DIM}marked.run  ·  ${RESET}${mark}  `,
    ));

  // ── MEDIUM: compact header + desk list ───────────────────────────────────
  } else if (width >= 48 && maxRows >= 16) {
    lines.push('');
    lines.push(L(`  ${mark}  ${BRAND}${BOLD}MARKED${RESET}`, `  ${vStr}  `));
    lines.push(`  ${DIM}marked.run  ·  India-first financial intelligence${RESET}`);
    lines.push(sep());
    lines.push(`  ${BRAND}${BOLD}THE TEAM${RESET}`);
    DESK.forEach(([name, arg, desc]) => {
      lines.push(`  ${BRAND}${name.padEnd(11)}${RESET}${LABEL}${(arg || '').padEnd(11)}${RESET}${DIM}${desc}${RESET}`);
    });
    lines.push(`  ${DIM}Workers: ${RUNTIME_AGENTS.join(' · ')}${RESET}`);
    lines.push(sep());

    padToStatus(lines, maxRows);
    lines.push(`  ${DIM}type a company or a question${RESET}  ${DIM}·${RESET}  ${DIM}/model${RESET}  ${DIM}^O${RESET} ${DIM}load${RESET}  ${DIM}^G${RESET} ${DIM}help${RESET}  ${DIM}^D${RESET} ${DIM}quit${RESET}`);
    lines.push(`  ${spin} ${status}`);

  // ── SMALL: brand + desk names only ─────────────────────────────────────
  } else if (maxRows >= 10) {
    lines.push(`  ${mark}  ${BRAND}${BOLD}MARKED${RESET}  ${DIM}The view that matters.${RESET}`);
    lines.push(sep());
    // Show desk names without descriptions to save rows
    const deskNames = DESK.map(([name]) => `${BRAND}${name}${RESET}`).join(`${DIM} · ${RESET}`);
    lines.push(`  ${deskNames}`);
    lines.push(`  ${DIM}Workers: ${RUNTIME_AGENTS.join(' · ')}${RESET}`);
    lines.push(sep());

    padToStatus(lines, maxRows);
    lines.push(`  ${DIM}type to ask  /model  ^G help  ^D quit${RESET}`);
    lines.push(`  ${spin} ${status}`);

  // ── TINY: just brand + spinner ─────────────────────────────────────────
  } else {
    lines.push(`  ${mark}  ${BRAND}${BOLD}MARKED${RESET}`);
    padToStatus(lines, maxRows, 0);
    lines.push(`  ${spin}  ${status}`);
  }

  return lines.join('\n');
}
