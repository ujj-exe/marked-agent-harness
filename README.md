# Marked Agent Harness

**A domain-specific agentic harness for financial research.**

Marked turns frontier reasoning models into grounded financial research agents.
It supplies the financial-domain runtime, the structured retrieval, the
provenance, the validation and the terminal, and it hands the model a research
context instead of a search box. It is built for Indian financial markets, with
Marked as the primary data layer and Claude Code or Codex as interchangeable
reasoning workers.

> Models reason. Marked plans, retrieves, validates, remembers, and renders.

```bash
curl -fsSL https://marked.run/install | sh
```

The harness is this repository and it is free software. The data is not. You
get an API key at [marked.run](https://marked.run), and the harness calls
`api.marked.run` for Indian company identity, prices, financials, metrics,
shareholding, filings, events, corporate actions and provenance.

## What Marked is

Most financial AI systems are a model with tools bolted on. A question arrives,
the model decides what to search, something comes back, and the model writes an
answer. Everything that matters about financial research, which period, which
basis, which entity, what was knowable when, is left for the model to work out
mid-sentence.

Marked puts a harness in front of the model and keeps the model at the end of
the pipeline rather than the start of it.

```
  User
    │
    ▼
┌──────────────────────────────────┐
│     Marked agentic harness       │
│                                  │
│   intent and plan                │
│   entity resolution              │
│   financial data retrieval       │
│   point-in-time context          │
│   provenance                     │
│   result validation              │
│   bounded repair                 │
│   session state                  │
└──────────────────────────────────┘
    │
    ▼
  Claude Code or Codex
  reasoning worker
    │
    ▼
  structured result
    │
    ▼
  evidence validation
    │
    ▼
  Marked TUI
```

The reasoning model is not the application. Claude Code and Codex are workers
launched by Marked, and they do not own the terminal, the credentials, the
application state or the data layer. Marked controls their stdin, stdout,
timeout, cancellation, workspace and exit status, and validates the structured
JSON that comes back.

## Why the domain belongs in the harness

Financial research carries problems a generic agent runtime has no reason to
know about: Indian company and security identity, the relationships between NSE
symbols, BSE codes, ISINs and CINs, Indian fiscal periods, consolidated against
standalone reporting, the semantics of a financial statement, promoter and
institutional ownership, promoter pledge, corporate actions, exchange filings,
point-in-time correctness, evidence and provenance, and the normalization of
financial concepts that people write a dozen different ways.

Marked puts all of that inside the harness. The model never has to discover
from scratch what PAT means, or cash conversion, or promoter holding, or
FY2026, or what an Indian exchange disclosure is. The harness turns a
natural-language question into a structured, evidence-backed research task
before any model is asked to think about it.

Ask `what changed in Dixon this year` and Marked resolves the company, periods,
concepts and evidence before the model reasons. The user never needs to know
which endpoints, metrics or filings were required.

## Self-healing research

Real financial questions are ambiguous, and a planner can get them wrong. Asked
about "cash flow" it may reach for the cash balance when the question meant
operating cash flow. Marked is built to recover from that without making the
user rewrite the question.

Neither planner is the source of truth. The data service reads the question
well but can return a display name its own search cannot resolve, or a single
fiscal year where the question asked for a range. The local extractor knows the
arithmetic but not the finance. So both produce candidates, they are merged,
and the result is checked before a single fact is fetched.

```
  candidate plans
        │
        ▼
  merge and validate
        │
        ▼
  execute against Marked
        │
        ▼
  deterministic sufficiency check
        │
        ├─────────────── complete ──────────────┐
        │                                       │
   insufficient                                 │
        │                                       │
        ▼                                       │
      judge                                     │
        │                                       │
        ▼                                       │
  repair diagnosis                              │
        │                                       │
        ▼                                       │
  deterministic plan repair                     │
        │                                       │
        ▼                                       │
  one bounded retry                             │
        │                                       │
        └───────────────────┬───────────────────┘
                            ▼
                         reason
```

The judge never writes an execution plan. It produces a diagnosis of what the
results lack, and the runtime checks that diagnosis against what Marked
actually exposes before building the repair. Every field the judge returns is
validated against Marked's published vocabulary, and anything invalid is
discarded rather than queried. A judge that fails, times out or answers
nonsense leaves the plan exactly as it was, so review can improve a plan and
never break one.

Retrieval sufficiency is not answer completeness. For analytical requests the
runtime also creates a typed research mandate covering the requested return,
valuation, peer, ownership, event, operating and forward-looking legs. The
packet is checked against that mandate before synthesis. Missing material legs
grant targeted provider-native web search; after synthesis, a second gate
checks that every completed leg is linked to evidence used by a retained claim.
One bounded repair pass fills omissions or removes unsupported assertions.

The saved `research_cycle` is the audit receipt: mandate, API calls, expanded
documents, search decision, sources, each synthesis attempt, citation issues
and final coverage status. A material citation problem is never rendered as a
polished thesis; a genuinely unavailable leg remains explicitly labeled.

## No user question should become a runtime error

Marked separates research outcomes from system failures. An answer, a partial
answer, insufficient data and a request for clarification are all legitimate
results of a research run. Transient API failures, rate limits, incomplete
plans and malformed model output are conditions the runtime handles internally
wherever it can.

A genuine data gap becomes a visible data-gap response. When the requested
facts are absent, the terminal renders DATA GAP and no reasoning provider is
launched at all. A model that cannot see the number does not get to write about
it.

## Marked as the financial data layer

Marked is the primary source for Indian company research: company identity,
securities, prices, financial statements, financial facts, financial metrics,
shareholding, promoter information, pledge, filings, documents, corporate
actions, events, search, provenance and point-in-time data.

External providers cover enrichment where Marked reports no coverage, such as
macro, news, derivatives and broader web research. Marked does not silently
substitute an external source for data it holds, and where an external source
is used it stays distinguishable in the output.

## Evidence first

Research runs in one direction: data, then evidence, then interpretation, then
thesis. Material factual claims link to `evidence_id` values, and evidence
keeps the context that makes a number meaningful: company, period, basis, unit,
source, document, filing or publication date, `known_at` and `as_of`.

The reasoning worker is not trusted to invent provenance. The runtime validates
every evidence reference against the retrieved research context before anything
is rendered, which is what lets the output keep fact, inference, opinion and
external context apart instead of collapsing them into one generated paragraph.

## Point-in-time research

Financial research is temporal. A question about a company in 2024 must not
quietly inherit what became knowable in 2026, so `as_of`, `known_at`, `period`,
`period_end`, `event_date`, `filing_date` and `retrieved_at` are kept as
distinct pieces of research context rather than flattened into one date.

Indian fiscal language is resolved before retrieval, not after: "last financial
year" becomes the latest completed April to March year rather than whatever a
model assumes a year is.

```bash
marked --agent codex --as-of 2025-03-31T23:59:59Z "What changed in Reliance?"
```

## Indian first by design

The harness is built around Indian market conventions and understands NSE, BSE,
ISIN and CIN identity, promoter and promoter group, FII and FPI, DII, public
shareholders, the shareholding pattern, promoter pledge, financial results,
annual reports, investor presentations, exchange filings, corporate
announcements and corporate actions.

It does not force Indian disclosures into US-market shapes. There is no 10-K,
no 10-Q, no 8-K and no CIK in this model of the world.

## Model agnostic

Marked does not depend on one reasoning model. Today it drives Claude Code and
Codex; the architecture lets another reasoning worker be added without touching
the financial data or research layers. The harness owns the context, so the
model is replaceable.

Reasoning runs through a CLI you already have, which means the model is
whatever that CLI accepts. Switch at any time with `/model`.

| Runtime | Auth | Models |
| --- | --- | --- |
| `claude` | your Claude Code CLI | `opus`, `fable`, `sonnet`, `haiku`, aliases that always resolve to the latest of each |
| `claude-api` | Anthropic API key stored locally | models exposed by that key |
| `codex` | your Codex CLI | read live from the CLI's own catalogue on disk |
| `chatgpt` | ChatGPT device code | models exposed by the subscription auth |
| `chatgpt-api` | ChatGPT/OpenAI API key stored locally | supported models exposed by that key |

Codex models are deliberately not curated in this repository, because a list
written here goes stale on the next release. Choosing "Default" leaves the
model to whatever the CLI is already configured to use.

`/model` and `/models` list Claude Code CLI, Claude API, Codex CLI, ChatGPT
subscription and ChatGPT API separately. An API row says `key not set` until
connected; selecting it reuses the hidden key-input TUI, authenticates against
the provider's model endpoint and shows only supported text/reasoning models
that credential exposes. The subscription row similarly shows sign-in state
and can launch device authentication directly from `/models`. Keys are stored
in the active config at mode 0600;
`ANTHROPIC_API_KEY` and `OPENAI_API_KEY` override saved keys.

`openai-codex` authenticates through ChatGPT device code and uses the Codex
backend, not the standard OpenAI API-key endpoint, which stays separate. Manage
it with `marked-auth login`, `status`, `models` and `logout`. Credentials live
in `~/.marked/auth.json` with user-only permissions, and refresh tokens are
never returned by status commands, included in prompts, written to telemetry,
or sent to the data service.

## Native API, external MCP

The application uses its first-party API client internally. REST and MCP are
external integration surfaces for other agents reaching Marked, not extra hops
inside this runtime.

## API capacity

The data client is the single REST boundary. It handles `Retry-After` aware
backoff, preserves rate-limit headers and supports cancellation.

## The research terminal

Marked includes a full-screen terminal for working with research state, which
combines financial profiles, time series, market context, ownership, filings,
events, corporate actions, evidence, research verdicts, comparisons and risk
analysis.

The terminal is a presentation layer owned by Marked. Reasoning workers never
write render files and never talk to the TUI.

Nine seats make up the team. Each is a skill under `skills/`, loaded by intent,
with its own procedure.

| Command | Takes | Seat |
| --- | --- | --- |
| `/analyst` | `<company>` | filings, fundamentals, or any research question |
| `/compare` | `<a> and <b>` | 2 to 5 names, separated by and / vs / comma |
| `/macro` | | RBI, inflation, growth, the regime behind the trade |
| `/sector` | `<sector>` | rotations, thematics, and the names moving money |
| `/desk` | `<company>` | market pulse, 3 seconds, everything that matters |
| `/risk` | `<company>` | event impact, catalyst timing, what could go wrong |
| `/options` | `<symbol>` | chains, OI skew, positioning |
| `/futures` | `<symbol>` | commodities, rates futures, the cross-asset tape |
| `/watch` | `<companies>` | what moved, conviction logged |

Plain questions work too. The commands are shortcuts, not a required syntax.

Screens are their own shape and need no company at all:

```
which companies have net margin above 10% and revenue growth above 20% in FY2025
```

A screen is detected before entity extraction runs, because it is the one
question that names no company and an extractor with nothing to find will reach
for whatever nouns are present. Thresholds written as bare numbers are read as
percentages, since nobody asks for a margin above 0.1, and a metric named
without a threshold is reported rather than screened on. Matches whose ratios
fall outside any plausible range are withheld: a near-zero denominator produces
a margin of 19,800%, and a screen sorts precisely those to the top.

`/analyst` is not a prompt wrapper. It resolves the reference to one canonical
company and stops on ambiguity, fixes `as_of`, defaults to consolidated and
refuses to mix basis silently, walks multi-year statements, margins, debt,
working capital and cash conversion, reads promoter, FII and FPI, DII, public
holding and pledge changes, reads results, annual reports, presentations,
disclosures, events and corporate actions, and returns a thesis with bull case,
bear case, catalysts, invalidation conditions and evidence-linked claims.

### Company World

A company is a place you enter, not a name you repeat. `/world` opens a search
that resolves a name, ticker, ISIN or CIN to one canonical company, and from
that point the prompt reads `INFY ›` and every question is about Infosys until
`/exit`. Nothing outside a world changes: ordinary questions and every command
above behave exactly as they did.

Inside, eleven tabs are views over a single retrieval — Overview, Chart,
Financials, Ownership, Filings, Events, Valuation, Peers, Risk, News, Research
and Evidence. Switching between them re-renders from memory rather than
fetching again, which is what makes it read as a workstation instead of a queue
of queries. `←` and `→` step through them, or type the name. Reopening a
company restores the tab and chart you left it on; the data is always fetched
fresh, because showing last week's figure as current is the one failure this
cannot afford.

Follow-up questions inherit the company, so `why did working capital move?`
needs no name in it.

### Charts, comparison and context

`/chart revenue 5y`, `/chart roe yoy`, `/chart revenue vs TCS`. Every series
comes from the metric library or the reported facts, never from arithmetic the
chart did itself, so a margin drawn here and a margin printed in the Financials
table are the same number by construction. Fundamentals render as labelled bars
rather than a line, because four annual points drawn as a line is a shape with
no information in it. Comparing an absolute measure rebases it to 100, since
comparing ₹1.47 lakh crore against ₹2.25 lakh crore as bars says only which
company is larger.

`/compare INFY TCS HCLTECH` puts two to five companies side by side on the same
arithmetic, with a second table naming which one leads on each measure and in
which direction — more revenue growth is better, more receivable days is not.

`/market` is the tape every Indian company is priced against: the policy repo
rate, the rupee, and the commodity complex. `/news` is the feed, narrowable by
topic or region, with a per-company tab inside a world. Publisher and tier lead,
because "the exchange said it" and "a newspaper said it" are different claims.
Both datasets travel in the research packet, so a question about what Middle
East oil does to a refiner is answered from the oil price, the headlines and the
company's own margins together rather than from a linkage the model invented.

### Evidence

Every retrieved fact carries a short reference, `E12`, which appears beside the
figures built on it. Typing it opens the record: the measure, the value, the
period, the basis, the document, the source URL, and the restatement trail —
every version of that number ever published. Derived ratios cite their inputs,
so return on equity names the profit and the equity it divided, and each of
those opens its own filing.

Published-at and known-at are kept apart throughout. The first is when a filing
appeared; the second is when the number could first have been acted on, and a
point-in-time answer depends on the difference.

### Keys

The command line is always open — there is no key that starts a question, you
type. `Enter` asks, `↑` and `↓` recall previous questions, `Ctrl+C` abandons a
running query without leaving the app, and `Ctrl+D` quits from an empty line.
`Ctrl+G` shows the full reference, `Ctrl+S` saves a report, `Ctrl+O` loads one,
and `PgUp`/`PgDn` scroll. `/model` switches runtime, `/marked <key>` saves a
key, `/new` and `/history` manage the conversation, and `/1` to `/9` run a
suggested follow-up. `marked --help` prints all of it.

## Quick start

Installation walks four steps in the terminal itself: global or
per-repository configuration, your API key entered hidden and checked against
the API, a choice of Claude Code CLI, Codex CLI or an OpenAI Codex
subscription, and a model. Re-run it any time with `marked-onboard`.
Re-running the installer updates a clean managed checkout; if that checkout was
modified, it is preserved beside the new installation as a timestamped backup.
The home screen checks the installed commit in the background and shows an
update alert when `main` changes. Run `marked --update` to install it without
re-running onboarding.

To drive it directly:

```bash
marked --agent codex "Analyze Reliance Industries"
marked --agent claude "Compare TCS and Infosys"
marked --agent codex --as-of 2025-03-31T23:59:59Z "What changed in Reliance?"
```

Configuration lives in `~/.marked/config.json` at mode 0600, and a
`.marked/config.json` inside a repository takes precedence over the global one:

```json
{
  "apiKey": "mk_live_...",
  "agent": "codex"
}
```

`MARKED_API_KEY` in the environment overrides the file. Sessions,
`conversation.json` for follow-ups and saved reports live under `~/.marked/`
alongside it.

## Architecture

`runtime/` owns planning, orchestration, providers, validation and sessions;
`data/` owns the Marked API and canonical financial model; `skills/` defines
what each research seat investigates; `src/` and `terminal/` own presentation;
`bin/` contains the CLI entrypoints. See [ARCHITECTURE.md](ARCHITECTURE.md) for
the full flow.

## Design principles

- Domain-specific retrieval over generic search.
- Evidence over confidence; an explicit gap beats an unsupported answer.
- Deterministic control around probabilistic reasoning.
- Bounded recovery rather than an uncontrolled model loop.
- Point-in-time correctness and provider independence.

## Development

Node.js 20+ and Python 3.11+.

```bash
npm install
npm test
npm run build     # bundles terminal/dist/app.mjs, commit the result

uv sync
uv run pytest
uv run ruff check .
```

The terminal ships as a built bundle, so a change under `terminal/` is not live
until `npm run build` has run. There is headless smoke coverage for the
research pipeline as well, so a healthy run is verifiable without the
interactive terminal.

## Compliance boundary

Marked is read-only and places no orders. It separates Marked-backed facts from
model interpretation. Publishing or distributing investment research still
requires review for applicable regulatory, disclosure, conflicts, suitability,
recordkeeping and publication requirements. This repository is not legal
advice.

## License

Marked Agent Harness is licensed under the GNU Affero General Public License
v3.0. See [LICENSE](LICENSE) for the full text.

The license covers the software in this repository. Marked's hosted data
services, datasets, APIs and other separately licensed materials are governed
by their own terms.

Marked is actively developed as the domain-specific execution layer around
financial reasoning, not another finance chatbot.
