import { buildEvidence, financialFactEvidence, validateClaims, validateFinancialFacts } from '../data/evidence.js';
import { isPercent, LABELS, normalizeFinancialRows } from '../data/normalization.js';
import { conversationHistory, createSession, saveSession } from './session.js';
import { promptForResult, validateResearchResult } from './output-schema.js';
import { classifyIntent, looksLikeCompanyReference } from './intent.js';
import { classifyOutputMode } from './mode.js';
import { resolveTemporal, resolvedQuestion } from './temporal.js';
import { buildDataPlan, derivedGrowth, executeDataPlan, flattenMetricRows, markedPlan, resolvePlan } from './plan.js';
import { planReviewSchema, postflightConcern, reviewPlan } from './plan-review.js';
import { datasetCatalogue } from '../data/catalogue.js';
import { selectEquity } from '../data/marked-client.js';

export class MarkedOrchestrator {
  constructor({ data, agent, tui, cwd = process.cwd(), save = saveSession }) {
    this.data = data;
    this.agent = agent;
    this.tui = tui;
    this.cwd = cwd;
    this.save = save;
  }

  async run(question, { asOf = new Date().toISOString(), agentName = this.agent.name, conversation, intentOverride, plan } = {}) {
    const session = createSession(question, { agent: agentName, asOf });
    session.conversation_id = conversation?.conversation_id;
    session.history = conversationHistory(conversation);
    session.temporal = resolveTemporal(question, asOf);
    const state = (stage, extra = {}) => this.tui.render({
      patch: true,
      _state: { stage, agent: agentName, query: question, ...extra },
    });

    await this.tui.render({
      blocks: [{ text: '▐██ MARKED' }, { divider: 'RESEARCH' }],
      _state: { stage: 'resolving', agent: agentName, query: question },
    });
    await state('resolving');

    const inferredIntent = classifyIntent(question);
    const intent = intentOverride ? { ...inferredIntent, ...intentOverride } : inferredIntent;
    session.intent = intent;
    // Marked's planner reads the question; the local extractor is the fallback.
    const dataPlan = plan
      ?? await resolvePlan(this.data, question, {
        temporal: session.temporal,
        asOf: historicalQuery(question, asOf) ? asOf : null,
        declared: intentOverride ?? null,
      });
    session.data_plan = dataPlan;
    session.mode = classifyOutputMode(question, intent, dataPlan);
    // A question that names a financial measure is a data-retrieval job, not a
    // search job. It never reaches a reasoning worker on search evidence alone.
    // A prose question about a company that resolved no measure is the case
    // review exists to repair, so it takes the planned path and gets triaged
    // there. A bare "Analyze X" still gets the full company profile instead.
    // A bare "Analyze X" keeps the full company profile, and a comparison keeps
    // the side-by-side path; both already answer well without a repair pass.
    const repairable = dataPlan.subject === 'company'
      && intent.kind !== 'company' && intent.kind !== 'compare';
    // A quote request needs no concepts and no review: fetch and answer.
    const priceOnly = dataPlan.route === 'price_lookup' || dataPlan.datasets?.includes('quote');
    if ((dataPlan.requires_facts || repairable || priceOnly) && this.data.financials && this.data.resolveCompany) {
      return this.runPlanned(session, dataPlan, { question, asOf, agentName, state, conversation, mode: session.mode, temporal: session.temporal });
    }
    if (intent.kind === 'compare') {
      const references = dataPlan.references.length >= 2 ? dataPlan.references : intent.references;
      return this.runCompare(session, { ...intent, references }, { question, asOf, agentName, state, conversation, mode: session.mode, temporal: session.temporal });
    }
    if (intent.kind !== 'company') return this.runQuery(session, intent, { question, asOf, agentName, state, conversation, mode: session.mode, temporal: session.temporal });

    // The plan's extractor strips metric and period words, so it yields
    // "Reliance" where the legacy regex yields "Reliance's latest filing".
    const reference = dataPlan.references[0] || intent.references[0] || question.trim();
    const entity = await this.data.resolveCompany(reference);
    return this.runCompany(session, entity, { question, asOf, agentName, state, reference, conversation, mode: session.mode, temporal: session.temporal, route: dataPlan.route });
  }

