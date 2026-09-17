import { describe, expect, it } from 'vitest';
import { MarkedOrchestrator, verdictPanel } from './orchestrator.js';

function result() {
  return { type: 'research_result', summary: 'Summary', thesis: 'Evidence-led thesis', claims: [], risks: ['Risk'], conviction: 'uncertain' };
}

function harness(data) {
  const renders = [];
  const tui = { render: async payload => { renders.push(payload); return {}; } };
  const agent = { name: 'codex', run: async prompt => (
    prompt.includes('reviewing a data-retrieval plan') ? { verdict: 'ok', reasoning: 'fine' } : result()
  ) };
  let saved;
  const orchestrator = new MarkedOrchestrator({ data, agent, tui, save: session => { saved = session; } });
  return { orchestrator, renders, get saved() { return saved; } };
}

describe('Marked orchestrator', () => {
  it('renders analytical facts separately from interpretation', () => {
    const panel = verdictPanel({
      ...result(),
      bull_case: ['Demand recovers'],
      bear_case: ['Pricing weakens'],
      claims: [
        { text: 'Revenue increased. [ev_1][ev_1]', evidence_ids: ['ev_1', 'ev_1'], classification: 'fact' },
        { text: 'The business became more capital intensive.', evidence_ids: ['ev_1'], classification: 'inference' },
      ],
    }, ['raw validation warning'], 'analytical');
    expect(panel.sections).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'facts', items: ['Revenue increased. [ev_1]'] }),
      expect.objectContaining({ type: 'interpretation', items: ['The business became more capital intensive. [ev_1]'] }),
      expect.objectContaining({ type: 'bull_case', items: ['Demand recovers'] }),
      expect.objectContaining({ type: 'bear_case', items: ['Pricing weakens'] }),
    ]));
    expect(panel.risks).not.toContain('raw validation warning');
    expect(panel.sections.find(section => section.type === 'context').text).toContain('no unsupported material claim was rendered');
  });

  it('passes the complete answer to the adaptive terminal pager', () => {
    const facts = Array.from({ length: 9 }, (_, index) => ({
      text: `Fact ${index + 1}`,
      evidence_ids: [`ev_${index + 1}`],
      classification: 'fact',
    }));
    const items = Array.from({ length: 6 }, (_, index) => `Item ${index + 1}`);
    const panel = verdictPanel({
      ...result(),
      claims: facts,
      bull_case: items,
      bear_case: items,
      catalysts: items,
      risks: items,
      invalidation: items,
    }, [], 'research');

    expect(panel.sections.find(section => section.type === 'facts').items).toHaveLength(9);
    expect(panel.sections.find(section => section.type === 'bull_case').items).toHaveLength(6);
    expect(panel.sections.find(section => section.type === 'bear_case').items).toHaveLength(6);
    expect(panel.sections.find(section => section.type === 'catalysts').items).toHaveLength(6);
    expect(panel.sections.find(section => section.type === 'risks').items).toHaveLength(6);
    expect(panel.sections.find(section => section.type === 'invalidation').text).toContain('Item 6');
  });

  it('retrieves citable promoter holdings for a natural-language comparison', async () => {
    const calls = [];
    const data = {
      resolveCompany: async reference => ({
        company: { company_id: `co_${reference}`, common_name: reference },
        securities: [{ exchange: 'NSE', symbol: reference.toUpperCase(), segment: 'CASH' }],
      }),
      financials: async () => ({ data: [] }),
      shareholding: async ({ ticker }) => {
        calls.push(ticker);
        return { data: [{ period_end: '2026-06-30', promoter_pct: ticker === 'RELIANCE' ? 50.1 : 0 }] };
      },
    };
    const h = harness(data);
    await h.orchestrator.run('Compare Promoter shareholder of reliance and infosys');
    expect(calls).toEqual(['RELIANCE', 'INFOSYS']);
    expect(h.saved.evidence.filter(item => item.data_type === 'shareholding')).toEqual(expect.arrayContaining([
      expect.objectContaining({ company_name: 'reliance', metric: 'promoter_pct', value: 50.1 }),
      expect.objectContaining({ company_name: 'infosys', metric: 'promoter_pct', value: 0 }),
    ]));
  });

  it('finishes an empty screen without buying a model call and renders its filters', async () => {
    const renders = [];
    let agentCalls = 0;
    let saved;
    const orchestrator = new MarkedOrchestrator({
      data: { screen: async () => ({ data: [], meta: { universe: 1799, matched: 0, notes: ['only 0 companies have pledged_pct ingested'] } }) },
      agent: { name: 'claude', run: async () => { agentCalls += 1; return result(); } },
      tui: { render: async payload => { renders.push(payload); } },
      save: session => { saved = session; },
    });
    await orchestrator.run('Screen companies with net margin above 10% and promoter pledge below 1%');
    const filterTable = renders.flatMap(render => render.blocks || []).find(block => block.id === 'screen-filters');
    expect(filterTable.table.rows).toEqual([
      { cells: ['net_margin', '> 10.0%'] },
      { cells: ['pledged', '< 1.0%'] },
    ]);
    expect(agentCalls).toBe(0);
    expect(saved.data_only).toBe(true);
    expect(renders.at(-1)._state.stage).toBe('complete');
  });

  it('still reasons over a non-empty screen', async () => {
    let agentCalls = 0;
    const orchestrator = new MarkedOrchestrator({
      data: { screen: async () => ({ data: [{ company_id: 'co_1', common_name: 'Example', symbol: 'EXAMPLE', metrics: { net_margin: 0.2 } }], meta: { universe: 1, matched: 1 } }) },
      agent: { name: 'claude', run: async () => { agentCalls += 1; return result(); } },
      tui: { render: async () => ({}) },
      save: () => {},
    });
    await orchestrator.run('Screen companies with net margin above 10%');
    expect(agentCalls).toBe(1);
  });

  it('grants native search for an evidence gap and records returned web sources', async () => {
    let options;
    let prompt;
    let saved;
    const orchestrator = new MarkedOrchestrator({
      data: {},
      agent: { name: 'codex', run: async (input, value) => {
        prompt = input;
        options = value;
        return {
          ...result(), sources: ['https://example.com/report'],
          claims: [{ text: 'External context', evidence_ids: ['web_01'], classification: 'external_context' }],
        };
      } },
      tui: { render: async () => ({}) },
      save: session => { saved = session; },
    });
    const session = { intent: { kind: 'query' }, mode: 'research', requested_as_of: null };

    await orchestrator.complete(session, {
      question: 'Who is the new CEO?', asOf: new Date().toISOString(), agentName: 'codex',
      packet: {}, evidence: [], blocks: [], totalTools: 0, mode: 'research',
    });

    expect(options.webSearch).toBe(true);
    expect(prompt).toContain('fill those gaps before concluding');
    expect(prompt).toContain('Do not downgrade the analysis merely because the initial packet is incomplete');
    expect(saved.web_search.reason).toBe('external_context_required');
    expect(saved.evidence).toContainEqual(expect.objectContaining({ evidence_id: 'web_01', source_url: 'https://example.com/report' }));
    expect(saved.validation_warnings).toEqual([]);
  });

  it('requires a completed peer return bridge for performance attribution', async () => {
    let prompt;
    let options;
    const orchestrator = new MarkedOrchestrator({
      data: {},
      agent: { name: 'codex', run: async (input, value) => { prompt = input; options = value; return result(); } },
      tui: { render: async () => ({}) },
      save: () => {},
    });
    const session = {
      intent: { kind: 'query' }, mode: 'analytical', requested_as_of: null,
      research_mandate: {
        version: 1, question: 'Why did Infosys underperform its peers?', mode: 'analytical',
        requirements: [{ id: 'peer_relative_return', label: 'Peer-relative return', material: true }],
      },
    };
    await orchestrator.complete(session, {
      question: 'Why has Infosys underperformed?', asOf: '2026-09-16', agentName: 'codex',
      packet: { data_plan: { analysis_requirements: ['peer_relative_return'] } },
      evidence: [], blocks: [], totalTools: 0, mode: 'analytical',
    });
    expect(options.webSearch).toBe(true);
    expect(prompt).toContain('Complete the bridge from security price/total return');
    expect(prompt).toContain('do not substitute a business-quality discussion');
  });

  it('repairs an incomplete analytical leg and persists the full cycle receipt', async () => {
    let calls = 0;
    let saved;
    const orchestrator = new MarkedOrchestrator({
      data: {},
      agent: { name: 'codex', run: async () => {
        calls += 1;
        if (calls === 1) return {
          ...result(), sources: [], material_gaps: ['peer return missing'],
          coverage: [{ requirement: 'peer_relative_return', status: 'partial', evidence_ids: [], note: 'not found' }],
        };
        return {
          ...result(),
          sources: ['https://example.com/peer-return'], material_gaps: [],
          claims: [{ text: 'Infosys lagged the selected peer.', evidence_ids: ['web_01'], classification: 'external_context' }],
          coverage: [{ requirement: 'peer_relative_return', status: 'complete', evidence_ids: ['web_01'], note: 'completed from dated returns' }],
        };
      } },
      tui: { render: async () => ({}) },
      save: session => { saved = session; },
    });
    const session = {
      intent: { kind: 'query' }, mode: 'analytical', requested_as_of: null,
      research_mandate: {
        version: 1, question: 'Why did Infosys underperform its peers?', mode: 'analytical',
        requirements: [{ id: 'peer_relative_return', label: 'Peer-relative return', material: true }],
      },
    };
    await orchestrator.complete(session, {
      question: 'Why did Infosys underperform its peers?', asOf: '2026-09-16', agentName: 'codex',
      packet: { data_plan: { analysis_requirements: ['peer_relative_return'] } },
      evidence: [], blocks: [], totalTools: 0, mode: 'analytical',
    });
    expect(calls).toBe(2);
    expect(saved.research_cycle.rounds.map(round => round.status)).toEqual(['incomplete', 'complete']);
    expect(saved.research_cycle.final_audit.passed).toBe(true);
    expect(saved.unresolved_material_citation_issues).toBe(0);
    expect(saved.evidence).toContainEqual(expect.objectContaining({ evidence_id: 'web_01' }));
  });

  it('patches completed streamed fields before the final verdict', async () => {
    const renders = [];
    const agent = {
      name: 'claude',
      run: async (_prompt, options) => {
        options.onProgress({
          phase: 'writing', elapsedMs: 15000, outputTokens: 800, targetTokens: 12000,
          etaSeconds: 107, lastField: 'catalysts', liveProse: true,
          fields: { summary: 'Early headline', thesis: 'Early thesis', catalysts: ['New capacity'] },
        });
        return result();
      },
    };
    const orchestrator = new MarkedOrchestrator({
      data: {}, agent,
      tui: { render: async payload => { renders.push(payload); } },
      save: () => {},
    });
    const session = { mode: 'research', requested_as_of: null };

    await orchestrator.complete(session, {
      question: 'Analyze Reliance', asOf: '2026-09-15', agentName: 'claude',
      packet: {}, evidence: [], blocks: [], totalTools: 0, mode: 'research',
    });

    const verdicts = renders.flatMap(render => render.blocks || []).filter(block => block.id === 'verdict');
    expect(verdicts[0].data).toMatchObject({ thesis: 'Early thesis', catalysts: ['New capacity'] });
    expect(renders.find(render => render._state?.progress)?._state.progress.phase).toBe('writing');
    expect(verdicts.at(-1).data.thesis).toBe('Evidence-led thesis');
  });

  it('adds as_of to non-financial datasets only for an explicit rewind', async () => {
    const calls = [];
    const entity = { company: { company_id: 'co_ril', common_name: 'Reliance' }, securities: [{ exchange: 'NSE', symbol: 'RELIANCE', segment: 'CASH' }] };
    const data = {
      resolveCompany: async () => entity,
      prices: async params => { calls.push(['prices', params]); return { data: [] }; },
      financials: async () => ({ data: [] }),
      metrics: async () => ({ data: [] }),
      shareholding: async params => { calls.push(['shareholding', params]); return { data: [] }; },
      filings: async params => { calls.push(['filings', params]); return { data: [] }; },
      corporateActions: async params => { calls.push(['actions', params]); return { data: [] }; },
      events: async params => { calls.push(['events', params]); return { data: [] }; },
    };
    const at = '2024-03-01T23:59:59.999Z';
    await harness(data).orchestrator.run('RELIANCE', { asOf: at, pointInTime: true, dataOnly: true });
    expect(calls.every(([, params]) => params.as_of === at)).toBe(true);

    calls.length = 0;
    await harness(data).orchestrator.run('RELIANCE', { asOf: at, dataOnly: true });
    expect(calls.every(([, params]) => !('as_of' in params))).toBe(true);
  });

  it('routes a scoped risk command through the full company packet and risk procedure', async () => {
    const calls = [];
    let prompt = '';
    let saved;
    const entity = { company: { company_id: 'co_ril', common_name: 'Reliance' }, securities: [{ exchange: 'NSE', symbol: 'RELIANCE', segment: 'CASH' }] };
    const data = {
      resolveCompany: async reference => { calls.push(`resolve:${reference}`); return entity; },
      prices: async () => { calls.push('prices'); return { data: [] }; },
      financials: async () => { calls.push('financials'); return { data: [] }; },
      metrics: async () => { calls.push('metrics'); return { data: [] }; },
      shareholding: async () => { calls.push('shareholding'); return { data: [] }; },
      filings: async () => { calls.push('filings'); return { data: [] }; },
      corporateActions: async () => { calls.push('actions'); return { data: [] }; },
      events: async () => { calls.push('events'); return { data: [] }; },
    };
    const orchestrator = new MarkedOrchestrator({
      data,
      agent: { name: 'claude', run: async value => { prompt = value; return result(); } },
      tui: { render: async () => ({}) },
      save: session => { saved = session; },
    });
    await orchestrator.run('Analyze India-market risks and event impact: Reliance', {
      intentOverride: { kind: 'risk', references: ['Reliance'] },
    });
    expect(calls).toEqual(['resolve:Reliance', 'prices', 'financials', 'metrics', 'shareholding', 'filings', 'actions', 'events']);
    expect(prompt).toContain('Desk procedure (risk)');
    expect(prompt).toContain('transmission channel');
    expect(saved.skill).toBe('risk');
  });

  it('routes broad India macro questions through Marked query', async () => {
    const h = harness({ query: async () => ({ data: { evidence: [{ title: 'RBI policy', value: 'held' }] } }) });
    await h.orchestrator.run('What is the RBI outlook?');
    expect(h.saved.intent.kind).toBe('macro');
    expect(h.saved.packet.query.evidence[0].title).toBe('RBI policy');
    expect(h.renders.at(-1)._state.stage).toBe('complete');
  });

  it('gives a research turn the open World as cited context', async () => {
    let prompt = '';
    const orchestrator = new MarkedOrchestrator({
      data: { query: async () => ({ data: { evidence: [{ title: 'RBI policy', value: 'held' }] } }) },
      agent: { name: 'codex', run: async value => { prompt = value; return result(); } },
      tui: { render: async () => ({}) },
      save: () => {},
    });
    await orchestrator.run('What is the RBI outlook?', { workspace: {
      common_name: 'Infosys', symbol: 'INFY', tab: 'valuation',
      peers: [{ company_id: 'co_tcs', common_name: 'TCS', isin: 'INE467B01029', sector: 'Information Technology' }],
      packet: {
        quote: { data: { price: 100, market_cap: 1000 } },
        events: { data: [{ event_id: 'event_1', event_type: 'earnings', title: 'Results', event_at: '2026-07-01' }] },
        financial_facts: [
          { evidence_id: 'ev_001', concept_id: 'Revenue', value: 100, basis: 'consolidated', period: 'FY2026' },
          { evidence_id: 'ev_002', concept_id: 'ProfitAfterTax', value: 10, basis: 'consolidated', period: 'FY2026' },
          { evidence_id: 'ev_003', concept_id: 'BasicEarningsPerShare', value: 5, basis: 'consolidated', period: 'FY2026' },
        ],
      },
      evidence: [{ evidence_id: 'ev_001', data_type: 'financial_fact', metric: 'Revenue', value: 100 }],
    } });
    expect(prompt).toContain('"active_tab":"valuation"');
    expect(prompt).toContain('"peers":[{"company_id":"co_tcs","common_name":"TCS"');
    expect(prompt).toContain('"valuation":{"period":"FY2026"');
    expect(prompt).toContain('"events":[{"event_id":"event_1"');
    expect(prompt).toContain('"evidence_id":"world_ev_001"');
  });

  it('resolves comparison names before fetching consolidated data', async () => {
    const calls = [];
    const entity = symbol => ({ company: { company_id: `co_${symbol}`, common_name: symbol }, securities: [{ security_id: `sec_${symbol}`, exchange: 'NSE', symbol }] });
    const h = harness({
      resolveCompany: async reference => { calls.push(`resolve:${reference}`); return entity(reference); },
      prices: async ({ ticker }) => ({ data: { ticker, price: 10 } }),
      financials: async ({ ticker }) => ({ data: [{ ticker, concept_id: 'revenue', value: 1 }] }),
      metrics: async ({ ticker }) => ({ data: [{ ticker, metrics: { net_margin: 1 } }] }),
    });
    await h.orchestrator.run('Compare TCS and Infosys');
    expect(calls).toEqual(['resolve:TCS', 'resolve:Infosys']);
    expect(h.saved.entities).toHaveLength(2);
    expect(h.saved.packet.companies).toHaveLength(2);
  });

  it('carries prior turns into the next research packet', async () => {
    let prompt = '';
    const tui = { render: async () => ({}) };
    const agent = { name: 'codex', run: async value => { prompt = value; return result(); } };
    let saved;
    const orchestrator = new MarkedOrchestrator({
      data: { query: async ({ query }) => ({ data: { evidence: [{ title: query, value: 'available' }] } }) },
      agent, tui, save: session => { saved = session; },
    });
    const conversation = {
      conversation_id: 'conversation-test',
      turns: [{ research_id: 'prior', question: 'What changed for Reliance?', answer: result(), created_at: '2026-01-01T00:00:00.000Z' }],
    };
    await orchestrator.run('What about its debt?', { conversation });
    expect(saved.conversation_id).toBe('conversation-test');
    expect(saved.history[0].question).toBe('What changed for Reliance?');
    expect(prompt).toContain('What changed for Reliance?');
  });

  it('renders market visuals when Luna identifies a company inside a natural query', async () => {
    const entity = { company: { company_id: 'co_infy', common_name: 'Infosys' }, securities: [{ exchange: 'NSE', symbol: 'INFY', segment: 'CASH', security_type: 'EQ' }] };
    const h = harness({
      query: async () => ({ data: { route: 'exact', plan: { route: 'exact', reference: 'Infosys' }, evidence: { facts: [{ concept_id: 'ProfitAfterTax', value: '10', unit: 'INR', fiscal_year: 2025, basis: 'consolidated' }], companies: [{ name: 'Infosys', ticker: 'INFY' }] } } }),
      resolveCompany: async () => entity,
      // Two candles, because a chart of a single point is not a chart and the
      // renderer now drops it rather than drawing a flat line.
      prices: async () => ({ data: [
        { ts: '2026-01-01', open: '10', high: '11', low: '9', close: '10', volume: '100' },
        { ts: '2026-01-02', open: '10', high: '12', low: '10', close: '11', volume: '120' },
      ] }),
    });
    await h.orchestrator.run('and Infosys earnings in FY2025');
    const ids = h.renders.flatMap(render => (render.blocks || []).map(block => block.id));
    expect(ids).toContain('query-price-chart-0');
    expect(ids).toContain('query-price-candles-0');
  });

  it('does not resolve a semantic sentence as a company reference', async () => {
    let resolved = false;
    const h = harness({
      query: async () => ({ data: { route: 'exact', plan: { route: 'exact', reference: 'Reliance Industries PAT growth from FY2024 to FY2026' }, evidence: { facts: [{ concept_id: 'ProfitAfterTax', value: '10', fiscal_year: 2026 }] } } }),
      resolveCompany: async () => { resolved = true; throw new Error('should not resolve semantic prose'); },
    });
    await h.orchestrator.run('Reliance Industries PAT growth from FY2024 to FY2026');
    expect(resolved).toBe(false);
    expect(h.saved.intent.kind).toBe('query');
  });

  it('completes company research when optional datasets are unavailable', async () => {
    const entity = { company: { company_id: 'co_ril', common_name: 'Reliance Industries' }, securities: [{ exchange: 'NSE', symbol: 'RELIANCE', segment: 'CASH' }] };
    const unavailable = async () => { throw new Error('temporarily unavailable'); };
    const h = harness({
      resolveCompany: async () => entity,
      prices: unavailable,
      financials: async () => ({ data: [{ concept_id: 'Revenue', value: '10', fiscal_year: 2026 }] }),
      metrics: unavailable,
      shareholding: unavailable,
      filings: unavailable,
      corporateActions: unavailable,
      events: unavailable,
    });
    await h.orchestrator.run('Analyze Reliance Industries');
    expect(h.saved.result.summary).toBe('Summary');
    expect(h.saved.packet.price.error).toBe('temporarily unavailable');
  });
});

