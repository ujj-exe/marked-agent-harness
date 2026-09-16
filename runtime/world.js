/**
 * world.js — Company World: one retrieval, many views.
 *
 * A world is a resolved company plus the packet `runCompany` already gathers
 * for it — prices, financials, metrics, shareholding, filings, actions,
 * events. Tabs are *views over that packet*, not separate fetches: switching
 * from Financials to Ownership re-renders from memory and costs nothing. That
 * is the whole reason a world feels like a workstation rather than a sequence
 * of queries.
 *
 * Everything here is pure. A world takes data in and returns render blocks, so
 * the layout can be tested without a network or a terminal.
 */

import {
  priceChart, priceCandles, financialTable, holderPanel, filingPanel,
  eventTable, latestPrice, verdictPanel,
} from './orchestrator.js';
import { normalizeFinancialRows, shortDate } from '../data/normalization.js';
import { fg, palette, BOLD, DIM, RESET } from '../src/index.js';

// Reverse video: the active tab is a filled chip, legible in any palette.
const REVERSE = '\x1b[7m';
import { computeMetrics } from '../data/metrics.js';
import { buildSeries, seriesBlocks, resolveSeries, resolveRange, resolveTransform, buildComparison, comparisonBlocks } from './chart.js';
import { evidenceDrawerBlocks, evidenceTable, refsFor, worldEvidence, parseEvidenceRef } from './evidence.js';
import { valuationBlocks, riskBlocks } from './valuation.js';
import { newsBlocks } from './news.js';

/**
 * The tabs, in bar order. `build` returns the blocks for that tab.
 *
 * Adding a tab is one entry here — the command bar, the header bar and the
 * navigation keys all read this list, so a tab cannot exist in one and be
 * missing from another.
 */
export const TABS = [
  { id: 'overview',   label: 'OVERVIEW',   build: overviewBlocks },
  { id: 'chart',      label: 'CHART',      build: chartBlocks },
  { id: 'financials', label: 'FINANCIALS', build: financialsBlocks },
  { id: 'ownership',  label: 'OWNERSHIP',  build: ownershipBlocks },
  { id: 'filings',    label: 'FILINGS',    build: filingsBlocks },
  { id: 'events',     label: 'EVENTS',     build: eventsBlocks },
  { id: 'valuation',  label: 'VALUATION',  build: valuationBlocks },
  { id: 'peers',      label: 'PEERS',      build: peersBlocks },
  { id: 'risk',       label: 'RISK',       build: riskBlocks },
  { id: 'news',       label: 'NEWS',       build: worldNewsBlocks },
  { id: 'research',   label: 'RESEARCH',   build: researchBlocks },
  { id: 'evidence',   label: 'EVIDENCE',   build: evidenceBlocks },
];

export const TAB_IDS = TABS.map(tab => tab.id);
const TAB_BY_ID = new Map(TABS.map(tab => [tab.id, tab]));

/** Resolve a tab name, tolerating prefixes so `/fin` reaches Financials. */
export function resolveTab(name) {
  const wanted = String(name ?? '').trim().toLowerCase();
  if (!wanted) return null;
  if (TAB_BY_ID.has(wanted)) return wanted;
  const prefixed = TAB_IDS.filter(id => id.startsWith(wanted));
  return prefixed.length === 1 ? prefixed[0] : null;
}

/**
 * The serializable workspace object. Everything needed to restore a world —
 * identity, basis, as-of, which tab was open — travels in here.
 */
export function createWorld({ entity, security, packet, evidence = [], asOf = null, basis = 'consolidated', tab = 'overview', height = 24, width = 80 }) {
  const company = entity?.company ?? {};
  return {
    company_id: company.company_id ?? null,
    security_id: security?.security_id ?? null,
    company_name: company.legal_name || company.common_name || 'Unknown company',
    common_name: company.common_name || company.legal_name || '',
    symbol: security?.symbol ?? null,
    exchange: security?.exchange ?? null,
    isin: security?.isin || company.isin || null,
    sector: company.sector ?? null,
    basis,
    as_of: asOf,
    tab: resolveTab(tab) ?? 'overview',
    // The viewport the world was opened in. Views size themselves to it, so a
    // tall terminal gets a taller chart and more rows instead of dead space.
    height,
    width,
    // Which measure the Chart tab is showing. Part of the workspace, so it
    // survives moving to another tab and back.
    chart: { series: 'price', range: null, transform: null, versus: [] },
    // Comparator worlds, keyed by the reference the user typed. Fetched once.
    comparators: {},
    entity,
    security,
    packet,
    // Retrieved evidence records, referenced as E1…En wherever a number appears.
    evidence,
    research: null,
  };
}