  async runCompany(session, entity, { question, asOf, agentName, state, reference, conversation, mode, temporal, route = 'factual_lookup' }) {
    session.entity = entity;
    const security = selectEquity(entity.securities);
    if (!security?.symbol) throw new Error(`No tradable security found for ${reference}`);

    await this.tui.render({
      patch: true,
      blocks: [
        { divider: 'COMPANY' },
        { panel: 'quote', id: 'quote', data: { ticker: security.symbol, name: entity.company.common_name, price: null, changePct: 0, marketCap: 0 } },
        { text: `${entity.company.legal_name || entity.company.common_name || reference} · ${security.exchange}:${security.symbol} · ${security.isin || entity.company.isin || 'ISIN unavailable'}` },
      ],
      _state: { stage: 'gathering', agent: agentName, query: question, tools: { called: 1, total: 7, current: 'prices' } },
    });

    let called = 1;
    const gather = async (label, fn) => {
      let value;
      try {
        value = await fn();
      } catch (error) {
        value = { data: [], error: error.message };
      }
      called += 1;
      await this.tui.render({
        patch: true,
        blocks: [{ text: `${value.error ? '△' : '✓'} ${label}${value.error ? ' unavailable' : ''}`, id: 'progress' }],
        _state: { stage: 'gathering', agent: agentName, query: question, tools: { called, total: 7, current: label } },
      });
      return value;
    };

    const price = await gather('prices loaded', () => this.data.prices({ ticker: security.symbol, exchange: security.exchange || 'NSE', latest: false, limit: 30 }));
    const financials = await gather('financials loaded', () => this.data.financials({ ticker: security.symbol, period: 'annual', basis: 'consolidated', as_of: asOf, limit: 200 }));
    const metrics = await gather('metrics loaded', () => this.data.metrics({ ticker: security.symbol, period: 'annual', basis: 'consolidated', as_of: asOf }));
    // A question about a filing or an event is answered by documents. Carrying a
    // decade of the income statement into that packet is noise, not context, so
    // narrow the financial history to the years that frame the disclosure.
    // A profile is answered by recent history. Ten years of every line item makes
    // the packet slower to reason over and the answer vaguer, not better; a
    // question that wants an older year names it and takes the planned route.
    const narrative = route === 'filing_research' || route === 'event_research';
    const years = narrative ? 2 : 5;
    const scopedFinancials = temporal ? scopeFiscalYear(financials, temporal.fiscal_year) : recentFiscalYears(financials, years);
    const scopedMetrics = temporal ? scopeFiscalYear(metrics, temporal.fiscal_year) : recentFiscalYears(metrics, years);
    const shareholding = await gather('shareholding loaded', () => this.data.shareholding({ ticker: security.symbol, holders: true, limit: 4 }));
    const filings = await gather('filings loaded', () => this.data.filings({ ticker: security.symbol, limit: 10 }));
    const actions = await gather('corporate actions loaded', () => this.data.corporateActions({ ticker: security.symbol, limit: 10 }));
    const events = await gather('events loaded', () => this.data.events({ ticker: security.symbol, limit: 10 }));

    const checked = checkFinancials({ entity, security, financials: scopedFinancials, metrics: scopedMetrics });
    const packet = {
      focus: route,
      entity, security, price, shareholding, filings, actions, events, temporal,
      financial_facts: checked.facts, rejected_rows: checked.rejected.length,
      financials: scopedFinancials, metrics: scopedMetrics,
    };
    const evidence = [
      ...checked.evidence,
      ...collectEvidence(entity.company.company_id, [
        [shareholding, 'shareholding'], [filings, 'filing'], [actions, 'corporate_action'], [events, 'event'],
      ]),
    ];
    const financialBlocks = [
      { divider: 'FINANCIAL PROFILE' },
      { panel: 'chart', id: 'price-chart', data: priceChart(price, `${security.exchange}:${security.symbol}`) },
      { panel: 'candlestick', id: 'price-candles', data: priceCandles(price, `${security.exchange}:${security.symbol}`) },
      { table: financialTable(scopedFinancials, scopedMetrics) },
      { divider: 'OWNERSHIP & DISCLOSURES' },
      { panel: 'holders', id: 'holders', data: holderPanel(shareholding) },
      { panel: 'filings', id: 'filings', data: filingPanel(filings) },
      { divider: 'EVENTS & ACTIONS' },
      { table: eventTable(events, actions) },
    ];
    const disclosureBlocks = [
      { divider: 'DISCLOSURES' },
      { panel: 'filings', id: 'filings-lead', data: filingPanel(filings) },
      { table: eventTable(events, actions) },
    ];
    const blocks = narrative ? [...disclosureBlocks, ...financialBlocks.filter(block => block.id !== 'filings')] : financialBlocks;
    return this.complete(session, { question, asOf, agentName, state, packet, evidence, blocks, totalTools: 7, conversation, mode });
  }

  async runCompare(session, intent, { question, asOf, agentName, state, conversation, mode }) {
    if (intent.references.length < 2) throw new Error('Comparison needs at least two company references');
    await state('gathering', { tools: { called: 0, total: intent.references.length * 3, current: 'entity resolution' } });
    const entities = await Promise.all(intent.references.slice(0, 5).map(reference => this.data.resolveCompany(reference)));
    const companies = await Promise.all(entities.map(async entity => {
      const security = selectEquity(entity.securities);
      if (!security?.symbol) throw new Error(`No tradable security found for ${entity.company.common_name}`);
      const safe = async fn => { try { return await fn(); } catch (error) { return { data: [], error: error.message }; } };
      const [price, financials, metrics] = await Promise.all([
        safe(() => this.data.prices({ ticker: security.symbol, exchange: security.exchange || 'NSE', latest: false, limit: 30 })),
        safe(() => this.data.financials({ ticker: security.symbol, period: 'annual', basis: 'consolidated', as_of: asOf, limit: 100 })),
        safe(() => this.data.metrics({ ticker: security.symbol, period: 'annual', basis: 'consolidated', as_of: asOf })),
      ]);
      return { entity, security, price, financials, metrics };
    }));
    session.entities = companies.map(item => item.entity);
    const checked = companies.map(item => checkFinancials(item));
    companies.forEach((item, index) => { item.financial_facts = checked[index].facts; });
    const evidence = [
      ...checked.flatMap(item => item.evidence),
      ...companies.flatMap(item => collectEvidence(item.entity.company.company_id, [[item.price, 'price']])),
    ];
    const compareCharts = companies.flatMap((item, index) => [
      { panel: 'chart', id: `price-chart-${index}`, data: priceChart(item.price, `${item.security.exchange}:${item.security.symbol}`) },
      { panel: 'candlestick', id: `price-candles-${index}`, data: priceCandles(item.price, `${item.security.exchange}:${item.security.symbol}`) },
    ]);
    return this.complete(session, {
      question, asOf, agentName, state,
      packet: { companies, financial_facts: checked.flatMap(item => item.facts) }, evidence,
      blocks: [{ divider: 'COMPARISON' }, ...compareCharts, { table: comparisonTable(companies) }],
      totalTools: companies.length * 3, conversation, mode,
    });
  }


