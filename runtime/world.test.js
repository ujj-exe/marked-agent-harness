import { describe, it, expect } from 'vitest';
import { TABS, TAB_IDS, resolveTab, createWorld, worldHeader, worldBlocks, tabBar, quoteLine, keyMetricsTable, parseWorldCommand, stepTab, setChartView } from './world.js';

const entity = {
  company: {
    company_id: 'c1', legal_name: 'Reliance Industries Ltd',
    common_name: 'Reliance', sector: 'Refining', isin: 'INE002A01018',
  },
};
const security = { security_id: 's1', symbol: 'RELIANCE', exchange: 'NSE', isin: 'INE002A01018' };
const packet = {
  price: { data: [
    { close: 1400, change_percent: 1.42 },
    { close: 1609, change_percent: -0.2 },
    { close: 1482.3, change_percent: 1.42 },
  ] },
  financials: { data: [] },
  metrics: { data: [] },
  shareholding: { data: [] },
  filings: { data: [] },
  events: { data: [] },
  actions: { data: [] },
};
const world = () => createWorld({ entity, security, packet });

const texts = blocks => blocks.filter(b => typeof b.text === 'string').map(b => b.text);

describe('tab registry', () => {
  it('is the single list the bar and the commands both read', () => {
    expect(TAB_IDS).toEqual(TABS.map(t => t.id));
    expect(TAB_IDS).toContain('overview');
    expect(TAB_IDS).toContain('financials');
    expect(TAB_IDS).toContain('research');
  });

  it('resolves an unambiguous prefix so /fin reaches financials', () => {
    expect(resolveTab('fin')).toBe('financials');
    expect(resolveTab('FINANCIALS')).toBe('financials');
    expect(resolveTab('research')).toBe('research');
  });

  it('refuses an ambiguous or unknown prefix rather than guessing', () => {
    // 'o' matches both overview and ownership.
    expect(resolveTab('o')).toBeNull();
    expect(resolveTab('nope')).toBeNull();
    expect(resolveTab('')).toBeNull();
  });
});

describe('createWorld', () => {
  it('carries canonical identity, not the alias the user typed', () => {
    const w = world();
    expect(w.company_id).toBe('c1');
    expect(w.security_id).toBe('s1');
    expect(w.company_name).toBe('Reliance Industries Ltd');
    expect(w.symbol).toBe('RELIANCE');
    expect(w.exchange).toBe('NSE');
    expect(w.isin).toBe('INE002A01018');
  });

  it('defaults to the overview tab and consolidated basis', () => {
    expect(world().tab).toBe('overview');
    expect(world().basis).toBe('consolidated');
  });

  it('is serializable so a session can be restored', () => {
    const w = world();
    expect(() => JSON.parse(JSON.stringify(w))).not.toThrow();
  });
});

