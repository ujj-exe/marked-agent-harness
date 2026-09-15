/**
 * world-state.js — where each company was left.
 *
 * Reopening a company should put you back where you were: the tab you were
 * reading and the measure you were charting. Only that is stored — never the
 * packet. Retrieved facts go stale and a restored world must fetch fresh data;
 * remembering a number from last week and presenting it as current is exactly
 * the failure this product exists to avoid.
 */

import fs from 'node:fs';
import path from 'node:path';
import { WORLDS_PATH } from '../config/paths.js';

const MAX_REMEMBERED = 40;

/** @returns {{worlds: Record<string, object>, recent: string[]}} */
export function loadWorldState() {
  try {
    const parsed = JSON.parse(fs.readFileSync(WORLDS_PATH, 'utf8'));
    return {
      worlds: parsed && typeof parsed.worlds === 'object' ? parsed.worlds : {},
      recent: Array.isArray(parsed?.recent) ? parsed.recent : [],
    };
  } catch {
    // No file, unreadable file, or corrupt JSON — a lost layout is not worth
    // failing a session over.
    return { worlds: {}, recent: [] };
  }
}

function save(state) {
  try {
    fs.mkdirSync(path.dirname(WORLDS_PATH), { recursive: true });
    fs.writeFileSync(WORLDS_PATH, JSON.stringify(state, null, 2));
  } catch { /* the workspace still works without a memory of it */ }
}

/** A stable key for a company, preferring identity over the typed name. */
export function worldKey(world) {
  return String(world?.company_id || world?.symbol || world?.common_name || '').toUpperCase() || null;
}

/** Remember the view a world is currently showing. */
export function rememberWorld(world) {
  const key = worldKey(world);
  if (!key) return;
  const state = loadWorldState();
  state.worlds[key] = {
    symbol: world.symbol ?? null,
    name: world.common_name ?? world.company_name ?? null,
    tab: world.tab ?? 'overview',
    basis: world.basis ?? 'consolidated',
    chart: world.chart ?? null,
    seen_at: new Date().toISOString(),
  };
  state.recent = [key, ...state.recent.filter(entry => entry !== key)].slice(0, MAX_REMEMBERED);
  for (const stale of Object.keys(state.worlds)) {
    if (!state.recent.includes(stale)) delete state.worlds[stale];
  }
  save(state);
}

/** The remembered view for a company, or null. */
export function recallWorld(world) {
  const key = worldKey(world);
  return key ? loadWorldState().worlds[key] ?? null : null;
}

/** Put a remembered tab and chart back on a freshly retrieved world. */
export function restoreWorld(world) {
  const remembered = recallWorld(world);
  if (!remembered) return world;
  if (remembered.tab) world.tab = remembered.tab;
  if (remembered.basis) world.basis = remembered.basis;
  if (remembered.chart) world.chart = { ...world.chart, ...remembered.chart };
  world.restored = true;
  return world;
}

/** Companies seen before, newest first — what `/world` offers before you type. */
export function recentWorlds(limit = 8) {
  const state = loadWorldState();
  return state.recent
    .map(key => state.worlds[key])
    .filter(Boolean)
    .slice(0, limit)
    .map(entry => ({
      name: entry.name ?? entry.symbol,
      symbol: entry.symbol,
      exchange: null,
      isin: null,
      reference: entry.symbol ?? entry.name,
      tab: entry.tab,
    }));
}