  /**
   * The financial-data route. Resolves identity, retrieves every requested
   * concept for every requested period from Marked's deterministic endpoints,
   * validates each value, and refuses to launch a reasoning worker on a packet
   * that has no numbers in it.
   */
  async runPlanned(session, plan, { question, asOf, agentName, state, conversation, mode, temporal }) {
    const label = plan.route.replace(/_/g, ' ');
    await state('gathering', { tools: { called: 0, total: plan.references.length + 1, current: `${label} · identity` } });

    // Judge the plan before spending requests on it. Neither planner is
    // authoritative, so a reasoning pass checks the merge against the question
    // and says what it would still be unable to answer.
    // Reviewing costs about forty seconds, so it is bought on evidence, not by
    // default. Cheap triage first; the judge only when the plan looks wrong.
    // It is background work either way — the user asked a research question and
    // should not watch the machine deliberate about its own query plan.
    const reviews = [];
    const review = async concern => {
      const reviewed = await reviewPlan(this.agent, question, plan, plan.candidates, {
        cwd: this.cwd,
        schema: planReviewSchema,
        catalogue: await datasetCatalogue(this.data),
        concern,
      });
      reviews.push(...reviewed.reviews.map(entry => ({ ...entry, concern })));
      const changed = reviewed.plan !== plan;
      plan = reviewed.plan;
      session.data_plan = plan;
      return changed;
    };

    // Retrieve first, always. The merged plan has already passed deterministic
    // validation, and the only honest test of a plan is what it brings back —
    // so nothing is spent on judgement until the cheap attempt has been made.
    let executed = await executeDataPlan(this.data, plan);
    let concern = sufficiency(plan, executed);

    // Insufficient: the judge diagnoses what the results lack, the builder turns
    // that into a concrete plan deterministically, and Marked is asked once
    // more. Exactly one repair — a loop of model calls is not a harness.
    if (concern) {
      if (await review(concern)) executed = await executeDataPlan(this.data, plan);
      concern = sufficiency(plan, executed);
    }
    // Still insufficient: the judge could not repair it either. Hand it to the
    // query builder, which is the only step that costs the user's attention.
    if (concern) session.unresolved = { reason: concern, question };
    session.plan_reviews = reviews;
    session.marked_requests = executed.requests;
    await this.tui.render({
      patch: true,
      blocks: [{ text: `\u2713 Marked plan \u00b7 ${label} \u00b7 ${plan.concepts.length} concepts \u00b7 ${executed.facts.length} validated facts`, id: 'progress' }],
      _state: { stage: 'gathering', agent: agentName, query: question, tools: { called: executed.requests.length, total: executed.requests.length, current: null } },
    });

    // Narrative evidence only helps explain a move; a lookup does not need it.
    // The planning call already carried it, so this asks again only when the
    // plan came from local extraction.
    // Marked's document search is not deterministic: the same question returns
    // thirty excerpts or none from one call to the next, depending on whether
    // the vector index answers. An empty result is therefore worth one retry —
    // treating it as "already fetched" silently drops the narrative half of an
    // analysis.
    let query = null;
    let narrative = plan.narrative ?? [];
    if (plan.route === 'financial_analysis' && !narrative.length) {
      query = await this.queryMarked(question, plan, asOf);
      narrative = narrativeRecords(query?.data);
    }

    // Evidence IDs are stamped onto the facts first, so a derived figure can cite
    // the exact values it was computed from.
    const evidence = [
      ...financialFactEvidence(executed.facts),
      ...buildEvidence(narrative, { dataType: 'filing_evidence' }),
    ];
    const companies = executed.companies.filter(company => company.entity).map(company => ({
      entity: company.entity,
      security: company.security,
      facts: company.facts,
      datasets: company.datasets ?? {},
      series: seriesByConcept(company.facts),
      growth: plan.metric ? derivedGrowth(company.facts, plan.metric) : null,
    }));

    const quotes = executed.companies.flatMap(company => (company.datasets?.quote ?? []).map(quote => ({ company, quote })));
    const gapLines = gapReport(plan, executed.gaps);
    const blocks = [
      ...quotes.map(({ company, quote }, index) => ({
        panel: 'quote', id: `quote-${index}`,
        data: {
          ticker: company.security?.symbol ?? '', name: company.entity?.company?.common_name ?? '',
          price: Number(quote.price) || 0,
          changePct: Number(quote.change_percent) || 0,
          marketCap: Number(quote.market_cap) || 0,
        },
      })),
      ...(quotes.length ? [{ text: quotes.map(({ quote }) => quoteLine(quote)).join('\n'), id: 'quote-detail' }] : []),
      { divider: label.toUpperCase() },
      ...(executed.facts.length ? [{ table: factTable(executed.facts) }] : []),
      ...companies.flatMap((company, index) => conceptCharts(company, plan, index)),
      ...(gapLines.length ? [{ divider: 'DATA GAP' }, { text: gapLines.join('\n'), id: 'data-gap' }] : []),
    ];

    const packet = {
      data_plan: plan,
      plan_reviews: reviews,
      unresolved: session.unresolved ?? null,
      temporal,
      companies,
      financial_facts: executed.facts,
      derived_metrics: companies.map(company => company.growth).filter(Boolean),
      data_gaps: executed.gaps,
      narrative_evidence: narrative,
      marked_requests: executed.requests,
    };

    // Fail loudly rather than asking a model to manufacture the dataset — but a
    // request answered from a dataset rather than from facts has been answered.
    const datasetRows = executed.companies.reduce(
      (total, company) => total + Object.values(company.datasets ?? {}).reduce((sum, rows) => sum + rows.length, 0), 0);
    if (!executed.facts.length && !datasetRows) {
      session.packet = packet;
      session.evidence = evidence;
      session.data_gap = gapLines;
      this.save(session);
      await this.tui.render({
        patch: true,
        blocks: [
          { divider: 'DATA GAP' },
          { text: gapLines.join('\n') || `Marked returned no ${plan.metric || 'financial'} facts for ${plan.references.join(', ')}.`, id: 'data-gap' },
        ],
        _state: { stage: 'complete', agent: agentName, query: question, follow_ups: [], tools: { called: executed.requests.length, total: executed.requests.length, current: null } },
        meta: { as_of: asOf },
      });
      return session;
    }

    return this.complete(session, {
      question, asOf, agentName, state, packet, evidence, blocks,
      totalTools: executed.requests.length, conversation, mode,
    });
  }

  /**
   * `needs_plan` is Marked asking for a retrieval plan, not an answer. Supply
   * one and retry; a response still carrying `needs_plan` yields no evidence.
   */
  async queryMarked(question, plan, asOf) {
    const text = historicalQuery(question, asOf) ? `${question} as of ${asOf}` : question;
    let response = await this.data.query({ query: text, limit: 30 });
    const retrieval = markedPlan(plan);
    if (response?.data?.status === 'needs_plan' && retrieval) {
      response = await this.data.query({ query: text, plan: retrieval, limit: 30 });
    }
    return response?.data?.status === 'needs_plan' ? null : response;
  }

