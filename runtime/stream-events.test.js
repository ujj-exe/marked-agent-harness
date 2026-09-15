import { describe, it, expect } from 'vitest';
import { createNdjsonReader, createPartialJsonScanner, createProgressTracker } from './stream-events.js';

/** Feed a document one character at a time — the worst case a real stream offers. */
function scanCharwise(doc) {
  const scanner = createPartialJsonScanner();
  const out = [];
  for (const ch of doc) out.push(...scanner.push(ch));
  return out;
}

describe('createNdjsonReader', () => {
  it('emits one value per line', () => {
    const seen = [];
    const push = createNdjsonReader(v => seen.push(v));
    push('{"a":1}\n{"b":2}\n');
    expect(seen).toEqual([{ a: 1 }, { b: 2 }]);
  });

  it('holds a value split across chunks until its newline arrives', () => {
    const seen = [];
    const push = createNdjsonReader(v => seen.push(v));
    push('{"a":');
    expect(seen).toEqual([]);
    push('1}\n');
    expect(seen).toEqual([{ a: 1 }]);
  });

  it('flushes a final line without a newline', () => {
    const seen = [];
    const push = createNdjsonReader(v => seen.push(v));
    push('{"a":1}');
    push.finish();
    expect(seen).toEqual([{ a: 1 }]);
  });

  it('skips lines that are not JSON rather than throwing', () => {
    const seen = [];
    const push = createNdjsonReader(v => seen.push(v));
    push('warning: something\n{"a":1}\n');
    expect(seen).toEqual([{ a: 1 }]);
  });
});

describe('createPartialJsonScanner', () => {
  it('reports a top-level string only once it is closed', () => {
    const scanner = createPartialJsonScanner();
    expect(scanner.push('{"summary":"hel')).toEqual([]);
    expect(scanner.push('lo"')).toEqual([{ key: 'summary', value: 'hello' }]);
  });

  it('reads a whole document the same way one character at a time', () => {
    const doc = '{"type":"research_result","summary":"Revenue grew","conviction":"bull"}';
    expect(scanCharwise(doc)).toEqual([
      { key: 'type', value: 'research_result' },
      { key: 'summary', value: 'Revenue grew' },
      { key: 'conviction', value: 'bull' },
    ]);
  });

  it('emits a nested object only when the whole top-level field closes', () => {
    const doc = '{"summary":"top","levels":{"support":"120","resistance":"145"},"thesis":"also top"}';
    expect(scanCharwise(doc)).toEqual([
      { key: 'summary', value: 'top' },
      { key: 'levels', value: { support: '120', resistance: '145' } },
      { key: 'thesis', value: 'also top' },
    ]);
  });

  it('skips arrays of objects without emitting their members', () => {
    const doc = '{"summary":"s","catalysts":[{"title":"a"},{"title":"b"}],"thesis":"t"}';
    expect(scanCharwise(doc)).toEqual([
      { key: 'summary', value: 's' },
      { key: 'catalysts', value: [{ title: 'a' }, { title: 'b' }] },
      { key: 'thesis', value: 't' },
    ]);
  });

  it('handles escaped quotes inside a value', () => {
    const doc = '{"summary":"he said \\"buy\\" loudly","thesis":"t"}';
    expect(scanCharwise(doc)).toEqual([
      { key: 'summary', value: 'he said "buy" loudly' },
      { key: 'thesis', value: 't' },
    ]);
  });

  it('decodes escape sequences', () => {
    expect(scanCharwise('{"summary":"line\\nbreak \\u20b9500"}'))
      .toEqual([{ key: 'summary', value: 'line\nbreak ₹500' }]);
  });

  it('emits nothing for a value that never closes', () => {
    const scanner = createPartialJsonScanner();
    expect(scanner.push('{"summary":"truncated mid sen')).toEqual([]);
  });

  it('survives a malformed document without throwing', () => {
    const scanner = createPartialJsonScanner();
    expect(() => scanner.push('}}]],,::"" {{')).not.toThrow();
    expect(scanner.broken).toBe(true);
  });
});

describe('createProgressTracker', () => {
  const thinking = { type: 'system', subtype: 'thinking_tokens', estimated_tokens: 138 };
  const jsonDelta = (partial_json) => ({ type: 'stream_event', event: { delta: { type: 'input_json_delta', partial_json } } });

  it('reports the thinking phase before any output', () => {
    const t = createProgressTracker();
    t.handle(thinking);
    expect(t.state.phase).toBe('thinking');
    expect(t.state.thinkingTokens).toBe(138);
  });

  it('counts written characters and collects completed fields', () => {
    const t = createProgressTracker();
    t.handle(jsonDelta('{"summary":"Reven'));
    expect(t.state.phase).toBe('writing');
    expect(t.state.fields.summary).toBeUndefined();
    t.handle(jsonDelta('ue grew 10%","thesis":"Margins hold"}'));
    expect(t.state.fields.summary).toBe('Revenue grew 10%');
    expect(t.state.fields.thesis).toBe('Margins hold');
    expect(t.state.lastField).toBe('thesis');
    expect(t.state.outputChars).toBe('{"summary":"Reven'.length + 'ue grew 10%","thesis":"Margins hold"}'.length);
  });

  it('notifies on every delta so the meter can move', () => {
    let calls = 0;
    const t = createProgressTracker(() => { calls += 1; });
    t.handle(jsonDelta('{'));
    t.handle(jsonDelta('"a"'));
    t.finish();
    expect(calls).toBe(3);
    expect(t.state.phase).toBe('done');
  });

  it('ignores events it does not understand', () => {
    const t = createProgressTracker();
    expect(() => {
      t.handle({ type: 'rate_limit_event' });
      t.handle({ type: 'stream_event', event: {} });
      t.handle(null);
    }).not.toThrow();
  });
});
