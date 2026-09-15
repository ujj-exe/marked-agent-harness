/**
 * valuation.js — what the market is paying, and what it is paying for.
 *
 * Market capitalisation comes from the live quote; everything else is built
 * from it and the metric layer, so a multiple here rests on the same PAT and
 * the same equity as the Financials tab.
 *
 * Share count is derived, not reported: PAT ÷ basic EPS. That is exact when
 * both come from the same filing and the same basis, which is the only case it
 * is used in. It is labelled as derived wherever it appears, because a reader
 * should never have to guess which numbers a company published and which
 * Marked worked out.
 */

import { computeMetrics } from '../data/metrics.js';
import { formatValue } from './chart.js';

/** Latest computed value of a metric, or null. */
function latest(rows, id) {
  return rows.filter(row => row.metric_id === id && row.status === 'ok')
    .sort((a, b) => b.period.localeCompare(a.period))[0] ?? null;
}

/**
 * Latest reported fact for a concept, respecting the world's basis.
 *
 * `period` pins it to one year, which is what pairing two facts requires: a
 * share count derived from this year's profit and last year's per-share profit
 * would be quietly wrong.
 */
function fact(world, concept, period = null) {
  const rows = Array.isArray(world.packet?.financial_facts) ? world.packet.financial_facts : [];
  const wanted = String(world.basis ?? 'consolidated').toLowerCase();
  return rows
    .filter(row => row.concept_id === concept
      && String(row.basis ?? '').toLowerCase() === wanted
      && (period == null || row.period === period))
    .sort((a, b) => String(b.period).localeCompare(String(a.period)))[0] ?? null;
}

/**
 * The most recent period for which every named concept is reported.
 *
 * @returns {string|null}
 */
export function latestSharedPeriod(world, concepts) {
  const rows = Array.isArray(world.packet?.financial_facts) ? world.packet.financial_facts : [];
  const wanted = String(world.basis ?? 'consolidated').toLowerCase();
  const sets = concepts.map(concept => new Set(rows
    .filter(row => row.concept_id === concept && String(row.basis ?? '').toLowerCase() === wanted)
    .map(row => row.period)));
  if (!sets.length || sets.some(set => set.size === 0)) return null;
  const shared = [...sets[0]].filter(period => sets.every(set => set.has(period)));
  return shared.sort().at(-1) ?? null;
}

/**
 * Compute the valuation view.
 *
 * @returns {{rows: object[], gaps: string[], shares: number|null, period: string|null}}
 */
export function valuation(world) {
  const quote = world.packet?.quote?.data ?? world.packet?.quote ?? null;
  const price = Number(quote?.price);
  const marketCap = Number(quote?.market_cap);
  const metrics = world._metrics ?? (world._metrics = computeMetrics(world.packet ?? {}, {
    company_id: world.company_id, security_id: world.security_id, basis: world.basis, asOf: world.as_of,
  }));

  // Pair facts on a period they all report. Taking each one's own latest
  // silently mixed years — profit carries an FY2027 row (a quarter filed
  // early) that per-share profit has no counterpart for, so a derived share
  // count would have paired one quarter's profit with a full year's EPS.
  const pairedPeriod = latestSharedPeriod(world, ['ProfitAfterTax', 'BasicEarningsPerShare']);
  const pat = fact(world, 'ProfitAfterTax', pairedPeriod);
  // EBITDA is a reported metric from the API, not one this runtime computes,
  // so it is read from the facts rather than the metric registry.
  const ebitdaRow = fact(world, 'ebitda');
  const netDebt = latest(metrics, 'net_debt');
  const period = pat?.period ?? null;

  const eps = fact(world, 'BasicEarningsPerShare', pairedPeriod);
  const equity = fact(world, 'TotalEquity', pairedPeriod) ?? fact(world, 'TotalEquity');

  // Shares outstanding from market capitalisation ÷ price — both from the same
  // quote, so the division is exact.
  //
  // PAT ÷ EPS looks like the obvious derivation and is wrong wherever a group
  // has minority interests: EPS is struck on profit attributable to owners
  // while PAT includes the rest. For Reliance that route gives 1,604 crore
  // shares against an actual ~1,353 crore.
  const shares = Number.isFinite(marketCap) && Number.isFinite(price) && price > 0
    ? marketCap / price
    : null;

  const rows = [];
  const gaps = [];
  const add = (name, value, unit, note) => {
    if (value == null || !Number.isFinite(value)) { gaps.push(name); return; }
    rows.push({ cells: [name, formatValue(value, unit), note ?? ''] });
  };

  add('Market capitalisation', Number.isFinite(marketCap) ? marketCap : null, 'INR', 'live quote');
  add('Price', Number.isFinite(price) ? price : null, 'INR', quote?.as_of ? 'live quote' : '');
  add('Shares outstanding', shares, 'count', 'derived · market cap ÷ price');

  // Earnings multiple from the per-share figures the company actually reports.
  add('P / E', Number.isFinite(price) && eps && Number(eps.value) > 0 ? price / Number(eps.value) : null, 'x',
    eps ? `price ÷ EPS ${eps.period}` : '');
  add('EPS (basic)', eps ? Number(eps.value) : null, 'INR', eps ? `reported ${eps.period}` : '');

  const ev = Number.isFinite(marketCap) && netDebt ? marketCap + Number(netDebt.value) : null;
  add('Enterprise value', ev, 'INR', netDebt ? `market cap + net debt ${netDebt.period}` : '');
  add('EV / EBITDA', ev != null && ebitdaRow && Number(ebitdaRow.value) > 0 ? ev / Number(ebitdaRow.value) : null, 'x',
    ebitdaRow ? `EBITDA ${ebitdaRow.period}` : '');

  const book = equity && shares ? Number(equity.value) / shares : null;
  add('Book value per share', book, 'INR', equity ? `equity ${equity.period} ÷ derived shares` : '');
  add('P / B', Number.isFinite(price) && book > 0 ? price / book : null, 'x', '');

  return { rows, gaps, shares, period };
}