// ── Header ──────────────────────────────────────────────────────────────────

/**
 * Identity, live quote and the tab bar — three dense rows that stay put while
 * the tabs change underneath them.
 */
export function worldHeader(world) {
  // The name leads in the accent; the identifiers that follow are reference
  // material and sit back. Without the contrast the whole row read as one
  // undifferentiated line.
  const accent = palette('accent') || '#ffffff';
  const rest = [
    world.exchange && world.symbol ? `${world.exchange}:${world.symbol}` : null,
    world.isin,
    world.sector,
  ].filter(Boolean).join('  ·  ');
  const identity = `${BOLD}${fg(accent)}${world.company_name}${RESET}`
    + (rest ? `${DIM}  ·  ${rest}${RESET}` : '');

  return [
    { text: identity, id: 'world-identity' },
    { text: quoteLine(world), id: 'world-quote' },
    { text: tabBar(world.tab), id: 'world-tabs' },
  ];
}

/** Price, move, range and the basis the numbers below are reported on. */
export function quoteLine(world) {
  const rows = priceSeries(world.packet?.price);
  const closes = rows.map(row => Number(row.close)).filter(Number.isFinite);
  const last = rows.at(-1) ?? {};

  // The live quote is authoritative where it exists: it carries the real
  // 52-week range, the day's move and market capitalisation. The OHLCV series
  // only ever supported a 30-bar proxy for those, which is a different claim.
  const q = world.packet?.quote?.data ?? world.packet?.quote ?? null;
  const price = Number.isFinite(Number(q?.price)) ? Number(q.price) : latestPrice(world.packet?.price);

  let move = Number.isFinite(Number(q?.change_percent)) ? Number(q.change_percent) : null;
  if (move == null) {
    const prev = Number(last.previous_close ?? closes.at(-2));
    move = Number.isFinite(prev) && prev !== 0 && price != null ? ((price - prev) / prev) * 100 : null;
  }

  const quoted = Number.isFinite(Number(q?.week_52_high)) && Number.isFinite(Number(q?.week_52_low));
  const high = quoted ? Number(q.week_52_high) : (closes.length ? Math.max(...closes) : null);
  const low = quoted ? Number(q.week_52_low) : (closes.length ? Math.min(...closes) : null);
  const window = quoted ? '52w' : `${closes.length}d`;
  const fromHigh = price != null && high ? ((price - high) / high) * 100 : null;
  const marketCap = Number.isFinite(Number(q?.market_cap)) ? Number(q.market_cap) : null;

  // Direction is colour as well as an arrow: on a dense screen the arrow alone
  // is a glyph among glyphs.
  const moveColor = move == null ? '' : fg(palette(move >= 0 ? 'positive' : 'negative') || '#ffffff');

  return [
    price != null ? `${BOLD}₹${fmt(price)}${RESET}` : 'price unavailable',
    move != null ? `${moveColor}${move >= 0 ? '▲' : '▼'}${signed(move)}%${RESET}` : null,
    (q?.volume ?? last.volume) != null ? `vol ${compact(q?.volume ?? last.volume)}` : null,
    marketCap != null ? `mcap ₹${(marketCap / 1e7).toLocaleString('en-IN', { maximumFractionDigits: 0 })} Cr` : null,
    high != null && low != null ? `${window} ${fmt(low)}–${fmt(high)}` : null,
    fromHigh != null ? `${signed(fromHigh)}% off ${window} high` : null,
    world.basis ? world.basis.toUpperCase() : null,
    q?.as_of || world.as_of || last.ts ? `as of ${shortDate(q?.as_of || world.as_of || last.ts)} IST` : null,
    q?.is_stale ? 'STALE' : null,
  ].filter(Boolean).join('   ');
}

/**
 * The tab bar.
 *
 * Brackets alone were not enough — arrowing left and right, you could not tell
 * where you were. The active tab is drawn as a filled chip in reverse video,
 * which is the one treatment that survives a dim palette, and the position is
 * stated numerically so the answer is never a matter of squinting.
 */
