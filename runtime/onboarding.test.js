import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { runOnboarding } from './onboarding.js';

let directory;
afterEach(() => { if (directory) fs.rmSync(directory, { recursive: true, force: true }); });

describe('onboarding', () => {
  it('reuses the TUI and persists repo configuration without exposing the key', async () => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), 'marked-onboard-'));
    const key = `mk_test_${'x'.repeat(24)}`;
    const renders = [];
    const answers = [
      { choice: { value: 'repo' } },
      { choice: { value: 'codex' } },
      { choice: { value: 'gpt-6-astra' } },
    ];
    const tui = {
      ask: async () => answers.shift(),
      input: async () => ({ value: key }),
      render: async payload => renders.push(payload),
    };

    const result = await runOnboarding(tui, {
      cwd: directory,
      hasCommand: name => name === 'codex',
      runCommand: async () => ({ stdout: '{"logged_in":false}' }),
    });

    const saved = fs.readFileSync(result.target, 'utf8');
    expect(JSON.parse(saved)).toMatchObject({ agent: 'codex', models: { codex: 'gpt-6-astra' } });
    expect(saved).toContain(key);
    expect(JSON.stringify(renders)).not.toContain(key);
    expect(fs.statSync(result.target).mode & 0o777).toBe(0o600);
  });
});
