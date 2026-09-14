/**
 * ANSI escape code helpers, box drawing, string measurement.
 * Zero dependencies. Pure functions (except palette lookups via theme).
 */
import { palette } from './themes.js';

const ESC = '\x1b[';
export const RESET = `${ESC}0m`;
export const BOLD = `${ESC}1m`;
export const DIM = `${ESC}2m`;

// ── Hex → true-color ANSI ────────────────────────────────────────

function hexToRgb(hex) {
  const h = hex.replace('#', '');
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

export function fg(hex) {
  const [r, g, b] = hexToRgb(hex);
  return `${ESC}38;2;${r};${g};${b}m`;
}

export function bg(hex) {
  const [r, g, b] = hexToRgb(hex);
  return `${ESC}48;2;${r};${g};${b}m`;
}

// ── Core helpers ─────────────────────────────────────────────────

/** Wrap text with ANSI color code and reset. */
export function c(hexOrCode, text) {
  if (!hexOrCode) return String(text);
  const code = hexOrCode.startsWith('#') ? fg(hexOrCode) : hexOrCode;
  return `${code}${text}${RESET}`;
}

/** Shortcut: palette role → colored text. */
export function pc(role, text) {
  const hex = palette(role);
  return hex ? c(hex, text) : String(text);
}

// ── ANSI stripping & measurement ─────────────────────────────────

const ANSI_RE = /\x1b\[[0-9;]*m/g;
const OSC8_RE = /\x1b\]8;[^\x07\x1b]*(?:\x07|\x1b\\)/g;

/** Remove all ANSI escape codes (SGR + OSC 8 hyperlinks). */
export function strip(s) {
  return String(s).replace(OSC8_RE, '').replace(ANSI_RE, '');
}

/** Visible character length (ignoring ANSI codes). */
export function visLen(s) {
  return strip(s).length;
}

/** Truncate to max visible width, preserving ANSI codes. */
export function ansiTrunc(s, maxVis) {
  s = String(s);
  let vis = 0;
  let i = 0;
  let lastGood = 0;
  let inOsc8 = false; // tracking whether we're inside an OSC8 hyperlink
  while (i < s.length && vis < maxVis) {
    if (s[i] === '\x1b') {
      // Check for OSC8 hyperlink: \x1b]8;
      if (s[i + 1] === ']' && s[i + 2] === '8' && s[i + 3] === ';') {
        // Find the terminator: BEL (\x07) or ST (\x1b\\)
        let j = i + 4;
        while (j < s.length) {
          if (s[j] === '\x07') { j++; break; }
          if (s[j] === '\x1b' && s[j + 1] === '\\') { j += 2; break; }
          j++;
        }
        // Detect whether this is an open or close tag
        // Close tag: \x1b]8;;\x07 (params and URI both empty → just ";")
        // Open tag: \x1b]8;;URL\x07 (has a URL after the second ";")
        const seq = s.slice(i, j);
        // After "\x1b]8;" the format is "params;URI<terminator>"
        // For close: params="" URI="" → the content between \x1b]8; and terminator is just ";"
        const inner = seq.slice(4, seq.endsWith('\x07') ? -1 : -2); // strip prefix and terminator
        if (inner === ';') {
          inOsc8 = false;
        } else {
          inOsc8 = true;
        }
        i = j;
        continue;
      }
      // SGR sequence: \x1b[...m
      let j = i + 1;
      while (j < s.length && s[j] !== 'm') j++;
      i = j + 1;
      continue;
    }
    vis++;
    i++;
    lastGood = i;
  }

  // No truncation needed — return the full string as-is
  if (i >= s.length) return s;

  // Truncation occurred: include any trailing escape sequences after the
  // last visible character (they were already scanned but lastGood didn't
  // advance past them).  We slice to lastGood (after last visible char),
  // then close any open OSC8 link and reset SGR.
  let result = s.slice(0, lastGood);
  if (inOsc8) result += '\x1b]8;;\x07';
  result += RESET;
  return result;
}

/** Pad right to visible width. */
export function padRight(s, width) {
  const vl = visLen(s);
  if (vl >= width) return ansiTrunc(s, width);
  return s + ' '.repeat(width - vl);
}

/** Pad left (right-align) to visible width. */
export function padLeft(s, width) {
  const vl = visLen(s);
  if (vl >= width) return ansiTrunc(s, width);
  return ' '.repeat(width - vl) + s;
}

/** Center within visible width. */
export function padCenter(s, width) {
  const vl = visLen(s);
  if (vl >= width) return ansiTrunc(s, width);
  const left = Math.floor((width - vl) / 2);
  const right = width - vl - left;
  return ' '.repeat(left) + s + ' '.repeat(right);
}

// ── Word-wrap ─────────────────────────────────────────────────────

/**
 * Word-wrap `text` to `maxLen` characters per line.
 * Returns an array of line strings.
 */
export function wordWrap(text, maxLen) {
  const words = String(text).split(' ');
  const lines = [];
  let cur = '';
  for (const word of words) {
    if (cur === '') {
      cur = word;
    } else if ((cur + ' ' + word).length <= maxLen) {
      cur += ' ' + word;
    } else {
      lines.push(cur);
      cur = word;
    }
  }
  if (cur) lines.push(cur);
  return lines;
}

// ── Box drawing ──────────────────────────────────────────────────

// Border hierarchy from plan:
// Tier 1: ╔═══╗ double — outer dashboard frame
// Tier 2: ╭───╮ rounded — panel borders
// Tier 3: ───── line — internal dividers
const DOUBLE = { tl: '╔', tr: '╗', bl: '╚', br: '╝', h: '═', v: '║' };
const ROUND  = { tl: '╭', tr: '╮', bl: '╰', br: '╯', h: '─', v: '│' };
const LINE   = { h: '─', v: '│', ml: '├', mr: '┤' };

export function boxTop(width, title = '', tier = 2) {
  const b = tier === 1 ? DOUBLE : ROUND;
  const ac = palette('accent');
  if (title) {
    const n = Math.max(0, width - 5 - strip(title).length);
    return c(ac, `${b.tl}${b.h} `) + c(ac, title) + c(ac, ` ${b.h.repeat(n)}${b.tr}`);
  }
  return c(ac, b.tl + b.h.repeat(width - 2) + b.tr);
}

export function boxBot(width, footer = '', tier = 2) {
  const b = tier === 1 ? DOUBLE : ROUND;
  const ac = palette('accent');
  if (footer) {
    const n = Math.max(0, width - 5 - strip(footer).length);
    return c(ac, `${b.bl}${b.h} `) + pc('muted', strip(footer)) + c(ac, ` ${b.h.repeat(n)}${b.br}`);
  }
  return c(ac, b.bl + b.h.repeat(width - 2) + b.br);
}

export function boxRow(content, width, tier = 2) {
  const b = tier === 1 ? DOUBLE : ROUND;
  const ac = palette('accent');
  const innerW = width - 4; // border + space + content + space + border
  const vl = visLen(content);
  const pad = Math.max(0, innerW - vl);
  const truncated = vl > innerW ? ansiTrunc(content, innerW) : content;
  const padStr = vl > innerW ? '' : ' '.repeat(pad);
  return c(ac, b.v) + ' ' + truncated + padStr + ' ' + c(ac, b.v);
}

export function boxDivider(width, title = '') {
  const ac = palette('accent');
  if (title) {
    const n = Math.max(0, width - 5 - strip(title).length);
    return c(ac, `${LINE.ml}${LINE.h} `) + pc('label', strip(title)) + c(ac, ` ${LINE.h.repeat(n)}${LINE.mr}`);
  }
  return c(ac, LINE.ml + LINE.h.repeat(width - 2) + LINE.mr);
}

export function boxEmpty(width, tier = 2) {
  const b = tier === 1 ? DOUBLE : ROUND;
  const ac = palette('accent');
  return c(ac, b.v) + ' '.repeat(width - 2) + c(ac, b.v);
}
