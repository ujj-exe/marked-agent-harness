import { describe, it, expect, beforeEach } from 'vitest';
import { setTheme } from './themes.js';
import {
  fg, bg, c, pc,
  BOLD, DIM, RESET,
  strip, visLen, ansiTrunc,
  padRight, padLeft, padCenter,
  boxTop, boxBot, boxRow, boxDivider, boxEmpty,
  wordWrap,
} from './ansi.js';

beforeEach(() => setTheme('marked'));

it('hard-wraps tokens longer than the available width', () => {
  expect(wordWrap('[ev_1][ev_2][ev_3]', 8).every(line => line.length <= 8)).toBe(true);
});

// ── fg / bg ───────────────────────────────────────────────────────────────────

describe('fg', () => {
  it('returns a truecolor ANSI foreground code', () => {
    const code = fg('#ff0000');
    expect(code).toBe('\x1b[38;2;255;0;0m');
  });

  it('handles lowercase hex', () => {
    const code = fg('#00ff88');
    expect(code).toBe('\x1b[38;2;0;255;136m');
  });

  it('handles hex with all channels', () => {
    expect(fg('#c0ff00')).toBe('\x1b[38;2;192;255;0m');
  });
});

describe('bg', () => {
  it('returns a truecolor ANSI background code', () => {
    const code = bg('#0000ff');
    expect(code).toBe('\x1b[48;2;0;0;255m');
  });

  it('handles white', () => {
    expect(bg('#ffffff')).toBe('\x1b[48;2;255;255;255m');
  });
});

// ── c ─────────────────────────────────────────────────────────────────────────

describe('c', () => {
  it('wraps text with a hex color and reset', () => {
    const result = c('#ff0000', 'hello');
    expect(result).toContain('hello');
    expect(result).toContain('\x1b[38;2;255;0;0m');
    expect(result).toContain(RESET);
  });

  it('returns plain text when hex is falsy', () => {
    expect(c('', 'plain')).toBe('plain');
    expect(c(null, 'plain')).toBe('plain');
  });

  it('accepts a raw ANSI code (non-hex)', () => {
    const result = c('\x1b[1m', 'bold');
    expect(result).toContain('\x1b[1m');
    expect(result).toContain('bold');
    expect(result).toContain(RESET);
  });

  it('strip of output equals original text', () => {
    const result = c('#374EFF', 'test text');
    expect(strip(result)).toBe('test text');
  });
});

// ── pc ────────────────────────────────────────────────────────────────────────

describe('pc', () => {
  it('colors text using a palette role', () => {
    const result = pc('positive', 'UP');
    expect(strip(result)).toBe('UP');
    expect(result).toContain('\x1b[38;2;'); // truecolor
  });

  it('returns plain text for unknown role', () => {
    const result = pc('nonexistent_role', 'fallback');
    expect(result).toBe('fallback');
  });

  it('handles muted role', () => {
    const result = pc('muted', 'dim text');
    expect(strip(result)).toBe('dim text');
  });
});

// ── strip ─────────────────────────────────────────────────────────────────────

describe('strip', () => {
  it('removes ANSI escape codes', () => {
    expect(strip('\x1b[1mhello\x1b[0m')).toBe('hello');
  });

  it('removes truecolor codes', () => {
    expect(strip('\x1b[38;2;255;0;0mred\x1b[0m')).toBe('red');
  });

  it('handles multiple codes in sequence', () => {
    expect(strip('\x1b[1m\x1b[2mtext\x1b[0m')).toBe('text');
  });

  it('returns plain strings unchanged', () => {
    expect(strip('plain')).toBe('plain');
  });

  it('coerces non-strings', () => {
    expect(strip(42)).toBe('42');
  });

  it('handles empty string', () => {
    expect(strip('')).toBe('');
  });
});

// ── visLen ────────────────────────────────────────────────────────────────────

