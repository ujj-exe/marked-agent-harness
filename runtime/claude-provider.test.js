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
    // Position is not the contract — adjacency is. Other flags are free to
    // precede it.
    expect(args[args.indexOf('--model') + 1]).toBe('opus');
    for (const flag of ['-p', '--restricted', '--no-session-persistence', '--output-format', '--json-schema']) {
      expect(args).toContain(flag);
    }
    expect(args.at(-1)).toBe('question');
  });

  it('omits --model when no model is pinned', () => {
    expect(claudeArgs({}, 'q', {})).not.toContain('--model');
  });
});

describe('MCP isolation', () => {
  // Measured: project MCP servers cost 6.7s of session boot on a call that
  // calls no tools. The variadic flag order matters — see the comment in
  // claudeArgs; getting it wrong makes the CLI read the prompt as a config path.
  it('pins an empty MCP config and forbids any other', () => {
    const args = claudeArgs({}, 'question');
    expect(args).toContain('--strict-mcp-config');
    const i = args.indexOf('--mcp-config');
    expect(i).toBeGreaterThanOrEqual(0);
    expect(args[i + 1]).toMatch(/config[/\\]no-mcp\.json$/);
  });

  it('never leaves --mcp-config adjacent to the prompt', () => {
    const args = claudeArgs({}, 'question');
    expect(args.at(-1)).toBe('question');
    expect(args.at(-2)).not.toBe('--mcp-config');
    expect(args.indexOf('--mcp-config')).toBeLessThan(args.length - 2);
  });
});
