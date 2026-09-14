import { describe, expect, it } from 'vitest';
import { claudeArgs } from './claude-provider.js';

describe('claude provider arguments', () => {
  it('skips --bare without an API key, because it never reads an OAuth login', () => {
    // --bare authenticates strictly from ANTHROPIC_API_KEY; on a subscription
    // login it fails with an unexplained api_error and no tokens consumed.
    expect(claudeArgs({}, 'q', {})).not.toContain('--bare');
    expect(claudeArgs({}, 'q', { ANTHROPIC_API_KEY: 'sk-ant-x' })).toContain('--bare');
  });

  it('keeps the isolation flags that work either way', () => {
    const args = claudeArgs({ model: 'opus' }, 'question', {});
    expect(args.slice(0, 2)).toEqual(['--model', 'opus']);
    for (const flag of ['-p', '--restricted', '--no-session-persistence', '--output-format', '--json-schema']) {
      expect(args).toContain(flag);
    }
    expect(args.at(-1)).toBe('question');
  });

  it('omits --model when no model is pinned', () => {
    expect(claudeArgs({}, 'q', {})).not.toContain('--model');
  });
});
