/**
 * scroll.js — Scroll state management and mouse wheel handler.
 *
 * Manages scroll offset and SGR mouse wheel input for the live TUI phase.
 */

import { tui } from './state.js';
import { paintWithScroll } from './render.js';

// ── Mouse wheel handler ─────────────────────────────────────────────────────
// SGR mode: \x1b[<64;col;rowM = wheel up, \x1b[<65;col;rowM = wheel down

let _mouseInputActive = false;
let _lastEscapeMs = 0;
let _mouseReportMs = 0;

/**
 * Returns true if ANY escape sequence was received within the last 300ms.
 * This catches all mouse/terminal escape sequences, not just matched scroll events.
 */
export function isMouseRecent() {
  return Date.now() - _lastEscapeMs < 300;
}

/**
 * True while readline is still emitting the characters of a mouse report.
 *
 * A click arrives as one chunk (\x1b[<0;42;13M) which readline decodes into
 * separate keypresses — the coordinates land in whatever field is open as
 * stray digits and semicolons. This data handler runs before readline's
 * emitter, so the whole burst falls inside a window far shorter than any
 * human keystroke.
 */
export function isMouseSequenceActive() {
  return Date.now() - _mouseReportMs < 50;
}

export function setupMouseWheel() {
  if (_mouseInputActive) return;
  _mouseInputActive = true;
  process.stdin.on('data', (data) => {
    const str = data.toString();
    // Flag ANY escape sequence — prevents digits from mouse events triggering clipboard
    if (str.includes('\x1b[')) {
      _lastEscapeMs = Date.now();
    }
    if (/\x1b\[<\d*/.test(str)) _mouseReportMs = Date.now();
    const match = str.match(/\x1b\[<(\d+);\d+;\d+[Mm]/);
    if (!match || !tui.lastContent) return;
    const btn = parseInt(match[1], 10);
    if (btn === 64) { tui.scrollOffset = Math.max(0, tui.scrollOffset - 3); paintWithScroll(); }
    else if (btn === 65) { tui.scrollOffset += 3; paintWithScroll(); }
  });
}
