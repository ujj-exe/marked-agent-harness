/**
 * Financial number formatters. Pure functions, zero deps.
 * Follows the plan's number formatting spec.
 */
import { c, pc } from './ansi.js';
import { MARKET_GREEN, MARKET_RED } from './themes.js';

const SIGNED_PERCENT_CHANGE_RE = /^\s*([+-])(?=\d|\.\d)(?:\d{1,3}(?:,\d{3})*|\d+)(?:\.\d+)?%\s*(?:[▲▼])?\s*$/;

// ── Price ────────────────────────────────────────────────────────

export function fmtPrice(v) {
  if (v == null) return '—';
  v = Number(v);
  if (!Number.isFinite(v)) return '—';
  // Indian market, Indian money and Indian digit grouping: ₹1,25,750.00, not
  // $125,750.00. A rupee price wearing a dollar sign is simply wrong.
  if (v >= 1000) return `₹${v.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  if (v >= 1) return `₹${v.toFixed(2)}`;
  return `₹${v.toFixed(4)}`;
}

// ── Percentage ───────────────────────────────────────────────────

export function fmtPct(v, showSign = true) {
  if (v == null) return '—';
  v = Number(v);
  if (showSign) return `${v >= 0 ? '+' : ''}${v.toFixed(1)}%`;
  return `${v.toFixed(1)}%`;
}

// ── Market cap / large numbers ───────────────────────────────────

export function fmtCap(v) {
  if (v == null) return '—';
  v = Number(v);
  if (!Number.isFinite(v)) return '—';
  // Crore is the unit an Indian market participant reads market cap in.
  // "$2.37T" is both the wrong currency and a scale nobody here quotes.
  if (v >= 1e7) return `₹${(v / 1e7).toLocaleString('en-IN', { maximumFractionDigits: 0 })} Cr`;
  if (v >= 1e5) return `₹${(v / 1e5).toLocaleString('en-IN', { maximumFractionDigits: 1 })} L`;
  return `₹${v.toLocaleString('en-IN')}`;
}

// ── Volume ───────────────────────────────────────────────────────

export function fmtVol(v) {
  if (v == null) return '—';
  v = Number(v);
  if (v >= 1e9) return `${(v / 1e9).toFixed(1)}B`;
  if (v >= 1e6) return `${(v / 1e6).toFixed(1)}M`;
  if (v >= 1e3) return `${(v / 1e3).toFixed(1)}K`;
  return String(Math.round(v));
}

// ── Number ───────────────────────────────────────────────────────

export function fmtNumber(v, decimals = 2) {
  if (v == null) return '—';
  v = Number(v);
  if (Math.abs(v) >= 1e6) return fmtVol(v);
  return v.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

// ── Date ─────────────────────────────────────────────────────────

const MONTHS = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function fmtDate(d) {
  if (!d) return '—';
  const s = String(d).slice(0, 10);
  const parts = s.split('-');
  if (parts.length < 3) return s;
  return `${MONTHS[parseInt(parts[1], 10)]} ${parseInt(parts[2], 10)}`;
}

// ── Colored formatters ───────────────────────────────────────────

export function coloredPrice(v) {
  return pc('data', fmtPrice(v));
}

export function coloredPct(v) {
  if (v == null) return pc('muted', '—');
  v = Number(v);
  if (v > 0) return pc('positive', `+${v.toFixed(1)}%`);
  if (v < 0) return pc('negative', `${v.toFixed(1)}%`);
  return pc('muted', `${v.toFixed(1)}%`);
}

export function coloredCap(v) {
  return pc('data', fmtCap(v));
}

export function coloredVol(v) {
  return pc('data', fmtVol(v));
}

export function coloredChange(v, fmt = 2) {
  if (v == null) return pc('muted', '—');
  v = Number(v);
  const s = v.toFixed(fmt);
  if (v > 0) return pc('positive', `+${s}`);
  if (v < 0) return pc('negative', s);
  return pc('muted', s);
}

/**
 * Returns a colored ANSI badge string for a conviction level.
 * Uses 24-bit ANSI color codes for precise terminal color rendering.
 *
 * @param {string} conviction - One of: strong_bull, bull, neutral, bear, strong_bear
 * @returns {string} ANSI-colored badge string (empty string if falsy)
 */
export function convictionBadge(conviction) {
  if (!conviction) return '';
  switch (conviction) {
    case 'strong_bull': return '\x1b[1;38;2;0;255;136m[STRONG BULL]\x1b[0m';
    case 'bull':        return '\x1b[38;2;0;255;136m[BULL]\x1b[0m';
    case 'neutral':     return '\x1b[38;2;255;170;0m[NEUTRAL]\x1b[0m';
    case 'bear':        return '\x1b[38;2;255;92;48m[BEAR]\x1b[0m';
    case 'strong_bear': return '\x1b[1;38;2;255;92;48m[STRONG BEAR]\x1b[0m';
    default:            return pc('muted', `[${String(conviction).toUpperCase()}]`);
  }
}

export function coloredSignal(signal, confidence) {
  if (!signal) return pc('muted', '—');
  const s = signal.toUpperCase();
  let role = 'muted';
  if (s.includes('BUY') || s.includes('BULL') || s.includes('RISK-ON')) role = 'positive';
  else if (s.includes('SELL') || s.includes('BEAR') || s.includes('RISK-OFF')) role = 'negative';
  else if (s.includes('HOLD') || s.includes('NEUTRAL')) role = 'warning';
  else if (s.includes('CAUTIOUS')) role = 'warning';
  const text = confidence != null ? `${s} ${Math.round(confidence * 100)}%` : s;
  return pc(role, text);
}

export function coloredRsi(v) {
  if (v == null) return pc('muted', '—');
  v = Number(v);
  if (v >= 70) return pc('negative', `${v.toFixed(1)}`) + ' ' + pc('negative', '▲');
  if (v <= 30) return pc('positive', `${v.toFixed(1)}`) + ' ' + pc('positive', '▼');
  return pc('data', `${v.toFixed(1)}`);
}

export function trendArrow(direction) {
  const d = String(direction).toLowerCase();
  if (['rising', 'up', 'bullish', 'above'].includes(d)) return pc('positive', '▲');
  if (['falling', 'down', 'bearish', 'below'].includes(d)) return pc('negative', '▼');
  return pc('muted', '■');
}

export function tablePercentColor(text) {
  const match = String(text ?? '').match(SIGNED_PERCENT_CHANGE_RE);
  if (!match) return '';
  return match[1] === '+' ? MARKET_GREEN : MARKET_RED;
}

export function colorTablePercent(text) {
  const str = String(text ?? '');
  const hex = tablePercentColor(str);
  return hex ? c(hex, str) : str;
}