// ── Research packet guarantee ───────────────────────────────────────────────
// A planning or search response is not financial evidence. These cases fail if
// the runtime ever hands a reasoning worker a packet whose only content is a
// `needs_plan` envelope, a `query_evidence` object or generic search results.

function annualFact(company, concept, fiscalYear, value) {
  return {
    fact_id: `f_${company.ticker}_${concept}_${fiscalYear}`,
    company_id: company.id, company_name: company.name, ticker: company.ticker,
    concept_id: concept, fiscal_year: fiscalYear, period_end: `${fiscalYear}-03-31`,
    basis: 'consolidated', value: String(value), unit: 'INR', scale: 1,
    source: 'nse', source_url: `https://nsearchives.nseindia.com/${company.ticker}-${fiscalYear}.xml`,
    document_id: `doc_${company.ticker}_${fiscalYear}`, known_at: `${fiscalYear}-05-01T00:00:00Z`,
  };
}

const COMPANIES = {
  RELIANCE: { id: 'co_ril', name: 'Reliance Industries', ticker: 'RELIANCE' },
  INFY: { id: 'co_infy', name: 'Infosys', ticker: 'INFY' },
  TCS: { id: 'co_tcs', name: 'TCS', ticker: 'TCS' },
};

/** A Marked stand-in whose /v1/query always answers `needs_plan`, as the live API does. */
function factClient(facts, { onQuery } = {}) {
  const calls = { financials: [], query: [] };
  const lookup = reference => Object.values(COMPANIES)
    .find(company => company.name.toLowerCase().startsWith(String(reference).toLowerCase())
      || company.ticker.toLowerCase() === String(reference).toLowerCase());
  return {
    calls,
    resolveCompany: async reference => {
      const company = lookup(reference);
      if (!company) throw new Error(`Company not found: ${reference}`);
      return {
        company: { company_id: company.id, common_name: company.name, legal_name: company.name },
        securities: [{ exchange: 'NSE', symbol: company.ticker, segment: 'CASH', security_type: 'EQ' }],
      };
    },
    financials: async params => {
      calls.financials.push(params);
      const concepts = new Set(String(params.concept || '').split(','));
      return { data: facts.filter(item => item.ticker === params.ticker && concepts.has(item.concept_id) && params.basis === item.basis) };
    },
    metrics: async () => ({ data: [] }),
    prices: async () => { throw new Error('prices must not be fetched for a metric-only request'); },
    query: async body => { calls.query.push(body); return onQuery ? onQuery(body) : { data: { status: 'needs_plan', evidence: {}, detail: 'Supply a RetrievalPlan' } }; },
  };
}

