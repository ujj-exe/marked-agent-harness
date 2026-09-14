/**
 * splash.js — Splash screen renderer.
 *
 * Three responsive layouts: wide (≥82 cols), medium (≥48), narrow.
 * Figlet wordmark + desk grid + runtime status + version + pulse animation.
 */

import { BRAND, BOLD, DIM, RESET, LABEL, VERSION } from './state.js';
import { LOGO_B, WORDMARK, WORDMARK_WIDTH } from './logo.js';

// Pulse: ▐██ breathes lime → bright-white → lime → dim → recover
export const PULSE_COLORS = [
  '\x1b[38;2;192;255;0m',
  '\x1b[38;2;215;255;40m',
  '\x1b[38;2;240;255;90m',
  '\x1b[38;2;215;255;40m',
  '\x1b[38;2;192;255;0m',
  '\x1b[38;2;155;210;0m',
  '\x1b[38;2;192;255;0m',
];

export const SPINNER_FRAMES = ['⠋','⠙','⠹','⠸','⠼','⠴','⠦','⠧','⠇','⠏'];

// name, what it expects after the slash, what it does. The argument shape is
// shown because a command whose input you have to guess is a command you get
// wrong once and stop using.
export const DESK = [
  ['/analyst',   '<company>',            'filings, fundamentals, or any research question'],
  ['/compare',   '<a> and <b>',          '2–5 names separated by and / vs / comma'],
  ['/macro',     '',                     'RBI, inflation, growth — the regime behind the trade'],
  ['/sector',    '<sector>',             'rotations, thematics, and the names moving money'],
  ['/desk',      '<company>',            'market pulse · 3 seconds · everything that matters'],
  ['/risk',      '<company>',            'event impact · catalyst timing · what could go wrong'],
  ['/options',   '<symbol>',             'chains, OI skew, positioning — where smart money leans'],
  ['/futures',   '<symbol>',             'commodities, rates futures — the cross-asset tape'],
  ['/watch',     '<companies>',          'what moved · conviction logged'],
  ['/portfolio', '<holdings + weights>', 'allocation · concentration risk'],
];

export const RUNTIME_AGENTS = ['marked', 'claude', 'codex', 'openai-codex'];

/**
 * Render the splash screen as an ANSI string.
 * @param {string} msg - Status message
 * @param {number} width - Terminal width
 * @param {number} pulseFrame - Animation frame counter
 * @param {number} maxRows - Max terminal rows available
 * @returns {string} ANSI splash screen
 */
export function renderSplash(msg, width, pulseFrame = 0, maxRows = 999) {
  const pc = PULSE_COLORS[pulseFrame % PULSE_COLORS.length];
  const mark  = `${pc}${BOLD}▐██${RESET}`;
  const spin  = `${pc}${SPINNER_FRAMES[pulseFrame % SPINNER_FRAMES.length]}${RESET}`;
  const vStr = `${BRAND}${VERSION.current}${RESET}`;

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
      for (const row of WORDMARK) lines.push(`  ${row}`);
      lines.push('');
      lines.push(`  ${DIM}INDIA  ·  The view that matters.${RESET}`);
    } else {
      // Logo row 4 already contains "The view that matters."
      for (const row of LOGO_B) lines.push(`  ${row}`);
    }
    lines.push(sep());
    lines.push('');

    // Two-column: desk left, runtime workers + version right
    const colW = Math.floor(width / 2) - 2;
    lines.push(L(
      `  ${BRAND}${BOLD}THE DESK${RESET}  ${DIM}every seat takes a position${RESET}`,
      `${DIM}RUNTIME WORKERS${RESET}  `,
    ));
    const runtimeW = 'RUNTIME WORKERS'.length; // match header width
    lines.push(L(
      `  ${DIM}${'─'.repeat(colW - 2)}${RESET}`,
      `${DIM}${'─'.repeat(runtimeW)}${RESET}  `,
    ));

    const runtimeLines = [
      ...RUNTIME_AGENTS.map(a => `  ${BRAND}●${RESET} ${DIM}${a.padEnd(8)}${RESET} ${DIM}connected${RESET}`),
      '',
      `  ${vStr}`,
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
    while (lines.length < maxRows - 2) lines.push('');
    lines.push(`  ${DIM}n${RESET} ${DIM}query${RESET}  ${DIM}/model${RESET}  ${DIM}l${RESET} ${DIM}load${RESET}  ${DIM}?${RESET} ${DIM}help${RESET}  ${DIM}q${RESET} ${DIM}quit${RESET}`);
    lines.push(L(
      `  ${spin} ${DIM}${msg}${RESET}`,
      `${DIM}marked.run  ·  ${RESET}${mark}  `,
    ));

  // ── MEDIUM: compact header + desk list ───────────────────────────────────
  } else if (width >= 48 && maxRows >= 16) {
    lines.push('');
    lines.push(L(`  ${mark}  ${BRAND}${BOLD}MARKED${RESET}`, `  ${vStr}  `));
    lines.push(`  ${DIM}marked.run  ·  India-first financial intelligence${RESET}`);
    lines.push(sep());
    lines.push(`  ${BRAND}${BOLD}THE DESK${RESET}`);
    DESK.forEach(([name, arg, desc]) => {
      lines.push(`  ${BRAND}${name.padEnd(11)}${RESET}${LABEL}${(arg || '').padEnd(11)}${RESET}${DIM}${desc}${RESET}`);
    });
    lines.push(`  ${DIM}Workers: ${RUNTIME_AGENTS.join(' · ')}${RESET}`);
    lines.push(sep());

    while (lines.length < maxRows - 2) lines.push('');
    lines.push(`  ${DIM}n${RESET} ${DIM}query${RESET}  ${DIM}/model${RESET}  ${DIM}l${RESET} ${DIM}load${RESET}  ${DIM}?${RESET} ${DIM}help${RESET}  ${DIM}q${RESET} ${DIM}quit${RESET}`);
    lines.push(`  ${spin} ${DIM}${msg}${RESET}`);

  // ── SMALL: brand + desk names only ─────────────────────────────────────
  } else if (maxRows >= 10) {
    lines.push(`  ${mark}  ${BRAND}${BOLD}MARKED${RESET}  ${DIM}The view that matters.${RESET}`);
    lines.push(sep());
    // Show desk names without descriptions to save rows
    const deskNames = DESK.map(([name]) => `${BRAND}${name}${RESET}`).join(`${DIM} · ${RESET}`);
    lines.push(`  ${deskNames}`);
    lines.push(`  ${DIM}Workers: ${RUNTIME_AGENTS.join(' · ')}${RESET}`);
    lines.push(sep());

    while (lines.length < maxRows - 2) lines.push('');
    lines.push(`  ${DIM}n query  /model  l load  ? help  q quit${RESET}`);
    lines.push(`  ${spin} ${DIM}${msg}${RESET}`);

  // ── TINY: just brand + spinner ─────────────────────────────────────────
  } else {
    lines.push(`  ${mark}  ${BRAND}${BOLD}MARKED${RESET}`);
    while (lines.length < maxRows - 1) lines.push('');
    lines.push(`  ${spin}  ${DIM}${msg}${RESET}`);
  }

  return lines.join('\n');
}
