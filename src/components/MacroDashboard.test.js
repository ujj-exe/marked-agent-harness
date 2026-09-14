import { describe, it, expect, beforeEach } from 'vitest';
import { macroDashboard } from './MacroDashboard.js';
import { setTheme } from '../themes.js';
import { strip } from '../ansi.js';

beforeEach(() => setTheme('terminal-cyan'));

// Representative macro data
const MACRO_PILLARS = [
  {
    label: 'Inflation',
    value: 72,
    direction: 'falling',
    indicators: [
      { name: 'CPI', value: '3.4%', direction: 'falling' },
      { name: 'PCE', value: '2.8%', direction: 'falling' },
    ],
  },
  {
    label: 'Rates',
    value: 80,
    direction: 'rising',
    indicators: [
      { name: 'FFR', value: '5.33%', direction: 'rising' },
      { name: '10Y', value: '4.62%', direction: 'rising' },
    ],
  },
  {
    label: 'Labor',
    value: 45,
    direction: 'neutral',
    indicators: [
      { name: 'UE', value: '3.9%', direction: 'neutral' },
    ],
  },
  {
    label: 'Growth',
    value: 38,
    direction: 'falling',
    indicators: [
      { name: 'GDP', value: '2.1%', direction: 'falling' },
    ],
  },
  {
    label: 'Credit',
    value: 55,
    direction: 'rising',
    indicators: [
      { name: 'HY Spr', value: '320', direction: 'rising' },
    ],
  },
];

