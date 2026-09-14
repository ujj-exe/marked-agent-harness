/**
 * panels.js — maps panel names to component render calls.
 *
 * renderPanel(name, data, width) → ANSI string
 * If data is null/undefined, returns a skeleton/loading state.
 * If data has _error, returns an error indicator.
 * Schema validation runs between error check and handler dispatch.
 * Staleness tag is appended centrally after the handler.
 *
 * Architecture: each panel type has a dedicated handler function registered
 * in the `handlers` map. The main renderPanel() does validation/annotation
 * and delegates to the handler. Handlers return a string (normal flow, goes
 * through annotation + staleness) or EARLY(str) to bypass that layer.
 */
import {
  quoteHeader,
  brailleChart,
  candlestickChart,
  gaugeBar,
  gaugeStack,
  analystBar,
  macroDashboard,
  newsStream,
  verdict,
  insiderTimeline,
  earningsSurprise,
  holderBar,
  filingTimeline,
  heatMap,
  waterfallChart,
  correlationMatrix,
  treeMap,
  flowSankey,
  coloredSignal,
  convictionBadge,
  renderMarkdownInline,
  pc,
  DIM,
  RESET,
  BOLD,
  visLen,
  padRight,
  wordWrap,
} from '../src/index.js';

// ── Schema validation (defensive import) ────────────────────────────────────

let validate;
try {
  ({ validate } = await import('./schemas/index.js'));
} catch {
  validate = (_name, data) => data; // passthrough if schemas fail to load
}

// ── Markdown helper (delegates to src/markdown.js) ──────────────────────────
// renderMarkdownInline handles **bold**, *italic*, `code` → ANSI

// ── Annotation helpers ───────────────────────────────────────────────────────

/**
 * Render annotation summary line (above panel content).
 * @param {string|undefined} summary
 * @returns {string}
 */
function renderSummary(summary) {
  if (!summary) return '';
  return pc('muted', `┄ ${summary}`);
}

/**
 * Render annotation footnote line (below panel content).
 * @param {string|undefined} footnote
 * @returns {string}
 */
function renderFootnote(footnote) {
  if (!footnote) return '';
  return pc('muted', `  ${footnote}`);
}

// ── Staleness helper ─────────────────────────────────────────────────────────

const STALE_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes

function stalenessTag(data) {
  if (!data?._timestamp) return '';
  const age = Date.now() - Number(data._timestamp);
  if (age < STALE_THRESHOLD_MS) return '';
  const minutes = Math.round(age / 60000);
  return pc('muted', ` (${minutes}m ago)`);
}

// ── Skeleton / loading state ─────────────────────────────────────────────────

const SKEL_CHARS = '░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░';

export function skeleton(name, width) {
  const label = name ? name.toUpperCase() : '…';
  const inner = Math.max(8, width - 2);
  // Single row of dim blocks with the panel label
  const skelLine = `${DIM}${SKEL_CHARS.slice(0, inner)}${RESET}`;
  const labelStr = pc('muted', `  ${label}`);
  return labelStr + '\n' + skelLine;
}

// ── Error state ──────────────────────────────────────────────────────────────

function errorPanel(message) {
  return pc('warning', `⚠ `) + pc('muted', String(message || 'Error'));
}

// ── Descriptive fallback ────────────────────────────────────────────────────

/**
 * Return a styled descriptive message when data shape is completely wrong.
 *
 * @param {string} name - Panel name
 * @param {*} data - The invalid data
 * @param {string} [reason] - Optional reason override
 * @returns {string}
 */
function descriptiveFallback(name, data, reason) {
  const panelLabel = (name || 'UNKNOWN').toUpperCase();
  if (reason) {
    return pc('muted', `[${panelLabel}] — ${reason}`);
  }
  // Look up the schema shape description
  const schemas = {
    quote: 'object with { ticker }',
    chart: 'object with { values: number[] }',
    technical: 'object with optional { rsi, macd, trend, signals, gauges }',
    rsi: 'object with { value: number }',
    analyst: 'object with { ratings: {buy, hold, sell}, priceTarget }',
    macro: 'object with { pillars: [{label, value, direction}] }',
    news: 'object with { items: [{title, source, time, url}] }',
    verdict: 'object with { thesis, signal, levels, risks }',
    gauge: 'object with { value: number }',
    gauges: 'object with { items: [{value, label, preset}] }',
    correlationMatrix: 'object with { tickers: string[], matrix: number[][] }',
    treeMap: 'object with { items: [{label, weight, value?}] }',
    flowSankey: 'object with { nodes: [{label, value}] }',
  };
  const expected = schemas[name] || 'object';
  const got = data === null ? 'null' : Array.isArray(data) ? 'array' : typeof data;
  return pc('muted', `[${panelLabel}] — data shape error (expected ${expected}, got ${got})`);
}

