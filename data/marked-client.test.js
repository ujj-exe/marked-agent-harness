import { describe, expect, it } from 'vitest';
import { MarkedClient, normalizeCompany, normalizeSecurity, planFromHeaders } from './marked-client.js';

function response(body, status = 200, headers = { 'x-quota-remaining': '19' }) {
  return {
    ok: status < 400,
    status,
    headers: { entries: () => Object.entries(headers) },
    text: async () => JSON.stringify(body),
  };
}

describe('MarkedClient', () => {
  it('infers plan concurrency from authenticated rate-limit headers', () => {
    expect(planFromHeaders({ 'ratelimit-limit': '60', 'x-quota-limit': '2000' })).toMatchObject({ name: 'developer', concurrency: 2 });
    expect(planFromHeaders({ 'ratelimit-limit': '300', 'x-quota-limit': '25000' })).toMatchObject({ name: 'builder', concurrency: 10 });
    expect(planFromHeaders({ 'ratelimit-limit': '1200', 'x-quota-limit': '500000' })).toMatchObject({ name: 'scale', concurrency: 25 });
    expect(planFromHeaders({})).toBeNull();
  });

  it('learns the authenticated key plan from a response', async () => {
    const client = new MarkedClient({ apiKey: 'mk_test', fetchImpl: async () => response(
      { data: [] },
      200,
      { 'ratelimit-limit': '300', 'x-quota-limit': '25000' },
    ) });
    await client.instruments();
    expect(client.plan).toMatchObject({ name: 'builder', concurrency: 10 });
  });

  it('limits every caller to the authenticated plan concurrency', async () => {
    const releases = [];
    let started = 0;
    let active = 0;
    let maxActive = 0;
    const client = new MarkedClient({ apiKey: 'mk_test', fetchImpl: async () => {
      started += 1;
      active += 1;
      maxActive = Math.max(maxActive, active);
      await new Promise(resolve => releases.push(resolve));
      active -= 1;
      return response({ data: [] }, 200, { 'ratelimit-limit': '60', 'x-quota-limit': '2000' });
    } });
    const requests = Promise.all(Array.from({ length: 5 }, () => client.instruments()));
    await new Promise(resolve => setImmediate(resolve));
    expect(started).toBe(2);
    while (started < 5 || releases.length) {
      releases.splice(0).forEach(release => release());
      await new Promise(resolve => setImmediate(resolve));
    }
    await requests;
    expect(maxActive).toBe(2);
  });

  it('uses the Marked auth header and response envelope', async () => {
    let request;
    const client = new MarkedClient({ apiKey: 'mk_test', fetchImpl: async (url, options) => {
      request = { url, options };
      return response({ data: [{ symbol: 'RELIANCE' }], meta: { count: 1 } });
    }});
    const result = await client.instruments({ ticker: 'RELIANCE', exchange: 'NSE' });
    expect(request.url).toBe('https://api.marked.run/v1/instruments?ticker=RELIANCE&exchange=NSE');
    expect(request.options.headers['X-API-Key']).toBe('mk_test');
    expect(result.data[0].symbol).toBe('RELIANCE');
    expect(result.headers['x-quota-remaining']).toBe('19');
  });

  it('honors a short retry-after when Marked throttles a request', async () => {
    let attempts = 0;
    const client = new MarkedClient({ apiKey: 'mk_test', fetchImpl: async () => {
      attempts++;
      if (attempts === 1) return { ok: false, status: 429, headers: { get: () => '0' }, text: async () => JSON.stringify({ detail: 'retry' }) };
      return response({ data: [] });
    }});
    await client.instruments({ ticker: 'TCS' });
    expect(attempts).toBe(2);
  });

  it('renders structured API validation errors as text', async () => {
    const client = new MarkedClient({ fetchImpl: async () => response({
      detail: [{ msg: 'unsupported concepts: net_margin' }],
    }, 422) });
    await expect(client.query({ query: 'test' })).rejects.toThrow('unsupported concepts: net_margin');
  });

  it('calls the canonical live quote endpoint', async () => {
    let request;
    const client = new MarkedClient({ apiKey: 'mk_test', fetchImpl: async (url, options) => {
      request = { url, options };
      return response({ data: { symbol: 'RELIANCE', price: 1428.2, is_stale: false } });
    }});
    const result = await client.quote({ symbol: 'RELIANCE', exchange: 'NSE' });
    expect(request.url).toBe('https://api.marked.run/v1/prices?ticker=RELIANCE&exchange=NSE&latest=true');
    expect(result.data.price).toBe(1428.2);
  });

  it('uses the backend company filter for normalized news', async () => {
    let url;
    const client = new MarkedClient({ apiKey: 'mk_test', fetchImpl: async requestUrl => {
      url = requestUrl;
      return response({ data: [] });
    }});
    await client.news({ company: 'RELIANCE', topic: 'rates', region: 'india' });
    expect(url).toBe('https://api.marked.run/v1/news?company=RELIANCE&topic=rates&region=india');
  });

  it('reads an indexed filing by document id', async () => {
    let url;
    const client = new MarkedClient({ fetchImpl: async requestUrl => {
      url = requestUrl;
      return response({ data: { document_id: 'doc_1', sections: [] } });
    }});
    await client.filing('doc_1', { sections: 40 });
    expect(url).toBe('https://api.marked.run/v1/filings/doc_1?sections=40');
  });

  it('hydrates the canonical company so worlds receive its sector and securities', async () => {
    const calls = [];
    const client = new MarkedClient({ apiKey: 'mk_test', fetchImpl: async (url, options) => {
      calls.push({ url, options });
      if (url.endsWith('/v1/search')) return response({ data: [{ kind: 'company', company_id: 'co_ril', common_name: 'Reliance Industries', legal_name: 'Reliance Industries Limited', isin: 'INE002A01018' }] });
      if (url.endsWith('/api/v1/companies/co_ril')) return response({ data: { company_id: 'co_ril', common_name: 'Reliance Industries', sector: 'Oil Gas & Consumable Fuels', securities: [{ security_id: 'sec_ril_nse', company_id: 'co_ril', symbol: 'RELIANCE', exchange: 'NSE', isin: 'INE002A01018', instrument_type: 'EQUITY' }] } });
      throw new Error(`unexpected request: ${url}`);
    }});
    const entity = await client.resolveCompany('Reliance');
    expect(entity.company.company_id).toBe('co_ril');
    expect(entity.company.sector).toBe('Oil Gas & Consumable Fuels');
    expect(entity.securities[0]).toMatchObject({ security_id: 'sec_ril_nse', symbol: 'RELIANCE', exchange: 'NSE' });
    expect(calls).toHaveLength(2);
  });

  it('resolves a security hit such as a BSE scrip to its canonical company', async () => {
    const client = new MarkedClient({ apiKey: 'mk_test', fetchImpl: async url => {
      if (url.endsWith('/v1/search')) return response({ data: [{ kind: 'security', company_id: 'co_ril', title: 'RELIANCE', subtitle: 'BSE CASH EQ' }] });
      if (url.endsWith('/api/v1/companies/co_ril')) return response({ data: { company_id: 'co_ril', common_name: 'Reliance Industries', sector: 'Oil Gas & Consumable Fuels', securities: [{ company_id: 'co_ril', symbol: 'RELIANCE', exchange: 'BSE', exchange_code: '500325', segment: 'CASH', instrument_type: 'EQ' }] } });
      throw new Error(`unexpected request: ${url}`);
    }});
    const entity = await client.resolveCompany('BSE:500325');
    expect(entity.company).toMatchObject({ company_id: 'co_ril', common_name: 'Reliance Industries' });
    expect(entity.securities[0]).toMatchObject({ exchange: 'BSE', exchange_code: '500325' });
  });

  it('uses an exact ticker hit to disambiguate similar company names', async () => {
    const client = new MarkedClient({ apiKey: 'mk_test', fetchImpl: async url => {
      if (url.endsWith('/v1/search')) return response({ data: [
        { kind: 'company', company_id: 'co_other', title: 'Reliance Power' },
        { kind: 'company', company_id: 'co_ril', title: 'Reliance Industries' },
        { kind: 'security', company_id: 'co_ril', title: 'RELIANCE', subtitle: 'NSE CASH EQ' },
      ] });
      if (url.endsWith('/api/v1/companies/co_ril')) return response({ data: { company_id: 'co_ril', common_name: 'Reliance Industries', sector: 'Oil Gas & Consumable Fuels', securities: [{ company_id: 'co_ril', symbol: 'RELIANCE', exchange: 'NSE' }] } });
      throw new Error(`unexpected request: ${url}`);
    }});
    const entity = await client.resolveCompany('reliance');
    expect(entity.company).toMatchObject({ company_id: 'co_ril', common_name: 'Reliance Industries' });
  });
});

describe('normalizers', () => {
  it('keeps canonical identity separate from exchange security identity', () => {
    expect(normalizeCompany({ id: 'co_1', common_name: 'TCS', cin: 'L22210MH1995PLC084781' })).toMatchObject({ company_id: 'co_1', common_name: 'TCS', cin: 'L22210MH1995PLC084781' });
    expect(normalizeSecurity({ id: 'sec_1', company_id: 'co_1', symbol: 'TCS', exchange: 'NSE', exchange_code: '532540', isin: 'INE467B01029' })).toMatchObject({ security_id: 'sec_1', company_id: 'co_1', symbol: 'TCS', exchange: 'NSE', exchange_code: '532540', isin: 'INE467B01029' });
  });
});
