import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { DESK, expandDeskCommand, parseCapabilityCommand, parseDeskCommand, parseLiveCommand, parseModelCommand } from './commands.js';

describe('desk slash commands', () => {
  it('expands advertised commands into normal research queries', () => {
    expect(expandDeskCommand('/analyst Reliance Industries')).toBe('Analyze Reliance Industries');
    expect(expandDeskCommand('/compare TCS Infosys')).toBe('Compare TCS and Infosys');
    expect(expandDeskCommand('/compare reliance and infosys')).toBe('Compare reliance and infosys');
    expect(expandDeskCommand('/compare TCS vs. Infosys')).toBe('Compare TCS and Infosys');
    expect(expandDeskCommand('/macro RBI outlook')).toContain('RBI outlook');
    expect(parseDeskCommand('/futures crude').intent.kind).toBe('derivatives');
    expect(parseDeskCommand('/desk').intent.kind).toBe('desk');
  });

  it('validates commands that require user context', () => {
    expect(parseDeskCommand('/analyst').error).toMatch(/Usage/);
    expect(parseDeskCommand('/compare reliance').error).toMatch(/2–5/);
    expect(parseDeskCommand('/watch').error).toMatch(/watch/);
  });

  it('maps every advertised command to its intended route', () => {
    const cases = [
      // /analyst declares a company subject so its argument reaches the planner
      // as the entity, rather than being re-extracted from generated prose.
      ['/analyst Reliance Industries', 'company'],
      ['/compare Reliance and Infosys', 'compare'],
      ['/macro', 'macro'],
      ['/sector IT services', 'sector'],
      ['/desk', 'desk'],
      ['/risk Reliance', 'risk'],
      ['/options NIFTY', 'derivatives'],
      ['/futures crude', 'derivatives'],
      ['/watch Reliance announcements', 'watch'],
    ];
    for (const [input, route] of cases) {
      const parsed = parseDeskCommand(input);
      expect(parsed.error).toBeNull();
      expect(parsed.query).toBeTruthy();
      expect(parsed.intent?.kind ?? null).toBe(route);
    }
  });

  it('leaves non-desk input untouched', () => {
    expect(expandDeskCommand('What was Infosys profit?')).toBeNull();
    expect(expandDeskCommand('/marked mk_live_key')).toBeNull();
  });
});

describe('/model', () => {
  it('reports the current provider when given no argument', () => {
    expect(parseModelCommand('/model')).toEqual({ agent: null });
  });

  it('accepts either reasoning provider, case-insensitively', () => {
    expect(parseModelCommand('/model codex')).toEqual({ agent: 'codex' });
    expect(parseModelCommand('/model Claude')).toEqual({ agent: 'claude' });
    expect(parseModelCommand('/model claude-api')).toEqual({ agent: 'claude-api' });
    expect(parseModelCommand('/model codex-api')).toEqual({ agent: 'codex-api' });
  });

  it('refuses an unknown provider instead of silently keeping the old one', () => {
    expect(parseModelCommand('/model gpt5').error).toMatch(/claude-api.*codex-api/);
  });

  it('is not confused by other input', () => {
    expect(parseModelCommand('/models')).toBeNull();
    expect(parseModelCommand('What model does Reliance use?')).toBeNull();
    // A partial command must not open the picker while the user is still typing.
    expect(parseModelCommand('/m')).toBeNull();
    expect(parseModelCommand('/mod')).toBeNull();
  });

  it('pins a model, inline or as a second word', () => {
    expect(parseModelCommand('/model claude opus')).toEqual({ agent: 'claude', model: 'opus' });
    expect(parseModelCommand('/model claude:opus')).toEqual({ agent: 'claude', model: 'opus' });
  });

  it('separates "keep the saved model" from "go back to the CLI default"', () => {
    expect(parseModelCommand('/model codex')).not.toHaveProperty('model');
    expect(parseModelCommand('/model codex default')).toEqual({ agent: 'codex', model: null });
  });

  it('refuses a model the chosen provider does not offer', () => {
    expect(parseModelCommand('/model claude gpt-6-astra').error).toMatch(/claude does not offer/);
  });
});

describe('power workflow commands', () => {
  it('parses each workflow without claiming ordinary input', () => {
    expect(parseCapabilityCommand('/thesis Reliance Industries')).toMatchObject({ kind: 'thesis', reference: 'Reliance Industries' });
    expect(parseCapabilityCommand('/diff INFY FY25 FY26')).toMatchObject({ kind: 'diff', reference: 'INFY', periods: ['FY2025', 'FY2026'] });
    expect(parseCapabilityCommand('/rewind PAYTM 2024-03-01')).toMatchObject({ kind: 'rewind', reference: 'PAYTM', date: '2024-03-01' });
    expect(parseCapabilityCommand('/rewind 2024-03-01 PAYTM')).toMatchObject({ kind: 'rewind', reference: 'PAYTM', date: '2024-03-01' });
    expect(parseCapabilityCommand('/signal net margin above 10%')).toMatchObject({ kind: 'signal', expression: 'net margin above 10%' });
    expect(parseCapabilityCommand('/claims Tata Motors')).toMatchObject({ kind: 'claims', reference: 'Tata Motors' });
    expect(parseCapabilityCommand('Analyze Reliance')).toBeNull();
    expect(parseCapabilityCommand('/watch Reliance')).toBeNull();
  });

  it('rejects incomplete workflow commands before retrieval', () => {
    expect(parseCapabilityCommand('/diff').error).toMatch(/Usage/);
    expect(parseCapabilityCommand('/rewind PAYTM yesterday').error).toMatch(/YYYY-MM-DD/);
  });
});

