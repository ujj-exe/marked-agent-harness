#!/usr/bin/env node
/**
 * smoke.js — run the whole research pipeline without the TUI.
 *
 *   npm run smoke                 canonical query set, stub reasoning worker
 *   npm run smoke -- --agent      use the real configured provider
 *   npm run smoke -- "a question" one ad-hoc query
 *
 * State goes to a throwaway MARKED_HOME so a run can never disturb ~/.marked.
 * Exits non-zero when a query that must produce financial facts produces none,
 * so this is usable as a regression gate and not only as a reading aid.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.MARKED_HOME ||= fs.mkdtempSync(path.join(os.tmpdir(), 'marked-smoke-'));

const { MarkedClient } = await import('../data/marked-client.js');
const { MarkedOrchestrator } = await import('../runtime/orchestrator.js');
const { createAgentProvider } = await import('../runtime/providers.js');

const B = '\x1b[38;2;192;255;0m';
const D = '\x1b[2m';
const R = '\x1b[0m';
const rule = char => `${D}${char.repeat(78)}${R}`;

// Every route the runtime can take, and whether the packet owes us numbers.
const CANONICAL = [
  { q: 'What was Infosys PAT in FY2025?', facts: true },
  { q: 'Compare TCS and Infosys PAT in FY2025', facts: true },
  { q: 'Why did Reliance PAT grow from FY2024 to FY2026?', facts: true },
  { q: 'Infosys earnings last financial year', facts: true },
  { q: 'Reliance revenue and EBITDA FY2026', facts: true },
  { q: "What changed in Reliance's latest filing?", facts: false },
  { q: 'Analyze Reliance Industries', facts: false },
];

const args = process.argv.slice(2);
const live = args.includes('--agent');
const asked = args.filter(arg => !arg.startsWith('--'));
const cases = asked.length ? asked.map(q => ({ q, facts: null })) : CANONICAL;

const apiKey = process.env.MARKED_API_KEY || readRealKey();
if (!apiKey) {
  console.error('smoke: no Marked API key. Set MARKED_API_KEY or run /marked <key> in the TUI first.');
  process.exit(2);
}

const data = new MarkedClient({ apiKey, baseUrl: process.env.MARKED_API_BASE || 'https://api.marked.run' });
const agent = live ? createAgentProvider(process.env.MARKED_AGENT || 'codex') : stubAgent();
const tui = { render: async () => ({}) };
const orchestrator = new MarkedOrchestrator({ data, agent, tui, save: () => {} });

let failures = 0;
for (const testCase of cases) {
  console.log(`\n${rule('━')}\n${B}QUESTION${R}  ${testCase.q}\n${rule('━')}`);
  let session;
  try {
    session = await orchestrator.run(testCase.q, { asOf: new Date().toISOString() });
  } catch (error) {
    console.log(`  ${D}threw${R}  ${error.message || error.code || JSON.stringify(error).slice(0, 200)}`);
    if (process.env.MARKED_DEBUG) console.log(error.stack || '');
    failures += 1;
    continue;
  }
  report(session);
  const facts = session.packet?.financial_facts || [];
  if (testCase.facts === true && !facts.length && !session.data_gap) {
    console.log(`  ${D}FAIL — this question owes financial facts and the packet has none${R}`);
    failures += 1;
  }
}

console.log(`\n${rule('─')}\n${failures ? `${failures} failing` : 'all clear'} · ${cases.length} queries · state in ${process.env.MARKED_HOME}`);
process.exit(failures ? 1 : 0);

function report(session) {
  const plan = session.data_plan;
  console.log(`\n${B}INTENT${R}          kind=${session.intent?.kind} route=${plan?.route ?? '—'} mode=${session.mode}`);
  if (plan) {
    console.log(`${B}PLAN${R}            entity=${JSON.stringify(plan.references)} metric=${plan.metric} periods=${JSON.stringify(plan.fiscal_years)} ${plan.period}/${plan.basis}`);
    console.log(`                concepts=${plan.concepts.join(', ') || '—'}`);
  }
  for (const request of session.marked_requests || []) {
    console.log(`${B}REQUEST${R}         ${request.route} ticker=${request.ticker} concept=${String(request.concept || '—').slice(0, 60)}`);
  }

  const facts = session.packet?.financial_facts || [];
  console.log(`${B}FACTS${R}           ${facts.length} validated`);
  for (const fact of facts.slice(0, 12)) {
    console.log(`  ${fact.evidence_id}  ${String(fact.ticker || '').padEnd(9)} ${fact.concept_id.padEnd(24)} ${String(fact.period).padEnd(7)} ${money(fact).padStart(15)}  ${fact.basis}`);
  }
  if (facts.length > 12) console.log(`  ${D}… ${facts.length - 12} more${R}`);

  const types = {};
  for (const item of session.evidence || []) types[item.data_type] = (types[item.data_type] || 0) + 1;
  console.log(`${B}EVIDENCE${R}        ${Object.entries(types).map(([type, count]) => `${type}×${count}`).join(' ') || 'none'}`);
  if (session.packet?.derived_metrics?.length) console.log(`${B}DERIVED${R}         ${JSON.stringify(session.packet.derived_metrics)}`);
  if (session.packet?.data_gaps?.length) console.log(`${B}GAPS${R}            ${JSON.stringify(session.packet.data_gaps)}`);
  if (session.data_gap) console.log(`${B}DATA GAP${R}        ${session.data_gap.join(' ')}`);
  console.log(`${B}ANSWER${R}          ${session.result ? (session.result.summary || session.result.thesis || '').slice(0, 400) : '(worker not launched)'}`);
}

function money(fact) {
  if (!Number.isFinite(fact.value)) return '—';
  if (fact.currency !== 'INR') return String(Number(fact.value.toFixed(4)));
  const absolute = Math.abs(fact.value);
  const sign = fact.value < 0 ? '-' : '';
  if (absolute >= 1e7) return `${sign}₹${Math.round(absolute / 1e7).toLocaleString('en-IN')} Cr`;
  return `${sign}₹${Math.round(absolute).toLocaleString('en-IN')}`;
}

/** Echoes the packet back, so a failure is the packet's fault and not a model's. */
function stubAgent() {
  return {
    name: 'stub',
    async run(prompt) {
      const context = JSON.parse(prompt.slice(prompt.indexOf('\n\n{') + 2));
      const facts = context.packet?.financial_facts || [];
      return {
        type: 'research_result',
        summary: facts.length
          ? `${facts.length} validated facts: ${[...new Set(facts.map(fact => fact.concept_id))].slice(0, 6).join(', ')}`
          : 'No financial facts in packet.',
        thesis: facts.slice(0, 4).map(fact => `${fact.concept_id} ${fact.period}=${fact.value}`).join('; ') || '—',
        claims: facts.slice(0, 3).map(fact => ({ text: `${fact.concept_id} ${fact.period} was ${fact.value}`, evidence_ids: [fact.evidence_id], classification: 'fact' })),
        risks: [], conviction: 'uncertain',
      };
    },
  };
}

function readRealKey() {
  try {
    return JSON.parse(fs.readFileSync(path.join(os.homedir(), '.marked', 'config.json'), 'utf8')).apiKey;
  } catch { return null; }
}
