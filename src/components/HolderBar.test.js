import { describe, it, expect, beforeEach } from 'vitest';
import { holderBar } from './HolderBar.js';
import { setTheme } from '../themes.js';
import { strip } from '../ansi.js';

const SAMPLE_HOLDERS = [
  { name: 'Vanguard Group',      shares: 150000000, percent: 8.5  },
  { name: 'BlackRock Inc',       shares: 120000000, percent: 6.8  },
  { name: 'State Street',        shares: 80000000,  percent: 4.5  },
  { name: 'Fidelity Mgmt',       shares: 60000000,  percent: 3.4  },
  { name: 'T. Rowe Price',       shares: 40000000,  percent: 2.3  },
  { name: 'Geode Capital',       shares: 30000000,  percent: 1.7  },
];

beforeEach(() => setTheme('terminal-cyan'));

describe('holderBar', () => {
  it('renders a basic holder bar snapshot', () => {
    const result = holderBar({ holders: SAMPLE_HOLDERS, width: 80 });
    expect(result).toMatchSnapshot();
  });

  it('shows holder names', () => {
    const result = holderBar({ holders: SAMPLE_HOLDERS, width: 80 });
    const stripped = strip(result);
    expect(stripped).toContain('Vanguard');
    expect(stripped).toContain('BlackRock');
    expect(stripped).toContain('State Street');
  });

  it('shows percentage values', () => {
    const result = holderBar({ holders: SAMPLE_HOLDERS, width: 80 });
    const stripped = strip(result);
    expect(stripped).toContain('8.5%');
    expect(stripped).toContain('6.8%');
  });

  it('shows bar characters', () => {
    const result = holderBar({ holders: SAMPLE_HOLDERS, width: 80 });
    const stripped = strip(result);
    expect(stripped).toContain('█');
    expect(stripped).toContain('░');
  });

  it('respects the limit option — default 5', () => {
    const result = holderBar({ holders: SAMPLE_HOLDERS, width: 80 });
    const stripped = strip(result);
    // 6th holder (Geode) should be excluded
    expect(stripped).not.toContain('Geode');
    // 5th holder (T. Rowe) should be present
    expect(stripped).toContain('T. Rowe');
  });

  it('respects a custom limit', () => {
    const result = holderBar({ holders: SAMPLE_HOLDERS, width: 80, limit: 3 });
    const stripped = strip(result);
    expect(stripped).toContain('Vanguard');
    expect(stripped).toContain('BlackRock');
    expect(stripped).toContain('State Street');
    expect(stripped).not.toContain('Fidelity');
  });

  it('handles a single holder', () => {
    const result = holderBar({
      holders: [{ name: 'Only Fund', shares: 5000000, percent: 3.0 }],
      width: 80,
    });
    const stripped = strip(result);
    expect(stripped).toContain('Only Fund');
    expect(stripped).toContain('3.0%');
    expect(result).toMatchSnapshot();
  });

  it('handles empty holders list', () => {
    const result = holderBar({ holders: [] });
    expect(strip(result)).toContain('No holder');
  });

  it('handles missing percent', () => {
    const result = holderBar({
      holders: [{ name: 'Unknown Fund', shares: 1000000, percent: null }],
    });
    expect(strip(result)).toContain('Unknown Fund');
  });

  it('renders with narrow width', () => {
    const result = holderBar({ holders: SAMPLE_HOLDERS, width: 60 });
    expect(result).toMatchSnapshot();
  });

  it('renders with wide width', () => {
    const result = holderBar({ holders: SAMPLE_HOLDERS, width: 120 });
    expect(result).toMatchSnapshot();
  });

  it('shows shares formatted compactly', () => {
    const result = holderBar({ holders: SAMPLE_HOLDERS, width: 80 });
    const stripped = strip(result);
    // 150M shares → "150.0M"
    expect(stripped).toContain('M');
  });

  it('renders in dracula theme', () => {
    setTheme('dracula');
    const result = holderBar({ holders: SAMPLE_HOLDERS, width: 80 });
    expect(result).toMatchSnapshot();
  });

  it('renders in bloomberg theme', () => {
    setTheme('bloomberg');
    const result = holderBar({ holders: SAMPLE_HOLDERS, width: 80 });
    expect(result).toMatchSnapshot();
  });

  it('renders in monochrome theme', () => {
    setTheme('monochrome');
    const result = holderBar({ holders: SAMPLE_HOLDERS, width: 80 });
    expect(result).toMatchSnapshot();
  });
});
