import fs from 'node:fs';
import path from 'node:path';
import { CAPABILITIES_PATH } from '../config/paths.js';
import { LABELS } from '../data/normalization.js';
import { buildDataPlan } from './plan.js';

const OWNERSHIP = ['promoter_pct', 'fii_pct', 'dii_pct', 'mutual_fund_pct', 'public_pct', 'pledged_pct'];

/** Run one explicit high-level workflow without changing normal query routing. */
export async function runCapability(command, {
  orchestrator, tui, agentName, asOf, conversation, storePath = CAPABILITIES_PATH,
}) {
  if (command.kind === 'signal') {
    return orchestrator.run(`Screen companies with ${command.expression}`, { agentName, asOf, conversation });
  }
  if (command.kind === 'claims') {
    return orchestrator.run(
      `Analyze management claims for ${command.reference} against revenue, profit after tax, operating cash flow, borrowings, trade receivables, inventories, net margin and cash conversion. Use annual reports, investor presentations and earnings calls. Quote no claim unless Marked supplies its document text; otherwise state the document-text data gap.`,
      { agentName, asOf, conversation, intentOverride: { kind: 'company', references: [command.reference] } },
    );
  }
  if (command.kind === 'rewind') {
    const historicalAsOf = `${command.date}T23:59:59.999Z`;
    const intent = { kind: 'company', references: [command.reference] };
    const session = await orchestrator.run(`Research ${command.reference} as it was known on ${command.date}`, {
      agentName, asOf: historicalAsOf, conversation,
      intentOverride: intent,
      plan: buildDataPlan(command.reference, { asOf: historicalAsOf, declared: intent }),
      pointInTime: true,
    });
    session.capability = { kind: 'rewind', as_of: historicalAsOf };
    orchestrator.save(session);
    await patch(tui, agentName, `AS KNOWN ON ${command.date}`, `No information known after ${command.date} was requested from Marked.`);
    return session;
  }

  const store = loadStore(storePath);
  const key = command.reference.toLowerCase();
  if (command.kind === 'thesis') {
    const prior = store.theses[key];
    const priorText = prior ? ` Previous saved thesis: ${JSON.stringify({
      summary: prior.result?.summary,
      conviction: prior.result?.conviction,
      thesis: prior.result?.thesis,
      invalidation: prior.result?.invalidation,
      claims: prior.result?.claims,
    })}. Identify which prior claims still hold and whether any invalidation condition has occurred.` : '';
    const intent = { kind: 'company', references: [command.reference] };
    const session = await orchestrator.run(`Research ${command.reference} and build an evidence-linked living thesis.${priorText}`, {
      agentName, asOf, conversation,
      intentOverride: intent,
      plan: buildDataPlan(command.reference, { declared: intent }),
    });
    const current = snapshot(session);
    const changes = prior ? compareSnapshots(prior.snapshot, current).slice(0, 12) : [];
    store.theses[key] = { result: session.result, snapshot: current, checked_at: new Date().toISOString(), versions: (prior?.versions ?? 0) + 1 };
    saveStore(storePath, store);
    session.capability = { kind: 'thesis', prior: Boolean(prior), changes };
    orchestrator.save(session);
    await patch(tui, agentName, 'LIVING THESIS', prior
      ? `${changes.length} underlying data ${changes.length === 1 ? 'change' : 'changes'} since the saved thesis · version ${store.theses[key].versions}`
      : 'Baseline saved · run the same command again to re-test it against new data', changes);
    return session;
  }

  const intent = { kind: 'company', references: [command.reference] };
  const session = await orchestrator.run(command.reference, {
    agentName, asOf, conversation,
    intentOverride: intent,
    plan: buildDataPlan(command.reference, { declared: intent }),
    dataOnly: true,
  });
  const current = snapshot(session);
  const prior = store.snapshots[key];
  const changes = command.periods
    ? comparePeriods(current, command.periods[0], command.periods[1])
    : prior ? compareSnapshots(prior, current) : [];
  store.snapshots[key] = current;
  saveStore(storePath, store);
  const summary = command.periods
    ? `${changes.length} comparable measures between ${command.periods.join(' and ')}`
    : prior ? `${changes.length} changes since the last check` : 'Baseline saved · run /diff again to see changes';
  session.capability = { kind: 'diff', periods: command.periods ?? null, changes };
  session.result = researchResult(summary);
  orchestrator.save(session);
  await patch(tui, agentName, 'DIFF', summary, changes);
  return session;
}

