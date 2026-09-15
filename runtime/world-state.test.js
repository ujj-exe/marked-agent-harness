import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.MARKED_HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'marked-ws-'));
const { rememberWorld, recallWorld, restoreWorld, recentWorlds, worldKey, loadWorldState } = await import('./world-state.js');
const { WORLDS_PATH } = await import('../config/paths.js');

const world = (over = {}) => ({
  company_id: 'c1', symbol: 'INFY', common_name: 'Infosys',
  tab: 'financials', basis: 'consolidated',
  chart: { series: 'roe', range: '5y', transform: null, versus: [] },
  ...over,
});

beforeEach(() => { try { fs.unlinkSync(WORLDS_PATH); } catch {} });

describe('worldKey', () => {
  it('prefers identity over the name someone typed', () => {
    expect(worldKey(world())).toBe('C1');
    expect(worldKey({ symbol: 'TCS' })).toBe('TCS');
    expect(worldKey({})).toBeNull();
  });
});

describe('remembering a world', () => {
  it('stores the tab and the chart, and nothing else', () => {
    rememberWorld(world());
    const saved = recallWorld(world());
    expect(saved.tab).toBe('financials');
    expect(saved.chart.series).toBe('roe');
    // The packet is deliberately absent: stale facts presented as current are
    // the one failure this product cannot afford.
    expect(saved).not.toHaveProperty('packet');
    expect(saved).not.toHaveProperty('evidence');
  });

  it('puts the view back on a freshly retrieved world', () => {
    rememberWorld(world());
    const fresh = restoreWorld({ company_id: 'c1', symbol: 'INFY', tab: 'overview', basis: 'consolidated', chart: { series: 'price' } });
    expect(fresh.tab).toBe('financials');
    expect(fresh.chart.series).toBe('roe');
    expect(fresh.restored).toBe(true);
  });

  it('leaves a company it has never seen alone', () => {
    const fresh = restoreWorld({ company_id: 'new', tab: 'overview' });
    expect(fresh.tab).toBe('overview');
    expect(fresh.restored).toBeUndefined();
  });

  it('lists recent companies, newest first', () => {
    rememberWorld(world());
    rememberWorld(world({ company_id: 'c2', symbol: 'TCS', common_name: 'TCS' }));
    expect(recentWorlds().map(r => r.symbol)).toEqual(['TCS', 'INFY']);
  });

  it('moves a company back to the front when revisited', () => {
    rememberWorld(world());
    rememberWorld(world({ company_id: 'c2', symbol: 'TCS' }));
    rememberWorld(world());
    expect(recentWorlds()[0].symbol).toBe('INFY');
  });

  it('survives a corrupt file rather than failing the session', () => {
    fs.mkdirSync(path.dirname(WORLDS_PATH), { recursive: true });
    fs.writeFileSync(WORLDS_PATH, 'not json at all');
    expect(loadWorldState()).toEqual({ worlds: {}, recent: [] });
    expect(() => rememberWorld(world())).not.toThrow();
  });
});
