import { describe, it, expect, beforeEach } from 'vitest';
import { setTheme, getTheme, palette, themeColors } from './themes.js';

// Reset to a known theme before each test
beforeEach(() => setTheme('terminal-cyan'));

// ── setTheme ──────────────────────────────────────────────────────────────────

describe('setTheme', () => {
  it('sets a valid theme by name', () => {
    setTheme('bloomberg');
    expect(getTheme()).toBe('bloomberg');
  });

  it('ignores unknown theme names (leaves current theme unchanged)', () => {
    setTheme('marked');
    setTheme('nonexistent_theme');
    expect(getTheme()).toBe('marked');
  });

  it('sets each built-in theme without error', () => {
    const builtins = ['terminal-cyan', 'bloomberg', 'monochrome', 'solarized-dark', 'dracula', 'marked'];
    for (const name of builtins) {
      setTheme(name);
      expect(getTheme()).toBe(name);
    }
  });
});

// ── getTheme ──────────────────────────────────────────────────────────────────

describe('getTheme', () => {
  it('returns the active theme name', () => {
    setTheme('dracula');
    expect(getTheme()).toBe('dracula');
  });

  it('returns terminal-cyan after reset', () => {
    setTheme('terminal-cyan');
    expect(getTheme()).toBe('terminal-cyan');
  });
});

// ── palette ───────────────────────────────────────────────────────────────────

describe('palette', () => {
  it('returns hex color string for a known role', () => {
    setTheme('terminal-cyan');
    const color = palette('accent');
    expect(typeof color).toBe('string');
    expect(color.startsWith('#')).toBe(true);
    expect(color).toBe('#00d4ff');
  });

  it('returns empty string for an unknown role', () => {
    expect(palette('nonexistent_role')).toBe('');
  });

  it('reflects the active theme', () => {
    setTheme('bloomberg');
    expect(palette('accent')).toBe('#ff8c00');

    setTheme('dracula');
    expect(palette('accent')).toBe('#bd93f9');
  });

  it('returns correct colors for all semantic roles in the Marked theme', () => {
    setTheme('marked');
    expect(palette('accent')).toBe('#C0FF00');
    expect(palette('positive')).toBe('#00ff88');
    expect(palette('negative')).toBe('#FF5C30');
    expect(palette('warning')).toBe('#FFAA00');
    expect(palette('data')).toBe('#ffffff');
    expect(palette('label')).toBe('#374EFF');
    expect(palette('muted')).toBe('#999999');
    expect(palette('highlight')).toBe('#6100FF');
  });

  it('returns correct colors for terminal-cyan theme', () => {
    setTheme('terminal-cyan');
    expect(palette('accent')).toBe('#00d4ff');
    expect(palette('positive')).toBe('#00ff88');
    expect(palette('negative')).toBe('#ff4444');
    expect(palette('warning')).toBe('#ffaa00');
  });

  it('returns correct colors for solarized-dark theme', () => {
    setTheme('solarized-dark');
    expect(palette('accent')).toBe('#268bd2');
    expect(palette('positive')).toBe('#859900');
    expect(palette('negative')).toBe('#dc322f');
  });

  it('returns chartHigh and chartLow colors', () => {
    setTheme('marked');
    expect(palette('chartHigh')).toBe('#C0FF00');
    expect(palette('chartLow')).toBe('#374EFF');
  });
});

// ── themeColors ───────────────────────────────────────────────────────────────

describe('themeColors', () => {
  it('returns an object with all semantic roles', () => {
    setTheme('marked');
    const colors = themeColors();
    expect(typeof colors).toBe('object');
    expect(colors).toHaveProperty('accent');
    expect(colors).toHaveProperty('positive');
    expect(colors).toHaveProperty('negative');
    expect(colors).toHaveProperty('warning');
    expect(colors).toHaveProperty('data');
    expect(colors).toHaveProperty('label');
    expect(colors).toHaveProperty('muted');
    expect(colors).toHaveProperty('highlight');
    expect(colors).toHaveProperty('chartHigh');
    expect(colors).toHaveProperty('chartLow');
  });

  it('returns a copy (mutating does not affect palette)', () => {
    setTheme('marked');
    const colors = themeColors();
    const originalAccent = colors.accent;
    colors.accent = '#000000'; // mutate the returned copy
    expect(palette('accent')).toBe(originalAccent); // original unchanged
  });

  it('reflects the active theme', () => {
    setTheme('bloomberg');
    expect(themeColors().accent).toBe('#ff8c00');

    setTheme('monochrome');
    expect(themeColors().accent).toBe('#ffffff');
  });

  it('returns consistent values with palette()', () => {
    setTheme('dracula');
    const colors = themeColors();
    for (const role of Object.keys(colors)) {
      expect(colors[role]).toBe(palette(role));
    }
  });
});
