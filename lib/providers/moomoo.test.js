import { describe, it, expect, vi } from 'vitest';

// futu-sdk → futu-proto → protobufjs/minimal uses a bare specifier that
// Node 24 strict-ESM can't resolve without the .js extension.
// Mock the module so the test suite can load without a real OpenD.
vi.mock('futu-sdk', () => ({
  getFutuApi: vi.fn(() => ({
    webRequest: {},
    webSocket: { close: vi.fn() },
  })),
}));

import { MoomooProvider } from './moomoo.js';

describe('MoomooProvider', () => {
  it('futu-sdk exports getFutuApi as a function', async () => {
    const mod = await import('futu-sdk');
    expect(typeof mod.getFutuApi).toBe('function');
  });

  it('constructor accepts config with clientKey and port', () => {
    const provider = new MoomooProvider({ port: 33333, clientKey: 'test-key' });
    expect(provider.broker).toBe('moomoo');
    expect(provider.port).toBe(33333);
    expect(provider.clientKey).toBe('test-key');
    expect(provider.isConnected()).toBe(false);
  });

  it('constructor defaults to port 33333 and empty clientKey', () => {
    const provider = new MoomooProvider({});
    expect(provider.port).toBe(33333);
    expect(provider.clientKey).toBe('');
  });

  it('probe returns false when OpenD is not running', async () => {
    const result = await MoomooProvider.probe('127.0.0.1', 19999);
    expect(result).toBe(false);
  });
});
