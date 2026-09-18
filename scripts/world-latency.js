import { performance } from 'node:perf_hooks';
import { MarkedClient } from '../data/marked-client.js';
import { loadConfig, requireApiKey } from '../runtime/config.js';
import { MarkedOrchestrator } from '../runtime/orchestrator.js';

const reference = process.argv[2] || 'RELIANCE';
const runs = Math.max(1, Number(process.argv[3]) || 3);
const config = loadConfig();
const timings = [];

for (let run = 1; run <= runs; run++) {
  let requests = 0;
  const data = new MarkedClient({
    apiKey: requireApiKey(config),
    baseUrl: config.apiBase,
    fetchImpl: (...args) => {
      requests += 1;
      return fetch(...args);
    },
  });
  const started = performance.now();
  const orchestrator = new MarkedOrchestrator({
    data,
    agent: { name: 'latency-harness' },
    tui: { render: async () => ({}) },
    save: () => {},
  });
  await orchestrator.run(reference, {
    intentOverride: { kind: 'company', references: [reference] },
    dataOnly: true,
    suppressBlocks: true,
  });
  const durationMs = Math.round(performance.now() - started);
  timings.push(durationMs);
  console.log(JSON.stringify({ run, reference, requests, duration_ms: durationMs, plan: data.plan.name, concurrency: data.plan.concurrency }));
}

const sorted = [...timings].sort((a, b) => a - b);
console.log(JSON.stringify({
  reference,
  runs,
  median_ms: sorted[Math.floor(sorted.length / 2)],
  min_ms: sorted[0],
  max_ms: sorted.at(-1),
}));
