/**
 * state.js — Shared constants and module-level state for the TUI.
 *
 * All mutable state lives here so that splash, render, scroll, and io
 * modules can read/write the same values without circular imports.
 */

import { createRequire } from 'module';
import { REPORTS_DIR } from '../config/paths.js';

// __PKG_VERSION__ is replaced by esbuild at bundle time (scripts/build.js define).
// When running from source (tests), fall back to reading package.json.
const _require = createRequire(import.meta.url);
function _resolveVersion() {
  if (typeof __PKG_VERSION__ !== 'undefined') return __PKG_VERSION__;
  try { return _require('../package.json').version; } catch { return '0.0.0'; }
}
const PKG_VERSION = 'v' + _resolveVersion();

// ── ANSI constants ──────────────────────────────────────────────────────────

export const BRAND  = '\x1b[38;2;192;255;0m';
export const LABEL  = '\x1b[38;2;55;78;255m';    // #374EFF blue (brand)
export const BOLD   = '\x1b[1m';
export const DIM    = '\x1b[2m';
export const RESET  = '\x1b[0m';

// Lime gradient marks (matches header engine coloring)
export const LIME_D = '\x1b[38;2;61;122;0m';   // #3D7A00 dark lime
export const LIME_M = '\x1b[38;2;127;191;0m';  // #7FBF00 mid lime

export const VERSION = { current: PKG_VERSION };

// ── Paths ───────────────────────────────────────────────────────────────────

export { REPORTS_DIR };

// ── Panel name set (for block type resolution) ──────────────────────────────

export const PANEL_NAMES_SET = new Set([
  'quote','chart','rsi','technical','analyst','macro','news','verdict',
  'gauge','gauges','insiders','earnings','holders','filings',
  'heatmap','candlestick','waterfall','correlationMatrix','treeMap','flowSankey',
]);

// ── Mutable TUI state ───────────────────────────────────────────────────────
// Shared across modules. Mutated directly (module-level singletons).

export const tui = {
  // Scroll
  scrollOffset: 0,
  lastContent: '',

  // Render meta (from payload.meta)
  renderMeta: { model: null, tools: null, cost: null, as_of: null },

  // Last blocks (for save)
  lastBlocks: null,

  // Load overlay
  loadMode: false,
  loadList: [],
  loadIdx: 0,

  // Clarification overlay — the runtime asking the user a question
  askMode: false,
  askPrompt: '',
  askHint: '',
  askList: [],
  askIdx: 0,
  askStep: null,

  // Onboarding text input
  inputMode: false,
  inputPrompt: '',
  inputHint: '',
  inputValue: '',
  inputSecret: false,
  inputStep: null,

  // Model picker overlay
  modelMode: false,
  modelList: [],
  modelIdx: 0,
  modelCurrent: null,

  // Agent→TUI state protocol (#15)
  agentState: null,

  // Focus state (#3 TUI Controls)
  focusedPanel: null,   // panel name currently focused (null = none)
  panelIds: [],         // ordered list of panel names in current render

  // Help overlay
  helpVisible: false,

  // Runtime query prompt
  queryInput: null,
};

// ── Block type resolver ─────────────────────────────────────────────────────

/**
 * Identify a block's type/id for patch merging.
 */
export function getBlockType(block) {
  if (!block || typeof block !== 'object') return null;
  if (block.id) return block.id;
  if (block.panel) return block.panel;
  if (block.text != null) return 'text';
  if (block.divider != null) return 'divider';
  if (block.spacer != null) return 'spacer';
  if (Array.isArray(block.row)) return 'row';
  if (Array.isArray(block.stack)) return 'stack';
  for (const name of PANEL_NAMES_SET) if (block[name] != null) return name;
  return null;
}

// Generic block types that can appear multiple times — assigned positional keys
// during patch merge so that row-0 ≠ row-1.
const POSITIONAL_TYPES = new Set(['row', 'stack', 'text', 'divider', 'spacer']);

/**
 * Build per-block positional patch keys for an array of blocks.
 *
 * Blocks with explicit `id` or named panels return their type string unchanged.
 * Generic types (row, stack, text, divider, spacer) get "type-N" where N is
 * their 0-based occurrence index within `blocks`.
 *
 * @param {Array} blocks
 * @returns {Array<string|null>} parallel key array
 */
export function buildPatchKeys(blocks) {
  const counts = {};
  return blocks.map(b => {
    const type = getBlockType(b);
    if (type == null) return null;
    if (!POSITIONAL_TYPES.has(type)) return type;
    const n = counts[type] ?? 0;
    counts[type] = n + 1;
    return `${type}-${n}`;
  });
}

/**
 * Merge incoming patch blocks into a base blocks array.
 *
 * Uses positional keys so that multiple row/stack/text blocks are matched
 * by position rather than all colliding on the same generic type string.
 *
 * @param {Array} base   — existing blocks array (will be mutated in-place)
 * @param {Array} incoming — blocks from the patch payload
 * @returns {Array} mutated base
 */
export function applyPatch(base, incoming) {
  const baseKeys = buildPatchKeys(base);
  const incomingKeys = buildPatchKeys(incoming);

  for (let i = 0; i < incoming.length; i++) {
    const key = incomingKeys[i];
    const idx = key != null ? baseKeys.indexOf(key) : -1;
    if (idx >= 0) {
      base[idx] = incoming[i];
      baseKeys[idx] = key;
    } else {
      base.push(incoming[i]);
      baseKeys.push(key);
    }
  }
  return base;
}
