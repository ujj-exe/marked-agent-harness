/**
 * FlowSankey — horizontal cash flow visualization.
 *
 * Renders a proportional flow diagram:
 *   Revenue ──────────────┬──► Operating Costs ───┐
 *   $500M                 │                       │
 *                         └──► Net Profit ─────────┘
 *
 * Uses box drawing characters for flow connections.
 * Pure function: (opts) → ANSI string (multi-line)
 */
import { c, pc, BOLD, RESET, padRight, padLeft, visLen, strip } from '../ansi.js';
import { palette } from '../themes.js';
import { fmtCap } from '../formatters.js';

// Box drawing chars used for flow lines
const H = '─';
const V = '│';
const TL = '╭';
const TR = '╮';
const BL = '╰';
const BR = '╯';
const TEE_R = '├';  // tee pointing right (split)
const ARR = '►';    // flow arrow

/**
 * Format a flow value as a compact string.
 */
function fmtFlowVal(v) {
  if (v == null) return '—';
  v = Number(v);
  if (Math.abs(v) >= 1e9) return `$${(v / 1e9).toFixed(1)}B`;
  if (Math.abs(v) >= 1e6) return `$${(v / 1e6).toFixed(1)}M`;
  if (Math.abs(v) >= 1e3) return `$${(v / 1e3).toFixed(1)}K`;
  return `$${v.toLocaleString('en-US')}`;
}

/**
 * Determine color role based on node index and value.
 * First node = source (accent), positive = positive, negative/costs = warning.
 */
function nodeColor(idx, value, total) {
  if (idx === 0) return palette('accent');
  const v = Number(value);
  if (v < 0) return palette('negative');
  // If value is significantly smaller than source it's likely a cost
  if (total && v < total * 0.5) return palette('warning');
  return palette('positive');
}

/**
 * Render the flow Sankey diagram.
 *
 * @param {Object} opts
 * @param {Array<{label: string, value: number}>} opts.nodes - Flow nodes
 * @param {Array<{from: number, to: number, value?: number}>} [opts.flows] - Connections between nodes (by index)
 * @param {number} [opts.width=80] - Total render width
 * @returns {string} Multi-line ANSI string
 */
export function flowSankey(opts) {
  const {
    nodes = [],
    flows = [],
    width = 80,
  } = opts;

  if (!nodes.length) {
    return pc('muted', 'No flow data.');
  }

  // Single node — just render the node block
  if (nodes.length === 1) {
    const n = nodes[0];
    const color = palette('accent');
    const label = c(color, BOLD + String(n.label));
    const val = c(color, fmtFlowVal(n.value));
    return label + '  ' + val;
  }

  const lines = [];
  const sourceNode = nodes[0];
  const sourceVal = Number(sourceNode.value) || 1;
  const targetNodes = nodes.slice(1);

  // Calculate proportional bar widths
  // Total width available for bars = width - labels space
  const maxLabelLen = Math.max(...nodes.map(n => String(n.label).length));
  const maxValLen = Math.max(...nodes.map(n => fmtFlowVal(n.value).length));
  const barAreaWidth = Math.max(10, width - maxLabelLen - maxValLen - 8);

  // Source bar width (full)
  const sourceBarW = barAreaWidth;
  const sourceColor = palette('accent');

  // Header: source node
  const sourceLabel = padRight(c(sourceColor, BOLD + String(sourceNode.label)), maxLabelLen + 3);
  const sourceBar = c(sourceColor, H.repeat(sourceBarW));
  const sourceValStr = c(sourceColor, fmtFlowVal(sourceNode.value));
  lines.push(sourceLabel + sourceBar + '  ' + sourceValStr);

  // For each target: draw a flow line with proportional bar
  targetNodes.forEach((node, i) => {
    const isLast = i === targetNodes.length - 1;
    const tColor = nodeColor(i + 1, node.value, sourceVal);

    // Proportional bar width based on value relative to source
    const ratio = Math.abs(Number(node.value)) / Math.abs(sourceVal);
    const targetBarW = Math.max(2, Math.round(barAreaWidth * Math.min(ratio, 1)));

    const nodeLabel = padRight(c(tColor, String(node.label)), maxLabelLen + 3);
    const connector = c(sourceColor, isLast ? BL : TEE_R) + c(tColor, H.repeat(3) + ARR + ' ');
    const bar = c(tColor, H.repeat(Math.max(0, targetBarW - 2)));
    const nodeValStr = c(tColor, fmtFlowVal(node.value));

    // Indent non-source rows to align with where the tee comes from
    const indent = ' '.repeat(maxLabelLen + 3);
    lines.push(indent + connector + nodeLabel + bar + '  ' + nodeValStr);

    // Add vertical connector line between targets (except after last)
    if (!isLast) {
      const vLine = c(sourceColor, V);
      lines.push(' '.repeat(maxLabelLen + 3) + vLine);
    }
  });

  return lines.join('\n');
}
