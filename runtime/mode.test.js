import { describe, expect, it } from 'vitest';
import { classifyOutputMode } from './mode.js';

describe('output modes', () => {
  it('keeps factual lookups compact and analytical requests rich', () => {
    expect(classifyOutputMode('What was Infosys profit last financial year?', { kind: 'query' })).toBe('factual');
    expect(classifyOutputMode('Analyze Infosys earnings quality', { kind: 'company' })).toBe('analytical');
    expect(classifyOutputMode('Compare TCS and Infosys', { kind: 'compare' })).toBe('comparative');
  });
});
