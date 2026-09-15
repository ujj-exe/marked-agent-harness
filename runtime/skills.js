import fs from 'node:fs';

/** Read a bundled desk procedure; names are code-owned, never user paths. */
export function loadSkill(name) {
  if (!/^[a-z-]+$/.test(name)) throw new Error(`Invalid skill name: ${name}`);
  return fs.readFileSync(new URL(`../skills/${name}/SKILL.md`, import.meta.url), 'utf8').trim();
}