export function tabBar(active, { color = true } = {}) {
  const index = Math.max(0, TAB_IDS.indexOf(resolveTab(active) ?? 'overview'));
  const accent = palette('accent') || '#ffffff';
  const chips = TABS.map((tab, position) => {
    if (position === index) {
      return color
        ? `${REVERSE}${BOLD}${fg(accent)} ${tab.label} ${RESET}`
        : `[${tab.label}]`;
    }
    return color ? `${DIM} ${tab.label} ${RESET}` : ` ${tab.label} `;
  });
  const position = color
    ? `${DIM}  ${index + 1}/${TABS.length}  ← →${RESET}`
    : `  ${index + 1}/${TABS.length}`;
  return chips.join(color ? '' : ' ') + position;
}

/**
 * Rows a tab's own content may use, after the chrome the world always draws.
 *
 * Header is 3 rows, the footer and command line take 3 more, and each divider
 * costs one. Anything left over belongs to the view, which is what stops a
 * short table from stranding half a screen of nothing.
 */
export function contentRows(world, dividers = 1) {
  const chrome = 3 + 3 + dividers;
  return Math.max(6, (Number(world?.height) || 24) - chrome);
}

// ── Tabs ────────────────────────────────────────────────────────────────────

/** Blocks for the active tab, header included. */
export function worldBlocks(world, tabId = world.tab) {
  const tab = TAB_BY_ID.get(resolveTab(tabId) ?? 'overview') ?? TABS[0];
  return [...worldHeader({ ...world, tab: tab.id }), ...tab.build(world)];
}

function overviewBlocks(world) {
  const p = world.packet ?? {};
  const label = chartLabel(world);
  const events = count(p.events) + count(p.actions);

  // No arithmetic about screen size here. The chart is marked `grow`, and the
  // renderer — which is the only thing that knows how tall the rest actually
  // came out — hands it whatever rows are left over.
  return [
    { divider: 'OVERVIEW' },
    {
      row: [
        { w: 0.44, stack: [{ panel: 'chart', id: 'world-mini-chart', grow: true, data: { ...priceChart(p.price, label), height: 8 } }] },
        { w: 0.28, stack: [{ table: keyMetricsTable(p) }] },
        { w: 0.28, stack: [{ table: snapshotTable(world) }] },
      ],
      gap: 2,
    },
    { divider: 'OWNERSHIP & DISCLOSURES' },
    {
      row: [
        { w: 0.5, stack: ownershipView(p) },
        { w: 0.5, stack: [{ panel: 'filings', id: 'world-filings-mini', data: filingPanel(p.filings) }] },
      ],
      gap: 2,
    },
    { divider: 'RECENT' },
    ...(events
      ? [{ table: worldEventTable(world, clamp(events, 1, 18)) }]
      : [{ text: 'No events or corporate actions in the retrieved window.', id: 'world-no-events' }]),
  ];
}

function count(envelope) {
  const data = envelope?.data ?? envelope;
  return Array.isArray(data) ? data.length : 0;
}

/**
 * The latest reading of every ratio, beside the reported figures.
 *
 * The Financials tab has the full history; an overview wants to answer "how
 * does this company earn, and on what balance sheet" in one glance. A ratio
 * with no computable period is left out rather than shown as a dash — the
 * Financials tab is where the gap is explained.
 */
export function snapshotTable(world) {
  const rows = worldMetrics(world);
  const ok = rows.filter(row => row.status === 'ok');
  if (!ok.length) return { headers: ['Ratio', 'Value', 'Period'], rows: [{ cells: ['Not computable from retrieved data', '—', '—'] }] };

  const wanted = ['roe', 'roce', 'pat_margin', 'debt_to_equity', 'net_debt', 'ocf_to_pat', 'receivable_days', 'inventory_days'];
  const out = [];
  for (const id of wanted) {
    const latest = ok.filter(row => row.metric_id === id).sort((a, b) => b.period.localeCompare(a.period))[0];
    if (latest) out.push({ cells: [latest.metric_name, formatMetric(latest), latest.period] });
  }
  return { headers: ['Ratio', 'Value', 'Period'], rows: out.length ? out : [{ cells: ['No ratios computable', '—', '—'] }] };
}

/** Mark the chart panel in a series render as the block that takes the slack. */
function growChart(blocks) {
  return blocks.map(block => (block.panel === 'chart' ? { ...block, grow: true } : block));
}

