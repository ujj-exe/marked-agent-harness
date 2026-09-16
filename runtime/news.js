/**
 * news.js — what was written about a company, and by whom.
 *
 * News is the one dataset here that is not a filing, so it is presented
 * differently: the publisher and the tier lead, because "the exchange said it"
 * and "a newspaper said it" are not the same claim and the reader should never
 * have to work out which they are looking at.
 *
 * Every item keeps its URL. Nothing here is summarised by a model — the
 * summary field, where it exists, is the publisher's own.
 */

import { fg, palette, BOLD, DIM, RESET } from '../src/index.js';
import { shortDate } from '../data/normalization.js';

/** Official sources outrank press; within a tier, newest first. */
const TIER_RANK = { official: 0, press: 1 };

export function sortNews(items = []) {
  return [...items].sort((a, b) => {
    const tier = (TIER_RANK[a.source_tier] ?? 9) - (TIER_RANK[b.source_tier] ?? 9);
    if (tier) return tier;
    return String(b.published_at ?? '').localeCompare(String(a.published_at ?? ''));
  });
}

/**
 * @param {object[]} items
 * @param {{title?: string, limit?: number, showTopics?: boolean}} options
 */
export function newsBlocks(items = [], { title = 'NEWS', limit = 20, showTopics = true } = {}) {
  if (!items.length) {
    return [{ divider: title }, { text: 'No news retrieved for this scope.', id: 'news-empty' }];
  }
  const rows = sortNews(items).slice(0, limit).map(item => ({
    cells: [
      shortDate(item.published_at),
      tierMark(item.source_tier),
      String(item.publisher ?? '—'),
      String(item.headline ?? '—'),
      ...(showTopics ? [list([...(item.topics ?? []), ...(item.regions ?? [])])] : []),
    ],
  }));
  return [
    { divider: title },
    { table: {
      headers: ['Published', '', 'Publisher', 'Headline', ...(showTopics ? ['Tags'] : [])],
      rows,
    } },
    { text: `${items.length} item${items.length === 1 ? '' : 's'} · ${DIM}official sources first${RESET}`, id: 'news-count' },
  ];
}

/**
 * A tier is a claim about authority, so it gets a mark of its own rather than
 * being folded into the publisher column where it would read as a name.
 */
function tierMark(tier) {
  const accent = palette('accent') || '#ffffff';
  if (tier === 'official') return `${fg(accent)}${BOLD}OFF${RESET}`;
  if (tier === 'press') return `${DIM}prs${RESET}`;
  return `${DIM}—${RESET}`;
}

function list(value) {
  const items = Array.isArray(value) ? value : [];
  return items.slice(0, 3).join(' ');
}

/** `/news`, `/news rates`, `/news india` — a topic or region narrows it. */
export function parseNewsCommand(input) {
  const match = String(input ?? '').trim().match(/^\/news(?:\s+([\s\S]+))?$/i);
  if (!match) return null;
  return { kind: 'news', filter: match[1]?.trim() || null };
}
