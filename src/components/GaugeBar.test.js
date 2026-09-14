import { describe, it, expect, beforeEach } from 'vitest';
import { gaugeBar, gaugeStack } from './GaugeBar.js';
import { setTheme } from '../themes.js';
import { strip } from '../ansi.js';

beforeEach(() => setTheme('terminal-cyan'));

describe('GaugeBar', () => {
  it('renders RSI oversold', () => {
    const result = gaugeBar({ value: 28.5, preset: 'rsi', label: 'RSI(14)' });
    expect(result).toMatchSnapshot();
    expect(strip(result)).toContain('OVERSOLD');
  });

  it('renders RSI neutral', () => {
    const result = gaugeBar({ value: 50, preset: 'rsi', label: 'RSI(14)' });
    expect(result).toMatchSnapshot();
    expect(strip(result)).not.toContain('OVERSOLD');
    expect(strip(result)).not.toContain('OVERBOUGHT');
  });

  it('renders RSI overbought', () => {
    const result = gaugeBar({ value: 78, preset: 'rsi', label: 'RSI(14)' });
    expect(result).toMatchSnapshot();
    expect(strip(result)).toContain('OVERBOUGHT');
  });

  it('renders sentiment bearish', () => {
    const result = gaugeBar({ value: -0.7, preset: 'sentiment', label: 'Sentiment' });
    expect(result).toMatchSnapshot();
    expect(strip(result)).toContain('BEARISH');
  });

  it('renders sentiment bullish', () => {
    const result = gaugeBar({ value: 0.8, preset: 'sentiment', label: 'Sentiment' });
    expect(result).toMatchSnapshot();
    expect(strip(result)).toContain('BULLISH');
  });

  it('renders confidence low', () => {
    const result = gaugeBar({ value: 15, preset: 'confidence' });
    expect(result).toMatchSnapshot();
  });

  it('renders confidence high', () => {
    const result = gaugeBar({ value: 85, preset: 'confidence' });
    expect(result).toMatchSnapshot();
  });

  it('renders basic percent', () => {
    const result = gaugeBar({ value: 65, width: 10 });
    expect(result).toMatchSnapshot();
  });

  it('handles null value', () => {
    const result = gaugeBar({ value: null });
    expect(strip(result)).toBe('—');
  });

  it('handles zero', () => {
    const result = gaugeBar({ value: 0, preset: 'rsi', width: 10 });
    expect(result).toMatchSnapshot();
  });

  it('handles max value', () => {
    const result = gaugeBar({ value: 100, preset: 'rsi', width: 10 });
    expect(result).toMatchSnapshot();
  });

  it('handles custom width', () => {
    const result = gaugeBar({ value: 50, width: 30 });
    const stripped = strip(result);
    // Should contain 30 block characters (filled + empty)
    const blocks = stripped.match(/[█░]/g);
    expect(blocks).toHaveLength(30);
  });

  it('hides value when showValue=false', () => {
    const result = gaugeBar({ value: 50, preset: 'rsi', showValue: false, showLabel: false });
    const stripped = strip(result);
    expect(stripped).not.toContain('50');
  });

  // Theme tests
  it('renders in dracula theme', () => {
    setTheme('dracula');
    const result = gaugeBar({ value: 37.8, preset: 'rsi', label: 'RSI(14)' });
    expect(result).toMatchSnapshot();
  });
});

describe('gaugeStack', () => {
  it('renders macro dashboard gauges', () => {
    const gauges = [
      { label: 'Inflation', value: 50, preset: 'percent', width: 10 },
      { label: 'Rates', value: 70, preset: 'percent', width: 10 },
      { label: 'Labor', value: 50, preset: 'percent', width: 10 },
      { label: 'Growth', value: 30, preset: 'percent', width: 10 },
    ];
    const result = gaugeStack(gauges);
    expect(result).toMatchSnapshot();
  });

  it('renders with mixed presets', () => {
    const gauges = [
      { label: 'RSI', value: 37.8, preset: 'rsi', width: 15 },
      { label: 'Sentiment', value: 0.4, preset: 'sentiment', width: 15 },
      { label: 'Confidence', value: 72, preset: 'confidence', width: 15 },
    ];
    const result = gaugeStack(gauges);
    expect(result).toMatchSnapshot();
  });
});