  async runQuery(session, intent, { question, asOf, agentName, state, conversation, mode, temporal }) {
    await state('gathering', { tools: { called: 0, total: 1, current: 'marked.query' } });
    const previous = conversationHistory(conversation, 3).map(turn => turn.question).join(' | ');
    const contextualQuestion = previous ? `Previous conversation: ${previous}. Current question: ${question}` : question;
    const temporalQuestion = resolvedQuestion(contextualQuestion, temporal);
    const query = await this.queryMarked(temporalQuestion, session.data_plan || buildDataPlan(question, { temporal, asOf }), asOf);
    const recordsFound = queryEvidence(query?.data);
    const plan = query?.data?.plan || {};
    await this.tui.render({
      patch: true,
      blocks: [{ text: `✓ Luna plan · ${plan.route || 'query'}${plan.reference ? ` · ${plan.reference}` : ''}`, id: 'progress' }],
      _state: { stage: 'gathering', agent: agentName, query: question, tools: { called: 1, total: 1, current: plan.route || 'marked.query' } },
    });
    const companyContexts = [];
    if (this.data.resolveCompany) {
      const references = queryCompanyReferences(query.data);
      const resolved = await Promise.all(references.map(async reference => {
        try {
          const entity = await this.data.resolveCompany(reference);
          const security = selectEquity(entity.securities);
          if (!security?.symbol) return null;
          const price = await this.data.prices({ ticker: security.symbol, exchange: security.exchange || 'NSE', latest: false, limit: 30 });
          const financials = plan.concepts?.length
            ? await this.data.financials({ ticker: security.symbol, period: plan.period || 'any', basis: plan.basis || 'consolidated', concept: plan.concepts.join(','), as_of: plan.as_of, limit: 60 })
            : null;
          return { entity, security, price, financials };
        } catch { return null; }
      }));
      companyContexts.push(...resolved.filter(Boolean));
    }
    const evidence = [
      ...buildEvidence(recordsFound, { dataType: `${intent.kind}_evidence` }),
    ];
    const queryBlocks = [{ divider: `${intent.kind.toUpperCase()} · MARKED QUERY` }];
    companyContexts.forEach((context, index) => queryBlocks.push(
      { panel: 'quote', id: `query-quote-${index}`, data: { ticker: context.security.symbol, name: context.entity.company.common_name, price: latestPrice(context.price), changePct: 0, marketCap: 0 } },
      { panel: 'chart', id: `query-price-chart-${index}`, data: priceChart(context.price, `${context.security.exchange}:${context.security.symbol}`) },
      { panel: 'candlestick', id: `query-price-candles-${index}`, data: priceCandles(context.price, `${context.security.exchange}:${context.security.symbol}`) },
      ...metricCharts(context.financials, plan.concepts, index),
    ));
    if (!companyContexts.length) queryBlocks.push(...metricCharts({ data: recordsFound }, plan.concepts, 0));
    queryBlocks.push({ table: queryTable(recordsFound) });
    return this.complete(session, {
      question, asOf, agentName, state,
      packet: {
        intent, query: query?.data ?? null, temporal,
        companies: companyContexts.map(context => ({
          entity: context.entity, security: context.security,
          financial_series: metricSeries(context.financials, plan.concepts),
        })),
      }, evidence,
      blocks: queryBlocks, totalTools: 1 + companyContexts.length, conversation, mode,
    });
  }

  async complete(session, { question, asOf, agentName, state, packet, evidence, blocks, totalTools, conversation, mode = session.mode || 'research' }) {
    blocks = meaningful(blocks);
    session.packet = packet;
    session.evidence = evidence;
    await this.tui.render({
      patch: true,
      blocks,
      _state: { stage: 'analyzing', agent: agentName, query: question, tools: { called: totalTools, total: totalTools, current: null } },
      meta: { as_of: asOf },
    });

    const context = {
      research_id: session.research_id,
      question: session.question,
      intent: session.intent,
      mode,
      temporal: session.temporal,
      requested_as_of: session.requested_as_of,
      conversation: conversationHistory(conversation),
      packet: compactPacket(session.packet),
      evidence: session.evidence.map(compactEvidence),
    };
    const prompt = `${promptForResult()}\n\nYou are the reasoning engine inside Marked. Analyze the supplied Indian-market research packet. Marked data is canonical. Do not retrieve data or invent facts. Separate facts, inferences, opinions and external context. Use evidence_ids for material factual claims. State consolidated/standalone basis, units and dates. For macro, derivatives or other external coverage, say when the packet is unavailable or secondary. Every number you state must come from packet.financial_facts or packet.derived_metrics and cite that fact's evidence_id; query, search and planning records are context only and can never supply a value. Anything listed in packet.data_gaps is unavailable — say so plainly and do not estimate, interpolate or substitute it. Output mode is ${mode}: factual lookups must answer directly and leave catalysts, risks, bull_case, bear_case and invalidation empty; comparative answers should emphasize differences; analytical and research answers may use the full thesis/catalysts/risks structure; event answers should focus on the event and date; screening answers should focus on matched companies and coverage.\n\n${JSON.stringify(context)}`;
    const startedAt = new Date().toISOString();
    session.agent_run = { provider: agentName, started_at: startedAt, status: 'running' };
    let result;
    try {
      result = await this.agent.run(prompt, { cwd: this.cwd, timeoutMs: 180000 });
      session.agent_run = { ...session.agent_run, completed_at: new Date().toISOString(), status: 'completed' };
    } catch (error) {
      session.agent_run = { ...session.agent_run, completed_at: new Date().toISOString(), status: 'failed', error: error.message };
      this.save(session);
      throw error;
    }
    let checked;
    try {
      checked = validateClaims(validateResearchResult(result), session.evidence);
    } catch (error) {
      session.agent_run = { ...session.agent_run, status: 'invalid_result', error: error.message };
      this.save(session);
      throw error;
    }
    session.result = checked.result;
    session.validation_warnings = checked.warnings;
    session.follow_ups = followUps(checked.result.follow_ups);
    this.save(session);

    await this.tui.render({
      patch: true,
      blocks: meaningful([
        { divider: mode.toUpperCase() },
        { panel: 'verdict', id: 'verdict', data: verdictPanel(checked.result, checked.warnings, mode) },
        // An empty SOURCES table is a heading over nothing. A quote has no
        // evidence rows, and printing the header anyway reads as a failure.
        ...(session.evidence.length ? [{ divider: 'SOURCES' }, { table: sourceTable(session.evidence) }] : []),
      ]),
      _state: { stage: 'complete', agent: agentName, query: question, follow_ups: session.follow_ups, tools: { called: totalTools, total: totalTools, current: null } },
      meta: { as_of: asOf },
    });
    return session;
  }
}

