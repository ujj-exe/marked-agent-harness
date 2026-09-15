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

describe('bar scale', () => {
  const strip = s => s.replace(/\x1b\[[0-9;]*m/g, '');
  const filled = line => (strip(line).match(/█/g) || []).length;
  const track = line => (strip(line).match(/[█░]/g) || []).length;

  // Bars used to scale to the largest holder, so a promoter holding 50.5%
  // filled the whole track and read as owning all of it.
  it('measures a percentage against 100, not against the biggest holder', () => {
    const out = holderBar({ holders: [{ name: 'Promoter', percent: 50 }, { name: 'Public', percent: 10 }], width: 90 });
    const [promoter] = out.split('\n').filter(l => strip(l).startsWith('Promoter'));
    expect(filled(promoter) / track(promoter)).toBeGreaterThan(0.45);
    expect(filled(promoter) / track(promoter)).toBeLessThan(0.55);
  });

  it('keeps a small holding visibly small', () => {
    const out = holderBar({ holders: [{ name: 'Pledged', percent: 2 }], width: 90 });
    const [row] = out.split('\n').filter(l => strip(l).startsWith('Pledged'));
    expect(filled(row) / track(row)).toBeLessThan(0.1);
  });

  it('rescales only when the set genuinely exceeds 100', () => {
    const out = holderBar({ holders: [{ name: 'A', percent: 150 }, { name: 'B', percent: 75 }], width: 90 });
    const [a] = out.split('\n').filter(l => strip(l).startsWith('A'));
    expect(filled(a) / track(a)).toBeGreaterThan(0.9);
  });
});
