/**
 * state.js — Shared constants and module-level state for the TUI.
 *
 * All mutable state lives here so that splash, render, scroll, and io
 * modules can read/write the same values without circular imports.
 */

import { createRequire } from 'module';
import { REPORTS_DIR } from '../config/paths.js';
import { fg, palette, setTheme, shade } from '../src/index.js';

// __PKG_VERSION__ is replaced by esbuild at bundle time (scripts/build.js define).
// When running from source (tests), fall back to reading package.json.
const _require = createRequire(import.meta.url);
function _resolveVersion() {
  if (typeof __PKG_VERSION__ !== 'undefined') return __PKG_VERSION__;
  try { return _require('../package.json').version; } catch { return '0.0.0'; }
}
const PKG_VERSION = 'v' + _resolveVersion();

// ── ANSI constants ──────────────────────────────────────────────────────────
//
// These are `let`, not `const`, so `applyTheme()` can rewrite them. ES module
// live bindings mean every importer sees the new value without re-importing,
// which is why switching themes recolours the brand mark, splash and focus
// ring without touching their call sites.

export let BRAND  = '';
export let LABEL  = '';
export const BOLD   = '\x1b[1m';
export const DIM    = '\x1b[2m';
export const RESET  = '\x1b[0m';

// Gradient marks for the brand glyph, derived from the accent rather than
// hand-picked, so a non-lime theme does not draw a lime logo.
export let LIME_D = '';
export let LIME_M = '';

/** Recompute the themed ANSI constants from the active palette. */
export function refreshBrand() {
  const accent = palette('accent') || '#ffffff';
  BRAND  = fg(accent);
  LABEL  = fg(palette('label') || accent);
  LIME_D = fg(shade(accent, 0.38));
  LIME_M = fg(shade(accent, 0.68));
}

/** Set the active theme and recolour everything derived from it. */
export function applyTheme(name) {
  setTheme(name);
  refreshBrand();
}

refreshBrand();

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
  liveTape: [],

  // Focus state (#3 TUI Controls)
  focusedPanel: null,   // panel name currently focused (null = none)
  panelIds: [],         // ordered list of panel names in current render

  // Help overlay
  helpVisible: false,

  // Runtime query prompt
  queryInput: '',
  promptRows: 3,
  overlayBackdrop: null,
  // What the next question is about — the open Company World, when there is
  // one. Shown on the command line's rule so the scope is never a guess.
  scope: null,

  // World search: live results as the user types.
  searchMode: false,
  searchQuery: '',
  searchResults: [],
  searchIdx: 0,
  searchBusy: false,
  queryHistory: [],
  historyIdx: -1,
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
