/**
 * render.test.js — Tests for render.js pure functions.
 *
 * Covers: focusIndicator, renderHelpOverlay, buildFooter state variants.
 */

import { renderBlocks } from './engine.js';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { tui } from './state.js';
import { focusIndicator, renderHelpOverlay, renderInputOverlay, renderModelOverlay, renderQueryOverlay, buildFooter, buildHeader, paintScreen, paintWithScroll, footerRow, PROMPT_ROWS, renderPromptBlock, fillHeight } from './render.js';

// ── Helpers ─────────────────────────────────────────────────────────────────

const strip = (s) => s.replace(/\x1b\[[0-9;]*m/g, '');

it('shows missing API keys in /models and offers connection', () => {
  tui.modelList = [{ agent: 'codex-api', id: 'connect', label: 'Set API key · discover models', status: 'key not set' }];
  tui.modelIdx = 0;
  const text = strip(renderModelOverlay(100));
  expect(text).toContain('ChatGPT API · key not set');
  expect(text).toContain('Set API key · discover models');
});

it('shows missing ChatGPT subscription auth in /models', () => {
  tui.modelList = [{ agent: 'openai-codex', id: 'authenticate', label: 'Sign in · discover subscription models', status: 'not signed in' }];
  tui.modelIdx = 0;
  const text = strip(renderModelOverlay(100));
  expect(text).toContain('ChatGPT subscription · not signed in');
  expect(text).toContain('Sign in · discover subscription models');
});

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
    // Shortcuts live on the command line's hint row now; showing them here too
    // put the same five on screen twice.
    expect(strip(result)).not.toContain('save');
    expect(strip(result)).not.toContain('quit');
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
    expect(strip(result)).toContain('/1-/2 to drill');
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

  it('does not clear the terminal for a patch repaint', () => {
    const longContent = Array.from({ length: 50 }, (_, i) => `line ${i}`).join('\n');
    paintScreen(longContent);
    writes.length = 0;
    paintScreen(longContent.replace('line 0', 'patched'), false);
    expect(writes.join('')).not.toContain('\x1b[2J');
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
  it('leaves the command line its three rows when content fits', () => {
    expect(footerRow(10, 24)).toBe(10);
    expect(footerRow(21, 24)).toBe(21);        // 24 − 3 is the last content row
  });

  it('sits above the indicator and the command line when content overflows', () => {
    // rows 1..24 = header, body…, footer(20), indicator(21), rule(22), field(23), hints(24)
    expect(footerRow(500, 24)).toBe(20);
  });

  it('never collides with the command line', () => {
    for (const rows of [12, 24, 40, 80]) {
      for (const total of [1, rows - 4, rows, 1000]) {
        expect(footerRow(total, rows)).toBeLessThanOrEqual(rows - PROMPT_ROWS);
      }
    }
  });

  it('never returns the prompt row', () => {
    for (const rows of [12, 24, 40, 80]) {
      for (const total of [1, rows - 2, rows - 1, rows, rows + 1, 1000]) {
        expect(footerRow(total, rows)).toBeLessThan(rows);
      }
    }
  });
});

describe('renderPromptBlock', () => {
  const strip = s => s.replace(/\x1b\[[0-9;]*m/g, '');
  // Earlier suites in this file leave a running agentState behind, and the
  // hint line reads it.
  beforeEach(() => { tui.agentState = null; });

  it('is a rule, the field and a hint line', () => {
    const block = renderPromptBlock(80, '');
    expect(block).toHaveLength(PROMPT_ROWS);
    expect(strip(block[0])).toMatch(/^─+$/);
    expect(strip(block[1])).toContain('query');
    expect(strip(block[2])).toContain('type to ask');
  });

  it('shows what the next question is about, on the rule', () => {
    const block = renderPromptBlock(80, '', { detail: 'RELIANCE · NSE' });
    expect(strip(block[0])).toContain('RELIANCE · NSE');
    expect(strip(block[0]).length).toBeLessThanOrEqual(80);
  });

  it('offers the key that matters for the state it is in', () => {
    expect(strip(renderPromptBlock(80, 'why did margins fall')[2])).toContain('⏎ to ask');
  });

  it('never exceeds the width it was given', () => {
    for (const width of [40, 80, 200]) {
      for (const line of renderPromptBlock(width, 'x'.repeat(300), { detail: 'SCOPE' })) {
        expect(strip(line).length).toBeLessThanOrEqual(width);
      }
    }
  });

  it('grows upward to keep a long question visible', () => {
    const question = 'Can you do a deep dive on Reliance Industries and explain what changed over five years? '
      + 'Look at revenue, profit, margins, debt, capex, segment mix, shareholding, filings, valuation and peers. '.repeat(4)
      + 'Finish with the biggest things an investor should watch over the next couple of quarters.';
    const block = renderPromptBlock(80, question, { detail: 'NSE:RELIANCE · OVERVIEW' }, 40);
    expect(block.length).toBeGreaterThan(PROMPT_ROWS);
    expect(strip(block.slice(1, -1).join(' '))).toContain('biggest');
    expect(strip(block.at(-2))).toContain('quarters.');
  });
});

describe('the prompt carries the scope', () => {
  const strip = s => s.replace(/\x1b\[[0-9;]*m/g, '');
  beforeEach(() => { tui.agentState = null; tui.scope = null; });

  it('reads "query" outside a world', () => {
    expect(strip(renderPromptBlock(80, '')[1])).toContain('query ›');
  });

  it('becomes the ticker inside one, so the scope is never a thing to remember', () => {
    tui.scope = { ticker: 'INFY', detail: 'NSE:INFY · CONSOLIDATED · CHART' };
    const block = renderPromptBlock(80, '');
    expect(strip(block[1])).toContain('INFY ›');
    expect(strip(block[1])).not.toContain('query ›');
    expect(strip(block[0])).toContain('NSE:INFY · CONSOLIDATED · CHART');
  });

  it('still shows what is typed', () => {
    tui.scope = { ticker: 'INFY' };
    expect(strip(renderPromptBlock(80, 'why did margins fall')[1])).toContain('why did margins fall');
  });
});

describe('fillHeight', () => {
  const strip = s => s.replace(/\x1b\[[0-9;]*m/g, '');
  const chart = (height) => ({ panel: 'chart', grow: true, data: { values: [1, 2, 3, 4, 5], height } });
  const table = (n) => ({ table: { headers: ['A'], rows: Array.from({ length: n }, (_, i) => ({ cells: [`r${i}`] })) } });

  // A block builder cannot know how tall its output will be, so guessing a
  // share of the screen left a tall terminal two-thirds empty.
  it('gives the leftover rows to the block that asked for them', () => {
    const short = fillHeight([chart(8), table(2)], 100, 60).split('\n').length;
    const tall = fillHeight([chart(8), table(2)], 100, 20).split('\n').length;
    expect(short).toBeGreaterThan(tall);
  });

  it('fills close to the space available', () => {
    const rows = 50;
    const used = fillHeight([chart(8), table(3)], 100, rows).split('\n').length;
    expect(used).toBeLessThanOrEqual(rows - PROMPT_ROWS - 2);
    expect(used).toBeGreaterThan(rows - PROMPT_ROWS - 2 - 3);
  });

  it('leaves content alone when it already overflows', () => {
    const blocks = [chart(8), table(80)];
    expect(fillHeight(blocks, 100, 24)).toBe(renderBlocks(blocks, 100));
  });

  it('changes nothing when no block wants to grow', () => {
    const blocks = [table(3)];
    expect(fillHeight(blocks, 100, 60)).toBe(renderBlocks(blocks, 100));
  });

  it('finds a growable block nested inside a row', () => {
    const nested = [{ row: [{ w: 0.5, stack: [chart(8)] }, { w: 0.5, stack: [table(2)] }] }];
    const filled = fillHeight(nested, 120, 50).split('\n').length;
    expect(filled).toBeGreaterThan(renderBlocks(nested, 120).split('\n').length);
  });

  it('renders normally when the terminal height is unknown', () => {
    const blocks = [chart(8), table(2)];
    expect(fillHeight(blocks, 100, null)).toBe(renderBlocks(blocks, 100));
  });
});
