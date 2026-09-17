/**
 * evidence.js — every number on screen, traceable to the filing behind it.
 *
 * Marked's claim is that a figure is checkable, not merely plausible. That only
 * means something if a reader can get from a number to its source without
 * leaving the terminal, so each retrieved fact gets a short reference — `E12` —
 * that appears beside it and opens a drawer describing exactly what was read.
 *
 * Short references are assigned per world and are stable while it is open. They
 * are display handles, not identity: the canonical `evidence_id` travels with
 * the record and is what the reasoning provider cites.
 */

/**
 * Index a world's evidence, assigning display references.
 *
 * @returns {{list: object[], byRef: Map<string, object>, byEvidenceId: Map<string, object>}}
 */
export function buildEvidenceIndex(world) {
  const records = Array.isArray(world?.evidence) ? world.evidence : [];
  const list = [];
  const byRef = new Map();
  const byEvidenceId = new Map();

  records.forEach((record, index) => {
    const ref = `E${index + 1}`;
    const entry = { ...record, ref };
    list.push(entry);
    byRef.set(ref.toUpperCase(), entry);
    if (record.evidence_id) {
      byEvidenceId.set(record.evidence_id, entry);
      // Research packets namespace evidence already present in an open world
      // so it cannot collide with freshly retrieved rows. Both ids must open
      // the same user-facing E reference.
      byEvidenceId.set(`world_${record.evidence_id}`, entry);
    }
  });
  return { list, byRef, byEvidenceId };
}

/** The index for this world, built once and kept on it. */
export function worldEvidence(world) {
  if (!world._evidence) world._evidence = buildEvidenceIndex(world);
  return world._evidence;
}

/** `E12` for an evidence_id, or null when that id was never retrieved. */
export function refFor(world, evidenceId) {
  return worldEvidence(world).byEvidenceId.get(evidenceId)?.ref ?? null;
}

/** Display references for a list of evidence ids, in order, deduplicated. */
export function refsFor(world, evidenceIds = []) {
  const seen = new Set();
  const refs = [];
  for (const id of evidenceIds) {
    const ref = refFor(world, id);
    if (ref && !seen.has(ref)) { seen.add(ref); refs.push(ref); }
  }
  return refs;
}

/** Add evidence retrieved by a world-scoped question to that world's drawer. */
export function mergeWorldEvidence(world, evidence = []) {
  const records = Array.isArray(world?.evidence) ? world.evidence : [];
  const known = new Set(records.map(item => item?.evidence_id).filter(Boolean));
  for (const item of evidence) {
    const id = item?.evidence_id;
    if (!id || id.startsWith('world_') || known.has(id)) continue;
    records.push(item);
    known.add(id);
  }
  world.evidence = records;
  delete world._evidence;
  return world;
}

/** Parse `E12`, `/e 12`, `e12` — the ways someone asks to see a source. */
export function parseEvidenceRef(input) {
  const text = String(input ?? '').trim();
  const match = text.match(/^\/?e\s*(\d{1,4})$/i) || text.match(/^\[?(E\d{1,4})\]?$/i);
  if (!match) return null;
  const digits = match[1].replace(/^e/i, '');
  return `E${Number(digits)}`;
}

/**
 * The drawer for one reference.
 *
 * Shows what was read, from which document, when it was published and when it
 * became knowable — the last two differ, and the difference is the whole point
 * of a point-in-time system.
 */
