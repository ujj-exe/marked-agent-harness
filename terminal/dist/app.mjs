var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __esm = (fn, res, err) => function __init() {
  if (err) throw err[0];
  try {
    return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
  } catch (e) {
    throw err = [e], e;
  }
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// config/paths.js
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
function configPath(cwd = process.cwd()) {
  let dir = path.resolve(cwd);
  while (true) {
    const candidate = path.join(dir, ".marked", "config.json");
    if (fs.existsSync(candidate)) return candidate;
    const parent = path.dirname(dir);
    if (parent === dir) return CONFIG_PATH;
    dir = parent;
  }
}
var MARKED_HOME, CONFIG_PATH, STATE_DIR, SESSIONS_DIR, CONVERSATION_PATH, CAPABILITIES_PATH, ANALYTICS_DIR, TUI_STATE_PATH, REPORTS_DIR, WORLDS_PATH;
var init_paths = __esm({
  "config/paths.js"() {
    MARKED_HOME = process.env.MARKED_HOME || path.join(os.homedir(), ".marked");
    CONFIG_PATH = path.join(MARKED_HOME, "config.json");
    STATE_DIR = path.join(MARKED_HOME, "state");
    SESSIONS_DIR = path.join(MARKED_HOME, "sessions");
    CONVERSATION_PATH = path.join(MARKED_HOME, "conversation.json");
    CAPABILITIES_PATH = path.join(MARKED_HOME, "capabilities.json");
    ANALYTICS_DIR = path.join(MARKED_HOME, "analytics");
    TUI_STATE_PATH = path.join(MARKED_HOME, "tui.json");
    REPORTS_DIR = path.join(MARKED_HOME, "reports");
    WORLDS_PATH = path.join(MARKED_HOME, "worlds.json");
  }
});

// terminal/debugLog.js
import fs2 from "fs";
import path2 from "path";
function isDebugEnabled() {
  if (_enabled !== null) return _enabled;
  try {
    const text = fs2.readFileSync(CONFIG_FILE, "utf8");
    const config = JSON.parse(text);
    _enabled = config.debug_log === true || config.debugLog === true;
  } catch {
    _enabled = false;
  }
  return _enabled;
}
function writeLog(message) {
  try {
    fs2.mkdirSync(CONFIG_DIR, { recursive: true });
    try {
      const stat = fs2.statSync(LOG_FILE);
      if (stat.size > MAX_LOG_BYTES) {
        fs2.writeFileSync(LOG_FILE, "", { flag: "w" });
      }
    } catch {
    }
    const ts = (/* @__PURE__ */ new Date()).toISOString();
    fs2.appendFileSync(LOG_FILE, `[${ts}] ${message}
`);
  } catch {
  }
}
function logSchemaCoercion(panel, field, from, to) {
  if (!isDebugEnabled()) return;
  writeLog(`[schema:coerce] ${panel}.${field}: ${from} \u2192 ${to}`);
}
function logSchemaMissing(panel, field) {
  if (!isDebugEnabled()) return;
  writeLog(`[schema:missing] ${panel}.${field}: required field absent \u2014 rejected`);
}
function logSchemaWarnings(panel, warnings) {
  if (!isDebugEnabled()) return;
  for (const w of warnings) {
    writeLog(`[schema:warn] ${panel}: ${w}`);
  }
}
function logConnection(agent, model) {
  if (!isDebugEnabled()) return;
  writeLog(`[session:connect] agent=${agent} model=${model}`);
}
function logDisconnect(agent) {
  if (!isDebugEnabled()) return;
  writeLog(`[session:disconnect] agent=${agent}`);
}
function logRender(skill, blocksCount, patch, stage) {
  if (!isDebugEnabled()) return;
  writeLog(`[render] skill=${skill} blocks=${blocksCount} patch=${patch} stage=${stage}`);
}
function logRenderError(status, message) {
  if (!isDebugEnabled()) return;
  writeLog(`[render:error] status=${status} ${message}`);
}
function logStateTransition(from, to, skill) {
  if (!isDebugEnabled()) return;
  writeLog(`[state] ${from} \u2192 ${to} (${skill})`);
}
var CONFIG_DIR, CONFIG_FILE, LOG_FILE, MAX_LOG_BYTES, _enabled;
var init_debugLog = __esm({
  "terminal/debugLog.js"() {
    init_paths();
    CONFIG_DIR = MARKED_HOME;
    CONFIG_FILE = CONFIG_PATH;
    LOG_FILE = path2.join(CONFIG_DIR, "debug.log");
    MAX_LOG_BYTES = 1048576;
    _enabled = null;
  }
});

// terminal/schemas/quote.js
var schema;
var init_quote = __esm({
  "terminal/schemas/quote.js"() {
    schema = {
      type: "object",
      required: ["ticker"],
      defaults: {
        variant: "full",
        changePct: 0,
        volume: 0,
        marketCap: 0
      },
      coerce: {
        // symbol → ticker migration
        symbol: (val, data) => {
          if (!data.ticker) data.ticker = val;
        }
      },
      shape: "object with { ticker }",
      dataSources: ["marked.prices"]
    };
  }
});

// terminal/schemas/chart.js
var schema2;
var init_chart = __esm({
  "terminal/schemas/chart.js"() {
    schema2 = {
      type: "object",
      required: ["values"],
      defaults: {
        height: 6,
        showAxis: true
      },
      coerce: {
        // Ensure values is an array of numbers
        values: (val, data) => {
          if (typeof val === "string") {
            try {
              data.values = JSON.parse(val);
            } catch {
            }
          }
        }
      },
      validate: (data) => {
        if (!Array.isArray(data.values) || data.values.length === 0) return null;
        return data;
      },
      shape: "object with { values: number[] }",
      dataSources: ["marked.prices", "marked.financials", "marked.metrics"]
    };
  }
});

// terminal/schemas/technical.js
var schema3;
var init_technical = __esm({
  "terminal/schemas/technical.js"() {
    schema3 = {
      type: "object",
      required: [],
      defaults: {
        signals: [],
        gauges: []
      },
      coerce: {
        // Ensure signals is always an array
        signals: (val, data) => {
          if (typeof val === "string") data.signals = [val];
          else if (!Array.isArray(val)) data.signals = [];
        },
        // Ensure gauges is always an array
        gauges: (val, data) => {
          if (!Array.isArray(val)) data.gauges = [];
        },
        // Coerce numeric fields
        rsi: (val, data) => {
          if (typeof val === "string") {
            const n = Number(val);
            if (!isNaN(n)) data.rsi = n;
          }
        },
        macd: (val, data) => {
          if (typeof val === "string") {
            const n = Number(val);
            if (!isNaN(n)) data.macd = n;
          }
        },
        // Normalize confidence to 0-1 scale. Some sources provide 0-100.
        confidence: (val, data) => {
          if (val != null) {
            const n = Number(val);
            if (!isNaN(n) && n > 1) data.confidence = n / 100;
          }
        }
      },
      shape: "object with optional { rsi, macd, trend, signals, gauges }",
      dataSources: ["marked.prices"]
    };
  }
});

// terminal/schemas/rsi.js
var schema4;
var init_rsi = __esm({
  "terminal/schemas/rsi.js"() {
    schema4 = {
      type: "object",
      required: ["value"],
      defaults: {
        signals: []
      },
      coerce: {
        // Coerce value from string to number
        value: (val, data) => {
          if (typeof val === "string") {
            const n = Number(val);
            if (!isNaN(n)) data.value = n;
          }
        },
        // Ensure signals is an array
        signals: (val, data) => {
          if (typeof val === "string") data.signals = [val];
          else if (!Array.isArray(val)) data.signals = [];
        }
      },
      shape: "object with { value: number }",
      dataSources: ["marked.prices"]
    };
  }
});

// terminal/schemas/analyst.js
var schema5;
var init_analyst = __esm({
  "terminal/schemas/analyst.js"() {
    schema5 = {
      type: "object",
      required: [],
      defaults: {},
      coerce: {},
      validate(data) {
        if (!data.ratings && (data.buy != null || data.hold != null || data.sell != null)) {
          data.ratings = {
            buy: Number(data.buy) || 0,
            hold: Number(data.hold) || 0,
            sell: Number(data.sell) || 0
          };
        }
        if (!data.priceTarget && data.target != null) {
          const t = Number(data.target);
          data.priceTarget = {
            current: data.current != null ? Number(data.current) : 0,
            low: data.low != null ? Number(data.low) : t * 0.7,
            median: t,
            high: data.high != null ? Number(data.high) : t * 1.3
          };
        }
        return data;
      },
      shape: "object with { ratings: {buy, hold, sell}, priceTarget: {current, low, median, high} }",
      dataSources: ["marked.metrics", "marked.filings"]
    };
  }
});

// terminal/schemas/macro.js
function stateToValue(state) {
  if (state == null) return null;
  const raw = String(state).toLowerCase().trim();
  const firstWord = raw.split(/[\s(]/)[0];
  return STATE_MAP[firstWord] ?? STATE_MAP[raw] ?? 50;
}
var STATE_MAP, schema6;
var init_macro = __esm({
  "terminal/schemas/macro.js"() {
    STATE_MAP = {
      sticky: 65,
      hot: 80,
      accelerating: 75,
      rising: 70,
      elevated: 60,
      resilient: 55,
      stable: 50,
      mixed: 50,
      neutral: 50,
      normalizing: 45,
      cooling: 40,
      slowing: 35,
      weakening: 30,
      contracting: 20,
      restrictive: 70,
      tight: 65,
      tightening: 60,
      loose: 30,
      easing: 35
    };
    schema6 = {
      type: "object",
      required: ["pillars"],
      defaults: {},
      coerce: {
        pillars: (val, data) => {
          if (Array.isArray(val)) {
            data.pillars = val.map((item) => {
              if (typeof item === "string") {
                return { label: item, value: 0, direction: "" };
              }
              const out = { ...item };
              if (out.pillar && !out.label) {
                out.label = out.pillar;
                delete out.pillar;
              }
              if (out.state != null) {
                const stateStr = String(out.state);
                out.stateLabel = stateStr.split(/\s*\(/)[0].toUpperCase();
                const derived = stateToValue(stateStr);
                if (out.value == null || out.value === 0) out.value = derived;
                delete out.state;
              }
              return out;
            });
          }
        }
      },
      validate: (data) => {
        if (!Array.isArray(data.pillars) || data.pillars.length === 0) return null;
        return data;
      },
      shape: "object with { pillars: [{label, value, direction}] }",
      dataSources: ["india-macro-provider", "marked.events"]
    };
  }
});

// terminal/schemas/news.js
var schema7;
var init_news = __esm({
  "terminal/schemas/news.js"() {
    schema7 = {
      type: "object",
      required: [],
      defaults: {
        items: [],
        limit: 8
      },
      coerce: {
        // string[] → [{title, source, time, url}]
        items: (val, data) => {
          if (Array.isArray(val)) {
            data.items = val.map((item) => {
              if (typeof item === "string") {
                return { title: item, source: "", time: "", url: "" };
              }
              return item;
            });
          }
        },
        // Coerce limit from string to number; cap at 50
        limit: (val, data) => {
          if (typeof val === "string") {
            const n = Number(val);
            if (!isNaN(n)) data.limit = n;
          }
          if (typeof data.limit === "number" && data.limit > 50) data.limit = 50;
        }
      },
      shape: "object with { items: [{title, source, time, url}] }",
      dataSources: ["marked.filings", "external-news-provider"]
    };
  }
});

// terminal/schemas/verdict.js
var CONVICTION_VALUES, TIMEFRAME_VALUES, SIGNAL_TO_CONVICTION, schema8;
var init_verdict = __esm({
  "terminal/schemas/verdict.js"() {
    CONVICTION_VALUES = ["strong_bull", "bull", "neutral", "bear", "strong_bear"];
    TIMEFRAME_VALUES = ["days", "weeks", "months", "quarters"];
    SIGNAL_TO_CONVICTION = {
      "STRONG BUY": "strong_bull",
      "STRONG_BUY": "strong_bull",
      "STRONGBUY": "strong_bull",
      "BUY": "bull",
      "BULLISH": "bull",
      "BULL": "bull",
      "RISK-ON": "bull",
      "HOLD": "neutral",
      "NEUTRAL": "neutral",
      "CAUTIOUS": "neutral",
      "SELL": "bear",
      "BEARISH": "bear",
      "BEAR": "bear",
      "RISK-OFF": "bear",
      "STRONG SELL": "strong_bear",
      "STRONG_SELL": "strong_bear",
      "STRONGSELL": "strong_bear"
    };
    schema8 = {
      type: "object",
      required: [],
      defaults: {},
      coerce: {
        // body → thesis migration (v1.0 compat)
        body: (val, data) => {
          if (data.body && !data.thesis) data.thesis = data.body;
        },
        // signal → conviction migration (v1.1)
        signal: (val, data) => {
          if (data.signal && !data.conviction) {
            const key = String(data.signal).toUpperCase().trim();
            data.conviction = SIGNAL_TO_CONVICTION[key] || "neutral";
          }
        }
      },
      // ── Post-coerce hook (runs after all field coercions + defaults) ──────────
      // flat → sections migration (v1.1)
      // If data already has sections[], skip. Otherwise build sections[] from flat fields.
      // Runs after body→thesis and signal→conviction so those are already applied.
      postCoerce: (data) => {
        if (data.sections) {
          for (const s of data.sections) {
            if (s.type === "conviction" && !data.conviction) {
              data.conviction = s.conviction || s.value;
              if (s.timeframe) data.timeframe = s.timeframe;
            }
            if (s.type === "levels" && s.timeframe && !data.timeframe) data.timeframe = s.timeframe;
            if (s.type === "thesis" && !data.thesis) data.thesis = s.text;
            if (s.type === "catalysts" && !data.catalysts) data.catalysts = s.items;
            if (s.type === "risks" && !data.risks) data.risks = s.items;
          }
          return;
        }
        const sections = [];
        if (data.conviction != null) {
          sections.push({
            type: "conviction",
            value: data.conviction,
            timeframe: data.timeframe
          });
        }
        if (data.thesis != null) {
          sections.push({ type: "thesis", text: data.thesis });
        }
        if (data.catalysts != null) {
          sections.push({ type: "catalysts", items: data.catalysts });
        }
        if (data.risks != null) {
          sections.push({ type: "risks", items: data.risks });
        }
        if (data.levels != null) {
          sections.push({
            type: "levels",
            support: data.levels.support,
            resistance: data.levels.resistance
          });
        }
        data.sections = sections;
      },
      shape: "object with { thesis, conviction, catalysts, risks, levels, timeframe }",
      dataSources: [],
      // ── Warn gates (v1.1) ──────────────────────────────────────────────────
      // Fields that SHOULD be present for a complete analysis.
      // Missing → inline ⚠ warning. Never hard-block render.
      warn: ["thesis", "conviction", "catalysts", "risks", "timeframe"],
      warnValidators: {
        thesis: (val) => typeof val === "string" && val.length >= 50,
        conviction: (val) => CONVICTION_VALUES.includes(val),
        catalysts: (val) => Array.isArray(val) && val.length >= 1,
        risks: (val) => Array.isArray(val) && val.length >= 1,
        timeframe: (val) => TIMEFRAME_VALUES.includes(val)
      },
      warnMessages: {
        thesis: "\u26A0 thesis missing \u2014 incomplete analysis",
        conviction: "\u26A0 conviction missing \u2014 no directional view",
        catalysts: "\u26A0 no catalysts specified",
        risks: "\u26A0 no risks specified",
        timeframe: "\u26A0 no timeframe specified"
      }
    };
  }
});

// terminal/schemas/gauge.js
var schema9;
var init_gauge = __esm({
  "terminal/schemas/gauge.js"() {
    schema9 = {
      type: "object",
      required: ["value"],
      defaults: {
        showValue: true,
        showLabel: true
      },
      coerce: {
        // Coerce value from string to number
        value: (val, data) => {
          if (typeof val === "string") {
            const n = Number(val);
            if (!isNaN(n)) data.value = n;
          }
        }
      },
      shape: "object with { value: number }",
      dataSources: ["india-macro-provider"]
    };
  }
});

// terminal/schemas/gauges.js
var schema10;
var init_gauges = __esm({
  "terminal/schemas/gauges.js"() {
    schema10 = {
      type: "object",
      required: ["items"],
      defaults: {},
      coerce: {
        // string[] → [{label, value, direction}]
        items: (val, data) => {
          if (Array.isArray(val)) {
            data.items = val.map((item) => {
              if (typeof item === "string") {
                return { label: item, value: 0, direction: "" };
              }
              return item;
            });
          }
        }
      },
      validate: (data) => {
        if (!Array.isArray(data.items) || data.items.length === 0) return null;
        return data;
      },
      shape: "object with { items: [{value, label, preset}] }",
      dataSources: ["india-macro-provider"]
    };
  }
});

// terminal/schemas/correlationMatrix.js
var schema11;
var init_correlationMatrix = __esm({
  "terminal/schemas/correlationMatrix.js"() {
    schema11 = {
      required: ["tickers", "matrix"],
      coerce: {
        tickers: (val, data) => {
          if (typeof val === "string") data.tickers = val.split(",").map((s) => s.trim());
        },
        // Coerce matrix: ensure it's an array of arrays with numeric values
        matrix: (val, data) => {
          if (!Array.isArray(val)) {
            data.matrix = [];
            return;
          }
          data.matrix = val.map((row) => {
            if (!Array.isArray(row)) return [];
            return row.map((v) => typeof v === "string" ? Number(v) : v);
          });
        }
      },
      defaults: {
        title: "CORRELATION MATRIX"
      },
      dataSources: []
    };
  }
});

// terminal/schemas/treeMap.js
var schema12;
var init_treeMap = __esm({
  "terminal/schemas/treeMap.js"() {
    schema12 = {
      required: ["items"],
      coerce: {
        items: (val, data) => {
          if (!Array.isArray(val)) {
            data.items = [];
            return;
          }
          data.items = val.map((item) => {
            if (typeof item !== "object" || item === null) return item;
            const out = { ...item };
            if (typeof out.weight === "string") out.weight = Number(out.weight);
            if (typeof out.value === "string") out.value = Number(out.value);
            return out;
          });
        },
        height: (val, data) => {
          data.height = Number(val) || 10;
        }
      },
      defaults: {
        height: 10
      },
      dataSources: ["marked.metrics", "marked.shareholding"]
    };
  }
});

// terminal/schemas/flowSankey.js
var schema13;
var init_flowSankey = __esm({
  "terminal/schemas/flowSankey.js"() {
    schema13 = {
      required: ["nodes"],
      coerce: {
        nodes: (val, data) => {
          if (!Array.isArray(val)) {
            data.nodes = [];
            return;
          }
          data.nodes = val.map((node) => {
            if (typeof node !== "object" || node === null) return node;
            const out = { ...node };
            if (typeof out.value === "string") out.value = Number(out.value);
            return out;
          });
        },
        flows: (val, data) => {
          if (!Array.isArray(val)) {
            data.flows = [];
            return;
          }
          data.flows = val.map((flow) => {
            if (typeof flow !== "object" || flow === null) return flow;
            const out = { ...flow };
            if (typeof out.value === "string") out.value = Number(out.value);
            return out;
          });
        }
      },
      defaults: {
        flows: []
      },
      dataSources: []
    };
  }
});

// terminal/schemas/insiders.js
var schema14;
var init_insiders = __esm({
  "terminal/schemas/insiders.js"() {
    schema14 = {
      type: "object",
      required: [],
      defaults: {},
      coerce: {},
      validate(data) {
        const warnings = [];
        if (Array.isArray(data.transactions)) {
        } else if (Array.isArray(data)) {
          data = { transactions: data };
        } else {
          data.transactions = data.transactions ?? [];
        }
        if (!Array.isArray(data.transactions) || data.transactions.length === 0) {
          warnings.push("\u26A0 transactions missing or empty");
        }
        if (Array.isArray(data.transactions)) {
          data.transactions = data.transactions.map((tx) => {
            const out = { ...tx };
            if (typeof out.shares === "string") out.shares = Number(out.shares);
            if (typeof out.amount === "string") out.amount = Number(out.amount);
            if (typeof out.value === "string") out.value = Number(out.value);
            return out;
          });
        }
        if (warnings.length > 0) return { data, warnings };
        return data;
      },
      shape: "object with { transactions: [{date, name, type, shares, amount}] }",
      dataSources: ["marked.filings", "marked.events"]
    };
  }
});

// terminal/schemas/earnings.js
var schema15;
var init_earnings = __esm({
  "terminal/schemas/earnings.js"() {
    schema15 = {
      type: "object",
      required: [],
      defaults: {},
      coerce: {},
      validate(data) {
        const warnings = [];
        data.quarters = data.quarters ?? [];
        if (!Array.isArray(data.quarters) || data.quarters.length === 0) {
          warnings.push("\u26A0 quarters missing or empty");
        }
        if (Array.isArray(data.quarters)) {
          data.quarters = data.quarters.map((q) => {
            const out = { ...q };
            if (typeof out.actual === "string") out.actual = Number(out.actual);
            if (typeof out.estimate === "string") out.estimate = Number(out.estimate);
            if (typeof out.surprise === "string") out.surprise = Number(out.surprise);
            if (!out.date && out.period) out.date = out.period;
            return out;
          });
        }
        if (warnings.length > 0) return { data, warnings };
        return data;
      },
      shape: "object with { quarters: [{date, actual, estimate, surprise}] }",
      dataSources: ["marked.financials", "marked.filings"]
    };
  }
});

// terminal/schemas/holders.js
var schema16;
var init_holders = __esm({
  "terminal/schemas/holders.js"() {
    schema16 = {
      type: "object",
      required: [],
      defaults: {},
      coerce: {},
      validate(data) {
        const warnings = [];
        data.holders = data.holders ?? [];
        if (!Array.isArray(data.holders) || data.holders.length === 0) {
          warnings.push("\u26A0 holders missing or empty");
        }
        if (Array.isArray(data.holders)) {
          data.holders = data.holders.map((h) => {
            const out = { ...h };
            if (typeof out.shares === "string") out.shares = Number(out.shares);
            if (typeof out.percent === "string") out.percent = Number(out.percent);
            return out;
          });
        }
        if (warnings.length > 0) return { data, warnings };
        return data;
      },
      shape: "object with { holders: [{name, shares, percent}] }",
      dataSources: ["marked.shareholding"]
    };
  }
});

// terminal/schemas/filings.js
var schema17;
var init_filings = __esm({
  "terminal/schemas/filings.js"() {
    schema17 = {
      type: "object",
      required: [],
      defaults: {},
      coerce: {},
      validate(data) {
        const warnings = [];
        data.filings = data.filings ?? [];
        if (!Array.isArray(data.filings) || data.filings.length === 0) {
          warnings.push("\u26A0 filings missing or empty");
        }
        if (Array.isArray(data.filings)) {
          data.filings = data.filings.map((f) => {
            const out = { ...f };
            if (out.form != null) out.form = String(out.form);
            if (out.description != null) out.description = String(out.description);
            return out;
          });
        }
        if (warnings.length > 0) return { data, warnings };
        return data;
      },
      shape: "object with { filings: [{date, form, description}] }",
      dataSources: ["marked.filings", "marked.events"]
    };
  }
});

// terminal/schemas/heatmap.js
var VALID_COLOR_SCALES, schema18;
var init_heatmap = __esm({
  "terminal/schemas/heatmap.js"() {
    VALID_COLOR_SCALES = ["diverging", "sequential"];
    schema18 = {
      type: "object",
      required: [],
      defaults: {
        colorScale: "diverging"
      },
      coerce: {},
      validate(data) {
        const warnings = [];
        data.rows = data.rows ?? [];
        data.columns = data.columns ?? [];
        if (!Array.isArray(data.rows) || data.rows.length === 0) {
          warnings.push("\u26A0 rows missing or empty");
        }
        if (!Array.isArray(data.columns) || data.columns.length === 0) {
          warnings.push("\u26A0 columns missing or empty");
        }
        if (data.colorScale == null) {
          data.colorScale = "diverging";
        } else if (!VALID_COLOR_SCALES.includes(data.colorScale)) {
          warnings.push(`\u26A0 unknown colorScale "${data.colorScale}" \u2014 using diverging`);
          data.colorScale = "diverging";
        }
        if (Array.isArray(data.rows)) {
          data.rows = data.rows.map((r) => {
            const out = { ...r };
            if (Array.isArray(out.values)) {
              out.values = out.values.map((v) => typeof v === "string" ? Number(v) : v);
            }
            return out;
          });
        }
        if (warnings.length > 0) return { data, warnings };
        return data;
      },
      shape: "object with { rows: [{label, values}], columns: string[] }",
      dataSources: []
    };
  }
});

// terminal/schemas/candlestick.js
var schema19;
var init_candlestick = __esm({
  "terminal/schemas/candlestick.js"() {
    schema19 = {
      type: "object",
      required: [],
      defaults: {},
      coerce: {},
      validate(data) {
        const warnings = [];
        data.bars = data.bars ?? [];
        if (!Array.isArray(data.bars) || data.bars.length === 0) {
          warnings.push("\u26A0 bars missing or empty");
        }
        if (Array.isArray(data.bars)) {
          data.bars = data.bars.map((b) => {
            const out = { ...b };
            if (typeof out.open === "string") out.open = Number(out.open);
            if (typeof out.high === "string") out.high = Number(out.high);
            if (typeof out.low === "string") out.low = Number(out.low);
            if (typeof out.close === "string") out.close = Number(out.close);
            if (typeof out.volume === "string") out.volume = Number(out.volume);
            return out;
          });
        }
        if (warnings.length > 0) return { data, warnings };
        return data;
      },
      shape: "object with { bars: [{open, high, low, close, volume}] }",
      dataSources: ["marked.prices"]
    };
  }
});

// terminal/schemas/waterfall.js
var schema20;
var init_waterfall = __esm({
  "terminal/schemas/waterfall.js"() {
    schema20 = {
      type: "object",
      required: [],
      defaults: {},
      coerce: {},
      validate(data) {
        const warnings = [];
        data.items = data.items ?? [];
        if (!Array.isArray(data.items) || data.items.length === 0) {
          warnings.push("\u26A0 items missing or empty");
        }
        if (Array.isArray(data.items)) {
          data.items = data.items.map((item) => {
            const out = { ...item };
            if (typeof out.value === "string") out.value = Number(out.value);
            if (typeof out.previous === "string") out.previous = Number(out.previous);
            return out;
          });
        }
        if (warnings.length > 0) return { data, warnings };
        return data;
      },
      shape: "object with { items: [{label, value, previous?}] }",
      dataSources: ["marked.financials"]
    };
  }
});

// terminal/schemas/index.js
var schemas_exports = {};
__export(schemas_exports, {
  getWarnings: () => getWarnings,
  validate: () => validate
});
function logCoercion(panelName, field, fromType, toType) {
  try {
    process.stderr.write(`[schema] ${panelName}: coerced ${field} from ${fromType} to ${toType}
`);
  } catch {
  }
}
function validate(name, data) {
  if (data == null || typeof data !== "object" || Array.isArray(data)) {
    return null;
  }
  const schema21 = schemas[name];
  if (!schema21) {
    return data;
  }
  const result = { ...data };
  if (result.variant === void 0 && !schema21.defaults?.hasOwnProperty("variant")) {
    result.variant = "dense";
  }
  if (schema21.coerce) {
    for (const [field, coerceFn] of Object.entries(schema21.coerce)) {
      if (field in result) {
        const before = result[field];
        const beforeType = typeof before;
        try {
          coerceFn(before, result);
        } catch (err) {
          logCoercion(name, field, beforeType, `ERROR: ${err.message}`);
          logSchemaCoercion(name, field, beforeType, `ERROR: ${err.message}`);
          continue;
        }
        const after = result[field];
        if (after !== before && typeof after !== beforeType) {
          logCoercion(name, field, beforeType, typeof after);
          logSchemaCoercion(name, field, beforeType, typeof after);
        }
      }
    }
  }
  if (schema21.defaults) {
    for (const [field, defaultVal] of Object.entries(schema21.defaults)) {
      if (result[field] == null) {
        result[field] = defaultVal;
      }
    }
  }
  if (typeof schema21.postCoerce === "function") {
    schema21.postCoerce(result);
  }
  if (schema21.required?.length) {
    for (const field of schema21.required) {
      if (result[field] == null) {
        logCoercion(name, field, "undefined", "required");
        logSchemaMissing(name, field);
        return null;
      }
    }
  }
  if (typeof schema21.validate === "function") {
    return schema21.validate(result);
  }
  if (!result.suppressWarnings && schema21.warn?.length && schema21.warnValidators) {
    const warnings = [];
    for (const field of schema21.warn) {
      const validator = schema21.warnValidators[field];
      if (validator && !validator(result[field])) {
        const msg = schema21.warnMessages?.[field] ?? `\u26A0 ${field} missing`;
        warnings.push(msg);
      }
    }
    if (warnings.length > 0) {
      logSchemaWarnings(name, warnings);
      return { data: result, warnings };
    }
  }
  return result;
}
function getWarnings(name, data) {
  const schema21 = schemas[name];
  if (data?.suppressWarnings || !schema21?.warn?.length || !schema21.warnValidators) return [];
  const warnings = [];
  for (const field of schema21.warn) {
    const validator = schema21.warnValidators[field];
    if (validator && !validator(data[field])) {
      const msg = schema21.warnMessages?.[field] ?? `\u26A0 ${field} missing`;
      warnings.push(msg);
    }
  }
  return warnings;
}
var schemas;
var init_schemas = __esm({
  "terminal/schemas/index.js"() {
    init_debugLog();
    init_quote();
    init_chart();
    init_technical();
    init_rsi();
    init_analyst();
    init_macro();
    init_news();
    init_verdict();
    init_gauge();
    init_gauges();
    init_correlationMatrix();
    init_treeMap();
    init_flowSankey();
    init_insiders();
    init_earnings();
    init_holders();
    init_filings();
    init_heatmap();
    init_candlestick();
    init_waterfall();
    schemas = {
      quote: schema,
      chart: schema2,
      technical: schema3,
      rsi: schema4,
      analyst: schema5,
      macro: schema6,
      news: schema7,
      verdict: schema8,
      gauge: schema9,
      gauges: schema10,
      correlationMatrix: schema11,
      treeMap: schema12,
      flowSankey: schema13,
      insiders: schema14,
      earnings: schema15,
      holders: schema16,
      filings: schema17,
      heatmap: schema18,
      candlestick: schema19,
      waterfall: schema20
    };
  }
});

// terminal/app.js
import fs6 from "fs";
import path6 from "path";
import readline from "readline";
import { pathToFileURL } from "node:url";

// terminal/server.js
init_paths();
init_debugLog();
import http from "http";
import net from "net";
import fs3 from "fs";
import path3 from "path";
import { EventEmitter } from "events";
import { createRequire } from "module";

// src/themes.js
var MARKET_GREEN = "#72C66B";
var MARKET_RED = "#E7775A";
var themes = {
  "terminal-cyan": {
    accent: "#00d4ff",
    positive: "#00ff88",
    negative: "#ff4444",
    warning: "#ffaa00",
    data: "#ffffff",
    label: "#00d4ff",
    muted: "#555555",
    highlight: "#ffdd00",
    chartHigh: "#00d4ff",
    chartLow: "#005566"
  },
  bloomberg: {
    accent: "#ff8c00",
    positive: "#00c853",
    negative: "#ff1744",
    warning: "#ffd600",
    data: "#ffffff",
    label: "#ff8c00",
    muted: "#555555",
    highlight: "#ff8c00",
    chartHigh: "#ff8c00",
    chartLow: "#663800"
  },
  monochrome: {
    accent: "#ffffff",
    positive: "#cccccc",
    negative: "#888888",
    warning: "#aaaaaa",
    data: "#ffffff",
    label: "#999999",
    muted: "#444444",
    highlight: "#ffffff",
    chartHigh: "#ffffff",
    chartLow: "#555555"
  },
  "solarized-dark": {
    accent: "#268bd2",
    positive: "#859900",
    negative: "#dc322f",
    warning: "#b58900",
    data: "#eee8d5",
    label: "#268bd2",
    muted: "#586e75",
    highlight: "#cb4b16",
    chartHigh: "#268bd2",
    chartLow: "#073642"
  },
  dracula: {
    accent: "#bd93f9",
    positive: "#50fa7b",
    negative: "#ff5555",
    warning: "#f1fa8c",
    data: "#f8f8f2",
    label: "#bd93f9",
    muted: "#6272a4",
    highlight: "#ffb86c",
    chartHigh: "#bd93f9",
    chartLow: "#44475a"
  },
  marked: {
    accent: "#C0FF00",
    positive: "#00ff88",
    negative: "#FF5C30",
    warning: "#FFAA00",
    data: "#ffffff",
    label: "#374EFF",
    muted: "#999999",
    highlight: "#6100FF",
    chartHigh: "#C0FF00",
    chartLow: "#374EFF"
  },
  // Muted violet on purple-black. Market green/red are kept close to the
  // house values so direction never reads as decoration, and chartLow is a
  // deep violet so gradients stay in-family instead of falling back to grey.
  "marked-violet": {
    accent: "#A189E8",
    positive: "#72C66B",
    negative: "#E7775A",
    warning: "#E8B44A",
    data: "#E8E4F2",
    label: "#7C6BB0",
    muted: "#5A5270",
    highlight: "#C9B6FF",
    chartHigh: "#A189E8",
    chartLow: "#3A2E5C"
  }
};
var activeTheme = "marked-violet";
function setTheme(name) {
  if (themes[name]) activeTheme = name;
}
function getTheme() {
  return activeTheme;
}
function palette(role) {
  return themes[activeTheme]?.[role] ?? "";
}

// src/ansi.js
var ESC = "\x1B[";
var RESET = `${ESC}0m`;
var BOLD = `${ESC}1m`;
var DIM = `${ESC}2m`;
function hexToRgb(hex) {
  const h = hex.replace("#", "");
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16)
  ];
}
function fg(hex) {
  const [r, g, b] = hexToRgb(hex);
  return `${ESC}38;2;${r};${g};${b}m`;
}
function boldFg(hex) {
  const [r, g, b] = hexToRgb(hex);
  return `${ESC}1;38;2;${r};${g};${b}m`;
}
function shade(hex, amount) {
  const mix = (c2) => {
    const v = amount <= 1 ? c2 * amount : c2 + (255 - c2) * (amount - 1);
    return Math.max(0, Math.min(255, Math.round(v)));
  };
  const [r, g, b] = hexToRgb(hex).map(mix);
  return `#${[r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}
function c(hexOrCode, text) {
  if (!hexOrCode) return String(text);
  const code = hexOrCode.startsWith("#") ? fg(hexOrCode) : hexOrCode;
  return `${code}${text}${RESET}`;
}
function pc(role, text) {
  const hex = palette(role);
  return hex ? c(hex, text) : String(text);
}
var ANSI_RE = /\x1b\[[0-9;]*m/g;
var OSC8_RE = /\x1b\]8;[^\x07\x1b]*(?:\x07|\x1b\\)/g;
function strip(s) {
  return String(s).replace(OSC8_RE, "").replace(ANSI_RE, "");
}
function visLen(s) {
  return strip(s).length;
}
function ansiTrunc(s, maxVis) {
  s = String(s);
  let vis = 0;
  let i = 0;
  let lastGood = 0;
  let inOsc8 = false;
  while (i < s.length && vis < maxVis) {
    if (s[i] === "\x1B") {
      if (s[i + 1] === "]" && s[i + 2] === "8" && s[i + 3] === ";") {
        let j2 = i + 4;
        while (j2 < s.length) {
          if (s[j2] === "\x07") {
            j2++;
            break;
          }
          if (s[j2] === "\x1B" && s[j2 + 1] === "\\") {
            j2 += 2;
            break;
          }
          j2++;
        }
        const seq = s.slice(i, j2);
        const inner = seq.slice(4, seq.endsWith("\x07") ? -1 : -2);
        if (inner === ";") {
          inOsc8 = false;
        } else {
          inOsc8 = true;
        }
        i = j2;
        continue;
      }
      let j = i + 1;
      while (j < s.length && s[j] !== "m") j++;
      i = j + 1;
      continue;
    }
    vis++;
    i++;
    lastGood = i;
  }
  if (i >= s.length) return s;
  let result = s.slice(0, lastGood);
  if (inOsc8) result += "\x1B]8;;\x07";
  result += RESET;
  return result;
}
function padRight(s, width) {
  const vl = visLen(s);
  if (vl >= width) return ansiTrunc(s, width);
  return s + " ".repeat(width - vl);
}
function padLeft(s, width) {
  const vl = visLen(s);
  if (vl >= width) return ansiTrunc(s, width);
  return " ".repeat(width - vl) + s;
}
function padCenter(s, width) {
  const vl = visLen(s);
  if (vl >= width) return ansiTrunc(s, width);
  const left = Math.floor((width - vl) / 2);
  const right = width - vl - left;
  return " ".repeat(left) + s + " ".repeat(right);
}
function wordWrap(text, maxLen) {
  maxLen = Math.max(1, Math.floor(maxLen));
  const words = String(text).split(" ");
  const lines = [];
  let cur = "";
  for (let word of words) {
    while (word.length > maxLen) {
      if (cur) {
        lines.push(cur);
        cur = "";
      }
      lines.push(word.slice(0, maxLen));
      word = word.slice(maxLen);
    }
    if (!word) continue;
    if (cur === "") {
      cur = word;
    } else if ((cur + " " + word).length <= maxLen) {
      cur += " " + word;
    } else {
      lines.push(cur);
      cur = word;
    }
  }
  if (cur) lines.push(cur);
  return lines;
}
var DOUBLE = { tl: "\u2554", tr: "\u2557", bl: "\u255A", br: "\u255D", h: "\u2550", v: "\u2551" };
var ROUND = { tl: "\u256D", tr: "\u256E", bl: "\u2570", br: "\u256F", h: "\u2500", v: "\u2502" };
var LINE = { h: "\u2500", v: "\u2502", ml: "\u251C", mr: "\u2524" };
function boxTop(width, title = "", tier = 2) {
  const b = tier === 1 ? DOUBLE : ROUND;
  const ac = palette("accent");
  if (title) {
    const n = Math.max(0, width - 5 - strip(title).length);
    return c(ac, `${b.tl}${b.h} `) + c(ac, title) + c(ac, ` ${b.h.repeat(n)}${b.tr}`);
  }
  return c(ac, b.tl + b.h.repeat(width - 2) + b.tr);
}
function boxBot(width, footer = "", tier = 2) {
  const b = tier === 1 ? DOUBLE : ROUND;
  const ac = palette("accent");
  if (footer) {
    const n = Math.max(0, width - 5 - strip(footer).length);
    return c(ac, `${b.bl}${b.h} `) + pc("muted", strip(footer)) + c(ac, ` ${b.h.repeat(n)}${b.br}`);
  }
  return c(ac, b.bl + b.h.repeat(width - 2) + b.br);
}
function boxRow(content, width, tier = 2) {
  const b = tier === 1 ? DOUBLE : ROUND;
  const ac = palette("accent");
  const innerW = width - 4;
  const vl = visLen(content);
  const pad = Math.max(0, innerW - vl);
  const truncated = vl > innerW ? ansiTrunc(content, innerW) : content;
  const padStr = vl > innerW ? "" : " ".repeat(pad);
  return c(ac, b.v) + " " + truncated + padStr + " " + c(ac, b.v);
}
function boxDivider(width, title = "") {
  const ac = palette("accent");
  if (title) {
    const n = Math.max(0, width - 5 - strip(title).length);
    return c(ac, `${LINE.ml}${LINE.h} `) + pc("label", strip(title)) + c(ac, ` ${LINE.h.repeat(n)}${LINE.mr}`);
  }
  return c(ac, LINE.ml + LINE.h.repeat(width - 2) + LINE.mr);
}
function boxEmpty(width, tier = 2) {
  const b = tier === 1 ? DOUBLE : ROUND;
  const ac = palette("accent");
  return c(ac, b.v) + " ".repeat(width - 2) + c(ac, b.v);
}

// src/formatters.js
var SIGNED_PERCENT_CHANGE_RE = /^\s*([+-])(?=\d|\.\d)(?:\d{1,3}(?:,\d{3})*|\d+)(?:\.\d+)?%\s*(?:[▲▼])?\s*$/;
function fmtPrice(v) {
  if (v == null) return "\u2014";
  v = Number(v);
  if (!Number.isFinite(v)) return "\u2014";
  if (v >= 1e3) return `\u20B9${v.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  if (v >= 1) return `\u20B9${v.toFixed(2)}`;
  return `\u20B9${v.toFixed(4)}`;
}
function fmtPct(v, showSign = true) {
  if (v == null) return "\u2014";
  v = Number(v);
  if (showSign) return `${v >= 0 ? "+" : ""}${v.toFixed(1)}%`;
  return `${v.toFixed(1)}%`;
}
function fmtCap(v) {
  if (v == null) return "\u2014";
  v = Number(v);
  if (!Number.isFinite(v)) return "\u2014";
  if (v >= 1e7) return `\u20B9${(v / 1e7).toLocaleString("en-IN", { maximumFractionDigits: 0 })} Cr`;
  if (v >= 1e5) return `\u20B9${(v / 1e5).toLocaleString("en-IN", { maximumFractionDigits: 1 })} L`;
  return `\u20B9${v.toLocaleString("en-IN")}`;
}
function fmtVol(v) {
  if (v == null) return "\u2014";
  v = Number(v);
  if (v >= 1e9) return `${(v / 1e9).toFixed(1)}B`;
  if (v >= 1e6) return `${(v / 1e6).toFixed(1)}M`;
  if (v >= 1e3) return `${(v / 1e3).toFixed(1)}K`;
  return String(Math.round(v));
}
var MONTHS = ["", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function fmtDate(d) {
  if (!d) return "\u2014";
  const s = String(d).slice(0, 10);
  const parts = s.split("-");
  if (parts.length < 3) return s;
  return `${MONTHS[parseInt(parts[1], 10)]} ${parseInt(parts[2], 10)}`;
}
function coloredPct(v) {
  if (v == null) return pc("muted", "\u2014");
  v = Number(v);
  if (v > 0) return pc("positive", `+${v.toFixed(1)}%`);
  if (v < 0) return pc("negative", `${v.toFixed(1)}%`);
  return pc("muted", `${v.toFixed(1)}%`);
}
function convictionBadge(conviction) {
  if (!conviction) return "";
  switch (conviction) {
    case "strong_bull":
      return `${boldFg(palette("positive"))}[STRONG BULL]\x1B[0m`;
    case "bull":
      return `${fg(palette("positive"))}[BULL]\x1B[0m`;
    case "neutral":
      return `${fg(palette("warning"))}[NEUTRAL]\x1B[0m`;
    case "bear":
      return `${fg(palette("negative"))}[BEAR]\x1B[0m`;
    case "strong_bear":
      return `${boldFg(palette("negative"))}[STRONG BEAR]\x1B[0m`;
    default:
      return pc("muted", `[${String(conviction).toUpperCase()}]`);
  }
}
function coloredSignal(signal, confidence) {
  if (!signal) return pc("muted", "\u2014");
  const s = signal.toUpperCase();
  let role = "muted";
  if (s.includes("BUY") || s.includes("BULL") || s.includes("RISK-ON")) role = "positive";
  else if (s.includes("SELL") || s.includes("BEAR") || s.includes("RISK-OFF")) role = "negative";
  else if (s.includes("HOLD") || s.includes("NEUTRAL")) role = "warning";
  else if (s.includes("CAUTIOUS")) role = "warning";
  const text = confidence != null ? `${s} ${Math.round(confidence * 100)}%` : s;
  return pc(role, text);
}
function trendArrow(direction) {
  const d = String(direction).toLowerCase();
  if (["rising", "up", "bullish", "above"].includes(d)) return pc("positive", "\u25B2");
  if (["falling", "down", "bearish", "below"].includes(d)) return pc("negative", "\u25BC");
  return pc("muted", "\u25A0");
}
function tablePercentColor(text) {
  const match = String(text ?? "").match(SIGNED_PERCENT_CHANGE_RE);
  if (!match) return "";
  return match[1] === "+" ? MARKET_GREEN : MARKET_RED;
}
function colorTablePercent(text) {
  const str = String(text ?? "");
  const hex = tablePercentColor(str);
  return hex ? c(hex, str) : str;
}

// src/markdown.js
function renderMarkdownInline(text) {
  let s = String(text);
  s = s.replace(/\*\*(.+?)\*\*/g, `${BOLD}$1${RESET}`);
  s = s.replace(/(?<!\*)\*([^*]+?)\*(?!\*)/g, `${DIM}$1${RESET}`);
  s = s.replace(/`([^`]+?)`/g, (_, code) => c(palette("highlight"), code));
  return s;
}

// src/components/BrailleChart.js
var DOT_MAP = [
  [1, 8],
  // row 0
  [2, 16],
  // row 1
  [4, 32],
  // row 2
  [64, 128]
  // row 3
];
var BRAILLE_BASE = 10240;
function brailleChart(opts = {}) {
  const {
    values = [],
    width = 60,
    height = 6,
    showAxis = true,
    showMinMax = true,
    fill = false,
    volume,
    label
  } = opts;
  if (!values.length) {
    return pc("muted", "(no data)");
  }
  if (values.length === 1) {
    return pc("data", `${fmtPrice(values[0])} (single point)`);
  }
  const minVal = Math.min(...values);
  const maxVal = Math.max(...values);
  const maxLabelLen = Math.max(fmtPrice(minVal).length, fmtPrice(maxVal).length);
  const rawAxisWidth = showAxis ? maxLabelLen + 1 : 0;
  const axisWidth = showAxis && width - rawAxisWidth >= 12 ? rawAxisWidth : 0;
  const effectiveShowAxis = axisWidth > 0;
  const chartCols = width - axisWidth;
  if (chartCols < 4) return pc("muted", "(too narrow)");
  const subCols = chartCols * 2;
  const resampled = resample(values, subCols);
  const clean = resampled.map((v) => Number.isFinite(v) ? v : null);
  const finite = clean.filter((v) => v !== null);
  if (!finite.length) return pc("muted", "(no valid data)");
  const min = Math.min(...finite);
  const max = Math.max(...finite);
  const range = max - min || 1;
  const subRows = height * 4;
  const yPositions = clean.map(
    (v) => v === null ? -1 : Math.round((1 - (v - min) / range) * (subRows - 1))
  );
  const grid = Array.from(
    { length: height },
    () => new Uint8Array(chartCols)
  );
  for (let sx = 0; sx < subCols; sx++) {
    const y = yPositions[sx];
    if (y < 0) continue;
    const col = Math.floor(sx / 2);
    const dotCol = sx % 2;
    const row = Math.floor(y / 4);
    const dotRow = y % 4;
    if (row >= 0 && row < height && col >= 0 && col < chartCols) {
      grid[row][col] |= DOT_MAP[dotRow][dotCol];
    }
  }
  for (let sx = 1; sx < subCols; sx++) {
    const y0 = yPositions[sx - 1];
    const y1 = yPositions[sx];
    if (y0 < 0 || y1 < 0) continue;
    if (Math.abs(y1 - y0) > 1) {
      const step = y1 > y0 ? 1 : -1;
      for (let y = y0 + step; y !== y1; y += step) {
        const col = Math.floor((sx - 0.5) / 2);
        const dotCol = Math.round((sx - 0.5) % 2) ? 1 : 0;
        const row = Math.floor(y / 4);
        const dotRow = y % 4;
        if (row >= 0 && row < height && col >= 0 && col < chartCols) {
          grid[row][col] |= DOT_MAP[dotRow][dotCol];
        }
      }
    }
  }
  const fillGrid = Array.from(
    { length: height },
    () => new Uint8Array(chartCols)
  );
  if (fill) for (let sx = 0; sx < subCols; sx++) {
    const y = yPositions[sx];
    if (y < 0) continue;
    const col = Math.floor(sx / 2);
    const dotCol = sx % 2;
    for (let fillY = y + 1; fillY < subRows; fillY++) {
      const fRow = Math.floor(fillY / 4);
      const fDotRow = fillY % 4;
      if (fRow >= 0 && fRow < height && col >= 0 && col < chartCols) {
        if (!(grid[fRow][col] & DOT_MAP[fDotRow][dotCol])) {
          fillGrid[fRow][col] |= DOT_MAP[fDotRow][dotCol];
        }
      }
    }
  }
  const chartColor = palette("accent");
  const fillColor = palette("chartLow");
  let volumeRow = "";
  if (volume && volume.length > 0) {
    const volResampled = resample(volume, chartCols);
    const volMax = Math.max(...volResampled) || 1;
    const volChars = "\u2591\u2592\u2593\u2588";
    volumeRow = volResampled.map((v) => {
      const ratio = v / volMax;
      const idx = Math.min(volChars.length - 1, Math.floor(ratio * volChars.length));
      return volChars[idx];
    }).join("");
  }
  const lines = [];
  const axisLineColor = palette("muted");
  for (let row = 0; row < height; row++) {
    let axis = "";
    if (effectiveShowAxis) {
      if (row === 0) {
        axis = padLeft(pc("muted", fmtPrice(max)), axisWidth);
      } else if (row === height - 1) {
        axis = padLeft(pc("muted", fmtPrice(min)), axisWidth);
      } else if (row === Math.floor(height / 2)) {
        const mid = (max + min) / 2;
        axis = padLeft(pc("muted", fmtPrice(mid)), axisWidth);
      } else {
        axis = " ".repeat(axisWidth);
      }
    }
    let rowStr = "";
    for (let col = 0; col < chartCols; col++) {
      const curveBits = grid[row][col];
      const fBits = fillGrid[row][col];
      if (curveBits === 0 && fBits === 0) {
        rowStr += " ";
      } else if (curveBits !== 0) {
        const merged = curveBits | fBits;
        rowStr += c(chartColor, String.fromCharCode(BRAILLE_BASE + merged));
      } else {
        rowStr += c(fillColor, String.fromCharCode(BRAILLE_BASE + fBits));
      }
    }
    lines.push(axis + rowStr);
  }
  const xAxisPad = effectiveShowAxis ? " ".repeat(axisWidth) : "";
  lines.push(xAxisPad + c(axisLineColor, "\u2500".repeat(chartCols)));
  if (volumeRow) {
    const volAxis = effectiveShowAxis ? padLeft(pc("muted", "Vol"), axisWidth) : "";
    lines.push(volAxis + pc("muted", volumeRow));
  }
  if (label) {
    const labelAxis = effectiveShowAxis ? " ".repeat(axisWidth) : "";
    lines.push(labelAxis + pc("label", label));
  }
  return lines.join("\n");
}
function resample(arr, targetLen) {
  if (arr.length === targetLen) return arr.map(Number);
  const result = [];
  for (let i = 0; i < targetLen; i++) {
    const srcIdx = i / (targetLen - 1) * (arr.length - 1);
    const lo = Math.floor(srcIdx);
    const hi = Math.min(lo + 1, arr.length - 1);
    const frac = srcIdx - lo;
    result.push(Number(arr[lo]) * (1 - frac) + Number(arr[hi]) * frac);
  }
  return result;
}

// src/components/CandlestickChart.js
var WICK_CHAR = "\u2502";
var BODY_BULL = "\u2591";
var BODY_BEAR = "\u2588";
var SPACE = " ";
function candlestickChart(opts = {}) {
  const {
    bars = [],
    width = 60,
    height = 10,
    showAxis = true,
    label
  } = opts;
  if (!bars.length) {
    return pc("muted", "(no data)");
  }
  if (bars.length === 1) {
    const b = bars[0];
    return pc("data", `O:${fmtPrice(b.open)} H:${fmtPrice(b.high)} L:${fmtPrice(b.low)} C:${fmtPrice(b.close)}`);
  }
  const axisWidth = showAxis ? 9 : 0;
  const chartCols = width - axisWidth;
  if (chartCols < 3) return pc("muted", "(too narrow)");
  const allHighs = bars.map((b) => Number(b.high));
  const allLows = bars.map((b) => Number(b.low));
  const priceMax = Math.max(...allHighs);
  const priceMin = Math.min(...allLows);
  const priceRange = priceMax - priceMin || 1;
  const minCandleW = 2;
  const maxCandles = Math.floor(chartCols / minCandleW);
  const visibleBars = bars.length > maxCandles ? bars.slice(bars.length - maxCandles) : bars;
  const numCandles = visibleBars.length;
  const candleColW = Math.max(minCandleW, Math.floor(chartCols / numCandles));
  function priceToRow(price) {
    return Math.round((1 - (price - priceMin) / priceRange) * (height - 1));
  }
  const gridCols = numCandles * candleColW;
  const grid = Array.from(
    { length: height },
    () => Array.from({ length: gridCols }, () => ({ ch: SPACE, color: null }))
  );
  const posColor = palette("positive");
  const negColor = palette("negative");
  const wickColor = palette("muted");
  for (let ci = 0; ci < numCandles; ci++) {
    const bar = visibleBars[ci];
    const open = Number(bar.open);
    const high = Number(bar.high);
    const low = Number(bar.low);
    const close = Number(bar.close);
    const isBull = close >= open;
    const candleColor = isBull ? posColor : negColor;
    const bodyChar = isBull ? BODY_BULL : BODY_BEAR;
    const highRow = priceToRow(high);
    const lowRow = priceToRow(low);
    const bodyTop = priceToRow(Math.max(open, close));
    const bodyBot = priceToRow(Math.min(open, close));
    const col = ci * candleColW;
    for (let r = highRow; r <= lowRow; r++) {
      if (r >= 0 && r < height) {
        const isBody = r >= bodyTop && r <= bodyBot;
        if (isBody) {
          grid[r][col] = { ch: bodyChar, color: candleColor };
        } else {
          grid[r][col] = { ch: WICK_CHAR, color: wickColor };
        }
      }
    }
  }
  const lines = [];
  const axisRows = /* @__PURE__ */ new Set();
  if (showAxis) {
    axisRows.add(0);
    axisRows.add(Math.floor((height - 1) / 2));
    axisRows.add(height - 1);
  }
  for (let r = 0; r < height; r++) {
    let axisStr = "";
    if (showAxis) {
      if (axisRows.has(r)) {
        let price;
        if (r === 0) price = priceMax;
        else if (r === height - 1) price = priceMin;
        else price = (priceMax + priceMin) / 2;
        axisStr = padLeft(pc("muted", fmtPrice(price)), axisWidth - 1) + " ";
      } else {
        axisStr = " ".repeat(axisWidth);
      }
    }
    let rowStr = "";
    for (let col = 0; col < gridCols; col++) {
      const cell = grid[r][col];
      if (cell.color) {
        rowStr += c(cell.color, cell.ch);
      } else {
        rowStr += cell.ch;
      }
    }
    lines.push(axisStr + rowStr);
  }
  if (label) {
    const labelPad = showAxis ? " ".repeat(axisWidth) : "";
    lines.push(labelPad + pc("label", label));
  }
  return lines.join("\n");
}

// src/components/HeatMap.js
function darken(hex, factor = 0.35) {
  const s = hex.replace("#", "");
  const r = Math.round(parseInt(s.slice(0, 2), 16) * factor);
  const g = Math.round(parseInt(s.slice(2, 4), 16) * factor);
  const b = Math.round(parseInt(s.slice(4, 6), 16) * factor);
  return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
}
function hexToRgb2(hex) {
  const h = hex.replace("#", "");
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16)
  ];
}
function rgbToHex(r, g, b) {
  return "#" + Math.round(r).toString(16).padStart(2, "0") + Math.round(g).toString(16).padStart(2, "0") + Math.round(b).toString(16).padStart(2, "0");
}
function lerpColor(hexA, hexB, t) {
  const [ar, ag, ab] = hexToRgb2(hexA);
  const [br, bg_, bb] = hexToRgb2(hexB);
  return rgbToHex(
    ar + (br - ar) * t,
    ag + (bg_ - ag) * t,
    ab + (bb - ab) * t
  );
}
function divergingColor(norm) {
  const neutralHex = darken(palette("muted") || "#555555", 0.3);
  const posHex = palette("positive") || "#00ff88";
  const negHex = palette("negative") || "#ff4444";
  if (norm >= 0) {
    return lerpColor(neutralHex, posHex, Math.min(norm, 1));
  } else {
    return lerpColor(neutralHex, negHex, Math.min(-norm, 1));
  }
}
function sequentialColor(norm) {
  const lowHex = palette("chartLow") || "#005566";
  const highHex = palette("chartHigh") || "#00d4ff";
  return lerpColor(lowHex, highHex, Math.min(Math.max(norm, 0), 1));
}
function fmtCellValue(v) {
  if (v == null) return " \u2014 ";
  v = Number(v);
  if (Math.abs(v) >= 100) return `${v.toFixed(0)}`;
  if (Math.abs(v) >= 10) return `${v.toFixed(1)}`;
  return `${v.toFixed(2)}`;
}
function heatMap(opts) {
  const {
    rows = [],
    columns = [],
    width = 60,
    colorScale = "diverging"
  } = opts;
  if (!rows.length || !columns.length) {
    return pc("muted", "(no data)");
  }
  const numCols = columns.length;
  const numRows = rows.length;
  const maxRowLabelLen = Math.max(...rows.map((r) => strip(r.label || "").length), 3);
  const rowLabelW = Math.min(maxRowLabelLen + 1, 12);
  const availW = Math.max(width - rowLabelW, numCols * 3);
  const cellW = Math.max(3, Math.floor(availW / numCols));
  const allValues = rows.flatMap((r) => (r.values || []).map(Number).filter((v) => !isNaN(v)));
  if (!allValues.length) return pc("muted", "(no data)");
  let vMin, vMax, vAbs;
  if (colorScale === "diverging") {
    vAbs = Math.max(Math.abs(Math.min(...allValues)), Math.abs(Math.max(...allValues))) || 1;
  } else {
    vMin = Math.min(...allValues);
    vMax = Math.max(...allValues);
    const vRange = vMax - vMin || 1;
    vAbs = vRange;
  }
  function normalizeValue(v) {
    if (colorScale === "diverging") {
      return v / vAbs;
    } else {
      return (v - vMin) / vAbs;
    }
  }
  function getCellBg(v) {
    const norm = normalizeValue(v);
    return colorScale === "diverging" ? divergingColor(norm) : sequentialColor(norm);
  }
  const textColor = palette("data") || "#ffffff";
  const lines = [];
  let headerLine = " ".repeat(rowLabelW);
  for (const colLabel of columns) {
    const truncated = strip(colLabel).slice(0, cellW - 1);
    headerLine += padCenter(pc("label", truncated), cellW);
  }
  lines.push(headerLine);
  for (const row of rows) {
    const rowLabel = strip(row.label || "").slice(0, rowLabelW - 1);
    let line = padRight(pc("label", rowLabel), rowLabelW);
    const values = row.values || [];
    for (let ci = 0; ci < numCols; ci++) {
      const v = values[ci];
      if (v == null || isNaN(Number(v))) {
        line += " ".repeat(cellW);
        continue;
      }
      const bgHex = getCellBg(Number(v));
      const display = fmtCellValue(Number(v));
      const innerW = Math.max(cellW - 2, 1);
      const padded = padCenter(display, innerW);
      const ESC2 = "\x1B[";
      const [br, bg_, bb] = hexToRgb2(bgHex);
      const [tr, tg, tb] = hexToRgb2(textColor);
      const bgCode = `${ESC2}48;2;${br};${bg_};${bb}m`;
      const fgCode = `${ESC2}38;2;${tr};${tg};${tb}m`;
      line += " " + bgCode + fgCode + padded + `${ESC2}0m `;
    }
    lines.push(line);
  }
  return lines.join("\n");
}

// src/components/GaugeBar.js
var BLOCK_FULL = "\u2588";
var BLOCK_EMPTY = "\u2591";
var PRESETS = {
  rsi: {
    min: 0,
    max: 100,
    zones: [
      { from: 0, to: 30, role: "positive", label: "OVERSOLD" },
      { from: 30, to: 70, role: "data", label: "" },
      { from: 70, to: 100, role: "negative", label: "OVERBOUGHT" }
    ]
  },
  sentiment: {
    min: -1,
    max: 1,
    zones: [
      { from: -1, to: -0.3, role: "negative", label: "BEARISH" },
      { from: -0.3, to: 0.3, role: "warning", label: "NEUTRAL" },
      { from: 0.3, to: 1, role: "positive", label: "BULLISH" }
    ]
  },
  confidence: {
    min: 0,
    max: 100,
    zones: [
      { from: 0, to: 33, role: "negative", label: "LOW" },
      { from: 33, to: 66, role: "warning", label: "MEDIUM" },
      { from: 66, to: 100, role: "positive", label: "HIGH" }
    ]
  },
  percent: {
    min: 0,
    max: 100,
    zones: [
      { from: 0, to: 100, role: "accent", label: "" }
    ]
  },
  macro: {
    min: 0,
    max: 8,
    zones: [
      { from: 0, to: 2, role: "positive", label: "" },
      { from: 2, to: 4, role: "warning", label: "" },
      { from: 4, to: 8, role: "negative", label: "" }
    ]
  },
  fear_greed: {
    min: 0,
    max: 100,
    zones: [
      { from: 0, to: 25, role: "negative", label: "EXTREME FEAR" },
      { from: 25, to: 45, role: "negative", label: "FEAR" },
      { from: 45, to: 55, role: "warning", label: "NEUTRAL" },
      { from: 55, to: 75, role: "positive", label: "GREED" },
      { from: 75, to: 100, role: "positive", label: "EXTREME GREED" }
    ]
  },
  pe_ratio: {
    min: 0,
    max: 50,
    zones: [
      { from: 0, to: 15, role: "positive", label: "VALUE" },
      { from: 15, to: 25, role: "data", label: "FAIR" },
      { from: 25, to: 35, role: "warning", label: "GROWTH" },
      { from: 35, to: 50, role: "negative", label: "EXPENSIVE" }
    ]
  },
  short_interest: {
    min: 0,
    max: 100,
    zones: [
      { from: 0, to: 5, role: "data", label: "" },
      { from: 5, to: 15, role: "warning", label: "ELEVATED" },
      { from: 15, to: 30, role: "negative", label: "HIGH" },
      { from: 30, to: 100, role: "negative", label: "SQUEEZE RISK" }
    ]
  },
  volatility: {
    min: 0,
    max: 80,
    zones: [
      { from: 0, to: 15, role: "positive", label: "LOW" },
      { from: 15, to: 25, role: "data", label: "" },
      { from: 25, to: 35, role: "warning", label: "ELEVATED" },
      { from: 35, to: 80, role: "negative", label: "HIGH" }
    ]
  },
  vix: {
    min: 0,
    max: 80,
    zones: [
      { from: 0, to: 15, role: "positive", label: "CALM" },
      { from: 15, to: 25, role: "data", label: "" },
      { from: 25, to: 35, role: "warning", label: "ELEVATED" },
      { from: 35, to: 50, role: "negative", label: "FEAR" },
      { from: 50, to: 80, role: "negative", label: "EXTREME FEAR" }
    ]
  }
};
function gaugeBar(opts) {
  const {
    value,
    label,
    preset = "percent",
    width = 20,
    showValue = true,
    showLabel = true,
    valueFormat
  } = opts;
  if (value == null) return pc("muted", "\u2014");
  const config = PRESETS[preset] || PRESETS.percent;
  const min = opts.min ?? config.min;
  const max = opts.max ?? config.max;
  const zones = opts.zones ?? config.zones;
  const v = Number(value);
  const ratio = Math.max(0, Math.min(1, (v - min) / (max - min || 1)));
  const filled = Math.round(ratio * width);
  const zone = zones.find((z) => v >= z.from && v < z.to) || zones[zones.length - 1];
  const barColor = palette(zone.role);
  let bar = "";
  for (let i = 0; i < width; i++) {
    if (i < filled) {
      bar += c(barColor, BLOCK_FULL);
    } else {
      bar += pc("muted", BLOCK_EMPTY);
    }
  }
  const parts = [];
  if (label) {
    parts.push(pc("label", label));
  }
  parts.push(bar);
  if (showValue) {
    const formatted = valueFormat ? valueFormat.replace("{v}", v) : formatValue(v, preset);
    parts.push(c(barColor, formatted));
  }
  if (showLabel && zone.label) {
    parts.push(c(barColor, zone.label));
  }
  return parts.join("  ");
}
function gaugeStack(gauges, labelWidth) {
  const lw = labelWidth ?? Math.max(12, ...gauges.map((g) => (g.label || "").length));
  return gauges.map((g) => {
    const lbl = g.label ? padRight(pc("label", g.label), lw) : "";
    const bar = gaugeBar({ ...g, label: void 0 });
    return lbl + bar;
  }).join("\n");
}
function formatValue(v, preset) {
  switch (preset) {
    case "rsi":
      return v.toFixed(1);
    case "sentiment":
      return v >= 0 ? `+${v.toFixed(2)}` : v.toFixed(2);
    case "confidence":
      return `${Math.round(v)}%`;
    case "percent":
      return `${Math.round(v)}%`;
    case "macro":
      return `${v.toFixed(2)}%`;
    case "fear_greed":
      return `${Math.round(v)}`;
    case "pe_ratio":
      return `${v.toFixed(1)}x`;
    case "short_interest":
      return `${v.toFixed(1)}%`;
    case "volatility":
      return v.toFixed(1);
    case "vix":
      return v.toFixed(1);
    default:
      return v.toFixed(1);
  }
}

// src/components/WaterfallChart.js
var BLOCK = "\u2588";
function fmtVal(v) {
  const abs = Math.abs(v);
  if (abs >= 1e12) return `${(v / 1e12).toFixed(2)}T`;
  if (abs >= 1e9) return `${(v / 1e9).toFixed(1)}B`;
  if (abs >= 1e6) return `${(v / 1e6).toFixed(1)}M`;
  if (abs >= 1e3) return `${(v / 1e3).toFixed(1)}K`;
  return v.toFixed(1);
}
function deltaArrow(current, previous) {
  if (previous == null || previous === 0) return "";
  const pct = (current - previous) / Math.abs(previous) * 100;
  const sign = pct >= 0 ? "+" : "";
  const role = pct > 0 ? "positive" : pct < 0 ? "negative" : "muted";
  const arrow = pct > 0 ? "\u25B2" : pct < 0 ? "\u25BC" : "\u25A0";
  return pc(role, `${arrow}${sign}${pct.toFixed(1)}%`);
}
function waterfallChart(opts = {}) {
  const {
    items = [],
    width = 60,
    showDelta = true
  } = opts;
  if (!items.length) return pc("muted", "(no data)");
  const LABEL_W = 12;
  const VALUE_W = 9;
  const DELTA_W = showDelta ? 10 : 0;
  const barAreaW = Math.max(10, width - LABEL_W - 1 - VALUE_W - 1 - DELTA_W);
  const halfBar = Math.floor(barAreaW / 2);
  const maxAbs = Math.max(...items.map((it) => Math.abs(it.value)), 1);
  const lines = [];
  const axisCol = LABEL_W + 1 + halfBar;
  const headerLine = " ".repeat(LABEL_W + 1) + pc("muted", "\u2500".repeat(halfBar)) + pc("accent", "\u252C") + pc("muted", "\u2500".repeat(barAreaW - halfBar - 1));
  lines.push(headerLine);
  for (const item of items) {
    const { label, value, previous } = item;
    const ratio = Math.min(1, Math.abs(value) / maxAbs);
    const barLen = Math.round(ratio * halfBar);
    const role = value >= 0 ? "positive" : "negative";
    const barColor = palette(role);
    let leftPad = "";
    let bar = "";
    let rightPad = "";
    if (value >= 0) {
      leftPad = " ".repeat(halfBar);
      bar = c(barColor, BLOCK.repeat(barLen));
      rightPad = " ".repeat(Math.max(0, halfBar - barLen));
    } else {
      const spaces = halfBar - barLen;
      leftPad = " ".repeat(spaces);
      bar = c(barColor, BLOCK.repeat(barLen));
      rightPad = " ".repeat(halfBar);
    }
    const axis = pc("accent", "\u2502");
    let barRow;
    if (value >= 0) {
      barRow = leftPad + axis + bar + rightPad;
    } else {
      barRow = leftPad + bar + axis + rightPad;
    }
    const barRowVis = visLen(barRow);
    const barRowPadded = barRowVis < barAreaW ? barRow + " ".repeat(barAreaW - barRowVis) : barRow;
    const valStr = padLeft(pc(role, fmtVal(value)), VALUE_W);
    let deltaStr = "";
    if (showDelta) {
      const d = deltaArrow(value, previous);
      deltaStr = d ? " " + padRight(d, DELTA_W - 1) : " " + " ".repeat(DELTA_W - 1);
    }
    const labelStr = padRight(pc("label", label), LABEL_W);
    lines.push(labelStr + " " + barRowPadded + " " + valStr + deltaStr);
  }
  return lines.join("\n");
}

// src/components/TreeMap.js
var BLOCKS = ["\u2588", "\u2593", "\u2592", "\u2591"];
function cellStyle(value, customColor) {
  if (customColor) return { color: customColor, block: BLOCKS[0] };
  if (value == null) return { color: palette("muted"), block: BLOCKS[3] };
  const v = Number(value);
  if (v > 3) return { color: palette("positive"), block: BLOCKS[0] };
  if (v > 0) return { color: palette("positive"), block: BLOCKS[1] };
  if (v === 0) return { color: palette("muted"), block: BLOCKS[2] };
  if (v > -3) return { color: palette("negative"), block: BLOCKS[1] };
  return { color: palette("negative"), block: BLOCKS[0] };
}
function layoutRows(items, width, height) {
  const totalWeight = items.reduce((s, it) => s + it.weight, 0) || 1;
  const rows = [];
  let remaining = [...items];
  let usedRows = 0;
  const totalRows = height;
  while (remaining.length > 0 && usedRows < totalRows) {
    const rowsLeft = totalRows - usedRows;
    let bestCount = 1;
    let bestScore = Infinity;
    for (let n = 1; n <= remaining.length; n++) {
      const rowItems2 = remaining.slice(0, n);
      const rowWeight2 = rowItems2.reduce((s, it) => s + it.weight, 0);
      const rowFrac2 = rowWeight2 / totalWeight;
      const rowH2 = Math.max(1, Math.round(rowFrac2 * totalRows));
      let score = 0;
      for (const it of rowItems2) {
        const itFrac = it.weight / rowWeight2;
        const cols = Math.max(1, Math.round(itFrac * width));
        const aspect = rowH2 > 0 ? cols / rowH2 : cols;
        score += Math.abs(aspect - 1);
      }
      score /= n;
      if (score < bestScore) {
        bestScore = score;
        bestCount = n;
      } else {
        break;
      }
    }
    const rowItems = remaining.slice(0, bestCount);
    const rowWeight = rowItems.reduce((s, it) => s + it.weight, 0);
    const rowFrac = rowWeight / totalWeight;
    const rowH = usedRows + Math.max(1, Math.round(rowFrac * totalRows)) > totalRows ? totalRows - usedRows : Math.max(1, Math.round(rowFrac * totalRows));
    let assignedCols = 0;
    const rowCells = rowItems.map((item, idx) => {
      const isLast = idx === rowItems.length - 1;
      const itFrac = rowWeight > 0 ? item.weight / rowWeight : 1 / rowItems.length;
      const cols = isLast ? width - assignedCols : Math.max(1, Math.round(itFrac * width));
      assignedCols += cols;
      return { item, cols };
    });
    const totalCols = rowCells.reduce((s, c2) => s + c2.cols, 0);
    if (totalCols !== width && rowCells.length > 0) {
      rowCells[rowCells.length - 1].cols += width - totalCols;
    }
    rows.push({ cells: rowCells, rowH });
    usedRows += rowH;
    remaining = remaining.slice(bestCount);
  }
  return rows;
}
function renderCell(item, cols, rowH) {
  const { label = "", value, color: customColor } = item;
  const { color, block } = cellStyle(value, customColor);
  const fillLine = block.repeat(cols);
  const lines = [];
  for (let r = 0; r < rowH; r++) {
    const isLabelRow = rowH === 1 ? true : r === Math.floor(rowH / 2);
    const isValueRow = rowH > 2 && r === Math.floor(rowH / 2) + 1;
    if (isLabelRow && cols >= 3) {
      const maxLabelLen = cols - 2;
      let lbl = label.length > maxLabelLen ? label.slice(0, maxLabelLen) : label;
      const padTotal = cols - lbl.length;
      const padL = Math.floor(padTotal / 2);
      const padR = padTotal - padL;
      const line = c(color, block.repeat(padL)) + c(color, BOLD) + c(color, lbl) + RESET + c(color, block.repeat(padR));
      lines.push(line);
    } else if (isValueRow && value != null && cols >= 5) {
      const v = Number(value);
      const valStr = v >= 0 ? `+${v.toFixed(1)}%` : `${v.toFixed(1)}%`;
      const maxLen = cols - 2;
      const display = valStr.length > maxLen ? valStr.slice(0, maxLen) : valStr;
      const padTotal = cols - display.length;
      const padL = Math.floor(padTotal / 2);
      const padR = padTotal - padL;
      lines.push(
        c(color, block.repeat(padL)) + c(color, display) + c(color, block.repeat(padR))
      );
    } else {
      lines.push(c(color, fillLine));
    }
  }
  return lines;
}
function treeMap(opts = {}) {
  const {
    items = [],
    width = 60,
    height = 10
  } = opts;
  if (!items.length) return pc("muted", "(no data)");
  const validItems = items.map((it) => ({ ...it, weight: Math.max(0, Number(it.weight) || 0) })).filter((it) => it.weight > 0);
  if (!validItems.length) return pc("muted", "(no data)");
  const rows = layoutRows(validItems, width, height);
  const outputLines = [];
  for (const { cells, rowH } of rows) {
    const cellLines = cells.map(({ item, cols }) => renderCell(item, cols, rowH));
    for (let r = 0; r < rowH; r++) {
      let line = "";
      for (let ci = 0; ci < cellLines.length; ci++) {
        line += cellLines[ci][r] || "";
      }
      outputLines.push(line);
    }
  }
  while (outputLines.length < height) {
    outputLines.push(pc("muted", " ".repeat(width)));
  }
  return outputLines.slice(0, height).join("\n");
}

// src/components/InsiderTimeline.js
var BUY_MARKER = "\u25B2";
var SELL_MARKER = "\u25BC";
var LINE_CHAR = "\u2500";
function fmtAmount(v) {
  if (v == null) return "\u2014";
  v = Number(v);
  if (v >= 1e9) return `$${(v / 1e9).toFixed(1)}B`;
  if (v >= 1e6) return `$${(v / 1e6).toFixed(1)}M`;
  if (v >= 1e3) return `$${(v / 1e3).toFixed(0)}K`;
  return `$${v.toFixed(0)}`;
}
function insiderTimeline(opts = {}) {
  const {
    transactions = [],
    width = 80
  } = opts;
  if (!transactions.length) {
    return pc("muted", "No insider transactions");
  }
  const lines = [];
  const dateW = 9;
  const typeW = 8;
  const sharesW = 10;
  const amtW = 10;
  const nameW = Math.max(10, width - dateW - typeW - sharesW - amtW);
  const hDate = padRight(pc("label", "DATE"), dateW);
  const hType = padRight(pc("label", "TYPE"), typeW);
  const hName = padRight(pc("label", "INSIDER"), nameW);
  const hShares = padLeft(pc("label", "SHARES"), sharesW);
  const hAmt = padLeft(pc("label", "AMOUNT"), amtW);
  lines.push(`${hDate}${hType}${hName}${hShares}${hAmt}`);
  lines.push(pc("muted", LINE_CHAR.repeat(Math.min(width, dateW + typeW + nameW + sharesW + amtW))));
  for (const tx of transactions) {
    const txType = String(tx.type).toLowerCase();
    const isBuy = txType === "buy";
    const isNeutral = ["grant", "transfer", "exercise", "award", "gift"].includes(txType);
    const marker = isBuy ? BUY_MARKER : isNeutral ? "\u25C6" : SELL_MARKER;
    const typeRole = isBuy ? "positive" : isNeutral ? "muted" : "negative";
    const typeStr = isBuy ? "BUY" : isNeutral ? txType.toUpperCase().slice(0, 5) : "SELL";
    const date = padRight(pc("muted", fmtDate(tx.date)), dateW);
    const type = padRight(c(palette(typeRole), `${marker} ${typeStr}`), typeW);
    const name = padRight(pc("data", String(tx.name || "\u2014")), nameW);
    const shares = padLeft(pc("data", fmtVol(tx.shares)), sharesW);
    const amount = padLeft(c(palette(typeRole), fmtAmount(tx.amount ?? tx.value)), amtW);
    lines.push(`${date}${type}${name}${shares}${amount}`);
  }
  return lines.join("\n");
}

// src/components/HolderBar.js
var BLOCK_FULL2 = "\u2588";
var BLOCK_LIGHT = "\u2591";
var BAR_ROLES = ["accent", "positive", "warning", "highlight", "chartHigh"];
function holderBar(opts = {}) {
  const {
    holders = [],
    width = 80,
    limit = 5
  } = opts;
  if (!holders.length) {
    return pc("muted", "No holder data");
  }
  const visible = holders.slice(0, limit);
  const lines = [];
  const pctW = 7;
  const sharesW = 9;
  const barW = Math.max(4, width - pctW - sharesW - 4);
  const nameW = Math.min(20, Math.floor(barW * 0.35));
  const fillW = barW - nameW - 1;
  const hName = padRight(pc("label", "HOLDER"), nameW);
  const hBar = padRight(pc("label", ""), fillW);
  const hPct = padLeft(pc("label", "%OWN"), pctW);
  const hShares = padLeft(pc("label", "SHARES"), sharesW);
  lines.push(`${hName} ${hBar} ${hPct} ${hShares}`);
  lines.push(pc("muted", "\u2500".repeat(Math.min(width, nameW + fillW + pctW + sharesW + 3))));
  const largest = Math.max(...visible.map((h) => Number(h.percent) || 0), 1);
  const maxPct = Math.max(100, largest);
  for (let i = 0; i < visible.length; i++) {
    const h = visible[i];
    const pct = Number(h.percent) || 0;
    const role = BAR_ROLES[i % BAR_ROLES.length];
    const color = palette(role);
    const filled = Math.max(1, Math.round(pct / maxPct * fillW));
    const empty = fillW - filled;
    const name = padRight(pc("data", String(h.name || "\u2014")), nameW);
    const bar = c(color, BLOCK_FULL2.repeat(filled)) + pc("muted", BLOCK_LIGHT.repeat(empty));
    const pctStr = padLeft(c(color, fmtPct(pct, false)), pctW);
    const shares = padLeft(pc("muted", fmtVol(h.shares)), sharesW);
    lines.push(`${name} ${bar} ${pctStr} ${shares}`);
  }
  return lines.join("\n");
}

// src/components/MacroDashboard.js
function directionArrow(direction) {
  return trendArrow(direction);
}
function pillarColorRole(value) {
  if (value == null) return "muted";
  const v = Number(value);
  if (v >= 70) return "negative";
  if (v >= 40) return "warning";
  return "positive";
}
function renderPillar(pillar, labelWidth, gaugeWidth, totalWidth, valueColWidth) {
  const { label = "", value, direction = "neutral", indicators = [], stateLabel } = pillar;
  const colorRole = pillarColorRole(value);
  const colorHex = palette(colorRole);
  const labelStr = padRight(pc("label", label), labelWidth);
  const bar = gaugeBar({
    value: value ?? 0,
    preset: "percent",
    width: gaugeWidth,
    showValue: false,
    showLabel: false
  });
  const vColW = valueColWidth || 4;
  const valStr = stateLabel ? padLeft(c(colorHex || palette("data"), stateLabel), vColW) : value != null ? padLeft(c(colorHex || palette("data"), `${Math.round(value)}`), vColW) : padLeft(pc("muted", "\u2014"), vColW);
  const arrow = directionArrow(direction);
  const mainRow = labelStr + " " + bar + valStr + " " + arrow;
  const lines = [mainRow];
  if (indicators && indicators.length > 0) {
    const indent = " ".repeat(labelWidth + 1);
    const parts = indicators.map((ind) => {
      const indName = pc("muted", ind.name);
      const indVal = ind.value != null ? pc("data", String(ind.value)) : pc("muted", "\u2014");
      const indArrow = ind.direction ? " " + directionArrow(ind.direction) : "";
      return `${indName}:${indVal}${indArrow}`;
    });
    const subRow = indent + parts.join(pc("muted", "  "));
    lines.push(subRow);
  }
  return lines;
}
function renderPlainMacro(pillars, width, title) {
  if (!pillars || pillars.length === 0) {
    return pc("muted", "(no macro data)");
  }
  const lines = [];
  const BAR_W = 12;
  const maxLabelLen = Math.max(8, ...pillars.map((p) => (p.label || "").length));
  const labelW = Math.min(maxLabelLen, Math.floor(width * 0.3));
  const maxStateLen = Math.max(4, ...pillars.map((p) => (p.stateLabel || "\u2014").length));
  const stateW = maxStateLen + 1;
  for (const p of pillars) {
    const label = padRight(pc("label", p.label || ""), labelW);
    const val = Math.max(0, Math.min(100, p.value ?? 50));
    const colorRole = pillarColorRole(val);
    const barColor = palette(colorRole);
    const bar = gaugeBar({
      value: val,
      preset: "percent",
      width: BAR_W,
      showValue: false,
      showLabel: false
    });
    const state = p.stateLabel || "\u2014";
    const dir = p.direction || "";
    const arrow = directionArrow(dir);
    const stateStr = padRight(c(barColor, state), stateW);
    lines.push(`${label}${bar}  ${stateStr}${arrow}`);
  }
  return lines.join("\n");
}
function macroDashboard(opts = {}) {
  const {
    pillars = [],
    width = 80,
    title = "MACRO REGIME",
    variant
  } = opts;
  if (variant === "plain") return renderPlainMacro(pillars, width, title);
  if (!pillars || pillars.length === 0) {
    return pc("muted", "(no macro data)");
  }
  const LABEL_WIDTH = Math.min(
    Math.max(12, ...pillars.map((p) => (p.label || "").length)),
    Math.floor(width * 0.3)
  );
  const ARROW_WIDTH = 2;
  const innerWidth = width - 4;
  const maxLabel = pillars.reduce((max, p) => Math.max(max, (p.stateLabel || "").length), 0);
  const VALUE_WIDTH = Math.max(4, maxLabel + 1);
  const gaugeWidth = Math.max(4, innerWidth - LABEL_WIDTH - 1 - VALUE_WIDTH - 1 - ARROW_WIDTH);
  const ac = palette("accent");
  const lines = [];
  const titleStr = title ? ` ${title} ` : "";
  const topFill = width - 3 - titleStr.length;
  const topLine = c(ac, "\u256D\u2500") + c(ac, titleStr) + c(ac, "\u2500".repeat(Math.max(0, topFill)) + "\u256E");
  lines.push(topLine);
  pillars.forEach((pillar, i) => {
    const pillarLines = renderPillar(pillar, LABEL_WIDTH, gaugeWidth, innerWidth, VALUE_WIDTH);
    pillarLines.forEach((row) => {
      const vl = visLen(row);
      const pad = Math.max(0, innerWidth - vl);
      lines.push(c(ac, "\u2502") + " " + row + " ".repeat(pad) + " " + c(ac, "\u2502"));
    });
    if (i < pillars.length - 1) {
      lines.push(c(ac, "\u251C" + "\u2500".repeat(width - 2) + "\u2524"));
    }
  });
  lines.push(c(ac, "\u2570" + "\u2500".repeat(width - 2) + "\u256F"));
  return lines.join("\n");
}

// src/components/CorrelationMatrix.js
function lerpHex(hexA, hexB, t) {
  const parse = (h) => {
    const s = h.replace("#", "");
    return [parseInt(s.slice(0, 2), 16), parseInt(s.slice(2, 4), 16), parseInt(s.slice(4, 6), 16)];
  };
  const [ar, ag, ab] = parse(hexA);
  const [br, bg_, bb] = parse(hexB);
  const r = Math.round(ar + (br - ar) * t);
  const g = Math.round(ag + (bg_ - ag) * t);
  const b = Math.round(ab + (bb - ab) * t);
  return [r, g, b];
}
function corrColor(value) {
  const v = Math.max(-1, Math.min(1, Number(value)));
  const darken2 = (hex, factor = 0.35) => {
    const s = hex.replace("#", "");
    const r = Math.round(parseInt(s.slice(0, 2), 16) * factor);
    const g = Math.round(parseInt(s.slice(2, 4), 16) * factor);
    const b = Math.round(parseInt(s.slice(4, 6), 16) * factor);
    return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
  };
  const NEG_STRONG = darken2(palette("negative"));
  const POS_STRONG = darken2(palette("positive"));
  const NEUTRAL = darken2(palette("muted"), 0.3);
  const NEG_TEXT = palette("negative");
  const POS_TEXT = palette("positive");
  const NEU_TEXT = palette("muted");
  let bgRgb, textHex;
  if (v < 0) {
    const t = Math.abs(v);
    bgRgb = lerpHex(NEUTRAL, NEG_STRONG, t);
    textHex = v <= -0.3 ? NEG_TEXT : NEU_TEXT;
  } else if (v > 0) {
    const t = v;
    bgRgb = lerpHex(NEUTRAL, POS_STRONG, t);
    textHex = v >= 0.3 ? POS_TEXT : NEU_TEXT;
  } else {
    bgRgb = lerpHex(NEUTRAL, NEUTRAL, 0);
    textHex = NEU_TEXT;
  }
  const bgCode = `\x1B[48;2;${bgRgb[0]};${bgRgb[1]};${bgRgb[2]}m`;
  const fgCode = fg(textHex);
  return { bgCode, fgCode };
}
function fmtCorr(v) {
  if (v == null) return " \u2014   ";
  const n = Number(v);
  if (Math.abs(n - 1) < 1e-4) return " 1.00";
  const s = n >= 0 ? `+${n.toFixed(2)}` : n.toFixed(2);
  return s.padStart(5);
}
function correlationMatrix(opts = {}) {
  const {
    tickers = [],
    matrix = [],
    width = 80,
    title = "CORRELATION MATRIX"
  } = opts;
  if (!tickers || tickers.length === 0) {
    return pc("muted", "(no correlation data)");
  }
  const n = tickers.length;
  const ac = palette("accent");
  const CELL_W = 6;
  const maxTickerLen = Math.max(...tickers.map((t) => t.length), 4);
  const LABEL_W = maxTickerLen + 1;
  const lines = [];
  const titleStr = title ? ` ${title} ` : "";
  const rowWidth = LABEL_W + n * CELL_W + 1;
  const topFill = Math.max(0, rowWidth - 2 - titleStr.length);
  lines.push(c(ac, "\u256D\u2500") + c(ac, titleStr) + c(ac, "\u2500".repeat(topFill) + "\u256E"));
  const headerLabel = " ".repeat(LABEL_W);
  const headerCols = tickers.map((t) => padCenter(pc("label", t), CELL_W)).join("");
  const headerContent = headerLabel + headerCols;
  const headerPad = Math.max(0, rowWidth - 2 - visLen(headerContent));
  lines.push(
    c(ac, "\u2502") + " " + headerContent + " ".repeat(headerPad) + c(ac, "\u2502")
  );
  lines.push(c(ac, "\u251C" + "\u2500".repeat(rowWidth - 2) + "\u2524"));
  for (let r = 0; r < n; r++) {
    const rowTicker = padRight(pc("label", tickers[r]), LABEL_W);
    let rowCells = "";
    for (let col = 0; col < n; col++) {
      const val = matrix[r] && matrix[r][col] != null ? matrix[r][col] : null;
      const valueStr = fmtCorr(val);
      if (val == null) {
        rowCells += " " + pc("muted", valueStr);
      } else {
        const { bgCode, fgCode } = corrColor(val);
        rowCells += " " + bgCode + fgCode + valueStr + RESET;
      }
    }
    const rowContent = rowTicker + rowCells + " ";
    const rowVl = visLen(rowContent);
    const rowPad = Math.max(0, rowWidth - 2 - rowVl);
    lines.push(c(ac, "\u2502") + " " + rowContent + " ".repeat(rowPad) + c(ac, "\u2502"));
  }
  lines.push(c(ac, "\u2570" + "\u2500".repeat(rowWidth - 2) + "\u256F"));
  return lines.join("\n");
}

// src/components/EarningsSurprise.js
var DOT_BEAT = "\u25CF";
var CONNECTOR = "\u2504";
function fmtEps(v) {
  if (v == null) return "\u2014";
  v = Number(v);
  return `$${v.toFixed(2)}`;
}
function earningsSurprise(opts = {}) {
  const {
    quarters = [],
    width = 60,
    showConnector = true
  } = opts;
  if (!quarters.length) {
    return pc("muted", "No earnings data");
  }
  const lines = [];
  const dateW = 7;
  const dotW = 1;
  const epsW = 18;
  const pctW = 7;
  for (let i = 0; i < quarters.length; i++) {
    const q = quarters[i];
    const isForward = q.actual == null && q.estimate != null;
    const hasSurprise = q.surprise != null && q.surprise !== 0;
    const dateStr = padRight(pc("label", String(q.date || q.period || "\u2014")), dateW);
    if (isForward) {
      const estStr = fmtEps(q.estimate);
      const dot = pc("muted", "\u25CB");
      const epsStr = padRight(pc("data", estStr) + pc("muted", " est"), epsW);
      const yoy = q.yearAgoEps != null ? (() => {
        const yoyPct = (q.estimate / q.yearAgoEps - 1) * 100;
        const yoyRole = yoyPct >= 0 ? "positive" : "negative";
        const yoySign = yoyPct >= 0 ? "+" : "";
        return padLeft(c(palette(yoyRole), `${yoySign}${yoyPct.toFixed(0)}% YoY`), pctW + 3);
      })() : padLeft(pc("muted", ""), pctW);
      const label = pc("label", "EST");
      lines.push(`${dateStr}${dot}  ${epsStr} ${yoy}  ${label}`);
    } else if (!hasSurprise) {
      const actualStr = fmtEps(q.actual);
      const dot = pc("data", DOT_BEAT);
      const epsStr = padRight(pc("data", actualStr), epsW);
      let connector = "";
      if (showConnector && i < quarters.length - 1) {
        connector = pc("muted", `  ${CONNECTOR}`);
      }
      lines.push(`${dateStr}${dot}  ${epsStr}${connector}`);
    } else {
      const isBeat = q.surprise >= 0;
      const color = isBeat ? palette("positive") : palette("negative");
      const dot = c(color, DOT_BEAT);
      const actualStr = fmtEps(q.actual);
      const estStr = fmtEps(q.estimate);
      const epsStr = padRight(pc("data", actualStr) + pc("muted", " vs ") + pc("data", estStr), epsW);
      const sign = q.surprise >= 0 ? "+" : "";
      const pctVal = `${sign}${Number(q.surprise).toFixed(1)}%`;
      const pctStr = padLeft(c(color, pctVal), pctW);
      const label = c(color, isBeat ? "BEAT" : "MISS");
      let connector = "";
      if (showConnector && i < quarters.length - 1) {
        connector = pc("muted", `  ${CONNECTOR}`);
      }
      lines.push(`${dateStr}${dot}  ${epsStr}  ${pctStr}  ${label}${connector}`);
    }
  }
  return lines.map((l) => {
    const vl = visLen(l);
    if (vl > width) return ansiTrunc(l, width);
    if (vl < width) return l + " ".repeat(width - vl);
    return l;
  }).join("\n");
}

// src/components/FlowSankey.js
var H = "\u2500";
var V = "\u2502";
var BL = "\u2570";
var TEE_R = "\u251C";
var ARR = "\u25BA";
function fmtFlowVal(v) {
  if (v == null) return "\u2014";
  v = Number(v);
  if (Math.abs(v) >= 1e9) return `$${(v / 1e9).toFixed(1)}B`;
  if (Math.abs(v) >= 1e6) return `$${(v / 1e6).toFixed(1)}M`;
  if (Math.abs(v) >= 1e3) return `$${(v / 1e3).toFixed(1)}K`;
  return `$${v.toLocaleString("en-US")}`;
}
function nodeColor(idx, value, total) {
  if (idx === 0) return palette("accent");
  const v = Number(value);
  if (v < 0) return palette("negative");
  if (total && v < total * 0.5) return palette("warning");
  return palette("positive");
}
function flowSankey(opts) {
  const {
    nodes = [],
    flows = [],
    width = 80
  } = opts;
  if (!nodes.length) {
    return pc("muted", "No flow data.");
  }
  if (nodes.length === 1) {
    const n = nodes[0];
    const color = palette("accent");
    const label = c(color, BOLD + String(n.label));
    const val = c(color, fmtFlowVal(n.value));
    return label + "  " + val;
  }
  const lines = [];
  const sourceNode = nodes[0];
  const sourceVal = Number(sourceNode.value) || 1;
  const targetNodes = nodes.slice(1);
  const maxLabelLen = Math.max(...nodes.map((n) => String(n.label).length));
  const maxValLen = Math.max(...nodes.map((n) => fmtFlowVal(n.value).length));
  const barAreaWidth = Math.max(10, width - maxLabelLen - maxValLen - 8);
  const sourceBarW = barAreaWidth;
  const sourceColor = palette("accent");
  const sourceLabel = padRight(c(sourceColor, BOLD + String(sourceNode.label)), maxLabelLen + 3);
  const sourceBar = c(sourceColor, H.repeat(sourceBarW));
  const sourceValStr = c(sourceColor, fmtFlowVal(sourceNode.value));
  lines.push(sourceLabel + sourceBar + "  " + sourceValStr);
  targetNodes.forEach((node, i) => {
    const isLast = i === targetNodes.length - 1;
    const tColor = nodeColor(i + 1, node.value, sourceVal);
    const ratio = Math.abs(Number(node.value)) / Math.abs(sourceVal);
    const targetBarW = Math.max(2, Math.round(barAreaWidth * Math.min(ratio, 1)));
    const nodeLabel = padRight(c(tColor, String(node.label)), maxLabelLen + 3);
    const connector = c(sourceColor, isLast ? BL : TEE_R) + c(tColor, H.repeat(3) + ARR + " ");
    const bar = c(tColor, H.repeat(Math.max(0, targetBarW - 2)));
    const nodeValStr = c(tColor, fmtFlowVal(node.value));
    const indent = " ".repeat(maxLabelLen + 3);
    lines.push(indent + connector + nodeLabel + bar + "  " + nodeValStr);
    if (!isLast) {
      const vLine = c(sourceColor, V);
      lines.push(" ".repeat(maxLabelLen + 3) + vLine);
    }
  });
  return lines.join("\n");
}

// src/components/NewsStream.js
function relTime(time) {
  if (!time) return "";
  let t;
  if (typeof time === "number") {
    t = new Date(time * 1e3);
  } else {
    t = new Date(time);
  }
  if (isNaN(t.getTime())) return "";
  const diffMs = Date.now() - t.getTime();
  if (isNaN(diffMs)) return "";
  const diffSec = Math.floor(diffMs / 1e3);
  const diffMin = Math.floor(diffSec / 60);
  const diffH = Math.floor(diffMin / 60);
  const diffD = Math.floor(diffH / 24);
  if (diffSec < 60) return "now";
  if (diffMin < 60) return `${diffMin}m`;
  if (diffH < 24) return `${diffH}h`;
  if (diffD < 7) return `${diffD}d`;
  return `${Math.floor(diffD / 7)}w`;
}
function newsStream(opts = {}) {
  const {
    items = [],
    width = 80,
    limit = 10
  } = opts;
  if (!items.length) {
    return pc("muted", "No news items.");
  }
  const displayed = items.slice(0, limit);
  const bullet = pc("accent", "\xB7");
  const lines = displayed.map((item) => {
    const source = item.source ? String(item.source) : "";
    const timeStr = relTime(item.time);
    const rightParts = [];
    if (source) rightParts.push(pc("label", source));
    if (timeStr) rightParts.push(pc("muted", timeStr));
    const right = rightParts.join(" ");
    const rightVis = visLen(right);
    const leftBudget = Math.max(8, width - 1 - 1 - 1 - rightVis);
    const headline = String(item.headline || item.title || "");
    const url = item.url || null;
    let headlineText;
    if (strip(headline).length > leftBudget) {
      headlineText = headline.slice(0, leftBudget - 1) + "\u2026";
    } else {
      headlineText = headline;
    }
    let headlineStr;
    if (url) {
      headlineStr = `\x1B]8;;${url}\x07${pc("data", headlineText)}\x1B]8;;\x07`;
    } else {
      headlineStr = pc("data", headlineText);
    }
    const headlineVis = visLen(headlineStr);
    const pad = Math.max(0, leftBudget - headlineVis);
    const paddedHeadline = headlineStr + " ".repeat(pad);
    return bullet + " " + paddedHeadline + " " + right;
  });
  return lines.join("\n");
}

// src/components/Verdict.js
function renderSectionBoxed(section, width) {
  const lines = [];
  switch (section.type) {
    case "conviction":
      break;
    case "memory": {
      const { prior, changed } = section;
      const note = changed ? " \xB7 conviction changed" : " \u2014 conviction held";
      lines.push(boxRow(`${DIM}\u2504 ${prior || ""}${note}${RESET}`, width));
      break;
    }
    case "thesis": {
      const { text } = section;
      if (!text) break;
      lines.push(boxEmpty(width));
      const innerW = width - 4;
      for (const tl of wordWrap(text, innerW)) {
        lines.push(boxRow(c(palette("data"), BOLD + renderMarkdownInline(tl) + RESET), width));
      }
      break;
    }
    case "catalysts": {
      const { items } = section;
      if (!Array.isArray(items) || items.length === 0) break;
      lines.push(boxEmpty(width));
      lines.push(boxDivider(width, "CATALYSTS"));
      for (const catalyst of items) {
        for (const [index, text] of wordWrap(String(catalyst), width - 6).entries()) {
          lines.push(boxRow(pc("positive", `${index ? "  " : "\u2726 "}${renderMarkdownInline(text)}`), width));
        }
      }
      break;
    }
    case "risks": {
      const { items } = section;
      if (!Array.isArray(items) || items.length === 0) break;
      lines.push(boxEmpty(width));
      lines.push(boxDivider(width, "RISK FACTORS"));
      for (const risk of items) {
        for (const [index, text] of wordWrap(String(risk), width - 6).entries()) {
          lines.push(boxRow(pc("warning", `${index ? "  " : "\u26A0 "}${renderMarkdownInline(text)}`), width));
        }
      }
      break;
    }
    case "bull_case":
    case "bear_case": {
      const { items } = section;
      if (!Array.isArray(items) || items.length === 0) break;
      const bull = section.type === "bull_case";
      lines.push(boxEmpty(width));
      lines.push(boxDivider(width, bull ? "BULL CASE" : "BEAR CASE"));
      for (const item of items) {
        for (const [index, text] of wordWrap(String(item), width - 6).entries()) {
          lines.push(boxRow(pc(bull ? "positive" : "negative", `${index ? "  " : bull ? "+ " : "\u2212 "}${renderMarkdownInline(text)}`), width));
        }
      }
      break;
    }
    case "facts":
    case "interpretation": {
      const { items } = section;
      if (!Array.isArray(items) || items.length === 0) break;
      lines.push(boxEmpty(width));
      lines.push(boxDivider(width, section.type === "facts" ? "FACTS" : "INTERPRETATION"));
      const innerW = width - 6;
      for (const item of items) {
        for (const [index, text] of wordWrap(String(item), innerW).entries()) {
          lines.push(boxRow(pc("data", `${index ? "  " : "\u2022 "}${renderMarkdownInline(text)}`), width));
        }
      }
      break;
    }
    case "levels": {
      const { support, resistance, timeframe } = section;
      const hasLevels = support != null || resistance != null;
      if (!hasLevels && !timeframe) break;
      lines.push(boxEmpty(width));
      lines.push(boxDivider(width, "KEY LEVELS"));
      if (timeframe) {
        const tfVal = c(palette("highlight"), String(timeframe));
        lines.push(boxRow(pc("label", "Timeframe:  ") + tfVal, width));
      }
      if (support != null) {
        const val = c(palette("highlight"), String(support));
        lines.push(boxRow(pc("label", "Support:    ") + val, width));
      }
      if (resistance != null) {
        const val = c(palette("highlight"), String(resistance));
        lines.push(boxRow(pc("label", "Resistance: ") + val, width));
      }
      break;
    }
    case "context": {
      const { text } = section;
      if (!text) break;
      lines.push(boxEmpty(width));
      lines.push(boxDivider(width, "CONTEXT"));
      const innerW = width - 4;
      for (const tl of wordWrap(text, innerW)) {
        lines.push(boxRow(pc("muted", renderMarkdownInline(tl)), width));
      }
      break;
    }
    case "comparison": {
      const { text } = section;
      if (!text) break;
      lines.push(boxEmpty(width));
      lines.push(boxDivider(width, "COMPARISON"));
      const innerW = width - 4;
      for (const tl of wordWrap(text, innerW)) {
        lines.push(boxRow(pc("data", renderMarkdownInline(tl)), width));
      }
      break;
    }
    case "invalidation": {
      const { text } = section;
      if (!text) break;
      lines.push(boxEmpty(width));
      lines.push(boxDivider(width, "INVALIDATION"));
      const innerW = width - 4;
      for (const tl of wordWrap(text, innerW)) {
        lines.push(boxRow(`${DIM}${pc("data", renderMarkdownInline(tl))}${RESET}`, width));
      }
      break;
    }
    default:
      break;
  }
  return lines;
}
function verdict(opts) {
  const {
    sections,
    thesis,
    conviction,
    signal,
    catalysts = [],
    levels = {},
    timeframe,
    risks = [],
    warnings = [],
    width = 60
  } = opts;
  const lines = [];
  if (Array.isArray(sections)) {
    const convictionSection = sections.find((s) => s.type === "conviction");
    const badge2 = convictionSection ? convictionBadge(convictionSection.value) : "";
    const headerTitle2 = badge2 ? `VERDICT \u2500\u2500 ${badge2}` : "VERDICT";
    lines.push(boxTop(width, headerTitle2, 2));
    for (const section of sections) {
      if (section.type === "conviction") continue;
      const sectionLines = renderSectionBoxed(section, width);
      for (const l of sectionLines) lines.push(l);
    }
    if (warnings.length > 0) {
      lines.push(boxEmpty(width));
      for (const warnMsg of warnings) {
        lines.push(boxRow(pc("warning", warnMsg), width));
      }
    }
    lines.push(boxEmpty(width));
    lines.push(boxBot(width, "", 2));
    return lines.join("\n");
  }
  const badge = conviction ? convictionBadge(conviction) : "";
  const headerTitle = badge ? `VERDICT \u2500\u2500 ${badge}` : "VERDICT";
  lines.push(boxTop(width, headerTitle, 2));
  if (thesis) {
    lines.push(boxEmpty(width));
    const innerW = width - 4;
    for (const tl of wordWrap(thesis, innerW)) {
      lines.push(boxRow(c(palette("data"), BOLD + renderMarkdownInline(tl) + RESET), width));
    }
  }
  if (!conviction && signal) {
    lines.push(boxEmpty(width));
    lines.push(boxDivider(width, "SIGNAL"));
    const sigStr = pc("label", "Recommendation: ") + coloredSignal(signal);
    lines.push(boxRow(sigStr, width));
  }
  if (catalysts.length > 0) {
    lines.push(boxEmpty(width));
    lines.push(boxDivider(width, "CATALYSTS"));
    for (const catalyst of catalysts) {
      const catalystLine = pc("positive", "\u2726 ") + pc("data", String(catalyst));
      lines.push(boxRow(catalystLine, width));
    }
  }
  const hasLevels = levels.support != null || levels.resistance != null;
  if (hasLevels || timeframe) {
    lines.push(boxEmpty(width));
    lines.push(boxDivider(width, "KEY LEVELS"));
    if (timeframe) {
      const tfVal = c(palette("highlight"), String(timeframe));
      lines.push(boxRow(pc("label", "Timeframe:  ") + tfVal, width));
    }
    if (levels.support != null) {
      const val = c(palette("highlight"), String(levels.support));
      lines.push(boxRow(pc("label", "Support:    ") + val, width));
    }
    if (levels.resistance != null) {
      const val = c(palette("highlight"), String(levels.resistance));
      lines.push(boxRow(pc("label", "Resistance: ") + val, width));
    }
  }
  if (risks.length > 0) {
    lines.push(boxEmpty(width));
    lines.push(boxDivider(width, "RISK FACTORS"));
    for (const risk of risks) {
      const riskLine = pc("warning", "\u26A0 ") + pc("data", String(risk));
      lines.push(boxRow(riskLine, width));
    }
  }
  if (warnings.length > 0) {
    lines.push(boxEmpty(width));
    for (const warnMsg of warnings) {
      lines.push(boxRow(pc("warning", warnMsg), width));
    }
  }
  lines.push(boxEmpty(width));
  lines.push(boxBot(width, "", 2));
  return lines.join("\n");
}

// src/components/QuoteHeader.js
var SPARK = "\u2581\u2582\u2583\u2584\u2585\u2586\u2587\u2588";
function quoteHeader(opts = {}) {
  const {
    ticker,
    name,
    price,
    change,
    changePct,
    volume,
    marketCap,
    sparkData,
    width = 80,
    variant = "full"
  } = opts;
  if (!ticker) return pc("muted", "\u2014");
  switch (variant) {
    case "compact":
      return renderCompact(opts);
    case "dense":
      return renderDense(opts);
    case "minimal":
      return renderMinimal(opts);
    default:
      return renderFull(opts);
  }
}
function renderFull(opts) {
  const { ticker, name, price, change, changePct, volume, marketCap, sparkData, width = 80 } = opts;
  const accentHex = palette("accent");
  const tickerStr = c(accentHex, BOLD + ticker);
  const nameStr = name ? "  " + pc("label", name) : "";
  const priceStr = "  " + pc("data", BOLD + fmtPrice(price));
  const changeStr = changePct != null ? "  " + (changePct >= 0 ? pc("positive", "\u25B2") : pc("negative", "\u25BC")) + coloredPct(changePct) : "";
  const volStr = volume != null ? "  " + pc("label", "Vol ") + pc("data", fmtVol(volume)) : "";
  const capStr = marketCap != null ? "  " + pc("data", fmtCap(marketCap)) : "";
  const sparkStr = sparkData && sparkData.length > 1 ? "  " + renderSparkline(sparkData, 12) : "";
  const content = tickerStr + nameStr + priceStr + changeStr + sparkStr + volStr + capStr;
  const contentVis = visLen(strip(content));
  const leftPad = 3;
  const rightPad = 3;
  const totalDecoWidth = leftPad + 1 + rightPad + 1;
  const available = width - totalDecoWidth;
  const leftDeco = c(accentHex, "\u2550".repeat(leftPad) + " ");
  const rightFill = Math.max(1, width - contentVis - leftPad - 2);
  const rightDeco = " " + c(accentHex, "\u2550".repeat(rightFill));
  return leftDeco + content + rightDeco;
}
function renderCompact(opts) {
  const { ticker, price, changePct, volume, marketCap, sparkData, width = 80 } = opts;
  const sep = pc("muted", " \u2502 ");
  const parts = [];
  parts.push(pc("accent", BOLD + ticker));
  parts.push(pc("data", fmtPrice(price)));
  if (changePct != null) {
    const arrow = changePct >= 0 ? pc("positive", "\u25B2") : pc("negative", "\u25BC");
    parts.push(arrow + coloredPct(changePct));
  }
  let line = parts.join(" ");
  if (sparkData && sparkData.length > 1) {
    const candidate = line + sep + renderSparkline(sparkData, 8);
    if (visLen(candidate) <= width) line = candidate;
  }
  if (volume != null) {
    const candidate = line + sep + pc("label", "Vol ") + pc("data", fmtVol(volume));
    if (visLen(candidate) <= width) line = candidate;
  }
  if (marketCap != null) {
    const candidate = line + sep + pc("data", fmtCap(marketCap));
    if (visLen(candidate) <= width) line = candidate;
  }
  return line;
}
function renderMinimal(opts) {
  const { ticker, price, changePct } = opts;
  const parts = [pc("accent", ticker), pc("data", fmtPrice(price))];
  if (changePct != null) parts.push(coloredPct(changePct));
  return parts.join(" ");
}
function renderDense(opts) {
  const { ticker, name, price, changePct, volume, marketCap, width = 80 } = opts;
  const tickerStr = c(palette("accent"), BOLD + ticker);
  const priceStr = pc("data", fmtPrice(price));
  const changeStr = changePct != null ? (changePct >= 0 ? pc("positive", "\u25B2") : pc("negative", "\u25BC")) + coloredPct(changePct) : "";
  const volStr = volume != null ? pc("label", "Vol ") + pc("data", fmtVol(volume)) : "";
  const capStr = marketCap != null ? pc("data", fmtCap(marketCap)) : "";
  const fixedParts = [tickerStr, priceStr];
  if (changeStr) fixedParts.push(changeStr);
  if (volStr) fixedParts.push(volStr);
  if (capStr) fixedParts.push(capStr);
  const fixedJoined = fixedParts.join("  ");
  const fixedVis = visLen(fixedJoined);
  const nameBudget = Math.max(0, width - fixedVis - 4);
  let nameStr = "";
  if (name && nameBudget > 4) {
    const raw = String(name);
    const truncated = raw.length > nameBudget ? raw.slice(0, nameBudget - 1) + "\u2026" : raw;
    nameStr = pc("label", truncated);
  }
  const parts = [tickerStr];
  if (nameStr) parts.push(nameStr);
  parts.push(priceStr);
  if (changeStr) parts.push(changeStr);
  if (volStr) parts.push(volStr);
  if (capStr) parts.push(capStr);
  return parts.join("  ");
}
function renderSparkline(values, width = 12) {
  if (!values || values.length < 2) return "";
  const resampled = [];
  for (let i = 0; i < width; i++) {
    const idx = Math.floor(i * values.length / width);
    resampled.push(Number(values[Math.min(idx, values.length - 1)]));
  }
  const min = Math.min(...resampled);
  const max = Math.max(...resampled);
  const range = max - min || 1;
  const isUp = resampled[resampled.length - 1] >= resampled[0];
  const color = palette(isUp ? "positive" : "negative");
  const chars = resampled.map((v) => {
    const idx = Math.round((v - min) / range * (SPARK.length - 1));
    return SPARK[Math.max(0, Math.min(SPARK.length - 1, idx))];
  });
  return c(color, chars.join(""));
}

// src/components/AnalystBar.js
var BLOCK_FILL = "\u2588";
var BLOCK_EMPTY2 = "\u2591";
var TARGET_LINE = "\u2500";
var TARGET_DOT = "\u25CF";
function analystBar(opts = {}) {
  const {
    ratings = {},
    priceTarget,
    width = 60
  } = opts;
  const buy = Number(ratings.buy ?? 0);
  const hold = Number(ratings.hold ?? 0);
  const sell = Number(ratings.sell ?? 0);
  const total = buy + hold + sell;
  const lines = [];
  const barWidth = Math.max(10, Math.floor(width * 0.45));
  let bar = "";
  if (total === 0) {
    bar = pc("muted", BLOCK_EMPTY2.repeat(barWidth));
  } else {
    const buyFill = Math.round(buy / total * barWidth);
    const holdFill = Math.round(hold / total * barWidth);
    const sellFill = Math.max(0, barWidth - buyFill - holdFill);
    bar += c(palette("positive"), BLOCK_FILL.repeat(buyFill));
    bar += c(palette("warning"), BLOCK_FILL.repeat(holdFill));
    bar += c(palette("negative"), BLOCK_FILL.repeat(sellFill));
  }
  const buyLabel = pc("positive", `${buy} Buy`);
  const holdLabel = pc("warning", `${hold} Hold`);
  const sellLabel = pc("negative", `${sell} Sell`);
  lines.push(`${bar}  ${buyLabel}  ${holdLabel}  ${sellLabel}`);
  if (priceTarget) {
    const { current, low, median, high } = priceTarget;
    lines.push("");
    const lineWidth = Math.max(10, Math.floor(width * 0.45));
    const currentN = Number(current ?? 0);
    const lowN = Number(low ?? 0);
    const medianN = Number(median ?? 0);
    const highN = Number(high ?? 0);
    let dotPos = 0;
    const range = highN - lowN;
    if (range > 0) {
      dotPos = Math.round((currentN - lowN) / range * lineWidth);
      dotPos = Math.max(0, Math.min(lineWidth - 1, dotPos));
    }
    let rangeLine = "";
    for (let i = 0; i < lineWidth; i++) {
      if (i === dotPos) {
        rangeLine += c(palette("highlight"), TARGET_DOT);
      } else {
        rangeLine += pc("muted", TARGET_LINE);
      }
    }
    const lowStr = pc("muted", fmtPrice(lowN));
    const highStr = pc("muted", fmtPrice(highN));
    const medStr = pc("data", `med ${fmtPrice(medianN)}`);
    const curStr = pc("highlight", fmtPrice(currentN));
    const ptFull = `${pc("label", "PT")}  ${lowStr} ${rangeLine} ${highStr}  ${medStr}  cur ${curStr}`;
    if (visLen(ptFull) <= width) {
      lines.push(ptFull);
    } else {
      lines.push(`${pc("label", "PT")}  ${lowStr} ${rangeLine} ${highStr}`);
      lines.push(`    ${medStr}  cur ${curStr}`);
    }
  }
  return lines.join("\n");
}

// src/components/FilingTimeline.js
var TL_MID = "\u2502";
var TL_LAST = "\u2514";
var TL_LINE = "\u2500";
var FORM_ROLES = {
  annual_report: "positive",
  financial_results: "accent",
  investor_presentation: "highlight",
  exchange_announcement: "warning",
  corporate_action: "warning",
  shareholding_pattern: "accent",
  insider_disclosure: "negative",
  board_meeting: "highlight",
  material_event: "warning"
};
function formRole(form) {
  return FORM_ROLES[String(form).toUpperCase()] || FORM_ROLES[String(form)] || "data";
}
function filingTimeline(opts = {}) {
  const {
    filings = [],
    width = 80
  } = opts;
  if (!filings.length) {
    return pc("muted", "No filings");
  }
  const lines = [];
  const connW = 2;
  const dateW = 8;
  const formW = 24;
  const descW = Math.max(10, width - connW - dateW - formW - 4);
  lines.push(
    " ".repeat(connW) + padRight(pc("label", "DATE"), dateW) + " " + padRight(pc("label", "TYPE"), formW) + " " + pc("label", "DESCRIPTION")
  );
  lines.push(pc("muted", "\u2500".repeat(Math.min(width, connW + dateW + formW + descW + 3))));
  for (let i = 0; i < filings.length; i++) {
    const filing = filings[i];
    const isLast = i === filings.length - 1;
    const form = filing.form || filing.document_type || filing.type;
    const role = formRole(form);
    const color = palette(role);
    const connector = isLast ? c(palette("muted"), `${TL_LAST}${TL_LINE}`) : c(palette("muted"), `${TL_MID} `);
    const date = padRight(pc("muted", fmtDate(filing.date)), dateW);
    const formStr = String(form || "?");
    const badge = padRight(c(color, `[${formStr}]`), formW);
    const descRaw = String(filing.description || "");
    const descFull = pc("data", descRaw);
    const desc = ansiTrunc(descFull, descW);
    lines.push(`${connector} ${date} ${badge} ${desc}`);
  }
  return lines.join("\n");
}

// terminal/server.js
var DEFAULT_PORT = 7707;
var STATE_DIR2 = MARKED_HOME;
var STATE_FILE = TUI_STATE_PATH;
var ANALYTICS_FILE = path3.join(ANALYTICS_DIR, "requests.jsonl");
var ANALYTICS_MAX_BYTES = 5 * 1024 * 1024;
var VALID_ACTIONS = /* @__PURE__ */ new Set(["render", "focus", "layout", "clear"]);
var _require = createRequire(import.meta.url);
function _resolveVersion() {
  if (true) return "0.2.1";
  try {
    return _require("../package.json").version;
  } catch {
    return "0.0.0";
  }
}
var VERSION = _resolveVersion();
var analytics = {
  renders: 0,
  patches: 0,
  errors: 0,
  totalBlocks: 0,
  firstRenderAt: null,
  lastRenderAt: null,
  skills: {}
  // { analyst: 3, desk: 1 }
};
function logAnalytics(entry) {
  try {
    fs3.mkdirSync(ANALYTICS_DIR, { recursive: true });
    try {
      const stat = fs3.statSync(ANALYTICS_FILE);
      if (stat.size > ANALYTICS_MAX_BYTES) {
        fs3.renameSync(ANALYTICS_FILE, ANALYTICS_FILE + ".bak");
      }
    } catch {
    }
    fs3.appendFileSync(ANALYTICS_FILE, JSON.stringify(entry) + "\n");
  } catch {
  }
}
var _agentSession = null;
var VALID_THEMES = new Set(Object.keys(themes));
var emitter = new EventEmitter();
function connectedAgent() {
  return _agentSession;
}
emitter.setMaxListeners(20);
var _server = null;
var _handlersRegistered = false;
var _shuttingDown = false;
var _port = null;
var _startedAt = null;
var _layout = "default";
var _panelCount = 0;
function isPortAvailable(port) {
  return new Promise((resolve) => {
    const tester = net.createServer();
    tester.once("error", () => resolve(false));
    tester.once("listening", () => {
      tester.close(() => resolve(true));
    });
    tester.listen(port, "127.0.0.1");
  });
}
async function findPort() {
  if (await isPortAvailable(DEFAULT_PORT)) {
    return DEFAULT_PORT;
  }
  for (let attempt = 0; attempt < 5; attempt++) {
    const candidate = Math.floor(Math.random() * 5e4) + 1e4;
    if (await isPortAvailable(candidate)) {
      return candidate;
    }
  }
  throw new Error("Could not find an available port after 5 attempts");
}
function writeStateFile(data) {
  fs3.mkdirSync(STATE_DIR2, { recursive: true });
  const tmp = STATE_FILE + ".tmp";
  fs3.writeFileSync(tmp, JSON.stringify(data, null, 2), { mode: 384 });
  fs3.renameSync(tmp, STATE_FILE);
}
function deleteStateFile() {
  try {
    fs3.unlinkSync(STATE_FILE);
  } catch {
  }
}
function setCorsHeaders(res) {
  res.setHeader("Access-Control-Allow-Origin", "http://localhost");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}
var MAX_BODY_BYTES = 1048576;
function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let totalBytes = 0;
    let limitExceeded = false;
    req.on("data", (chunk) => {
      if (limitExceeded) return;
      totalBytes += chunk.length;
      if (totalBytes > MAX_BODY_BYTES) {
        limitExceeded = true;
        const err = new Error("Payload too large");
        err.code = "PAYLOAD_TOO_LARGE";
        reject(err);
        req.resume();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      if (limitExceeded) return;
      const body = Buffer.concat(chunks).toString("utf8");
      try {
        resolve(JSON.parse(body));
      } catch {
        reject(new Error("Invalid JSON"));
      }
    });
    req.on("error", reject);
  });
}
function handleRequest(req, res) {
  const _reqStart = Date.now();
  res.on("finish", () => {
    try {
      const duration_ms = Date.now() - _reqStart;
      const status = res.statusCode;
      const { method: method2, url: path7 } = req;
      if (path7 === "/render") {
        const pending = req._pendingRenderLog || {};
        logAnalytics({
          ts: (/* @__PURE__ */ new Date()).toISOString(),
          method: method2,
          path: path7,
          status,
          duration_ms,
          ...pending,
          error: pending.error ?? null
        });
        if (status === 200) {
          const now = (/* @__PURE__ */ new Date()).toISOString();
          analytics.renders++;
          if (pending.patch) analytics.patches++;
          if (pending.blocks_count) analytics.totalBlocks += pending.blocks_count;
          if (!analytics.firstRenderAt) analytics.firstRenderAt = now;
          analytics.lastRenderAt = now;
          if (pending.skill) {
            if (analytics.skills[pending.skill] !== void 0 || Object.keys(analytics.skills).length < 50) {
              analytics.skills[pending.skill] = (analytics.skills[pending.skill] || 0) + 1;
            }
          }
          logRender(
            pending.skill ?? "unknown",
            pending.blocks_count ?? 0,
            pending.patch ?? false,
            pending.stage ?? "unknown"
          );
        } else {
          analytics.errors++;
          logRenderError(status, pending.error ?? "");
        }
      } else {
        const entry = {
          ts: (/* @__PURE__ */ new Date()).toISOString(),
          method: method2,
          path: path7,
          status,
          duration_ms
        };
        if (status >= 400) {
          entry.error = req._responseError || null;
        }
        logAnalytics(entry);
        if (status >= 400) analytics.errors++;
      }
    } catch {
    }
  });
  setCorsHeaders(res);
  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }
  const { method, url } = req;
  if (method === "GET" && url === "/health") {
    const now = Date.now();
    const uptime = _startedAt ? Math.floor((now - _startedAt) / 1e3) : 0;
    const { columns, rows } = process.stdout;
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({
      status: "ok",
      pid: process.pid,
      port: _port,
      version: VERSION,
      uptime,
      layout: _layout,
      panelCount: _panelCount,
      startedAt: _startedAt,
      width: columns ?? 80,
      height: rows ?? 24,
      theme: getTheme(),
      capabilities: ["patch", "sections", "focus", "state", "memory", "connect"],
      agent: _agentSession
    }));
    return;
  }
  if (method === "POST" && url === "/connect") {
    readBody(req).then((payload) => {
      const agentId = payload?.agent || "unknown";
      if (_agentSession && _agentSession.agent !== agentId) {
        res.writeHead(409, { "Content-Type": "application/json" });
        res.end(JSON.stringify({
          error: "occupied",
          agent: _agentSession.agent,
          connectedAt: _agentSession.connectedAt,
          message: `TUI occupied by ${_agentSession.agent}. Disconnect the active runtime first.`
        }));
        return;
      }
      const modelId = payload?.model || null;
      _agentSession = {
        agent: agentId,
        model: modelId,
        query: payload?.query || null,
        connectedAt: Date.now()
      };
      logConnection(agentId, modelId);
      const label = modelId ? `${agentId} \xB7 ${modelId}` : agentId;
      emitter.emit("_splash", {
        msg: `Connected \xB7 ${label}`,
        agent: _agentSession
      });
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ status: "connected", agent: agentId, model: modelId }));
    }).catch((err) => {
      if (err?.code === "PAYLOAD_TOO_LARGE") {
        res.writeHead(413, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Payload too large", maxBytes: MAX_BODY_BYTES }));
      } else {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Invalid JSON" }));
      }
    });
    return;
  }
  if (method === "POST" && url === "/disconnect") {
    readBody(req).then((payload) => {
      const agentId = payload?.agent;
      if (!agentId) {
        res.writeHead(403, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Agent ID mismatch" }));
        return;
      }
      if (!_agentSession) {
        res.writeHead(409, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "No agent connected" }));
        return;
      }
      if (_agentSession.agent !== agentId) {
        res.writeHead(403, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Agent ID mismatch" }));
        return;
      }
      logDisconnect(agentId);
      _agentSession = null;
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ status: "disconnected" }));
    }).catch((err) => {
      if (err?.code === "PAYLOAD_TOO_LARGE") {
        res.writeHead(413, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Payload too large", maxBytes: MAX_BODY_BYTES }));
      } else {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Invalid JSON" }));
      }
    });
    return;
  }
  if (method === "POST" && url === "/notice") {
    readBody(req).then((payload) => {
      if (!_agentSession || payload?.agent !== _agentSession.agent) {
        res.writeHead(403, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Agent ID mismatch" }));
        return;
      }
      const message = typeof payload.message === "string" ? payload.message.slice(0, 240) : "";
      emitter.emit("_splash", { msg: message, reset: payload.reset !== false });
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ status: "ok" }));
    }).catch(() => {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Invalid JSON" }));
    });
    return;
  }
  if (method === "POST" && url === "/render") {
    if (!_agentSession) {
      req._pendingRenderLog = { error: "No agent connected" };
      res.writeHead(403, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "No agent connected. POST /connect first." }));
      return;
    }
    readBody(req).then((payload) => {
      const callerId = payload?.agent;
      if (callerId && callerId !== _agentSession.agent) {
        req._pendingRenderLog = { error: "Agent ID mismatch" };
        res.writeHead(403, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Agent ID mismatch", connected: _agentSession.agent }));
        return;
      }
      const action = payload?.action;
      if (!VALID_ACTIONS.has(action)) {
        req._pendingRenderLog = { agent: callerId, error: `Invalid action "${action}"` };
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({
          error: `Invalid action "${action}". Must be one of: ${[...VALID_ACTIONS].join(", ")}`
        }));
        return;
      }
      if (action === "render") {
        if (payload.blocks !== void 0) {
          req._pendingRenderLog = { agent: callerId, error: "Inline blocks not accepted" };
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({
            error: 'Inline blocks not accepted. Write blocks to a file and POST {"action":"render","file":"/path/to/file.json"}'
          }));
          return;
        }
        if (!payload.file) {
          req._pendingRenderLog = { agent: callerId, error: 'Missing "file" field' };
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({
            error: 'Missing "file" field. Write blocks to a file and POST {"action":"render","file":"/path/to/file.json"}'
          }));
          return;
        }
        const filePath = path3.resolve(payload.file);
        if (!filePath.startsWith("/tmp/")) {
          req._pendingRenderLog = { agent: callerId, error: "File path must be under /tmp/" };
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({
            error: "File path must be under /tmp/. Got: " + filePath
          }));
          return;
        }
        let fileContents;
        try {
          const stat = fs3.statSync(filePath);
          if (stat.size > MAX_BODY_BYTES) {
            req._pendingRenderLog = { agent: callerId, error: "File too large" };
            res.writeHead(413, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: "File too large", maxBytes: MAX_BODY_BYTES }));
            return;
          }
          fileContents = fs3.readFileSync(filePath, "utf8");
        } catch (readErr) {
          if (readErr.code === "ENOENT") {
            req._pendingRenderLog = { agent: callerId, error: `File not found: ${filePath}` };
            res.writeHead(404, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: `File not found: ${filePath}` }));
          } else {
            req._pendingRenderLog = { agent: callerId, error: `Could not read file: ${readErr.message}` };
            res.writeHead(500, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: `Could not read file: ${readErr.message}` }));
          }
          return;
        }
        let filePayload;
        try {
          filePayload = JSON.parse(fileContents);
        } catch {
          req._pendingRenderLog = { agent: callerId, error: `Invalid JSON in file: ${filePath}` };
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: `Invalid JSON in file: ${filePath}` }));
          return;
        }
        if (filePayload.blocks !== void 0) payload.blocks = filePayload.blocks;
        if (filePayload._state !== void 0) payload._state = filePayload._state;
        if (filePayload.meta !== void 0) payload.meta = filePayload.meta;
        if (filePayload.theme !== void 0) payload.theme = filePayload.theme;
        if (filePayload.scope !== void 0) payload.scope = filePayload.scope;
        if (filePayload.patch !== void 0) payload.patch = filePayload.patch;
        if (filePayload.layout !== void 0) payload.layout = filePayload.layout;
        if (filePayload.panels !== void 0) payload.panels = filePayload.panels;
        if (filePayload.liveTape !== void 0) payload.liveTape = filePayload.liveTape;
      }
      if (payload.theme !== void 0 && !VALID_THEMES.has(payload.theme)) {
        req._pendingRenderLog = { agent: payload.agent, error: `Unknown theme "${payload.theme}"` };
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({
          error: `Unknown theme "${payload.theme}". Valid: ${[...VALID_THEMES].join(", ")}`
        }));
        return;
      }
      if (payload.layout) _layout = payload.layout;
      if (Array.isArray(payload.blocks)) _layout = "blocks";
      if (typeof payload.panelCount === "number") _panelCount = payload.panelCount;
      try {
        emitter.emit(action, payload);
      } catch (emitErr) {
        req._pendingRenderLog = {
          agent: payload.agent,
          skill: payload._state?.skill,
          action,
          error: `Render error: ${emitErr.message}`
        };
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: `Render error: ${emitErr.message}` }));
        return;
      }
      if (action === "render") {
        req._pendingRenderLog = {
          skill: payload._state?.skill ?? payload.meta?.skill ?? "unknown",
          blocks_count: Array.isArray(payload.blocks) ? payload.blocks.length : 0,
          patch: !!payload.patch,
          stage: payload._state?.stage ?? "unknown"
        };
      }
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true }));
    }).catch((err) => {
      if (err?.code === "PAYLOAD_TOO_LARGE") {
        req._pendingRenderLog = { error: "Payload too large" };
        res.writeHead(413, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Payload too large", maxBytes: MAX_BODY_BYTES }));
      } else {
        req._pendingRenderLog = { error: "Invalid JSON in request body" };
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Invalid JSON in request body" }));
      }
    });
    return;
  }
  if (method === "GET" && url === "/stats") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(analytics));
    return;
  }
  req._responseError = "Not found";
  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: "Not found" }));
}
async function startServer(overridePort) {
  const requestedPort = overridePort != null ? overridePort : await findPort();
  _startedAt = Date.now();
  const server = http.createServer(handleRequest);
  _server = server;
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(requestedPort, "127.0.0.1", () => resolve());
  });
  const port = server.address().port;
  _port = port;
  writeStateFile({
    pid: process.pid,
    port,
    startedAt: new Date(_startedAt).toISOString(),
    version: VERSION
  });
  logAnalytics({
    ts: (/* @__PURE__ */ new Date()).toISOString(),
    event: "server_start",
    port,
    version: VERSION,
    pid: process.pid
  });
  if (!_handlersRegistered) {
    process.on("SIGTERM", shutdown);
    process.on("SIGINT", shutdown);
    _handlersRegistered = true;
  }
  return { server, port };
}
function shutdown() {
  if (_shuttingDown) return;
  _shuttingDown = true;
  logAnalytics({
    ts: (/* @__PURE__ */ new Date()).toISOString(),
    event: "server_stop",
    duration_s: _startedAt ? Math.floor((Date.now() - _startedAt) / 1e3) : 0,
    renders: analytics.renders,
    errors: analytics.errors
  });
  deleteStateFile();
  if (_server) {
    if (typeof _server.closeAllConnections === "function") {
      _server.closeAllConnections();
    }
    _server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 3e3).unref();
  } else {
    process.exit(0);
  }
}

// terminal/app.js
init_debugLog();

// terminal/state.js
init_paths();
import { createRequire as createRequire2 } from "module";
var _require2 = createRequire2(import.meta.url);
function _resolveVersion2() {
  if (true) return "0.2.1";
  try {
    return _require2("../package.json").version;
  } catch {
    return "0.0.0";
  }
}
var PKG_VERSION = "v" + _resolveVersion2();
var BRAND = "";
var LABEL = "";
var BOLD2 = "\x1B[1m";
var DIM2 = "\x1B[2m";
var RESET2 = "\x1B[0m";
var LIME_D = "";
var LIME_M = "";
function refreshBrand() {
  const accent = palette("accent") || "#ffffff";
  BRAND = fg(accent);
  LABEL = fg(palette("label") || accent);
  LIME_D = fg(shade(accent, 0.38));
  LIME_M = fg(shade(accent, 0.68));
}
function applyTheme(name) {
  setTheme(name);
  refreshBrand();
}
refreshBrand();
var VERSION2 = { current: PKG_VERSION };
var PANEL_NAMES_SET = /* @__PURE__ */ new Set([
  "quote",
  "chart",
  "rsi",
  "technical",
  "analyst",
  "macro",
  "news",
  "verdict",
  "gauge",
  "gauges",
  "insiders",
  "earnings",
  "holders",
  "filings",
  "heatmap",
  "candlestick",
  "waterfall",
  "correlationMatrix",
  "treeMap",
  "flowSankey"
]);
var tui = {
  // Scroll
  scrollOffset: 0,
  lastContent: "",
  // Render meta (from payload.meta)
  renderMeta: { model: null, tools: null, cost: null, as_of: null },
  // Last blocks (for save)
  lastBlocks: null,
  // Load overlay
  loadMode: false,
  loadList: [],
  loadIdx: 0,
  // Clarification overlay — the runtime asking the user a question
  askMode: false,
  askPrompt: "",
  askHint: "",
  askList: [],
  askIdx: 0,
  askStep: null,
  // Onboarding text input
  inputMode: false,
  inputPrompt: "",
  inputHint: "",
  inputValue: "",
  inputSecret: false,
  inputStep: null,
  // Model picker overlay
  modelMode: false,
  modelList: [],
  modelIdx: 0,
  modelCurrent: null,
  // Agent→TUI state protocol (#15)
  agentState: null,
  liveTape: [],
  // Focus state (#3 TUI Controls)
  focusedPanel: null,
  // panel name currently focused (null = none)
  panelIds: [],
  // ordered list of panel names in current render
  // Help overlay
  helpVisible: false,
  // Runtime query prompt
  queryInput: "",
  promptRows: 3,
  overlayBackdrop: null,
  // What the next question is about — the open Company World, when there is
  // one. Shown on the command line's rule so the scope is never a guess.
  scope: null,
  // World search: live results as the user types.
  searchMode: false,
  searchQuery: "",
  searchResults: [],
  searchIdx: 0,
  searchBusy: false,
  queryHistory: [],
  historyIdx: -1
};
function getBlockType(block) {
  if (!block || typeof block !== "object") return null;
  if (block.id) return block.id;
  if (block.panel) return block.panel;
  if (block.text != null) return "text";
  if (block.divider != null) return "divider";
  if (block.spacer != null) return "spacer";
  if (Array.isArray(block.row)) return "row";
  if (Array.isArray(block.stack)) return "stack";
  for (const name of PANEL_NAMES_SET) if (block[name] != null) return name;
  return null;
}
var POSITIONAL_TYPES = /* @__PURE__ */ new Set(["row", "stack", "text", "divider", "spacer"]);
function buildPatchKeys(blocks) {
  const counts = {};
  return blocks.map((b) => {
    const type = getBlockType(b);
    if (type == null) return null;
    if (!POSITIONAL_TYPES.has(type)) return type;
    const n = counts[type] ?? 0;
    counts[type] = n + 1;
    return `${type}-${n}`;
  });
}
function applyPatch(base, incoming) {
  const baseKeys = buildPatchKeys(base);
  const incomingKeys = buildPatchKeys(incoming);
  for (let i = 0; i < incoming.length; i++) {
    const key = incomingKeys[i];
    const idx = key != null ? baseKeys.indexOf(key) : -1;
    if (idx >= 0) {
      base[idx] = incoming[i];
      baseKeys[idx] = key;
    } else {
      base.push(incoming[i]);
      baseKeys.push(key);
    }
  }
  return base;
}

// terminal/logo.js
var BOLD3 = "\x1B[1m";
var DIM3 = "\x1B[2m";
var RESET3 = "\x1B[0m";
function ramp() {
  const accent = palette("accent") || "#ffffff";
  return { BRAND: fg(accent), LIME_M: fg(shade(accent, 0.78)), LIME_D: fg(shade(accent, 0.5)) };
}
function logoBlock() {
  const { BRAND: BRAND2, LIME_M: LIME_M2, LIME_D: LIME_D2 } = ramp();
  return [
    `${LIME_D2}  \u2590${RESET3} ${LIME_M2}\u2590\u258C${RESET3} ${BRAND2}\u2588${RESET3}   ${BRAND2}${BOLD3}MARKED${RESET3}`,
    `${LIME_D2}  \u2588${RESET3} ${LIME_M2}\u2588\u2588${RESET3} ${BRAND2}\u2588${RESET3}   ${BRAND2}${BOLD3}INDIA${RESET3}`,
    `${LIME_M2}  \u2588${RESET3} ${BRAND2}\u2588\u2588${RESET3} ${LIME_D2}\u2590${RESET3}`,
    `${BRAND2}  \u2590${RESET3} ${LIME_D2}\u2590\u258C${RESET3} ${LIME_M2}\u2590${RESET3}   ${DIM3}The view that matters.${RESET3}`
  ];
}
var WORDMARK_ROWS = [
  "\u2588\u2588\u2588\u2557   \u2588\u2588\u2588\u2557 \u2588\u2588\u2588\u2588\u2588\u2557 \u2588\u2588\u2588\u2588\u2588\u2588\u2557 \u2588\u2588\u2557  \u2588\u2588\u2557\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2557\u2588\u2588\u2588\u2588\u2588\u2588\u2557 ",
  "\u2588\u2588\u2588\u2588\u2557 \u2588\u2588\u2588\u2588\u2551\u2588\u2588\u2554\u2550\u2550\u2588\u2588\u2557\u2588\u2588\u2554\u2550\u2550\u2588\u2588\u2557\u2588\u2588\u2551 \u2588\u2588\u2554\u255D\u2588\u2588\u2554\u2550\u2550\u2550\u2550\u255D\u2588\u2588\u2554\u2550\u2550\u2588\u2588\u2557",
  "\u2588\u2588\u2554\u2588\u2588\u2588\u2588\u2554\u2588\u2588\u2551\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2551\u2588\u2588\u2588\u2588\u2588\u2588\u2554\u255D\u2588\u2588\u2588\u2588\u2588\u2554\u255D \u2588\u2588\u2588\u2588\u2588\u2557  \u2588\u2588\u2551  \u2588\u2588\u2551",
  "\u2588\u2588\u2551\u255A\u2588\u2588\u2554\u255D\u2588\u2588\u2551\u2588\u2588\u2554\u2550\u2550\u2588\u2588\u2551\u2588\u2588\u2554\u2550\u2550\u2588\u2588\u2557\u2588\u2588\u2554\u2550\u2588\u2588\u2557 \u2588\u2588\u2554\u2550\u2550\u255D  \u2588\u2588\u2551  \u2588\u2588\u2551",
  "\u2588\u2588\u2551 \u255A\u2550\u255D \u2588\u2588\u2551\u2588\u2588\u2551  \u2588\u2588\u2551\u2588\u2588\u2551  \u2588\u2588\u2551\u2588\u2588\u2551  \u2588\u2588\u2557\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2557\u2588\u2588\u2588\u2588\u2588\u2588\u2554\u255D",
  "\u255A\u2550\u255D     \u255A\u2550\u255D\u255A\u2550\u255D  \u255A\u2550\u255D\u255A\u2550\u255D  \u255A\u2550\u255D\u255A\u2550\u255D  \u255A\u2550\u255D\u255A\u2550\u2550\u2550\u2550\u2550\u2550\u255D\u255A\u2550\u2550\u2550\u2550\u2550\u255D "
];
var WORDMARK_WIDTH = WORDMARK_ROWS[0].length;
function wordmark() {
  const { BRAND: BRAND2, LIME_D: LIME_D2 } = ramp();
  return WORDMARK_ROWS.map((row) => row.replace(/\u2588+|[^\u2588 ]+/g, (run) => (run[0] === "\u2588" ? BRAND2 + BOLD3 : LIME_D2) + run + RESET3));
}

// config/models.js
init_paths();
import fs4 from "node:fs";
import os2 from "node:os";
import path4 from "node:path";
var AGENTS = ["claude", "claude-api", "codex", "openai-codex", "codex-api"];
var API_KEY_AGENTS = ["claude-api", "codex-api"];
var AGENT_LABELS = {
  claude: "Claude Code CLI",
  "claude-api": "Claude API",
  codex: "Codex CLI",
  "codex-api": "ChatGPT API",
  "openai-codex": "ChatGPT subscription"
};
var AGENT_ALIASES = {
  chatgpt: "openai-codex",
  "chatgpt-subscription": "openai-codex",
  "chatgpt-api": "codex-api"
};
var CODEX_MODELS_CACHE = path4.join(os2.homedir(), ".codex", "models_cache.json");
var CLAUDE_MODELS = [
  { id: "opus", label: "Opus \u2014 deepest reasoning" },
  { id: "fable", label: "Fable \u2014 fast frontier" },
  { id: "sonnet", label: "Sonnet \u2014 balanced" },
  { id: "haiku", label: "Haiku \u2014 cheapest" }
];
var CODEX_FALLBACK = [
  "gpt-6-astra",
  "gpt-reserve",
  "gpt-5.6-sol",
  "gpt-5.6-terra",
  "gpt-5.6-luna",
  "gpt-daybreak-blue-latest",
  "gpt-5.5"
].map((id) => ({ id, label: id }));
var VALID_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
function modelsFor(agent) {
  if (API_KEY_AGENTS.includes(agent)) {
    const stored = storedModels(agent);
    const configured = providerKeyConfigured(agent);
    return [
      stored.length ? { id: "connect", label: "Replace API key \xB7 rediscover models" } : configured ? { id: "discover", label: "Discover models using configured key" } : { id: "connect", label: "Set API key \xB7 discover models" },
      ...stored
    ];
  }
  if (agent === "openai-codex") {
    const stored = storedModels(agent);
    return [
      stored.length ? { id: "authenticate", label: "Sign in again \xB7 refresh subscription models" } : subscriptionConfigured() ? { id: "discover-auth", label: "Discover models using subscription auth" } : { id: "authenticate", label: "Sign in \xB7 discover subscription models" },
      ...stored
    ];
  }
  const models = agent.startsWith("claude") ? CLAUDE_MODELS : codexModels();
  return [
    ...agent === "codex-api" ? [] : [{ id: null, label: `Default (whatever ${agentLabel(agent)} is configured to use)` }],
    ...models.filter((model) => VALID_ID.test(model.id))
  ];
}
function listModels() {
  return AGENTS.flatMap((agent) => {
    const status = API_KEY_AGENTS.includes(agent) ? providerKeyConfigured(agent) ? "key set" : "key not set" : agent === "openai-codex" ? subscriptionConfigured() ? "signed in" : "not signed in" : null;
    return modelsFor(agent).map((model) => ({ agent, status, ...model }));
  });
}
function currentModel() {
  let file = {};
  try {
    file = JSON.parse(fs4.readFileSync(configPath(), "utf8"));
  } catch {
  }
  const agent = resolveAgent(process.env.MARKED_AGENT || file.agent || "codex");
  return { agent, model: process.env.MARKED_MODEL || file.models?.[agent] || null };
}
function agentLabel(agent) {
  return AGENT_LABELS[agent] ?? agent;
}
function resolveAgent(agent) {
  const value = String(agent ?? "").toLowerCase();
  return AGENT_ALIASES[value] ?? value;
}
function storedModels(agent) {
  try {
    const file = JSON.parse(fs4.readFileSync(configPath(), "utf8"));
    const models = file.providerModels?.[agent];
    return Array.isArray(models) ? models.filter((model) => model && VALID_ID.test(model.id)).map((model) => ({ id: model.id, label: String(model.label || model.id).slice(0, 80) })) : [];
  } catch {
    return [];
  }
}
function providerKeyConfigured(agent) {
  if (agent === "claude-api" && process.env.ANTHROPIC_API_KEY) return true;
  if (agent === "codex-api" && process.env.OPENAI_API_KEY) return true;
  try {
    const file = JSON.parse(fs4.readFileSync(configPath(), "utf8"));
    return Boolean(file.providerKeys?.[agent]);
  } catch {
    return false;
  }
}
function subscriptionConfigured() {
  try {
    const authPath = process.env.MARKED_AUTH_FILE || path4.join(os2.homedir(), ".marked", "auth.json");
    const file = JSON.parse(fs4.readFileSync(authPath, "utf8"));
    return Boolean(file.providers?.["openai-codex"]?.tokens?.access_token);
  } catch {
    return false;
  }
}
function codexModels() {
  try {
    const cache = JSON.parse(fs4.readFileSync(CODEX_MODELS_CACHE, "utf8"));
    const models = (Array.isArray(cache.models) ? cache.models : []).filter((model) => model?.visibility === "list" && typeof model.slug === "string").sort((a, b) => (a.priority ?? 999) - (b.priority ?? 999)).map((model) => ({ id: model.slug, label: String(model.display_name || model.slug).slice(0, 60) }));
    return models.length ? models : CODEX_FALLBACK;
  } catch {
    return CODEX_FALLBACK;
  }
}

// runtime/commands.js
var DESK = [
  ["/analyst", "<company>", "filings, fundamentals, or any research question"],
  ["/compare", "<a> and <b>", "2 to 5 names, separated by and / vs / comma"],
  ["/macro", "", "RBI, inflation, growth, the regime behind the trade"],
  ["/sector", "<sector>", "rotations, thematics, and the names moving money"],
  ["/desk", "<company>", "market pulse, 3 seconds, everything that matters"],
  ["/risk", "<company>", "event impact, catalyst timing, what could go wrong"],
  ["/options", "<symbol>", "chains, OI skew, positioning, where smart money leans"],
  ["/futures", "<symbol>", "commodities, rates futures, the cross-asset tape"],
  ["/watch", "<companies>", "what moved, conviction logged"]
];
var CAPABILITIES = [
  ["/thesis", "<company>", "save or re-evaluate a living thesis"],
  ["/diff", "<company> [FYx FYy]", "changes since the last check or between two years"],
  ["/rewind", "<company> <YYYY-MM-DD>", "research using only that point in time"],
  ["/signal", "<screen rules>", "compile natural language into a universe screen"],
  ["/claims", "<company>", "test management narrative against reported facts"]
];
var LIVE = ["/live", "<symbols>", "poll live API quotes in a compact tape"];
var COMMANDS = new Set(DESK.map(([name]) => name.slice(1)));

// terminal/splash.js
function pulseColors() {
  const accent = palette("accent") || "#ffffff";
  return [
    fg(accent),
    fg(shade(accent, 1.18)),
    fg(shade(accent, 1.38)),
    fg(shade(accent, 1.18)),
    fg(accent),
    fg(shade(accent, 0.72)),
    fg(accent)
  ];
}
var SPINNER_FRAMES = ["\u280B", "\u2819", "\u2839", "\u2838", "\u283C", "\u2834", "\u2826", "\u2827", "\u2807", "\u280F"];
var RUNTIME_AGENTS = ["marked", "claude", "codex", "openai-codex"];
var BOTTOM_ROWS = 2;
function padToStatus(lines, maxRows, gap = 1) {
  const target = Math.min(maxRows - BOTTOM_ROWS, lines.length + gap);
  while (lines.length < target) lines.push("");
}
function renderSplash(msg, width, pulseFrame = 0, maxRows = 999, liveTape = []) {
  const pulse = pulseColors();
  const pc2 = pulse[pulseFrame % pulse.length];
  const mark = `${pc2}${BOLD2}\u2590\u2588\u2588${RESET2}`;
  const spin = `${pc2}${SPINNER_FRAMES[pulseFrame % SPINNER_FRAMES.length]}${RESET2}`;
  const vStr = `${BRAND}${VERSION2.current}${RESET2}`;
  const status = /^update available/i.test(msg) ? `${fg(palette("warning") || "#ffffff")}${BOLD2}${msg}${RESET2}` : `${DIM2}${msg}${RESET2}`;
  const pad = (s) => {
    const vis = s.replace(/\x1b\[[0-9;]*m/g, "").length;
    return " ".repeat(Math.max(0, Math.floor((width - vis) / 2))) + s;
  };
  const sep = (ch = "\u2500") => `${DIM2}${ch.repeat(width)}${RESET2}`;
  const L = (left, right, w = width) => {
    const lv = left.replace(/\x1b\[[0-9;]*m/g, "").length;
    const rv = right.replace(/\x1b\[[0-9;]*m/g, "").length;
    return left + " ".repeat(Math.max(1, w - lv - rv)) + right;
  };
  const lines = [];
  if (width >= 82 && maxRows >= 22) {
    lines.push("");
    if (width >= WORDMARK_WIDTH + 4 && maxRows >= 26) {
      for (const row of wordmark()) lines.push(`  ${row}`);
      lines.push("");
      lines.push(`  ${DIM2}INDIA  \xB7  The view that matters.${RESET2}`);
    } else {
      for (const row of logoBlock()) lines.push(`  ${row}`);
    }
    lines.push(sep());
    lines.push("");
    const colW = Math.floor(width / 2) - 2;
    lines.push(L(
      `  ${BRAND}${BOLD2}THE TEAM${RESET2}  ${DIM2}every seat takes a position${RESET2}`,
      `${DIM2}RUNTIME WORKERS${RESET2}  `
    ));
    const runtimeW = "RUNTIME WORKERS".length;
    lines.push(L(
      `  ${DIM2}${"\u2500".repeat(colW - 2)}${RESET2}`,
      `${DIM2}${"\u2500".repeat(runtimeW)}${RESET2}  `
    ));
    const tapeLines = liveTape.slice(0, 2).map((quote) => {
      const price = Number(quote.price);
      const change = Number(quote.change_percent);
      const priceText = Number.isFinite(price) ? price.toLocaleString("en-IN", { maximumFractionDigits: 2 }) : "\u2014";
      const changeText = Number.isFinite(change) ? `${change > 0 ? "+" : ""}${change.toFixed(2)}%` : "\u2014";
      return `  ${LABEL}${quote.symbol || "\u2014"}${RESET2} ${DIM2}${priceText} ${changeText}${quote.is_stale ? " STALE" : ""}${RESET2}`;
    });
    const runtimeLines = [
      ...RUNTIME_AGENTS.map((a) => `  ${BRAND}\u25CF${RESET2} ${DIM2}${a.padEnd(8)}${RESET2} ${DIM2}connected${RESET2}`),
      "",
      `  ${vStr}`,
      ...tapeLines.length ? [`  ${LABEL}LIVE TAPE${RESET2}`, ...tapeLines] : [`  ${DIM2}LIVE TAPE \xB7 /live to connect${RESET2}`]
    ];
    DESK.forEach(([name, arg, desc], i) => {
      const command = `${BRAND}${BOLD2}${name}${RESET2}${arg ? ` ${LABEL}${arg}${RESET2}` : ""}`;
      const pad2 = " ".repeat(Math.max(1, 24 - name.length - (arg ? arg.length + 1 : 0)));
      const left = `  ${command}${pad2}${DIM2}${desc}${RESET2}`;
      const right = runtimeLines[i] ? `${runtimeLines[i]}  ` : "";
      lines.push(L(left, right));
    });
    lines.push("");
    lines.push(sep());
    padToStatus(lines, maxRows);
    lines.push(`  ${DIM2}type a company or a question${RESET2}  ${DIM2}\xB7${RESET2}  ${DIM2}/model${RESET2}  ${DIM2}^O${RESET2} ${DIM2}load${RESET2}  ${DIM2}^G${RESET2} ${DIM2}help${RESET2}  ${DIM2}^D${RESET2} ${DIM2}quit${RESET2}`);
    lines.push(L(
      `  ${spin} ${status}`,
      `${DIM2}marked.run  \xB7  ${RESET2}${mark}  `
    ));
  } else if (width >= 48 && maxRows >= 16) {
    lines.push("");
    lines.push(L(`  ${mark}  ${BRAND}${BOLD2}MARKED${RESET2}`, `  ${vStr}  `));
    lines.push(`  ${DIM2}marked.run  \xB7  India-first financial intelligence${RESET2}`);
    lines.push(sep());
    lines.push(`  ${BRAND}${BOLD2}THE TEAM${RESET2}`);
    DESK.forEach(([name, arg, desc]) => {
      lines.push(`  ${BRAND}${name.padEnd(11)}${RESET2}${LABEL}${(arg || "").padEnd(11)}${RESET2}${DIM2}${desc}${RESET2}`);
    });
    lines.push(`  ${DIM2}Workers: ${RUNTIME_AGENTS.join(" \xB7 ")}${RESET2}`);
    lines.push(sep());
    padToStatus(lines, maxRows);
    lines.push(`  ${DIM2}type a company or a question${RESET2}  ${DIM2}\xB7${RESET2}  ${DIM2}/model${RESET2}  ${DIM2}^O${RESET2} ${DIM2}load${RESET2}  ${DIM2}^G${RESET2} ${DIM2}help${RESET2}  ${DIM2}^D${RESET2} ${DIM2}quit${RESET2}`);
    lines.push(`  ${spin} ${status}`);
  } else if (maxRows >= 10) {
    lines.push(`  ${mark}  ${BRAND}${BOLD2}MARKED${RESET2}  ${DIM2}The view that matters.${RESET2}`);
    lines.push(sep());
    const deskNames = DESK.map(([name]) => `${BRAND}${name}${RESET2}`).join(`${DIM2} \xB7 ${RESET2}`);
    lines.push(`  ${deskNames}`);
    lines.push(`  ${DIM2}Workers: ${RUNTIME_AGENTS.join(" \xB7 ")}${RESET2}`);
    lines.push(sep());
    padToStatus(lines, maxRows);
    lines.push(`  ${DIM2}type to ask  /model  ^G help  ^D quit${RESET2}`);
    lines.push(`  ${spin} ${status}`);
  } else {
    lines.push(`  ${mark}  ${BRAND}${BOLD2}MARKED${RESET2}`);
    padToStatus(lines, maxRows, 0);
    lines.push(`  ${spin}  ${status}`);
  }
  return lines.join("\n");
}

// data/normalization.js
var MATERIAL_ORDER = [
  "Revenue",
  "TotalIncome",
  "ebitda",
  "ebitda_margin",
  "ebit",
  "ebit_margin",
  "ProfitBeforeTax",
  "ProfitAfterTax",
  "net_margin",
  "BasicEarningsPerShare",
  "DilutedEarningsPerShare",
  "NetCashFromOperatingActivities",
  "cash_conversion",
  "NetCashFromInvestingActivities",
  "NetCashFromFinancingActivities",
  "FinanceCosts",
  "interest_coverage",
  "DepreciationAndAmortisation",
  "TotalExpenses",
  "EmployeeBenefitExpense",
  "CostOfMaterials",
  "TaxExpense",
  "effective_tax_rate"
];
var MATERIAL_RANK = new Map(MATERIAL_ORDER.map((id, index) => [id, index]));
function shortDate(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return "\u2014";
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return formatIst(/* @__PURE__ */ new Date(`${raw}T00:00:00Z`), false);
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return raw.slice(0, 16);
  return formatIst(parsed, /T\d{2}:\d{2}/.test(raw) && !/T00:00:00/.test(raw));
}
var IST_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function formatIst(date, withTime) {
  const ist = new Date(date.getTime() + 5.5 * 60 * 60 * 1e3);
  const day = String(ist.getUTCDate()).padStart(2, "0");
  const month = IST_MONTHS[ist.getUTCMonth()];
  const year = String(ist.getUTCFullYear()).slice(2);
  if (!withTime) return `${day} ${month} ${year}`;
  const hh = String(ist.getUTCHours()).padStart(2, "0");
  const mm = String(ist.getUTCMinutes()).padStart(2, "0");
  return `${day} ${month} ${year} ${hh}:${mm}`;
}

// terminal/panels.js
var validate2;
try {
  ({ validate: validate2 } = await Promise.resolve().then(() => (init_schemas(), schemas_exports)));
} catch {
  validate2 = (_name, data) => data;
}
function renderSummary(summary) {
  if (!summary) return "";
  return pc("muted", `\u2504 ${summary}`);
}
function renderFootnote(footnote) {
  if (!footnote) return "";
  return pc("muted", `  ${footnote}`);
}
var STALE_THRESHOLD_MS = 5 * 60 * 1e3;
function stalenessTag(data) {
  if (!data?._timestamp) return "";
  const age = Date.now() - Number(data._timestamp);
  if (age < STALE_THRESHOLD_MS) return "";
  const minutes = Math.round(age / 6e4);
  return pc("muted", ` (${minutes}m ago)`);
}
var SKEL_CHARS = "\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591";
function skeleton(name, width) {
  const label = name ? name.toUpperCase() : "\u2026";
  const inner = Math.max(8, width - 2);
  const skelLine = `${DIM}${SKEL_CHARS.slice(0, inner)}${RESET}`;
  const labelStr = pc("muted", `  ${label}`);
  return labelStr + "\n" + skelLine;
}
function errorPanel(message) {
  return pc("warning", `\u26A0 `) + pc("muted", String(message || "Error"));
}
function descriptiveFallback(name, data, reason) {
  const panelLabel = (name || "UNKNOWN").toUpperCase();
  if (reason) {
    return pc("muted", `[${panelLabel}] \u2014 ${reason}`);
  }
  const schemas2 = {
    quote: "object with { ticker }",
    chart: "object with { values: number[] }",
    technical: "object with optional { rsi, macd, trend, signals, gauges }",
    rsi: "object with { value: number }",
    analyst: "object with { ratings: {buy, hold, sell}, priceTarget }",
    macro: "object with { pillars: [{label, value, direction}] }",
    news: "object with { items: [{title, source, time, url}] }",
    verdict: "object with { thesis, signal, levels, risks }",
    gauge: "object with { value: number }",
    gauges: "object with { items: [{value, label, preset}] }",
    correlationMatrix: "object with { tickers: string[], matrix: number[][] }",
    treeMap: "object with { items: [{label, weight, value?}] }",
    flowSankey: "object with { nodes: [{label, value}] }"
  };
  const expected = schemas2[name] || "object";
  const got = data === null ? "null" : Array.isArray(data) ? "array" : typeof data;
  return pc("muted", `[${panelLabel}] \u2014 data shape error (expected ${expected}, got ${got})`);
}
var EARLY = (str) => ({ earlyReturn: str });
function renderQuotePanel(data, width) {
  const quoteData = { ...data, width };
  return quoteHeader(quoteData);
}
function renderChartPanel(data, width) {
  const { values, volume, label, height, showAxis, fill } = data;
  if (!values?.length) return EARLY(pc("muted", "\u2014 No chart data"));
  return brailleChart({ values, width, height, showAxis, volume, label, fill });
}
function renderRsiPanel(data, width) {
  const { value, signals } = data;
  const barWidth = Math.max(10, Math.floor(width * 0.5));
  let out = gaugeBar({ value, label: "RSI(14)", preset: "rsi", width: barWidth });
  if (signals.length > 0) {
    out += "\n" + signals.map((s) => pc("label", `  \xB7 `) + pc("data", s)).join("\n");
  }
  return out;
}
function renderTechnicalPanel(data, width) {
  const { rsi, macd, macdSignal, trend, signals, gauges: techGauges, support, resistance, signal, confidence } = data;
  const lines = [];
  const barWidth = Math.max(10, Math.floor(width * 0.5));
  if (techGauges.length > 0) {
    lines.push(gaugeStack(techGauges.map((g) => ({ ...g, width: barWidth }))));
    if (signals.length > 0) {
      lines.push(signals.map((s) => pc("label", "\xB7 ") + pc("data", s)).join("\n"));
    }
  } else {
    if (rsi != null) {
      lines.push(gaugeBar({ value: Number(rsi), label: "RSI(14)", preset: "rsi", width: barWidth }));
    }
    if (macd != null) {
      const sigStr = macdSignal != null ? ` (sig ${Number(macdSignal).toFixed(2)})` : "";
      lines.push(pc("label", "MACD ") + pc("data", `${Number(macd).toFixed(2)}${sigStr}`));
    }
    if (trend) {
      const d = String(trend).toLowerCase();
      const role = d.includes("bear") ? "negative" : d.includes("bull") ? "positive" : "muted";
      lines.push(pc("label", "Trend: ") + pc(role, d));
    }
    if (support != null || resistance != null) {
      const parts = [];
      if (support != null) parts.push(`Support $${Number(support).toFixed(2)}`);
      if (resistance != null) parts.push(`Res $${Number(resistance).toFixed(2)}`);
      lines.push(pc("label", parts.join(" | ")));
    }
    if (signal) {
      lines.push(pc("label", "Signal: ") + coloredSignal(signal, confidence));
    }
    if (signals.length > 0 && lines.length < 2) {
      lines.push(signals.map((s) => pc("label", "\xB7 ") + pc("data", s)).join("\n"));
    }
  }
  return lines.length > 0 ? lines.join("\n") : pc("muted", "\u2014 No technical data");
}
function renderAnalystPanel(data, width) {
  const analystData = { ...data, width };
  return analystBar(analystData);
}
function renderMacroPanel(data, width) {
  const { pillars, title } = data;
  const variant = data.variant ?? "plain";
  if (!pillars.length) return EARLY(pc("muted", "\u2014 No macro data"));
  return macroDashboard({ pillars, width, title, variant });
}
function renderNewsPanel(data, width) {
  const { items, limit } = data;
  return newsStream({ items, width, limit });
}
function renderVerdictPanel(data, width, _panelWarnings) {
  const useBoxed = data.variant === "boxed";
  if (!useBoxed) {
    const vLines = [];
    const pushList = (title, items, bullet, role = "data") => {
      if (!Array.isArray(items) || !items.length) return;
      vLines.push(pc("label", title));
      for (const item of items) {
        for (const [index, line] of wordWrap(String(item), Math.max(1, width - 2)).entries()) {
          vLines.push(pc(role, `${index ? "  " : bullet}${renderMarkdownInline(line)}`));
        }
      }
    };
    if (data.title) vLines.push(pc("accent", data.title));
    if (Array.isArray(data.sections)) {
      for (const section of data.sections) {
        switch (section.type) {
          case "conviction":
            vLines.push(convictionBadge(section.conviction || section.value));
            if (section.timeframe) {
              const hasLevelsSection = data.sections.some((s) => s.type === "levels");
              if (!hasLevelsSection) {
                vLines.push(pc("label", "Timeframe: ") + pc("data", String(section.timeframe)));
              }
            }
            break;
          case "memory": {
            const { prior, changed } = section;
            const note = changed ? " \xB7 conviction changed" : " \u2014 conviction held";
            vLines.push(`${DIM}\u2504 ${prior || ""}${note}${RESET}`);
            break;
          }
          case "thesis": {
            const { text } = section;
            if (!text) break;
            vLines.push(pc("label", "INVESTMENT VIEW"));
            for (const line of wordWrap(text, width)) {
              vLines.push(pc("data", renderMarkdownInline(line)));
            }
            break;
          }
          case "catalysts": {
            pushList("CATALYSTS", section.items, "\u2726 ", "positive");
            break;
          }
          case "risks": {
            pushList("RISKS", section.items, "\u26A0 ", "warning");
            break;
          }
          case "bull_case": {
            pushList("BULL CASE", section.items, "+ ", "positive");
            break;
          }
          case "bear_case": {
            pushList("BEAR CASE", section.items, "\u2212 ", "negative");
            break;
          }
          case "facts":
          case "interpretation": {
            const { items } = section;
            if (!Array.isArray(items) || !items.length) break;
            vLines.push(pc("label", section.type === "facts" ? "FACTS" : "INTERPRETATION"));
            for (const item of items) {
              for (const [index, line] of wordWrap(String(item), Math.max(1, width - 2)).entries()) {
                vLines.push(pc("data", `${index ? "  " : "\u2022 "}${renderMarkdownInline(line)}`));
              }
            }
            break;
          }
          case "levels": {
            const { support, resistance, timeframe: tf } = section;
            if (tf) {
              vLines.push(pc("label", "Timeframe: ") + pc("data", String(tf)));
            }
            const parts = [];
            if (support != null) parts.push(`Support $${support}`);
            if (resistance != null) parts.push(`Resistance $${resistance}`);
            if (parts.length) vLines.push(pc("label", parts.join("  \xB7  ")));
            break;
          }
          case "context": {
            const { text } = section;
            if (!text) break;
            for (const line of wordWrap(text, width)) {
              vLines.push(pc("muted", line));
            }
            break;
          }
          case "comparison": {
            const { text } = section;
            if (!text) break;
            for (const line of wordWrap(text, width)) {
              vLines.push(pc("data", line));
            }
            break;
          }
          case "invalidation": {
            const { text } = section;
            if (!text) break;
            for (const line of wordWrap(text, width)) {
              vLines.push(`${DIM}${pc("data", line)}${RESET}`);
            }
            break;
          }
          default:
            break;
        }
      }
      for (const warnMsg of _panelWarnings) {
        for (const line of wordWrap(String(warnMsg), width)) vLines.push(pc("warning", line));
      }
      return vLines.join("\n");
    }
    if (data.conviction) {
      vLines.push(convictionBadge(data.conviction));
    } else if (data.signal) {
      vLines.push(coloredSignal(data.signal, data.confidence));
    }
    const thesis = data.thesis || "";
    if (thesis) {
      for (const line of wordWrap(thesis, width)) {
        vLines.push(pc("data", renderMarkdownInline(line)));
      }
    }
    if (data.timeframe) {
      vLines.push(pc("label", "Timeframe: ") + pc("data", String(data.timeframe)));
    }
    if (Array.isArray(data.catalysts) && data.catalysts.length > 0) {
      for (const catalyst of data.catalysts) {
        vLines.push(pc("positive", "\u2726 ") + pc("data", String(catalyst)));
      }
    }
    if (Array.isArray(data.risks) && data.risks.length > 0) {
      for (const risk of data.risks) {
        vLines.push(pc("warning", "\u26A0 ") + pc("data", String(risk)));
      }
    }
    if (data.levels) {
      const parts = [];
      if (data.levels.support != null) parts.push(`Support $${data.levels.support}`);
      if (data.levels.resistance != null) parts.push(`Resistance $${data.levels.resistance}`);
      if (parts.length) vLines.push(pc("label", parts.join("  \xB7  ")));
    }
    for (const warnMsg of _panelWarnings) {
      vLines.push(pc("warning", warnMsg));
    }
    return vLines.join("\n");
  }
  const verdictData = { ...data, width, warnings: _panelWarnings };
  return verdict(verdictData);
}
function renderGaugePanel(data, width) {
  const barWidth = Math.max(10, Math.floor(width * 0.5));
  return gaugeBar({ ...data, width: barWidth });
}
function renderGaugesPanel(data, width) {
  const { items: gaugeItems } = data;
  if (!gaugeItems.length) return EARLY(pc("muted", "\u2014 No gauge data"));
  const barWidth = Math.max(10, Math.floor(width * 0.45));
  return gaugeStack(gaugeItems.map((g) => ({ ...g, width: barWidth })));
}
function renderInsidersPanel(data, width) {
  const { transactions = [] } = data;
  if (!transactions.length) return EARLY(pc("muted", "\u2014 No insider data"));
  return insiderTimeline({ transactions, width });
}
function renderEarningsPanel(data, width) {
  const { quarters = [] } = data;
  if (!quarters.length) return EARLY(pc("muted", "\u2014 No earnings data"));
  return earningsSurprise({ quarters, width });
}
function renderHoldersPanel(data, width) {
  const { holders = [] } = data;
  if (!holders.length) return EARLY(pc("muted", "\u2014 No holder data"));
  const limit = data.limit != null ? Math.min(Number(data.limit) || 5, 20) : void 0;
  return holderBar({ holders, width, limit });
}
function renderFilingsPanel(data, width) {
  const { filings = [] } = data;
  if (!filings.length) return EARLY(pc("muted", "\u2014 No filing data"));
  return filingTimeline({ filings, width });
}
function renderHeatmapPanel(data, width) {
  const { rows: heatRows = [], columns = [] } = data;
  if (!heatRows.length) return EARLY(pc("muted", "\u2014 No heatmap data"));
  return heatMap({ rows: heatRows, columns, width, colorScale: data.colorScale });
}
function renderCandlestickPanel(data, width) {
  const { bars = [] } = data;
  if (!bars.length) return EARLY(pc("muted", "\u2014 No candlestick data"));
  return candlestickChart({ bars, width, height: data.height, label: data.label });
}
function renderWaterfallPanel(data, width) {
  const { items: wfItems = [] } = data;
  if (!wfItems.length) return EARLY(pc("muted", "\u2014 No waterfall data"));
  return waterfallChart({ items: wfItems, width, showDelta: data.showDelta });
}
function renderCorrelationMatrixPanel(data, width) {
  const { tickers = [], matrix: corrMatrix = [] } = data;
  if (!tickers.length) return EARLY(pc("muted", "\u2014 No correlation data"));
  return correlationMatrix({ tickers, matrix: corrMatrix, width, title: data.title });
}
function renderTreeMapPanel(data, width) {
  const { items: tmItems = [] } = data;
  if (!tmItems.length) return EARLY(pc("muted", "\u2014 No treemap data"));
  return treeMap({ items: tmItems, width, height: data.height || 10 });
}
function renderFlowSankeyPanel(data, width) {
  const { nodes = [], flows: flowEdges = [] } = data;
  if (!nodes.length) return EARLY(pc("muted", "\u2014 No flow data"));
  return flowSankey({ nodes, flows: flowEdges, width });
}
function unknownPanelFallback(name, data, width) {
  const panelLabel = (name || "UNKNOWN").toUpperCase();
  const lines = [pc("muted", `[${panelLabel}]`)];
  const PRIVATE_KEYS = /* @__PURE__ */ new Set(["_error", "_timestamp", "_annotations", "summary", "footnote", "highlights", "annotations", "groups"]);
  const keyWidth = 14;
  for (const [key, val] of Object.entries(data)) {
    if (PRIVATE_KEYS.has(key)) continue;
    const keyStr = padRight(String(key), keyWidth);
    let valStr;
    if (val === null || val === void 0) {
      valStr = pc("muted", "\u2014");
    } else if (Array.isArray(val)) {
      valStr = pc("data", `[${val.length} items]`);
    } else if (typeof val === "object") {
      valStr = pc("data", JSON.stringify(val).slice(0, Math.max(10, width - keyWidth - 4)));
    } else {
      valStr = pc("data", String(val).slice(0, Math.max(10, width - keyWidth - 4)));
    }
    lines.push(pc("label", keyStr) + " " + valStr);
  }
  if (lines.length === 1) {
    lines.push(pc("muted", "(no data)"));
  }
  return lines.join("\n");
}
var handlers = {
  quote: renderQuotePanel,
  chart: renderChartPanel,
  rsi: renderRsiPanel,
  technical: renderTechnicalPanel,
  analyst: renderAnalystPanel,
  macro: renderMacroPanel,
  news: renderNewsPanel,
  verdict: renderVerdictPanel,
  gauge: renderGaugePanel,
  gauges: renderGaugesPanel,
  insiders: renderInsidersPanel,
  earnings: renderEarningsPanel,
  holders: renderHoldersPanel,
  filings: renderFilingsPanel,
  heatmap: renderHeatmapPanel,
  candlestick: renderCandlestickPanel,
  waterfall: renderWaterfallPanel,
  correlationMatrix: renderCorrelationMatrixPanel,
  treeMap: renderTreeMapPanel,
  flowSankey: renderFlowSankeyPanel
};
function renderPanel(name, data, width = 80) {
  if (data == null) {
    return skeleton(name, width);
  }
  if (data._error) {
    return errorPanel(data._error);
  }
  const validated = validate2(name, data);
  if (validated === null) {
    return descriptiveFallback(name, data);
  }
  let _panelWarnings = [];
  if (validated !== null && typeof validated === "object" && Array.isArray(validated.warnings) && "data" in validated) {
    _panelWarnings = validated.warnings;
    data = validated.data;
  } else {
    data = validated;
  }
  if (data.highlights || data.annotations || data.groups) {
    data._annotations = {
      highlights: data.highlights || [],
      annotations: data.annotations || {},
      groups: data.groups || []
    };
  }
  const handler = handlers[name];
  if (!handler) {
    return unknownPanelFallback(name, data, width);
  }
  const handlerResult = handler(data, width, _panelWarnings);
  if (handlerResult && typeof handlerResult === "object" && "earlyReturn" in handlerResult) {
    return handlerResult.earlyReturn;
  }
  let result = handlerResult;
  const summaryLine = renderSummary(data.summary);
  const footnoteLine = renderFootnote(data.footnote);
  if (summaryLine) result = summaryLine + "\n" + result;
  if (footnoteLine) result = result + "\n" + footnoteLine;
  const stale = stalenessTag(data);
  return stale ? result + "\n" + stale : result;
}

// terminal/engine.js
var TABLE_COLOR_ROLE_ALIASES = {
  green: "positive",
  red: "negative"
};
function resolveWidth(w, parentWidth) {
  if (w == null) return parentWidth;
  if (w > 0 && w <= 1) return Math.max(1, Math.floor(parentWidth * w));
  return Math.max(1, Math.floor(w));
}
function sideBySide(leftStr, rightStr, leftWidth, rightWidth, gap = 2) {
  const leftLines = leftStr.split("\n");
  const rightLines = rightStr.split("\n");
  const maxLen = Math.max(leftLines.length, rightLines.length);
  const rows = [];
  for (let i = 0; i < maxLen; i++) {
    let l = leftLines[i] ?? "";
    const r = rightLines[i] ?? "";
    if (visLen(l) > leftWidth) l = ansiTrunc(l, leftWidth);
    const lPad = Math.max(0, leftWidth - visLen(l));
    rows.push(l + " ".repeat(lPad + gap) + r);
  }
  return rows.join("\n");
}
function renderTable(spec, width) {
  const { headers = [], rows = [], align = [] } = spec;
  const colCount = Math.max(headers.length, ...rows.map((r) => r.cells?.length ?? 0));
  if (colCount === 0) return pc("muted", "\u2014 empty table");
  const colWidths = [];
  for (let c2 = 0; c2 < colCount; c2++) {
    const headerLen = visLen(String(headers[c2] ?? ""));
    const maxCellLen = Math.max(
      headerLen,
      ...rows.map((r) => visLen(String(r.cells?.[c2] ?? "")))
    );
    colWidths.push(maxCellLen + 2);
  }
  const MIN_COL = 8;
  let totalWidth = colWidths.reduce((a, b) => a + b, 0);
  while (totalWidth > width) {
    let widest = 0;
    for (let c2 = 1; c2 < colCount; c2++) if (colWidths[c2] > colWidths[widest]) widest = c2;
    if (colWidths[widest] <= MIN_COL) break;
    const trim = Math.min(colWidths[widest] - MIN_COL, totalWidth - width);
    colWidths[widest] -= trim;
    totalWidth -= trim;
  }
  let visibleCols = colCount;
  while (totalWidth > width && visibleCols > 1) {
    totalWidth -= colWidths[visibleCols - 1];
    visibleCols--;
  }
  function formatCell(val, col, role) {
    let str = String(val ?? "");
    if (visLen(str) > colWidths[col]) str = ansiTrunc(str, Math.max(1, colWidths[col] - 2)) + "\u2026";
    const autoColored = role ? str : colorTablePercent(str);
    const hasAutoColor = autoColored !== str;
    const w = colWidths[col];
    const a = align[col] ?? "left";
    let padded;
    if (a === "right") {
      padded = padLeft(autoColored, Math.max(1, w - 1)) + " ";
    } else if (a === "center") {
      const vis = visLen(autoColored);
      const leftPad = Math.floor((w - vis) / 2);
      const rightPad = w - vis - leftPad;
      padded = " ".repeat(Math.max(0, leftPad)) + autoColored + " ".repeat(Math.max(0, rightPad));
    } else {
      padded = padRight(autoColored, w);
    }
    if (role) return pc(role, padded);
    if (hasAutoColor) return padded;
    return pc("data", padded);
  }
  const lines = [];
  if (headers.length > 0) {
    const headerCells = [];
    for (let c2 = 0; c2 < visibleCols; c2++) {
      headerCells.push(pc("label", formatCell(headers[c2] ?? "", c2)));
    }
    lines.push(headerCells.join(""));
  }
  for (const row of rows) {
    const cells = [];
    for (let c2 = 0; c2 < visibleCols; c2++) {
      const val = row.cells?.[c2] ?? "";
      const rawRole = row.colors?.[String(c2)] ?? null;
      const role = typeof rawRole === "string" ? TABLE_COLOR_ROLE_ALIASES[rawRole.trim().toLowerCase()] ?? rawRole : rawRole;
      cells.push(formatCell(val, c2, role));
    }
    lines.push(cells.join(""));
  }
  return lines.join("\n");
}
function renderRow(children, width, gap = 2) {
  if (!children?.length) return "";
  const hasExplicitWidths = children.some((child) => child.w != null);
  const colsPerChild = Math.floor((width - 2 * Math.max(0, children.length - 1)) / children.length);
  if (!hasExplicitWidths && colsPerChild < 25) {
    return children.map((child) => renderBlock(child, width)).join("\n");
  }
  const totalGap = gap * Math.max(0, children.length - 1);
  const availableWidth = width - totalGap;
  const childWidths = children.map((child) => {
    if (child.w != null) return resolveWidth(child.w, availableWidth);
    return null;
  });
  const explicitTotal = childWidths.reduce((sum, w) => sum + (w ?? 0), 0);
  const autoCount = childWidths.filter((w) => w == null).length;
  const autoWidth = autoCount > 0 ? Math.max(1, Math.floor((availableWidth - explicitTotal) / autoCount)) : 0;
  const resolvedWidths = childWidths.map((w) => w ?? autoWidth);
  const rendered = children.map((child, i) => {
    const { w: _w, ...childWithoutW } = child;
    return renderBlock(childWithoutW, resolvedWidths[i]);
  });
  const summaryLineCounts = rendered.map((str) => {
    const lines = str.split("\n");
    let count = 0;
    for (const line of lines) {
      if (strip(line).startsWith("\u2504")) count++;
      else break;
    }
    return count;
  });
  const maxSummaryLines = Math.max(...summaryLineCounts);
  if (maxSummaryLines > 0) {
    for (let i = 0; i < rendered.length; i++) {
      const pad = maxSummaryLines - summaryLineCounts[i];
      if (pad > 0) {
        rendered[i] = "\n".repeat(pad) + rendered[i];
      }
    }
  }
  let result = rendered[0];
  let leftWidth = resolvedWidths[0];
  for (let i = 1; i < rendered.length; i++) {
    result = sideBySide(result, rendered[i], leftWidth, resolvedWidths[i], gap);
    leftWidth += gap + resolvedWidths[i];
  }
  return result;
}
function renderBlock(block, width) {
  if (!block || typeof block !== "object") return "";
  if (block.panel != null) {
    const blockWidth = resolveWidth(block.w, width);
    return renderPanel(block.panel, block.data ?? null, blockWidth);
  }
  for (const key of PANEL_NAMES_SET) {
    if (block[key] != null) {
      return renderPanel(key, block[key], resolveWidth(block.w, width));
    }
  }
  if (block.table != null) {
    return renderTable(block.table, width);
  }
  if (Array.isArray(block.row)) {
    return renderRow(block.row, width, block.gap ?? 2);
  }
  if (Array.isArray(block.stack)) {
    return block.stack.map((child) => renderBlock(child, width)).join("\n");
  }
  if (block.divider != null) {
    return boxDivider(width, String(block.divider));
  }
  if (block.text != null) {
    const t = String(block.text);
    if (t.startsWith("\u2590\u2588\u2588")) return pc("accent", t);
    return t;
  }
  if (block.spacer != null) {
    const n = Math.max(0, Number(block.spacer) || 0);
    return n === 0 ? "" : "\n".repeat(n - 1);
  }
  return "";
}
function renderBlocks(blocks, width = 80) {
  if (!Array.isArray(blocks) || blocks.length === 0) return "";
  return blocks.map((block) => renderBlock(block, width)).join("\n").replace(/(^|[^A-Z0-9_])(\[E\d{1,4}\]|E\d{1,4})(?![A-Z0-9_])/gim, "$1\x1B[7;1m$2\x1B[22;27m");
}
function presetToBlocks(layout, panels) {
  switch (layout) {
    case "deep-dive":
      return deepDiveBlocks(panels);
    case "compare":
      return compareBlocks(panels);
    case "macro":
      return macroBlocks(panels);
    case "pulse":
      return pulseBlocks(panels);
    default:
      return [{ text: pc("muted", `Unknown layout: ${layout}`) }];
  }
}
function deepDiveBlocks(panels) {
  const toolCount = Object.values(panels).filter((v) => v != null && !v._error).length;
  const sources = buildSourceList(panels);
  const footerText = pc("muted", `Marked \xB7 ${sources} \xB7 ${toolCount} data calls`);
  return [
    { panel: "quote", data: panels.quote ?? null },
    { spacer: 1 },
    { row: [
      { panel: "chart", data: panels.chart ?? null, w: 0.7 },
      { panel: "technical", data: panels.technical ?? null, w: 0.3 }
    ] },
    { spacer: 1 },
    { divider: "ANALYST" },
    { panel: "analyst", data: panels.analyst ?? null },
    { spacer: 1 },
    { divider: "NEWS" },
    { panel: "news", data: panels.news ?? null },
    { spacer: 1 },
    ...panels.verdict !== void 0 ? [
      { divider: "VERDICT" },
      { panel: "verdict", data: panels.verdict ?? null },
      { spacer: 1 }
    ] : [],
    { text: footerText }
  ];
}
function compareBlocks(panels) {
  let tickers = [];
  if (Array.isArray(panels.tickers)) {
    tickers = panels.tickers.slice(0, 5);
  } else {
    const metaKeys = /* @__PURE__ */ new Set(["_timestamp", "_error", "focused"]);
    tickers = Object.keys(panels).filter((k) => !metaKeys.has(k)).slice(0, 5);
  }
  if (tickers.length === 0) {
    return [{ text: pc("muted", "  No tickers to compare.") }];
  }
  function tickerPanels(t) {
    if (panels[t] && typeof panels[t] === "object" && !Array.isArray(panels[t])) {
      return panels[t];
    }
    const sub = {};
    for (const key of Object.keys(panels)) {
      if (key.startsWith(`${t}_`)) {
        sub[key.slice(t.length + 1)] = panels[key];
      }
    }
    return Object.keys(sub).length > 0 ? sub : {};
  }
  const rowChildren = tickers.map((t) => {
    const td = tickerPanels(t);
    return {
      stack: [
        { panel: "quote", data: { ...td.quote ?? {}, variant: "compact" } },
        { panel: "chart", data: td.chart ?? null },
        { panel: "analyst", data: td.analyst ?? null }
      ]
    };
  });
  return [{ row: rowChildren }];
}
function macroBlocks(panels) {
  return [
    { panel: "macro", data: panels.macro ?? null },
    { spacer: 1 },
    { row: [
      { panel: "chart", data: panels.inflation ?? null, w: 0.5 },
      { panel: "chart", data: panels.rates ?? null, w: 0.5 }
    ] },
    { row: [
      { panel: "chart", data: panels.labor ?? null, w: 0.5 },
      { panel: "chart", data: panels.growth ?? null, w: 0.5 }
    ] }
  ];
}
function pulseBlocks(panels) {
  return [
    { panel: "quote", data: panels.quote ?? null },
    { panel: "news", data: panels.news ?? null }
  ];
}
function buildSourceList(panels) {
  const sources = /* @__PURE__ */ new Set();
  if (panels.quote || panels.chart || panels.analyst || panels.technical || panels.filings || panels.insider || panels.holders) sources.add("Marked");
  if (panels.macro) sources.add("India macro provider");
  if (panels.news) sources.add("external news");
  return [...sources].join(" + ") || "Marked";
}

// terminal/cost.js
var COST_PER_TOOL = 8e-3;
var BASE_LLM_COST = 0.04;
function estimateCost(toolsCalled = 0) {
  const cost = BASE_LLM_COST + toolsCalled * COST_PER_TOOL;
  return `~$${cost.toFixed(2)}`;
}

// terminal/render.js
var _spinnerTick = 0;
function buildHeader(width) {
  const gradMark = `${LIME_D}\u2590${LIME_M}\u2588${BRAND}\u2588${RESET2}`;
  const title = `${BRAND}${BOLD2}MARKED${RESET2}`;
  const sep = `${DIM2} \xB7 ${RESET2}`;
  const s = tui.agentState;
  let left = `  ${gradMark} ${title}`;
  if (s?.skill) left += `${sep}${LABEL}:${s.skill}${RESET2}`;
  if (s?.query) left += `${sep}${BRAND}${s.query}${RESET2}`;
  left = ansiTrunc(left, Math.max(0, width));
  const fillLen = Math.max(0, width - visLen(left));
  return left + `${DIM2}${"\u2500".repeat(fillLen)}${RESET2}`;
}
function renderHelpOverlay(width) {
  const rows = process.stdout.rows ?? 24;
  if (rows < 12) {
    return `${DIM2}type to ask  \u23CE send  ^C cancel  PgUp/Dn scroll  ^S save  ^G close  ^D quit${RESET2}`;
  }
  const sep = `${DIM2}${"\u2500".repeat(width)}${RESET2}`;
  const K = (key, desc) => `  ${BRAND}${key.padEnd(26)}${RESET2}${DIM2}${desc}${RESET2}`;
  const lines = [
    "",
    `  ${BRAND}${BOLD2}MARKED${RESET2}  ${DIM2}Keyboard Reference${RESET2}`,
    sep,
    "",
    `  ${BRAND}${BOLD2}COMMAND LINE${RESET2}`,
    K("(just type)", "The prompt is always open \u2014 no key opens it"),
    K("Enter", "Ask"),
    K("\u2191 \u2193", "Previous / next question"),
    K("Ctrl+C", "Cancel the running query, else clear the line"),
    K("Ctrl+U", "Clear the line"),
    K("Ctrl+D", "Quit (empty line only)"),
    "",
    `  ${BRAND}${BOLD2}COMPANY WORLD${RESET2}  ${DIM2}a company as a workspace${RESET2}`,
    K("/world <company>", "Open a world \u2014 name, ticker, ISIN or CIN"),
    K("overview \u2026 evidence", "Switch tab \u2014 including NEWS, \u2190 \u2192 to step"),
    K("/chart <measure>", "revenue \xB7 pat \xB7 roe \xB7 roce \xB7 net_debt \xB7 margins \xB7 price"),
    K("/chart revenue 5y yoy", "Add a range (1M\u2026MAX) and a view (yoy, indexed, cagr)"),
    K("<any question>", "Answered about the open company \u2014 no need to name it"),
    K("\u2190 / \u2192", "Previous / next tab"),
    K("E12  or  /e 12", "Open the source behind a number"),
    K("evidence", "Every fact this world retrieved, with references"),
    K("/world", "Search \u2014 recent companies first, then type to find any"),
    K("/market", "Rates, the rupee, and the commodity complex"),
    K("/news rates", "Market news by topic or region \u2014 works anywhere"),
    K("/news", "In a world: that company. Outside: the whole feed"),
    K("/compare A B C", "Two to five companies, side by side, same arithmetic"),
    K("/exit", "Leave the world"),
    "",
    `  ${BRAND}${BOLD2}FAST PATH${RESET2}  ${DIM2}data only \u2014 no reasoning model, no spend${RESET2}`,
    K("RELIANCE", "A company, straight to its panels"),
    K("FA <company>", "Financial profile"),
    K("GP <company>", "Price history"),
    K("OWN <company>", "Promoter, FII, DII, pledge"),
    K("ANR <company>", "Announcements and filings"),
    K("CACS <company>", "Corporate actions and events"),
    "",
    `  ${BRAND}${BOLD2}NAVIGATION${RESET2}`,
    K("PgUp  PgDn", "Scroll one page"),
    K("Ctrl+\u2191  Ctrl+\u2193", "Scroll one line"),
    K("Home  End", "Jump to top / bottom"),
    K("Tab  Shift+Tab", "Next / previous panel"),
    "",
    `  ${BRAND}${BOLD2}ACTIONS${RESET2}`,
    K("Ctrl+S  /save", "Save report to ~/.marked/reports/"),
    K("Ctrl+O  /load", "Load a saved report"),
    K("Ctrl+G  /help", "Toggle this help"),
    K("/reset", "Return to splash (runtime stays connected)"),
    K("/quit", "Quit the terminal"),
    K("/marked <key>", "Save the Marked API key"),
    K("/history", "Show saved conversation turns"),
    K(`${LIVE[0]} ${LIVE[1]}`, LIVE[2]),
    K("/new", "Start a fresh conversation"),
    K("/model  /models", "Pick the provider, connect keys and discover models"),
    K("/model claude opus", "Set provider and model without the picker"),
    K("/1 \u2026 /9", "Run a follow-up query"),
    "",
    `  ${BRAND}${BOLD2}THE TEAM${RESET2}`,
    ...DESK.map(([name, arg, desc]) => K(`${name}${arg ? ` ${arg}` : ""}`, desc)),
    "",
    `  ${BRAND}${BOLD2}POWER WORKFLOWS${RESET2}`,
    ...CAPABILITIES.map(([name, arg, desc]) => K(`${name} ${arg}`, desc)),
    "",
    sep,
    `  ${DIM2}Marked runtime owns credentials, data and reasoning.${RESET2}`
  ];
  return lines.join("\n");
}
var DESK_COMMANDS = /* @__PURE__ */ new Set([
  ...DESK.map(([name]) => name.slice(1)),
  ...CAPABILITIES.map(([name]) => name.slice(1)),
  "marked",
  "model",
  "models",
  "new",
  "history",
  "help",
  "live"
]);
function highlightCommand(value) {
  const match = String(value).match(/^\/([a-z]+)(\b[\s\S]*)?$/i);
  if (!match || !DESK_COMMANDS.has(match[1].toLowerCase())) return value;
  return `${BRAND}${BOLD2}/${match[1]}${RESET2}${match[2] ?? ""}`;
}
function renderQueryLines(width, value = "", maxLines = 1) {
  const displayValue = /^\/marked\s+\S+$/.test(value) ? value.replace(/^(\/marked\s+)\S+$/, (_match, prefix2) => `${prefix2}${"\u2022".repeat(value.length - prefix2.length)}`) : value;
  const ticker = tui.scope?.ticker;
  const label = ticker ? ` ${ticker} ` : " query ";
  const prefix = `${LABEL}${label}${RESET2}${BRAND}\u203A${RESET2} `;
  const indent = " ".repeat(visLen(prefix));
  const contentWidth = Math.max(1, width - visLen(prefix) - 1);
  let wrapped = wordWrap(displayValue, contentWidth).flatMap((line) => line.length > contentWidth ? Array.from({ length: Math.ceil(line.length / contentWidth) }, (_, index) => line.slice(index * contentWidth, (index + 1) * contentWidth)) : [line]);
  if (!wrapped.length) wrapped = [""];
  if (wrapped.length > maxLines) {
    wrapped = wrapped.slice(-maxLines);
    wrapped[0] = `\u2026${wrapped[0].slice(1)}`;
  }
  return wrapped.map((line, index) => {
    const start = index === 0 ? prefix : indent;
    const cursor = index === wrapped.length - 1 ? `${BRAND}\u2588${RESET2}` : "";
    return start + (index === 0 ? highlightCommand(line) : line) + cursor;
  });
}
var PROMPT_ROWS = 3;
function renderPromptBlock(width, value = "", context = void 0, totalRows = process.stdout.rows ?? 24) {
  const s = tui.agentState;
  const running = s && (s.stage === "gathering" || s.stage === "analyzing" || s.stage === "resolving");
  const scopeSource = context === void 0 ? tui.scope : context;
  const detail = typeof scopeSource === "string" ? scopeSource : scopeSource?.detail;
  const scope = detail ? `${DIM2} ${detail} ${RESET2}` : "";
  const ruleWidth = Math.max(0, width - visLen(scope));
  const rule = `${DIM2}${"\u2500".repeat(ruleWidth)}${RESET2}${scope}`;
  const maxFieldRows = Math.max(1, Math.floor(totalRows / 2) - 2);
  const fields = renderQueryLines(Math.max(1, width - 1), value, maxFieldRows);
  const hints = running ? [`${BRAND}\u25B8\u25B8${RESET2} ${DIM2}working${RESET2}`, "^C cancel", "PgUp/Dn scroll"] : value ? [`${BRAND}\u25B8\u25B8${RESET2} ${DIM2}\u23CE to ask${RESET2}`, "^C clear", "^G help"] : [`${BRAND}\u25B8\u25B8${RESET2} ${DIM2}type to ask${RESET2}`, "/help", "^S save", "^O load", "^D quit"];
  const hint = hints[0] + `${DIM2}` + hints.slice(1).map((part) => `  ${part}`).join("") + `${RESET2}`;
  return [rule, ...fields, ansiTrunc(hint, width)];
}
function runLayout(layoutOrBlocks, panels, width, focused, rows = null) {
  try {
    const blocks = Array.isArray(layoutOrBlocks) ? layoutOrBlocks : presetToBlocks(layoutOrBlocks, panels ?? {});
    return fillHeight(blocks, width, rows);
  } catch (err) {
    return `${DIM2}\u26A0 Render error: ${err.message}${RESET2}`;
  }
}
function fillHeight(blocks, width, rows) {
  const once = renderBlocks(blocks, width);
  if (!rows || !Array.isArray(blocks)) return once;
  const growable = findGrowable(blocks);
  if (!growable) return once;
  const available = rows - 2 - renderPromptBlock(width, tui.queryInput ?? "", tui.scope ?? null, rows).length;
  const used = once.split("\n").length;
  const slack = available - used;
  if (slack < 2) return once;
  const current = Number(growable.data?.height) || 0;
  const grown = blocks.map((block) => substitute(block, growable, current + slack));
  return renderBlocks(grown, width);
}
function findGrowable(blocks) {
  for (const block of blocks) {
    if (block?.grow && block.data) return block;
    const children = block?.row ?? block?.stack;
    if (Array.isArray(children)) {
      const found = findGrowable(children);
      if (found) return found;
    }
  }
  return null;
}
function substitute(block, target, height) {
  if (block === target) return { ...block, data: { ...block.data, height } };
  if (Array.isArray(block?.row)) return { ...block, row: block.row.map((child) => substitute(child, target, height)) };
  if (Array.isArray(block?.stack)) return { ...block, stack: block.stack.map((child) => substitute(child, target, height)) };
  return block;
}
function fitSides(left, right, width) {
  if (visLen(right) >= width) return ansiTrunc(right, Math.max(0, width));
  left = ansiTrunc(left, Math.max(0, width - visLen(right) - 1));
  return left + " ".repeat(Math.max(1, width - visLen(left) - visLen(right))) + right;
}
function buildFooter(width) {
  const m = tui.renderMeta;
  const s = tui.agentState;
  const gradMark = `${LIME_D}\u2590${LIME_M}\u2588${BRAND}\u2588${RESET2}`;
  const meshLabel = `${BRAND}${BOLD2}MARKED${RESET2}`;
  const sep = `${DIM2} \xB7 ${RESET2}`;
  if (s && (s.stage === "gathering" || s.stage === "analyzing")) {
    const spin = `${BRAND}${SPINNER_FRAMES[_spinnerTick % SPINNER_FRAMES.length]}${RESET2}`;
    const progress = s.progress;
    const label = progress?.phase === "writing" ? "Writing" : s.stage === "gathering" ? "Gathering" : "Analyzing";
    const parts = [
      `  ${gradMark} ${spin}`,
      `${DIM2}${label}${RESET2}`
    ];
    if (s.skill) parts.push(`${LABEL}:${s.skill}${RESET2}`);
    if (s.query) parts.push(`${BRAND}${s.query}${RESET2}`);
    if (s.tools) {
      const { called, total, current } = s.tools;
      parts.push(`${DIM2}${called ?? 0}/${total ?? "?"}${RESET2}`);
      if (current) parts.push(`${DIM2}${current}${RESET2}`);
    }
    if (progress?.phase === "thinking") parts.push(`${DIM2}${(progress.elapsedMs / 1e3).toFixed(1)}s${RESET2}`);
    if (progress?.phase === "writing") {
      if (progress.completed?.length) parts.push(`${LABEL}${progress.completed.slice(-2).join(", ")}${RESET2}`);
      const width2 = 8;
      const filled = Math.min(width2, Math.floor(width2 * (progress.outputTokens || 0) / (progress.targetTokens || 1)));
      parts.push(`${BRAND}${"\u2588".repeat(filled)}${DIM2}${"\u2591".repeat(width2 - filled)}${RESET2}`);
      parts.push(`${DIM2}~${(progress.outputTokens || 0).toLocaleString("en-IN")} tok${RESET2}`);
      if (progress.etaSeconds != null) parts.push(`${DIM2}~${progress.etaSeconds}s left${RESET2}`);
    }
    const left2 = parts.join(` ${DIM2}\xB7${RESET2} `);
    const keys2 = "";
    return fitSides(left2, keys2, width);
  }
  const toolsCalled = tui.agentState?.tools?.called;
  const costStr = m.cost ? `${DIM2}~${m.cost}${RESET2}` : toolsCalled != null ? `${DIM2}${estimateCost(toolsCalled)}${RESET2}` : null;
  const agentLabel2 = s?.agent;
  const modelLabel = s?.model || m.model;
  const toolsLabel = s?.tools?.called != null ? `${s.tools.called} tools` : m.tools ? `${m.tools} tools` : null;
  const meta = [
    agentLabel2 ? `${DIM2}${agentLabel2}${RESET2}` : null,
    modelLabel ? `${DIM2}${modelLabel}${RESET2}` : null,
    toolsLabel ? `${DIM2}${toolsLabel}${RESET2}` : null,
    costStr,
    m.as_of ? `${DIM2}${shortDate(m.as_of)} IST${RESET2}` : null
  ].filter(Boolean).join(sep);
  const left = `  ${gradMark} ${meshLabel}` + (meta ? `${sep}${meta}` : "");
  const keys = s?.stage === "complete" && s?.follow_ups?.length > 0 ? `${DIM2}/1-/${s.follow_ups.length} to drill${RESET2}` : "";
  return fitSides(left, keys, width);
}
function renderLoadOverlay(width) {
  const lines = [];
  lines.push("");
  lines.push(`  ${BRAND}\u2590${RESET2}${DIM2} Marked${RESET2}  ${LABEL}Load Report${RESET2}`);
  lines.push(`  ${DIM2}\u2191\u2193 navigate \xB7 Enter load \xB7 Esc cancel${RESET2}`);
  lines.push("");
  if (tui.loadList.length === 0) {
    lines.push(`  ${DIM2}No saved reports in ${REPORTS_DIR}${RESET2}`);
  } else {
    tui.loadList.forEach((f, i) => {
      const active = i === tui.loadIdx;
      const cursor = active ? `${BRAND}\u25B6${RESET2}` : " ";
      const label = active ? `${LABEL}${f}${RESET2}` : `${DIM2}${f}${RESET2}`;
      lines.push(`  ${cursor} ${label}`);
    });
  }
  return lines.join("\n");
}
function renderAskOverlay(width) {
  const step = tui.askStep ? `${DIM2}STEP ${tui.askStep.current} OF ${tui.askStep.total}${RESET2}  ` : "";
  const lines = ["", `  ${LIME_D}\u2590${LIME_M}\u2588${BRAND}\u2588${RESET2} ${BRAND}${BOLD2}MARKED${RESET2}  ${step}${LABEL}${tui.askStep?.title || "SELECT"}${RESET2}`];
  lines.push(`${DIM2}${"\u2500".repeat(width)}${RESET2}`, "", `  ${BRAND}${tui.askPrompt || "Which one?"}${RESET2}`);
  if (tui.askHint) lines.push(`  ${DIM2}${ansiTrunc(tui.askHint, Math.max(20, width - 4))}${RESET2}`);
  lines.push(`  ${DIM2}\u2191\u2193 navigate \xB7 Enter choose \xB7 Esc cancel${RESET2}`, "");
  tui.askList.forEach((choice, i) => {
    const active = i === tui.askIdx;
    const cursor = active ? `${BRAND}\u25B6${RESET2}` : " ";
    const label = ansiTrunc(choice.name || String(choice), Math.max(20, width - 30));
    const subtitle = choice.subtitle ? `${DIM2}  ${choice.subtitle}${RESET2}` : "";
    lines.push(`  ${cursor} ${active ? `${LABEL}${label}${RESET2}` : `${DIM2}${label}${RESET2}`}${subtitle}`);
  });
  return lines.join("\n");
}
function renderInputOverlay(width) {
  const step = tui.inputStep ? `${DIM2}STEP ${tui.inputStep.current} OF ${tui.inputStep.total}${RESET2}  ` : "";
  const value = tui.inputSecret ? "\u2022".repeat(tui.inputValue.length) : tui.inputValue;
  return [
    "",
    `  ${LIME_D}\u2590${LIME_M}\u2588${BRAND}\u2588${RESET2} ${BRAND}${BOLD2}MARKED${RESET2}  ${step}${LABEL}${tui.inputStep?.title || "SETUP"}${RESET2}`,
    `${DIM2}${"\u2500".repeat(width)}${RESET2}`,
    "",
    `  ${BRAND}${tui.inputPrompt}${RESET2}`,
    tui.inputHint ? `  ${DIM2}${ansiTrunc(tui.inputHint, Math.max(20, width - 4))}${RESET2}` : "",
    "",
    ansiTrunc(`  ${LABEL}\u203A${RESET2} ${value}${BRAND}\u2588${RESET2}`, Math.max(1, width - 1)),
    "",
    `  ${DIM2}Enter continue \xB7 Esc cancel${RESET2}`
  ].filter((line, index, lines) => line || lines[index - 1] !== "").join("\n");
}
function renderModelOverlay(width) {
  const lines = [];
  lines.push("");
  lines.push(`  ${BRAND}\u2590${RESET2}${DIM2} Marked${RESET2}  ${LABEL}Reasoning Model${RESET2}`);
  lines.push(`  ${DIM2}\u2191\u2193 navigate \xB7 Enter select \xB7 Esc cancel${RESET2}`);
  const stage = tui.agentState?.stage;
  if (stage === "resolving" || stage === "gathering" || stage === "analyzing") {
    lines.push(`  ${palette("warning") ? fg(palette("warning")) : ""}a query is running \u2014 this applies to the next one, or ^C to cancel it first${RESET2}`);
  }
  lines.push("");
  if (tui.modelList.length === 0) {
    lines.push(`  ${DIM2}No reasoning providers available${RESET2}`);
    return lines.join("\n");
  }
  let provider = null;
  tui.modelList.forEach((entry, i) => {
    if (entry.agent !== provider) {
      provider = entry.agent;
      lines.push(`  ${DIM2}${agentLabel(provider)}${entry.status ? ` \xB7 ${entry.status}` : ""}${RESET2}`);
    }
    const active = i === tui.modelIdx;
    const current = entry.agent === tui.modelCurrent?.agent && (entry.id ?? null) === (tui.modelCurrent?.model ?? null);
    const cursor = active ? `${BRAND}\u25B6${RESET2}` : " ";
    const mark = current ? `${BRAND}\u25CF${RESET2}` : " ";
    const text = ansiTrunc(entry.label, Math.max(20, width - 10));
    lines.push(`  ${cursor} ${mark} ${active ? `${LABEL}${text}${RESET2}` : `${DIM2}${text}${RESET2}`}`);
  });
  return lines.join("\n");
}
var SHIMMER_SEQ = ["\u2591", "\u2591", "\u2592", "\u2593", "\u2592", "\u2591", "\u2591"];
var _shimmerOffset = 0;
function applyShimmer(content) {
  _shimmerOffset++;
  return content.replace(/^([ ]*)(░{20,})$/gm, (_match, prefix, run) => {
    const chars = [];
    for (let i = 0; i < run.length; i++) {
      const idx = (i + _shimmerOffset) % SHIMMER_SEQ.length;
      chars.push(SHIMMER_SEQ[idx]);
    }
    return prefix + chars.join("");
  });
}
var _animTimer = null;
function footerRow(totalLines, rows, promptRows = tui.promptRows ?? PROMPT_ROWS) {
  const rowsForContent = rows - promptRows;
  if (totalLines <= rowsForContent) return totalLines;
  return rows - promptRows - 1;
}
function startRenderAnimation() {
  stopRenderAnimation();
  const tick = () => {
    if (!tui.lastContent) {
      _animTimer = setTimeout(tick, 110);
      return;
    }
    const s = tui.agentState;
    if (!s || s.stage !== "gathering" && s.stage !== "analyzing") {
      _animTimer = null;
      return;
    }
    _spinnerTick++;
    const w = process.stdout.columns ?? 80;
    const rows = process.stdout.rows ?? 24;
    const allLines = tui.lastContent.split("\n");
    const totalLines = allLines.length;
    const footer = buildFooter(w);
    const padded = footer + " ".repeat(Math.max(0, w - visLen(footer)));
    process.stdout.write(`\x1B[${footerRow(totalLines, rows)};1H${padded}`);
    _animTimer = setTimeout(tick, 110);
  };
  _animTimer = setTimeout(tick, 110);
}
function stopRenderAnimation() {
  if (_animTimer) {
    clearTimeout(_animTimer);
    _animTimer = null;
  }
}
function buildActionBar(width) {
  const s = tui.agentState;
  if (!s || s.stage !== "complete" || !s.follow_ups?.length) return "";
  const lines = [];
  lines.push(`${DIM2}\u2504\u2504 WHAT'S NEXT ${"\u2504".repeat(Math.max(0, width - 18))}${RESET2}`);
  for (const f of s.follow_ups) {
    lines.push(`  ${BRAND}/${f.key}${RESET2}  ${DIM2}${f.label}${RESET2}`);
  }
  lines.push(`  ${DIM2}/reset${RESET2}  ${DIM2}Done \u2014 return to Marked runtime${RESET2}`);
  lines.push(`${DIM2}${"\u2500".repeat(width)}${RESET2}`);
  return lines.join("\n");
}
function paintScreen(content, resetScroll = true) {
  const w = process.stdout.columns ?? 80;
  const header = buildHeader(w);
  const actionBar = buildActionBar(w);
  const footer = buildFooter(w);
  const lines = content.split("\n");
  const filtered = lines.filter((l) => {
    const stripped = l.replace(/\x1b\[[0-9;]*m/g, "").trimStart();
    return !stripped.startsWith("\u2590") || !stripped.includes("MARKED");
  });
  let startIdx = 0;
  while (startIdx < filtered.length && filtered[startIdx].replace(/\x1b\[[0-9;]*m/g, "").trim() === "") startIdx++;
  const cleanContent = filtered.slice(startIdx).join("\n");
  tui.lastContent = header + "\n" + cleanContent + (actionBar ? "\n" + actionBar : "") + "\n" + footer;
  if (resetScroll) tui.scrollOffset = 0;
  paintWithScroll(resetScroll);
}
function paintWithScroll(clear = true) {
  const rows = process.stdout.rows ?? 24;
  const s = tui.agentState;
  const isAnimating = s && (s.stage === "gathering" || s.stage === "analyzing");
  let displayContent = isAnimating ? applyShimmer(tui.lastContent) : tui.lastContent;
  if (isAnimating) {
    const w2 = process.stdout.columns ?? 80;
    const lines = displayContent.split("\n");
    lines[lines.length - 1] = buildFooter(w2);
    displayContent = lines.join("\n");
  }
  const w = process.stdout.columns ?? 80;
  const allLines = displayContent.split("\n");
  const totalLines = allLines.length;
  allLines[0] = buildHeader(w);
  displayContent = allLines.join("\n");
  const promptBlock = renderPromptBlock(w, tui.queryInput ?? "", tui.scope ?? null, rows);
  const promptRows = promptBlock.length;
  tui.promptRows = promptRows;
  const paintPrompt = () => promptBlock.map((line, index) => `\x1B[${rows - promptRows + 1 + index};1H\x1B[2K${line}`).join("");
  const rowsForContent = rows - promptRows;
  if (totalLines <= rowsForContent) {
    if (clear) {
      process.stdout.write("\x1B[2J\x1B[H" + displayContent + paintPrompt());
    } else {
      const padded = allLines.map((l) => l + " ".repeat(Math.max(0, w - visLen(l)))).join("\n");
      process.stdout.write("\x1B[H" + padded);
      for (let r = totalLines + 1; r <= rows - promptRows; r++) {
        process.stdout.write(`\x1B[${r};1H\x1B[2K`);
      }
      process.stdout.write(paintPrompt());
    }
    return;
  }
  const stickyLine = allLines[0];
  const bodyLines = allLines.slice(1, allLines.length - 1);
  const footerLine = allLines[allLines.length - 1];
  const bodyRows = Math.max(0, rows - 3 - promptRows);
  const maxOffset = Math.max(0, bodyLines.length - bodyRows);
  tui.scrollOffset = Math.max(0, Math.min(tui.scrollOffset, maxOffset));
  const offset = tui.scrollOffset;
  const viewLines = bodyLines.slice(offset, offset + bodyRows);
  const atTop = offset === 0;
  const atBottom = offset >= maxOffset;
  const pct = maxOffset > 0 ? Math.round(offset / maxOffset * 100) : 0;
  const indicator = `${DIM2}` + (atTop ? " " : " \u25B2 ") + `${offset + 1}\u2013${Math.min(offset + viewLines.length, bodyLines.length)}/${bodyLines.length}` + (atBottom ? "" : " \u25BC") + ` ${atBottom ? "END" : pct + "%"}  PgUp/Dn page  ^\u2191/^\u2193 line  Home/End ends${RESET2}`;
  const safeHeader = visLen(stickyLine) > w ? ansiTrunc(stickyLine, w) : stickyLine;
  const allOutput = [safeHeader, ...viewLines, footerLine, indicator, ...promptBlock];
  let buf = clear ? "\x1B[2J" : "";
  for (let r = 0; r < allOutput.length; r++) {
    const line = allOutput[r];
    buf += `\x1B[${r + 1};1H`;
    if (!clear) {
      buf += line + " ".repeat(Math.max(0, w - visLen(line)));
    } else {
      buf += line;
    }
  }
  buf += `\x1B[${rows};1H`;
  process.stdout.write(buf);
}
function renderSearchOverlay(width) {
  const lines = [
    "",
    `  ${LIME_D}\u2590${LIME_M}\u2588${BRAND}\u2588${RESET2} ${BRAND}${BOLD2}MARKED${RESET2}  ${LABEL}WORLD SEARCH${RESET2}`,
    `${DIM2}${"\u2500".repeat(width)}${RESET2}`,
    "",
    `  ${LABEL} find ${RESET2}${BRAND}\u203A${RESET2} ${tui.searchQuery || ""}${BRAND}\u2588${RESET2}`,
    `  ${DIM2}name \xB7 ticker \xB7 ISIN \xB7 CIN${tui.searchBusy ? " \xB7 searching\u2026" : ""}${RESET2}`,
    `  ${DIM2}\u2191\u2193 navigate \xB7 Enter open \xB7 Esc cancel${RESET2}`,
    ""
  ];
  if (!tui.searchQuery) {
    if (tui.searchResults.length) {
      lines.push(`  ${DIM2}RECENT${RESET2}`);
      tui.searchResults.forEach((hit, index) => {
        const active = index === tui.searchIdx;
        const cursor = active ? `${BRAND}\u25B6${RESET2}` : " ";
        const name = ansiTrunc(hit.name ?? "", Math.max(20, Math.floor(width * 0.45)));
        const detail = [hit.symbol, hit.tab].filter(Boolean).join(" \xB7 ");
        lines.push(`  ${cursor} ${active ? `${BOLD2}${LABEL}${name}${RESET2}` : name}   ${DIM2}${detail}${RESET2}`);
      });
      return lines.join("\n");
    }
    lines.push(`  ${DIM2}Type to search every listed company Marked covers.${RESET2}`);
    return lines.join("\n");
  }
  if (!tui.searchResults.length) {
    lines.push(`  ${DIM2}${tui.searchBusy ? "Searching\u2026" : `Nothing matches \u201C${tui.searchQuery}\u201D`}${RESET2}`);
    return lines.join("\n");
  }
  tui.searchResults.forEach((hit, index) => {
    const active = index === tui.searchIdx;
    const cursor = active ? `${BRAND}\u25B6${RESET2}` : " ";
    const name = ansiTrunc(hit.name ?? "", Math.max(20, Math.floor(width * 0.45)));
    const detail = [hit.symbol, hit.exchange, hit.isin].filter(Boolean).join(" \xB7 ");
    lines.push(`  ${cursor} ${active ? `${BOLD2}${LABEL}${name}${RESET2}` : name}   ${DIM2}${detail}${RESET2}`);
  });
  return lines.join("\n");
}

// terminal/scroll.js
var _mouseInputActive = false;
var _lastEscapeMs = 0;
var _mouseReportMs = 0;
function isMouseSequenceActive() {
  return Date.now() - _mouseReportMs < 50;
}
function setupMouseWheel() {
  if (_mouseInputActive) return;
  _mouseInputActive = true;
  process.stdin.on("data", (data) => {
    const str = data.toString();
    if (str.includes("\x1B[")) {
      _lastEscapeMs = Date.now();
    }
    if (/\x1b\[<\d*/.test(str)) _mouseReportMs = Date.now();
    const match = str.match(/\x1b\[<(\d+);\d+;\d+[Mm]/);
    if (!match || !tui.lastContent) return;
    const btn = parseInt(match[1], 10);
    if (btn === 64) {
      tui.scrollOffset = Math.max(0, tui.scrollOffset - 3);
      paintWithScroll();
    } else if (btn === 65) {
      tui.scrollOffset += 3;
      paintWithScroll();
    }
  });
}

// terminal/io.js
import http2 from "http";
import fs5 from "fs";
import path5 from "path";
async function healthCheck() {
  if (connectedAgent()) return;
  let markedUp = false;
  try {
    const response = await fetch("https://api.marked.run/v1/");
    markedUp = response.status < 500;
  } catch {
    markedUp = false;
  }
  if (connectedAgent()) return;
  emitter.emit("_splash", { msg: markedUp ? "Waiting for Marked runtime" : "Waiting for Marked API" });
}
async function submitQuery(question) {
  const runtimeUrl = process.env.MARKED_RUNTIME_URL;
  if (!runtimeUrl) throw new Error("Marked runtime query channel unavailable");
  const response = await fetch(`${runtimeUrl}/query`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ question })
  });
  if (!response.ok) throw new Error((await response.text()).slice(0, 240));
}
function saveReport() {
  if (!tui.lastBlocks) return null;
  try {
    fs5.mkdirSync(REPORTS_DIR, { recursive: true });
    const ts = (/* @__PURE__ */ new Date()).toISOString().replace(/[:.]/g, "-").slice(0, 16);
    const textBlock = tui.lastBlocks.find((b) => b.text);
    const ticker = textBlock?.text?.match(/·\s+([A-Z/]+)/)?.[1]?.replace(/\s/g, "-") ?? "report";
    const filename = `${ts}-${ticker}.json`;
    fs5.writeFileSync(
      path5.join(REPORTS_DIR, filename),
      JSON.stringify({ blocks: tui.lastBlocks, meta: tui.renderMeta, saved_at: (/* @__PURE__ */ new Date()).toISOString() }, null, 2)
    );
    return filename;
  } catch {
    return null;
  }
}
function listReports() {
  try {
    if (!fs5.existsSync(REPORTS_DIR)) return [];
    return fs5.readdirSync(REPORTS_DIR).filter((f) => f.endsWith(".json")).sort().reverse().slice(0, 20);
  } catch {
    return [];
  }
}

// terminal/app.js
var getWidth = () => process.stdout.columns ?? 80;
var getHeight = () => process.stdout.rows ?? 24;
tui.phase = "splash";
tui.splashMsg = "Starting...";
tui.layout = "pulse";
tui.panels = {};
tui.blocks = null;
tui.focused = null;
tui.isPatch = false;
tui.queryInput = "";
tui.queryHistory = [];
tui.historyIdx = -1;
function repaint() {
  if (tui.phase === "splash") return;
  if (tui.loadMode || tui.modelMode || tui.askMode) return;
  const w = getWidth();
  const output = runLayout(tui.blocks ?? tui.layout, tui.blocks ? null : tui.panels, w, tui.focused, getHeight());
  paintScreen(output, !tui.isPatch);
  tui.isPatch = false;
}
function openAsk(ask) {
  tui.askPrompt = ask.prompt || "Which one did you mean?";
  tui.askHint = ask.hint || "";
  tui.askList = Array.isArray(ask.choices) ? ask.choices : [];
  tui.askIdx = 0;
  tui.askStep = ask.step || null;
  tui.askMode = true;
  tui.phase = "live";
  stopSplashAnimation();
  const overlay = renderAskOverlay(getWidth());
  showOverlay(overlay);
}
function closeAsk() {
  tui.askMode = false;
  tui.askList = [];
  tui.askStep = null;
  hideOverlay();
  paintOrSplash();
}
function openInput(input) {
  tui.inputPrompt = input.prompt || "Enter a value";
  tui.inputHint = input.hint || "";
  tui.inputValue = "";
  tui.inputSecret = Boolean(input.secret);
  tui.inputStep = input.step || null;
  tui.inputMode = true;
  setMouseReporting(false);
  tui.phase = "live";
  stopSplashAnimation();
  process.stdout.write("\x1B[2J\x1B[H" + renderInputOverlay(getWidth()) + "\x1B[?25h");
}
function setMouseReporting(on) {
  process.stdout.write(on ? "\x1B[?1000h\x1B[?1006h" : "\x1B[?1006l\x1B[?1000l");
}
function closeInput() {
  setMouseReporting(true);
  tui.inputMode = false;
  tui.inputValue = "";
  tui.inputSecret = false;
  tui.inputStep = null;
  process.stdout.write("\x1B[?25l");
}
function onRender(payload) {
  if (Array.isArray(payload.liveTape)) {
    tui.liveTape = payload.liveTape;
    if (tui.phase === "splash") {
      startSplashAnimation();
      return;
    }
  }
  if (tui.phase === "splash") {
    process.stdout.write("\x1B[2J\x1B[H");
  }
  tui.phase = "live";
  if (payload._state && payload._state.ask) {
    openAsk(payload._state.ask);
    return;
  }
  if (payload._state && payload._state.input) {
    openInput(payload._state.input);
    return;
  }
  if (payload._state && payload._state.search) {
    const search = payload._state.search;
    if (!tui.searchMode) openSearch(search);
    else {
      if (search.query !== void 0 && search.query !== tui.searchQuery) return;
      tui.searchResults = Array.isArray(search.results) ? search.results : [];
      tui.searchIdx = 0;
      tui.searchBusy = false;
      drawSearch();
    }
    return;
  }
  if (payload.meta && typeof payload.meta === "object") {
    tui.renderMeta = { ...tui.renderMeta, ...payload.meta };
  }
  if (payload._state && typeof payload._state === "object") {
    const prev = tui.agentState?.stage;
    tui.agentState = payload._state;
    const stage = payload._state.stage;
    if (stage !== prev) {
      logStateTransition(prev ?? "none", stage, payload._state.skill ?? "unknown");
    }
    if (stage === "gathering" || stage === "analyzing") {
      startRenderAnimation();
    } else {
      stopRenderAnimation();
      if (stage === "complete" && prev !== "complete") {
        tui.scrollOffset = 0;
      }
    }
  }
  tui.isPatch = !!payload.patch;
  tui.loadMode = false;
  tui.helpVisible = false;
  if (Array.isArray(payload.blocks)) {
    const ids = payload.blocks.map((b) => getBlockType(b)).filter((t) => t && t !== "text" && t !== "divider" && t !== "spacer" && t !== "row" && t !== "stack");
    tui.panelIds = ids;
    if (!ids.includes(tui.focusedPanel)) tui.focusedPanel = ids[0] ?? null;
  }
  if (Array.isArray(payload.blocks)) {
    if (!payload.patch) tui.lastBlocks = payload.blocks;
    if (payload.patch) {
      const base = Array.isArray(tui.blocks) ? [...tui.blocks] : [];
      tui.blocks = applyPatch(base, payload.blocks);
    } else {
      tui.blocks = payload.blocks;
    }
    tui.layout = null;
  } else if (payload.layout) {
    if (tui.layout !== payload.layout) tui.panels = payload.panels ?? {};
    else if (payload.panels && typeof payload.panels === "object") {
      tui.panels = { ...tui.panels, ...payload.panels };
    }
    tui.layout = payload.layout;
    tui.blocks = null;
  } else if (payload.panels && typeof payload.panels === "object") {
    tui.panels = { ...tui.panels, ...payload.panels };
  }
  if (payload.theme) {
    applyTheme(payload.theme);
  }
  if ("scope" in payload) tui.scope = payload.scope || null;
  repaint();
}
function onFocus(payload) {
  tui.focused = payload?.panel ?? null;
  repaint();
}
function onLayout(payload) {
  if (payload?.layout) {
    tui.layout = payload.layout;
    repaint();
  }
}
function onClear() {
  tui.panels = {};
  repaint();
}
function onSplash(payload) {
  if (payload?.reset) {
    stopRenderAnimation();
    tui.phase = "splash";
    tui.lastContent = "";
    tui.blocks = null;
    tui.queryInput = "";
    tui.liveTape = [];
  }
  tui.splashMsg = payload?.msg ?? "";
  if (payload?.agent) tui.agentState = { ...tui.agentState, ...payload.agent };
  if (tui.phase === "splash") startSplashAnimation();
}
function drawQueryPrompt() {
  const rows = getHeight();
  const block = renderPromptBlock(getWidth(), tui.queryInput, tui.scope ?? null, rows);
  if (block.length !== tui.promptRows) return paintWithScroll(false);
  process.stdout.write(block.map((line, index) => `\x1B[${rows - block.length + 1 + index};1H\x1B[2K${line}`).join(""));
}
function clearPrompt() {
  tui.queryInput = "";
  tui.historyIdx = -1;
  drawQueryPrompt();
}
function recallHistory(delta) {
  const h = tui.queryHistory;
  if (!h.length) return;
  const next = tui.historyIdx + delta;
  if (next < 0) {
    tui.historyIdx = -1;
    tui.queryInput = "";
  } else if (next >= h.length) return;
  else {
    tui.historyIdx = next;
    tui.queryInput = h[h.length - 1 - next];
  }
  drawQueryPrompt();
}
async function sendRuntimeQuery(question) {
  if (tui.lastContent) {
    tui.agentState = { ...tui.agentState, stage: "resolving", query: question };
    paintWithScroll();
  } else {
    tui.phase = "splash";
    tui.splashMsg = "Sending query to Marked runtime";
    startSplashAnimation();
  }
  try {
    await submitQuery(question);
  } catch (error) {
    if (tui.lastContent) {
      tui.agentState = { ...tui.agentState, stage: "complete" };
      paintWithScroll();
    } else {
      tui.splashMsg = `Query unavailable \xB7 ${error.message}`;
      startSplashAnimation();
    }
  }
}
function showOverlay(overlay) {
  if (tui.overlayBackdrop == null) tui.overlayBackdrop = tui.lastContent;
  tui.lastContent = overlay;
  process.stdout.write("\x1B[2J\x1B[H" + overlay);
}
function hideOverlay() {
  if (tui.overlayBackdrop != null) {
    tui.lastContent = tui.overlayBackdrop;
    tui.overlayBackdrop = null;
  }
}
function closeAnyOverlay() {
  if (tui.searchMode) {
    closeSearch();
    submitQuery("/wpick cancel").catch(() => {
    });
    return true;
  }
  if (tui.modelMode) {
    closeModelPicker();
    return true;
  }
  if (tui.loadMode) {
    tui.loadMode = false;
    hideOverlay();
    paintOrSplash();
    return true;
  }
  if (tui.helpVisible) {
    toggleHelp();
    return true;
  }
  if (tui.askMode) {
    submitQuery("/pick cancel").catch(() => {
    });
    closeAsk();
    return true;
  }
  if (tui.inputMode) {
    closeInput();
    submitQuery("/input cancel").catch(() => {
    });
    return true;
  }
  return false;
}
function paintOrSplash() {
  if (tui.lastContent) return paintWithScroll();
  stopSplashAnimation();
  tui.phase = "splash";
  startSplashAnimation();
}
var _searchTimer = null;
function openSearch(payload = {}) {
  tui.searchMode = true;
  tui.searchQuery = payload.query ?? "";
  tui.searchResults = Array.isArray(payload.results) ? payload.results : [];
  tui.searchIdx = 0;
  tui.searchBusy = false;
  tui.phase = "live";
  stopSplashAnimation();
  showOverlay(renderSearchOverlay(getWidth()));
}
function closeSearch() {
  if (_searchTimer) {
    clearTimeout(_searchTimer);
    _searchTimer = null;
  }
  tui.searchMode = false;
  tui.searchQuery = "";
  tui.searchResults = [];
  tui.searchBusy = false;
  hideOverlay();
  paintOrSplash();
}
function drawSearch() {
  const overlay = renderSearchOverlay(getWidth());
  tui.lastContent = overlay;
  process.stdout.write("\x1B[2J\x1B[H" + overlay);
}
function queueSearch() {
  if (_searchTimer) clearTimeout(_searchTimer);
  tui.searchBusy = Boolean(tui.searchQuery);
  drawSearch();
  if (!tui.searchQuery) return;
  _searchTimer = setTimeout(() => {
    _searchTimer = null;
    submitQuery(`/wsearch ${tui.searchQuery}`).catch(() => {
    });
  }, 160);
}
function openModelPicker() {
  tui.modelCurrent = currentModel();
  tui.modelList = listModels();
  tui.modelIdx = Math.max(0, tui.modelList.findIndex((entry) => entry.agent === tui.modelCurrent?.agent && (entry.id ?? null) === (tui.modelCurrent?.model ?? null)));
  tui.modelMode = true;
  tui.phase = "live";
  const overlay = renderModelOverlay(getWidth());
  showOverlay(overlay);
}
function closeModelPicker() {
  tui.modelMode = false;
  hideOverlay();
  paintOrSplash();
}
function runLocalCommand(text) {
  const cmd = text.toLowerCase();
  if (cmd === "/model" || cmd === "/models") {
    openModelPicker();
    return true;
  }
  if (cmd === "/help") {
    toggleHelp();
    return true;
  }
  if (cmd === "/save") {
    saveCurrentReport();
    return true;
  }
  if (cmd === "/load") {
    openLoadPicker();
    return true;
  }
  if (cmd === "/reset") {
    resetToSplash();
    return true;
  }
  if (cmd === "/quit" || cmd === "/exit") {
    quitApp();
    return true;
  }
  return false;
}
function expandFollowUp(text) {
  const match = text.match(/^\/([1-9])$/);
  if (!match) return null;
  const fu = tui.agentState?.follow_ups?.find((f) => f.key === match[1]);
  return fu?.question ?? null;
}
async function sendQueryInput() {
  const question = tui.queryInput.trim();
  if (!question) return;
  tui.queryHistory.push(question);
  clearPrompt();
  if (runLocalCommand(question)) return;
  await sendRuntimeQuery(expandFollowUp(question) ?? question);
}
function onLive() {
  tui.phase = "live";
  repaint();
}
var _splashRevealTimer = null;
var _splashPulseTimer = null;
function stopSplashAnimation() {
  if (_splashRevealTimer) {
    clearInterval(_splashRevealTimer);
    _splashRevealTimer = null;
  }
  if (_splashPulseTimer) {
    clearInterval(_splashPulseTimer);
    _splashPulseTimer = null;
  }
}
function startSplashAnimation() {
  stopSplashAnimation();
  const width = getWidth();
  const termRows = getHeight();
  const allLines = renderSplash(tui.splashMsg, width, 0, termRows - 1, tui.liveTape).split("\n");
  let revealCount = 0;
  let pulseFrame = 0;
  const spinnerSet = new Set(SPINNER_FRAMES);
  const animLineIndices = allLines.reduce((acc, line, i) => {
    const stripped = line.replace(/\x1b\[[0-9;]*m/g, "");
    if (stripped.includes("\u2590") || [...stripped].some((c2) => spinnerSet.has(c2))) acc.push(i);
    return acc;
  }, []);
  let lastContentIdx = allLines.length - 1;
  while (lastContentIdx > 0 && allLines[lastContentIdx].replace(/\x1b\[[0-9;]*m/g, "").trim() === "") lastContentIdx--;
  const spinnerIdx = lastContentIdx;
  let contentEnd = spinnerIdx;
  for (let i = spinnerIdx - 1; i >= 0; i--) {
    if (allLines[i].replace(/\x1b\[[0-9;]*m/g, "").trim() !== "") {
      contentEnd = i + 1;
      break;
    }
  }
  _splashRevealTimer = setInterval(() => {
    if (tui.phase !== "splash") {
      stopSplashAnimation();
      return;
    }
    revealCount++;
    if (revealCount <= contentEnd) {
      process.stdout.write("\x1B[2J\x1B[H" + allLines.slice(0, revealCount).join("\n"));
      process.stdout.write(`\x1B[${spinnerIdx + 1};1H${allLines[spinnerIdx]}`);
      drawQueryPrompt();
    } else {
      revealCount = allLines.length;
      process.stdout.write("\x1B[2J\x1B[H" + allLines.join("\n"));
      drawQueryPrompt();
    }
    if (revealCount >= allLines.length) {
      clearInterval(_splashRevealTimer);
      _splashRevealTimer = null;
      _splashPulseTimer = setInterval(() => {
        if (tui.phase !== "splash") {
          stopSplashAnimation();
          return;
        }
        pulseFrame++;
        const currentWidth = getWidth();
        const currentRows = getHeight();
        const newLines = renderSplash(tui.splashMsg, currentWidth, pulseFrame, currentRows - 1, tui.liveTape).split("\n");
        for (const i of animLineIndices) {
          if (i >= currentRows - 1) continue;
          process.stdout.write(`\x1B[${i + 1};1H\x1B[2K${newLines[i] ?? ""}`);
        }
        drawQueryPrompt();
      }, 110);
    }
  }, 16);
}
function toggleHelp() {
  tui.helpVisible = !tui.helpVisible;
  if (tui.helpVisible) {
    stopSplashAnimation();
    process.stdout.write("\x1B[2J\x1B[H" + renderHelpOverlay(getWidth()));
    drawQueryPrompt();
  } else if (tui.phase === "splash") {
    startSplashAnimation();
  } else {
    paintWithScroll();
  }
}
function saveCurrentReport() {
  const filename = saveReport();
  if (!filename) return;
  const w = getWidth();
  const savedFooter = buildFooter(w);
  const confirmFooter = `  ${BRAND}\u2713${RESET2} ${DIM2}Saved: ${filename}${RESET2}`;
  tui.lastContent = tui.lastContent.replace(savedFooter, confirmFooter);
  paintWithScroll();
  setTimeout(() => {
    tui.lastContent = tui.lastContent.replace(confirmFooter, savedFooter);
    paintWithScroll();
  }, 2e3);
}
function openLoadPicker() {
  tui.loadList = listReports();
  if (tui.loadList.length === 0) return;
  tui.loadIdx = 0;
  tui.loadMode = true;
  tui.phase = "live";
  const overlay = renderLoadOverlay(getWidth());
  showOverlay(overlay);
}
function resetToSplash() {
  stopRenderAnimation();
  tui.lastContent = "";
  const connectedAgent2 = tui.agentState?.agent;
  const connectedModel = tui.agentState?.model;
  tui.agentState = connectedAgent2 ? { agent: connectedAgent2, model: connectedModel } : null;
  tui.renderMeta = { model: null, tools: null, cost: null, as_of: null };
  tui.blocks = null;
  tui.phase = "splash";
  const hint = tui.lastBlocks ? "/restore \xB7 /load" : "/load";
  const connLabel = connectedAgent2 ? `Connected \xB7 ${connectedModel ? `${connectedAgent2} \xB7 ${connectedModel}` : connectedAgent2}` : "Waiting for agent";
  tui.splashMsg = `${connLabel} \xB7 ${hint}`;
  startSplashAnimation();
}
function quitApp() {
  process.stdout.write("\x1B[?1049l\x1B[?25h\x1B[?1000l\x1B[?1006l");
  process.exit(0);
}
function isRunning() {
  const stage = tui.agentState?.stage;
  return stage === "resolving" || stage === "gathering" || stage === "analyzing";
}
function handleKeypress(ch, key) {
  if (!key) key = {};
  if (isMouseSequenceActive()) return;
  if (key.ctrl && key.name === "c") {
    if (closeAnyOverlay()) return;
    if (isRunning()) {
      submitQuery("/cancel").catch(() => {
      });
      return;
    }
    if (tui.queryInput) return clearPrompt();
    return;
  }
  if (key.ctrl && key.name === "d") {
    if (!tui.queryInput) quitApp();
    return;
  }
  if (tui.inputMode) {
    if (key.name === "escape") {
      closeInput();
      submitQuery("/input cancel").catch(() => {
      });
      return;
    }
    if (key.name === "return") {
      const encoded = Buffer.from(tui.inputValue, "utf8").toString("base64url");
      closeInput();
      submitQuery(`/input ${encoded}`).catch(() => {
      });
      return;
    }
    if (key.name === "backspace") tui.inputValue = tui.inputValue.slice(0, -1);
    else if (typeof ch === "string" && ch.length === 1 && !key.ctrl && !key.meta) tui.inputValue += ch;
    else return;
    process.stdout.write("\x1B[2J\x1B[H" + renderInputOverlay(getWidth()) + "\x1B[?25h");
    return;
  }
  if (tui.searchMode) {
    if (key.name === "escape") {
      closeSearch();
      submitQuery("/wpick cancel").catch(() => {
      });
      return;
    }
    if (key.name === "up") {
      tui.searchIdx = Math.max(0, tui.searchIdx - 1);
      return drawSearch();
    }
    if (key.name === "down") {
      tui.searchIdx = Math.min(tui.searchResults.length - 1, tui.searchIdx + 1);
      return drawSearch();
    }
    if (key.name === "return") {
      if (!tui.searchResults.length) return;
      const chosen = tui.searchIdx;
      closeSearch();
      submitQuery(`/wpick ${chosen + 1}`).catch(() => {
      });
      return;
    }
    if (key.name === "backspace") {
      tui.searchQuery = tui.searchQuery.slice(0, -1);
      return queueSearch();
    }
    if (typeof ch === "string" && ch.length === 1 && !key.ctrl && !key.meta) {
      tui.searchQuery += ch;
      return queueSearch();
    }
    return;
  }
  if (tui.askMode) {
    if (key.name === "escape") {
      submitQuery("/pick cancel").catch(() => {
      });
      closeAsk();
    } else if (key.name === "up") {
      tui.askIdx = Math.max(0, tui.askIdx - 1);
      process.stdout.write("\x1B[2J\x1B[H" + renderAskOverlay(getWidth()));
    } else if (key.name === "down") {
      tui.askIdx = Math.min(tui.askList.length - 1, tui.askIdx + 1);
      process.stdout.write("\x1B[2J\x1B[H" + renderAskOverlay(getWidth()));
    } else if (key.name === "return" && tui.askList.length > 0) {
      const chosen = tui.askIdx;
      closeAsk();
      submitQuery(`/pick ${chosen + 1}`).catch(() => {
      });
    }
    return;
  }
  if (tui.modelMode) {
    if (key.name === "escape") {
      closeModelPicker();
    } else if (key.name === "up") {
      tui.modelIdx = Math.max(0, tui.modelIdx - 1);
      process.stdout.write("\x1B[2J\x1B[H" + renderModelOverlay(getWidth()));
    } else if (key.name === "down") {
      tui.modelIdx = Math.min(tui.modelList.length - 1, tui.modelIdx + 1);
      process.stdout.write("\x1B[2J\x1B[H" + renderModelOverlay(getWidth()));
    } else if (key.name === "return" && tui.modelList.length > 0) {
      const choice = tui.modelList[tui.modelIdx];
      tui.modelCurrent = { agent: choice.agent, model: choice.id ?? null };
      submitQuery(`/model ${choice.agent}:${choice.id ?? "default"}`).catch(() => {
      });
      closeModelPicker();
    }
    return;
  }
  if (tui.loadMode) {
    if (key.name === "escape") {
      tui.loadMode = false;
      hideOverlay();
      paintOrSplash();
    } else if (key.name === "up") {
      tui.loadIdx = Math.max(0, tui.loadIdx - 1);
      process.stdout.write("\x1B[2J\x1B[H" + renderLoadOverlay(getWidth()));
    } else if (key.name === "down") {
      tui.loadIdx = Math.min(tui.loadList.length - 1, tui.loadIdx + 1);
      process.stdout.write("\x1B[2J\x1B[H" + renderLoadOverlay(getWidth()));
    } else if (key.name === "return" && tui.loadList.length > 0) {
      try {
        const file = path6.join(REPORTS_DIR, tui.loadList[tui.loadIdx]);
        const saved = JSON.parse(fs6.readFileSync(file, "utf8"));
        tui.loadMode = false;
        hideOverlay();
        if (saved.meta) tui.renderMeta = { ...tui.renderMeta, ...saved.meta };
        if (Array.isArray(saved.blocks)) {
          tui.lastBlocks = saved.blocks;
          tui.blocks = saved.blocks;
          repaint();
        }
      } catch {
        tui.loadMode = false;
        hideOverlay();
        paintOrSplash();
      }
    }
    return;
  }
  if (tui.helpVisible) {
    if (key.name === "escape" || key.ctrl && key.name === "g") return toggleHelp();
    return;
  }
  if (key.ctrl && key.name === "g") return toggleHelp();
  if (key.ctrl && key.name === "s") return saveCurrentReport();
  if (key.ctrl && key.name === "o") return openLoadPicker();
  if (key.ctrl && key.name === "u") return clearPrompt();
  if ((key.name === "left" || key.name === "right") && tui.scope?.ticker && !tui.queryInput) {
    submitQuery(`/tab ${key.name === "right" ? "next" : "prev"}`).catch(() => {
    });
    return;
  }
  if (key.name === "return") return void sendQueryInput();
  if (key.name === "up") return recallHistory(1);
  if (key.name === "down") return recallHistory(-1);
  if (key.name === "backspace") {
    tui.queryInput = tui.queryInput.slice(0, -1);
    return drawQueryPrompt();
  }
  if (typeof ch === "string" && ch.length === 1 && !key.ctrl && !key.meta) {
    tui.queryInput += ch;
    return drawQueryPrompt();
  }
  if (tui.phase === "splash" || !tui.lastContent) return;
  if (key.name === "tab" && tui.panelIds.length > 0) {
    const ids = tui.panelIds;
    const cur = ids.indexOf(tui.focusedPanel);
    tui.focusedPanel = key.shift ? ids[(cur - 1 + ids.length) % ids.length] : ids[(cur + 1) % ids.length];
    return paintWithScroll();
  }
  const pageSize = Math.max(1, getHeight() - 2);
  let changed = false;
  if (key.ctrl && key.name === "up") {
    tui.scrollOffset = Math.max(0, tui.scrollOffset - 1);
    changed = true;
  } else if (key.ctrl && key.name === "down") {
    tui.scrollOffset += 1;
    changed = true;
  } else if (key.name === "pageup" || key.sequence === "\x1B[5~") {
    tui.scrollOffset = Math.max(0, tui.scrollOffset - pageSize);
    changed = true;
  } else if (key.name === "pagedown" || key.sequence === "\x1B[6~") {
    tui.scrollOffset += pageSize;
    changed = true;
  } else if (key.name === "home") {
    tui.scrollOffset = 0;
    changed = true;
  } else if (key.name === "end") {
    tui.scrollOffset = Infinity;
    changed = true;
  }
  if (changed) paintWithScroll();
}
function setupKeyboard() {
  readline.emitKeypressEvents(process.stdin);
  if (process.stdin.isTTY) process.stdin.setRawMode(true);
  process.stdin.resume();
  process.stdin.on("keypress", (ch, key) => {
    handleKeypress(ch, key);
  });
}
function setupResize() {
  process.stdout.on("resize", () => {
    if (tui.phase === "splash") {
      startSplashAnimation();
    } else {
      repaint();
    }
  });
}
async function main() {
  try {
    const { port } = await startServer();
    if (process.env.MARKED_DEBUG) process.stderr.write(`Marked Terminal on port ${port}
`);
  } catch (err) {
    process.stderr.write(`Failed to start: ${err.message}
`);
    process.exit(1);
  }
  process.stdout.write("\x1B[?1049h\x1B[2J\x1B[3J\x1B[H\x1B[?25l\x1B[?1000h\x1B[?1006h");
  const restoreScreen = () => {
    process.stdout.write("\x1B[?1006l\x1B[?1000l\x1B[?25h\x1B[?1049l");
  };
  process.on("exit", restoreScreen);
  process.on("SIGINT", () => {
    restoreScreen();
    process.exit(0);
  });
  process.on("SIGTERM", () => {
    restoreScreen();
    process.exit(0);
  });
  process.on("uncaughtException", (err) => {
    restoreScreen();
    process.stderr.write(`
Uncaught: ${err.message}
${err.stack}
`);
    process.exit(1);
  });
  process.on("unhandledRejection", (err) => {
    restoreScreen();
    process.stderr.write(`
Unhandled rejection: ${err}
`);
    process.exit(1);
  });
  setupMouseWheel();
  setupKeyboard();
  setupResize();
  emitter.on("render", onRender);
  emitter.on("focus", onFocus);
  emitter.on("layout", onLayout);
  emitter.on("clear", onClear);
  emitter.on("_splash", onSplash);
  emitter.on("_live", onLive);
  const attached = connectedAgent();
  if (attached) {
    onSplash({
      msg: `Connected \xB7 ${attached.model ? `${attached.agent} \xB7 ${attached.model}` : attached.agent}`,
      agent: attached
    });
  }
  startSplashAnimation();
  healthCheck().catch(() => {
  });
}
var isEntryPoint = Boolean(process.argv[1]) && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isEntryPoint) {
  main().catch((err) => {
    process.stderr.write(`Fatal: ${err.message}
${err.stack}
`);
    process.exit(1);
  });
}
export {
  handleKeypress,
  setMouseReporting
};
