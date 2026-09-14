import { describe, it, expect } from 'vitest';
import { setTheme } from './themes.js';
import { strip } from './ansi.js';
import { renderMarkdownInline, renderMarkdownBlock } from './markdown.js';

// Use a predictable theme for testing
setTheme('marked');

describe('renderMarkdownInline', () => {
  it('renders **bold** as ANSI bold', () => {
    const result = renderMarkdownInline('this is **bold** text');
    expect(result).toContain('\x1b[1m');
    expect(strip(result)).toBe('this is bold text');
  });

  it('renders *italic* as ANSI dim', () => {
    const result = renderMarkdownInline('this is *italic* text');
    expect(result).toContain('\x1b[2m');
    expect(strip(result)).toBe('this is italic text');
  });

  it('renders `code` with highlight color', () => {
    const result = renderMarkdownInline('use `$206` level');
    expect(result).toContain('38;2;'); // true-color ANSI
    expect(strip(result)).toBe('use $206 level');
  });

  it('handles mixed inline elements', () => {
    const result = renderMarkdownInline('**RSI** at *oversold* near `$200`');
    expect(strip(result)).toBe('RSI at oversold near $200');
  });

  it('does not break on text with no markdown', () => {
    const result = renderMarkdownInline('plain text here');
    expect(strip(result)).toBe('plain text here');
  });

  it('handles bold before italic to avoid ** vs * conflict', () => {
    const result = renderMarkdownInline('**strong** and *emphasis*');
    expect(strip(result)).toBe('strong and emphasis');
    // Bold should be present
    expect(result).toContain('\x1b[1m');
    // Dim should be present
    expect(result).toContain('\x1b[2m');
  });
});

describe('renderMarkdownBlock', () => {
  it('renders # heading with accent bold', () => {
    const result = renderMarkdownBlock('# My Heading');
    expect(result).toContain('\x1b[1m');
    expect(strip(result)).toBe('My Heading');
  });

  it('renders ## h2 heading', () => {
    const result = renderMarkdownBlock('## Sub Heading');
    expect(strip(result)).toBe('Sub Heading');
  });

  it('renders > blockquote with bar', () => {
    const result = renderMarkdownBlock('> This is a quote');
    expect(strip(result)).toContain('▌');
    expect(strip(result)).toContain('This is a quote');
  });

  it('renders - list items with ✦ bullet', () => {
    const result = renderMarkdownBlock('- First item\n- Second item');
    const lines = result.split('\n');
    expect(strip(lines[0])).toContain('✦');
    expect(strip(lines[0])).toContain('First item');
    expect(strip(lines[1])).toContain('✦');
    expect(strip(lines[1])).toContain('Second item');
  });

  it('renders --- as horizontal rule', () => {
    const result = renderMarkdownBlock('---');
    expect(strip(result)).toContain('─');
  });

  it('preserves empty lines', () => {
    const result = renderMarkdownBlock('line 1\n\nline 2');
    const lines = result.split('\n');
    expect(lines).toHaveLength(3);
    expect(lines[1]).toBe('');
  });

  it('applies inline formatting within block elements', () => {
    const result = renderMarkdownBlock('- **Bold** item with `code`');
    expect(strip(result)).toContain('✦');
    expect(strip(result)).toContain('Bold item with code');
  });

  it('colors signed percent values inside markdown pipe tables only', () => {
    const md = [
      '| Sector | Today | 52W |',
      '| ------ | ----- | --- |',
      '| Energy | +1.44% | +30.4% |',
      '| Tech | -2.87% | +29.3% |',
    ].join('\n');

    const result = renderMarkdownBlock(md);
    expect(result).toContain('\x1b[38;2;114;198;107m+1.44%\x1b[0m');
    expect(result).toContain('\x1b[38;2;231;119;90m-2.87%\x1b[0m');
    expect(strip(result)).toContain('| Energy | +1.44% | +30.4% |');
  });

  it('does not color signed percent text outside markdown tables', () => {
    const result = renderMarkdownBlock('Today moved +1.44% but this is prose.');
    expect(result).not.toContain('\x1b[38;2;114;198;107m+1.44%\x1b[0m');
    expect(strip(result)).toBe('Today moved +1.44% but this is prose.');
  });

  it('renders full research mode example', () => {
    const md = [
      '# AAPL Analysis',
      '',
      '> Apple is positioned for a **strong** rebound near `$206` support.',
      '',
      '- Catalyst: iPhone 17 launch in *September*',
      '- Risk: **China tariff** escalation',
      '',
      '---',
    ].join('\n');

    const result = renderMarkdownBlock(md);
    const plain = strip(result);
    expect(plain).toContain('AAPL Analysis');
    expect(plain).toContain('▌');
    expect(plain).toContain('✦');
    expect(plain).toContain('─');
  });
});
