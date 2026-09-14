/**
 * Tests for terminal/debugLog.js — new connection, render, and state functions.
 *
 * Covers:
 *  - logConnection: writes [session:connect] when enabled, no-op when disabled
 *  - logDisconnect: writes [session:disconnect] when enabled, no-op when disabled
 *  - logRender: writes [render] when enabled, no-op when disabled
 *  - logRenderError: writes [render:error] when enabled, no-op when disabled
 *  - logStateTransition: writes [state] when enabled, no-op when disabled
 *  - _resetCache: clears the cached enabled state between tests
 *
 * Each test uses a temp directory to isolate file I/O from ~/.marked.
 * We mock the CONFIG_DIR-related paths by pointing the module's fs reads at
 * a temp config via module-level vi.mock on 'fs', using spies on the sync methods.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';

// ── Temp dir helpers ──────────────────────────────────────────────────────────

let tmpDir;
let tmpConfig;
let tmpLog;

function setupTmpDir() {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'marked-debuglog-test-'));
  tmpConfig = path.join(tmpDir, 'config.json');
  tmpLog = path.join(tmpDir, 'debug.log');
}

function teardownTmpDir() {
  fs.rmSync(tmpDir, { recursive: true, force: true });
}

// ── Module under test ─────────────────────────────────────────────────────────
//
// debugLog.js hard-codes CONFIG_DIR/LOG_FILE using the Marked home path.
// We can't easily change those paths, but we CAN spy on fs.readFileSync /
// fs.appendFileSync / fs.mkdirSync / fs.statSync to intercept all I/O and
// redirect it to our temp files.
//
// The module caches the enabled state in a module-level `_enabled` variable.
// _resetCache() sets it back to null so the next call re-reads the mocked config.

import {
  logConnection,
  logDisconnect,
  logRender,
  logRenderError,
  logStateTransition,
  _resetCache,
} from './debugLog.js';

// ── Spy setup ─────────────────────────────────────────────────────────────────
//
// We spy on the real `fs` module methods used by debugLog.js.
// Each test group configures the spies to simulate enabled/disabled states.

const REAL_readFileSync  = fs.readFileSync.bind(fs);
const REAL_appendFileSync = fs.appendFileSync.bind(fs);
const REAL_mkdirSync     = fs.mkdirSync.bind(fs);
const REAL_statSync      = fs.statSync.bind(fs);
const REAL_writeFileSync = fs.writeFileSync.bind(fs);

// ── Helper: read the test log file ───────────────────────────────────────────

function readLog() {
  try {
    return fs.readFileSync(tmpLog, 'utf8');
  } catch {
    return '';
  }
}

// ── Shared beforeEach / afterEach ─────────────────────────────────────────────

beforeEach(() => {
  setupTmpDir();
  _resetCache(); // ensure config is re-read for every test
  vi.restoreAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
  teardownTmpDir();
});

// ── Helpers that wire up spies for enabled / disabled states ─────────────────

function enableDebugLog() {
  // Write `debug_log: true` to our temp config
  REAL_writeFileSync(tmpConfig, '{"debug_log":true}\n');

  // readFileSync: return our temp config content when called for config path
  vi.spyOn(fs, 'readFileSync').mockImplementation((filePath, encoding) => {
    if (typeof filePath === 'string' && filePath.endsWith('config.json')) {
      return REAL_readFileSync(tmpConfig, encoding);
    }
    return REAL_readFileSync(filePath, encoding);
  });

  // mkdirSync: allow (needed for CONFIG_DIR creation)
  vi.spyOn(fs, 'mkdirSync').mockImplementation((dir, opts) => {
    // redirect to our tmpDir if it's the ~/.marked dir
    return REAL_mkdirSync(tmpDir, opts);
  });

  // statSync: no existing log file (so no rotation needed)
  vi.spyOn(fs, 'statSync').mockImplementation((filePath) => {
    if (typeof filePath === 'string' && filePath.endsWith('debug.log')) {
      return REAL_statSync(tmpLog);
    }
    return REAL_statSync(filePath);
  });

  // appendFileSync: redirect writes to our tmpLog
  vi.spyOn(fs, 'appendFileSync').mockImplementation((filePath, data) => {
    if (typeof filePath === 'string' && filePath.endsWith('debug.log')) {
      return REAL_appendFileSync(tmpLog, data);
    }
    return REAL_appendFileSync(filePath, data);
  });
}

function disableDebugLog() {
  // Write `debug_log: false` to our temp config
  REAL_writeFileSync(tmpConfig, '{"debug_log":false}\n');

  vi.spyOn(fs, 'readFileSync').mockImplementation((filePath, encoding) => {
    if (typeof filePath === 'string' && filePath.endsWith('config.json')) {
      return REAL_readFileSync(tmpConfig, encoding);
    }
    return REAL_readFileSync(filePath, encoding);
  });

  // appendFileSync should NOT be called; spy to detect any calls
  vi.spyOn(fs, 'appendFileSync');
}

function missingConfig() {
  // Simulate config file not existing
  vi.spyOn(fs, 'readFileSync').mockImplementation((filePath, encoding) => {
    if (typeof filePath === 'string' && filePath.endsWith('config.json')) {
      throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
    }
    return REAL_readFileSync(filePath, encoding);
  });

  vi.spyOn(fs, 'appendFileSync');
}

// ── _resetCache ───────────────────────────────────────────────────────────────

describe('_resetCache', () => {
  it('forces re-read of config on next log call', () => {
    // First: disabled
    disableDebugLog();
    logConnection('agent-1', 'model-a');
    expect(fs.appendFileSync).not.toHaveBeenCalled();

    // Reset cache and switch to enabled
    _resetCache();
    vi.restoreAllMocks();
    enableDebugLog();

    logConnection('agent-1', 'model-a');

    const log = readLog();
    expect(log).toContain('[session:connect]');
  });
});

// ── logConnection ─────────────────────────────────────────────────────────────

describe('logConnection — debug_log: true', () => {
  it('writes a [session:connect] line to the log', () => {
    enableDebugLog();
    logConnection('my-agent', 'gpt-4o');

    const log = readLog();
    expect(log).toContain('[session:connect]');
    expect(log).toContain('agent=my-agent');
    expect(log).toContain('model=gpt-4o');
  });

  it('line includes ISO timestamp', () => {
    enableDebugLog();
    logConnection('agent-x', 'model-y');

    const log = readLog();
    // Timestamp format: [2026-03-24T...]
    expect(log).toMatch(/\[\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });

  it('works when model is null', () => {
    enableDebugLog();
    logConnection('agent-null-model', null);

    const log = readLog();
    expect(log).toContain('[session:connect]');
    expect(log).toContain('agent=agent-null-model');
    expect(log).toContain('model=null');
  });
});

describe('logConnection — debug_log: false', () => {
  it('is a no-op (nothing written)', () => {
    disableDebugLog();
    logConnection('agent-1', 'model-1');
    expect(fs.appendFileSync).not.toHaveBeenCalled();
  });
});

describe('logConnection — config missing', () => {
  it('is a no-op when config file does not exist', () => {
    missingConfig();
    logConnection('agent-1', 'model-1');
    expect(fs.appendFileSync).not.toHaveBeenCalled();
  });
});

// ── logDisconnect ─────────────────────────────────────────────────────────────

describe('logDisconnect — debug_log: true', () => {
  it('writes a [session:disconnect] line to the log', () => {
    enableDebugLog();
    logDisconnect('agent-abc');

    const log = readLog();
    expect(log).toContain('[session:disconnect]');
    expect(log).toContain('agent=agent-abc');
  });

  it('each disconnect call appends a new line', () => {
    enableDebugLog();
    logDisconnect('agent-1');
    logDisconnect('agent-2');

    const log = readLog();
    const lines = log.trim().split('\n');
    expect(lines).toHaveLength(2);
    expect(lines[0]).toContain('agent=agent-1');
    expect(lines[1]).toContain('agent=agent-2');
  });
});

describe('logDisconnect — debug_log: false', () => {
  it('is a no-op (nothing written)', () => {
    disableDebugLog();
    logDisconnect('agent-1');
    expect(fs.appendFileSync).not.toHaveBeenCalled();
  });
});

describe('logDisconnect — config missing', () => {
  it('is a no-op when config file does not exist', () => {
    missingConfig();
    logDisconnect('agent-1');
    expect(fs.appendFileSync).not.toHaveBeenCalled();
  });
});

// ── logRender ────────────────────────────────────────────────────────────────

describe('logRender — debug_log: true', () => {
  it('writes a [render] line with all fields', () => {
    enableDebugLog();
    logRender('analyst', 5, false, 'complete');

    const log = readLog();
    expect(log).toContain('[render]');
    expect(log).toContain('skill=analyst');
    expect(log).toContain('blocks=5');
    expect(log).toContain('patch=false');
    expect(log).toContain('stage=complete');
  });

  it('records patch=true correctly', () => {
    enableDebugLog();
    logRender('quote', 1, true, 'loading');

    const log = readLog();
    expect(log).toContain('patch=true');
    expect(log).toContain('stage=loading');
  });

  it('records zero blocks correctly', () => {
    enableDebugLog();
    logRender('macro', 0, false, 'init');

    const log = readLog();
    expect(log).toContain('blocks=0');
  });
});

describe('logRender — debug_log: false', () => {
  it('is a no-op (nothing written)', () => {
    disableDebugLog();
    logRender('analyst', 3, false, 'complete');
    expect(fs.appendFileSync).not.toHaveBeenCalled();
  });
});

describe('logRender — config missing', () => {
  it('is a no-op when config file does not exist', () => {
    missingConfig();
    logRender('analyst', 3, false, 'complete');
    expect(fs.appendFileSync).not.toHaveBeenCalled();
  });
});

// ── logRenderError ────────────────────────────────────────────────────────────

describe('logRenderError — debug_log: true', () => {
  it('writes a [render:error] line with status and message', () => {
    enableDebugLog();
    logRenderError(400, 'Invalid payload structure');

    const log = readLog();
    expect(log).toContain('[render:error]');
    expect(log).toContain('status=400');
    expect(log).toContain('Invalid payload structure');
  });

  it('handles 403 status', () => {
    enableDebugLog();
    logRenderError(403, 'Agent not authorized');

    const log = readLog();
    expect(log).toContain('status=403');
    expect(log).toContain('Agent not authorized');
  });

  it('handles 413 status', () => {
    enableDebugLog();
    logRenderError(413, 'Payload too large');

    const log = readLog();
    expect(log).toContain('status=413');
    expect(log).toContain('Payload too large');
  });
});

describe('logRenderError — debug_log: false', () => {
  it('is a no-op (nothing written)', () => {
    disableDebugLog();
    logRenderError(400, 'some error');
    expect(fs.appendFileSync).not.toHaveBeenCalled();
  });
});

describe('logRenderError — config missing', () => {
  it('is a no-op when config file does not exist', () => {
    missingConfig();
    logRenderError(400, 'some error');
    expect(fs.appendFileSync).not.toHaveBeenCalled();
  });
});

// ── logStateTransition ────────────────────────────────────────────────────────

describe('logStateTransition — debug_log: true', () => {
  it('writes a [state] line with from, to, and skill', () => {
    enableDebugLog();
    logStateTransition('loading', 'complete', 'analyst');

    const log = readLog();
    expect(log).toContain('[state]');
    expect(log).toContain('loading');
    expect(log).toContain('→');
    expect(log).toContain('complete');
    expect(log).toContain('(analyst)');
  });

  it('handles undefined "from" stage (initial transition)', () => {
    enableDebugLog();
    logStateTransition(undefined, 'loading', 'quote');

    const log = readLog();
    expect(log).toContain('[state]');
    expect(log).toContain('undefined');
    expect(log).toContain('loading');
    expect(log).toContain('(quote)');
  });

  it('records null "from" gracefully', () => {
    enableDebugLog();
    logStateTransition(null, 'complete', 'macro');

    const log = readLog();
    expect(log).toContain('[state]');
    expect(log).toContain('null');
    expect(log).toContain('complete');
  });

  it('multiple transitions appear as separate lines', () => {
    enableDebugLog();
    logStateTransition('init', 'loading', 'pulse');
    logStateTransition('loading', 'complete', 'pulse');

    const log = readLog();
    const lines = log.trim().split('\n');
    expect(lines).toHaveLength(2);
    expect(lines[0]).toContain('init');
    expect(lines[1]).toContain('complete');
  });
});

describe('logStateTransition — debug_log: false', () => {
  it('is a no-op (nothing written)', () => {
    disableDebugLog();
    logStateTransition('loading', 'complete', 'analyst');
    expect(fs.appendFileSync).not.toHaveBeenCalled();
  });
});

describe('logStateTransition — config missing', () => {
  it('is a no-op when config file does not exist', () => {
    missingConfig();
    logStateTransition('loading', 'complete', 'analyst');
    expect(fs.appendFileSync).not.toHaveBeenCalled();
  });
});

// ── Mixed calls — connection + render + state in sequence ────────────────────

describe('mixed log calls — all enabled', () => {
  it('all five functions write in the correct order', () => {
    enableDebugLog();

    logConnection('agent-z', 'llama-3');
    logStateTransition(undefined, 'loading', 'deep-dive');
    logRender('deep-dive', 3, false, 'loading');
    logStateTransition('loading', 'complete', 'deep-dive');
    logRenderError(400, 'test error');
    logDisconnect('agent-z');

    const log = readLog();
    const lines = log.trim().split('\n');
    expect(lines).toHaveLength(6);

    expect(lines[0]).toContain('[session:connect]');
    expect(lines[1]).toContain('[state]');
    expect(lines[2]).toContain('[render]');
    expect(lines[3]).toContain('[state]');
    expect(lines[4]).toContain('[render:error]');
    expect(lines[5]).toContain('[session:disconnect]');
  });
});
