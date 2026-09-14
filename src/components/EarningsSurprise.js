/**
 * EarningsSurprise — horizontal timeline of earnings beat/miss history.
 *
 * Renders:
 *   Q1'24  ●  $0.42 vs $0.38  +10.5%  BEAT
 *   Q2'24  ○  $0.31 vs $0.35   -11.4%  MISS
 *   ...
 *
 * Pure function: (opts) → string (ANSI-colored, multi-line)
 */
import { c, pc, BOLD, RESET, padRight, padLeft, visLen, ansiTrunc } from '../ansi.js';
import { palette } from '../themes.js';
import { fmtPct } from '../formatters.js';

const DOT_BEAT = '●';
const CONNECTOR = '┄';

/**
 * Format an EPS value: always show sign-neutral $X.XX, or — if null.
 */
function fmtEps(v) {
  if (v == null) return '—';
  v = Number(v);
  return `$${v.toFixed(2)}`;
}

/**
 * Render the earnings surprise timeline.
 *
 * @param {Object} opts
 * @param {Array<{date: string, actual: number, estimate: number, surprise: number}>} opts.quarters
 *   Array of quarter records. `date` is a label like "Q1'24". `surprise` is percent.
 * @param {number} [opts.width=60] - Total display width in characters
 * @param {boolean} [opts.showConnector=true] - Draw connector line between quarters
 * @returns {string} Multi-line ANSI string
 */
export function earningsSurprise(opts = {}) {
  const {
    quarters = [],
    width = 60,
    showConnector = true,
  } = opts;

  if (!quarters.length) {
    return pc('muted', 'No earnings data');
  }

  const lines = [];

  // Column widths
  const dateW = 7;    // "Q1'24  "
  const dotW  = 1;    // dot
  const epsW  = 18;   // "$12.50 vs $11.80"
  const pctW  = 7;    // "+10.5%"

  for (let i = 0; i < quarters.length; i++) {
    const q = quarters[i];
    const isForward = q.actual == null && q.estimate != null;
    const hasSurprise = q.surprise != null && q.surprise !== 0;

    // Date label
    const dateStr = padRight(pc('label', String(q.date || q.period || '—')), dateW);

    if (isForward) {
      // Forward estimate: show estimate value + EST label
      const estStr = fmtEps(q.estimate);
      const dot = pc('muted', '○');
      const epsStr = padRight(pc('data', estStr) + pc('muted', ' est'), epsW);
      const yoy = q.yearAgoEps != null
        ? (() => {
            const yoyPct = (q.estimate / q.yearAgoEps - 1) * 100;
            const yoyRole = yoyPct >= 0 ? 'positive' : 'negative';
            const yoySign = yoyPct >= 0 ? '+' : '';
            return padLeft(c(palette(yoyRole), `${yoySign}${yoyPct.toFixed(0)}% YoY`), pctW + 3);
          })()
        : padLeft(pc('muted', ''), pctW);
      const label = pc('label', 'EST');
      lines.push(`${dateStr}${dot}  ${epsStr} ${yoy}  ${label}`);
    } else if (!hasSurprise) {
      // Actual without estimate comparison: show actual only
      const actualStr = fmtEps(q.actual);
      const dot = pc('data', DOT_BEAT);
      const epsStr = padRight(pc('data', actualStr), epsW);
      let connector = '';
      if (showConnector && i < quarters.length - 1) {
        connector = pc('muted', `  ${CONNECTOR}`);
      }
      lines.push(`${dateStr}${dot}  ${epsStr}${connector}`);
    } else {
      // Full beat/miss with surprise data
      const isBeat = q.surprise >= 0;
      const color = isBeat ? palette('positive') : palette('negative');
      const dot = c(color, DOT_BEAT);
      const actualStr = fmtEps(q.actual);
      const estStr    = fmtEps(q.estimate);
      const epsStr    = padRight(pc('data', actualStr) + pc('muted', ' vs ') + pc('data', estStr), epsW);
      const sign   = q.surprise >= 0 ? '+' : '';
      const pctVal = `${sign}${Number(q.surprise).toFixed(1)}%`;
      const pctStr = padLeft(c(color, pctVal), pctW);
      const label = c(color, isBeat ? 'BEAT' : 'MISS');
      let connector = '';
      if (showConnector && i < quarters.length - 1) {
        connector = pc('muted', `  ${CONNECTOR}`);
      }
      lines.push(`${dateStr}${dot}  ${epsStr}  ${pctStr}  ${label}${connector}`);
    }
  }

  // Clamp each line to width to prevent row overflow in sideBySide
  return lines.map(l => {
    const vl = visLen(l);
    if (vl > width) return ansiTrunc(l, width);
    if (vl < width) return l + ' '.repeat(width - vl);
    return l;
  }).join('\n');
}
