/**
 * chart.js — turning the data layer into something you can look at.
 *
 * A chart here answers a question: how has this measure moved, over this
 * period, against this comparison. So a series is never built from a chart's
 * own arithmetic — it reads reported facts and the metric library, which means
 * a margin drawn here and a margin printed in the Financials table are the same
 * number by construction (§15.4).
 *
 * Two kinds of series exist and they want different pictures:
 *
 *   - price: hundreds of points, continuous, best as a line;
 *   - fundamentals: four or five annual points, best as labelled bars, because
 *     a five-point line is a shape with no information in it.
 */

import { computeMetrics, getMetric, periodLabel } from '../data/metrics.js';
import { LABELS } from '../data/normalization.js';

/** Words a user might type for a series, and where the numbers come from. */
const CHARTABLE = [
  { key: 'price', kind: 'price', label: 'Price', unit: 'INR', aliases: ['px', 'quote'] },
  { key: 'revenue', kind: 'concept', concept: 'Revenue', label: 'Revenue', unit: 'INR', aliases: ['sales', 'topline'] },
  { key: 'pat', kind: 'concept', concept: 'ProfitAfterTax', label: 'Profit after tax', unit: 'INR', aliases: ['profit', 'netprofit', 'earnings'] },
  { key: 'pbt', kind: 'concept', concept: 'ProfitBeforeTax', label: 'Profit before tax', unit: 'INR', aliases: [] },
  { key: 'ocf', kind: 'concept', concept: 'NetCashFromOperatingActivities', label: 'Operating cash flow', unit: 'INR', aliases: ['cashflow', 'operatingcashflow'] },
  { key: 'equity', kind: 'concept', concept: 'TotalEquity', label: 'Total equity', unit: 'INR', aliases: ['networth'] },
  { key: 'debt', kind: 'concept', concept: 'Borrowings', label: 'Borrowings', unit: 'INR', aliases: ['borrowings'] },
  { key: 'assets', kind: 'concept', concept: 'TotalAssets', label: 'Total assets', unit: 'INR', aliases: [] },
  // Everything the metric library computes is chartable by its own id.
  ...['pat_margin', 'roe', 'roce', 'net_debt', 'debt_to_equity', 'revenue_growth',
      'pat_growth', 'receivable_days', 'inventory_days', 'ocf_to_pat']
    .map(id => ({ key: id, kind: 'metric', metric: id, aliases: [id.replace(/_/g, '')] })),
];

const CHART_INDEX = new Map();
for (const entry of CHARTABLE) {
  CHART_INDEX.set(entry.key, entry);
  for (const alias of entry.aliases ?? []) CHART_INDEX.set(alias, entry);
}

export const CHARTABLE_KEYS = CHARTABLE.map(entry => entry.key);

/** Resolve what the user asked to see. Unambiguous prefixes are allowed. */
export function resolveSeries(name) {
  const wanted = String(name ?? '').trim().toLowerCase().replace(/[\s-]/g, '_');
  if (!wanted) return null;
  if (CHART_INDEX.has(wanted)) return CHART_INDEX.get(wanted);
  const keys = [...CHART_INDEX.keys()].filter(key => key.startsWith(wanted));
  const unique = new Set(keys.map(key => CHART_INDEX.get(key).key));
  return unique.size === 1 ? CHART_INDEX.get(keys[0]) : null;
}

/** Ranges, in the units each kind of series is measured in. */
export const RANGES = {
  '1m': { days: 31 }, '3m': { days: 93 }, '6m': { days: 186 },
  '1y': { days: 366, years: 1 }, '3y': { days: 1096, years: 3 },
  '5y': { days: 1827, years: 5 }, 'max': { days: Infinity, years: Infinity },
};

export function resolveRange(value) {
  const wanted = String(value ?? '').trim().toLowerCase();
  return RANGES[wanted] ? wanted : null;
}

/** Transformations a series can be viewed through (§13). */
export const TRANSFORMS = ['absolute', 'yoy', 'indexed', 'cagr'];

export function resolveTransform(value) {
  const wanted = String(value ?? '').trim().toLowerCase();
  if (wanted === 'normalized' || wanted === 'rebased') return 'indexed';
  return TRANSFORMS.includes(wanted) ? wanted : null;
}

/**
 * Build a series.
 *
 * @returns {{points: Array<{label: string, value: number, evidence: string[]}>,
 *            label: string, unit: string, kind: string, basis: string,
 *            transform: string, note: string|null}}
 */
