import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const MARKED_HOME = process.env.MARKED_HOME || path.join(os.homedir(), '.marked');
export const CONFIG_PATH = path.join(MARKED_HOME, 'config.json');

export function configPath(cwd = process.cwd()) {
  let dir = path.resolve(cwd);
  while (true) {
    const candidate = path.join(dir, '.marked', 'config.json');
    if (fs.existsSync(candidate)) return candidate;
    const parent = path.dirname(dir);
    if (parent === dir) return CONFIG_PATH;
    dir = parent;
  }
}
export const STATE_DIR = path.join(MARKED_HOME, 'state');
export const SESSIONS_DIR = path.join(MARKED_HOME, 'sessions');
export const CONVERSATION_PATH = path.join(MARKED_HOME, 'conversation.json');
export const ANALYTICS_DIR = path.join(MARKED_HOME, 'analytics');
export const TUI_STATE_PATH = path.join(MARKED_HOME, 'tui.json');
export const REPORTS_DIR = path.join(MARKED_HOME, 'reports');
