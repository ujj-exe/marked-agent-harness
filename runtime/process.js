import { spawn } from 'node:child_process';

export function runProcess(command, args, { input, cwd, env, timeoutMs = 120000, signal, onStdout, onStderr } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, env, stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    let settled = false;
    const finish = (fn, value) => { if (!settled) { settled = true; clearTimeout(timer); fn(value); } };
    const timer = setTimeout(() => { child.kill('SIGTERM'); finish(reject, new Error(`${command} timed out after ${timeoutMs}ms`)); }, timeoutMs);
    const abort = () => { child.kill('SIGTERM'); finish(reject, new Error(`${command} cancelled`)); };
    if (signal) {
      if (signal.aborted) return abort();
      signal.addEventListener('abort', abort, { once: true });
    }
    child.on('error', err => finish(reject, err));
    child.stdout.on('data', chunk => { const text = chunk.toString(); stdout += text; onStdout?.(text); });
    child.stderr.on('data', chunk => { const text = chunk.toString(); stderr += text; onStderr?.(text); });
    child.on('close', (code, exitSignal) => {
      if (code === 0) finish(resolve, { stdout, stderr, code, signal: exitSignal });
      else {
        const detail = (stderr || stdout).trim().split('\n').filter(Boolean).slice(-2).join(' · ').slice(0, 200);
        finish(reject, Object.assign(new Error(`${command} exited with code ${code}${detail ? `: ${detail}` : ''}`), { code, signal: exitSignal, stdout, stderr }));
      }
    });
    if (input != null) child.stdin.end(input); else child.stdin.end();
  });
}

export function parseJsonOutput(text) {
  const raw = String(text || '').trim();
  try { return JSON.parse(raw); } catch {}
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) return JSON.parse(fenced[1]);
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start >= 0 && end > start) return JSON.parse(raw.slice(start, end + 1));
  throw new Error('Agent returned no JSON object');
}
