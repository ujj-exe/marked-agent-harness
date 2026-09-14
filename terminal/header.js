/**
 * header.js — Compact 1-line header block for agent render payloads.
 *
 * Brand mark: lime gradient ▐██ (#3D7A00 → #7FBF00 → #C0FF00)
 * Format: ▐██ MARKED · {context}
 *
 * Returns a { text } block that agents prepend to their blocks array.
 */

/**
 * Generate a compact 1-line header block.
 * @param {string} context - Analysis subject (ticker, sector, "Macro Regime", etc.)
 * @returns {{ text: string }} Block object for the render payload.
 */
export function headerBlock(context = '') {
  // 3-char lime gradient mark using true-color ANSI
  const mark =
    '\x1b[38;2;61;122;0m▐' +
    '\x1b[38;2;127;191;0m█' +
    '\x1b[38;2;192;255;0m█' +
    '\x1b[0m';
  const brand = '\x1b[1m\x1b[38;2;192;255;0mMARKED\x1b[0m';
  const ctx = context ? `\x1b[2m · ${context}\x1b[0m` : '';
  return { text: `${mark} ${brand}${ctx}` };
}
