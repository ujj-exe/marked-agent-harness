/**
 * stream-events.js — reading a reasoning provider's output as it is written.
 *
 * The CLI's `stream-json` output is newline-delimited JSON. The structured
 * research result arrives inside it as `input_json_delta` fragments: the JSON
 * document, a few characters at a time, in schema order. Thinking arrives
 * first as `thinking_delta`.
 *
 * Two things are built on that here, and they are deliberately separable:
 *
 *   - counting, which cannot fail, and
 *   - parsing, which can.
 *
 * If the scanner ever trips it switches itself off and the counters carry on,
 * so the worst case is the progress meter without the live prose — never a
 * half-parsed sentence rendered as if it were an answer.
 */

/** Split a byte stream into JSON values, one per line, tolerating split chunks. */
export function createNdjsonReader(onValue) {
  let buffer = '';
  const emit = line => {
    line = line.trim();
    if (!line) return;
    try { onValue(JSON.parse(line)); } catch { /* a log line, not an event */ }
  };
  const push = function (chunk) {
    buffer += chunk;
    let index;
    while ((index = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, index);
      buffer = buffer.slice(index + 1);
      emit(line);
    }
  };
  push.finish = () => { emit(buffer); buffer = ''; };
  return push;
}

/**
 * Pull completed top-level fields out of a JSON document that is still being
 * written.
 *
 * A top-level comma or the root closing brace is a safe parse boundary. Native
 * JSON.parse does the validation and decoding, so strings, arrays and objects
 * are emitted whole or not at all.
 */
export function createPartialJsonScanner() {
  let buffer = '';
  const stack = [];
  let inString = false;
  let escaped = false;
  let started = false;
  let broken = false;
  const emitted = new Set();

  const parse = text => {
    const value = JSON.parse(text);
    if (!value || Array.isArray(value) || typeof value !== 'object') throw new Error('root is not an object');
    const done = [];
    for (const [key, field] of Object.entries(value)) {
      if (!emitted.has(key)) {
        emitted.add(key);
        done.push({ key, value: field });
      }
    }
    return done;
  };

  return {
    get broken() { return broken; },
    /** @returns {Array<{key: string, value: unknown}>} fields completed by this fragment */
    push(fragment) {
      if (broken) return [];
      const done = [];
      try {
        for (const ch of String(fragment)) {
          buffer += ch;
          if (inString) {
            if (escaped) { escaped = false; continue; }
            if (ch === '\\') { escaped = true; continue; }
            if (ch === '"') {
              inString = false;
              // A top-level string value is complete at its closing quote;
              // a closing key quote simply fails this best-effort parse.
              if (stack.length === 1 && stack[0] === '{') {
                try { done.push(...parse(`${buffer}}`)); } catch { /* key or incomplete value */ }
              }
            }
            continue;
          }
          if (ch === '"') { inString = true; continue; }
          if (ch === '{' || ch === '[') {
            if (!started) {
              if (ch !== '{') throw new Error('root is not an object');
              started = true;
            }
            stack.push(ch);
            continue;
          }
          if (ch === '}' || ch === ']') {
            const open = stack.pop();
            if ((ch === '}' && open !== '{') || (ch === ']' && open !== '[')) throw new Error('unbalanced JSON');
            if (started && stack.length === 0) done.push(...parse(buffer));
            continue;
          }
          if (ch === ',' && stack.length === 1 && stack[0] === '{') {
            done.push(...parse(`${buffer.slice(0, -1)}}`));
          }
        }
      } catch {
        broken = true;
        return [];
      }
      return done;
    },
  };
}

/**
 * Turn the CLI's event stream into one small, renderable snapshot.
 *
 * `onUpdate` is called with the same object each time, mutated in place — the
 * TUI repaints from it, it is not a log.
 */
export function createProgressTracker(onUpdate = () => {}) {
  const scanner = createPartialJsonScanner();
  const startedAt = Date.now();
  const state = {
    phase: 'starting',     // starting → thinking → writing → done
    thinkingTokens: 0,
    outputChars: 0,
    outputTokens: 0,
    targetTokens: 12_000,
    tokensPerSecond: 105,
    elapsedMs: 0,
    etaSeconds: null,
    fields: {},            // completed top-level strings, in arrival order
    lastField: null,
    liveProse: true,
  };

  const bump = () => {
    state.elapsedMs = Date.now() - startedAt;
    state.outputTokens = Math.max(state.outputTokens, Math.ceil(state.outputChars / 4));
    state.etaSeconds = state.phase === 'writing'
      ? Math.max(0, Math.ceil((state.targetTokens - state.outputTokens) / state.tokensPerSecond))
      : null;
    try { onUpdate(state); } catch { /* progress must never fail the answer */ }
  };

  return {
    state,
    handle(event) {
      if (event?.type === 'system' && event.subtype === 'thinking_tokens') {
        state.phase = 'thinking';
        state.thinkingTokens = event.estimated_tokens ?? state.thinkingTokens;
        return bump();
      }
      if (event?.type !== 'stream_event') return;
      const stream = event.event;
      const reportedTokens = Number(stream?.usage?.output_tokens);
      if (Number.isFinite(reportedTokens)) state.outputTokens = Math.max(state.outputTokens, reportedTokens);
      const delta = stream?.delta;
      if (!delta) return reportedTokens ? bump() : undefined;

      if (delta.type === 'thinking_delta') {
        state.phase = 'thinking';
        return bump();
      }
      if (delta.type === 'input_json_delta' && typeof delta.partial_json === 'string') {
        state.phase = 'writing';
        state.outputChars += delta.partial_json.length;
        for (const { key, value } of scanner.push(delta.partial_json)) {
          state.fields[key] = value;
          state.lastField = key;
        }
        state.liveProse = !scanner.broken;
        return bump();
      }
      if (delta.type === 'text_delta' && typeof delta.text === 'string') {
        state.phase = 'writing';
        state.outputChars += delta.text.length;
        return bump();
      }
    },
    finish() { state.phase = 'done'; state.etaSeconds = 0; bump(); },
  };
}
