import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { newsStream } from './NewsStream.js';
import { setTheme } from '../themes.js';
import { strip } from '../ansi.js';

// Pin the clock so relative time strings ("113w", etc.) are deterministic.
const NOW = new Date('2024-01-15T12:00:00Z');

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  setTheme('terminal-cyan');
});

afterEach(() => {
  vi.useRealTimers();
});

const ITEMS = [
  {
    headline: 'Fed signals rate cuts as inflation cools to 3.2% target range',
    source: 'Bloomberg',
    time: new Date('2024-01-15T10:00:00Z'),
  },
  {
    headline: 'NVIDIA surges on blowout Q4 earnings, data center revenue up 409%',
    source: 'Reuters',
    time: new Date('2024-01-15T08:30:00Z'),
  },
  {
    headline: 'Apple Vision Pro launches Feb 2 with mixed analyst reception',
    source: 'WSJ',
    time: new Date('2024-01-14T15:00:00Z'),
  },
  {
    headline: 'Bitcoin crosses $50K for first time since 2021 bull run peak',
    source: 'CoinDesk',
    time: new Date('2024-01-14T09:00:00Z'),
  },
];

describe('newsStream', () => {
  it('renders a basic news feed', () => {
    const result = newsStream({ items: ITEMS, width: 80 });
    expect(result).toMatchSnapshot();
  });

  it('contains bullet points', () => {
    const result = strip(newsStream({ items: ITEMS, width: 80 }));
    const bullets = result.match(/·/g);
    expect(bullets).toHaveLength(ITEMS.length);
  });

  it('contains headlines', () => {
    const result = strip(newsStream({ items: ITEMS, width: 80 }));
    expect(result).toContain('Fed signals rate cuts');
    expect(result).toContain('NVIDIA surges');
  });

  it('contains source names', () => {
    const result = strip(newsStream({ items: ITEMS, width: 80 }));
    expect(result).toContain('Bloomberg');
    expect(result).toContain('Reuters');
  });

  it('respects limit', () => {
    const result = strip(newsStream({ items: ITEMS, width: 80, limit: 2 }));
    const bullets = result.match(/·/g);
    expect(bullets).toHaveLength(2);
  });

  it('truncates long headlines', () => {
    const longItem = {
      headline: 'A very long headline that should be truncated because it exceeds the available width for rendering in a terminal window display',
      source: 'Test',
      time: new Date('2024-01-15T10:00:00Z'),
    };
    const result = strip(newsStream({ items: [longItem], width: 60 }));
    // Should contain ellipsis character
    expect(result).toContain('…');
  });

  it('handles items without source', () => {
    const item = { headline: 'No source article', time: new Date('2024-01-15T10:00:00Z') };
    const result = newsStream({ items: [item], width: 80 });
    expect(result).toMatchSnapshot();
    expect(strip(result)).toContain('No source article');
  });

  it('handles items without time', () => {
    const item = { headline: 'No time article', source: 'Test' };
    const result = newsStream({ items: [item], width: 80 });
    expect(result).toMatchSnapshot();
    expect(strip(result)).toContain('No time article');
  });

  it('handles empty items array', () => {
    const result = strip(newsStream({ items: [], width: 80 }));
    expect(result).toBe('No news items.');
  });

  it('handles single item', () => {
    const result = newsStream({ items: [ITEMS[0]], width: 80 });
    expect(result).toMatchSnapshot();
    const stripped = strip(result);
    expect(stripped).toContain('Fed signals rate cuts');
    expect(stripped).toContain('Bloomberg');
  });

  it('renders with narrow width', () => {
    const result = newsStream({ items: ITEMS, width: 50, limit: 3 });
    expect(result).toMatchSnapshot();
  });

  it('renders with wide width', () => {
    const result = newsStream({ items: ITEMS, width: 120, limit: 3 });
    expect(result).toMatchSnapshot();
  });

  it('defaults limit to 10', () => {
    const manyItems = Array.from({ length: 15 }, (_, i) => ({
      headline: `Story number ${i + 1}`,
      source: 'Test',
    }));
    const result = strip(newsStream({ items: manyItems, width: 80 }));
    const bullets = result.match(/·/g);
    expect(bullets).toHaveLength(10);
  });

  // Theme variants
  it('renders in bloomberg theme', () => {
    setTheme('bloomberg');
    const result = newsStream({ items: ITEMS.slice(0, 2), width: 80 });
    expect(result).toMatchSnapshot();
  });

  it('renders in dracula theme', () => {
    setTheme('dracula');
    const result = newsStream({ items: ITEMS.slice(0, 2), width: 80 });
    expect(result).toMatchSnapshot();
  });

  it('renders in monochrome theme', () => {
    setTheme('monochrome');
    const result = newsStream({ items: ITEMS.slice(0, 2), width: 80 });
    expect(result).toMatchSnapshot();
  });
});
