/**
 * patch.test.js — Tests for patch merge logic (Bug #4 fix).
 *
 * Covers:
 *  - buildPatchKeys: positional keys for generic types
 *  - applyPatch: row collision fix, explicit-id blocks, mixed arrays
 */

import { describe, it, expect } from 'vitest';
import { getBlockType, buildPatchKeys, applyPatch } from './state.js';

// ── getBlockType ─────────────────────────────────────────────────────────────

describe('getBlockType', () => {
  it('returns null for non-objects', () => {
    expect(getBlockType(null)).toBe(null);
    expect(getBlockType(undefined)).toBe(null);
    expect(getBlockType('string')).toBe(null);
    expect(getBlockType(42)).toBe(null);
  });

  it('returns block.id when present (explicit id wins)', () => {
    expect(getBlockType({ id: 'my-row', row: [] })).toBe('my-row');
    expect(getBlockType({ id: 'header', text: 'hello' })).toBe('header');
  });

  it('returns "row" for {row:[...]} without id', () => {
    expect(getBlockType({ row: [] })).toBe('row');
    expect(getBlockType({ row: [{ text: 'a' }] })).toBe('row');
  });

  it('returns "stack" for {stack:[...]} without id', () => {
    expect(getBlockType({ stack: [] })).toBe('stack');
  });

  it('returns "text" for text blocks without id', () => {
    expect(getBlockType({ text: 'hello' })).toBe('text');
    expect(getBlockType({ text: '' })).toBe('text');
  });

  it('returns "divider" for divider blocks', () => {
    expect(getBlockType({ divider: true })).toBe('divider');
  });

  it('returns "spacer" for spacer blocks', () => {
    expect(getBlockType({ spacer: 1 })).toBe('spacer');
  });

  it('returns panel name for named panel blocks', () => {
    expect(getBlockType({ quote: {} })).toBe('quote');
    expect(getBlockType({ chart: {} })).toBe('chart');
    expect(getBlockType({ verdict: {} })).toBe('verdict');
  });
});

// ── buildPatchKeys ────────────────────────────────────────────────────────────

describe('buildPatchKeys', () => {
  it('assigns positional keys to row blocks', () => {
    const blocks = [
      { row: [{ text: 'a' }] },
      { row: [{ text: 'b' }] },
      { row: [{ text: 'c' }] },
    ];
    expect(buildPatchKeys(blocks)).toEqual(['row-0', 'row-1', 'row-2']);
  });

  it('assigns positional keys to stack blocks', () => {
    const blocks = [
      { stack: [{ text: 'a' }] },
      { stack: [{ text: 'b' }] },
    ];
    expect(buildPatchKeys(blocks)).toEqual(['stack-0', 'stack-1']);
  });

  it('assigns positional keys to text/divider/spacer blocks', () => {
    const blocks = [
      { text: 'first' },
      { divider: true },
      { text: 'second' },
      { spacer: 1 },
      { spacer: 2 },
    ];
    expect(buildPatchKeys(blocks)).toEqual([
      'text-0', 'divider-0', 'text-1', 'spacer-0', 'spacer-1',
    ]);
  });

  it('preserves explicit id as-is (no positional suffix)', () => {
    const blocks = [
      { id: 'header', row: [] },
      { id: 'body', row: [] },
    ];
    expect(buildPatchKeys(blocks)).toEqual(['header', 'body']);
  });

  it('preserves named panel types as-is', () => {
    const blocks = [
      { quote: {} },
      { chart: {} },
      { verdict: {} },
    ];
    expect(buildPatchKeys(blocks)).toEqual(['quote', 'chart', 'verdict']);
  });

  it('handles mixed generic and named blocks', () => {
    const blocks = [
      { text: 'title' },
      { quote: {} },
      { row: [{ chart: {} }] },
      { text: 'footer' },
      { row: [{ verdict: {} }] },
    ];
    expect(buildPatchKeys(blocks)).toEqual([
      'text-0', 'quote', 'row-0', 'text-1', 'row-1',
    ]);
  });

  it('returns null for unknown blocks', () => {
    expect(buildPatchKeys([{}])).toEqual([null]);
  });
});

// ── applyPatch ────────────────────────────────────────────────────────────────