function snapshot(session) {
  const packet = session.packet ?? {};
  const ownership = rows(packet.shareholding?.data ?? packet.shareholding)[0] ?? {};
  return {
    captured_at: new Date().toISOString(),
    facts: (packet.financial_facts ?? []).map(({ concept_id, period, basis, value, unit }) => ({ concept_id, period, basis, value, unit })),
    ownership: Object.fromEntries(OWNERSHIP.filter(key => ownership[key] != null).map(key => [key, Number(ownership[key])])),
    filings: rows(packet.filings?.data ?? packet.filings).map(item => item.document_id ?? `${item.published_at}:${item.title}`),
    events: rows(packet.events?.data ?? packet.events).map(item => item.event_id ?? `${item.event_at}:${item.title}`),
    actions: rows(packet.actions?.data ?? packet.actions).map(item => item.action_id ?? `${item.ex_date}:${item.action_type}`),
  };
}

export function comparePeriods(current, from, to) {
  const facts = current?.facts ?? [];
  const before = new Map(facts.filter(fact => fact.period === from).map(fact => [`${fact.concept_id}:${fact.basis}`, fact]));
  return facts.filter(fact => fact.period === to && before.has(`${fact.concept_id}:${fact.basis}`)).map(fact => {
    const old = before.get(`${fact.concept_id}:${fact.basis}`);
    return change(LABELS[fact.concept_id] ?? fact.concept_id, old.value, fact.value, fact.unit);
  }).filter(Boolean);
}

export function compareSnapshots(before = {}, after = {}) {
  const changes = [];
  const oldFacts = new Map((before.facts ?? []).map(fact => [`${fact.concept_id}:${fact.period}:${fact.basis}`, fact]));
  const newFacts = new Map((after.facts ?? []).map(fact => [`${fact.concept_id}:${fact.period}:${fact.basis}`, fact]));
  for (const [key, fact] of newFacts) {
    const old = oldFacts.get(key);
    if (!old) changes.push({ field: `${LABELS[fact.concept_id] ?? fact.concept_id} ${fact.period}`, before: '—', after: show(fact.value, fact.unit), status: 'new' });
    else {
      const row = change(`${LABELS[fact.concept_id] ?? fact.concept_id} ${fact.period}`, old.value, fact.value, fact.unit);
      if (row) changes.push(row);
    }
  }
  for (const key of OWNERSHIP) {
    const row = change(key.replace(/_/g, ' '), before.ownership?.[key], after.ownership?.[key], '%');
    if (row) changes.push(row);
  }
  for (const type of ['filings', 'events', 'actions']) {
    const known = new Set(before[type] ?? []);
    const added = (after[type] ?? []).filter(item => !known.has(item)).length;
    if (added) changes.push({ field: `new ${type}`, before: '0', after: String(added), status: 'new' });
  }
  return changes;
}

function change(field, before, after, unit) {
  if (before == null || after == null || Number(before) === Number(after)) return null;
  const delta = Number(after) - Number(before);
  return { field, before: show(before, unit), after: show(after, unit), status: `${delta > 0 ? '+' : ''}${show(delta, unit)}` };
}

function show(value, unit) {
  const number = Number(value);
  if (!Number.isFinite(number)) return String(value ?? '—');
  const rendered = number.toLocaleString('en-IN', { maximumFractionDigits: 2 });
  return unit === '%' ? `${rendered}%` : rendered;
}

async function patch(tui, agent, title, text, changes = []) {
  return tui.render({
    patch: true,
    blocks: [
      { divider: title, id: `capability-${title.toLowerCase().replace(/\s+/g, '-')}` },
      { text, id: 'capability-summary' },
      ...(changes.length ? [{
        table: { headers: ['Field', 'Before', 'After', 'Change'], rows: changes.map(item => ({ cells: [item.field, item.before, item.after, item.status] })) },
        id: 'capability-changes',
      }] : []),
    ],
    _state: { stage: 'complete', agent, follow_ups: [] },
  });
}

function researchResult(summary) {
  return { type: 'research_result', summary, thesis: summary, conviction: 'uncertain', claims: [], risks: [], follow_ups: [] };
}

function rows(value) {
  if (Array.isArray(value)) return value.filter(item => item && typeof item === 'object');
  if (!value || typeof value !== 'object') return [];
  for (const key of ['data', 'items', 'results', 'records']) if (Array.isArray(value[key])) return rows(value[key]);
  return [value];
}

function loadStore(file) {
  try {
    const value = JSON.parse(fs.readFileSync(file, 'utf8'));
    return { theses: value.theses ?? {}, snapshots: value.snapshots ?? {} };
  } catch { return { theses: {}, snapshots: {} }; }
}

function saveStore(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  const tmp = `${file}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  fs.renameSync(tmp, file);
}
