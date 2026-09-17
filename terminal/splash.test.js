import { describe, expect, it } from 'vitest';
import { renderSplash } from './splash.js';

const strip = value => value.replace(/\x1b\[[0-9;]*m/g, '');

describe('splash live tape', () => {
  it('places API-backed quotes under runtime workers', () => {
    const text = strip(renderSplash('Connected', 120, 0, 30, [
      { symbol: 'NIFTY', price: 25180, change_percent: 0.42, market_status: 'REGULAR', is_stale: false },
      { symbol: 'BANKNIFTY', price: 52100, change_percent: -0.18, market_status: 'REGULAR', is_stale: false },
    ]));
    expect(text).toContain('LIVE TAPE');
    expect(text).not.toContain('YAHOO');
    expect(text.indexOf('LIVE TAPE')).toBeGreaterThan(text.indexOf('RUNTIME WORKERS'));
    expect(text).toContain('NIFTY');
    expect(text).toContain('BANKNIFTY');
  });

  it('shows the update command on the home screen', () => {
    const text = strip(renderSplash('UPDATE AVAILABLE · run marked --update', 120, 0, 30));
    expect(text).toContain('UPDATE AVAILABLE · run marked --update');
  });
});
