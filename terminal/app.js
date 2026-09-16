/**
 * app.js — Marked Terminal.
 *
 * Full-screen TUI with branded splash → Marked runtime-controlled research.
 * Marked runtime POSTs commands to localhost:7707/render → EventEmitter → stdout.
 *
 * Rendering strategy:
 * - Splash phase: plain timer + process.stdout.write
 * - Live phase: direct stdout write via paintScreen/paintWithScroll
 * - No React/Ink — single stdout owner eliminates ghost footer, header clobber,
 *   and spinner freeze bugs.
 *
 * Architecture:
 *   server emitter → tui state mutation → paintScreen() → stdout
 *   stdin keypress  → tui state mutation → paintWithScroll() → stdout
 *   animation timer → paintWithScroll(false) → stdout
 *
 * Module split (#10):
 *   state.js   — shared constants, mutable TUI state, block type resolver
 *   splash.js  — splash screen renderer (figlet, desk grid, pulse animation)
 *   render.js  — layout dispatch, footer, direct stdout painting
 *   scroll.js  — scroll state, mouse wheel handler
 *   io.js      — HTTP helpers, Marked API health, report save/load
 */

import fs from 'fs';
import path from 'path';
import readline from 'readline';
import { pathToFileURL } from 'node:url';
import { startServer, connectedAgent, emitter } from './server.js';
import { logStateTransition } from './debugLog.js';


// ── Module imports ──────────────────────────────────────────────────────────

import { BRAND, DIM, RESET, REPORTS_DIR, tui, getBlockType, applyPatch, applyTheme } from './state.js';
import { renderSplash, SPINNER_FRAMES } from './splash.js';
import { runLayout, buildFooter, renderLoadOverlay, renderModelOverlay, renderAskOverlay, renderInputOverlay, renderHelpOverlay, renderPromptBlock, renderSearchOverlay, focusIndicator, paintScreen, paintWithScroll, startRenderAnimation, stopRenderAnimation } from './render.js';
import { setupMouseWheel, isMouseRecent, isMouseSequenceActive } from './scroll.js';
import { healthCheck, saveReport, listReports, submitQuery } from './io.js';
import { currentModel, listModels } from '../config/models.js';

// ── Helpers ──────────────────────────────────────────────────────────────────

const getWidth  = () => process.stdout.columns ?? 80;
const getHeight = () => process.stdout.rows ?? 24;

// ── Phase state ──────────────────────────────────────────────────────────────
// These replace React's useState. They live in module scope so all handlers
// can read/write them directly.

tui.phase     = 'splash';
tui.splashMsg = 'Starting...';
tui.layout    = 'pulse';
tui.panels    = {};
tui.blocks    = null;   // null = use legacy layout+panels
tui.focused   = null;
tui.isPatch   = false;
// The command line is never closed, so this is '' when empty and never null.
tui.queryInput   = '';
tui.queryHistory = [];
tui.historyIdx   = -1;

// ── Repaint helper ───────────────────────────────────────────────────────────

function repaint() {
  if (tui.phase === 'splash') return; // splash has its own animation
  if (tui.loadMode || tui.modelMode || tui.askMode) return;
  const w = getWidth();
  const output = runLayout(tui.blocks ?? tui.layout, tui.blocks ? null : tui.panels, w, tui.focused, getHeight());
  paintScreen(output, !tui.isPatch);
  tui.isPatch = false;
}

// ── Server event handlers ────────────────────────────────────────────────────

function openAsk(ask) {
  tui.askPrompt = ask.prompt || 'Which one did you mean?';
  tui.askHint = ask.hint || '';
  tui.askList = Array.isArray(ask.choices) ? ask.choices : [];
  tui.askIdx = 0;
  tui.askStep = ask.step || null;
  tui.askMode = true;
  tui.phase = 'live';
  stopSplashAnimation();
  const overlay = renderAskOverlay(getWidth());
  showOverlay(overlay);
}

function closeAsk() {
  tui.askMode = false;
  tui.askList = [];
  tui.askStep = null;
  hideOverlay();
  paintOrSplash();
}