/**
 * The saved session keeps everything for the audit trail. The prompt does not:
 * raw rows are already represented by validated facts, provider metadata is the
 * client's business, and a 283 KB packet costs minutes of reasoning time for
 * context the worker cannot use.
 */
function compactPacket(packet = {}) {
  const {
    financials, metrics, price, entity, security, filings, events, actions, shareholding,
    financial_facts: facts, companies, data_plan: dataPlan, narrative_evidence: narrative, ...rest
  } = packet;
  return {
    ...rest,
    // Per-company facts were the same rows again at four times the size, because
    // compaction ran on financial_facts and companies rode through untouched.
    // The series is what a company block is for; the numbers live in one place.
    ...(companies ? { companies: companies.map(compactCompany) } : {}),
    // The plan says how the data was fetched, not what was found. It is kept
    // whole in the session; the prompt gets the parts that explain the request.
    ...(dataPlan ? { data_plan: compactPlan(dataPlan) } : {}),
    ...(narrative ? { narrative_evidence: narrative.map(compactDocument) } : {}),
    // Every fact already has an evidence record carrying its source, document and
    // company ids. Repeating all of that per fact doubled the packet for nothing.
    ...(facts ? { financial_facts: facts.map(compactFact) } : {}),
    ...(entity ? { entity: { company: strip(entity.company), securities_count: entity.securities?.length ?? 0 } } : {}),
    ...(security ? { security: strip(security) } : {}),
    ...(price ? { price: compactPrices(price) } : {}),
    ...(shareholding ? { shareholding: records(shareholding?.data ?? shareholding).slice(0, 2).map(strip) } : {}),
    ...(filings ? { filings: records(filings?.data ?? filings).slice(0, 10).map(pick(['document_id', 'title', 'document_type', 'published_at', 'source_url'])) } : {}),
    ...(events ? { events: records(events?.data ?? events).slice(0, 10).map(pick(['event_id', 'event_type', 'title', 'event_at', 'source_url'])) } : {}),
    ...(actions ? { actions: records(actions?.data ?? actions).slice(0, 10).map(pick(['action_type', 'ex_date', 'record_date', 'value', 'description'])) } : {}),
  };
}

/** A company block: who it is and how its measures moved, not the rows again. */
function compactCompany(company = {}) {
  return {
    ...(company.entity ? { company: strip(company.entity.company) } : {}),
    ...(company.security ? { security: strip(company.security) } : {}),
    series: company.series ?? {},
    ...(company.growth ? { growth: company.growth } : {}),
    ...(Object.keys(company.datasets ?? {}).length ? { datasets: company.datasets } : {}),
  };
}

/** What was asked for and on what basis. Not the evidence it dragged along. */
function compactPlan(plan = {}) {
  const { narrative, candidates, ...rest } = plan;
  return rest;
}

/** A filing excerpt needs its words and its citation, not its embedding scores. */
function compactDocument(document = {}) {
  return pick([
    'document_id', 'title', 'heading', 'content', 'published_at',
    'source', 'source_url', 'fiscal_year', 'basis', 'company_name',
  ])(document);
}

/** The number and what makes it meaningful; provenance is in its evidence record. */
function compactFact(fact) {
  return pick(['evidence_id', 'ticker', 'concept_id', 'period', 'fiscal_quarter', 'value', 'unit', 'currency', 'basis'])(fact);
}

/** A citation needs identity, value and provenance — not the whole record. */
function compactEvidence(item) {
  return pick([
    'evidence_id', 'data_type', 'company_name', 'metric', 'value', 'unit', 'currency',
    'period', 'basis', 'title', 'source_url', 'known_at', 'page', 'section',
  ])(item);
}

function compactPrices(value) {
  const rows = priceRows(value);
  if (!rows.length) return null;
  const closes = rows.map(row => Number(row.close));
  return {
    from: rows[0].ts || rows[0].date || null,
    to: rows.at(-1).ts || rows.at(-1).date || null,
    currency: 'INR',
    last: closes.at(-1),
    low: Math.min(...closes),
    high: Math.max(...closes),
    closes,
  };
}

function pick(keys) {
  return (item = {}) => Object.fromEntries(keys.filter(key => item[key] !== undefined && item[key] !== null).map(key => [key, item[key]]));
}

/** Drop the raw provider payload we keep only so the client can debug it. */
function strip(value = {}) {
  const { metadata, ...rest } = value || {};
  return rest;
}

/**
 * Did the plan work? Deterministic and free: a quote request is satisfied by a
 * quote, a fact request by its facts. Returns why it fell short, or null.
 */
function sufficiency(plan, executed) {
  const datasetRows = executed.companies.reduce(
    (total, company) => total + Object.values(company.datasets ?? {}).reduce((sum, rows) => sum + rows.length, 0), 0);
  if (plan.datasets?.length && datasetRows) return null;
  if (plan.route === 'price_lookup') return datasetRows ? null : 'no quote came back for this company';
  return postflightConcern(plan, executed) ?? (executed.facts.length || datasetRows ? null : 'retrieval returned nothing');
}