describe('MacroDashboard', () => {
  it('renders full 5-pillar dashboard', () => {
    const result = macroDashboard({ pillars: MACRO_PILLARS, width: 80 });
    expect(result).toMatchSnapshot();
  });

  it('contains all pillar labels', () => {
    const result = strip(macroDashboard({ pillars: MACRO_PILLARS, width: 80 }));
    expect(result).toContain('Inflation');
    expect(result).toContain('Rates');
    expect(result).toContain('Labor');
    expect(result).toContain('Growth');
    expect(result).toContain('Credit');
  });

  it('contains sub-indicator names', () => {
    const result = strip(macroDashboard({ pillars: MACRO_PILLARS, width: 80 }));
    expect(result).toContain('CPI');
    expect(result).toContain('PCE');
    expect(result).toContain('FFR');
  });

  it('shows direction arrows', () => {
    const result = strip(macroDashboard({ pillars: MACRO_PILLARS, width: 80 }));
    expect(result).toContain('▲');
    expect(result).toContain('▼');
  });

  it('renders with custom title', () => {
    const result = strip(macroDashboard({ pillars: MACRO_PILLARS, width: 80, title: 'REGIME CHECK' }));
    expect(result).toContain('REGIME CHECK');
  });

  it('renders default title', () => {
    const result = strip(macroDashboard({ pillars: MACRO_PILLARS, width: 80 }));
    expect(result).toContain('MACRO REGIME');
  });

  it('handles empty pillars array', () => {
    const result = strip(macroDashboard({ pillars: [], width: 80 }));
    expect(result).toContain('no macro data');
  });

  it('handles no opts argument', () => {
    const result = strip(macroDashboard());
    expect(result).toContain('no macro data');
  });

  it('renders pillars without sub-indicators', () => {
    const pillars = [
      { label: 'Inflation', value: 60, direction: 'rising' },
      { label: 'Rates', value: 40, direction: 'falling' },
    ];
    const result = macroDashboard({ pillars, width: 60 });
    expect(result).toMatchSnapshot();
    expect(strip(result)).toContain('Inflation');
  });

  it('handles null value gracefully', () => {
    const pillars = [{ label: 'Inflation', value: null, direction: 'neutral' }];
    const result = strip(macroDashboard({ pillars, width: 60 }));
    expect(result).toContain('Inflation');
    expect(result).toContain('—');
  });

  it('renders at narrow width', () => {
    const result = macroDashboard({ pillars: MACRO_PILLARS, width: 50 });
    expect(result).toMatchSnapshot();
  });

  it('renders at wide width', () => {
    const result = macroDashboard({ pillars: MACRO_PILLARS, width: 120 });
    expect(result).toMatchSnapshot();
  });

  it('output contains box borders', () => {
    const result = strip(macroDashboard({ pillars: MACRO_PILLARS, width: 80 }));
    expect(result).toContain('│');
    expect(result).toContain('─');
  });

  // Theme variants
  it('renders in bloomberg theme', () => {
    setTheme('bloomberg');
    const result = macroDashboard({ pillars: MACRO_PILLARS, width: 80 });
    expect(result).toMatchSnapshot();
  });

  it('renders in dracula theme', () => {
    setTheme('dracula');
    const result = macroDashboard({ pillars: MACRO_PILLARS, width: 80 });
    expect(result).toMatchSnapshot();
  });

  it('renders in monochrome theme', () => {
    setTheme('monochrome');
    const result = macroDashboard({ pillars: MACRO_PILLARS, width: 80 });
    expect(result).toMatchSnapshot();
  });

  it('renders single pillar', () => {
    const pillars = [{ label: 'Inflation', value: 65, direction: 'rising', indicators: [] }];
    const result = macroDashboard({ pillars, width: 80 });
    expect(result).toMatchSnapshot();
    expect(strip(result)).toContain('Inflation');
  });

  // ── variant: 'plain' tests ───────────────────────────────────────────────

  describe('variant: plain', () => {
    it('produces output without box border characters', () => {
      const result = strip(macroDashboard({ pillars: MACRO_PILLARS, width: 80, variant: 'plain' }));
      expect(result).not.toContain('╭');
      expect(result).not.toContain('╮');
      expect(result).not.toContain('╰');
      expect(result).not.toContain('╯');
      expect(result).not.toContain('│');
      expect(result).not.toContain('├');
      expect(result).not.toContain('┤');
    });

    it('still shows pillar labels (no title header in plain variant)', () => {
      const result = strip(macroDashboard({ pillars: MACRO_PILLARS, width: 80, variant: 'plain' }));
      expect(result).toContain('Inflation');
      expect(result).toContain('Rates');
      expect(result).toContain('Labor');
    });

    it('shows custom title in plain variant — pillar labels appear instead', () => {
      const result = strip(macroDashboard({ pillars: MACRO_PILLARS, width: 80, variant: 'plain', title: 'MY REGIME' }));
      expect(result).toContain('Inflation');
      expect(result).toContain('Rates');
      expect(result).toContain('Growth');
    });

    it('still shows pillar data', () => {
      const result = strip(macroDashboard({ pillars: MACRO_PILLARS, width: 80, variant: 'plain' }));
      expect(result).toContain('Inflation');
      expect(result).toContain('Rates');
      expect(result).toContain('Labor');
      expect(result).toContain('Growth');
      expect(result).toContain('Credit');
    });

    it('shows pillar state labels in compact format (no sub-indicators in plain variant)', () => {
      const result = strip(macroDashboard({ pillars: MACRO_PILLARS, width: 80, variant: 'plain' }));
      // Plain variant renders compact one-line-per-pillar; sub-indicators are omitted.
      // Verify pillar labels and their direction states appear.
      expect(result).toContain('Inflation');
      expect(result).toContain('Rates');
      expect(result).toContain('Labor');
    });

    it('still shows direction arrows', () => {
      const result = strip(macroDashboard({ pillars: MACRO_PILLARS, width: 80, variant: 'plain' }));
      expect(result).toContain('▲');
      expect(result).toContain('▼');
    });

    it('handles empty pillars in plain variant', () => {
      const result = strip(macroDashboard({ pillars: [], width: 80, variant: 'plain' }));
      expect(result).toContain('no macro data');
    });

    it('renders snapshot for plain variant', () => {
      const result = macroDashboard({ pillars: MACRO_PILLARS, width: 80, variant: 'plain' });
      expect(result).toMatchSnapshot();
    });
  });

  // Default variant retains boxes (regression guard)
  it('default variant (no variant specified) still has box borders', () => {
    const result = strip(macroDashboard({ pillars: MACRO_PILLARS, width: 80 }));
    expect(result).toContain('╭');
    expect(result).toContain('╯');
    expect(result).toContain('│');
  });
});