function openInput(input) {
  tui.inputPrompt = input.prompt || 'Enter a value';
  tui.inputHint = input.hint || '';
  tui.inputValue = '';
  tui.inputSecret = Boolean(input.secret);
  tui.inputStep = input.step || null;
  tui.inputMode = true;
  setMouseReporting(false);
  tui.phase = 'live';
  stopSplashAnimation();
  process.stdout.write('\x1b[2J\x1b[H' + renderInputOverlay(getWidth()) + '\x1b[?25h');
}

/** Wheel scrolling is worth reports; a text field is not. */
export function setMouseReporting(on) {
  process.stdout.write(on ? '\x1b[?1000h\x1b[?1006h' : '\x1b[?1006l\x1b[?1000l');
}

function closeInput() {
  setMouseReporting(true);
  tui.inputMode = false;
  tui.inputValue = '';
  tui.inputSecret = false;
  tui.inputStep = null;
  process.stdout.write('\x1b[?25l');
}

function onRender(payload) {
  if (Array.isArray(payload.liveTape)) {
    tui.liveTape = payload.liveTape;
    if (tui.phase === 'splash') {
      startSplashAnimation();
      return;
    }
  }
  if (tui.phase === 'splash') {
    process.stdout.write('\x1b[2J\x1b[H');
  }
  tui.phase = 'live';

  if (payload._state && payload._state.ask) {
    openAsk(payload._state.ask);
    return;
  }
  if (payload._state && payload._state.input) {
    openInput(payload._state.input);
    return;
  }
  if (payload._state && payload._state.search) {
    const search = payload._state.search;
    if (!tui.searchMode) openSearch(search);
    else {
      // Results for a query the user has since changed are stale; the newer
      // keystroke already has its own request in flight.
      if (search.query !== undefined && search.query !== tui.searchQuery) return;
      tui.searchResults = Array.isArray(search.results) ? search.results : [];
      tui.searchIdx = 0;
      tui.searchBusy = false;
      drawSearch();
    }
    return;
  }

  // Capture meta (model, tools, cost, as_of) for dynamic footer
  if (payload.meta && typeof payload.meta === 'object') {
    tui.renderMeta = { ...tui.renderMeta, ...payload.meta };
  }

  // Capture _state for the Marked runtime→TUI state protocol (#15)
  if (payload._state && typeof payload._state === 'object') {
    const prev = tui.agentState?.stage;
    tui.agentState = payload._state;
    // Start/stop render animation based on stage transitions (#16)
    const stage = payload._state.stage;
    if (stage !== prev) {
      logStateTransition(prev ?? 'none', stage, payload._state.skill ?? 'unknown');
    }
    if (stage === 'gathering' || stage === 'analyzing') {
      startRenderAnimation();
    } else {
      stopRenderAnimation();
      // Scroll to top when render completes
      if (stage === 'complete' && prev !== 'complete') {
        tui.scrollOffset = 0;
      }
    }
  }

  // Track if this render is a patch (for scroll preservation)
  tui.isPatch = !!payload.patch;
  tui.loadMode = false;
  tui.helpVisible = false;

  // Extract panel IDs for focus cycling (#3)
  if (Array.isArray(payload.blocks)) {
    const ids = payload.blocks
      .map(b => getBlockType(b))
      .filter(t => t && t !== 'text' && t !== 'divider' && t !== 'spacer' && t !== 'row' && t !== 'stack');
    tui.panelIds = ids;
    if (!ids.includes(tui.focusedPanel)) tui.focusedPanel = ids[0] ?? null;
  }

  // New blocks API: payload.blocks is the full render spec
  if (Array.isArray(payload.blocks)) {
    if (!payload.patch) tui.lastBlocks = payload.blocks;
    if (payload.patch) {
      const base = Array.isArray(tui.blocks) ? [...tui.blocks] : [];
      tui.blocks = applyPatch(base, payload.blocks);
    } else {
      tui.blocks = payload.blocks;
    }
    tui.layout = null;
  } else if (payload.layout) {
    if (tui.layout !== payload.layout) tui.panels = payload.panels ?? {};
    else if (payload.panels && typeof payload.panels === 'object') {
      tui.panels = { ...tui.panels, ...payload.panels };
    }
    tui.layout = payload.layout;
    tui.blocks = null;
  } else if (payload.panels && typeof payload.panels === 'object') {
    tui.panels = { ...tui.panels, ...payload.panels };
  }

  if (payload.theme) {
    applyTheme(payload.theme);
  }
  // `scope` is sent as null to clear it, so presence is what matters here.
  if ('scope' in payload) tui.scope = payload.scope || null;

  repaint();
}