/**
 * Blocks worth painting. A table whose only row says "no data", a panel with an
 * empty payload and a divider with nothing under it all read as breakage — the
 * screen looks like something went wrong when in fact nothing was asked for.
 */
function meaningful(blocks = []) {
  const kept = blocks.filter(block => {
    if (block?.table) return (block.table.rows ?? []).length > 0;
    if (block?.panel === 'chart') return (block.data?.values ?? []).length > 1;
    if (block?.panel === 'candlestick') return (block.data?.bars ?? []).length > 0;
    if (block?.panel === 'holders') return (block.data?.holders ?? []).length > 0;
    if (block?.panel === 'filings') return (block.data?.filings ?? []).length > 0;
    if (block?.text !== undefined) return String(block.text).trim().length > 0;
    return true;
  });
  // A divider immediately followed by another divider, or trailing at the end,
  // is a heading for a section that turned out to be empty.
  return kept.filter((block, index) => !block?.divider
    || (kept[index + 1] && !kept[index + 1].divider));
}

function historicalQuery(question, asOf) {
  return !/\bas of\b/i.test(question) && Number.isFinite(Date.parse(asOf)) && Math.abs(Date.now() - Date.parse(asOf)) > 60_000;
}

function records(value) {
  if (Array.isArray(value)) return value.filter(item => item && typeof item === 'object');
  if (!value || typeof value !== 'object') return [];
  for (const key of ['items', 'results', 'records', 'evidence', 'data']) {
    if (Array.isArray(value[key])) return records(value[key]);
  }
  return [value];
}

function queryEvidence(data) {
  // Only the typed evidence collections count. The response envelope itself is a
  // planning result, and a planning result is never a research record.
  if (!data || data.status === 'needs_plan') return [];
  const evidence = data.evidence ?? data;
  if (Array.isArray(evidence)) return records(evidence);
  if (!evidence || typeof evidence !== 'object') return [];
  return ['facts', 'documents', 'events', 'actions'].flatMap(key => records(evidence[key]));
}

function narrativeRecords(data) {
  if (!data || data.status === 'needs_plan') return [];
  return records(data.evidence?.documents);
}

function seriesByConcept(facts) {
  const series = {};
  for (const fact of facts) {
    (series[fact.concept_id] ||= []).push({
      period: fact.period, fiscal_year: fact.fiscal_year, value: fact.value,
      unit: fact.unit, basis: fact.basis, evidence_id: fact.evidence_id,
    });
  }
  for (const points of Object.values(series)) points.sort((a, b) => (a.fiscal_year ?? 0) - (b.fiscal_year ?? 0));
  return series;
}

/**
 * One row per measure, one column per period — the shape an analyst reads.
 *
 * The old table was one row per fact: 52 rows for four years of a company's
 * statements, sorted alphabetically, with the same metric name repeated four
 * times and the periods running down the page. Pivoting turns that into 13 rows
 * you can scan, and puts the years side by side where a trend is visible.
 */
function factTable(facts) {
  if (!facts.length) return { headers: [], rows: [] };

  const periods = [...new Set(facts.map(fact => fact.period).filter(Boolean))]
    .sort((a, b) => String(a).localeCompare(String(b)));
  const companies = [...new Set(facts.map(fact => fact.company_name || fact.ticker).filter(Boolean))];
  const byKey = new Map();
  for (const fact of facts) {
    const company = fact.company_name || fact.ticker || '—';
    const key = `${company}\u0000${fact.concept_id}`;
    if (!byKey.has(key)) byKey.set(key, { company, concept: fact.concept_id, values: new Map(), basis: fact.basis });
    byKey.get(key).values.set(fact.period, fact);
  }

  const rows = [...byKey.values()]
    .sort((a, b) => a.company.localeCompare(b.company) || a.concept.localeCompare(b.concept))
    .slice(0, 30)
    .map(row => {
      const cells = periods.map(period => {
        const fact = row.values.get(period);
        return fact ? formatFactValue(fact) : '—';
      });
      return {
        cells: [
          // One company: its name on every row is thirty repetitions of nothing.
          ...(companies.length > 1 ? [row.company] : []),
          humanizeMetric(row.concept),
          ...cells,
          changeCell(row, periods),
        ],
      };
    });

  return {
    headers: [
      ...(companies.length > 1 ? ['Company'] : []),
      'Metric', ...periods, 'Δ',
    ],
    rows,
  };
}

/** Change across the periods present, which is the column people look for. */
function changeCell(row, periods) {
  const present = periods.map(period => row.values.get(period)).filter(Boolean);
  if (present.length < 2) return '—';
  const first = present[0].value;
  const last = present.at(-1).value;
  if (!Number.isFinite(first) || !Number.isFinite(last) || first === 0) return '—';
  const pct = ((last - first) / Math.abs(first)) * 100;
  return `${pct >= 0 ? '+' : ''}${pct.toFixed(pct >= 100 || pct <= -100 ? 0 : 1)}%`;
}

function formatFactValue(fact) {
  if (!Number.isFinite(fact.value)) return '—';
  // A margin is a percentage whatever unit the row claims. Rendering net_margin
  // as "₹0.09" is wrong twice over: wrong symbol, and a ratio read as money.
  if (isPercent(fact.concept_id)) return `${Number((fact.value * 100).toFixed(2))}%`;
  if (fact.concept_id === 'interest_coverage' || fact.concept_id === 'cash_conversion') return `${Number(fact.value.toFixed(2))}x`;
  if (/EarningsPerShare/i.test(fact.concept_id)) return `₹${Number(fact.value.toFixed(2))}`;
  if (fact.currency !== 'INR') return `${Number(fact.value.toFixed(4))}${fact.unit && fact.unit !== 'ratio' ? ` ${fact.unit}` : ''}`;
  const absolute = Math.abs(fact.value);
  const sign = fact.value < 0 ? '-' : '';
  if (absolute >= 1e7) return `${sign}₹${Number((absolute / 1e7).toFixed(1)).toLocaleString('en-IN')} Cr`;
  if (absolute >= 1e5) return `${sign}₹${Number((absolute / 1e5).toFixed(1)).toLocaleString('en-IN')} L`;
  return `${sign}₹${Number(absolute.toFixed(2)).toLocaleString('en-IN')}`;
}

