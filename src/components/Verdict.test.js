import { describe, it, expect, beforeEach } from 'vitest';
import { verdict } from './Verdict.js';
import { setTheme } from '../themes.js';
import { strip } from '../ansi.js';

beforeEach(() => setTheme('terminal-cyan'));

const FULL_OPTS = {
  thesis: 'NVIDIA remains the dominant AI infrastructure play with unmatched GPU supply chain leverage and software moat via CUDA.',
  signal: 'BUY',
  levels: {
    support: '$145.00',
    resistance: '$200.00',
  },
  risks: [
    'Export controls limiting China revenue',
    'AMD gaining datacenter GPU market share',
    'Valuation premium at 35x forward earnings',
  ],
  width: 60,
};

describe('verdict', () => {
  it('renders full verdict panel', () => {
    const result = verdict(FULL_OPTS);
    expect(result).toMatchSnapshot();
  });

  it('contains VERDICT header', () => {
    const result = strip(verdict(FULL_OPTS));
    expect(result).toContain('VERDICT');
  });

  it('contains thesis text', () => {
    const result = strip(verdict(FULL_OPTS));
    expect(result).toContain('NVIDIA remains the dominant');
  });

  it('contains signal', () => {
    const result = strip(verdict(FULL_OPTS));
    expect(result).toContain('BUY');
    expect(result).toContain('SIGNAL');
  });

  it('contains key levels', () => {
    const result = strip(verdict(FULL_OPTS));
    expect(result).toContain('KEY LEVELS');
    expect(result).toContain('$145.00');
    expect(result).toContain('$200.00');
    expect(result).toContain('Support');
    expect(result).toContain('Resistance');
  });

  it('contains risk factors', () => {
    const result = strip(verdict(FULL_OPTS));
    expect(result).toContain('RISK FACTORS');
    expect(result).toContain('Export controls limiting China revenue');
    expect(result).toContain('AMD gaining datacenter GPU market share');
  });

  it('contains risk warning symbol', () => {
    const result = strip(verdict(FULL_OPTS));
    expect(result).toContain('⚠');
  });

  it('renders with only thesis', () => {
    const result = verdict({ thesis: 'Simple thesis.', width: 60 });
    expect(result).toMatchSnapshot();
    expect(strip(result)).toContain('Simple thesis.');
  });

  it('renders with SELL signal', () => {
    const result = verdict({ ...FULL_OPTS, signal: 'SELL' });
    expect(result).toMatchSnapshot();
    expect(strip(result)).toContain('SELL');
  });

  it('renders with HOLD signal', () => {
    const result = verdict({ ...FULL_OPTS, signal: 'HOLD' });
    expect(result).toMatchSnapshot();
    expect(strip(result)).toContain('HOLD');
  });

  it('renders with NEUTRAL signal', () => {
    const result = verdict({ ...FULL_OPTS, signal: 'NEUTRAL' });
    expect(result).toMatchSnapshot();
    expect(strip(result)).toContain('NEUTRAL');
  });

  it('renders with no risks', () => {
    const opts = { ...FULL_OPTS, risks: [] };
    const result = verdict(opts);
    expect(result).toMatchSnapshot();
    expect(strip(result)).not.toContain('RISK FACTORS');
  });

  it('renders with no levels', () => {
    const opts = { ...FULL_OPTS, levels: {} };
    const result = verdict(opts);
    expect(result).toMatchSnapshot();
    expect(strip(result)).not.toContain('KEY LEVELS');
  });

  it('renders with only resistance level', () => {
    const result = verdict({ ...FULL_OPTS, levels: { resistance: '$200.00' } });
    const stripped = strip(result);
    expect(stripped).toContain('Resistance');
    expect(stripped).not.toContain('Support');
  });

  it('renders with only support level', () => {
    const result = verdict({ ...FULL_OPTS, levels: { support: '$145.00' } });
    const stripped = strip(result);
    expect(stripped).toContain('Support');
    expect(stripped).not.toContain('Resistance');
  });

  it('wraps long thesis text', () => {
    const longThesis = 'This is a very long thesis statement that should be word-wrapped across multiple lines within the panel borders to ensure clean rendering.';
    const result = verdict({ thesis: longThesis, width: 60 });
    const lines = result.split('\n');
    // Should be more than 3 lines (top border + at least 2 thesis lines + bottom border)
    expect(lines.length).toBeGreaterThan(3);
  });

  it('renders with wide width', () => {
    const result = verdict({ ...FULL_OPTS, width: 100 });
    expect(result).toMatchSnapshot();
  });

  it('renders with minimal opts', () => {
    const result = verdict({ width: 60 });
    expect(result).toMatchSnapshot();
  });

  it('has matching box borders', () => {
    const result = strip(verdict(FULL_OPTS));
    const lines = result.split('\n');
    // First line should start with top-left corner
    expect(lines[0]).toContain('╭');
    // Last line should start with bottom-left corner
    expect(lines[lines.length - 1]).toContain('╰');
  });

  // Theme variants
  it('renders in bloomberg theme', () => {
    setTheme('bloomberg');
    const result = verdict(FULL_OPTS);
    expect(result).toMatchSnapshot();
  });

  it('renders in dracula theme', () => {
    setTheme('dracula');
    const result = verdict(FULL_OPTS);
    expect(result).toMatchSnapshot();
  });

  it('renders in solarized-dark theme', () => {
    setTheme('solarized-dark');
    const result = verdict(FULL_OPTS);
    expect(result).toMatchSnapshot();
  });
});
