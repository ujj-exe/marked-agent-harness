const LAST_FY = /\b(?:last|previous|prior)\s+(?:financial|fiscal)\s+year\b|\b(?:last|previous|prior)\s+fy\b/i;

export function resolveTemporal(question, asOf = new Date()) {
  const match = String(question).match(LAST_FY);
  if (!match) return null;
  const date = asOf instanceof Date ? asOf : new Date(asOf);
  if (Number.isNaN(date.getTime())) return null;
  const month = date.getUTCMonth();
  const year = date.getUTCFullYear();
  const fiscalYear = month > 2 || (month === 2 && date.getUTCDate() === 31) ? year : year - 1;
  return {
    phrase: match[0],
    fiscal_year: fiscalYear,
    period_end: `${fiscalYear}-03-31`,
    label: `FY${fiscalYear}`,
    description: `Indian financial year ${fiscalYear - 1}-04-01 through ${fiscalYear}-03-31`,
  };
}

export function resolvedQuestion(question, temporal) {
  if (!temporal) return question;
  return `${question}\nRuntime temporal resolution: ${temporal.phrase} means ${temporal.label}, ending ${temporal.period_end}. Treat this as an exact fiscal-year constraint.`;
}
