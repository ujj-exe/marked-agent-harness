import { describe, expect, it } from 'vitest';
import { MarkedClient, normalizeCompany, normalizeSecurity } from './marked-client.js';

function response(body, status = 200) {
  return {
    ok: status < 400,
    status,
    headers: { entries: () => [['x-quota-remaining', '19']] },
    text: async () => JSON.stringify(body),
  };
}

describe('MarkedClient', () => {
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

  it('resolves a canonical company before fetching its instruments', async () => {
    const calls = [];
    const client = new MarkedClient({ apiKey: 'mk_test', fetchImpl: async (url, options) => {
      calls.push({ url, options });
      if (url.endsWith('/v1/search')) return response({ data: [{ kind: 'company', company_id: 'co_ril', common_name: 'Reliance Industries', legal_name: 'Reliance Industries Limited', isin: 'INE002A01018' }] });
      if (url.includes('/v1/instruments')) return response({ data: [{ security_id: 'sec_ril_nse', company_id: 'co_ril', symbol: 'RELIANCE', exchange: 'NSE', isin: 'INE002A01018', instrument_type: 'EQUITY' }] });
      throw new Error(`unexpected request: ${url}`);
    }});
    const entity = await client.resolveCompany('Reliance');
    expect(entity.company.company_id).toBe('co_ril');
    expect(entity.securities[0]).toMatchObject({ security_id: 'sec_ril_nse', symbol: 'RELIANCE', exchange: 'NSE' });
    expect(calls).toHaveLength(2);
  });

  it('resolves a security hit such as a BSE scrip to its canonical company', async () => {
    const client = new MarkedClient({ apiKey: 'mk_test', fetchImpl: async url => {
      if (url.endsWith('/v1/search')) return response({ data: [{ kind: 'security', company_id: 'co_ril', title: 'RELIANCE', subtitle: 'BSE CASH EQ' }] });
      if (url.includes('/v1/instruments')) return response({ data: [{ company_id: 'co_ril', symbol: 'RELIANCE', exchange: 'BSE', exchange_code: '500325', segment: 'CASH', instrument_type: 'EQ' }] });
      throw new Error(`unexpected request: ${url}`);
    }});
    const entity = await client.resolveCompany('BSE:500325');
    expect(entity.company).toMatchObject({ company_id: 'co_ril', common_name: 'RELIANCE' });
    expect(entity.securities[0]).toMatchObject({ exchange: 'BSE', exchange_code: '500325' });
  });

  it('uses an exact ticker hit to disambiguate similar company names', async () => {
    const client = new MarkedClient({ apiKey: 'mk_test', fetchImpl: async url => {
      if (url.endsWith('/v1/search')) return response({ data: [
        { kind: 'company', company_id: 'co_other', title: 'Reliance Power' },
        { kind: 'company', company_id: 'co_ril', title: 'Reliance Industries' },
        { kind: 'security', company_id: 'co_ril', title: 'RELIANCE', subtitle: 'NSE CASH EQ' },
      ] });
      if (url.includes('/v1/instruments')) return response({ data: [{ company_id: 'co_ril', symbol: 'RELIANCE', exchange: 'NSE' }] });
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
