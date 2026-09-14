# Marked architecture

Marked is the application. Claude Code and Codex are subordinate reasoning
providers.

```text
User
  ↓
Marked runtime
  ├─ intent + session
  ├─ Marked data client
  ├─ canonical identity
  ├─ research packet + provenance
  ├─ Claude/Codex provider
  ├─ output/evidence validation
  └─ TUI client
       ↓
     terminal renderer
```

## Data

`data/marked-client.js` is the only REST boundary. It uses the documented
Marked endpoints and preserves response envelopes, metadata and rate-limit
headers. Company references are resolved before company-specific reads.

The canonical model is:

```text
Company: company_id, legal_name, common_name, CIN, sector, listing_status
Security: security_id, company_id, exchange, symbol, ISIN, type, segment
Evidence: evidence_id, company_id, document, source URL, period, basis, known_at
```

The client accepts Marked's current response fields and keeps the raw record in
`metadata`; it does not use Yahoo symbols, SEC CIKs or exchange symbols as the
company identity.

`data/normalization.js` is the analyst-facing display boundary: raw facts become
canonical labels, periods, basis, units and classifications (`reported metric`,
`derived metric` or `raw fact`) before reaching the TUI. Raw records remain in
the research packet for provenance and worker reasoning.

`runtime/temporal.js` resolves Indian financial-year language before retrieval;
for example, “last financial year” becomes the latest completed Apr–Mar year.
`runtime/mode.js` selects factual, comparative, analytical, research, screening
or event output so a simple lookup does not inherit an investment-research
template.

## Runtime

A question that names a financial measure is a data-retrieval job, not a search
job. `runtime/plan.js` parses entity, metric, fiscal years, period and basis out
of the question; `data/concepts.js` maps the words people use (PAT, net profit,
earnings, operating profit) onto canonical Marked concept identifiers and never
invents one. The plan is executed against `/v1/financials` and
`/v1/financial-metrics` — one explicit retrieval per requested period — and every
returned row must carry value, concept, period, basis, unit and company identity
before it becomes a `financial_fact` with its own evidence ID.

`needs_plan` from `POST /v1/query` is Marked asking for a retrieval plan. The
runtime supplies one and retries; it is never evidence and never an answer. A
search or planning record stays `query_evidence` and cannot satisfy a numeric
claim. When the requested facts are absent the runtime renders DATA GAP and does
not launch a reasoning provider at all.

The orchestrator uses local intent only as a fast path. Natural-language
questions go through Marked's Luna-backed plan and executor, then the returned
route, company references, concepts and evidence determine the local packet
and visual blocks. It assigns evidence IDs, launches one reasoning provider,
validates structured JSON and renders the result. Provider selection is
centralized in `runtime/providers.js`.

Workers receive no Marked API key and no TUI protocol. Marked controls their
stdin/stdout, timeout, cancellation, exit status and workspace. The current
runtime uses prefetched context; a restricted Marked tool bridge can be added
later for iterative research.

## TUI

The existing ANSI components, schemas, layout engine, progressive patches and
keyboard controls are retained. `runtime/tui-client.js` starts and controls the
TUI. The worker never writes render files or connects to the
TUI. Temporary render files are created and removed by the runtime only.

## Providers

Marked is primary for Indian company data and broad structured queries. Macro,
news and derivatives remain separate provider boundaries and may be added only
where Marked reports missing coverage. External data must carry a visible
source label.

## State

All new state uses `~/.marked/`, centralized in `config/paths.js`. Sessions are
stored per research ID, while `conversation.json` retains the recent turns for
continuous follow-up questions and is the source of truth when switching from
Claude to Codex.
