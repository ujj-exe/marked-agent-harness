import { describe, expect, it } from 'vitest';
import { loadSkill } from './skills.js';

describe('desk skill loader', () => {
  it('loads the substantive risk procedure and rejects paths', () => {
    const risk = loadSkill('risk');
    expect(risk).toContain('transmission channel');
    expect(risk).toContain('data-gap list');
    expect(() => loadSkill('../risk')).toThrow(/Invalid skill/);
  });
});
