# Marked Agent Harness

A domain-specific agentic harness for Indian equity research. It runs a
full-screen terminal, plans its own retrieval, executes against the Marked
data service, validates every fact it is handed, and only then puts a
reasoning model to work.

```bash
curl -fsSL https://marked.run/install | sh
```

The harness is this repository and it is free software. The data is not: you
get an API key at [marked.run](https://marked.run), and the harness calls
`api.marked.run` for canonical Indian company identity, prices, financials,
metrics, shareholding, filings, events and corporate actions.

## Why a harness and not a chatbot

Ask a language model what Reliance earned last financial year and it answers.
That is the failure. The number comes from training data of unknown vintage, on
an unstated accounting basis, for a fiscal year the model guessed at, and it
arrives with exactly the confidence of a number that was actually looked up.

Marked refuses to work that way. A question naming a financial measure is a
retrieval job, not a search job:

1. `runtime/plan.js` parses entity, metric, fiscal years, period and basis out
   of the question.
2. `data/concepts.js` maps the words analysts really use (PAT, net profit,
   earnings, operating profit) onto canonical concept identifiers. It never
   invents one.
3. The plan executes against `/v1/financials` and `/v1/financial-metrics`, one
   explicit retrieval per requested period.
4. A returned row becomes a fact only if it carries value, concept, period,
   basis, unit and company identity. Then it gets its own evidence ID.
5. If the facts are not there, the terminal renders DATA GAP and no reasoning
   provider is launched at all.

A model that cannot see the number does not get to write about it.

## The worker is subordinate

Claude Code and Codex are reasoning workers, not the application. Marked owns
the session, the retrieval, the renderer and the evidence.

A worker receives a prefetched research packet with provenance. It does not
receive the Marked API key, the TUI protocol, a render channel or a network
path of its own. Marked controls its stdin, stdout, timeout, cancellation,
workspace and exit status, and validates the structured JSON that comes back
against the output contract.

`needs_plan` from the data service is Marked asking for a retrieval plan, so
the runtime supplies one and retries. It is never evidence and never an answer.
A search record cannot satisfy a numeric claim.

## Skills

Every seat on the team is a skill under `skills/`, loaded by intent, with its
own procedure. `/analyst` is not a prompt wrapper: it resolves the reference to
one canonical company and stops on ambiguity, fixes `as_of`, defaults to
consolidated and refuses to mix basis silently, walks multi-year statements,
margins, debt, working capital and cash conversion, reads promoter, FII/FPI,
DII, public holding and pledge changes, then returns thesis, bull case, bear
case, catalysts, invalidation and evidence-linked claims.

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

The domain playbook in `SKILL.md` binds all of them: reason from data to
evidence to interpretation to thesis, cite `evidence_id` for every material
fact, separate fact from inference from opinion, preserve `as_of`, `known_at`,
period, unit and consolidated or standalone basis, and never map Indian
disclosures onto SEC forms.

## India, handled before retrieval

`runtime/temporal.js` resolves Indian fiscal language before anything is
fetched, so "last financial year" becomes the latest completed April to March
year rather than whatever a model assumes a year is. Names, NSE symbols, BSE
codes, ISINs and CINs resolve to canonical company and security identities
first. `runtime/mode.js` picks factual, comparative, analytical, research,
screening or event output, so a one-line lookup does not inherit an investment
research template.

Marked is read only. It places no orders.

## Setup

Installation opens the terminal and walks four steps in the same full-screen
UI:

1. Global or per-repository configuration.
2. Your Marked API key, entered hidden and checked against the API.
3. Claude Code CLI, Codex CLI, or an OpenAI Codex subscription.
4. A model.

Re-run it any time with `marked-onboard`. Open the terminal with `marked`.

Inside: `n` to ask, `?` for the keyboard reference, `/model` to switch runtime,
`/marked <key>` to save a new key, `/new` and `/history` for conversation,
`s` and `l` to save and load reports, `1` to `9` to run a suggested follow-up,
`q` to step back. `marked --help` prints all of it.

## Models

Marked drives reasoning through a CLI you already have, so the model is
whatever that CLI accepts. Switch at any time with `/model`.

| Runtime | Auth | Models |
| --- | --- | --- |
| `claude` | your Claude Code CLI | `opus`, `fable`, `sonnet`, `haiku`, aliases that always resolve to the latest of each |
| `codex` | your Codex CLI | read live from the CLI's own catalogue on disk |
| `openai-codex` | ChatGPT device code | read from your account via `marked-auth models` |

Codex models are deliberately not curated in this repository, because a list
written here goes stale on the next release. Choosing "Default" leaves the
model to whatever the CLI is already configured to use.

### OpenAI Codex

`openai-codex` is a first-class runtime. It authenticates through ChatGPT
device code and uses the Codex backend, not the standard OpenAI API-key
endpoint, which stays separate.

```bash
marked-auth login
marked-auth status
marked-auth models
marked-auth logout
```

Credentials live in `~/.marked/auth.json` with user-only permissions. Refresh
tokens are never returned by status commands, included in prompts, written to
telemetry, or sent to the data service.

## State

Everything local lives under `~/.marked/`: `config.json` at mode 0600,
`auth.json`, per-research sessions, `conversation.json` for follow-ups, and
saved reports. A `.marked/config.json` inside a repository takes precedence
over the global one.

## Development

Node.js 20+ and Python 3.11+.

```bash
npm install
npm test          # 960 tests
npm run build     # bundles terminal/dist/app.mjs, commit the result

uv sync
uv run pytest
uv run ruff check .
```

The terminal ships as a built bundle, so a change under `terminal/` is not live
until `npm run build` has run.

## License

GNU Affero General Public License v3.0. See [LICENSE](LICENSE).

If you run a modified version of this harness as a network service, the AGPL
requires you to offer that modified source to its users.
