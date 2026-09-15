/**
 * market.js — the conditions every Indian company is priced against.
 *
 * Rates, the rupee and the commodity complex are not company data, but no
 * reading of an Indian company is complete without them: a refiner is a bet on
 * Brent, an IT exporter on the dollar, and everything levered is a bet on the
 * repo rate.
 *
 * The API states its own coverage — a series it has not ingested comes back
 * `available: false` with a reason — so this renders the gaps as rows rather
 * than quietly showing a shorter table.
 */

import { fg, palette, BOLD, DIM, RESET } from '../src/index.js';
import { shortDate } from '../data/normalization.js';

/** Order matters: rates first, because they price everything else. */
const MACRO_ORDER = ['rates', 'prices', 'activity', 'external', 'fiscal'];

export function marketBlocks(context, { width = 120 } = {}) {
  const data = context?.data ?? context ?? {};
  const fx = entries(data.fx);
  const commodities = entries(data.commodities);
  const macro = entries(data.macro);

  if (!fx.length && !commodities.length && !macro.length) {
    return [{ divider: 'MARKET' }, { text: 'No market context was returned.', id: 'market-empty' }];
  }

  const missing = [...fx, ...commodities, ...macro].filter(([, row]) => row?.available === false);

  return [
    { text: `MARKET CONTEXT   ${DIM}as of ${shortDate(data.as_of)} IST${RESET}`, id: 'market-title' },
    { divider: 'RATES & MACRO' },
    { table: macroTable(macro) },
    { divider: 'CURRENCY' },
    {
      row: [
        { w: 0.5, stack: [{ table: quoteTable(fx, 'Pair') }] },
        { w: 0.5, stack: [{ table: quoteTable(commodities, 'Commodity') }] },
      ],
      gap: 2,
    },
    ...(missing.length
      ? [{ text: `${missing.length} series not ingested: ${missing.map(([key]) => key).slice(0, 8).join(', ')}`, id: 'market-gaps' }]
      : []),
  ];
}

/** A market quote: level, and how far it has moved. */
function quoteTable(rows, label) {
  const live = rows.filter(([, row]) => row?.available !== false);
  if (!live.length) return { headers: [label, 'Level'], rows: [{ cells: ['none ingested', '—'] }] };
  return {
    headers: [label, 'Level', '1d', '1m', 'As of'],
    align: ['left', 'right', 'right', 'right', 'left'],
    rows: live.map(([key, row]) => ({
      cells: [
        row.name ?? key,
        `${number(row.value)}${unitSuffix(row.unit)}`,
        change(row.change_1d),
        change(row.change_1m),
        shortDate(row.as_of),
      ],
    })),
  };
}

/**
 * Macro series, grouped by what they measure.
 *
 * `observation_period` is the period the number describes and `known_at` is
 * when it could first be acted on — a revision to last quarter's GDP is new
 * information today, and collapsing the two would hide that.
 */
function macroTable(rows) {
  const live = rows.filter(([, row]) => row?.available !== false);
  if (!live.length) return { headers: ['Series', 'Value'], rows: [{ cells: ['none ingested', '—'] }] };

  const rank = (row) => {
    const index = MACRO_ORDER.indexOf(String(row?.category ?? ''));
    return index === -1 ? MACRO_ORDER.length : index;
  };
  const sorted = [...live].sort((a, b) => rank(a[1]) - rank(b[1]) || String(a[1].name).localeCompare(String(b[1].name)));

  return {
    headers: ['Series', 'Value', 'Category', 'Period', 'Known at', 'Rev'],
    align: ['left', 'right', 'left', 'left', 'left', 'right'],
    rows: sorted.map(([key, row]) => ({
      cells: [
        row.name ?? key,
        `${number(row.value)}${unitSuffix(row.unit)}`,
        row.category ?? '—',
        row.observation_period ?? '—',
        shortDate(row.known_at),
        row.revision ? String(row.revision) : '',
      ],
    })),
  };
}

function entries(section) {
  return section && typeof section === 'object' ? Object.entries(section) : [];
}

function number(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '—';
  const digits = Math.abs(n) >= 100 ? 2 : Math.abs(n) >= 1 ? 2 : 4;
  return n.toLocaleString('en-IN', { maximumFractionDigits: digits });
}

/** Percent reads as a suffix; everything else is spelled out in the unit column. */
function unitSuffix(unit) {
  return String(unit ?? '').toLowerCase() === 'percent' ? '%' : '';
}

function change(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '';
  const colour = fg(palette(n >= 0 ? 'positive' : 'negative') || '#ffffff');
  return `${colour}${n >= 0 ? '+' : ''}${n.toFixed(2)}%${RESET}`;
}

/** `/market` and its aliases. */
export function parseMarketCommand(input) {
  return /^\/(market|macro-context|context)$/i.test(String(input ?? '').trim()) ? { kind: 'market' } : null;
}
