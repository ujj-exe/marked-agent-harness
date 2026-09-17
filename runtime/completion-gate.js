/** Deterministic post-synthesis checks. The model may propose coverage; it may not grade itself. */
export function auditResearchResult({ result, mandate, evidence = [], validationIssues = [], packetCoverage = [], searchAttempted = false }) {
  const known = new Set(evidence.map(item => item.evidence_id).filter(Boolean));
  const claimed = new Set((result.claims ?? []).flatMap(claim => claim.evidence_ids ?? []));
  const supplied = new Map((result.coverage ?? []).map(item => [item.requirement, item]));
  const packet = new Map(packetCoverage.map(item => [item.id, item]));
  const issues = validationIssues.filter(issue => issue.material).map(issue => ({ ...issue, stage: 'citation' }));
  const coverage = [];

  for (const requirement of mandate.requirements) {
    const entry = supplied.get(requirement.id);
    const ids = [...new Set((entry?.evidence_ids ?? []).filter(id => known.has(id) && claimed.has(id)))];
    const invalid = (entry?.evidence_ids ?? []).filter(id => !known.has(id));
    const unlinked = (entry?.evidence_ids ?? []).filter(id => known.has(id) && !claimed.has(id));
    let status = entry?.status ?? 'missing';
    if (status === 'complete' && !ids.length) status = 'partial';
    if (!entry) {
      issues.push({ code: 'missing_requirement', stage: 'coverage', material: true, requirement: requirement.id, message: `${requirement.label} was not addressed.` });
    } else if (!ids.length && invalid.length) {
      issues.push({ code: 'unknown_coverage_evidence', stage: 'coverage', material: true, requirement: requirement.id, evidence_ids: invalid, message: `${requirement.label} cites unknown evidence.` });
    } else if (!ids.length && unlinked.length) {
      issues.push({ code: 'unlinked_coverage_evidence', stage: 'coverage', material: true, requirement: requirement.id, evidence_ids: unlinked, message: `${requirement.label} cites evidence that supports no retained claim.` });
    }
    if (status !== 'complete') {
      issues.push({
        code: status === 'unavailable' ? 'unavailable_requirement' : 'incomplete_requirement',
        stage: 'coverage', material: true, requirement: requirement.id,
        message: `${requirement.label} is ${status}.`,
      });
    }
    coverage.push({
      requirement: requirement.id,
      label: requirement.label,
      status,
      evidence_ids: ids,
      packet_status: packet.get(requirement.id)?.status ?? 'missing',
      note: entry?.note ?? '',
    });
  }

  for (const field of ['summary', 'thesis']) {
    const tokens = materialNumbers(result[field]);
    const citedText = (result.claims ?? []).filter(claim => claim.evidence_ids?.length).map(claim => claim.text).join(' ');
    const uncited = tokens.filter(token => !citedText.includes(token));
    if (uncited.length) {
      issues.push({
        code: 'uncited_numeric_narrative', stage: 'citation', material: true, field,
        values: uncited, message: `${field} contains material figures absent from cited claims: ${uncited.join(', ')}`,
      });
    }
  }

  const material = dedupeIssues(issues);
  return {
    passed: material.length === 0,
    needs_repair: material.length > 0,
    search_attempted: searchAttempted,
    coverage,
    material_issues: material,
    missing_requirements: [...new Set(material.map(issue => issue.requirement).filter(Boolean))],
  };
}

/** Remove claims already rejected by the citation gate before a final render. */
export function finalizeIncompleteResult(result, audit) {
  if (audit.passed) return { ...result, material_gaps: [] };
  const labels = audit.coverage.filter(item => item.status !== 'complete').map(item => `${item.label}: ${item.status}`);
  const citationFailed = audit.material_issues.some(issue => issue.stage === 'citation');
  const supportedLead = (result.claims ?? []).find(claim => claim.evidence_ids?.length)?.text;
  return {
    ...result,
    ...(citationFailed ? {
      summary: supportedLead || 'The requested conclusion could not be stated with validated material evidence.',
      thesis: supportedLead || 'The requested conclusion could not be stated with validated material evidence.',
    } : {}),
    material_gaps: [...new Set([...(result.material_gaps ?? []), ...labels])],
    context: `${String(result.context ?? '').trim()}${result.context ? ' ' : ''}Coverage remained incomplete after the bounded research loop: ${labels.join('; ') || 'see the evidence audit'}.`,
  };
}

function materialNumbers(value) {
  const text = String(value ?? '');
  return [...new Set(text.match(/(?:₹|INR|USD)\s*[\d,.]+|\bFY\s?\d{2,4}\b|\b\d+(?:\.\d+)?%|\b20\d{2}\b/gi) ?? [])];
}

function dedupeIssues(issues) {
  const seen = new Set();
  return issues.filter(issue => {
    const key = `${issue.code}\0${issue.requirement ?? ''}\0${issue.claim ?? ''}\0${issue.field ?? ''}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
