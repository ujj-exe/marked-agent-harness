/**
 * debugLog.js — Opt-in debug file logger for schema warnings, connection
 * events, render events, and state transitions.
 *
 * Only active when ~/.marked/config.json contains `debug_log: true`.
 * Writes timestamped entries to ~/.marked/debug.log.
 * Auto-rotates (truncates) if the log file exceeds 1 MB.
 */

import fs from 'fs';
import path from 'path';
import { MARKED_HOME, CONFIG_PATH } from '../config/paths.js';

const CONFIG_DIR = MARKED_HOME;
const CONFIG_FILE = CONFIG_PATH;
const LOG_FILE = path.join(CONFIG_DIR, 'debug.log');
const MAX_LOG_BYTES = 1_048_576; // 1 MB

// ── Config read (cached per process) ────────────────────────────────────────

let _enabled = null; // null = not yet checked

/**
 * Read config.yaml once and cache whether debug_log is true.
 * Uses a simple line scan — no YAML parser dependency required.
 * Returns boolean.
 */
function isDebugEnabled() {
  if (_enabled !== null) return _enabled;
  try {
    const text = fs.readFileSync(CONFIG_FILE, 'utf8');
    const config = JSON.parse(text);
    _enabled = config.debug_log === true || config.debugLog === true;
  } catch {
    _enabled = false;
  }
  return _enabled;
}

// ── Log writer ───────────────────────────────────────────────────────────────

/**
 * Write a timestamped line to ~/.marked/debug.log.
 * Truncates the file first if it exceeds 1 MB (rotation by reset).
 * Silently swallows all I/O errors.
 *
 * @param {string} message
 */
function writeLog(message) {
  try {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });

    // Rotate: truncate if too large
    try {
      const stat = fs.statSync(LOG_FILE);
      if (stat.size > MAX_LOG_BYTES) {
        fs.writeFileSync(LOG_FILE, '', { flag: 'w' });
      }
    } catch {
      // File doesn't exist yet — that's fine
    }

    const ts = new Date().toISOString();
    fs.appendFileSync(LOG_FILE, `[${ts}] ${message}\n`);
  } catch {
    // Never throw from a debug logger
  }
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Log a schema coercion event.
 * No-op when debug_log is not enabled.
 *
 * @param {string} panel   - Panel name (e.g. 'quote')
 * @param {string} field   - Field that was coerced
 * @param {string} from    - Original type or value description
 * @param {string} to      - Result type or value description
 */
export function logSchemaCoercion(panel, field, from, to) {
  if (!isDebugEnabled()) return;
  writeLog(`[schema:coerce] ${panel}.${field}: ${from} → ${to}`);
}

/**
 * Log a missing required field that caused a hard reject.
 * No-op when debug_log is not enabled.
 *
 * @param {string} panel   - Panel name
 * @param {string} field   - Missing required field
 */
export function logSchemaMissing(panel, field) {
  if (!isDebugEnabled()) return;
  writeLog(`[schema:missing] ${panel}.${field}: required field absent — rejected`);
}

/**
 * Log soft warn-gate warnings (fields present but invalid).
 * No-op when debug_log is not enabled.
 *
 * @param {string} panel      - Panel name
 * @param {string[]} warnings - Warning messages from warn gate
 */
export function logSchemaWarnings(panel, warnings) {
  if (!isDebugEnabled()) return;
  for (const w of warnings) {
    writeLog(`[schema:warn] ${panel}: ${w}`);
  }
}

// ── Connection events ────────────────────────────────────────────────────────

/**
 * Log an agent connection event.
 * No-op when debug_log is not enabled.
 *
 * @param {string} agent  - Agent identifier
 * @param {string} model  - Model identifier (may be null)
 */
export function logConnection(agent, model) {
  if (!isDebugEnabled()) return;
  writeLog(`[session:connect] agent=${agent} model=${model}`);
}

/**
 * Log an agent disconnect event.
 * No-op when debug_log is not enabled.
 *
 * @param {string} agent  - Agent identifier
 */
export function logDisconnect(agent) {
  if (!isDebugEnabled()) return;
  writeLog(`[session:disconnect] agent=${agent}`);
}

// ── Render events ────────────────────────────────────────────────────────────

/**
 * Log a successful render.
 * No-op when debug_log is not enabled.
 *
 * @param {string}  skill       - Skill name (e.g. 'analyst')
 * @param {number}  blocksCount - Number of blocks rendered
 * @param {boolean} patch       - Whether this was a patch render
 * @param {string}  stage       - Agent stage at time of render
 */
export function logRender(skill, blocksCount, patch, stage) {
  if (!isDebugEnabled()) return;
  writeLog(`[render] skill=${skill} blocks=${blocksCount} patch=${patch} stage=${stage}`);
}

/**
 * Log a render error (HTTP 400 / 403 / 413).
 * No-op when debug_log is not enabled.
 *
 * @param {number} status   - HTTP status code
 * @param {string} message  - Error message
 */
export function logRenderError(status, message) {
  if (!isDebugEnabled()) return;
  writeLog(`[render:error] status=${status} ${message}`);
}

// ── State transitions ────────────────────────────────────────────────────────

/**
 * Log a stage transition on the Marked runtime→TUI state protocol.
 * No-op when debug_log is not enabled.
 *
 * @param {string} from  - Previous stage (may be undefined/null)
 * @param {string} to    - Incoming stage
 * @param {string} skill - Skill that triggered the transition
 */
export function logStateTransition(from, to, skill) {
  if (!isDebugEnabled()) return;
  writeLog(`[state] ${from} → ${to} (${skill})`);
}

// ── Test helper ──────────────────────────────────────────────────────────────

/**
 * Reset the cached enabled state (for tests that mock the config file).
 * Not exported in production use — only called from tests.
 */
export function _resetCache() {
  _enabled = null;
}