export function buildSeries(world, spec = {}) {
  const entry = typeof spec.series === 'object' ? spec.series : resolveSeries(spec.series ?? 'price');
  if (!entry) return empty(`Unknown series "${spec.series}"`);
  const range = resolveRange(spec.range) ?? (entry.kind === 'price' ? '6m' : '5y');
  const transform = resolveTransform(spec.transform) ?? 'absolute';

  const raw = entry.kind === 'price'
    ? pricePoints(world, range)
    : fundamentalPoints(world, entry, range);

  if (!raw.points.length) return empty(raw.note ?? `No data for ${raw.label ?? entry.key}`, { ...raw, transform });
  return applyTransform({ ...raw, transform, range, kind: entry.kind });
}

function empty(note, rest = {}) {
  return { points: [], label: rest.label ?? '', unit: rest.unit ?? '', kind: rest.kind ?? 'none', basis: rest.basis ?? '', transform: rest.transform ?? 'absolute', note };
}

function pricePoints(world, range) {
  const rows = Array.isArray(world.packet?.price?.data) ? world.packet.price.data : [];
  const cutoff = RANGES[range].days;
  const now = Date.now();
  const points = rows
    .map(row => ({ ts: new Date(String(row.ts ?? row.date)).getTime(), value: Number(row.close) }))
    .filter(point => Number.isFinite(point.value) && Number.isFinite(point.ts))
    .filter(point => cutoff === Infinity || (now - point.ts) / 86400000 <= cutoff)
    .sort((a, b) => a.ts - b.ts)
    .map(point => ({ label: new Date(point.ts).toISOString().slice(0, 10), value: point.value, evidence: [] }));
  return {
    points, label: `Price · ${world.symbol ?? ''}`.trim(), unit: 'INR', basis: 'market',
    note: points.length ? null : 'No price history in the retrieved window',
  };
}

/**
 * Annual points, from the metric library for ratios and from reported facts
 * for line items. Both routes carry the evidence ids of what they read.
 */
function fundamentalPoints(world, entry, range) {
  const years = RANGES[range].years ?? 5;
  if (entry.kind === 'metric') {
    const rows = metricsFor(world).filter(row => row.metric_id === entry.metric);
    const definition = getMetric(entry.metric);
    const points = rows
      .filter(row => row.status === 'ok')
      .sort((a, b) => a.period.localeCompare(b.period))
      .slice(-years)
      .map(row => ({ label: row.period, value: row.value, evidence: row.input_evidence_ids ?? [] }));
    const gaps = rows.filter(row => row.status !== 'ok').length;
    return {
      points,
      label: definition?.name ?? entry.metric,
      unit: definition?.unit ?? '',
      basis: world.basis ?? 'consolidated',
      note: points.length ? (gaps ? `${gaps} period${gaps === 1 ? '' : 's'} not computable` : null) : 'No computable periods',
    };
  }

  // A reported line item: take the annual figure for each year.
  const byPeriod = new Map();
  for (const row of [...facts(world.packet?.financials), ...facts(world.packet?.balance)]) {
    if (row.concept_id !== entry.concept) continue;
    if (String(row.basis ?? 'consolidated').toLowerCase() !== String(world.basis ?? 'consolidated').toLowerCase()) continue;
    const span = spanDays(row.period_start, row.period_end);
    if (span !== null && span < 350) continue;           // a quarter is not a year
    const period = periodLabel(row.period ?? row.fiscal_year ?? row.period_end);
    if (!period) continue;
    const value = Number(row.value) * (Number(row.scale) || 1);
    if (!Number.isFinite(value)) continue;
    const previous = byPeriod.get(period);
    if (!previous || String(row.known_at ?? '') >= String(previous.known_at ?? '')) {
      byPeriod.set(period, { label: period, value, evidence: row.evidence_id ? [row.evidence_id] : [], known_at: row.known_at });
    }
  }
  const points = [...byPeriod.values()].sort((a, b) => a.label.localeCompare(b.label)).slice(-years);
  return {
    points, label: entry.label ?? LABELS[entry.concept] ?? entry.concept, unit: entry.unit ?? '',
    basis: world.basis ?? 'consolidated',
    note: points.length ? null : `${entry.label ?? entry.concept} is not reported in the retrieved data`,
  };
}

