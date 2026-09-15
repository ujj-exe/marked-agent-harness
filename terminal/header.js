/**
 * header.js — Compact 1-line header block for agent render payloads.
 *
 * Brand mark: a three-step gradient ▐██ derived from the active accent.
 * Format: ▐██ MARKED · {context}
 *
 * Returns a { text } block that agents prepend to their blocks array.
 */

import { fg, palette, shade } from '../src/index.js';

/**
 * Generate a compact 1-line header block.
 * @param {string} context - Analysis subject (ticker, sector, "Macro Regime", etc.)
 * @returns {{ text: string }} Block object for the render payload.
 */
export function headerBlock(context = '') {
  // Read the palette per call: the theme can change between renders.
  const accent = palette('accent') || '#ffffff';
  const mark = `${fg(shade(accent, 0.38))}▐${fg(shade(accent, 0.68))}█${fg(accent)}█\x1b[0m`;
  const brand = `\x1b[1m${fg(accent)}MARKED\x1b[0m`;
  const ctx = context ? `\x1b[2m · ${context}\x1b[0m` : '';
  return { text: `${mark} ${brand}${ctx}` };
}