function onFocus(payload) {
  tui.focused = payload?.panel ?? null;
  repaint();
}

function onLayout(payload) {
  if (payload?.layout) {
    tui.layout = payload.layout;
    repaint();
  }
}

function onClear() {
  tui.panels = {};
  repaint();
}

function onSplash(payload) {
  if (payload?.reset) {
    stopRenderAnimation();
    tui.phase = 'splash';
    tui.lastContent = '';
    tui.blocks = null;
    tui.queryInput = '';
    tui.liveTape = [];
  }
  tui.splashMsg = payload?.msg ?? '';
  if (payload?.agent) tui.agentState = { ...tui.agentState, ...payload.agent };
  // Restart splash animation to reflect new message
  if (tui.phase === 'splash') startSplashAnimation();
}

/**
 * Repaint only the command line.
 *
 * Every keystroke lands here, so it must not repaint the answer above it —
 * that is what made the old overlay flicker on every character.
 */
function drawQueryPrompt() {
  const rows = getHeight();
  const block = renderPromptBlock(getWidth(), tui.queryInput, tui.scope ?? null, rows);
  if (block.length !== tui.promptRows) return paintWithScroll(false);
  process.stdout.write(block
    .map((line, index) => `\x1b[${rows - block.length + 1 + index};1H\x1b[2K${line}`)
    .join(''));
}

function clearPrompt() {
  tui.queryInput = '';
  tui.historyIdx = -1;
  drawQueryPrompt();
}

/** Step through past questions, keeping the draft at the bottom of the stack. */
function recallHistory(delta) {
  const h = tui.queryHistory;
  if (!h.length) return;
  const next = tui.historyIdx + delta;
  if (next < 0) { tui.historyIdx = -1; tui.queryInput = ''; }
  else if (next >= h.length) return;
  else { tui.historyIdx = next; tui.queryInput = h[h.length - 1 - next]; }
  drawQueryPrompt();
}

async function sendRuntimeQuery(question) {
  // The answer already on screen stays there while the next one is fetched.
  // Blanking to splash was the old overlay's habit and it threw away the thing
  // the user was most likely reading from when they typed the follow-up.
  if (tui.lastContent) {
    tui.agentState = { ...tui.agentState, stage: 'resolving', query: question };
    paintWithScroll();
  } else {
    tui.phase = 'splash';
    tui.splashMsg = 'Sending query to Marked runtime';
    startSplashAnimation();
  }
  try {
    await submitQuery(question);
  } catch (error) {
    if (tui.lastContent) {
      tui.agentState = { ...tui.agentState, stage: 'complete' };
      paintWithScroll();
    } else {
      tui.splashMsg = `Query unavailable · ${error.message}`;
      startSplashAnimation();
    }
  }
}

/**
 * Show a modal overlay without losing the screen underneath.
 *
 * The overlay used to be written straight into `tui.lastContent`, which is the
 * buffer every repaint reads. Closing the overlay then repainted the overlay,
 * so the model picker could not be escaped — Esc redrew it. The backdrop is
 * kept here and restored on close.
 */
function showOverlay(overlay) {
  if (tui.overlayBackdrop == null) tui.overlayBackdrop = tui.lastContent;
  tui.lastContent = overlay;
  process.stdout.write('\x1b[2J\x1b[H' + overlay);
}

/** Put back whatever the overlay was covering. */
function hideOverlay() {
  if (tui.overlayBackdrop != null) {
    tui.lastContent = tui.overlayBackdrop;
    tui.overlayBackdrop = null;
  }
}

/** Every modal answers to one key, so there is always a way out. */
function closeAnyOverlay() {
  if (tui.searchMode) { closeSearch(); submitQuery('/wpick cancel').catch(() => {}); return true; }
  if (tui.modelMode) { closeModelPicker(); return true; }
  if (tui.loadMode)  { tui.loadMode = false; hideOverlay(); paintOrSplash(); return true; }
  if (tui.helpVisible) { toggleHelp(); return true; }
  if (tui.askMode)   { submitQuery('/pick cancel').catch(() => {}); closeAsk(); return true; }
  if (tui.inputMode) { closeInput(); submitQuery('/input cancel').catch(() => {}); return true; }
  return false;
}