function applyTransform(series) {
  const { transform, points } = series;
  if (transform === 'absolute' || points.length < 2) return series;

  if (transform === 'indexed') {
    const base = points[0].value;
    if (!base) return { ...series, note: 'cannot rebase on a zero starting value' };
    return {
      ...series, unit: 'index',
      points: points.map(point => ({ ...point, value: (point.value / base) * 100 })),
    };
  }

  if (transform === 'yoy') {
    const out = [];
    for (let i = 1; i < points.length; i++) {
      const previous = points[i - 1].value;
      // A change off a zero or negative base is not a percentage of anything.
      if (!previous || previous < 0) continue;
      out.push({ ...points[i], value: ((points[i].value - previous) / previous) * 100 });
    }
    return { ...series, unit: '%', points: out, note: out.length ? series.note : 'no period has a positive base to grow from' };
  }

  if (transform === 'cagr') {
    const first = points[0].value;
    const last = points.at(-1).value;
    const years = points.length - 1;
    if (first <= 0 || last <= 0) return { ...series, points: [], note: 'CAGR needs positive endpoints' };
    const rate = ((last / first) ** (1 / years) - 1) * 100;
    return {
      ...series, unit: '%',
      points: [{ label: `${points[0].label}→${points.at(-1).label}`, value: rate, evidence: points.flatMap(p => p.evidence) }],
      note: `compound annual growth over ${years} year${years === 1 ? '' : 's'}`,
    };
  }
  return series;
}

function metricsFor(world) {
  if (!world._metrics) {
    world._metrics = computeMetrics(world.packet ?? {}, {
      company_id: world.company_id, security_id: world.security_id, basis: world.basis, asOf: world.as_of,
    });
  }
  return world._metrics;
}

function facts(envelope) {
  const data = envelope?.data ?? envelope;
  return Array.isArray(data) ? data : [];
}

function spanDays(start, end) {
  if (!start || !end) return null;
  const from = new Date(String(start));
  const to = new Date(String(end));
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return null;
  return Math.round((to - from) / 86400000);
}

// ── Rendering ───────────────────────────────────────────────────────────────

/**
 * Blocks for a series.
 *
 * Fundamentals become a labelled bar per period with the period-on-period
 * change beside it — four numbers you can actually read — while price keeps
 * the line, which is the right picture for hundreds of points.
 */
export function seriesBlocks(series, { width = 100, height = 12, id = 'world-chart', refs = null } = {}) {
  const head = `${series.label}${series.unit && series.unit !== 'INR' ? ` (${series.unit})` : ''}`
    + (series.basis && series.basis !== 'market' ? ` · ${series.basis}` : '')
    + (series.transform && series.transform !== 'absolute' ? ` · ${series.transform}` : '')
    + (series.range ? ` · ${String(series.range).toUpperCase()}` : '');

  if (!series.points.length) {
    return [
      { text: head, id: `${id}-title` },
      { text: series.note ?? 'No data', id: `${id}-empty` },
    ];
  }

  if (series.kind === 'price') {
    const values = series.points.map(point => point.value);
    const first = series.points[0].label;
    const last = series.points.at(-1).label;
    return [
      { text: head, id: `${id}-title` },
      { panel: 'chart', id, data: { values, height, label: `${first} → ${last}`, showAxis: true } },
      ...(series.note ? [{ text: series.note, id: `${id}-note` }] : []),
    ];
  }

  return [
    { text: head, id: `${id}-title` },
    { table: barTable(series, width, refs), id: `${id}-bars` },
    ...(series.note ? [{ text: series.note, id: `${id}-note` }] : []),
  ];
}

/**
 * A bar per period, anchored at zero.
 *
 * Net debt and growth rates go negative, so the axis sits inside the track
 * rather than at its left edge — otherwise a negative value would draw as
 * nothing and read as missing.
 */
function barTable(series, width, refs = null) {
  const values = series.points.map(point => point.value);
  const max = Math.max(...values, 0);
  const min = Math.min(...values, 0);
  const span = (max - min) || 1;
  const track = Math.max(10, Math.min(48, width - 46));
  const zero = Math.round((0 - min) / span * track);

  const rows = series.points.map((point, index) => {
    const at = Math.round((point.value - min) / span * track);
    const from = Math.min(zero, at);
    const to = Math.max(zero, at);
    const bar = ' '.repeat(from) + (point.value >= 0 ? '█' : '▓').repeat(Math.max(1, to - from));
    // No change column on a series that is already a change: the year-on-year
    // move of a year-on-year move is a second derivative nobody asked for.
    const previous = series.points[index - 1]?.value;
    const change = series.transform === 'absolute' && index && Number.isFinite(previous) && previous > 0
      ? `${point.value >= previous ? '+' : ''}${(((point.value - previous) / previous) * 100).toFixed(1)}%`
      : '';
    // Each plotted point names the facts behind it, so a chart is a way into
    // the evidence rather than a picture you have to take on trust.
    const cited = refs ? refs(point.evidence ?? []).slice(0, 3).join(' ') : '';
    return { cells: [point.label, bar.padEnd(track), formatValue(point.value, series.unit), change, cited] };
  });
  return {
    headers: ['Period', '', 'Value', 'Δ', refs ? 'From' : ''],
    rows,
    align: ['left', 'left', 'right', 'right', 'left'],
  };
}

