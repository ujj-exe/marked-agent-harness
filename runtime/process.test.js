import { describe, expect, it } from 'vitest';
import { parseJsonOutput } from './process.js';

describe('agent output parsing', () => {
  it('accepts direct JSON', () => {
    expect(parseJsonOutput('{"type":"research_result"}')).toEqual({ type: 'research_result' });
  });

  it('extracts fenced JSON from a noisy worker response', () => {
    expect(parseJsonOutput('done\n```json\n{"type":"research_result"}\n```')).toEqual({ type: 'research_result' });
  });
});