describe('header', () => {
  it('shows identity, quote and the tab bar on three rows', () => {
    const blocks = worldHeader(world());
    expect(blocks).toHaveLength(3);
    const [identity, quote, tabs] = texts(blocks);
    expect(identity).toContain('Reliance Industries Ltd');
    expect(identity).toContain('NSE:RELIANCE');
    expect(identity).toContain('INE002A01018');
    expect(quote).toContain('₹1,482.3');
    expect(tabs).toContain('OVERVIEW');
  });

  it('marks the active tab and only the active tab', () => {
    expect(tabBar('financials', { color: false })).toContain('[FINANCIALS]');
    expect(tabBar('financials', { color: false })).not.toContain('[OVERVIEW]');
  });

  // Brackets alone were invisible while arrowing through the bar.
  it('fills the active tab so it cannot be missed', () => {
    const bar = tabBar('financials');
    const chip = bar.match(/\x1b\[7m[^\x1b]*\x1b\[1m[^\x1b]*\x1b\[[^m]*m ([A-Z]+) /);
    expect(chip?.[1]).toBe('FINANCIALS');
    expect((bar.match(/\x1b\[7m/g) || [])).toHaveLength(1);
  });

  it('states the position numerically, so it never depends on squinting', () => {
    // Counted from the registry, so adding a tab cannot make this a lie.
    expect(tabBar('overview', { color: false })).toContain(`1/${TAB_IDS.length}`);
    expect(tabBar(TAB_IDS.at(-1), { color: false })).toContain(`${TAB_IDS.length}/${TAB_IDS.length}`);
  });

  it('states the basis, so a number is never read on the wrong one', () => {
    expect(quoteLine(world())).toContain('CONSOLIDATED');
  });

  it('says so when there is no price rather than printing a zero', () => {
    const w = createWorld({ entity, security, packet: { price: { data: [] } } });
    expect(quoteLine(w)).toContain('price unavailable');
  });
});

describe('worldBlocks', () => {
  it('puts the header above every tab', () => {
    for (const id of TAB_IDS) {
      const blocks = worldBlocks(world(), id);
      expect(texts(blocks)[0]).toContain('Reliance Industries Ltd');
      expect(texts(blocks)[2]).toContain(TABS.find(t => t.id === id).label);
    }
  });

  it('renders every tab without throwing on an empty packet', () => {
    const empty = createWorld({ entity, security, packet: {} });
    for (const id of TAB_IDS) {
      expect(() => worldBlocks(empty, id)).not.toThrow();
      expect(worldBlocks(empty, id).length).toBeGreaterThan(3);
    }
  });

  it('falls back to overview for an unknown tab instead of rendering nothing', () => {
    const blocks = worldBlocks(world(), 'does-not-exist');
    expect(texts(blocks)[2]).toContain(`1/${TAB_IDS.length}`);
  });

  it('offers to start research rather than inventing a verdict', () => {
    const blocks = worldBlocks(world(), 'research');
    expect(texts(blocks).join(' ')).toContain('No research run');
  });

  it('renders a completed research result in its verdict panel', () => {
    const w = world();
    w.research = { result: { summary: 'Valuation is unchanged.', conviction: 'neutral', risks: [] } };
    expect(worldBlocks(w, 'research').find(block => block.id === 'world-research-verdict')?.data.thesis)
      .toBe('Valuation is unchanged.');
  });
});

describe('keyMetricsTable', () => {
  it('reports a data gap rather than blank cells', () => {
    const table = keyMetricsTable({});
    expect(table.rows[0].cells[0]).toContain('No financial facts');
  });

  it('uses the row shape the table renderer expects', () => {
    for (const row of keyMetricsTable({}).rows) expect(Array.isArray(row.cells)).toBe(true);
  });
});

describe('parseWorldCommand', () => {
  it('opens a world for any supported reference', () => {
    expect(parseWorldCommand('/world Reliance')).toEqual({ kind: 'open', reference: 'Reliance' });
    expect(parseWorldCommand('/world INE002A01018')).toEqual({ kind: 'open', reference: 'INE002A01018' });
    expect(parseWorldCommand('/world NSE:RELIANCE')).toEqual({ kind: 'open', reference: 'NSE:RELIANCE' });
  });

  it('opens search rather than printing usage — you should not need the exact name', () => {
    expect(parseWorldCommand('/world')).toEqual({ kind: 'search' });
    expect(parseWorldCommand('/world  ')).toEqual({ kind: 'search' });
  });

  it('reads what the search overlay sends back', () => {
    expect(parseWorldCommand('/wsearch reli')).toEqual({ kind: 'searching', query: 'reli' });
    expect(parseWorldCommand('/wsearch')).toEqual({ kind: 'searching', query: '' });
    expect(parseWorldCommand('/wpick 3')).toEqual({ kind: 'searchPick', index: 2 });
    expect(parseWorldCommand('/wpick cancel')).toEqual({ kind: 'searchCancel' });
  });

  it('exits', () => {
    expect(parseWorldCommand('/exit')).toEqual({ kind: 'exit' });
    expect(parseWorldCommand('/close')).toEqual({ kind: 'exit' });
  });

  it('reads tab verbs only inside a world', () => {
    expect(parseWorldCommand('/financials', { inWorld: true })).toEqual({ kind: 'tab', tab: 'financials' });
    expect(parseWorldCommand('/financials')).toBeNull();
    expect(parseWorldCommand('financials', { inWorld: true })).toEqual({ kind: 'tab', tab: 'financials' });
  });

  it('leaves ordinary questions alone, in a world or out of one', () => {
    for (const q of ['why did margins fall?', 'compare with Infosys', 'What was PAT in FY2025']) {
      expect(parseWorldCommand(q, { inWorld: true })).toBeNull();
      expect(parseWorldCommand(q)).toBeNull();
    }
  });
});

describe('stepTab', () => {
  it('moves and wraps in both directions', () => {
    expect(stepTab('overview', 1)).toBe('chart');
    // Wrapping lands on the last tab, whatever it is — asserted against the
    // registry so adding a tab does not silently break the claim.
    expect(stepTab('overview', -1)).toBe(TAB_IDS.at(-1));
    expect(stepTab(TAB_IDS.at(-1), 1)).toBe('overview');
  });
});

describe('as-of stamp', () => {
  it('reads as an IST date, not a raw ISO string', () => {
    const w = createWorld({ entity, security, packet, asOf: '2026-09-15T10:29:41.565Z' });
    const line = quoteLine(w);
    expect(line).toContain('15 Sep 26 15:59 IST');
    expect(line).not.toContain('T10:29');
  });
});

describe('chart commands', () => {
  it('reads a measure, a range and a transform in any order', () => {
    expect(parseWorldCommand('/chart revenue 5y', { inWorld: true })).toEqual({ kind: 'chart', args: 'revenue 5y' });
    const w = world();
    expect(setChartView(w, 'revenue 5y yoy').view).toMatchObject({ series: 'revenue', range: '5y', transform: 'yoy' });
    expect(setChartView(w, 'yoy 3y roe').view).toMatchObject({ series: 'roe', range: '3y', transform: 'yoy' });
  });

  it('moves to the chart tab when pointed at a measure', () => {
    const w = world();
    setChartView(w, 'roe');
    expect(w.tab).toBe('chart');
  });

  it('keeps the view across a tab change', () => {
    const w = world();
    setChartView(w, 'revenue 5y');
    w.tab = 'financials';
    expect(w.chart).toMatchObject({ series: 'revenue', range: '5y' });
  });

  it('says so rather than charting a guess', () => {
    const w = world();
    expect(setChartView(w, 'wibble').error).toMatch(/Cannot chart/);
    expect(w.chart.series).toBe('price');
  });

  it('leaves a bare /chart as a plain tab switch', () => {
    expect(parseWorldCommand('/chart', { inWorld: true })).toEqual({ kind: 'tab', tab: 'chart' });
  });
});

describe('chart view resets', () => {
  it('drops a previous transform when a new measure is named', () => {
    const w = world();
    setChartView(w, 'revenue yoy');
    setChartView(w, 'net_debt');
    // null is "not asked for" — distinct from a deliberate absolute, which is
    // what lets a comparison choose to rebase.
    expect(w.chart).toMatchObject({ series: 'net_debt', transform: null });
  });

  it('keeps a transform that is named alongside the measure', () => {
    const w = world();
    setChartView(w, 'revenue indexed');
    expect(w.chart.transform).toBe('indexed');
  });

  it('applies a transform on its own to the measure already shown', () => {
    const w = world();
    setChartView(w, 'revenue');
    setChartView(w, 'yoy');
    expect(w.chart).toMatchObject({ series: 'revenue', transform: 'yoy' });
  });
});

describe('tab stepping', () => {
  it('reads the arrow-key commands', () => {
    expect(parseWorldCommand('/tab next', { inWorld: true })).toEqual({ kind: 'step', delta: 1 });
    expect(parseWorldCommand('/tab prev', { inWorld: true })).toEqual({ kind: 'step', delta: -1 });
  });

  it('does not claim them outside a world', () => {
    expect(parseWorldCommand('/tab next')).toBeNull();
  });
});

describe('chart comparison', () => {
  it('reads the companies after vs / versus', () => {
    const w = world();
    expect(setChartView(w, 'revenue vs TCS').view).toMatchObject({ series: 'revenue', versus: ['TCS'] });
    expect(setChartView(w, 'revenue 5y versus TCS, HCLTECH').view).toMatchObject({ range: '5y', versus: ['TCS', 'HCLTECH'] });
  });

  it('clears the comparison when none is named, so a chart is never still one', () => {
    const w = world();
    setChartView(w, 'revenue vs TCS');
    setChartView(w, 'roe');
    expect(w.chart.versus).toEqual([]);
  });
});

describe('the header prefers the live quote', () => {
  const quoted = (quote) => createWorld({ entity, security, packet: { ...packet, quote: { data: quote } } });

  // The OHLCV series only supports a 30-bar proxy for the range and the move.
  // Calling that a 52-week high is a different claim from the one the data makes.
  it('uses the real 52-week range and the day\'s move when the quote has them', () => {
    const line = quoteLine(quoted({ price: 1500, change_percent: 2.5, week_52_high: 1611.8, week_52_low: 1114.85, market_cap: 16716663881728 }));
    expect(line).toContain('52w 1,114.85–1,611.8');
    expect(line).toContain('▲+2.50%');
    expect(line).toContain('mcap ₹16,71,666 Cr');
    expect(line).not.toContain('30d');
  });

  it('falls back to the retrieved window, labelled honestly, with no quote', () => {
    const line = quoteLine(createWorld({ entity, security, packet }));
    expect(line).toMatch(/\d+d \d/);
    expect(line).not.toContain('52w');
  });

  it('says when the quote is stale rather than presenting it as live', () => {
    expect(quoteLine(quoted({ price: 1500, is_stale: true }))).toContain('STALE');
  });
});
