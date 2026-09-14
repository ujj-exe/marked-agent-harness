import { describe, expect, it } from 'vitest';
import { applyAnswer, choiceResolvesToConcepts, clarifyPrompt, companyClarification, entityClarification, generateClarification, nextClarification, planClarifications } from './clarify.js';
import { buildDataPlan } from './plan.js';
import { extractConcepts } from '../data/concepts.js';

describe('company clarification', () => {
  const error = {
    code: 'AMBIGUOUS_COMPANY',
    reference: 'Tata',
    choices: [
      { name: 'Tata Motors', subtitle: 'TATAMOTORS' },
      { name: 'Tata Steel', subtitle: 'TATASTEEL' },
      { name: 'Tata Motors', subtitle: 'duplicate' },
    ],
  };

  it('asks which company instead of failing the query', () => {
    const ask = companyClarification(error);
    expect(ask.prompt).toBe('Which "Tata" did you mean?');
    // A repeated name is one choice, not two identical rows.
    expect(ask.choices.map(choice => choice.name)).toEqual(['Tata Motors', 'Tata Steel']);
  });

  it('substitutes the answer into the original question', () => {
    const ask = companyClarification(error);
    expect(applyAnswer('Analyze Tata', ask, ask.choices[0])).toBe('Analyze Tata Motors');
    expect(applyAnswer("Tata's margins", ask, ask.choices[1])).toBe("Tata Steel's margins");
  });

  it('stays silent for every other failure', () => {
    expect(companyClarification({ code: 'COMPANY_NOT_FOUND', reference: 'Zzz' })).toBeNull();
    expect(companyClarification({ code: 'AMBIGUOUS_COMPANY', reference: 'Tata', choices: [] })).toBeNull();
    expect(companyClarification(new Error('network'))).toBeNull();
  });
});

describe('plan clarification', () => {
  it('asks what to compare when a comparison names no measure', () => {
    const [ask] = planClarifications(buildDataPlan('Compare TCS and Infosys'));
    expect(ask.prompt).toBe('Compare TCS and Infosys on what?');
    expect(ask.choices.length).toBeGreaterThan(2);
  });

  it('asks what the user wants to know about a bare company', () => {
    const [ask] = planClarifications(buildDataPlan('Tata Motors'));
    expect(ask.prompt).toMatch(/What do you want to know about Tata Motors/);
  });

  it('never interrupts a question it can already answer', () => {
    for (const question of [
      'What was Infosys PAT in FY2025?',
      'Compare TCS and Infosys PAT in FY2025',
      "Why did Reliance Industries' PAT grow from FY2024 to FY2026?",
      "What's driving the recent earnings slowdown at Asian Paints?",
      'What is the RBI policy outlook?',
    ]) {
      expect(planClarifications(buildDataPlan(question))).toEqual([]);
    }
  });

  it('asks at most one question before answering', () => {
    expect(planClarifications(buildDataPlan('Tata Motors')).length).toBeLessThanOrEqual(1);
  });

  it('offers only answers that resolve to real Marked concepts', () => {
    // An option that plans nothing would send the user in a circle.
    for (const ask of [...planClarifications(buildDataPlan('Tata Motors')),
                       ...planClarifications(buildDataPlan('Compare TCS and Infosys'))]) {
      for (const choice of ask.choices) {
        if (choice.append === 'latest filings') continue;   // routes to filings, not a concept
        expect(choiceResolvesToConcepts(choice, extractConcepts)).toBe(true);
      }
    }
  });

  it('turns the answer into a question the planner can act on', () => {
    const [ask] = planClarifications(buildDataPlan('Tata Motors'));
    const earningsQuality = ask.choices.find(choice => choice.name === 'Earnings quality');
    const sharpened = applyAnswer('Tata Motors', ask, earningsQuality);
    const plan = buildDataPlan(sharpened);
    expect(plan.required_concepts).toContain('ProfitAfterTax');
    expect(plan.required_concepts).toContain('NetCashFromOperatingActivities');
    expect(plan.requires_facts).toBe(true);
    expect(planClarifications(plan)).toEqual([]);   // and it does not ask again
  });
});

// ── Generated questions ─────────────────────────────────────────────────────
// A fixed menu is the same answer to every question. These are written for the
// query, then validated: an option that retrieves nothing wastes the ask.

