import { describe, expect, it } from 'vitest';
import { MarkedOrchestrator } from './orchestrator.js';

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
  it('routes broad India macro questions through Marked query', async () => {
    const h = harness({ query: async () => ({ data: { evidence: [{ title: 'RBI policy', value: 'held' }] } }) });
    await h.orchestrator.run('What is the RBI outlook?');
    expect(h.saved.intent.kind).toBe('macro');
    expect(h.saved.packet.query.evidence[0].title).toBe('RBI policy');
    expect(h.renders.at(-1)._state.stage).toBe('complete');
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
