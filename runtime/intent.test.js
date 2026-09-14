import { describe, expect, it } from 'vitest';
import { classifyIntent, extractReferences } from './intent.js';

describe('research intent', () => {
  it('keeps multi-word company names together', () => {
    expect(extractReferences('Analyze Reliance Industries')).toEqual(['Reliance Industries']);
    expect(extractReferences('Why did Reliance Industries fall?')).toEqual(['Reliance Industries']);
  });

  it('routes comparisons and broad India macro questions', () => {
    expect(classifyIntent('Compare TCS and Infosys').kind).toBe('compare');
    expect(classifyIntent('What is the RBI and inflation outlook?').kind).toBe('macro');
  });

  it('routes natural-language questions through Marked query', () => {
    expect(classifyIntent('What should I know about Reliance Industries?').kind).toBe('query');
    expect(classifyIntent('Analyze Reliance Industries PAT growth from FY2024 to FY2026').kind).toBe('query');
    expect(classifyIntent('Analyze Reliance Industries').kind).toBe('company');
    expect(classifyIntent('NSE:RELIANCE').kind).toBe('company');
  });
});