describe('visLen', () => {
  it('measures plain text correctly', () => {
    expect(visLen('hello')).toBe(5);
  });

  it('ignores ANSI escape codes', () => {
    expect(visLen('\x1b[1mhello\x1b[0m')).toBe(5);
  });

  it('measures colored text by visible chars only', () => {
    const colored = pc('positive', 'BUY');
    expect(visLen(colored)).toBe(3);
  });

  it('returns 0 for empty string', () => {
    expect(visLen('')).toBe(0);
  });
});

// ── ansiTrunc ─────────────────────────────────────────────────────────────────

describe('ansiTrunc', () => {
  it('truncates plain text to maxVis', () => {
    expect(strip(ansiTrunc('hello world', 5))).toBe('hello');
  });

  it('returns string unchanged when shorter than maxVis', () => {
    expect(ansiTrunc('hi', 10)).toBe('hi');
  });

  it('handles ANSI codes without counting them', () => {
    const colored = '\x1b[38;2;255;0;0mhello\x1b[0m';
    const truncated = ansiTrunc(colored, 3);
    expect(strip(truncated)).toBe('hel');
  });

  it('appends RESET when truncation occurs mid-ANSI-span', () => {
    const colored = '\x1b[38;2;255;0;0mhello world\x1b[0m';
    const truncated = ansiTrunc(colored, 5);
    expect(truncated).toContain(RESET);
  });

  it('handles empty string', () => {
    expect(ansiTrunc('', 10)).toBe('');
  });

  // ── OSC8 hyperlink handling ──────────────────────────────────────────────

  it('returns OSC8 link unchanged when it fits', () => {
    const link = '\x1b]8;;https://example.com\x07Hello\x1b]8;;\x07';
    const result = ansiTrunc(link, 10);
    expect(result).toBe(link);
    expect(strip(result)).toBe('Hello');
  });

  it('truncates OSC8 link and closes it properly', () => {
    const link = '\x1b]8;;https://example.com\x07Hello World\x1b]8;;\x07';
    const result = ansiTrunc(link, 5);
    expect(strip(result)).toBe('Hello');
    // Must contain the OSC8 close sequence before RESET
    expect(result).toContain('\x1b]8;;\x07');
    expect(result).toContain(RESET);
  });

  it('handles multiple OSC8 links', () => {
    const link1 = '\x1b]8;;https://a.com\x07AAA\x1b]8;;\x07';
    const link2 = '\x1b]8;;https://b.com\x07BBB\x1b]8;;\x07';
    const s = link1 + ' ' + link2;
    // visLen = 3 + 1 + 3 = 7
    expect(visLen(s)).toBe(7);

    // Truncate to include all of first link + space + partial second
    const result = ansiTrunc(s, 5);
    expect(strip(result)).toBe('AAA B');
    // Second link was opened and needs closing
    expect(result).toContain('\x1b]8;;\x07');
  });

  it('handles ANSI colors nested inside OSC8 links', () => {
    const colored = '\x1b[38;2;255;0;0mRed Text\x1b[0m';
    const link = `\x1b]8;;https://example.com\x07${colored}\x1b]8;;\x07`;
    expect(visLen(link)).toBe(8);

    // Fits entirely
    const full = ansiTrunc(link, 20);
    expect(full).toBe(link);

    // Needs truncation
    const truncated = ansiTrunc(link, 3);
    expect(strip(truncated)).toBe('Red');
    // Must close the OSC8 link
    expect(truncated).toContain('\x1b]8;;\x07');
    expect(truncated).toContain(RESET);
  });

  it('handles OSC8 with ST terminator (\\x1b\\\\)', () => {
    const link = '\x1b]8;;https://example.com\x1b\\Hello\x1b]8;;\x1b\\';
    expect(visLen(link)).toBe(5);
    const result = ansiTrunc(link, 10);
    expect(result).toBe(link);
  });

  it('closes OSC8 link when truncation hits mid-link text', () => {
    const link = '\x1b]8;;https://example.com\x07ABCDEFGHIJ\x1b]8;;\x07';
    const result = ansiTrunc(link, 3);
    expect(strip(result)).toBe('ABC');
    // OSC8 open should be present, then text, then OSC8 close + RESET
    expect(result).toMatch(/\x1b\]8;;https:\/\/example\.com\x07ABC\x1b\]8;;\x07/);
  });
});

