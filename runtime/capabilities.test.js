import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { comparePeriods, compareSnapshots, runCapability } from './capabilities.js';

const dirs = [];
afterEach(() => dirs.splice(0).forEach(dir => fs.rmSync(dir, { recursive: true, force: true })));

function context(run) {
  const renders = [];
  const saved = [];
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'marked-capabilities-'));
  dirs.push(dir);
  return {
    renders, saved, storePath: path.join(dir, 'state.json'),
    orchestrator: { run, save: session => saved.push(session) },
    tui: { render: async payload => { renders.push(payload); } },
    agentName: 'claude', asOf: '2026-09-15T00:00:00.000Z', conversation: null,
  };
}

function session(value = 10) {
  return {
    packet: {
      financial_facts: [{ concept_id: 'Revenue', period: 'FY2026', basis: 'consolidated', value, unit: 'INR' }],
      shareholding: { data: [{ promoter_pct: 50 }] }, filings: { data: [] }, events: { data: [] }, actions: { data: [] },
    },
    result: { type: 'research_result', summary: 'Summary', thesis: 'Thesis', conviction: 'neutral', invalidation: [], claims: [], risks: [] },
  };
}

describe('capability routing', () => {
  it('keeps signal, claims and rewind on explicit isolated options', async () => {
    const calls = [];
    const ctx = context(async (question, options) => { calls.push({ question, options }); return session(); });
    await runCapability({ kind: 'signal', expression: 'net margin above 10%' }, ctx);
    await runCapability({ kind: 'claims', reference: 'INFY' }, ctx);
    await runCapability({ kind: 'rewind', reference: 'PAYTM', date: '2024-03-01' }, ctx);
    expect(calls[0].question).toBe('Screen companies with net margin above 10%');
    expect(calls[1].question).toContain('operating cash flow');
    expect(calls[1].options.intentOverride).toEqual({ kind: 'company', references: ['INFY'] });
    expect(calls[2].options).toMatchObject({ pointInTime: true, asOf: '2024-03-01T23:59:59.999Z' });
  });

  it('persists a diff baseline and reports the next change', async () => {
    let value = 10;
    const ctx = context(async () => session(value));
    const first = await runCapability({ kind: 'diff', reference: 'INFY' }, ctx);
    expect(first.capability.changes).toEqual([]);
    value = 12;
    const second = await runCapability({ kind: 'diff', reference: 'INFY' }, ctx);
    expect(second.capability.changes).toEqual([
      { field: 'Revenue FY2026', before: '10', after: '12', status: '+2' },
    ]);
    expect(ctx.renders.at(-1).blocks.some(block => block.id === 'capability-changes')).toBe(true);
  });

  it('feeds the prior saved thesis into the next re-evaluation', async () => {
    const questions = [];
    const ctx = context(async question => { questions.push(question); return session(); });
    await runCapability({ kind: 'thesis', reference: 'INFY' }, ctx);
    await runCapability({ kind: 'thesis', reference: 'INFY' }, ctx);
    expect(questions[0]).not.toContain('Previous saved thesis');
    expect(questions[1]).toContain('Previous saved thesis');
  });
});

describe('deterministic comparisons', () => {
  it('compares two periods and two snapshots without a model', () => {
    const current = { facts: [
      { concept_id: 'Revenue', period: 'FY2025', basis: 'consolidated', value: 100, unit: 'INR' },
      { concept_id: 'Revenue', period: 'FY2026', basis: 'consolidated', value: 120, unit: 'INR' },
    ] };
    expect(comparePeriods(current, 'FY2025', 'FY2026')[0]).toMatchObject({ before: '100', after: '120', status: '+20' });
    expect(compareSnapshots({ filings: ['old'] }, { filings: ['old', 'new'] })).toEqual([
      { field: 'new filings', before: '0', after: '1', status: 'new' },
    ]);
  });
});
