import { describe, it, expect, beforeEach } from 'vitest';
import { flowSankey } from './FlowSankey.js';
import { setTheme } from '../themes.js';
import { strip } from '../ansi.js';

beforeEach(() => setTheme('terminal-cyan'));

const INCOME_FLOW = {
  nodes: [
    { label: 'Revenue', value: 500_000_000 },
    { label: 'Op Costs', value: 300_000_000 },
    { label: 'Net Profit', value: 200_000_000 },
  ],
  flows: [
    { from: 0, to: 1, value: 300_000_000 },
    { from: 0, to: 2, value: 200_000_000 },
  ],
  width: 80,
};

const SIMPLE_FLOW = {
  nodes: [
    { label: 'Revenue', value: 1_000_000_000 },
    { label: 'COGS', value: 400_000_000 },
    { label: 'Gross Profit', value: 600_000_000 },
    { label: 'OpEx', value: 200_000_000 },
    { label: 'Net Income', value: 400_000_000 },
  ],
  flows: [
    { from: 0, to: 1 },
    { from: 0, to: 2 },
    { from: 2, to: 3 },
    { from: 2, to: 4 },
  ],
  width: 80,
};

describe('flowSankey', () => {
  it('renders income statement flow', () => {
    const result = flowSankey(INCOME_FLOW);
    expect(result).toMatchSnapshot();
  });

  it('contains node labels', () => {
    const result = strip(flowSankey(INCOME_FLOW));
    expect(result).toContain('Revenue');
    expect(result).toContain('Op Costs');
    expect(result).toContain('Net Profit');
  });

  it('contains formatted values', () => {
    const result = strip(flowSankey(INCOME_FLOW));
    expect(result).toContain('$500.0M');
    expect(result).toContain('$300.0M');
    expect(result).toContain('$200.0M');
  });

  it('contains flow connector characters', () => {
    const result = strip(flowSankey(INCOME_FLOW));
    // Should have horizontal flow lines
    expect(result).toContain('─');
    // Should have flow arrow
    expect(result).toContain('►');
  });

  it('contains vertical connector between targets', () => {
    const result = strip(flowSankey(INCOME_FLOW));
    // Should have vertical line connecting the branches
    expect(result).toContain('│');
  });

  it('renders multi-level flow', () => {
    const result = flowSankey(SIMPLE_FLOW);
    expect(result).toMatchSnapshot();
    const stripped = strip(result);
    expect(stripped).toContain('Revenue');
    expect(stripped).toContain('Net Income');
  });

  it('renders single node', () => {
    const result = flowSankey({
      nodes: [{ label: 'Revenue', value: 500_000_000 }],
      width: 80,
    });
    expect(result).toMatchSnapshot();
    expect(strip(result)).toContain('Revenue');
    expect(strip(result)).toContain('$500.0M');
  });

  it('handles empty nodes', () => {
    const result = strip(flowSankey({ nodes: [], width: 80 }));
    expect(result).toBe('No flow data.');
  });

  it('renders with two nodes', () => {
    const result = flowSankey({
      nodes: [
        { label: 'Input', value: 1_000_000 },
        { label: 'Output', value: 800_000 },
      ],
      flows: [{ from: 0, to: 1 }],
      width: 80,
    });
    expect(result).toMatchSnapshot();
    const stripped = strip(result);
    expect(stripped).toContain('Input');
    expect(stripped).toContain('Output');
  });

  it('renders billion-scale values', () => {
    const result = flowSankey({
      nodes: [
        { label: 'Revenue', value: 2_300_000_000 },
        { label: 'Costs', value: 1_500_000_000 },
        { label: 'Profit', value: 800_000_000 },
      ],
      flows: [{ from: 0, to: 1 }, { from: 0, to: 2 }],
      width: 80,
    });
    expect(result).toMatchSnapshot();
    expect(strip(result)).toContain('$2.3B');
  });

  it('handles small K-scale values', () => {
    const result = flowSankey({
      nodes: [
        { label: 'Sales', value: 500_000 },
        { label: 'Expenses', value: 300_000 },
        { label: 'Profit', value: 200_000 },
      ],
      flows: [{ from: 0, to: 1 }, { from: 0, to: 2 }],
      width: 80,
    });
    expect(result).toMatchSnapshot();
    expect(strip(result)).toContain('$500.0K');
  });

  it('renders with narrow width', () => {
    const result = flowSankey({ ...INCOME_FLOW, width: 50 });
    expect(result).toMatchSnapshot();
  });

  it('renders with wide width', () => {
    const result = flowSankey({ ...INCOME_FLOW, width: 120 });
    expect(result).toMatchSnapshot();
  });

  it('renders negative values (costs)', () => {
    const result = flowSankey({
      nodes: [
        { label: 'Revenue', value: 1_000_000 },
        { label: 'Net Loss', value: -200_000 },
      ],
      flows: [{ from: 0, to: 1 }],
      width: 80,
    });
    expect(result).toMatchSnapshot();
    const stripped = strip(result);
    expect(stripped).toContain('Revenue');
  });

  // Theme variants
  it('renders in bloomberg theme', () => {
    setTheme('bloomberg');
    const result = flowSankey(INCOME_FLOW);
    expect(result).toMatchSnapshot();
  });

  it('renders in dracula theme', () => {
    setTheme('dracula');
    const result = flowSankey(INCOME_FLOW);
    expect(result).toMatchSnapshot();
  });

  it('renders in monochrome theme', () => {
    setTheme('monochrome');
    const result = flowSankey(INCOME_FLOW);
    expect(result).toMatchSnapshot();
  });
});
