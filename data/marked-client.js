const DEFAULT_BASE = 'https://api.marked.run';

export class MarkedApiError extends Error {
  constructor(message, { status, code, headers, details, reference, choices } = {}) {
    super(message);
    this.name = 'MarkedApiError';
    this.status = status;
    this.code = code;
    this.headers = headers;
    this.details = details;
    this.reference = reference;
    this.choices = choices;
  }
}

function queryString(params = {}) {
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') qs.set(key, String(value));
  }
  return qs.toString();
}

function envelope(body) {
  return body && typeof body === 'object' && 'data' in body
    ? body
    : { data: body, meta: {} };
}

export class MarkedClient {
  constructor({ apiKey, baseUrl = DEFAULT_BASE, fetchImpl = globalThis.fetch } = {}) {
    if (!fetchImpl) throw new Error('MarkedClient requires a fetch implementation');
    this.apiKey = apiKey || '';
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.fetch = fetchImpl;
  }

  async request(route, { method = 'GET', params, body, signal } = {}) {
    const suffix = queryString(params);
    const url = `${this.baseUrl}${route}${suffix ? `?${suffix}` : ''}`;
    const headers = { Accept: 'application/json' };
    if (this.apiKey) headers['X-API-Key'] = this.apiKey;
    if (body !== undefined) headers['Content-Type'] = 'application/json';

    let response;
    for (let attempt = 0; attempt < 3; attempt++) {
      response = await this.fetch(url, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        signal,
      });
      if (response.status !== 429 || attempt === 2) break;
      const retryAfter = Number(response.headers?.get?.('retry-after')) || attempt + 1;
      await new Promise(resolve => setTimeout(resolve, Math.min(retryAfter, 10) * 1000));
    }
    const text = await response.text();
    let payload;
    try { payload = text ? JSON.parse(text) : null; } catch { payload = { error: text }; }
    if (!response.ok) {
      const detail = payload?.detail || payload?.error;
      const message = typeof detail === 'string'
        ? detail
        : Array.isArray(detail)
          ? detail.map(item => item?.msg || JSON.stringify(item)).join('; ')
          : detail ? JSON.stringify(detail) : `Marked API request failed (${response.status})`;
      throw new MarkedApiError(message, {
        status: response.status,
        code: payload?.code,
        details: payload,
        headers: Object.fromEntries(response.headers?.entries?.() || []),
      });
    }
    return {
      ...envelope(payload),
      headers: Object.fromEntries(response.headers?.entries?.() || []),
    };
  }

  companies(params = {}, options) { return this.request('/v1/companies', { params, ...options }); }
  instruments(params = {}, options) { return this.request('/v1/instruments', { params, ...options }); }
  prices(params = {}, options) { return this.request('/v1/prices', { params, ...options }); }
  quote({ symbol, exchange = 'NSE' } = {}, options) {
    if (!symbol) throw new Error('A quote symbol is required');
    return this.prices({ ticker: symbol, exchange, latest: true }, options);
  }
  financials(params = {}, options) { return this.request('/v1/financials', { params, ...options }); }

  /**
   * Balance-sheet facts.
   *
   * These are instants — a value at a date, with no period start — so the
   * `period=annual|quarterly` filters exclude them entirely and the API counts
   * them under `meta.unclassified_facts`. Asking for `period=any` is the only
   * way to see them, which is why equity, borrowings and cash appeared to be
   * missing from the dataset when they were there all along.
   */
  balanceSheet(params = {}, options) {
    return this.request('/v1/financials', { params: { ...params, period: 'any' }, ...options });
  }
  metrics(params = {}, options) { return this.request('/v1/financial-metrics', { params, ...options }); }
  shareholding(params = {}, options) { return this.request('/v1/shareholding', { params, ...options }); }
  filings(params = {}, options) { return this.request('/v1/filings', { params, ...options }); }
  corporateActions(params = {}, options) { return this.request('/v1/corporate-actions', { params, ...options }); }
  events(params = {}, options) { return this.request('/v1/events', { params, ...options }); }
  /**
   * Every version of one number ever published — the restatement trail.
   *
   * Note the prefix: this router mounts at `/api/v1`, not `/v1` like the rest
   * of the public surface. Calling it at `/v1` returns 404, which reads
   * exactly like a route that was never deployed.
   */
  provenance({ reference, concept, periodEnd, basis = 'consolidated' } = {}, options) {
    if (!reference || !concept || !periodEnd) throw new Error('provenance needs a company, a concept and a period end');
    return this.request(
      `/api/v1/companies/${encodeURIComponent(reference)}/financials/${encodeURIComponent(concept)}/provenance`,
      { params: { period_end: periodEnd, basis }, ...options },
    );
  }

  /** Market news, already resolved to the companies it names. */
  news(params = {}, options) { return this.request('/v1/news', { params, ...options }); }

  /** The topics, regions, tiers and publishers news is tagged with. */
  newsVocabulary(options) { return this.request('/v1/news/vocabulary', { ...options }); }

  /** FX, commodities and macro in one call, each carrying its own evidence. */
  marketContext(options) { return this.request('/v1/market/context', { ...options }); }

  search(body, options) { return this.request('/v1/search', { method: 'POST', body, ...options }); }
  screen(body, options) { return this.request('/v1/screen', { method: 'POST', body, ...options }); }
  screenVocabulary(options) { return this.request('/v1/screen/vocabulary', { ...options }); }
  query(body, options) { return this.request('/v1/query', { method: 'POST', body, ...options }); }

  async resolveCompany(reference, options) {
    const searched = await this.search({ query: reference, kinds: ['company', 'security'], limit: 10 }, options);
    const hits = Array.isArray(searched.data) ? searched.data : [];
    const companyHits = hits.filter(hit => !hit.kind || hit.kind === 'company');
    const securityHit = hits.find(hit => hit.kind === 'security' && hit.company_id);
    const exactSecurity = hits.find(hit => hit.kind === 'security' && hit.company_id && isExact(hit, reference));
    const securityCompany = exactSecurity && companyHits.find(hit => hit.company_id === exactSecurity.company_id);
    const candidates = securityCompany
      ? [securityCompany]
      : companyHits.length
      ? companyHits
      : securityHit
        ? [{ company_id: securityHit.company_id, common_name: securityHit.company_name || securityHit.title, title: securityHit.title, metadata: securityHit }]
        : (await this.companies({ q: reference, limit: 10 }, options)).data || [];
    if (candidates.length === 0) {
      throw new MarkedApiError(`Company not found: ${reference}`, { code: 'COMPANY_NOT_FOUND', reference });
    }
    if (candidates.length > 1 && !isExactCandidate(candidates, reference)) {
      // Carry the choices, not just their names in prose: the runtime turns
      // these into a question for the user rather than failing the query.
      const choices = candidates.map(candidate => ({
        name: candidateName(candidate),
        subtitle: candidate.symbol || candidate.ticker || candidate.isin || candidate.sector || null,
      })).filter(choice => choice.name);
      throw new MarkedApiError(
        `Ambiguous company reference "${reference}". Candidates: ${choices.slice(0, 5).map(c => c.name).join(', ')}`,
        { code: 'AMBIGUOUS_COMPANY', details: candidates, reference, choices },
      );
    }
    const raw = candidates.find(candidate => isExact(candidate, reference)) || candidates[0];
    const company = normalizeCompany(raw);
    const securities = company.securities?.length
      ? company.securities
      : (await this.instruments({ company: company.company_id || reference, limit: 100 }, options)).data || [];
    return { company, securities: securities.map(normalizeSecurity) };
  }
}

