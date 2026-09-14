const LEADING_WORDS = /^(?:analyze|analyse|research|compare|contrast|study|look at|overview|fundamentals|financials|why did|what happened to|what changed in)\b/i;
const QUERY_WORDS = /\b(?:what|how|why|when|from|between|grow|growth|increase|decrease|profit|pat|revenue|earnings|sales|margin|debt|financial|year|last|previous|compare|versus|vs\.?|fy\d{2,4})\b/i;

export function classifyIntent(question) {
  const text = String(question).trim();
  const lower = text.toLowerCase();
  const references = extractReferences(text);
  if (/\b(?:vs\.?|versus)\b|\bcompare\b|\bcontrast\b/.test(lower) && references.length > 1) {
    return { kind: 'compare', references };
  }
  if (/\b(?:rbi|repo|inflation|cpi|wpi|gdp|pmi|liquidity|rupee|inr|crude|bond yield|fiscal)\b/.test(lower)) {
    return { kind: 'macro', references: [] };
  }
  if (/\b(?:sector|industry|screen|leaders|laggards|rotation)\b/.test(lower)) {
    return { kind: 'sector', references: [] };
  }
  if (/\b(?:watchlist|watch|track|alerts?)\b/.test(lower)) {
    return { kind: 'watch', references };
  }
  if (/\b(?:options?|futures?|derivatives?|open interest|oi)\b/.test(lower)) {
    return { kind: 'derivatives', references };
  }
  const candidate = text.replace(LEADING_WORDS, '').trim();
  if ((LEADING_WORDS.test(text) && looksLikeCompanyReference(candidate)) || isBareEntityReference(text)) {
    return { kind: 'company', references: references.slice(0, 1) };
  }
  return { kind: 'query', references: [] };
}

export function looksLikeCompanyReference(value) {
  const text = String(value).trim();
  return Boolean(text) && text.length <= 80 && text.split(/\s+/).length <= 5 && !QUERY_WORDS.test(text);
}

function isBareEntityReference(text) {
  const value = String(text).trim();
  return /^(?:NSE|BSE):[A-Za-z0-9._-]+$/i.test(value)
    || /^INE[A-Z0-9]{6,}$/i.test(value)
    || /^[A-Z][A-Z0-9._-]{1,9}$/.test(value);
}

export function extractReferences(question) {
  const query = String(question).replace(LEADING_WORDS, '').trim();
  return query
    .split(/\s+(?:vs\.?|versus|and)\s+/i)
    .map(item => item
      .replace(/\s+(?:fall|fell|rise|rose|drop|dropped|jump|jumped|move|moved|underperform|outperform|decline|declined|crash|rally)\b.*$/i, '')
      .replace(/[?.!,;:]+$/, '')
      .trim())
    .filter(Boolean);
}