function chartBlocks(world) {
  const p = world.packet ?? {};
  const view = world.chart ?? {};

  // Price is the default view, and it keeps the candles beneath it. Any other
  // series is a fundamental, where the candles mean nothing.
  // `/chart revenue vs TCS` — the comparators are fetched by the runtime and
  // parked on the world, so switching tabs does not refetch them.
  const versus = (view.versus ?? []).map(ref => world.comparators?.[ref.toUpperCase()]).filter(Boolean);
  if (versus.length) {
    const comparison = buildComparison([world, ...versus], { series: view.series ?? 'revenue', range: view.range, transform: view.transform });
    return [{ divider: 'COMPARISON' }, ...comparisonBlocks(comparison, { id: 'world-chart' })];
  }

  const series = buildSeries(world, { series: view.series ?? 'price', range: view.range, transform: view.transform });
  if (series.kind === 'price') {
    return [
      { divider: 'PRICE' },
      ...growChart(seriesBlocks(series, { width: world.width, height: 10, id: 'world-chart' })),
      { panel: 'candlestick', id: 'world-candles', data: { ...priceCandles(p.price, chartLabel(world)), height: 8 } },
    ];
  }
  return [
    { divider: String(series.label || 'CHART').toUpperCase() },
    ...seriesBlocks(series, { width: world.width, height: 12, id: 'world-chart', refs: ids => refsFor(world, ids) }),
  ];
}

/**
 * Point the Chart tab at a different measure, window or transformation.
 *
 * Returns an error string rather than guessing: charting revenue when the user
 * typed something ambiguous is worse than saying so.
 */
export function setChartView(world, args = '') {
  // `vs TCS`, `versus TCS HCLTECH` — everything after the keyword is a company.
  const text = String(args).trim();
  const split = text.match(/^([\s\S]*?)\s*\b(?:vs\.?|versus|against)\b\s*([\s\S]+)$/i);
  const versus = split ? split[2].split(/[\s,]+/).filter(Boolean) : null;
  const words = (split ? split[1] : text).trim().split(/\s+/).filter(Boolean);
  const view = { ...(world.chart ?? {}) };
  // Naming comparators replaces the previous set; naming none clears it, so a
  // plain `/chart revenue` is never silently still a comparison.
  view.versus = versus ?? [];
  const unknown = [];
  let namedSeries = false;
  let namedTransform = false;
  for (const word of words) {
    const range = resolveRange(word);
    if (range) { view.range = range; continue; }
    const transform = resolveTransform(word);
    if (transform) { view.transform = transform; namedTransform = true; continue; }
    const series = resolveSeries(word);
    if (series) { view.series = series.key; namedSeries = true; continue; }
    unknown.push(word);
  }
  // Asking for a different measure asks for that measure, not the last one's
  // transformation applied to it — `/chart net_debt` after `/chart revenue yoy`
  // should draw net debt, not its year-on-year change.
  //
  // null, not 'absolute': a comparison rebases to 100 unless a transform was
  // actually chosen, and it can only know that if "unspecified" is a distinct
  // value. Written as 'absolute' it compared raw levels, which tells the reader
  // only which company is larger.
  if (namedSeries && !namedTransform) view.transform = null;
  if (unknown.length) return { error: `Cannot chart "${unknown.join(' ')}" · try a measure, a range like 5Y, or yoy / indexed / cagr` };
  world.chart = view;
  world.tab = 'chart';
  return { view };
}

function financialsBlocks(world) {
  const p = world.packet ?? {};
  const basis = String(world.basis || 'consolidated').toUpperCase();
  return [
    { divider: `RATIOS · ${basis}` },
    { table: derivedTable(world) },
    ...(metricGapLine(world) ? [{ text: metricGapLine(world), id: 'world-metric-gaps' }] : []),
    { divider: `REPORTED · ${basis}` },
    { table: financialTable(p.financials, p.metrics) },
  ];
}

/**
 * The deterministic ratios, one column per year.
 *
 * Read from the metric library rather than recomputed here, so this table, a
 * chart and an AI answer cannot disagree about a margin. A metric that could
 * not be computed says which input was missing instead of leaving a blank the
 * reader will fill in themselves.
 */