describe('applyPatch — row collision fix', () => {
  it('preserves both rows when patching one row into a two-row base', () => {
    const base = [
      { row: [{ text: 'original row 0' }] },
      { row: [{ text: 'original row 1' }] },
    ];
    const incoming = [
      { row: [{ text: 'updated row 0' }] },
    ];
    const result = applyPatch(base, incoming);
    expect(result).toHaveLength(2);
    expect(result[0].row[0].text).toBe('updated row 0');
    expect(result[1].row[0].text).toBe('original row 1');
  });

  it('patches the second row without touching the first', () => {
    const base = [
      { row: [{ text: 'row 0' }] },
      { row: [{ text: 'row 1' }] },
    ];
    // Incoming: only second row (row-1 position in incoming becomes row-0,
    // but since base has 2 rows and incoming has 1, incoming row-0 → base row-0)
    // To update row-1 specifically, we send both but patch the second:
    const incoming = [
      { row: [{ text: 'row 0 unchanged' }] },
      { row: [{ text: 'row 1 updated' }] },
    ];
    const result = applyPatch(base, incoming);
    expect(result).toHaveLength(2);
    expect(result[0].row[0].text).toBe('row 0 unchanged');
    expect(result[1].row[0].text).toBe('row 1 updated');
  });

  it('appends a new row when incoming has more rows than base', () => {
    const base = [
      { row: [{ text: 'row 0' }] },
    ];
    const incoming = [
      { row: [{ text: 'row 0 updated' }] },
      { row: [{ text: 'row 1 new' }] },
    ];
    const result = applyPatch(base, incoming);
    expect(result).toHaveLength(2);
    expect(result[0].row[0].text).toBe('row 0 updated');
    expect(result[1].row[0].text).toBe('row 1 new');
  });

  it('handles explicit-id rows correctly (original behavior preserved)', () => {
    const base = [
      { id: 'header-row', row: [{ text: 'original header' }] },
      { row: [{ text: 'generic row' }] },
    ];
    const incoming = [
      { id: 'header-row', row: [{ text: 'updated header' }] },
    ];
    const result = applyPatch(base, incoming);
    expect(result).toHaveLength(2);
    expect(result[0].row[0].text).toBe('updated header');
    expect(result[1].row[0].text).toBe('generic row');
  });

  it('handles multiple text blocks without collision', () => {
    const base = [
      { text: 'line 1' },
      { text: 'line 2' },
      { text: 'line 3' },
    ];
    const incoming = [
      { text: 'line 1 updated' },
      { text: 'line 2 updated' },
    ];
    const result = applyPatch(base, incoming);
    expect(result).toHaveLength(3);
    expect(result[0].text).toBe('line 1 updated');
    expect(result[1].text).toBe('line 2 updated');
    expect(result[2].text).toBe('line 3');
  });

  it('handles named panel replacement without positional suffixes', () => {
    const base = [
      { quote: { ticker: 'AAPL', price: 150 } },
      { chart: { values: [1, 2, 3] } },
    ];
    const incoming = [
      { quote: { ticker: 'AAPL', price: 155 } },
    ];
    const result = applyPatch(base, incoming);
    expect(result).toHaveLength(2);
    expect(result[0].quote.price).toBe(155);
    expect(result[1].chart.values).toEqual([1, 2, 3]);
  });

  it('handles empty base — all incoming blocks are appended', () => {
    const base = [];
    const incoming = [
      { row: [{ text: 'a' }] },
      { row: [{ text: 'b' }] },
    ];
    const result = applyPatch(base, incoming);
    expect(result).toHaveLength(2);
    expect(result[0].row[0].text).toBe('a');
    expect(result[1].row[0].text).toBe('b');
  });

  it('handles stack blocks without collision', () => {
    const base = [
      { stack: [{ text: 'col A row 0' }] },
      { stack: [{ text: 'col B row 0' }] },
    ];
    const incoming = [
      { stack: [{ text: 'col A updated' }] },
      { stack: [{ text: 'col B updated' }] },
    ];
    const result = applyPatch(base, incoming);
    expect(result).toHaveLength(2);
    expect(result[0].stack[0].text).toBe('col A updated');
    expect(result[1].stack[0].text).toBe('col B updated');
  });
});