// ── Early-return sentinel ───────────────────────────────────────────────────
// Handlers return EARLY(str) to bypass the annotation/staleness layer.
// This preserves the original behavior where "no data" messages skip annotations.

const EARLY = (str) => ({ earlyReturn: str });

// ── Panel handler functions ─────────────────────────────────────────────────

/** Quote header */
function renderQuotePanel(data, width) {
  const quoteData = { ...data, width };
  return quoteHeader(quoteData);
}

/** Braille price chart */
function renderChartPanel(data, width) {
  const { values, volume, label, height, showAxis, fill } = data;
  if (!values?.length) return EARLY(pc('muted', '— No chart data'));
  return brailleChart({ values, width, height, showAxis, volume, label, fill });
}

/** RSI gauge */
function renderRsiPanel(data, width) {
  const { value, signals } = data;
  const barWidth = Math.max(10, Math.floor(width * 0.5));
  let out = gaugeBar({ value, label: 'RSI(14)', preset: 'rsi', width: barWidth });
  if (signals.length > 0) {
    out += '\n' + signals.map(s => pc('label', `  · `) + pc('data', s)).join('\n');
  }
  return out;
}

/** Technical panel (RSI + multiple signals) */
function renderTechnicalPanel(data, width) {
  const { rsi, macd, macdSignal, trend, signals, gauges: techGauges, support, resistance, signal, confidence } = data;
  const lines = [];
  const barWidth = Math.max(10, Math.floor(width * 0.5));

  if (techGauges.length > 0) {
    // Gauges-first mode: render gauge stack then text signals
    // Skips hardcoded RSI/MACD/trend/signal lines to avoid double-render
    lines.push(gaugeStack(techGauges.map(g => ({ ...g, width: barWidth }))));
    if (signals.length > 0) {
      lines.push(signals.map(s => pc('label', '· ') + pc('data', s)).join('\n'));
    }
  } else {
    // Field-based mode: build from individual fields (no gauges array provided)
    if (rsi != null) {
      lines.push(gaugeBar({ value: Number(rsi), label: 'RSI(14)', preset: 'rsi', width: barWidth }));
    }
    if (macd != null) {
      const sigStr = macdSignal != null ? ` (sig ${Number(macdSignal).toFixed(2)})` : '';
      lines.push(pc('label', 'MACD ') + pc('data', `${Number(macd).toFixed(2)}${sigStr}`));
    }
    if (trend) {
      const d = String(trend).toLowerCase();
      const role = d.includes('bear') ? 'negative' : d.includes('bull') ? 'positive' : 'muted';
      lines.push(pc('label', 'Trend: ') + pc(role, d));
    }
    if (support != null || resistance != null) {
      const parts = [];
      if (support != null) parts.push(`Support $${Number(support).toFixed(2)}`);
      if (resistance != null) parts.push(`Res $${Number(resistance).toFixed(2)}`);
      lines.push(pc('label', parts.join(' | ')));
    }
    if (signal) {
      lines.push(pc('label', 'Signal: ') + coloredSignal(signal, confidence));
    }
    if (signals.length > 0 && lines.length < 2) {
      lines.push(signals.map(s => pc('label', '· ') + pc('data', s)).join('\n'));
    }
  }

  return lines.length > 0 ? lines.join('\n') : pc('muted', '— No technical data');
}

/** Analyst ratings + price target */
function renderAnalystPanel(data, width) {
  const analystData = { ...data, width };
  return analystBar(analystData);
}

/** Macro dashboard */
function renderMacroPanel(data, width) {
  const { pillars, title } = data;
  const variant = data.variant ?? 'plain'; // default plain — divider already provides section title
  if (!pillars.length) return EARLY(pc('muted', '— No macro data'));
  return macroDashboard({ pillars, width, title, variant });
}

/** News stream */
function renderNewsPanel(data, width) {
  const { items, limit } = data;
  return newsStream({ items, width, limit });
}