function paintOrSplash() {
  if (tui.lastContent) return paintWithScroll();
  stopSplashAnimation();
  tui.phase = 'splash';
  startSplashAnimation();
}
// ── World search ─────────────────────────────────────────────────────────────

let _searchTimer = null;

function openSearch(payload = {}) {
  tui.searchMode = true;
  tui.searchQuery = payload.query ?? '';
  tui.searchResults = Array.isArray(payload.results) ? payload.results : [];
  tui.searchIdx = 0;
  tui.searchBusy = false;
  tui.phase = 'live';
  stopSplashAnimation();
  showOverlay(renderSearchOverlay(getWidth()));
}

function closeSearch() {
  if (_searchTimer) { clearTimeout(_searchTimer); _searchTimer = null; }
  tui.searchMode = false;
  tui.searchQuery = '';
  tui.searchResults = [];
  tui.searchBusy = false;
  hideOverlay();
  paintOrSplash();
}

function drawSearch() {
  const overlay = renderSearchOverlay(getWidth());
  tui.lastContent = overlay;
  process.stdout.write('\x1b[2J\x1b[H' + overlay);
}

/**
 * Ask the runtime for matches.
 *
 * Debounced: a lookup per keystroke would put four requests in flight for
 * "INFY" and let an older one land last.
 */
function queueSearch() {
  if (_searchTimer) clearTimeout(_searchTimer);
  tui.searchBusy = Boolean(tui.searchQuery);
  drawSearch();
  if (!tui.searchQuery) return;
  _searchTimer = setTimeout(() => {
    _searchTimer = null;
    submitQuery(`/wsearch ${tui.searchQuery}`).catch(() => {});
  }, 160);
}

function openModelPicker() {
  tui.modelCurrent = currentModel();
  tui.modelList = listModels();
  tui.modelIdx = Math.max(0, tui.modelList.findIndex(entry =>
    entry.agent === tui.modelCurrent?.agent && (entry.id ?? null) === (tui.modelCurrent?.model ?? null)));
  tui.modelMode = true;
  tui.phase = 'live';
  const overlay = renderModelOverlay(getWidth());
  showOverlay(overlay);
}

function closeModelPicker() {
  tui.modelMode = false;
  hideOverlay();
  paintOrSplash();
}

/**
 * Local commands that never reach the runtime.
 *
 * They live in the command line rather than on bare letter keys because every
 * printable character now belongs to the prompt — a bare `s` is the start of a
 * question, not a save.
 */
function runLocalCommand(text) {
  const cmd = text.toLowerCase();
  if (cmd === '/model')  { openModelPicker(); return true; }
  if (cmd === '/help')   { toggleHelp(); return true; }
  if (cmd === '/save')   { saveCurrentReport(); return true; }
  if (cmd === '/load')   { openLoadPicker(); return true; }
  if (cmd === '/reset')  { resetToSplash(); return true; }
  if (cmd === '/quit' || cmd === '/exit') { quitApp(); return true; }
  return false;
}

/** `/1`..`/9` run the numbered follow-up the action bar is offering. */
function expandFollowUp(text) {
  const match = text.match(/^\/([1-9])$/);
  if (!match) return null;
  const fu = tui.agentState?.follow_ups?.find(f => f.key === match[1]);
  return fu?.question ?? null;
}

async function sendQueryInput() {
  const question = tui.queryInput.trim();
  if (!question) return;
  tui.queryHistory.push(question);
  clearPrompt();
  if (runLocalCommand(question)) return;
  await sendRuntimeQuery(expandFollowUp(question) ?? question);
}

function onLive() {
  tui.phase = 'live';
  repaint();
}

// ── Splash animation ─────────────────────────────────────────────────────────

let _splashRevealTimer = null;
let _splashPulseTimer  = null;

function stopSplashAnimation() {
  if (_splashRevealTimer) { clearInterval(_splashRevealTimer); _splashRevealTimer = null; }
  if (_splashPulseTimer)  { clearInterval(_splashPulseTimer);  _splashPulseTimer  = null; }
}

