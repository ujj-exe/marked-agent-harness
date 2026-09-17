#!/usr/bin/env node
/**
 * bench.js — measure the planner, not the model.
 *
 *   npm run bench                    the whole corpus
 *   npm run bench -- --limit 10      the first ten
 *   npm run bench -- --trace out.jsonl   write every trace for inspection
 *
 * A passing test suite says the software is stable. It says nothing about
 * whether the harness understood the question. This scores the part between
 * the user and the reasoning model: did it find the right company, ask for the
 * right measures over the right periods, and did what came back answer the
 * question — without a model being asked to rescue it.
 *
 * The reasoning worker is stubbed on purpose. Model quality is a separate axis
 * and mixing the two makes both unreadable.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fg, palette } from '../src/index.js';
import { fileURLToPath } from 'node:url';

process.env.MARKED_HOME ||= fs.mkdtempSync(path.join(os.tmpdir(), 'marked-bench-'));

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { MarkedClient } = await import('../data/marked-client.js');
const { MarkedOrchestrator } = await import('../runtime/orchestrator.js');
const { createAgentProvider } = await import('../runtime/providers.js');

const B = fg(palette('accent'));
const D = '\x1b[2m';
const R = '\x1b[0m';

const args = process.argv.slice(2);
const flag = name => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : null; };
const limit = Number(flag('--limit')) || Infinity;
const tracePath = flag('--trace');
const liveJudge = args.includes('--judge');

const corpus = fs.readFileSync(path.join(root, 'evals', 'queries.jsonl'), 'utf8')
  .split('\n').filter(Boolean).map(line => JSON.parse(line)).slice(0, limit);

const apiKey = process.env.MARKED_API_KEY
  || JSON.parse(fs.readFileSync(path.join(os.homedir(), '.marked', 'config.json'), 'utf8')).apiKey;
const data = new MarkedClient({ apiKey, baseUrl: process.env.MARKED_API_BASE || 'https://api.marked.run' });

// A stub judge keeps the measurement about the planner. --judge uses the real
// one, which is how you find out whether repair is worth its latency.
const judge = liveJudge ? createAgentProvider(process.env.MARKED_AGENT || 'claude', { model: 'sonnet' }) : null;

const traces = [];
console.log(`${B}Marked planner benchmark${R}  ${D}${corpus.length} queries${R}\n`);

for (const item of corpus) {
  const trace = { query: item.q, expected: item };
  let judged = 0;
  const agent = {
    name: 'bench',
    async run(prompt) {
      if (prompt.includes('reviewing a data-retrieval plan')) {
        judged += 1;
        return judge ? judge.run(prompt, { cwd: root, timeoutMs: 120000, schema: undefined }) : { verdict: 'ok', reasoning: 'stub' };
      }
      return { type: 'research_result', summary: 'stub', thesis: 'stub', claims: [], risks: [], conviction: 'uncertain' };
    },
  };

  const started = Date.now();
  try {
    const session = await new MarkedOrchestrator({ data, agent, tui: { render: async () => ({}) }, save: () => {} })
      .run(item.q, { asOf: new Date().toISOString() });
    const plan = session.data_plan ?? {};
    const facts = session.packet?.financial_facts ?? [];
    const datasets = Object.keys(session.packet?.companies?.[0]?.datasets ?? {});

    Object.assign(trace, {
      ok: true,
      route: plan.route,
      planned_by: plan.planned_by ?? 'local',
      candidates: plan.candidates ?? null,
      resolved_entity: session.packet?.companies?.[0]?.company?.common_name
        ?? session.packet?.entity?.company?.common_name ?? plan.references?.[0] ?? null,
      required_concepts: plan.required_concepts ?? [],
      analysis_requirements: plan.analysis_requirements ?? [],
      returned_concepts: [...new Set(facts.map(fact => fact.concept_id))],
      fiscal_years: plan.fiscal_years ?? [],
      returned_years: [...new Set(facts.map(fact => fact.fiscal_year).filter(Boolean))].sort(),
      datasets,
      fact_count: facts.length,
      repair_triggered: (session.plan_reviews ?? []).length > 0,
      repair_concern: session.plan_reviews?.[0]?.concern ?? null,
      unresolved: Boolean(session.unresolved),
      judge_calls: judged,
      elapsed_ms: Date.now() - started,
    });
  } catch (error) {
    Object.assign(trace, { ok: false, error: error.code || error.message, elapsed_ms: Date.now() - started });
  }
  traces.push(trace);
  process.stdout.write(trace.ok ? (score(trace).answered ? `${B}·${R}` : `${D}x${R}`) : `${D}!${R}`);
}
console.log('\n');

// ── Scoring ─────────────────────────────────────────────────────────────────

/** Every judgement about one trace, in one place so the report cannot drift. */
function score(trace) {
  const want = trace.expected;
  const norm = value => String(value ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const entityOk = !want.entity || (trace.resolved_entity
    && (norm(trace.resolved_entity).includes(norm(want.entity)) || norm(want.entity).includes(norm(trace.resolved_entity))));
  const conceptsOk = !want.concepts?.length
    || want.concepts.every(id => trace.required_concepts?.includes(id));
  const yearsOk = !want.years?.length
    || want.years.every(year => trace.fiscal_years?.includes(year));
  const routeOk = !want.route || trace.route === want.route;
  const datasetsOk = !want.datasets?.length || want.datasets.every(name => trace.datasets?.includes(name));
  const requirementsOk = !want.requirements?.length
    || want.requirements.every(name => trace.analysis_requirements?.includes(name));
  // Answered: something concrete came back and nothing is outstanding.
  const answered = Boolean(trace.ok && !trace.unresolved && (trace.fact_count > 0 || trace.datasets?.length));
  // Coverage: of the concepts the plan asked for, how many actually returned.
  const asked = trace.required_concepts?.length ?? 0;
  const got = asked ? trace.required_concepts.filter(id => trace.returned_concepts.includes(id)).length : 0;
  return { entityOk, conceptsOk, yearsOk, routeOk, datasetsOk, requirementsOk, answered, coverage: asked ? got / asked : null };
}

const scored = traces.map(trace => ({ trace, ...score(trace) }));
const rate = (n, d) => (d ? `${((n / d) * 100).toFixed(0)}%` : '—') + ` ${D}(${n}/${d})${R}`;
const count = predicate => scored.filter(predicate).length;

const repaired = scored.filter(s => s.trace.repair_triggered);
const repairWorked = repaired.filter(s => s.answered);
// A repair that fired on a plan whose results were already usable.
const falseRepairs = repaired.filter(s => s.trace.fact_count > 0 && s.conceptsOk && s.yearsOk);
const coverages = scored.map(s => s.coverage).filter(value => value !== null);

console.log(`${B}PLANNER${R}`);
console.log(`  entity resolution     ${rate(count(s => s.entityOk), traces.length)}`);
console.log(`  concept resolution    ${rate(count(s => s.conceptsOk), traces.length)}`);
console.log(`  period resolution     ${rate(count(s => s.yearsOk), traces.length)}`);
console.log(`  route classification  ${rate(count(s => s.routeOk), traces.length)}`);
console.log(`  dataset selection     ${rate(count(s => s.datasetsOk), traces.length)}`);
console.log(`  analytical mandate    ${rate(count(s => s.requirementsOk), traces.length)}`);
console.log(`\n${B}RETRIEVAL${R}`);
console.log(`  answered              ${rate(count(s => s.answered), traces.length)}`);
console.log(`  initial plan sufficed ${rate(count(s => s.answered && !s.trace.repair_triggered), traces.length)}`);
console.log(`  concept coverage      ${coverages.length ? `${((coverages.reduce((a, b) => a + b, 0) / coverages.length) * 100).toFixed(0)}%` : '—'}`);
console.log(`  threw                 ${rate(count(s => !s.trace.ok), traces.length)}`);
console.log(`\n${B}REPAIR${R}`);
console.log(`  repair rate           ${rate(repaired.length, traces.length)}`);
console.log(`  repair success        ${rate(repairWorked.length, repaired.length)}`);
console.log(`  false repair          ${rate(falseRepairs.length, repaired.length)}`);
console.log(`\n${B}LATENCY${R}  median ${median(traces.map(t => t.elapsed_ms))}ms · p90 ${percentile(traces.map(t => t.elapsed_ms), 0.9)}ms`);

const failures = scored.filter(s => !s.answered || !s.entityOk || !s.conceptsOk || !s.yearsOk || !s.routeOk || !s.requirementsOk);
if (failures.length) {
  console.log(`\n${B}FAILURES${R}  ${D}${failures.length} of ${traces.length}${R}`);
  for (const { trace, ...marks } of failures.slice(0, 25)) {
    const why = Object.entries({ entity: marks.entityOk, concepts: marks.conceptsOk, periods: marks.yearsOk, route: marks.routeOk, mandate: marks.requirementsOk, answered: marks.answered })
      .filter(([, ok]) => !ok).map(([name]) => name).join(', ');
    console.log(`  ${D}${why.padEnd(28)}${R} ${trace.query.slice(0, 52)}`);
    console.log(`    ${D}route=${trace.route} entity=${trace.resolved_entity} concepts=${(trace.required_concepts || []).slice(0, 5).join(',')} years=${JSON.stringify(trace.fiscal_years)}${trace.error ? ` error=${trace.error}` : ''}${R}`);
  }
}

if (tracePath) {
  fs.writeFileSync(tracePath, traces.map(trace => JSON.stringify(trace)).join('\n') + '\n');
  console.log(`\n${D}traces written to ${tracePath}${R}`);
}

function median(values) { return percentile(values, 0.5); }
function percentile(values, p) {
  const sorted = values.slice().sort((a, b) => a - b);
  return sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))] : 0;
}