export function derivedTable(world, limit = 5) {
  const rows = worldMetrics(world);
  if (!rows.length) return { headers: ['Ratio', 'Value'], rows: [{ cells: ['No derived metrics available', '—'] }] };

  const periods = [...new Set(rows.map(row => row.period))].sort().reverse().slice(0, limit);
  const ids = [...new Set(rows.map(row => row.metric_id))];
  const out = [];
  for (const id of ids) {
    const cells = [rows.find(row => row.metric_id === id).metric_name];
    let anyValue = false;
    let cited = [];
    for (const period of periods) {
      const hit = rows.find(row => row.metric_id === id && row.period === period);
      if (hit?.status === 'ok') {
        anyValue = true;
        cells.push(formatMetric(hit));
        // Cite the newest period's inputs: a derived number is only as
        // checkable as the facts underneath it.
        if (!cited.length) cited = refsFor(world, hit.input_evidence_ids ?? []);
      }
      else if (hit?.status === 'undefined') cells.push('n/d');
      else cells.push('—');
    }
    cells.push(cited.length ? cited.slice(0, 3).join(' ') : '');
    // A ratio with no value in any shown year is noise; its gap is reported in
    // the footer line instead of as a row of dashes.
    if (anyValue) out.push({ cells });
  }
  return { headers: ['Ratio', ...periods, 'From'], rows: out };
}

/**
 * The inputs that were not there, said plainly.
 *
 * Kept out of the ratio table: a sentence in a cell sets that column's width
 * and pushes every year off to the right.
 */
export function metricGapLine(world, limit = 5) {
  const rows = worldMetrics(world);
  const periods = [...new Set(rows.map(row => row.period))].sort().reverse().slice(0, limit);
  const missing = [...new Set(rows
    .filter(row => row.status === 'gap' && periods.includes(row.period))
    .flatMap(row => row.missing_inputs ?? []))];
  if (!missing.length) return null;
  const shown = missing.slice(0, 5).join(', ');
  return `data gap · not reported for every year shown: ${shown}${missing.length > 5 ? ` and ${missing.length - 5} more` : ''}`;
}

/** Metrics for this world, computed once and cached on it. */
export function worldMetrics(world) {
  if (!world._metrics) {
    world._metrics = computeMetrics(world.packet ?? {}, {
      company_id: world.company_id, security_id: world.security_id, basis: world.basis, asOf: world.as_of,
    });
  }
  return world._metrics;
}

function formatMetric(row) {
  if (row.unit === '%') return `${row.value.toFixed(2)}%`;
  if (row.unit === 'x') return `${row.value.toFixed(2)}x`;
  if (row.unit === 'days') return `${Math.round(row.value)}d`;
  const crore = row.value / 1e7;
  return `₹${crore.toLocaleString('en-IN', { maximumFractionDigits: 0 })} Cr`;
}

function ownershipBlocks(world) {
  return [{ divider: 'OWNERSHIP' }, ...ownershipView(world.packet ?? {}, 'world-holders')];
}

/**
 * Ownership without the double count.
 *
 * Promoter and Public are the split and they sum to 100. FII, DII and mutual
 * funds sit *inside* Public, so drawing all five as sibling bars implied the
 * company was ~198% owned. The institutional slice is a nested table instead,
 * and pledge — the signal with no US equivalent — gets its own line.
 */
function ownershipView(packet, id = 'world-holders-mini') {
  const panel = holderPanel(packet?.shareholding);
  const holders = Array.isArray(panel.holders) ? panel.holders : [];
  const find = name => holders.find(h => String(h.name).toLowerCase() === name)?.percent;

  const top = holders.filter(h => /^(promoter|public)$/i.test(h.name));
  const within = holders.filter(h => /^(fii|dii|mutual funds)$/i.test(h.name));
  // Plenty of listed Indian companies have no promoter at all — a
  // professionally managed one reports Public alone. Drawing a single bar and
  // hiding the institutions inside it says nothing, so when the top-level
  // split carries no information the bands themselves become the bars.
  if (top.length < 2) return [{ panel: 'holders', id, data: { ...panel, holders: holders.length ? holders : panel.holders } }];

  const pledged = find('pledged');
  const rows = within.map(h => ({ cells: [`  of which ${h.name}`, fmtPct(h.percent)] }));
  if (Number.isFinite(pledged)) rows.push({ cells: ['  promoter pledged', fmtPct(pledged)] });

  return [
    { panel: 'holders', id, data: { ...panel, holders: top } },
    ...(rows.length ? [{ table: { headers: ['Within public', '%'], rows }, id: `${id}-within` }] : []),
  ];
}

function filingsBlocks(world) {
  return [
    { divider: 'FILINGS' },
    { panel: 'filings', id: 'world-filings', data: filingPanel(world.packet?.filings) },
  ];
}

