/**
 * Theme definitions — 6 themes from the terminal design system.
 * Each theme maps semantic color roles to hex values.
 * Renderer converts hex → true-color ANSI (38;2;r;g;b).
 */

export const MARKET_GREEN = '#72C66B';
export const MARKET_RED = '#E7775A';

const themes = {
  'terminal-cyan': {
    accent:    '#00d4ff',
    positive:  '#00ff88',
    negative:  '#ff4444',
    warning:   '#ffaa00',
    data:      '#ffffff',
    label:     '#00d4ff',
    muted:     '#555555',
    highlight: '#ffdd00',
    chartHigh: '#00d4ff',
    chartLow:  '#005566',
  },
  bloomberg: {
    accent:    '#ff8c00',
    positive:  '#00c853',
    negative:  '#ff1744',
    warning:   '#ffd600',
    data:      '#ffffff',
    label:     '#ff8c00',
    muted:     '#555555',
    highlight: '#ff8c00',
    chartHigh: '#ff8c00',
    chartLow:  '#663800',
  },
  monochrome: {
    accent:    '#ffffff',
    positive:  '#cccccc',
    negative:  '#888888',
    warning:   '#aaaaaa',
    data:      '#ffffff',
    label:     '#999999',
    muted:     '#444444',
    highlight: '#ffffff',
    chartHigh: '#ffffff',
    chartLow:  '#555555',
  },
  'solarized-dark': {
    accent:    '#268bd2',
    positive:  '#859900',
    negative:  '#dc322f',
    warning:   '#b58900',
    data:      '#eee8d5',
    label:     '#268bd2',
    muted:     '#586e75',
    highlight: '#cb4b16',
    chartHigh: '#268bd2',
    chartLow:  '#073642',
  },
  dracula: {
    accent:    '#bd93f9',
    positive:  '#50fa7b',
    negative:  '#ff5555',
    warning:   '#f1fa8c',
    data:      '#f8f8f2',
    label:     '#bd93f9',
    muted:     '#6272a4',
    highlight: '#ffb86c',
    chartHigh: '#bd93f9',
    chartLow:  '#44475a',
  },
  marked: {
    accent:    '#C0FF00',
    positive:  '#00ff88',
    negative:  '#FF5C30',
    warning:   '#FFAA00',
    data:      '#ffffff',
    label:     '#374EFF',
    muted:     '#999999',
    highlight: '#6100FF',
    chartHigh: '#C0FF00',
    chartLow:  '#374EFF',
  },
};

let activeTheme = 'marked';

export function setTheme(name) {
  if (themes[name]) activeTheme = name;
}

export function getTheme() {
  return activeTheme;
}

export function palette(role) {
  return themes[activeTheme]?.[role] ?? '';
}

export function themeColors() {
  return { ...themes[activeTheme] };
}

export { themes };
