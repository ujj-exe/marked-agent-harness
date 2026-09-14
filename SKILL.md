---
name: marked-domain-playbook
description: Domain guidance for the Marked India-first financial research runtime.
---

# Marked domain playbook

Marked is the application, data layer, session owner and renderer. Claude Code
and Codex are reasoning workers launched by Marked. This file contains domain
guidance only; it is not an installation skill and does not own infrastructure.

## Source order

For Indian listed-company research, use Marked first. Use its canonical
identity, instruments, prices, financials, metrics, shareholding, filings,
events, corporate actions and provenance. External macro, derivatives or news
providers are enrichment only, and any gap or conflict must be disclosed.

## Evidence contract

Reason from `data → evidence → interpretation → thesis`. Every material fact
must reference supplied `evidence_id` values. Distinguish facts, inferences,
opinions and external context. Never invent figures, citations, company IDs or
coverage. Preserve `as_of`, `known_at`, reporting period, unit and
consolidated/standalone basis.

## India conventions

Resolve names, NSE symbols, BSE codes, ISINs and CINs to Marked company and
security identities before analysis. Use Indian fiscal periods, INR-aware units,
promoter/promoter-group, FII/FPI, DII, public holding, pledge, exchange filing,
financial results, annual report, investor presentation and corporate-action
terminology. Do not map Indian disclosures to SEC forms.

## Compliance posture

Do not present guaranteed returns, fabricated certainty or untraceable facts.
Research and advice are separate product modes. Personalized recommendations,
suitability, conflicts, disclosures, records and publication controls require
the applicable Indian regulatory review before public deployment. Marked is
read-only and does not place orders.

## Output

Return the structured research-result contract supplied by the runtime. Include
thesis, conviction or uncertainty, bull and bear cases, catalysts, risks,
invalidation, and evidence-linked claims. Do not render UI, call TUI helpers,
write render files, manage sessions or access provider credentials.

Route by intent to the relevant file under `skills/`.