function candidateName(candidate) {
  return candidate.common_name || candidate.legal_name || candidate.company_name || candidate.name || candidate.title || candidate.subtitle || candidate.symbol;
}

function isExact(candidate, reference) {
  const needle = String(reference).trim().toLowerCase();
  return [candidateName(candidate), candidate.title, candidate.symbol, candidate.ticker, candidate.isin, candidate.cin]
    .filter(Boolean).some(value => String(value).toLowerCase() === needle);
}

function isExactCandidate(candidates, reference) { return candidates.filter(candidate => isExact(candidate, reference)).length === 1; }

export function normalizeCompany(raw = {}) {
  return {
    company_id: raw.company_id ?? raw.id ?? raw.uuid ?? raw.company_uuid ?? null,
    legal_name: raw.legal_name ?? raw.company_name ?? raw.name ?? raw.title ?? null,
    common_name: raw.common_name ?? raw.trade_name ?? raw.company_name ?? raw.name ?? raw.title ?? raw.subtitle ?? null,
    aliases: raw.aliases ?? [],
    cin: raw.cin ?? null,
    isin: raw.isin ?? null,
    sector: raw.sector ?? null,
    industry: raw.industry ?? null,
    listing_status: raw.listing_status ?? raw.status ?? null,
    securities: Array.isArray(raw.securities) ? raw.securities : [],
    metadata: raw,
  };
}

export function normalizeSecurity(raw = {}) {
  return {
    security_id: raw.security_id ?? raw.instrument_id ?? raw.id ?? null,
    company_id: raw.company_id ?? null,
    isin: raw.isin ?? null,
    exchange: raw.exchange ?? null,
    symbol: raw.symbol ?? raw.ticker ?? null,
    security_type: raw.security_type ?? raw.instrument_type ?? raw.type ?? null,
    segment: raw.segment ?? null,
    series: raw.series ?? null,
    exchange_code: raw.exchange_code ?? raw.scrip_code ?? null,
    currency: raw.currency ?? 'INR',
    status: raw.status ?? null,
    metadata: raw,
  };
}

export function selectEquity(securities = []) {
  return securities.find(item => item.exchange === 'NSE' && (item.segment === 'CASH' || item.security_type === 'EQ'))
    || securities.find(item => item.exchange === 'NSE')
    || securities.find(item => item.segment === 'CASH' || item.security_type === 'EQ')
    || securities[0];
}