// ── visLen with OSC8 ─────────────────────────────────────────────────────────

describe('visLen with OSC8', () => {
  it('ignores OSC8 sequences in length calculation', () => {
    const link = '\x1b]8;;https://example.com\x07Click\x1b]8;;\x07';
    expect(visLen(link)).toBe(5);
  });

  it('handles OSC8 + SGR combined', () => {
    const s = '\x1b]8;;https://x.com\x07\x1b[1mBold Link\x1b[0m\x1b]8;;\x07';
    expect(visLen(s)).toBe(9);
  });

  it('handles multiple OSC8 links', () => {
    const s = '\x1b]8;;https://a.com\x07A\x1b]8;;\x07 \x1b]8;;https://b.com\x07B\x1b]8;;\x07';
    expect(visLen(s)).toBe(3); // "A B"
  });

  it('handles OSC8 with ST terminator', () => {
    const link = '\x1b]8;;https://example.com\x1b\\Text\x1b]8;;\x1b\\';
    expect(visLen(link)).toBe(4);
  });
});

// ── padRight ──────────────────────────────────────────────────────────────────

describe('padRight', () => {
  it('pads plain text with spaces on the right', () => {
    expect(padRight('hi', 6)).toBe('hi    ');
  });

  it('returns string as-is when already at width', () => {
    expect(padRight('hello', 5)).toBe('hello');
  });

  it('truncates when longer than width', () => {
    expect(strip(padRight('hello world', 5))).toBe('hello');
  });

  it('pads ANSI-colored text based on visible length', () => {
    const colored = pc('positive', 'BUY'); // visLen = 3
    const padded = padRight(colored, 6);
    expect(visLen(padded)).toBe(6);
    expect(strip(padded)).toBe('BUY   ');
  });
});

// ── padLeft ───────────────────────────────────────────────────────────────────

describe('padLeft', () => {
  it('pads plain text with spaces on the left', () => {
    expect(padLeft('hi', 6)).toBe('    hi');
  });

  it('returns string as-is when already at width', () => {
    expect(padLeft('hello', 5)).toBe('hello');
  });

  it('truncates when longer than width', () => {
    const result = padLeft('hello world', 5);
    expect(strip(result).length).toBeLessThanOrEqual(5);
  });

  it('pads ANSI-colored text based on visible length', () => {
    const colored = pc('positive', 'BUY'); // visLen = 3
    const padded = padLeft(colored, 6);
    expect(visLen(padded)).toBe(6);
    expect(strip(padded)).toBe('   BUY');
  });
});

// ── padCenter ─────────────────────────────────────────────────────────────────

describe('padCenter', () => {
  it('centers text evenly', () => {
    expect(padCenter('hi', 6)).toBe('  hi  ');
  });

  it('left-biases odd padding', () => {
    // width 7, text 2 → 5 spaces, floor(5/2)=2 left, 3 right
    expect(padCenter('hi', 7)).toBe('  hi   ');
  });

  it('returns string as-is when at width', () => {
    expect(padCenter('hello', 5)).toBe('hello');
  });

  it('truncates when longer than width', () => {
    const result = padCenter('hello world', 5);
    expect(strip(result).length).toBeLessThanOrEqual(5);
  });

  it('works with ANSI-colored text', () => {
    const colored = pc('data', 'AB'); // visLen = 2
    const padded = padCenter(colored, 6);
    expect(visLen(padded)).toBe(6);
    expect(strip(padded)).toBe('  AB  ');
  });
});

// ── boxTop ────────────────────────────────────────────────────────────────────

