import { describe, it, expect } from 'vitest';
import { buildEvidenceIndex, mergeWorldEvidence, parseEvidenceRef, refFor, refsFor, worldEvidence, evidenceDrawerBlocks, evidenceTable } from './evidence.js';

const world = () => ({
  common_name: 'Reliance',
  evidence: [
    { evidence_id: 'ev_001', metric: 'Revenue', value: 1.07e13, unit: 'INR', period: 'FY2026',
      basis: 'consolidated', title: 'Annual Financial Results', filing_date: '2026-04-21',
      known_at: '2026-04-21T00:00:00Z', source_url: 'https://nsearchives.nseindia.com/x.xml', company_name: 'Reliance Industries' },
    { evidence_id: 'ev_002', metric: 'TotalEquity', value: 9.34e12, unit: 'INR', period: 'FY2026', basis: 'consolidated' },
  ],
});

const text = blocks => blocks.map(b => b.text ?? '').join(' ');
const tableRows = blocks => blocks.find(b => b.table)?.table.rows ?? [];

describe('references', () => {
  it('numbers records from one, in retrieval order', () => {
    const index = buildEvidenceIndex(world());
    expect(index.list.map(r => r.ref)).toEqual(['E1', 'E2']);
    expect(index.byRef.get('E1').metric).toBe('Revenue');
  });

  it('maps a canonical evidence id to its display reference', () => {
    const w = world();
    expect(refFor(w, 'ev_002')).toBe('E2');
    expect(refFor(w, 'world_ev_002')).toBe('E2');
    expect(refFor(w, 'ev_missing')).toBeNull();
  });

  it('adds fresh research evidence without duplicating namespaced world evidence', () => {
    const w = world();
    worldEvidence(w);
    mergeWorldEvidence(w, [
      { evidence_id: 'world_ev_001', metric: 'Revenue' },
      { evidence_id: 'web_01', data_type: 'web', source_url: 'https://example.com' },
    ]);
    expect(w.evidence).toHaveLength(3);
    expect(refFor(w, 'world_ev_001')).toBe('E1');
    expect(refFor(w, 'web_01')).toBe('E3');
  });

  it('resolves a list of ids, deduplicated and in order', () => {
    const w = world();
    expect(refsFor(w, ['ev_002', 'ev_001', 'ev_002', 'nope'])).toEqual(['E2', 'E1']);
  });

  it('survives a world with no evidence at all', () => {
    expect(buildEvidenceIndex({}).list).toEqual([]);
    expect(refsFor({}, ['ev_001'])).toEqual([]);
  });
});

describe('parseEvidenceRef', () => {
  it('accepts the ways someone asks for a source', () => {
    for (const input of ['E12', 'e12', '[E12]', '/e 12', '/e12', 'E 12']) {
      expect(parseEvidenceRef(input)).toBe('E12');
    }
  });

  it('is not fooled by ordinary text', () => {
    for (const input of ['events', 'equity', 'why did EBITDA fall', '', 'E', '12']) {
      expect(parseEvidenceRef(input)).toBeNull();
    }
  });
});

