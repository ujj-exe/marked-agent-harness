import { describe, expect, it } from 'vitest';
import { checkForUpdate } from './update.js';

describe('update check', () => {
  it('reports a changed remote branch without failing startup', async () => {
    const run = async args => ({
      'rev-parse HEAD': 'old',
      'branch --show-current': 'main',
      'ls-remote origin refs/heads/main': 'new\trefs/heads/main',
    })[args.join(' ')];
    expect(await checkForUpdate('/unused', run)).toEqual({ local: 'old', remote: 'new', branch: 'main' });
    expect(await checkForUpdate('/unused', async () => { throw new Error('offline'); })).toBeNull();
  });
});
