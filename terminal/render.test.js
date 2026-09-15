/**
 * render.test.js — Tests for render.js pure functions.
 *
 * Covers: focusIndicator, renderHelpOverlay, buildFooter state variants.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { tui } from './state.js';
import { focusIndicator, renderHelpOverlay, renderInputOverlay, renderQueryOverlay, buildFooter, buildHeader, paintScreen, paintWithScroll, footerRow } from './render.js';

// ── Helpers ─────────────────────────────────────────────────────────────────

const strip = (s) => s.replace(/\x1b\[[0-9;]*m/g, '');

// ── focusIndicator ──────────────────────────────────────────────────────────

describe('focusIndicator', () => {
  beforeEach(() => {
    tui.focusedPanel = null;
  });

  it('returns empty string when no panel is focused', () => {
    expect(focusIndicator('quote')).toBe('');
  });

  it('returns empty string when panel name is null', () => {
    tui.focusedPanel = 'quote';
    expect(focusIndicator(null)).toBe('');
  });

  it('returns empty string for non-focused panel', () => {
    tui.focusedPanel = 'chart';
    expect(focusIndicator('quote')).toBe('');
  });

  it('returns indicator with ▶ for focused panel', () => {
    tui.focusedPanel = 'quote';
    const result = focusIndicator('quote');
    expect(strip(result)).toContain('▶');
    expect(strip(result)).toContain('Tab next');
  });
});

// ── renderHelpOverlay ───────────────────────────────────────────────────────

describe('renderHelpOverlay', () => {
  it('renders full help page for normal terminals', () => {
    const origRows = process.stdout.rows;
    process.stdout.rows = 24;
    const result = renderHelpOverlay(80);
    const text = strip(result);
    expect(text).toContain('COMMAND LINE');
    expect(text).toContain('NAVIGATION');
    expect(text).toContain('ACTIONS');
    expect(text).toContain('Scroll one page');
    expect(text).toContain('Save report');
    expect(text).toContain('Quit the terminal');
    process.stdout.rows = origRows;
  });

  it('renders single summary row for tiny terminals (<12 rows)', () => {
    const origRows = process.stdout.rows;
    process.stdout.rows = 10;
    const result = renderHelpOverlay(80);
    expect(result.split('\n').length).toBe(1);
    expect(strip(result)).toContain('scroll');
    expect(strip(result)).toContain('quit');
    process.stdout.rows = origRows;
  });

  it('documents one keymap for every phase — the prompt is live on splash too', () => {
    const origRows = process.stdout.rows;
    process.stdout.rows = 24;
    const result = renderHelpOverlay(80);
    const text = strip(result);
    expect(text).toContain('The prompt is always open');
    expect(text).toContain('Cancel the running query');
    expect(text).not.toContain('SPLASH SCREEN');
    process.stdout.rows = origRows;
  });
});

describe('renderQueryOverlay', () => {
  it('masks API keys while allowing normal questions to remain readable', () => {
    const keyView = strip(renderQueryOverlay(80, '/marked mk_live_example_key_value'));
    const queryView = strip(renderQueryOverlay(80, 'Compare TCS and Infosys'));
    expect(keyView.split('\n')).toHaveLength(1);
    expect(keyView).not.toContain('mk_live_example_key_value');
    expect(keyView).toContain('/marked');
    expect(queryView).toContain('Compare TCS and Infosys');
  });
});

describe('renderInputOverlay', () => {
  it('uses Marked chrome and masks onboarding secrets', () => {
    tui.inputPrompt = 'Paste your Marked API key';
    tui.inputValue = 'mk_live_secret';
    tui.inputSecret = true;
    tui.inputStep = { current: 2, total: 4, title: 'CONNECT MARKED' };
    const text = strip(renderInputOverlay(80));
    expect(text).toContain('MARKED');
    expect(text).toContain('STEP 2 OF 4');
    expect(text).not.toContain('mk_live_secret');
  });
});

// ── buildFooter state variants ──────────────────────────────────────────────

describe('buildFooter', () => {
  beforeEach(() => {
    tui.renderMeta = { model: null, tools: null, cost: null, as_of: null };
    tui.agentState = null;
  });

  it('renders standard footer with no agent state', () => {
    const result = buildFooter(80);
    expect(strip(result)).toContain('MARKED');
    expect(strip(result)).toContain('save');
    expect(strip(result)).toContain('quit');
  });

  it('renders gathering state footer with spinner and tool progress', () => {
    tui.agentState = {
      stage: 'gathering',
      skill: 'analyst',
      query: 'RELIANCE',
      tools: { called: 3, total: 8, current: 'marked.prices' },
    };
    const result = buildFooter(120);
    const plain = strip(result);
    expect(plain).toContain('Gathering');
    expect(plain).toContain(':analyst');
    expect(plain).toContain('RELIANCE');
    expect(plain).toContain('3/8');
  });

  it('renders analyzing state footer', () => {
    tui.agentState = { stage: 'analyzing', skill: 'compare', query: 'RELIANCE TCS' };
    const result = buildFooter(100);
    expect(strip(result)).toContain('Analyzing');
    expect(strip(result)).toContain(':compare');
  });

  it('keeps long running prompts to one terminal row', () => {
    tui.agentState = { stage: 'gathering', query: 'Analyze management claims against reported metrics. '.repeat(20) };
    expect(strip(buildHeader(80))).toHaveLength(80);
    expect(strip(buildFooter(80))).toHaveLength(80);
  });

  it('renders streaming write progress and ETA', () => {
    tui.agentState = {
      stage: 'analyzing', query: 'Reliance', tools: { called: 7, total: 7 },
      progress: { phase: 'writing', outputTokens: 4210, targetTokens: 12000, etaSeconds: 68, completed: ['summary', 'thesis'] },
    };
    const plain = strip(buildFooter(160));
    expect(plain).toContain('Writing');
    expect(plain).toContain('summary, thesis');
    expect(plain).toContain('~4,210 tok');
    expect(plain).toContain('~68s left');
  });

  it('renders complete state footer with follow_ups hint', () => {
    tui.agentState = {
      stage: 'complete',
      follow_ups: [
        { key: '1', label: 'Drill deeper', cmd: '/marked use analyst skill. RELIANCE' },
        { key: '2', label: 'Compare TCS', cmd: '/marked use compare skill. RELIANCE TCS' },
      ],
    };
    const result = buildFooter(120);
    expect(strip(result)).toContain('/1-/2 drill');
  });

  it('renders meta in footer when present', () => {
    tui.renderMeta = { model: 'opus', tools: '8', cost: '$0.12', as_of: null };
    const result = buildFooter(120);
    const plain = strip(result);
    expect(plain).toContain('opus');
    expect(plain).toContain('8 tools');
    expect(plain).toContain('~$0.12');
  });
});

// ── paintScreen + paintWithScroll integration ─────────────────────────────

describe('paintScreen → paintWithScroll', () => {
  let writes;
  let origWrite, origCols, origRows;

  beforeEach(() => {
    writes = [];
    origWrite = process.stdout.write;
    origCols = process.stdout.columns;
    origRows = process.stdout.rows;
    process.stdout.write = (data) => { writes.push(data); return true; };
    process.stdout.columns = 80;
    process.stdout.rows = 24;
    tui.lastContent = '';
    tui.scrollOffset = 0;
    tui.agentState = null;
    tui.renderMeta = { model: null, tools: null, cost: null, as_of: null };
  });

  afterEach(() => {
    process.stdout.write = origWrite;
    process.stdout.columns = origCols;
    process.stdout.rows = origRows;
  });

  it('does not throw on short content (no scroll)', () => {
    expect(() => paintScreen('hello\nworld')).not.toThrow();
    expect(tui.lastContent).toContain('hello');
    expect(tui.lastContent).toContain('MARKED');
  });

  it('does not throw on overflowing content (scroll mode)', () => {
    const longContent = Array.from({ length: 50 }, (_, i) => `line ${i}`).join('\n');
    expect(() => paintScreen(longContent)).not.toThrow();
  });

  it('does not throw when paintWithScroll is called repeatedly', () => {
    const longContent = Array.from({ length: 50 }, (_, i) => `line ${i}`).join('\n');
    paintScreen(longContent);
    tui.scrollOffset = 5;
    expect(() => paintWithScroll()).not.toThrow();
    tui.scrollOffset = 0;
    expect(() => paintWithScroll()).not.toThrow();
  });

  it('does not throw during gathering state', () => {
    tui.agentState = { stage: 'gathering', skill: 'analyst', query: 'NVDA', tools: { called: 3, total: 8 } };
    const content = Array.from({ length: 30 }, (_, i) => `data ${i}`).join('\n');
    expect(() => paintScreen(content)).not.toThrow();
  });
});

describe('footerRow', () => {
  // The spinner repaints the footer every 110ms at this row. When it drifted
  // from the full paint's geometry it drew a second footer over the scroll
  // indicator — two "Analyzing" lines stacked on screen.
  it('keeps the last row for the prompt when content fits', () => {
    expect(footerRow(10, 24)).toBe(10);
    expect(footerRow(23, 24)).toBe(23);
  });

  it('sits above the indicator and the prompt when content overflows', () => {
    // rows 1..24 = header, body…, footer(22), indicator(23), prompt(24)
    expect(footerRow(500, 24)).toBe(22);
  });

  it('never returns the prompt row', () => {
    for (const rows of [12, 24, 40, 80]) {
      for (const total of [1, rows - 2, rows - 1, rows, rows + 1, 1000]) {
        expect(footerRow(total, rows)).toBeLessThan(rows);
      }
    }
  });
});