/** Verdict / AI analysis */
function renderVerdictPanel(data, width, _panelWarnings) {
  // body->thesis migration, signal->conviction migration, flat->sections migration
  // all handled by schema coercion. After coercion, data.sections[] always exists.
  // Default to plain in blocks mode (divider handles section title)
  const useBoxed = data.variant === 'boxed';
  if (!useBoxed) {
    const vLines = [];
    if (data.title) vLines.push(pc('accent', data.title));

    // Sections-based plain rendering (v1.1)
    if (Array.isArray(data.sections)) {
      for (const section of data.sections) {
        switch (section.type) {
          case 'conviction':
            vLines.push(convictionBadge(section.conviction || section.value));
            // Render timeframe here only if there's no dedicated levels section
            // (levels section handles timeframe when present)
            if (section.timeframe) {
              const hasLevelsSection = data.sections.some(s => s.type === 'levels');
              if (!hasLevelsSection) {
                vLines.push(pc('label', 'Timeframe: ') + pc('data', String(section.timeframe)));
              }
            }
            break;

          case 'memory': {
            const { prior, changed } = section;
            const note = changed ? ' · conviction changed' : ' — conviction held';
            vLines.push(`${DIM}┄ ${prior || ''}${note}${RESET}`);
            break;
          }

          case 'thesis': {
            const { text } = section;
            if (!text) break;
            for (const line of wordWrap(text, width)) {
              vLines.push(pc('data', renderMarkdownInline(line)));
            }
            break;
          }

          case 'catalysts': {
            const { items } = section;
            if (!Array.isArray(items)) break;
            for (const catalyst of items) {
              vLines.push(pc('positive', '✦ ') + pc('data', String(catalyst)));
            }
            break;
          }

          case 'risks': {
            const { items } = section;
            if (!Array.isArray(items)) break;
            for (const risk of items) {
              vLines.push(pc('warning', '⚠ ') + pc('data', String(risk)));
            }
            break;
          }

          case 'levels': {
            const { support, resistance, timeframe: tf } = section;
            if (tf) {
              vLines.push(pc('label', 'Timeframe: ') + pc('data', String(tf)));
            }
            const parts = [];
            if (support != null) parts.push(`Support $${support}`);
            if (resistance != null) parts.push(`Resistance $${resistance}`);
            if (parts.length) vLines.push(pc('label', parts.join('  ·  ')));
            break;
          }

          case 'context': {
            const { text } = section;
            if (!text) break;
            for (const line of wordWrap(text, width)) {
              vLines.push(pc('muted', line));
            }
            break;
          }

          case 'comparison': {
            const { text } = section;
            if (!text) break;
            for (const line of wordWrap(text, width)) {
              vLines.push(pc('data', line));
            }
            break;
          }

          case 'invalidation': {
            const { text } = section;
            if (!text) break;
            for (const line of wordWrap(text, width)) {
              vLines.push(`${DIM}${pc('data', line)}${RESET}`);
            }
            break;
          }

          default:
            break;
        }
      }

      // Warn lines after sections
      for (const warnMsg of _panelWarnings) {
        vLines.push(pc('warning', warnMsg));
      }

      return vLines.join('\n');
    }

    // Flat field rendering (backwards compat / schema-bypass path)
    if (data.conviction) {
      vLines.push(convictionBadge(data.conviction));
    } else if (data.signal) {
      vLines.push(coloredSignal(data.signal, data.confidence));
    }

    // Thesis (word-wrapped)
    const thesis = data.thesis || '';
    if (thesis) {
      for (const line of wordWrap(thesis, width)) {
        vLines.push(pc('data', renderMarkdownInline(line)));
      }
    }

    // Timeframe
    if (data.timeframe) {
      vLines.push(pc('label', 'Timeframe: ') + pc('data', String(data.timeframe)));
    }

    // Catalysts
    if (Array.isArray(data.catalysts) && data.catalysts.length > 0) {
      for (const catalyst of data.catalysts) {
        vLines.push(pc('positive', '✦ ') + pc('data', String(catalyst)));
      }
    }

    // Risks
    if (Array.isArray(data.risks) && data.risks.length > 0) {
      for (const risk of data.risks) {
        vLines.push(pc('warning', '⚠ ') + pc('data', String(risk)));
      }
    }

    // Key levels
    if (data.levels) {
      const parts = [];
      if (data.levels.support != null) parts.push(`Support $${data.levels.support}`);
      if (data.levels.resistance != null) parts.push(`Resistance $${data.levels.resistance}`);
      if (parts.length) vLines.push(pc('label', parts.join('  ·  ')));
    }

    // Warn lines
    for (const warnMsg of _panelWarnings) {
      vLines.push(pc('warning', warnMsg));
    }

    return vLines.join('\n');
  }
  // Full boxed variant (only when explicitly requested)
  const verdictData = { ...data, width, warnings: _panelWarnings };
  return verdict(verdictData);
}