/**
 * Charts for the measures the question is actually about.
 *
 * Three problems with what this drew before. It plotted raw rupees, so the axis
 * read "₹17,213,300,000.00" — a number nobody can scan. It charted whichever
 * three concepts came first, including ones the question never mentioned. And
 * it drew a line through two points, which is not a trend.
 *
 * Now: the metric asked about plus what it is being compared against, scaled to
 * the unit an Indian reader uses, with the periods named in the label.
 */
function conceptCharts(company, plan, index) {
  const wanted = [plan.metric, ...(plan.required_concepts ?? [])].filter(Boolean);
  return [...new Set(wanted)].slice(0, 2).flatMap((concept, position) => {
    const points = company.series[concept] ?? [];
    // Two points is a line between two dots. A trend needs at least three.
    if (points.length < 3) return [];

    const percent = isPercent(concept);
    const crore = !percent && points.every(point => Math.abs(point.value) >= 1e5);
    const values = points.map(point => (percent ? point.value * 100 : crore ? point.value / 1e7 : point.value));
    const unit = percent ? '%' : crore ? '₹ Cr' : (points[0].unit ?? '');
    const span = `${points[0].period}–${points.at(-1).period}`;

    return [{
      panel: 'chart',
      id: `fact-chart-${index}-${position}`,
      data: {
        label: `${company.entity.company.common_name} · ${humanizeMetric(concept)}${unit ? ` (${unit})` : ''} · ${span}`,
        height: 8,
        values,
      },
    }];
  });
}

function gapReport(plan, gaps) {
  if (!gaps.length) return [];
  const lines = [];
  const unresolved = gaps.filter(gap => gap.reason);
  for (const gap of unresolved) lines.push(`Marked could not resolve "${gap.reference}": ${gap.reason}`);
  const missing = gaps.filter(gap => !gap.reason);
  const byConcept = new Map();
  for (const gap of missing) {
    const key = `${gap.reference}|${gap.concept}`;
    if (!byConcept.has(key)) byConcept.set(key, []);
    byConcept.get(key).push(gap.fiscal_year);
  }
  for (const [key, years] of byConcept) {
    const [reference, concept] = key.split('|');
    const periods = years.filter(Boolean).map(year => `FY${year}`).join(', ') || 'any available period';
    lines.push(`Marked could not retrieve ${humanizeMetric(concept)} for ${periods} (${reference}, ${plan.basis} ${plan.period}).`);
  }
  lines.push('These values are unavailable inputs, not zero. They were not estimated.');
  return lines;
}


/** The most recent N fiscal years, so a narrative packet stays query-relevant. */
function recentFiscalYears(value, count) {
  const rows = records(value?.data ?? value);
  const years = [...new Set(rows.map(row => Number(row.fiscal_year)).filter(Number.isFinite))].sort((a, b) => b - a).slice(0, count);
  if (!years.length) return value;
  return { ...value, data: rows.filter(row => years.includes(Number(row.fiscal_year))) };
}

function scopeFiscalYear(value, fiscalYear) {
  const rows = records(value?.data ?? value);
  if (!rows.length) return value;
  return { ...value, data: rows.filter(row => Number(row.fiscal_year) === Number(fiscalYear)) };
}

function metricSeries(value, concepts = []) {
  const rows = records(value?.data ?? value);
  return concepts.slice(0, 3).map(concept => ({
    concept,
    points: rows
      .filter(row => row.concept_id === concept && Number.isFinite(Number(row.value)))
      .sort((a, b) => String(a.period_end || '').localeCompare(String(b.period_end || '')))
      .map(row => ({ period: row.fiscal_year ? `FY${row.fiscal_year}` : row.period_end || '—', value: Number(row.value) * Number(row.scale || 1) })),
  })).filter(series => series.points.length);
}

function priceRows(value) {
  return records(value?.data ?? value)
    .filter(item => Number.isFinite(Number(item.close)))
    .sort((a, b) => String(a.ts || a.date || '').localeCompare(String(b.ts || b.date || '')));
}

function latestPrice(value) {
  const rows = priceRows(value);
  return rows.length ? Number(rows[rows.length - 1].close) : null;
}

function priceChart(value, label) {
  return { label, height: 8, values: priceRows(value).map(item => Number(item.close)) };
}

function priceCandles(value, label) {
  return {
    label,
    bars: priceRows(value).map(item => ({
      open: Number(item.open), high: Number(item.high), low: Number(item.low), close: Number(item.close),
      volume: Number(item.volume || 0),
    })),
  };
}

/**
 * Validate a company's reported facts and derived ratios, so nothing reaches the
 * packet carrying a financial data type it has not earned.
 */
function checkFinancials({ entity, security, financials, metrics }) {
  const context = {
    companyId: entity?.company?.company_id ?? null,
    companyName: entity?.company?.common_name ?? null,
    ticker: security?.symbol ?? null,
  };
  const reported = validateFinancialFacts(records(financials?.data ?? financials), context);
  const derived = validateFinancialFacts(flattenMetricRows(records(metrics?.data ?? metrics)), { ...context, dataType: 'metric' });
  const facts = [...reported.facts, ...derived.facts];
  return { facts, rejected: [...reported.rejected, ...derived.rejected], evidence: financialFactEvidence(facts) };
}

function collectEvidence(companyId, sources) {
  return sources.flatMap(([value, dataType]) => buildEvidence(records(value?.data ?? value), { companyId, dataType }));
}

function financialTable(financials, metrics) {
  const rows = normalizeFinancialRows(financials, metrics).map(item => ({
    cells: [item.metric, item.value, item.period, item.basis, item.classification], colors: {},
  }));
  return { headers: ['Metric', 'Value', 'Period', 'Basis', 'Class'], rows: rows.length ? rows : [{ cells: ['No Marked financial facts returned', '—', '—', '—', '—'] }] };
}

