/**
 * FilingTimeline — vertical chronological timeline for Indian disclosures.
 *
 * Renders each disclosure with date, type badge, and description.
 *
 * Pure function: (opts) → string (ANSI-colored, multi-line)
 */
import { c, pc, BOLD, RESET, padRight, padLeft, visLen, ansiTrunc } from '../ansi.js';
import { palette } from '../themes.js';
import { fmtDate } from '../formatters.js';

// Timeline drawing characters
const TL_TOP    = '┬';
const TL_MID    = '│';
const TL_LAST   = '└';
const TL_DOT    = '●';
const TL_LINE   = '─';

// Color roles by Indian disclosure type
const FORM_ROLES = {
  annual_report: 'positive',
  financial_results: 'accent',
  investor_presentation: 'highlight',
  exchange_announcement: 'warning',
  corporate_action: 'warning',
  shareholding_pattern: 'accent',
  insider_disclosure: 'negative',
  board_meeting: 'highlight',
  material_event: 'warning',
};

function formRole(form) {
  return FORM_ROLES[String(form).toUpperCase()] || FORM_ROLES[String(form)] || 'data';
}

/**
 * Render an Indian filing/disclosure timeline.
 *
 * @param {Object} opts
 * @param {Array<{date, form, document_type, description}>} opts.filings - Records (newest first or oldest first)
 * @param {number} [opts.width=80] - Total output width
 * @returns {string} Multi-line ANSI string
 */
export function filingTimeline(opts = {}) {
  const {
    filings = [],
    width = 80,
  } = opts;

  if (!filings.length) {
    return pc('muted', 'No filings');
  }

  const lines = [];

  // Column layout:
  // [connector] [date] [form badge] [description]
  const connW = 2;  // "│ " or "└─"
  const dateW = 8;
  const formW = 24; // badge like "[exchange_announcement]"
  const descW = Math.max(10, width - connW - dateW - formW - 4);

  // Header
  lines.push(
    ' '.repeat(connW) +
    padRight(pc('label', 'DATE'), dateW) + ' ' +
    padRight(pc('label', 'TYPE'), formW) + ' ' +
    pc('label', 'DESCRIPTION')
  );
  lines.push(pc('muted', '─'.repeat(Math.min(width, connW + dateW + formW + descW + 3))));

  for (let i = 0; i < filings.length; i++) {
    const filing = filings[i];
    const isLast = i === filings.length - 1;
    const form = filing.form || filing.document_type || filing.type;
    const role   = formRole(form);
    const color  = palette(role);

    // Connector column
    const connector = isLast
      ? c(palette('muted'), `${TL_LAST}${TL_LINE}`)
      : c(palette('muted'), `${TL_MID} `);

    // Date
    const date = padRight(pc('muted', fmtDate(filing.date)), dateW);

    // Form badge — fixed width, colored
    const formStr  = String(form || '?');
    const badge    = padRight(c(color, `[${formStr}]`), formW);

    // Description — truncate to available width
    const descRaw  = String(filing.description || '');
    const descFull = pc('data', descRaw);
    const desc     = ansiTrunc(descFull, descW);

    lines.push(`${connector} ${date} ${badge} ${desc}`);
  }

  return lines.join('\n');
}
