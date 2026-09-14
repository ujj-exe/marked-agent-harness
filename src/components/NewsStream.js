/**
 * NewsStream — scrollable-style news feed list.
 *
 * Renders items as:
 * · Headline text here...                    Source  2h ago
 *
 * Pure function: (opts) → ANSI string (multi-line)
 */
import { c, pc, BOLD, RESET, padRight, padLeft, visLen, strip } from '../ansi.js';
import { palette } from '../themes.js';

/**
 * Format a relative time string from a Date or timestamp.
 * Accepts: Date object, ISO string, or seconds-ago number.
 */
function relTime(time) {
  if (!time) return '';
  let t;
  if (typeof time === 'number') {
    // Treat as unix timestamp (seconds)
    t = new Date(time * 1000);
  } else {
    t = new Date(time);
  }
  if (isNaN(t.getTime())) return '';

  const diffMs = Date.now() - t.getTime();
  if (isNaN(diffMs)) return '';
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffH = Math.floor(diffMin / 60);
  const diffD = Math.floor(diffH / 24);

  if (diffSec < 60) return 'now';
  if (diffMin < 60) return `${diffMin}m`;
  if (diffH < 24) return `${diffH}h`;
  if (diffD < 7) return `${diffD}d`;
  return `${Math.floor(diffD / 7)}w`;
}

/**
 * Render a news stream feed.
 *
 * @param {Object} opts
 * @param {Array<{headline: string, source: string, url?: string, time?: Date|string|number}>} opts.items
 * @param {number} [opts.width=80] - Total line width
 * @param {number} [opts.limit=10] - Max items to render
 * @returns {string} Multi-line ANSI string
 */
export function newsStream(opts = {}) {
  const {
    items = [],
    width = 80,
    limit = 10,
  } = opts;

  if (!items.length) {
    return pc('muted', 'No news items.');
  }

  const displayed = items.slice(0, limit);
  const bullet = pc('accent', '·');

  const lines = displayed.map(item => {
    const source = item.source ? String(item.source) : '';
    const timeStr = relTime(item.time);

    // Right side: "Source 4h" — single space between source and age
    const rightParts = [];
    if (source) rightParts.push(pc('label', source));
    if (timeStr) rightParts.push(pc('muted', timeStr));
    const right = rightParts.join(' ');
    const rightVis = visLen(right);

    // Line layout: bullet(1) + space(1) + headline + space(1) + right
    const leftBudget = Math.max(8, width - 1 - 1 - 1 - rightVis);

    const headline = String(item.headline || item.title || '');
    const url = item.url || null;
    // Truncate with ellipsis if needed
    let headlineText;
    if (strip(headline).length > leftBudget) {
      headlineText = headline.slice(0, leftBudget - 1) + '…';
    } else {
      headlineText = headline;
    }
    // OSC 8 clickable link if URL present
    let headlineStr;
    if (url) {
      headlineStr = `\x1b]8;;${url}\x07${pc('data', headlineText)}\x1b]8;;\x07`;
    } else {
      headlineStr = pc('data', headlineText);
    }

    // Pad headline to fill left budget (right-justifies the source+age column)
    const headlineVis = visLen(headlineStr);
    const pad = Math.max(0, leftBudget - headlineVis);
    const paddedHeadline = headlineStr + ' '.repeat(pad);

    return bullet + ' ' + paddedHeadline + ' ' + right;
  });

  return lines.join('\n');
}