export function evidenceDrawerBlocks(world, ref) {
  const index = worldEvidence(world);
  const record = index.byRef.get(String(ref).toUpperCase());
  if (!record) {
    return [
      { divider: 'EVIDENCE' },
      { text: `No evidence ${ref} in this world. References run E1–E${index.list.length || 0}.`, id: 'evidence-missing' },
    ];
  }

  const rows = [
    ['Reference', record.ref],
    ['Company', record.company_name ?? world.common_name ?? '—'],
    ['Measure', record.metric ?? record.data_type ?? '—'],
    ['Value', formatEvidenceValue(record)],
    ['Period', record.period ?? '—'],
    ['Basis', record.basis ?? '—'],
    ['Document', documentName(record)],
    ['Reported as', record.source_label ?? '—'],
    ['Published', record.filing_date ?? record.published_at ?? '—'],
    // Published is when the filing appeared; known-at is when Marked could
    // first have answered with it. A backtest must respect the second.
    ['Known at', record.known_at ?? '—'],
    ['Retrieved', record.retrieved_at ?? '—'],
    ['Page / section', [record.page, record.section].filter(Boolean).join(' · ') || '—'],
    ['Source', record.source_url ?? '—'],
    ['Evidence id', record.evidence_id ?? '—'],
  ].map(([label, value]) => ({ cells: [label, String(value)] }));

  const blocks = [
    { divider: `EVIDENCE · ${record.ref}` },
    { table: { headers: ['Field', ''], rows }, id: 'evidence-record' },
  ];

  // Every version of this number that was ever published. A figure that was
  // restated is the most important thing a reader can know about it, and the
  // difference between published_at and known_at is what a point-in-time
  // backtest has to respect.
  if (Array.isArray(record.trail) && record.trail.length) {
    // The trail is addressed by (concept, period end, basis), and a fourth
    // quarter shares its period end with the full year. Observations that
    // became knowable at the same instant are therefore different facts from
    // one filing, not successive versions of one — calling those
    // "restatements" would invent a revision that never happened.
    const instants = new Set(record.trail.map(observation => String(observation.known_at ?? '')));
    const restated = instants.size > 1;
    blocks.push(
      { divider: restated ? `RESTATEMENTS · ${record.trail.length}` : `OBSERVATIONS · ${record.trail.length}` },
      ...(restated ? [] : [{
        text: 'Same filing, same instant — these are separate figures sharing a period end (a fourth quarter and its full year), not revisions.',
        id: 'evidence-trail-note',
      }]),
      { table: {
        headers: ['Value', 'Source', 'Read as', 'Published', 'Known at'],
        rows: record.trail.map(observation => ({ cells: [
          formatEvidenceValue(observation),
          String(observation.source ?? '—'),
          String(observation.extraction_method ?? '—'),
          String(observation.published_at ?? '—').slice(0, 10),
          String(observation.known_at ?? '—').slice(0, 16).replace('T', ' '),
        ] })),
      }, id: 'evidence-trail' },
    );
  } else if (record.trail_error) {
    blocks.push({ text: `Restatement trail unavailable · ${record.trail_error}`, id: 'evidence-trail-error' });
  }

  if (record.excerpt) {
    blocks.push({ divider: 'SOURCE CONTENT' }, { text: String(record.excerpt).slice(0, 2000), id: 'evidence-excerpt' });
  } else if (record.source_url) {
    // The filing is reachable; its text is not served by the API. Saying which
    // is which beats implying the document was read.
    blocks.push({ text: 'Filing text is not served by the API — the source link above is the document itself.', id: 'evidence-note' });
  }
  return blocks;
}

/**
 * A document a person can name.
 *
 * Facts carry an XBRL tag in `source_label` — `ProfitBeforeTax` — which is the
 * element read, not the filing it came from. Showing that under "Document"
 * told the reader nothing about where the number lives, so the filing is named
 * from its own URL and the tag keeps its own line.
 */
function documentName(record) {
  if (record.title) return record.title;
  const url = String(record.source_url ?? '');
  if (!url) return '—';
  const host = url.match(/https?:\/\/([^/]+)/)?.[1] ?? '';
  const exchange = /nseindia/i.test(host) ? 'NSE' : /bseindia/i.test(host) ? 'BSE' : host.split('.').slice(-2)[0] || 'source';
  const file = url.split('/').pop()?.split('?')[0] ?? '';
  const kind = /xbrl/i.test(url) ? 'XBRL' : /\.pdf$/i.test(file) ? 'PDF' : 'filing';
  return `${exchange} ${kind}${file ? ` · ${file}` : ''}`;
}

function formatEvidenceValue(record) {
  const value = Number(record.value);
  if (!Number.isFinite(value)) return record.value == null ? '—' : String(record.value);
  const scaled = value * (Number(record.scale) || 1);
  if ((record.unit ?? '').toUpperCase() === 'INR' || record.currency === 'INR') {
    return Math.abs(scaled) >= 1e7
      ? `₹${(scaled / 1e7).toLocaleString('en-IN', { maximumFractionDigits: 2 })} Cr`
      : `₹${scaled.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
  }
  return scaled.toLocaleString('en-IN', { maximumFractionDigits: 2 });
}

/**
 * A compact list of what a world can show, for the Evidence tab.
 */
export function evidenceTable(world, limit = 40) {
  const { list } = worldEvidence(world);
  if (!list.length) return { headers: ['Ref', 'Measure', 'Period', 'Source'], rows: [{ cells: ['—', 'No evidence retrieved', '—', '—'] }] };
  return {
    headers: ['Ref', 'Measure', 'Period', 'Basis', 'Document'],
    rows: list.slice(0, limit).map(record => ({
      cells: [
        record.ref,
        String(record.metric ?? record.data_type ?? '—'),
        String(record.period ?? '—'),
        String(record.basis ?? '—'),
        documentName(record),
      ],
    })),
  };
}