describe('boxTop', () => {
  it('renders rounded top border (tier 2)', () => {
    const result = strip(boxTop(20));
    expect(result.startsWith('╭')).toBe(true);
    expect(result.endsWith('╮')).toBe(true);
    expect(result).toContain('─');
  });

  it('renders double top border (tier 1)', () => {
    const result = strip(boxTop(20, '', 1));
    expect(result.startsWith('╔')).toBe(true);
    expect(result.endsWith('╗')).toBe(true);
    expect(result).toContain('═');
  });

  it('embeds title in top border', () => {
    const result = strip(boxTop(30, 'VERDICT'));
    expect(result).toContain('VERDICT');
    expect(result.startsWith('╭')).toBe(true);
    expect(result.endsWith('╮')).toBe(true);
  });

  it('total visible width matches requested width', () => {
    expect(visLen(boxTop(40))).toBe(40);
    expect(visLen(boxTop(40, 'TITLE'))).toBe(40);
  });
});

// ── boxBot ────────────────────────────────────────────────────────────────────

describe('boxBot', () => {
  it('renders rounded bottom border (tier 2)', () => {
    const result = strip(boxBot(20));
    expect(result.startsWith('╰')).toBe(true);
    expect(result.endsWith('╯')).toBe(true);
  });

  it('renders double bottom border (tier 1)', () => {
    const result = strip(boxBot(20, '', 1));
    expect(result.startsWith('╚')).toBe(true);
    expect(result.endsWith('╝')).toBe(true);
  });

  it('embeds footer in bottom border', () => {
    const result = strip(boxBot(30, 'footer'));
    expect(result).toContain('footer');
  });

  it('total visible width matches requested width', () => {
    expect(visLen(boxBot(40))).toBe(40);
    expect(visLen(boxBot(40, 'FOOTER'))).toBe(40);
  });
});

// ── boxRow ────────────────────────────────────────────────────────────────────

describe('boxRow', () => {
  it('wraps content with vertical borders', () => {
    const result = strip(boxRow('hello', 20));
    expect(result.startsWith('│')).toBe(true);
    expect(result.endsWith('│')).toBe(true);
    expect(result).toContain('hello');
  });

  it('total visible width matches requested width', () => {
    expect(visLen(boxRow('hello', 20))).toBe(20);
    expect(visLen(boxRow('hi', 40))).toBe(40);
  });

  it('pads short content with spaces', () => {
    const result = strip(boxRow('hi', 10));
    // border + space + content + padding + space + border = 10
    expect(result.length).toBe(10);
  });

  it('truncates content exceeding inner width', () => {
    const result = strip(boxRow('abcdefghijklmnopqrstuvwxyz', 10));
    expect(result.length).toBe(10);
  });

  it('works with ANSI-colored content', () => {
    const colored = pc('positive', 'BUY');
    const result = boxRow(colored, 20);
    expect(strip(result)).toContain('BUY');
    expect(visLen(result)).toBe(20);
  });
});

// ── boxDivider ────────────────────────────────────────────────────────────────

describe('boxDivider', () => {
  it('renders a horizontal divider line', () => {
    const result = strip(boxDivider(20));
    expect(result.startsWith('├')).toBe(true);
    expect(result.endsWith('┤')).toBe(true);
    expect(result).toContain('─');
  });

  it('embeds title in divider', () => {
    const result = strip(boxDivider(30, 'SECTION'));
    expect(result).toContain('SECTION');
    expect(result.startsWith('├')).toBe(true);
    expect(result.endsWith('┤')).toBe(true);
  });

  it('total visible width matches requested width', () => {
    expect(visLen(boxDivider(30))).toBe(30);
    expect(visLen(boxDivider(30, 'SEC'))).toBe(30);
  });
});

// ── boxEmpty ──────────────────────────────────────────────────────────────────

describe('boxEmpty', () => {
  it('renders an empty row with borders', () => {
    const result = strip(boxEmpty(20));
    expect(result.startsWith('│')).toBe(true);
    expect(result.endsWith('│')).toBe(true);
  });

  it('total visible width matches requested width', () => {
    expect(visLen(boxEmpty(20))).toBe(20);
    expect(visLen(boxEmpty(40))).toBe(40);
  });

  it('inner content is all spaces', () => {
    const result = strip(boxEmpty(10));
    // border + 8 spaces + border = 10
    expect(result).toBe('│        │');
  });
});
