import { describe, expect, it } from 'vitest';
import { parseJsonOutput, runProcess } from './process.js';

describe('agent output parsing', () => {
  it('accepts direct JSON', () => {
    expect(parseJsonOutput('{"type":"research_result"}')).toEqual({ type: 'research_result' });
  });

  it('extracts fenced JSON from a noisy worker response', () => {
    expect(parseJsonOutput('done\n```json\n{"type":"research_result"}\n```')).toEqual({ type: 'research_result' });
  });

  it('passes provider credentials through the child environment, not argv', async () => {
    const result = await runProcess(process.execPath, ['-e', 'process.stdout.write(process.env.MARKED_TEST_SECRET || "")'], {
      env: { ...process.env, MARKED_TEST_SECRET: 'secret-from-env' },
    });
    expect(result.stdout).toBe('secret-from-env');
  });
});