describe('the drawer', () => {
  it('shows what was read and where it came from', () => {
    const rows = tableRows(evidenceDrawerBlocks(world(), 'E1')).map(r => r.cells.join(' '));
    const joined = rows.join('\n');
    expect(joined).toContain('Revenue');
    expect(joined).toContain('FY2026');
    expect(joined).toContain('consolidated');
    expect(joined).toContain('Annual Financial Results');
    expect(joined).toContain('nsearchives.nseindia.com');
    expect(joined).toContain('ev_001');
  });

  it('separates when a filing appeared from when its number became knowable', () => {
    const rows = tableRows(evidenceDrawerBlocks(world(), 'E1')).map(r => r.cells[0]);
    expect(rows).toContain('Published');
    expect(rows).toContain('Known at');
  });

  it('formats a rupee value in crore', () => {
    const value = tableRows(evidenceDrawerBlocks(world(), 'E1')).find(r => r.cells[0] === 'Value').cells[1];
    expect(value).toMatch(/₹10,70,000 Cr|₹10,70,000\.00 Cr/);
  });

  it('never implies a source was fetched when it was not', () => {
    const blocks = evidenceDrawerBlocks(world(), 'E1');
    expect(text(blocks)).toContain('not served by the API');
    expect(blocks.some(b => b.divider === 'SOURCE CONTENT')).toBe(false);
  });

  it('shows every restatement of a number when the trail was retrieved', () => {
    const w = world();
    w.evidence[0].trail = [
      { value: 1.06e13, unit: 'INR', source: 'nse', extraction_method: 'xbrl',
        published_at: '2026-04-24T17:27:12Z', known_at: '2026-04-24T17:27:12Z' },
      { value: 1.07e13, unit: 'INR', source: 'nse', extraction_method: 'xbrl',
        published_at: '2026-07-18T00:00:00Z', known_at: '2026-07-18T00:00:00Z' },
    ];
    const blocks = evidenceDrawerBlocks(w, 'E1');
    const trail = blocks.find(b => b.id === 'evidence-trail').table;
    expect(trail.rows).toHaveLength(2);
    expect(trail.headers).toEqual(['Value', 'Source', 'Read as', 'Published', 'Known at']);
    expect(trail.rows[1].cells[2]).toBe('xbrl');
    expect(blocks.some(b => b.divider === 'RESTATEMENTS · 2')).toBe(true);
  });

  // A fourth quarter and its full year share a 31 March period end, and the
  // endpoint addresses observations by period end alone. Two figures from one
  // filing at one instant are not a revision history.
  it('does not call two figures from the same filing a restatement', () => {
    const w = world();
    const instant = '2026-04-24T17:27:12Z';
    w.evidence[0].trail = [
      { value: 2.98e12, unit: 'INR', source: 'nse', extraction_method: 'xbrl', known_at: instant, published_at: instant },
      { value: 1.07e13, unit: 'INR', source: 'nse', extraction_method: 'xbrl', known_at: instant, published_at: instant },
    ];
    const blocks = evidenceDrawerBlocks(w, 'E1');
    expect(blocks.some(b => b.divider === 'OBSERVATIONS · 2')).toBe(true);
    expect(blocks.some(b => String(b.divider).startsWith('RESTATEMENTS'))).toBe(false);
    expect(text(blocks)).toContain('not revisions');
  });

  it('says the trail is unavailable rather than showing an empty one', () => {
    const w = world();
    w.evidence[0].trail_error = 'timeout';
    expect(text(evidenceDrawerBlocks(w, 'E1'))).toContain('Restatement trail unavailable');
  });

  it('shows the excerpt when one was actually retrieved', () => {
    const w = world();
    w.evidence[0].excerpt = 'Revenue from operations 10,42,000 crore';
    const blocks = evidenceDrawerBlocks(w, 'E1');
    expect(blocks.some(b => b.divider === 'SOURCE CONTENT')).toBe(true);
    expect(text(blocks)).toContain('10,42,000 crore');
  });

  it('says what the valid range is rather than showing an empty drawer', () => {
    expect(text(evidenceDrawerBlocks(world(), 'E99'))).toContain('E1–E2');
  });
});

describe('the list', () => {
  it('lists every record with its reference', () => {
    const table = evidenceTable(world());
    expect(table.rows.map(r => r.cells[0])).toEqual(['E1', 'E2']);
  });

  it('reports emptiness rather than rendering a bare header', () => {
    expect(evidenceTable({}).rows[0].cells[1]).toContain('No evidence');
  });
});

describe('naming the document', () => {
  const drawer = (record) => evidenceDrawerBlocks({ evidence: [record] }, 'E1')
    .find(b => b.table).table.rows.reduce((acc, r) => ({ ...acc, [r.cells[0]]: r.cells[1] }), {});

  // Facts carry an XBRL element name in source_label. Showing `ProfitBeforeTax`
  // under "Document" told the reader nothing about which filing it came from.
  it('names the filing from its URL when there is no title', () => {
    const row = drawer({
      evidence_id: 'ev_1', source_label: 'ProfitBeforeTax',
      source_url: 'https://nsearchives.nseindia.com/corporate/xbrl/INTEGRATED_FILING_INDAS_1658776.xml',
    });
    expect(row.Document).toContain('NSE XBRL');
    expect(row.Document).toContain('INTEGRATED_FILING_INDAS_1658776.xml');
    expect(row['Reported as']).toBe('ProfitBeforeTax');
  });

  it('prefers a real document title when one exists', () => {
    expect(drawer({ evidence_id: 'ev_1', title: 'Annual Report FY2026' }).Document).toBe('Annual Report FY2026');
  });

  it('shows a dash rather than inventing a document', () => {
    expect(drawer({ evidence_id: 'ev_1' }).Document).toBe('—');
  });

  it('reports the publication date when the fact carries one', () => {
    expect(drawer({ evidence_id: 'ev_1', published_at: '2026-04-21T00:00:00Z' }).Published).toContain('2026-04-21');
  });
});
