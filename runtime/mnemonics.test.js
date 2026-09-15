import { describe, it, expect } from 'vitest';
import { parseMnemonic } from './mnemonics.js';

describe('parseMnemonic', () => {
  it('reads a bare ticker as a company request', () => {
    expect(parseMnemonic('RELIANCE')).toMatchObject({ mnemonic: null, reference: 'RELIANCE' });
  });

  it('reads a capitalised name', () => {
    expect(parseMnemonic('Infosys')).toMatchObject({ reference: 'Infosys' });
  });

  it('reads a mnemonic and its subject', () => {
    expect(parseMnemonic('FA INFY')).toMatchObject({ mnemonic: 'fa', reference: 'INFY' });
    expect(parseMnemonic('cacs tcs')).toMatchObject({ mnemonic: 'cacs', reference: 'tcs', route: 'event_research' });
  });

  it('sends announcements down the disclosure-first route', () => {
    expect(parseMnemonic('ANR WIPRO').route).toBe('filing_research');
  });

  it('leaves real questions alone', () => {
    expect(parseMnemonic('What was Infosys PAT in FY2025?')).toBeNull();
    expect(parseMnemonic('compare tcs and infosys')).toBeNull();
    expect(parseMnemonic('pharma companies with rising revenue')).toBeNull();
  });

  it('never claims a slash command', () => {
    expect(parseMnemonic('/analyst RELIANCE')).toBeNull();
    expect(parseMnemonic('/model')).toBeNull();
  });

  it('does not read a lowercase word as a ticker', () => {
    expect(parseMnemonic('revenue')).toBeNull();
    expect(parseMnemonic('help')).toBeNull();
  });

  it('does not read an unknown two-word phrase as a mnemonic', () => {
    expect(parseMnemonic('XY INFY')).toBeNull();
    expect(parseMnemonic('good morning')).toBeNull();
  });

  it('ignores anything carrying a question mark', () => {
    expect(parseMnemonic('RELIANCE?')).toBeNull();
  });
});