/** Indian market conventions: crore for money, plain for ratios. */
export function formatValue(value, unit) {
  if (!Number.isFinite(value)) return '—';
  if (unit === '%') return `${value.toFixed(2)}%`;
  if (unit === 'x') return `${value.toFixed(2)}x`;
  if (unit === 'days') return `${Math.round(value)}d`;
  if (unit === 'index') return value.toFixed(1);
  if (unit === 'count') return value >= 1e7
    ? `${(value / 1e7).toLocaleString('en-IN', { maximumFractionDigits: 2 })} Cr`
    : value.toLocaleString('en-IN', { maximumFractionDigits: 0 });
  if (Math.abs(value) >= 1e7) return `₹${(value / 1e7).toLocaleString('en-IN', { maximumFractionDigits: 0 })} Cr`;
  return `₹${value.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
}

// ── Comparison ──────────────────────────────────────────────────────────────

/**
 * The same measure across several companies.
 *
 * Levels are not comparable between companies of different sizes, so a
 * comparison of an absolute measure is rebased to 100 at the first shared
 * period unless a transform was asked for explicitly. Comparing ₹1.7 lakh
 * crore of revenue against ₹2.5 lakh crore as bars says only which company is
 * bigger, which nobody needed a chart to learn.
 *
 * @param {object[]} worlds the open world first, then its comparators
 */
export function buildComparison(worlds, spec = {}) {
  const entry = resolveSeries(spec.series ?? 'price');
  if (!entry) return { columns: [], periods: [], note: `Unknown series "${spec.series}"` };

  const implicit = !spec.transform && entry.kind !== 'metric';
  const transform = resolveTransform(spec.transform) ?? (implicit ? 'indexed' : 'absolute');

  const columns = worlds.map(world => ({
    label: world.symbol || world.common_name,
    series: buildSeries(world, { ...spec, transform }),
  })).filter(column => column.series.points.length);

  if (columns.length < 2) {
    return { columns, periods: [], label: entry.label ?? entry.key, unit: '', transform, note: 'Not enough companies report this measure to compare' };
  }

  // Only periods every company reports: a row where one column is blank
  // invites the reader to compare years that were never aligned.
  const shared = columns
    .map(column => new Set(column.series.points.map(point => point.label)))
    .reduce((all, set) => new Set([...all].filter(label => set.has(label))));
  const periods = [...shared].sort();

  return {
    columns, periods,
    label: columns[0].series.label,
    unit: columns[0].series.unit,
    transform,
    basis: columns[0].series.basis,
    note: implicit && transform === 'indexed' ? 'rebased to 100 at the first shared period — levels are not comparable across companies' : null,
  };
}

/** Blocks for a comparison: one column per company, one row per period. */
export function comparisonBlocks(comparison, { id = 'world-chart' } = {}) {
  const names = comparison.columns.map(column => column.label).join('  vs  ');
  const head = `${comparison.label || ''}${comparison.unit && comparison.unit !== 'INR' ? ` (${comparison.unit})` : ''}`
    + (comparison.transform && comparison.transform !== 'absolute' ? ` · ${comparison.transform}` : '');

  if (!comparison.periods.length) {
    return [
      { text: names || 'Comparison', id: `${id}-title` },
      { text: comparison.note ?? 'No period is reported by every company', id: `${id}-empty` },
    ];
  }

  const rows = comparison.periods.map(period => ({
    cells: [period, ...comparison.columns.map(column => {
      const point = column.series.points.find(candidate => candidate.label === period);
      return point ? formatValue(point.value, comparison.unit) : '—';
    })],
  }));

  return [
    { text: `${names}   ${head}`, id: `${id}-title` },
    { table: { headers: ['Period', ...comparison.columns.map(column => column.label)], rows }, id: `${id}-compare` },
    ...(comparison.note ? [{ text: comparison.note, id: `${id}-note` }] : []),
  ];
}