const numericFacts = session => (session.packet.financial_facts || []).filter(item => Number.isFinite(item.value));

describe('research packet guarantee', () => {
  it('answers "Reliance PAT FY2025" with a real value, not a search object', async () => {
    const data = factClient([annualFact(COMPANIES.RELIANCE, 'ProfitAfterTax', 2025, 810_000_000_000)]);
    const h = harness(data);
    await h.orchestrator.run('Reliance PAT FY2025');

    expect(h.saved.data_plan).toMatchObject({ route: 'financial_metric_lookup', metric: 'ProfitAfterTax', fiscal_years: [2025] });
    expect(data.calls.financials[0]).toMatchObject({ ticker: 'RELIANCE', concept: 'ProfitAfterTax', period: 'annual', basis: 'consolidated' });
    expect(numericFacts(h.saved)).toHaveLength(1);
    expect(numericFacts(h.saved)[0]).toMatchObject({ value: 810_000_000_000, concept_id: 'ProfitAfterTax', period: 'FY2025', basis: 'consolidated', unit: 'INR', currency: 'INR', company_id: 'co_ril' });
    expect(h.saved.evidence.every(item => item.data_type === 'financial_fact')).toBe(true);
    expect(h.saved.evidence[0].source_url).toMatch(/nseindia/);
  });

  it('gives FY2024, FY2025 and FY2026 their own values and their own evidence IDs', async () => {
    const data = factClient([2024, 2025, 2026].map((year, index) => annualFact(COMPANIES.RELIANCE, 'ProfitAfterTax', year, 790_000_000_000 + index * 10_000_000_000)));
    const h = harness(data);
    await h.orchestrator.run("Why did Reliance Industries' PAT grow from FY2024 to FY2026?");

    const pat = numericFacts(h.saved).filter(item => item.concept_id === 'ProfitAfterTax');
    expect(pat.map(item => item.period)).toEqual(['FY2024', 'FY2025', 'FY2026']);
    expect(new Set(pat.map(item => item.evidence_id)).size).toBe(3);
    const growth = h.saved.packet.derived_metrics[0];
    expect(growth).toMatchObject({ concept_id: 'ProfitAfterTax', denominator: 790_000_000_000, from_period: 'FY2024', to_period: 'FY2026', basis: 'consolidated', unit: 'INR' });
    // A derived figure must point at the two facts it was computed from.
    expect(growth.evidence_ids).toEqual([pat[0].evidence_id, pat[2].evidence_id]);
    expect(h.saved.packet.data_gaps).toEqual([]);
  });

  it('resolves "last financial year" to a fiscal year and retrieves that year', async () => {
    const data = factClient([annualFact(COMPANIES.INFY, 'ProfitAfterTax', 2026, 270_000_000_000)]);
    const h = harness(data);
    await h.orchestrator.run('Infosys earnings last financial year', { asOf: '2026-09-14T00:00:00.000Z' });

    expect(h.saved.data_plan.fiscal_years).toEqual([2026]);
    expect(numericFacts(h.saved)[0]).toMatchObject({ ticker: 'INFY', period: 'FY2026', value: 270_000_000_000 });
  });

  it('retrieves both sides of a comparison as separately sourced facts', async () => {
    const data = factClient([
      annualFact(COMPANIES.TCS, 'ProfitAfterTax', 2025, 480_000_000_000),
      annualFact(COMPANIES.INFY, 'ProfitAfterTax', 2025, 270_000_000_000),
    ]);
    const h = harness(data);
    await h.orchestrator.run('TCS vs Infosys PAT FY2025');

    expect(h.saved.data_plan.route).toBe('comparison');
    expect(data.calls.financials.map(call => call.ticker)).toEqual(['TCS', 'INFY']);
    const byTicker = Object.fromEntries(numericFacts(h.saved).map(item => [item.ticker, item.value]));
    expect(byTicker).toEqual({ TCS: 480_000_000_000, INFY: 270_000_000_000 });
    expect(new Set(h.saved.evidence.map(item => item.evidence_id)).size).toBe(2);
  });

  it('does not fetch price context for a metric-only request', async () => {
    const data = factClient([annualFact(COMPANIES.RELIANCE, 'ProfitAfterTax', 2025, 810_000_000_000)]);
    const h = harness(data);
    await expect(h.orchestrator.run('Reliance PAT FY2025')).resolves.toBeTruthy();
    expect(h.saved.evidence.some(item => item.data_type === 'price')).toBe(false);
  });

  it('renders a quote dataset without a separate text formatter', async () => {
    const company = COMPANIES.RELIANCE;
    const h = harness({
      resolveCompany: async () => ({
        company: { company_id: company.id, common_name: company.name },
        securities: [{ exchange: 'NSE', symbol: company.ticker, segment: 'CASH' }],
      }),
      prices: async () => ({ data: { price: 1500, change_percent: 1.2, market_cap: 10_000 } }),
      financials: async () => ({ data: [] }),
      query: async () => ({ data: { status: 'needs_plan' } }),
    });
    await expect(h.orchestrator.run('Reliance market cap')).resolves.toBeTruthy();
    expect(h.renders.flatMap(render => render.blocks || []).find(block => block.id === 'quote-0')?.data)
      .toMatchObject({ ticker: 'RELIANCE', price: 1500, marketCap: 10_000 });
  });

  it('renders a DATA GAP and never launches the worker when Marked has no such fact', async () => {
    let launched = false;
    const data = factClient([]);
    const tui = { render: async () => ({}) };
    const renders = [];
    tui.render = async payload => { renders.push(payload); return {}; };
    let saved;
    const orchestrator = new MarkedOrchestrator({
      // The plan reviewer and the reasoning worker share one provider. Only the
      // second counts as "launching the worker" — the point of the guarantee is
      // that no answer is written from an empty packet.
      data, tui, agent: { name: 'codex', run: async prompt => {
        if (prompt.includes('reviewing a data-retrieval plan')) return { verdict: 'ok', reasoning: 'plan is fine' };
        launched = true;
        return result();
      } },
      save: session => { saved = session; },
    });
    await orchestrator.run("Why did Reliance Industries' PAT grow from FY2024 to FY2026?");

    expect(launched).toBe(false);
    expect(saved.result).toBeUndefined();
    const text = renders.flatMap(render => render.blocks || []).map(block => block.text || block.divider || '').join('\n');
    expect(text).toContain('DATA GAP');
    expect(text).not.toContain('needs_plan');
    // The canonical label, not one derived from the identifier.
    expect(text).toMatch(/could not retrieve Profit after tax for FY2024, FY2025, FY2026/);
    expect(renders.at(-1)._state.stage).toBe('complete');
  });

  it('names the missing year while still reporting the years it has', async () => {
    const data = factClient([
      annualFact(COMPANIES.RELIANCE, 'ProfitAfterTax', 2024, 790_200_000_000),
      annualFact(COMPANIES.RELIANCE, 'ProfitAfterTax', 2026, 957_540_000_000),
    ]);
    const h = harness(data);
    await h.orchestrator.run("Why did Reliance Industries' PAT grow from FY2024 to FY2026?");

    expect(h.saved.packet.data_gaps).toContainEqual({ reference: 'Reliance Industries', concept: 'ProfitAfterTax', fiscal_year: 2025 });
    expect(numericFacts(h.saved).map(item => item.period)).toEqual(['FY2024', 'FY2026']);
  });

  it('treats needs_plan as an instruction to plan, never as research data', async () => {
    const seen = [];
    const data = factClient([annualFact(COMPANIES.RELIANCE, 'ProfitAfterTax', 2026, 957_540_000_000)], {
      onQuery: body => {
        seen.push(body);
        // Marked answers needs_plan until the caller supplies a RetrievalPlan.
        return body.plan
          ? { data: { status: 'ok', plan: body.plan, evidence: { facts: [], documents: [{ document_id: 'doc_1', title: 'FY2026 results', content: 'narrative' }] } } }
          : { data: { status: 'needs_plan', evidence: {}, detail: 'Supply a RetrievalPlan', supported_concepts: ['ProfitAfterTax'] } };
      },
    });
    const h = harness(data);
    await h.orchestrator.run("Why did Reliance Industries' PAT grow from FY2026 to FY2026?");

    // The planning call comes first and is unplanned by definition; the retry
    // that follows a needs_plan carries the plan this runtime built.
    expect(seen.length).toBeGreaterThanOrEqual(2);
    expect(seen.every(body => typeof body.query === 'string')).toBe(true);
    expect(seen.at(-1).plan).toMatchObject({ reference: 'Reliance Industries', period: 'annual', basis: 'consolidated' });
    // Nothing in the packet or the evidence is the planning envelope itself.
    const serialized = JSON.stringify(h.saved.evidence);
    expect(serialized).not.toContain('needs_plan');
    expect(serialized).not.toContain('query_evidence');
    expect(numericFacts(h.saved)).toHaveLength(1);
  });

  it('drops a needs_plan envelope instead of turning it into one generic evidence record', async () => {
    const h = harness({ query: async () => ({ data: { status: 'needs_plan', evidence: {}, detail: 'Supply a RetrievalPlan' } }) });
    await h.orchestrator.run('What is the RBI policy outlook?');
    expect(h.saved.evidence).toEqual([]);
  });

  it('expands semantic filing hits under a fixed harness-side budget', async () => {
    const filings = [];
    let agentCalls = 0;
    let saved;
    const orchestrator = new MarkedOrchestrator({
      data: {
        query: async () => ({ data: {
          status: 'ok',
          plan: { route: 'semantic', reference: 'Infosys', concepts: [], search_text: 'earnings call transcript' },
          evidence: { documents: [
            { document_id: 'doc_latest', title: 'Q1 FY27 earnings call', content: 'Cover letter and participant list.' },
            { document_id: 'doc_older', title: 'Q4 FY26 earnings call', content: 'Older call.' },
          ] },
        } }),
        resolveCompany: async () => ({
          company: { company_id: 'co_infy', common_name: 'Infosys' },
          securities: [{ exchange: 'NSE', symbol: 'INFY', segment: 'CASH' }],
        }),
        financials: async () => ({ data: [] }),
        filing: async documentId => {
          filings.push(documentId);
          return { data: {
            document_id: documentId,
            title: 'Q1 FY27 earnings call',
            source_url: 'https://example.test/infy-call',
            sections: [{
              section_index: 4,
              heading: 'Management discussion',
              content: `Management discussed demand, margins, guidance and deal wins. ${'detail '.repeat(4_000)}`,
            }],
          } };
        },
      },
      agent: { name: 'codex', run: async () => { agentCalls++; return result(); } },
      tui: { render: async () => ({}) },
      save: session => { saved = session; },
    });

    await orchestrator.run('What is the summary of the Infosys earnings call transcript?');

    expect(filings).toEqual(['doc_latest']);
    expect(saved.packet.narrative_evidence).toEqual(expect.arrayContaining([
      expect.objectContaining({ document_id: 'doc_latest', heading: 'Management discussion' }),
    ]));
    expect(saved.research_loop).toMatchObject({ requests: 1, stop_reason: 'evidence_target' });
    // The provider fixture intentionally omits the required coverage receipt,
    // so the production completion gate performs its one bounded repair.
    expect(agentCalls).toBe(2);
  });
});