function eventsBlocks(world) {
  return [
    { divider: 'EVENTS & CORPORATE ACTIONS' },
    { table: worldEventTable(world, contentRows(world, 1) - 1) },
  ];
}

function worldEventTable(world, limit) {
  const p = world.packet ?? {};
  const refs = new Map(worldEvidence(world).list.map(item => [item.source_record_id, item.ref]));
  return eventTable(p.events, p.actions, limit, item => refs.get(item.event_id ?? item.action_id));
}

/**
 * Companies in the same sector.
 *
 * The list is fetched by the runtime and parked on the world; this only draws
 * it. Market data for each peer is not retrieved — that would be a dozen more
 * round trips for a list — so the table names the sector and leaves the
 * comparison to `/compare`, which does fetch properly.
 */
function peersBlocks(world) {
  const peers = Array.isArray(world.peers) ? world.peers : null;
  if (!peers) {
    return [
      { divider: 'PEERS' },
      { text: world.sector ? `Loading companies in ${world.sector}…` : 'No sector recorded for this company, so peers cannot be listed.', id: 'peers-empty' },
    ];
  }
  if (!peers.length) {
    return [{ divider: 'PEERS' }, { text: `No other company in the retrieved data reports the sector ${world.sector}.`, id: 'peers-none' }];
  }
  return [
    { divider: `PEERS · ${world.sector ?? 'sector'}` },
    { table: {
      headers: ['Company', 'ISIN', 'Listing'],
      rows: peers.map(peer => ({ cells: [peer.common_name ?? '—', peer.isin ?? '—', peer.listing_status ?? '—'] })),
    } },
    { text: `Compare any of them: /compare ${world.symbol ?? ''} ${peers[0]?.common_name ?? ''}`.trim(), id: 'peers-hint' },
  ];
}

/** News naming this company, fetched by the runtime and parked on the world. */
function worldNewsBlocks(world) {
  if (!Array.isArray(world.news)) {
    return [{ divider: 'NEWS' }, { text: 'Loading news…', id: 'news-loading' }];
  }
  return newsBlocks(world.news, { title: `NEWS · ${world.symbol ?? world.common_name}` });
}

function evidenceBlocks(world) {
  // When a reference is open, the drawer replaces the list — a drawer that
  // pushes the list off screen is a worse way to read one record.
  if (world.evidenceRef) return evidenceDrawerBlocks(world, world.evidenceRef);
  const { list } = worldEvidence(world);
  return [
    { divider: `EVIDENCE · ${list.length} record${list.length === 1 ? '' : 's'}` },
    { table: evidenceTable(world, contentRows(world, 1) - 2) },
    { text: 'Open one with  E12  ·  every figure in this world cites these.', id: 'evidence-hint' },
  ];
}