function startSplashAnimation() {
  stopSplashAnimation();

  const width    = getWidth();
  const termRows = getHeight();
  const allLines = renderSplash(tui.splashMsg, width, 0, termRows - 1, tui.liveTape).split('\n');
  let revealCount = 0;
  let pulseFrame  = 0;

  const spinnerSet = new Set(SPINNER_FRAMES);
  const animLineIndices = allLines.reduce((acc, line, i) => {
    const stripped = line.replace(/\x1b\[[0-9;]*m/g, '');
    if (stripped.includes('▐') || [...stripped].some(c => spinnerSet.has(c))) acc.push(i);
    return acc;
  }, []);

  // Find last non-blank content line (skip bottom padding)
  let lastContentIdx = allLines.length - 1;
  while (lastContentIdx > 0 && allLines[lastContentIdx].replace(/\x1b\[[0-9;]*m/g, '').trim() === '') lastContentIdx--;
  // The spinner line is the last non-blank line — include it but skip padding above it
  const spinnerIdx = lastContentIdx;
  // Content ends at the separator before padding
  let contentEnd = spinnerIdx;
  for (let i = spinnerIdx - 1; i >= 0; i--) {
    if (allLines[i].replace(/\x1b\[[0-9;]*m/g, '').trim() !== '') { contentEnd = i + 1; break; }
  }

  _splashRevealTimer = setInterval(() => {
    if (tui.phase !== 'splash') {
      stopSplashAnimation();
      return;
    }
    revealCount++;
    if (revealCount <= contentEnd) {
      // Reveal content lines progressively, but always show spinner at fixed bottom
      process.stdout.write('\x1b[2J\x1b[H' + allLines.slice(0, revealCount).join('\n'));
      process.stdout.write(`\x1b[${spinnerIdx + 1};1H${allLines[spinnerIdx]}`);
      drawQueryPrompt();
    } else {
      // Content done — show full splash
      revealCount = allLines.length;
      process.stdout.write('\x1b[2J\x1b[H' + allLines.join('\n'));
      drawQueryPrompt();
    }
    if (revealCount >= allLines.length) {
      clearInterval(_splashRevealTimer);
      _splashRevealTimer = null;
      _splashPulseTimer = setInterval(() => {
        if (tui.phase !== 'splash') {
          stopSplashAnimation();
          return;
        }
        pulseFrame++;
        const currentWidth = getWidth();
        const currentRows  = getHeight();
        const newLines = renderSplash(tui.splashMsg, currentWidth, pulseFrame, currentRows - 1, tui.liveTape).split('\n');
        for (const i of animLineIndices) {
          if (i >= currentRows - 1) continue;
          process.stdout.write(`\x1b[${i + 1};1H\x1b[2K${newLines[i] ?? ''}`);
        }
        drawQueryPrompt();
      }, 110);
    }
  }, 16);
}

// ── Keyboard input ────────────────────────────────────────────────────────────

// ── Actions ───────────────────────────────────────────────────────────────────
// Extracted from the key dispatch: each is now reachable from a slash command
// as well as a control key, because bare letters belong to the prompt.

function toggleHelp() {
  tui.helpVisible = !tui.helpVisible;
  if (tui.helpVisible) {
    stopSplashAnimation();
    process.stdout.write('\x1b[2J\x1b[H' + renderHelpOverlay(getWidth()));
    drawQueryPrompt();
  } else if (tui.phase === 'splash') {
    startSplashAnimation();
  } else {
    paintWithScroll();
  }
}

function saveCurrentReport() {
  const filename = saveReport();
  if (!filename) return;
  const w = getWidth();
  const savedFooter = buildFooter(w);
  const confirmFooter = `  ${BRAND}✓${RESET} ${DIM}Saved: ${filename}${RESET}`;
  tui.lastContent = tui.lastContent.replace(savedFooter, confirmFooter);
  paintWithScroll();
  setTimeout(() => {
    tui.lastContent = tui.lastContent.replace(confirmFooter, savedFooter);
    paintWithScroll();
  }, 2000);
}

function openLoadPicker() {
  tui.loadList = listReports();
  if (tui.loadList.length === 0) return;
  tui.loadIdx = 0;
  tui.loadMode = true;
  tui.phase = 'live';
  const overlay = renderLoadOverlay(getWidth());
  showOverlay(overlay);
}

/** Visual reset only — the runtime stays connected. */
function resetToSplash() {
  stopRenderAnimation();
  tui.lastContent = '';
  const connectedAgent = tui.agentState?.agent;
  const connectedModel = tui.agentState?.model;
  tui.agentState = connectedAgent ? { agent: connectedAgent, model: connectedModel } : null;
  tui.renderMeta = { model: null, tools: null, cost: null, as_of: null };
  tui.blocks = null;
  tui.phase = 'splash';
  const hint = tui.lastBlocks ? '/restore · /load' : '/load';
  const connLabel = connectedAgent
    ? `Connected · ${connectedModel ? `${connectedAgent} · ${connectedModel}` : connectedAgent}`
    : 'Waiting for agent';
  tui.splashMsg = `${connLabel} · ${hint}`;
  startSplashAnimation();
}

function quitApp() {
  process.stdout.write('\x1b[?1049l\x1b[?25h\x1b[?1000l\x1b[?1006l');
  process.exit(0);
}

function isRunning() {
  const stage = tui.agentState?.stage;
  return stage === 'resolving' || stage === 'gathering' || stage === 'analyzing';
}

// ── Keyboard input ────────────────────────────────────────────────────────────
//
// Order matters. Modal overlays claim keys first; then the control keys; then
// everything printable falls through to the command line, which is always open.

export function handleKeypress(ch, key) {
  if (!key) key = {};

  // A click is not a keystroke. Without this the coordinates in the mouse
  // report are typed into the command line.
  if (isMouseSequenceActive()) return;

  // ── Ctrl-C: abandon the run, else clear the line. Never exits. ──
  if (key.ctrl && key.name === 'c') {
    // Get out of whatever is covering the screen first. A user reaching for
    // Ctrl-C inside a picker wants the picker gone, not the query abandoned.
    if (closeAnyOverlay()) return;
    if (isRunning()) {
      submitQuery('/cancel').catch(() => {});
      return;
    }
    if (tui.queryInput) return clearPrompt();
    return;
  }

  // ── Ctrl-D: exit, and only from an empty line ──
  if (key.ctrl && key.name === 'd') {
    if (!tui.queryInput) quitApp();
    return;
  }

  // ── Modal overlays keep priority ──────────────────────────────────
  if (tui.inputMode) {
    if (key.name === 'escape') {
      closeInput();
      submitQuery('/input cancel').catch(() => {});
      return;
    }
    if (key.name === 'return') {
      const encoded = Buffer.from(tui.inputValue, 'utf8').toString('base64url');
      closeInput();
      submitQuery(`/input ${encoded}`).catch(() => {});
      return;
    }
    if (key.name === 'backspace') tui.inputValue = tui.inputValue.slice(0, -1);
    else if (typeof ch === 'string' && ch.length === 1 && !key.ctrl && !key.meta) tui.inputValue += ch;
    else return;
    process.stdout.write('\x1b[2J\x1b[H' + renderInputOverlay(getWidth()) + '\x1b[?25h');
    return;
  }

  if (tui.searchMode) {
    if (key.name === 'escape') {
      closeSearch();
      submitQuery('/wpick cancel').catch(() => {});
      return;
    }
    if (key.name === 'up')   { tui.searchIdx = Math.max(0, tui.searchIdx - 1); return drawSearch(); }
    if (key.name === 'down') { tui.searchIdx = Math.min(tui.searchResults.length - 1, tui.searchIdx + 1); return drawSearch(); }
    if (key.name === 'return') {
      if (!tui.searchResults.length) return;
      const chosen = tui.searchIdx;
      closeSearch();
      submitQuery(`/wpick ${chosen + 1}`).catch(() => {});
      return;
    }
    if (key.name === 'backspace') { tui.searchQuery = tui.searchQuery.slice(0, -1); return queueSearch(); }
    if (typeof ch === 'string' && ch.length === 1 && !key.ctrl && !key.meta) {
      tui.searchQuery += ch;
      return queueSearch();
    }
    return;
  }

  if (tui.askMode) {
    if (key.name === 'escape') {
      submitQuery('/pick cancel').catch(() => {});
      closeAsk();
    } else if (key.name === 'up') {
      tui.askIdx = Math.max(0, tui.askIdx - 1);
      process.stdout.write('\x1b[2J\x1b[H' + renderAskOverlay(getWidth()));
    } else if (key.name === 'down') {
      tui.askIdx = Math.min(tui.askList.length - 1, tui.askIdx + 1);
      process.stdout.write('\x1b[2J\x1b[H' + renderAskOverlay(getWidth()));
    } else if (key.name === 'return' && tui.askList.length > 0) {
      const chosen = tui.askIdx;
      closeAsk();
      submitQuery(`/pick ${chosen + 1}`).catch(() => {});
    }
    return;
  }

  if (tui.modelMode) {
    if (key.name === 'escape') {
      closeModelPicker();
    } else if (key.name === 'up') {
      tui.modelIdx = Math.max(0, tui.modelIdx - 1);
      process.stdout.write('\x1b[2J\x1b[H' + renderModelOverlay(getWidth()));
    } else if (key.name === 'down') {
      tui.modelIdx = Math.min(tui.modelList.length - 1, tui.modelIdx + 1);
      process.stdout.write('\x1b[2J\x1b[H' + renderModelOverlay(getWidth()));
    } else if (key.name === 'return' && tui.modelList.length > 0) {
      const choice = tui.modelList[tui.modelIdx];
      tui.modelCurrent = { agent: choice.agent, model: choice.id ?? null };
      submitQuery(`/model ${choice.agent}:${choice.id ?? 'default'}`).catch(() => {});
      closeModelPicker();
    }
    return;
  }

  if (tui.loadMode) {
    if (key.name === 'escape') {
      tui.loadMode = false;
      hideOverlay();
      paintOrSplash();
    } else if (key.name === 'up') {
      tui.loadIdx = Math.max(0, tui.loadIdx - 1);
      process.stdout.write('\x1b[2J\x1b[H' + renderLoadOverlay(getWidth()));
    } else if (key.name === 'down') {
      tui.loadIdx = Math.min(tui.loadList.length - 1, tui.loadIdx + 1);
      process.stdout.write('\x1b[2J\x1b[H' + renderLoadOverlay(getWidth()));
    } else if (key.name === 'return' && tui.loadList.length > 0) {
      try {
        const file = path.join(REPORTS_DIR, tui.loadList[tui.loadIdx]);
        const saved = JSON.parse(fs.readFileSync(file, 'utf8'));
        tui.loadMode = false;
        hideOverlay();
        if (saved.meta) tui.renderMeta = { ...tui.renderMeta, ...saved.meta };
        if (Array.isArray(saved.blocks)) {
          tui.lastBlocks = saved.blocks;
          tui.blocks = saved.blocks;
          repaint();
        }
      } catch { tui.loadMode = false; hideOverlay(); paintOrSplash(); }
    }
    return;
  }

  if (tui.helpVisible) {
    if (key.name === 'escape' || (key.ctrl && key.name === 'g')) return toggleHelp();
    return;
  }

  // ── Control keys ──────────────────────────────────────────────────
  if (key.ctrl && key.name === 'g') return toggleHelp();
  if (key.ctrl && key.name === 's') return saveCurrentReport();
  if (key.ctrl && key.name === 'o') return openLoadPicker();
  if (key.ctrl && key.name === 'u') return clearPrompt();

  // ── Command line ──────────────────────────────────────────────────
  // Left and right move between tabs while a world is open and the line is
  // empty. They do nothing else here — the field has no cursor to move — so
  // this costs the prompt nothing.
  if ((key.name === 'left' || key.name === 'right') && tui.scope?.ticker && !tui.queryInput) {
    submitQuery(`/tab ${key.name === 'right' ? 'next' : 'prev'}`).catch(() => {});
    return;
  }
  if (key.name === 'return') return void sendQueryInput();
  if (key.name === 'up')     return recallHistory(1);
  if (key.name === 'down')   return recallHistory(-1);
  if (key.name === 'backspace') {
    tui.queryInput = tui.queryInput.slice(0, -1);
    return drawQueryPrompt();
  }
  if (typeof ch === 'string' && ch.length === 1 && !key.ctrl && !key.meta) {
    tui.queryInput += ch;
    return drawQueryPrompt();
  }

  // ── Everything below reads the answer, and needs one to read ──────
  if (tui.phase === 'splash' || !tui.lastContent) return;

  if (key.name === 'tab' && tui.panelIds.length > 0) {
    const ids = tui.panelIds;
    const cur = ids.indexOf(tui.focusedPanel);
    tui.focusedPanel = key.shift
      ? ids[(cur - 1 + ids.length) % ids.length]
      : ids[(cur + 1) % ids.length];
    return paintWithScroll();
  }

  // Scrolling moved off j/k and the bare arrows: those are typing and history
  // now. The wheel, the page keys and Ctrl-arrows remain.
  const pageSize = Math.max(1, getHeight() - 2);
  let changed = false;
  if (key.ctrl && key.name === 'up')        { tui.scrollOffset = Math.max(0, tui.scrollOffset - 1); changed = true; }
  else if (key.ctrl && key.name === 'down') { tui.scrollOffset += 1; changed = true; }
  else if (key.name === 'pageup'   || key.sequence === '\x1b[5~') { tui.scrollOffset = Math.max(0, tui.scrollOffset - pageSize); changed = true; }
  else if (key.name === 'pagedown' || key.sequence === '\x1b[6~') { tui.scrollOffset += pageSize; changed = true; }
  else if (key.name === 'home') { tui.scrollOffset = 0; changed = true; }
  else if (key.name === 'end')  { tui.scrollOffset = Infinity; changed = true; }

  if (changed) paintWithScroll();
}

function setupKeyboard() {
  readline.emitKeypressEvents(process.stdin);
  if (process.stdin.isTTY) process.stdin.setRawMode(true);
  process.stdin.resume();
  process.stdin.on('keypress', (ch, key) => {
    handleKeypress(ch, key);
  });
}

// ── Resize handling ──────────────────────────────────────────────────────────

function setupResize() {
  process.stdout.on('resize', () => {
    if (tui.phase === 'splash') {
      // Restart splash animation with new dimensions
      startSplashAnimation();
    } else {
      repaint();
    }
  });
}

// ── Entry point ──────────────────────────────────────────────────────────────

async function main() {
  try {
    const { port } = await startServer();
    // Printed above the alt screen, this line survives as a stray row across
    // the UI. It is a debugging aid, not part of the terminal.
    if (process.env.MARKED_DEBUG) process.stderr.write(`Marked Terminal on port ${port}\n`);
  } catch (err) {
    process.stderr.write(`Failed to start: ${err.message}\n`);
    process.exit(1);
  }

  // Enter alt screen
  process.stdout.write('\x1b[?1049h\x1b[2J\x1b[3J\x1b[H\x1b[?25l\x1b[?1000h\x1b[?1006h');

  const restoreScreen = () => {
    process.stdout.write('\x1b[?1006l\x1b[?1000l\x1b[?25h\x1b[?1049l');
  };
  process.on('exit', restoreScreen);
  process.on('SIGINT', () => { restoreScreen(); process.exit(0); });
  process.on('SIGTERM', () => { restoreScreen(); process.exit(0); });
  process.on('uncaughtException', (err) => {
    restoreScreen();
    process.stderr.write(`\nUncaught: ${err.message}\n${err.stack}\n`);
    process.exit(1);
  });
  process.on('unhandledRejection', (err) => {
    restoreScreen();
    process.stderr.write(`\nUnhandled rejection: ${err}\n`);
    process.exit(1);
  });

  // Setup mouse BEFORE keyboard — scroll.js data handler must fire before
  // readline's keypress emitter so isMouseRecent() is set when digits arrive
  setupMouseWheel();
  setupKeyboard();
  setupResize();

  // Subscribe to server events
  emitter.on('render', onRender);
  emitter.on('focus', onFocus);
  emitter.on('layout', onLayout);
  emitter.on('clear', onClear);
  emitter.on('_splash', onSplash);
  emitter.on('_live', onLive);

  // The server answers /connect before this point, so a runtime that attaches
  // during startup emits into an empty bus and the UI never learns it is
  // connected. Reconcile once, now that the listeners exist.
  const attached = connectedAgent();
  if (attached) {
    onSplash({
      msg: `Connected · ${attached.model ? `${attached.agent} · ${attached.model}` : attached.agent}`,
      agent: attached,
    });
  }

  // Start splash
  startSplashAnimation();

  // Non-blocking health check
  healthCheck().catch(() => {});

  // Keep alive — process stays running via stdin (raw mode) + HTTP server
}

// Only boot when run as the entry point. The runtime spawns this file directly
// (`node terminal/app.js`), so this is true in production; importing it from a
// test gets the exported handlers without taking over the terminal.
const isEntryPoint = Boolean(process.argv[1]) &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (isEntryPoint) {
  main().catch(err => {
    process.stderr.write(`Fatal: ${err.message}\n${err.stack}\n`);
    process.exit(1);
  });
}