// ── Packet hygiene ──────────────────────────────────────────────────────────
// The saved session keeps everything; the prompt must not. A 283 KB packet cost
// minutes of reasoning time for context the worker could not use.

describe('prompt packet', () => {
  const company = {
    company: { company_id: 'co_ril', common_name: 'Reliance Industries', metadata: { raw: 'x'.repeat(2000) } },
    securities: [{ exchange: 'NSE', symbol: 'RELIANCE', segment: 'CASH', security_type: 'EQ', metadata: { raw: 'y'.repeat(2000) } }],
  };
  const fact = (concept, year) => ({
    fact_id: `f_${concept}_${year}`, company_id: 'co_ril', company_name: 'Reliance Industries', ticker: 'RELIANCE',
    concept_id: concept, fiscal_year: year, period_end: `${year}-03-31`, basis: 'consolidated',
    value: '1000', unit: 'INR', scale: 1, document_id: 'doc_1',
    source_url: `https://nsearchives.nseindia.com/${'long-path-'.repeat(8)}${concept}.xml`,
  });

  function profileClient() {
    return {
      resolveCompany: async () => company,
      prices: async () => ({ data: [{ ts: '2026-01-01', open: '1', high: '2', low: '1', close: '1500', volume: '10' }] }),
      financials: async () => ({ data: [fact('Revenue', 2026), fact('ProfitAfterTax', 2026)] }),
      metrics: async () => ({ data: [{ fiscal_year: 2026, basis: 'consolidated', company_id: 'co_ril', metrics: { net_margin: 0.1 } }] }),
      shareholding: async () => ({ data: [{ period_end: '2026-06-30', promoter_pct: '50.48', fii_pct: '17.20', dii_pct: '21.19', mutual_fund_pct: '10.11', public_pct: '49.52', pledged_pct: null, holders: [{ holder_name: 'Mukesh D Ambani', rank: 1, ownership_pct: null, shares: null }] }] }),
      filings: async () => ({ data: [{ document_id: 'd1', title: 'Results', document_type: 'financial_results', published_at: '2026-04-24', body: 'z'.repeat(5000) }] }),
      corporateActions: async () => ({ data: [] }),
      events: async () => ({ data: [] }),
    };
  }

  function capture(data) {
    let context;
    const renders = [];
    const orchestrator = new MarkedOrchestrator({
      data,
      tui: { render: async payload => { renders.push(payload); return {}; } },
      agent: { name: 'codex', run: async prompt => {
        if (prompt.includes('reviewing a data-retrieval plan')) return { verdict: 'ok', reasoning: 'fine' };
        context = JSON.parse(prompt.slice(prompt.indexOf('\n\n{') + 2));
        return result();
      } },
      save: () => {},
    });
    return { orchestrator, renders, get context() { return context; } };
  }

  it('never ships provider metadata or raw rows the facts already represent', async () => {
    const h = capture(profileClient());
    await h.orchestrator.run('research reliance');
    const serialized = JSON.stringify(h.context.packet);
    expect(serialized).not.toContain('metadata');
    expect(serialized).not.toContain('xxxxxxxxxx');   // entity.metadata blob
    expect(serialized).not.toContain('zzzzzzzzzz');   // filing body
    expect(h.context.packet.financials).toBeUndefined();
    expect(h.context.packet.metrics).toBeUndefined();
  });

  it('maps normalized backend news into the reasoning packet with provenance', async () => {
    const data = profileClient();
    let params;
    data.news = async value => {
      params = value;
      return { data: [{
        news_id: 'news_1', headline: 'Reliance update', publisher: 'NSE', feed: 'nse_announcements',
        url: 'https://example.com/news/1', published_at: '2026-09-16T09:00:00Z', source_tier: 'official',
        summary: 'Official summary', company_ids: ['co_ril'], security_ids: ['sec_ril'],
        sectors: [], regions: ['india'], topics: ['earnings'], event_id: null,
      }] };
    };
    const h = capture(data);
    await h.orchestrator.run('research reliance');
    expect(params).toEqual({ company: 'RELIANCE', limit: 20 });
    expect(h.context.packet.news[0]).toMatchObject({
      news_id: 'news_1', feed: 'nse_announcements', summary: 'Official summary',
      company_ids: ['co_ril'], security_ids: ['sec_ril'], regions: ['india'], topics: ['earnings'],
    });
    expect(h.context.evidence).toEqual(expect.arrayContaining([
      expect.objectContaining({ data_type: 'news', title: 'Reliance update', source_url: 'https://example.com/news/1' }),
    ]));
  });

  it('sends each fact as a number plus its evidence id, not a second copy of its source', async () => {
    const h = capture(profileClient());
    await h.orchestrator.run('research reliance');
    const [first] = h.context.packet.financial_facts;
    expect(first).toMatchObject({ concept_id: 'Revenue', period: 'FY2026', value: 1000, unit: 'INR', basis: 'consolidated' });
    expect(first.evidence_id).toMatch(/^ev_/);
    expect(first.source_url).toBeUndefined();
    // The source is still one lookup away, in the evidence record it names.
    const cited = h.context.evidence.find(item => item.evidence_id === first.evidence_id);
    expect(cited.source_url).toContain('nseindia');
  });

  it('reads the ownership split from the aggregates when named holders have no percentage', async () => {
    // Marked returns holder names with ownership_pct null for most companies;
    // rendering those as a list at 0.0% tells the reader nothing.
    const h = capture(profileClient());
    await h.orchestrator.run('research reliance');
    const panel = h.renders.flatMap(render => render.blocks || []).find(block => block.id === 'holders');
    expect(panel.data.holders).toEqual([
      { name: 'Promoter', percent: 50.48 },
      { name: 'FII', percent: 17.2 },
      { name: 'DII', percent: 21.19 },
      { name: 'Mutual funds', percent: 10.11 },
      { name: 'Public', percent: 49.52 },
    ]);
  });

  it('prefers named holders when they actually carry percentages', async () => {
    const data = profileClient();
    data.shareholding = async () => ({ data: [{ period_end: '2026-06-30', promoter_pct: '50.48', holders: [{ holder_name: 'LIC', ownership_pct: '6.5', shares: '100' }] }] });
    const h = capture(data);
    await h.orchestrator.run('research reliance');
    const panel = h.renders.flatMap(render => render.blocks || []).find(block => block.id === 'holders');
    expect(panel.data.holders).toEqual([{ name: 'LIC', percent: 6.5, shares: 100 }]);
  });
});