/** Gauge (generic single value) */
function renderGaugePanel(data, width) {
  const barWidth = Math.max(10, Math.floor(width * 0.5));
  return gaugeBar({ ...data, width: barWidth });
}

/** Gauge stack (multiple gauges) */
function renderGaugesPanel(data, width) {
  const { items: gaugeItems } = data;
  if (!gaugeItems.length) return EARLY(pc('muted', '— No gauge data'));
  const barWidth = Math.max(10, Math.floor(width * 0.45));
  return gaugeStack(gaugeItems.map(g => ({ ...g, width: barWidth })));
}

/** Insider activity timeline */
function renderInsidersPanel(data, width) {
  const { transactions = [] } = data;
  if (!transactions.length) return EARLY(pc('muted', '— No insider data'));
  return insiderTimeline({ transactions, width });
}

/** Earnings surprise */
function renderEarningsPanel(data, width) {
  const { quarters = [] } = data;
  if (!quarters.length) return EARLY(pc('muted', '— No earnings data'));
  return earningsSurprise({ quarters, width });
}

/** Institutional holders */
function renderHoldersPanel(data, width) {
  const { holders = [] } = data;
  if (!holders.length) return EARLY(pc('muted', '— No holder data'));
  const limit = data.limit != null ? Math.min(Number(data.limit) || 5, 20) : undefined;
  return holderBar({ holders, width, limit });
}

/** Indian filing and disclosure timeline */
function renderFilingsPanel(data, width) {
  const { filings = [] } = data;
  if (!filings.length) return EARLY(pc('muted', '— No filing data'));
  return filingTimeline({ filings, width });
}

/** Heatmap */
function renderHeatmapPanel(data, width) {
  const { rows: heatRows = [], columns = [] } = data;
  if (!heatRows.length) return EARLY(pc('muted', '— No heatmap data'));
  return heatMap({ rows: heatRows, columns, width, colorScale: data.colorScale });
}

/** Candlestick chart */
function renderCandlestickPanel(data, width) {
  const { bars = [] } = data;
  if (!bars.length) return EARLY(pc('muted', '— No candlestick data'));
  return candlestickChart({ bars, width, height: data.height, label: data.label });
}

/** Waterfall chart */
function renderWaterfallPanel(data, width) {
  const { items: wfItems = [] } = data;
  if (!wfItems.length) return EARLY(pc('muted', '— No waterfall data'));
  return waterfallChart({ items: wfItems, width, showDelta: data.showDelta });
}

/** Correlation matrix */
function renderCorrelationMatrixPanel(data, width) {
  const { tickers = [], matrix: corrMatrix = [] } = data;
  if (!tickers.length) return EARLY(pc('muted', '— No correlation data'));
  return correlationMatrix({ tickers, matrix: corrMatrix, width, title: data.title });
}

/** Tree map */
function renderTreeMapPanel(data, width) {
  const { items: tmItems = [] } = data;
  if (!tmItems.length) return EARLY(pc('muted', '— No treemap data'));
  return treeMap({ items: tmItems, width, height: data.height || 10 });
}

/** Flow Sankey */
function renderFlowSankeyPanel(data, width) {
  const { nodes = [], flows: flowEdges = [] } = data;
  if (!nodes.length) return EARLY(pc('muted', '— No flow data'));
  return flowSankey({ nodes, flows: flowEdges, width });
}

// ── Unknown panel fallback ───────────────────────────────────────────────────

/**
 * Render unknown panel types as a key-value table.
 * Ensures any agent-sent data always produces SOMETHING visible.
 *
 * @param {string} name - Panel name (unknown)
 * @param {Object} data - Panel data object
 * @param {number} width - Available width
 * @returns {string} ANSI-formatted key-value dump
 */