function comparisonTable(companies) {
  return {
    headers: ['Company', 'Security', 'Price', 'Metric sample', 'Basis'],
    rows: companies.map(item => {
      const metrics = records(item.metrics?.data ?? item.metrics);
      const first = metrics[0]?.metrics ? Object.entries(metrics[0].metrics)[0] : null;
      const price = latestPrice(item.price) ?? '—';
      return { cells: [item.entity.company.common_name, `${item.security.exchange}:${item.security.symbol}`, String(price), first ? `${first[0]}=${first[1]}` : '—', 'consolidated'] };
    }),
  };
}

function queryTable(items) {
  const facts = items.filter(item => item.concept_id);
  const normalized = normalizeFinancialRows({ data: facts }, null);
  if (normalized.length) return {
    headers: ['Metric', 'Value', 'Period', 'Basis', 'Class'],
    rows: normalized.map(item => ({ cells: [item.metric, item.value, item.period, item.basis, item.classification] })),
  };
  const rows = items.slice(0, 20).map(item => ({
    cells: [item.title || item.concept_id || item.metric || item.event_type || 'evidence', String(item.value ?? item.summary ?? item.description ?? item.content ?? '—').slice(0, 120), item.period_end || item.event_at || item.known_at || '—'],
  }));
  return { headers: ['Evidence', 'Value', 'Date / Period'], rows: rows.length ? rows : [{ cells: ['No structured Marked evidence returned', '—', '—'] }] };
}

function queryCompanyReferences(data) {
  const references = data?.plan?.route === 'exact' && looksLikeCompanyReference(data.plan.reference)
    ? [data.plan.reference]
    : (data?.evidence?.companies || []).map(company => company.ticker || company.name).filter(Boolean);
  return [...new Set(references)].slice(0, 5);
}

function metricCharts(data, concepts = [], index = 0) {
  const rows = records(data?.data ?? data);
  return concepts.slice(0, 3).flatMap((concept, conceptIndex) => {
    const values = rows
      .filter(row => row.concept_id === concept && Number.isFinite(Number(row.value)))
      .sort((a, b) => String(a.period_end || '').localeCompare(String(b.period_end || '')))
      .map(row => Number(row.value) * Number(row.scale || 1));
    return values.length > 1
      ? [{ panel: 'chart', id: `query-metric-chart-${index}-${conceptIndex}`, data: { label: humanizeMetric(concept), height: 8, values } }]
      : [];
  });
}

function humanizeMetric(value) {
  // The canonical labels already exist; deriving one from the identifier gives
  // "Ebit Margin" and "Profit After Tax" where the map says "EBIT margin".
  if (LABELS[value]) return LABELS[value];
  return String(value).replace(/[_-]+/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2').replace(/\b\w/g, char => char.toUpperCase());
}

// Marked's shareholding snapshot carries the ownership split as aggregate
// percentages. The `holders` array names the largest individual holders but its
// `ownership_pct` is routinely null, so it can only lead when it has real
// numbers — otherwise it renders as a list of names at 0.0%, which says nothing.
const OWNERSHIP_BANDS = [
  ['promoter_pct', 'Promoter'],
  ['fii_pct', 'FII'],
  ['dii_pct', 'DII'],
  ['mutual_fund_pct', 'Mutual funds'],
  ['public_pct', 'Public'],
  ['pledged_pct', 'Pledged'],
];

function holderPanel(data) {
  const latest = records(data?.data ?? data)[0] || {};

  const named = (Array.isArray(latest.holders) ? latest.holders : [])
    .map(holder => ({
      name: holder.holder_name ?? holder.name ?? null,
      percent: Number(holder.ownership_pct ?? holder.percent),
      shares: Number(holder.shares) || undefined,
    }))
    .filter(holder => holder.name && Number.isFinite(holder.percent));
  if (named.length) return { holders: named, asOf: latest.period_end || null };

  const bands = OWNERSHIP_BANDS
    .map(([key, name]) => ({ name, percent: Number(latest[key]) }))
    .filter(band => Number.isFinite(band.percent) && band.percent > 0);
  return { holders: bands, asOf: latest.period_end || null };
}

function filingPanel(data) {
  return { filings: records(data?.data ?? data).slice(0, 8).map(item => ({ date: item.published_at || item.filing_date || item.date || '', form: item.document_type || item.type || 'disclosure', description: item.title || item.description || '' })) };
}

function eventTable(events, actions) {
  return { headers: ['Date', 'Type', 'Title'], rows: [...records(events?.data ?? events), ...records(actions?.data ?? actions)].slice(0, 12).map(item => ({ cells: [item.event_at || item.ex_date || item.date || '—', item.event_type || item.action_type || 'action', item.title || item.description || '—'] })) };
}

function sourceTable(evidence) {
  return { headers: ['Evidence', 'Type', 'Period', 'Source'], rows: evidence.slice(0, 16).map(item => ({ cells: [item.evidence_id, item.data_type, item.period || '—', item.source_url || item.title || 'Marked'] })) };
}

function followUps(items = []) {
  return (Array.isArray(items) ? items : []).slice(0, 9).map((item, index) => ({
    key: String(index + 1),
    label: item.label,
    question: item.question,
    cmd: `marked ${JSON.stringify(item.question)}`,
  }));
}

function verdictPanel(result, warnings, mode = 'research') {
  if (['factual', 'event'].includes(mode)) {
    return {
      title: mode.toUpperCase(),
      suppressWarnings: true,
      sections: [
        { type: 'thesis', text: result?.summary || result?.thesis || 'No answer returned.' },
        ...(result?.context ? [{ type: 'context', text: result.context }] : []),
      ],
    };
  }
  return {
    conviction: result?.conviction === 'mixed' || result?.conviction === 'uncertain' ? 'neutral' : result?.conviction || 'neutral',
    thesis: result?.thesis || result?.summary || 'Insufficient evidence for a thesis.',
    catalysts: result?.catalysts || [],
    risks: [...(result?.risks || []), ...warnings],
    levels: result?.levels?.length ? { support: result.levels.join(' · ') } : undefined,
    timeframe: 'months',
    context: result?.context || 'Marked-backed research; not financial advice.',
  };
}