describe('generated clarification', () => {
  const plan = { ...buildDataPlan('Dixon'), references: ['Dixon'], route: 'factual_lookup', subject: 'company' };
  const reply = value => ({ run: async () => value });

  it('keeps only options that resolve to real Marked concepts', async () => {
    const out = await generateClarification(reply({
      prompt: 'What about Dixon?',
      options: [
        { label: 'Growth', detail: 'top line', append: 'revenue and profit after tax' },
        { label: 'Vibes', detail: 'mood', append: 'market sentiment and analyst buzz' },
        { label: 'Leverage', detail: 'debt', append: 'borrowings and total equity' },
      ],
    }), 'Dixon', plan, {});
    expect(out.choices.map(c => c.name)).toEqual(['Growth', 'Leverage']);
  });

  it('falls back rather than asking a question with one usable answer', async () => {
    const out = await generateClarification(reply({
      prompt: 'What about Dixon?',
      options: [{ label: 'Only one', append: 'revenue' }, { label: 'Nonsense', append: 'vibes' }],
    }), 'Dixon', plan, {});
    expect(out).toBeNull();
  });

  it('falls back when the provider fails or answers nothing usable', async () => {
    expect(await generateClarification({ run: async () => { throw new Error('down'); } }, 'Dixon', plan, {})).toBeNull();
    expect(await generateClarification(reply('not json'), 'Dixon', plan, {})).toBeNull();
    expect(await generateClarification(reply({ options: [] }), 'Dixon', plan, {})).toBeNull();
    expect(await generateClarification(null, 'Dixon', plan, {})).toBeNull();
  });

  it('answers by sharpening the question, so the planner replans from it', async () => {
    const out = await generateClarification(reply({
      prompt: 'What about Dixon?',
      options: [
        { label: 'Earnings quality', append: 'profit after tax versus operating cash flow' },
        { label: 'Leverage', append: 'borrowings and total equity' },
      ],
    }), 'Dixon', plan, {});
    const sharpened = applyAnswer('Dixon', out, out.choices[0]);
    const replanned = buildDataPlan(sharpened);
    expect(replanned.required_concepts).toContain('ProfitAfterTax');
    expect(replanned.required_concepts).toContain('NetCashFromOperatingActivities');
  });

  it('tells the generator what Marked cannot supply', () => {
    const prompt = clarifyPrompt('Dixon', plan, { limitations: ['no segment breakdowns'] });
    expect(prompt).toContain('no segment breakdowns');
    expect(prompt).toContain('ProfitAfterTax');
  });
});

// ── The entity step ─────────────────────────────────────────────────────────
// "reliance" matches seven listed companies. Resolution used to pick one and
// say nothing, which is a silent wrong answer whenever a different one was meant.

describe('entity step', () => {
  const hits = names => ({ search: async () => ({ data: names.map(name => ({ kind: 'company', common_name: name })) }) });

  it('asks which company when the name matches several', async () => {
    const ask = await entityClarification(hits(['Reliance Industries', 'Reliance Power', 'Reliance Infrast.']), 'reliance');
    expect(ask.prompt).toBe('Which "reliance" did you mean?');
    expect(ask.choices.map(c => c.name)).toContain('Reliance Power');
  });

  it('stays quiet when there is nothing to choose between', async () => {
    expect(await entityClarification(hits(['Infosys']), 'infosys')).toBeNull();
    expect(await entityClarification(hits([]), 'nothing')).toBeNull();
  });

  it('stays quiet when the reference already names one exactly', async () => {
    // Typing the full name is the answer to the question, so do not ask it.
    const ask = await entityClarification(hits(['Reliance Power', 'Reliance Industries']), 'Reliance Power');
    expect(ask).toBeNull();
  });

  it('survives a search that fails, rather than blocking the query', async () => {
    expect(await entityClarification({ search: async () => { throw new Error('down'); } }, 'x')).toBeNull();
    expect(await entityClarification({}, 'x')).toBeNull();
  });

  it('asks who before what', async () => {
    const data = hits(['Reliance Industries', 'Reliance Power']);
    const plan = { ...buildDataPlan('Reliance'), subject: 'company', references: ['Reliance'], route: 'factual_lookup', required_concepts: [] };
    const ask = await nextClarification(data, null, 'Reliance', plan, {});
    expect(ask.kind).toBe('entity');
  });

  it('moves on to the measure once the company is settled', async () => {
    const data = hits(['Reliance Power']);
    const plan = { ...buildDataPlan('Reliance Power'), subject: 'company', references: ['Reliance Power'], route: 'factual_lookup', required_concepts: [] };
    const ask = await nextClarification(data, null, 'Reliance Power', plan, {});
    expect(ask.kind).toBe('measure');
  });

  it('asks nothing at all once the request is specific', async () => {
    const plan = buildDataPlan('What was Infosys PAT in FY2025?');
    expect(await nextClarification(hits(['Infosys']), null, 'q', plan, {})).toBeNull();
  });
});