function unknownPanelFallback(name, data, width) {
  const panelLabel = (name || 'UNKNOWN').toUpperCase();
  const lines = [pc('muted', `[${panelLabel}]`)];

  const PRIVATE_KEYS = new Set(['_error', '_timestamp', '_annotations', 'summary', 'footnote', 'highlights', 'annotations', 'groups']);
  const keyWidth = 14;

  for (const [key, val] of Object.entries(data)) {
    if (PRIVATE_KEYS.has(key)) continue;
    const keyStr = padRight(String(key), keyWidth);
    let valStr;
    if (val === null || val === undefined) {
      valStr = pc('muted', '—');
    } else if (Array.isArray(val)) {
      valStr = pc('data', `[${val.length} items]`);
    } else if (typeof val === 'object') {
      valStr = pc('data', JSON.stringify(val).slice(0, Math.max(10, width - keyWidth - 4)));
    } else {
      valStr = pc('data', String(val).slice(0, Math.max(10, width - keyWidth - 4)));
    }
    lines.push(pc('label', keyStr) + ' ' + valStr);
  }

  if (lines.length === 1) {
    lines.push(pc('muted', '(no data)'));
  }

  return lines.join('\n');
}

// ── Handler registry ────────────────────────────────────────────────────────

const handlers = {
  quote:             renderQuotePanel,
  chart:             renderChartPanel,
  rsi:               renderRsiPanel,
  technical:         renderTechnicalPanel,
  analyst:           renderAnalystPanel,
  macro:             renderMacroPanel,
  news:              renderNewsPanel,
  verdict:           renderVerdictPanel,
  gauge:             renderGaugePanel,
  gauges:            renderGaugesPanel,
  insiders:          renderInsidersPanel,
  earnings:          renderEarningsPanel,
  holders:           renderHoldersPanel,
  filings:           renderFilingsPanel,
  heatmap:           renderHeatmapPanel,
  candlestick:       renderCandlestickPanel,
  waterfall:         renderWaterfallPanel,
  correlationMatrix: renderCorrelationMatrixPanel,
  treeMap:           renderTreeMapPanel,
  flowSankey:        renderFlowSankeyPanel,
};

// ── Panel renderer ───────────────────────────────────────────────────────────

/**
 * Render a named panel.
 *
 * @param {string} name - Panel name (e.g. 'quote', 'chart', 'news')
 * @param {Object|null} data - Panel data. null → skeleton loading state.
 * @param {number} [width=80] - Available width
 * @returns {string} Multi-line ANSI string
 */
export function renderPanel(name, data, width = 80) {
  // Loading skeleton
  if (data == null) {
    return skeleton(name, width);
  }

  // Error state — other panels still render
  if (data._error) {
    return errorPanel(data._error);
  }

  // Schema validation
  const validated = validate(name, data);
  if (validated === null) {
    return descriptiveFallback(name, data);
  }
  // Warn path: { data, warnings } — unwrap but keep warnings for downstream panels
  let _panelWarnings = [];
  if (validated !== null && typeof validated === 'object' && Array.isArray(validated.warnings) && 'data' in validated) {
    _panelWarnings = validated.warnings;
    data = validated.data;
  } else {
    data = validated;
  }

  // Pass annotation context to components (for future per-item highlights support)
  if (data.highlights || data.annotations || data.groups) {
    data._annotations = {
      highlights: data.highlights || [],
      annotations: data.annotations || {},
      groups: data.groups || [],
    };
  }

  // Dispatch to handler
  const handler = handlers[name];
  if (!handler) {
    return unknownPanelFallback(name, data, width);
  }

  // Verdict handler needs _panelWarnings; all others ignore the third arg
  const handlerResult = handler(data, width, _panelWarnings);

  // Early return sentinel — bypasses annotation/staleness layer
  if (handlerResult && typeof handlerResult === 'object' && 'earlyReturn' in handlerResult) {
    return handlerResult.earlyReturn;
  }

  let result = handlerResult;

  // ── Universal annotation layer: summary (above) and footnote (below) ────────
  const summaryLine = renderSummary(data.summary);
  const footnoteLine = renderFootnote(data.footnote);
  if (summaryLine) result = summaryLine + '\n' + result;
  if (footnoteLine) result = result + '\n' + footnoteLine;

  // ── Centralized staleness tag (DRY) ─────────────────────────────────
  const stale = stalenessTag(data);
  return stale ? result + '\n' + stale : result;
}