function researchBlocks(world) {
  if (!world.research?.result) {
    return [
      { divider: 'RESEARCH' },
      { text: 'No research run for this company yet. Ask a question to start one.', id: 'world-research-empty' },
    ];
  }
  return [
    { divider: 'RESEARCH' },
    { panel: 'verdict', id: 'world-research-verdict', data: verdictPanel(world.research.result, world.research.warnings ?? [], world.research.mode ?? 'research') },
  ];
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function chartLabel(world) {
  return world.exchange && world.symbol ? `${world.exchange}:${world.symbol}` : (world.symbol || world.common_name);
}

function priceSeries(value) {
  const data = value?.data ?? value;
  return Array.isArray(data) ? data : [];
}

/**
 * The handful of numbers worth reading before anything else.
 *
 * Built from the same normalized rows the Financials tab shows, so the
 * overview can never disagree with the table behind it.
 */
export function keyMetricsTable(packet) {
  const rows = normalizeFinancialRows(packet?.financials, packet?.metrics, { limit: 80 });
  // Matched on metric_id, not the display label: the label is presentation and
  // can be reworded, the id is the contract.
  const wanted = [
    'Revenue', 'ebitda', 'ebitda_margin', 'ProfitAfterTax', 'net_margin',
    'BasicEarningsPerShare', 'NetCashFromOperatingActivities', 'FinanceCosts',
  ];
  const picked = [];
  for (const id of wanted) {
    const hit = rows.find(row => row.metric_id === id);
    if (hit) picked.push({ cells: [hit.metric, hit.value, hit.period] });
  }
  return {
    headers: ['Metric', 'Value', 'Period'],
    rows: picked.length ? picked : [{ cells: ['No financial facts retrieved', '—', '—'] }],
  };
}

/** Indian-market shorthand for large counts: 8.7m, 1.2cr. */
function compact(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '—';
  if (n >= 1e7) return `${(n / 1e7).toFixed(2)}cr`;
  if (n >= 1e5) return `${(n / 1e5).toFixed(2)}L`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}k`;
  return String(n);
}

function clamp(value, low, high) { return Math.max(low, Math.min(high, value)); }

function fmtPct(value) {
  const n = Number(value);
  return Number.isFinite(n) ? `${n.toFixed(1)}%` : '—';
}

function fmt(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '—';
  return n.toLocaleString('en-IN', { maximumFractionDigits: 2 });
}

function signed(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '—';
  return `${n >= 0 ? '+' : ''}${n.toFixed(2)}`;
}

// ── Commands ────────────────────────────────────────────────────────────────

/**
 * Parse the world verbs.
 *
 * Returns null for anything that is not one, so the caller falls through to the
 * normal route untouched — a world is a mode the user enters, never a filter
 * every input has to survive.
 *
 * @returns {{kind:'open'|'exit'|'tab', reference?:string, tab?:string, error?:string}|null}
 */
export function parseWorldCommand(input, { inWorld = false } = {}) {
  const text = String(input ?? '').trim();

  const open = text.match(/^\/world(?:\s+([\s\S]+))?$/i);
  if (open) {
    const reference = open[1]?.trim();
    // A bare `/world` opens search rather than printing usage: the whole point
    // of the mode is that you do not have to know the exact name first.
    return reference ? { kind: 'open', reference } : { kind: 'search' };
  }

  // Sent by the search overlay as the user types, and when they choose.
  const typed = text.match(/^\/wsearch\s*([\s\S]*)$/i);
  if (typed) return { kind: 'searching', query: typed[1].trim() };
  const picked = text.match(/^\/wpick\s+(\d+|cancel)$/i);
  if (picked) return picked[1].toLowerCase() === 'cancel'
    ? { kind: 'searchCancel' }
    : { kind: 'searchPick', index: Number(picked[1]) - 1 };

  if (/^\/(exit|close)$/i.test(text)) return { kind: 'exit' };

  // Tab verbs only mean a tab while a world is open. Outside one, `/research`
  // is not a navigation command and must not be swallowed here.
  if (!inWorld) return null;

  // `E12`, `/e 12` — open a source. Checked before tab words so a reference is
  // never read as something else.
  const evidence = parseEvidenceRef(text);
  if (evidence) return { kind: 'evidence', ref: evidence };

  // Arrow keys arrive as these, from a world where the command line is empty.
  const step = text.match(/^\/tab\s+(next|prev)$/i);
  if (step) return { kind: 'step', delta: step[1].toLowerCase() === 'next' ? 1 : -1 };

  // `/chart revenue 5y yoy` points the chart somewhere; a bare `/chart` is
  // just the tab.
  const chart = text.match(/^\/chart\s+([\s\S]+)$/i);
  if (chart) return { kind: 'chart', args: chart[1].trim() };

  const slash = text.match(/^\/([a-z]+)$/i);
  if (slash) {
    const tab = resolveTab(slash[1]);
    if (tab) return { kind: 'tab', tab };
  }
  const bare = resolveTab(text);
  if (bare && /^[a-z]+$/i.test(text)) return { kind: 'tab', tab: bare };
  return null;
}

/** Step to the next or previous tab, wrapping — for ← / → navigation. */
export function stepTab(current, delta) {
  const index = TAB_IDS.indexOf(resolveTab(current) ?? 'overview');
  return TAB_IDS[(index + delta + TAB_IDS.length) % TAB_IDS.length];
}

/**
 * What the next question is about.
 *
 * `ticker` becomes the command-line prefix — `INFY ›` — because the prompt
 * itself saying which company you are inside is the whole mental model of a
 * world. `detail` rides on the rule above it for the basis and the open tab.
 */
export function worldScope(world) {
  if (!world) return null;
  return {
    ticker: world.symbol || world.common_name || null,
    detail: [
      world.symbol ? `${world.exchange ?? 'NSE'}:${world.symbol}` : world.common_name,
      String(world.basis || '').toUpperCase() || null,
      world.tab ? world.tab.toUpperCase() : null,
    ].filter(Boolean).join(' · '),
  };
}
