let nextEvidence = 1;

export function evidenceFromRecord(record, { companyId = null, sourceType = 'marked', dataType = 'fact' } = {}) {
  const source = record?.source || record?.provenance || {};
  return {
    evidence_id: record?.evidence_id || `ev_${String(nextEvidence++).padStart(3, '0')}`,
    source_record_id: record?.fact_id ?? record?.document_id ?? record?.event_id ?? record?.action_id ?? null,
    company_id: companyId,
    metric: record?.concept_id ?? record?.metric ?? null,
    value: record?.value ?? null,
    company_name: record?.company_name ?? null,
    document_id: record?.document_id ?? source.document_id ?? null,
    source_type: sourceType,
    source_url: record?.source_url ?? source.source_url ?? source.url ?? null,
    title: record?.title ?? source.title ?? null,
    source_label: record?.source_label ?? source.label ?? null,
    filing_date: record?.filing_date ?? record?.published_at ?? source.filing_date ?? null,
    period: record?.period_end ?? record?.period ?? null,
    basis: record?.basis ?? null,
    page: record?.page ?? record?.source_page ?? source.page ?? null,
    section: record?.section ?? record?.source_section ?? source.section ?? null,
    unit: record?.unit ?? null,
    scale: record?.scale ?? null,
    excerpt: record?.excerpt ?? record?.content ?? record?.summary ?? null,
    retrieved_at: record?.retrieved_at ?? new Date().toISOString(),
    known_at: record?.known_at ?? source.known_at ?? null,
    data_type: dataType,
  };
}

export function buildEvidence(records, options) {
  return (Array.isArray(records) ? records : []).map(record => evidenceFromRecord(record, options));
}

export function validateClaims(result, evidence) {
  const known = new Set(evidence.map(item => item.evidence_id));
  const financial = new Set(evidence.filter(item => FINANCIAL_DATA_TYPES.includes(item.data_type)).map(item => item.evidence_id));
  const warnings = [];
  const claims = Array.isArray(result?.claims) ? result.claims : [];
  for (const claim of claims) {
    const ids = Array.isArray(claim.evidence_ids) ? claim.evidence_ids : [];
    const invalid = ids.filter(id => !known.has(id));
    if (!ids.length && claim.classification === 'fact') warnings.push(`Factual claim has no evidence: ${claim.text || 'unlabeled claim'}`);
    // A search or planning record cannot carry a number. If the claim states one,
    // it has to point at a validated financial fact, not at generic query evidence.
    if (claim.classification === 'fact' && ids.length && /\d/.test(String(claim.text)) && !ids.some(id => financial.has(id))) {
      warnings.push(`Numeric claim cites no validated financial fact: ${claim.text || 'unlabeled claim'}`);
    }
    if (invalid.length) {
      warnings.push(`Claim references unknown evidence: ${invalid.join(', ')}`);
      claim.evidence_ids = ids.filter(id => known.has(id));
    }
  }
  return { result, warnings };
}

// ── Financial fact typing ───────────────────────────────────────────────────
// A planning or search response is not a financial fact. Only a record that
// carries an actual value together with the identity that makes it meaningful
// — concept, period, basis, unit, company — is allowed to satisfy a financial
// claim. Everything else stays `query_evidence` and cannot back a number.

export const FINANCIAL_DATA_TYPES = ['financial_fact', 'metric'];

const REQUIRED_FACT_FIELDS = ['value', 'concept_id', 'period', 'basis', 'unit', 'company'];

/**
 * Turn one Marked row into a validated financial fact, or explain why it is not
 * one. Never returns a half-built fact: callers get `{ fact }` or `{ reason }`.
 */
export function toFinancialFact(row, { companyId = null, companyName = null, ticker = null, dataType = 'financial_fact' } = {}) {
  const raw = row?.value;
  const value = Number(raw);
  const conceptId = row?.concept_id ?? row?.metric ?? null;
  const fiscalYear = Number.isFinite(Number(row?.fiscal_year)) ? Number(row.fiscal_year) : null;
  const periodEnd = row?.period_end ?? row?.period ?? null;
  const period = fiscalYear ? `FY${fiscalYear}` : periodEnd;
  const unit = row?.unit ?? (dataType === 'metric' ? 'ratio' : null);
  const company = row?.company_id ?? companyId;

  const missing = REQUIRED_FACT_FIELDS.filter(field => ({
    value: raw === null || raw === undefined || raw === '' || !Number.isFinite(value),
    concept_id: !conceptId,
    period: !period,
    basis: !row?.basis,
    unit: !unit,
    company: !company,
  })[field]);
  if (missing.length) return { reason: `missing ${missing.join(', ')}`, row };

  const scale = Number.isFinite(Number(row?.scale)) ? Number(row.scale) : 1;
  return {
    fact: {
      data_type: dataType,
      fact_id: row?.fact_id ?? null,
      company_id: company,
      company_name: row?.company_name ?? companyName,
      ticker: row?.ticker ?? ticker,
      concept_id: conceptId,
      value: value * scale,
      reported_value: value,
      scale,
      unit,
      currency: /^[A-Z]{3}$/.test(String(unit)) ? String(unit) : null,
      period,
      period_end: periodEnd,
      period_start: row?.period_start ?? null,
      fiscal_year: fiscalYear,
      fiscal_quarter: row?.fiscal_quarter ?? null,
      basis: row?.basis,
      source: row?.source ?? 'marked',
      source_url: row?.source_url ?? null,
      source_label: row?.source_label ?? null,
      document_id: row?.document_id ?? null,
      known_at: row?.known_at ?? row?.published_at ?? null,
      retrieved_at: row?.retrieved_at ?? new Date().toISOString(),
    },
  };
}

export function validateFinancialFacts(rows, context) {
  const facts = [];
  const rejected = [];
  for (const row of Array.isArray(rows) ? rows : []) {
    const checked = toFinancialFact(row, context);
    if (checked.fact) facts.push(checked.fact); else rejected.push(checked);
  }
  return { facts, rejected };
}

/** One evidence record per value, so a three-year series cites three sources. */
export function financialFactEvidence(facts) {
  return (Array.isArray(facts) ? facts : []).map(fact => {
    const evidence = evidenceFromRecord({ ...fact, concept_id: fact.concept_id, period_end: fact.period_end }, {
      companyId: fact.company_id,
      dataType: fact.data_type,
    });
    evidence.value = fact.value;
    evidence.period = fact.period;
    evidence.unit = fact.unit;
    evidence.currency = fact.currency;
    evidence.fiscal_year = fact.fiscal_year;
    fact.evidence_id = evidence.evidence_id;
    return evidence;
  });
}
