/**
 * compare.js — several companies, one table, the same arithmetic.
 *
 * A comparison is only worth anything if every column was computed the same
 * way. These rows come from the metric library, so ROCE for one company means
 * exactly what it means for the next, and a figure missing for one name shows
 * as a gap rather than quietly dropping the row.
 */

import { computeMetrics, getMetric } from '../data/metrics.js';
import { formatValue } from './chart.js';

/** The rows a comparison answers, in the order an analyst reads them. */
export const COMPARE_METRICS = [
  'revenue_growth', 'pat_growth', 'pat_margin', 'roe', 'roce',
  'debt_to_equity', 'net_debt', 'ocf_to_pat', 'receivable_days', 'inventory_days',
];

/**
 * Parse `/compare INFY TCS HCLTECH` — also tolerating `and`, `vs` and commas,
 * which is how people actually write it.
 */
export function parseCompare(input) {
  const match = String(input ?? '').trim().match(/^\/compare\s+([\s\S]+)$/i);
  if (!match) return null;
  const references = match[1]
    .split(/\s*(?:,|\bvs\.?\b|\bversus\b|\band\b|\s)\s*/i)
    .map(part => part.trim())
    .filter(Boolean);
  if (references.length < 2) return { error: 'Usage: /compare <company> <company> · 2 to 5 names' };
  if (references.length > 5) return { error: 'A comparison holds at most 5 companies' };
  return { references };
}

/**
 * One column per company, built from each one's own packet.
 *
 * @param {Array<{world: object}>} members
 */
export function comparisonTable(members, metrics = COMPARE_METRICS) {
  const columns = members.map(member => ({
    label: member.world.symbol || member.world.common_name,
    rows: cache(member.world),
  }));

  const rows = [];
  for (const id of metrics) {
    const definition = getMetric(id);
    if (!definition) continue;
    const cells = [definition.name];
    let any = false;
    for (const column of columns) {
      const latest = column.rows
        .filter(row => row.metric_id === id && row.status === 'ok')
        .sort((a, b) => b.period.localeCompare(a.period))[0];
      if (latest) { any = true; cells.push(`${formatValue(latest.value, latest.unit)}  ${latest.period}`); }
      else cells.push('—');
    }
    if (any) rows.push({ cells });
  }
  return {
    headers: ['Metric', ...columns.map(column => column.label)],
    rows: rows.length ? rows : [{ cells: ['Nothing computable for these companies', ...columns.map(() => '—')] }],
  };
}

/**
 * Which name leads on each measure.
 *
 * Direction matters: more revenue growth is better, more receivable days is
 * not, and a comparison that ranked both the same way would be worse than no
 * ranking at all.
 */
const LOWER_IS_BETTER = new Set(['debt_to_equity', 'net_debt', 'receivable_days', 'inventory_days']);

export function leadersTable(members, metrics = COMPARE_METRICS) {
  const rows = [];
  for (const id of metrics) {
    const definition = getMetric(id);
    if (!definition) continue;
    const contenders = members
      .map(member => {
        const latest = cache(member.world)
          .filter(row => row.metric_id === id && row.status === 'ok')
          .sort((a, b) => b.period.localeCompare(a.period))[0];
        return latest ? { label: member.world.symbol || member.world.common_name, value: latest.value, period: latest.period } : null;
      })
      .filter(Boolean);
    if (contenders.length < 2) continue;
    const sorted = [...contenders].sort((a, b) => (LOWER_IS_BETTER.has(id) ? a.value - b.value : b.value - a.value));
    const best = sorted[0];
    // Periods can differ between companies; saying which was compared keeps the
    // claim honest rather than implying a like-for-like year.
    const periods = [...new Set(contenders.map(c => c.period))];
    rows.push({ cells: [definition.name, best.label, formatValue(best.value, definition.unit), periods.join(' / ')] });
  }
  return { headers: ['Metric', 'Leads', 'Value', 'Period'], rows };
}

/** Metrics are computed once per company and kept on its world. */
function cache(world) {
  if (!world._metrics) {
    world._metrics = computeMetrics(world.packet ?? {}, {
      company_id: world.company_id, security_id: world.security_id, basis: world.basis, asOf: world.as_of,
    });
  }
  return world._metrics;
}

/** Blocks for the comparison workspace. */
export function compareBlocks(members) {
  const names = members.map(member => member.world.symbol || member.world.common_name);
  return [
    { text: names.join('  ×  '), id: 'compare-title' },
    { divider: 'SIDE BY SIDE' },
    { table: comparisonTable(members), id: 'compare-table' },
    { divider: 'WHO LEADS' },
    { table: leadersTable(members), id: 'compare-leaders' },
  ];
}