describe('/live', () => {
  it('uses the default Indian index tape and accepts a custom list', () => {
    expect(parseLiveCommand('/live')).toEqual({ symbols: ['NIFTY', 'BANKNIFTY', 'INDIAVIX'], error: null });
    expect(parseLiveCommand('/live RELIANCE, INFY')).toEqual({ symbols: ['RELIANCE', 'INFY'], error: null });
    expect(parseLiveCommand('/live off')).toEqual({ symbols: [], error: null });
  });

  it('rejects malformed or oversized tapes', () => {
    expect(parseLiveCommand('/live nope!').error).toMatch(/Usage/);
    expect(parseLiveCommand('/live A B C D E F G H I').error).toMatch(/Usage/);
  });
});

describe('saveAgent', () => {
  it('rejects a provider that has no implementation', async () => {
    const { saveAgent } = await import('./config.js');
    expect(() => saveAgent('gpt5')).toThrow(/Unknown agent/);
  });

  it('stores provider keys in the permission-restricted config and honors env overrides', async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'marked-provider-key-'));
    const target = path.join(directory, 'config.json');
    try {
      const { agentApiKey, loadConfig, saveProviderKey } = await import('./config.js');
      saveProviderKey('claude-api', `sk-ant-${'a'.repeat(24)}`, target);
      const saved = JSON.parse(fs.readFileSync(target, 'utf8'));
      expect(saved.providerKeys['claude-api']).toMatch(/^sk-ant-/);
      expect(fs.statSync(target).mode & 0o777).toBe(0o600);
      expect(agentApiKey(saved, 'claude-api', { ANTHROPIC_API_KEY: 'from-env' })).toBe('from-env');
      expect(() => saveProviderKey('codex-api', 'wrong', target)).toThrow(/start with sk-/);
      expect(loadConfig().providerKeys).toBeDefined();
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });
});

describe('model catalogue', () => {
  it('offers a default row plus real ids for each provider', async () => {
    const { modelsFor, isKnownModel } = await import('../config/models.js');
    for (const agent of ['claude', 'claude-api', 'codex']) {
      const models = modelsFor(agent);
      expect(models[0].id).toBeNull();
      expect(models.length).toBeGreaterThan(1);
      // Every id is safe to hand a CLI as an argv entry.
      expect(models.slice(1).every(model => /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(model.id))).toBe(true);
      expect(isKnownModel(agent, models[1].id)).toBe(true);
    }
    expect(modelsFor('codex-api')[0].id).toMatch(/^gpt-/);
    expect(isKnownModel('claude', 'opus')).toBe(true);
    expect(isKnownModel('claude', 'not-a-model')).toBe(false);
  });
});

describe('desk commands carry their subject', () => {
  it('hands the argument to the planner instead of hiding it in prose', () => {
    // "Analyze India-market risks and event impact: asian paints" was routed as
    // a macro question, because "market" matched and the lower-case company did
    // not. The command knew the answer all along.
    expect(parseDeskCommand('/risk asian paints').intent).toEqual({ kind: 'risk', references: ['asian paints'] });
    expect(parseDeskCommand('/analyst tata motors').intent).toEqual({ kind: 'company', references: ['tata motors'] });
    expect(parseDeskCommand('/watch dixon').intent).toEqual({ kind: 'watch', references: ['dixon'] });
  });

  it('leaves market-wide commands unscoped', () => {
    expect(parseDeskCommand('/macro').intent.references).toEqual([]);
    expect(parseDeskCommand('/sector IT services').intent.references).toEqual([]);
  });
});

describe('query overlay', () => {
  it('lights up a command the runtime will actually run', async () => {
    const { highlightCommand } = await import('../terminal/render.js');
    expect(highlightCommand('/analyst Reliance')).toContain('\x1b[');
    expect(highlightCommand('/risk')).toContain('/risk');
    // An unknown slash word stays plain: the colour is a promise it will fire.
    expect(highlightCommand('/nonsense here')).toBe('/nonsense here');
    expect(highlightCommand('what is Reliance PAT?')).toBe('what is Reliance PAT?');
  });

  it('no longer answers to /portfolio', () => {
    // Removed with the feature: an unmapped slash word must fall through to
    // "unknown command", not quietly become a research query.
    expect(parseDeskCommand('/portfolio RELIANCE 60%, INFY 40%')).toBeNull();
    expect(DESK.map(([name]) => name)).not.toContain('/portfolio');
  });
});