export function valuationBlocks(world) {
  const { rows, gaps } = valuation(world);
  const blocks = [
    { divider: `VALUATION · ${String(world.basis || 'consolidated').toUpperCase()}` },
    { table: { headers: ['Measure', 'Value', 'Basis of the figure'], rows: rows.length ? rows : [{ cells: ['Nothing computable', '—', ''] }] } },
  ];
  if (gaps.length) {
    // EBITDA is derived and P/E needs a positive EPS; saying which input was
    // missing beats an empty row the reader has to account for.
    blocks.push({ text: `not computable: ${gaps.join(', ')} — the inputs are not in the retrieved data`, id: 'valuation-gaps' });
  }
  return blocks;
}

// ── Risk ────────────────────────────────────────────────────────────────────

/**
 * Deterministic risk flags.
 *
 * Every line is a threshold applied to a computed metric, so the reasoning
 * provider is never asked whether leverage is high — only, later, to explain
 * why it got that way. A flag with no data says so rather than passing as calm.
 */
const RISK_RULES = [
  { id: 'debt_to_equity', name: 'Leverage', warn: 1, alarm: 2, worse: 'high',
    say: v => `debt is ${v.toFixed(2)}× equity` },
  { id: 'ocf_to_pat', name: 'Cash conversion', warn: 0.8, alarm: 0.5, worse: 'low',
    say: v => `operating cash flow is ${v.toFixed(2)}× profit` },
  { id: 'receivable_days', name: 'Receivables', warn: 90, alarm: 150, worse: 'high',
    say: v => `${Math.round(v)} days of sales outstanding` },
  { id: 'inventory_days', name: 'Inventory', warn: 120, alarm: 200, worse: 'high',
    say: v => `${Math.round(v)} days of inventory` },
  { id: 'pat_margin', name: 'Profitability', warn: 5, alarm: 0, worse: 'low',
    say: v => `net margin ${v.toFixed(2)}%` },
];

export function riskFlags(world) {
  const metrics = world._metrics ?? (world._metrics = computeMetrics(world.packet ?? {}, {
    company_id: world.company_id, security_id: world.security_id, basis: world.basis, asOf: world.as_of,
  }));

  const flags = RISK_RULES.map(rule => {
    const row = latest(metrics, rule.id);
    if (!row) return { name: rule.name, level: 'unknown', detail: 'not computable from the retrieved data', period: '—' };
    const value = Number(row.value);
    const bad = rule.worse === 'high' ? value >= rule.alarm : value <= rule.alarm;
    const watch = rule.worse === 'high' ? value >= rule.warn : value <= rule.warn;
    return {
      name: rule.name,
      level: bad ? 'alarm' : watch ? 'watch' : 'ok',
      detail: rule.say(value),
      period: row.period,
    };
  });

  // Promoter pledge has no US equivalent and is the loudest governance signal
  // in an Indian mid-cap, so it is read straight from the shareholding record
  // rather than through a ratio.
  const holding = (world.packet?.shareholding?.data ?? [])[0];
  const pledged = Number(holding?.pledged_pct ?? holding?.promoter_pledged_pct);
  if (Number.isFinite(pledged)) {
    flags.push({
      name: 'Promoter pledge',
      level: pledged >= 25 ? 'alarm' : pledged > 0 ? 'watch' : 'ok',
      detail: `${pledged.toFixed(1)}% of promoter holding pledged`,
      period: holding?.period_end ?? '—',
    });
  }
  return flags;
}

export function riskBlocks(world) {
  const flags = riskFlags(world);
  const mark = { alarm: '▲', watch: '·', ok: '✓', unknown: '?' };
  return [
    { divider: 'RISK' },
    { table: {
      headers: ['', 'Signal', 'Reading', 'Period'],
      rows: flags.map(flag => ({ cells: [mark[flag.level], flag.name, flag.detail, flag.period] })),
    } },
    { text: 'Thresholds are fixed and applied to computed metrics — no model judged these.', id: 'risk-note' },
  ];
}
