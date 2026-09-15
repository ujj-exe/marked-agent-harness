/**
 * keys.test.js — the command line's contract.
 *
 * The prompt is always open, so the rules that matter are about precedence:
 * printable characters must never trigger an action, Ctrl-C must abandon a run
 * rather than the app, and a modal overlay must still win over both.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

const submitQuery = vi.fn(() => Promise.resolve());
vi.mock('./io.js', () => ({
  submitQuery: (...args) => submitQuery(...args),
  healthCheck: vi.fn(() => Promise.resolve()),
  saveReport: vi.fn(() => null),
  listReports: vi.fn(() => []),
  httpGet: vi.fn(),
  httpPost: vi.fn(),
}));
vi.mock('./server.js', () => ({
  startServer: vi.fn(() => Promise.resolve({ port: 7707 })),
  connectedAgent: vi.fn(() => null),
  emitter: { on: vi.fn(), emit: vi.fn() },
}));

const { handleKeypress } = await import('./app.js');
const { tui } = await import('./state.js');

const type = (text) => {
  for (const ch of text) handleKeypress(ch, { name: ch });
};

beforeEach(() => {
  submitQuery.mockClear();
  vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
  tui.queryInput = '';
  tui.queryHistory = [];
  tui.historyIdx = -1;
  tui.agentState = null;
  tui.inputMode = tui.askMode = tui.modelMode = tui.loadMode = tui.helpVisible = false;
  tui.lastContent = 'x';
  tui.scope = null;
  tui.panelIds = [];
});

describe('the command line is always open', () => {
  it('types printable characters instead of firing actions', () => {
    // 's' was save, 'l' was load, 'n' opened the prompt, 'q' quit.
    type('slnq');
    expect(tui.queryInput).toBe('slnq');
  });

  it('accepts a question with no key pressed to open it first', () => {
    type('Infosys PAT FY2025');
    handleKeypress(null, { name: 'return' });
    expect(submitQuery).toHaveBeenCalledWith('Infosys PAT FY2025');
    expect(tui.queryInput).toBe('');
  });

  it('backspaces', () => {
    type('abc');
    handleKeypress(null, { name: 'backspace' });
    expect(tui.queryInput).toBe('ab');
  });

  it('keeps submitted questions in history, newest first on ArrowUp', () => {
    type('one');  handleKeypress(null, { name: 'return' });
    type('two');  handleKeypress(null, { name: 'return' });
    handleKeypress(null, { name: 'up' });
    expect(tui.queryInput).toBe('two');
    handleKeypress(null, { name: 'up' });
    expect(tui.queryInput).toBe('one');
    handleKeypress(null, { name: 'down' });
    expect(tui.queryInput).toBe('two');
  });
});

describe('Ctrl-C abandons the query, not the app', () => {
  it('cancels the run in flight', () => {
    tui.agentState = { stage: 'analyzing' };
    handleKeypress(null, { ctrl: true, name: 'c' });
    expect(submitQuery).toHaveBeenCalledWith('/cancel');
  });

  it('clears a drafted line when nothing is running', () => {
    type('half a question');
    handleKeypress(null, { ctrl: true, name: 'c' });
    expect(tui.queryInput).toBe('');
    expect(submitQuery).not.toHaveBeenCalled();
  });

  it('never exits the process', () => {
    const exit = vi.spyOn(process, 'exit').mockImplementation(() => {});
    handleKeypress(null, { ctrl: true, name: 'c' });
    expect(exit).not.toHaveBeenCalled();
    exit.mockRestore();
  });
});

describe('Ctrl-D quits, but only from an empty line', () => {
  it('ignores Ctrl-D mid-question so a draft is never lost', () => {
    const exit = vi.spyOn(process, 'exit').mockImplementation(() => {});
    type('draft');
    handleKeypress(null, { ctrl: true, name: 'd' });
    expect(exit).not.toHaveBeenCalled();
    exit.mockRestore();
  });

  it('exits on an empty line', () => {
    const exit = vi.spyOn(process, 'exit').mockImplementation(() => {});
    handleKeypress(null, { ctrl: true, name: 'd' });
    expect(exit).toHaveBeenCalledWith(0);
    exit.mockRestore();
  });
});

describe('follow-ups are typed, not bare digits', () => {
  it('expands /2 to the offered question', () => {
    tui.agentState = {
      stage: 'complete',
      follow_ups: [{ key: '1', question: 'first' }, { key: '2', question: 'second' }],
    };
    type('/2');
    handleKeypress(null, { name: 'return' });
    expect(submitQuery).toHaveBeenCalledWith('second');
  });

  it('sends a bare digit as a question, since it is one', () => {
    tui.agentState = { stage: 'complete', follow_ups: [{ key: '1', question: 'first' }] };
    type('2024 revenue');
    handleKeypress(null, { name: 'return' });
    expect(submitQuery).toHaveBeenCalledWith('2024 revenue');
  });
});

describe('modal overlays keep priority over the prompt', () => {
  it('sends a pick instead of typing while the clarifier is open', () => {
    tui.askMode = true;
    tui.askList = ['Infosys Ltd', 'Infosys BPM'];
    tui.askIdx = 1;
    handleKeypress(null, { name: 'return' });
    expect(submitQuery).toHaveBeenCalledWith('/pick 2');
    expect(tui.queryInput).toBe('');
  });

  it('routes characters to the secret field, not the command line', () => {
    tui.inputMode = true;
    tui.inputValue = '';
    type('abc');
    expect(tui.inputValue).toBe('abc');
    expect(tui.queryInput).toBe('');
  });
});

describe('arrow keys move between tabs inside a world', () => {
  it('steps forward and back when the line is empty', () => {
    tui.scope = { ticker: 'RELIANCE', detail: 'NSE:RELIANCE · OVERVIEW' };
    handleKeypress(null, { name: 'right' });
    expect(submitQuery).toHaveBeenCalledWith('/tab next');
    handleKeypress(null, { name: 'left' });
    expect(submitQuery).toHaveBeenCalledWith('/tab prev');
  });

  it('leaves history alone — up and down still recall questions', () => {
    tui.scope = { ticker: 'RELIANCE', detail: 'NSE:RELIANCE' };
    tui.queryHistory = ['first'];
    handleKeypress(null, { name: 'up' });
    expect(tui.queryInput).toBe('first');
  });

  it('does nothing outside a world', () => {
    tui.scope = null;
    handleKeypress(null, { name: 'right' });
    expect(submitQuery).not.toHaveBeenCalled();
  });

  it('never steals an arrow from a half-typed question', () => {
    tui.scope = { ticker: 'RELIANCE', detail: 'NSE:RELIANCE' };
    tui.queryInput = 'why did';
    handleKeypress(null, { name: 'right' });
    expect(submitQuery).not.toHaveBeenCalled();
  });
});
