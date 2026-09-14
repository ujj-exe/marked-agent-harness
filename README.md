# Marked Agent Harness

A full-screen terminal for India-first financial research.

```bash
curl -fsSL https://marked.run/install | sh
```

## Why this exists

Ask a language model what Reliance earned last financial year and it will
answer. That is the problem. The number comes from training data of unknown
vintage, on an unstated accounting basis, for a fiscal year the model has
guessed at — and it arrives with the same confidence as a number that was
actually looked up.

Marked inverts the order. A question that names a financial measure is a
retrieval job, not a search job: the runtime parses entity, metric, fiscal
years, period and basis out of the question, maps the words people actually use
(PAT, net profit, earnings, operating profit) onto canonical concept
identifiers, and executes one explicit retrieval per requested period. Every
row must carry value, concept, period, basis, unit and company identity before
it can become a fact with its own evidence ID.

When the facts are not there, Marked renders DATA GAP and never starts a
reasoning provider at all. A model that cannot see the number does not get to
write about it.

The reasoning provider is subordinate. It receives a prefetched research packet
with provenance — never the Marked API key, never the TUI protocol, never a
network path of its own. Marked owns its stdin, stdout, timeout, cancellation
and workspace, and validates the JSON that comes back.

Indian fiscal language is handled where it belongs, before retrieval: "last
financial year" resolves to the latest completed April–March year, not to
whatever the model assumes a year is.

## What is in this repository

The local harness: terminal UI, configuration, research orchestration, the
retrieval planner, evidence validation and provider lifecycle.

Marked's financial dataset and the hosted data service behind
`api.marked.run` are not in this repository. Running the harness requires a
Marked API key.

## Setup

Installation opens the terminal and walks four steps in the same full-screen
UI:

1. Global or per-repository configuration.
2. Your Marked API key, entered hidden and checked against the API.
3. Claude Code CLI, Codex CLI, or an OpenAI Codex subscription.
4. A model.

Re-run it any time with `marked-onboard`. Open the terminal with `marked`.

## The team

Each command is a seat with its own remit. Type them in the terminal, or pass
one on the command line.

| Command | Takes | Does |
| --- | --- | --- |
| `/analyst` | `<company>` | filings, fundamentals, or any research question |
| `/compare` | `<a> and <b>` | 2–5 names separated by and / vs / comma |
| `/macro` | — | RBI, inflation, growth — the regime behind the trade |
| `/sector` | `<sector>` | rotations, thematics, and the names moving money |
| `/desk` | `<company>` | market pulse · 3 seconds · everything that matters |
| `/risk` | `<company>` | event impact · catalyst timing · what could go wrong |
| `/options` | `<symbol>` | chains, OI skew, positioning |
| `/futures` | `<symbol>` | commodities, rates futures — the cross-asset tape |
| `/watch` | `<companies>` | what moved · conviction logged |

Plain questions work too — the commands are shortcuts, not a required syntax.

Inside the terminal: `/model` switches the reasoning runtime, `/marked <key>`
saves a new API key, `/new` starts a fresh conversation, `/history` shows recent
turns. Press `n` to ask, `?` for the full keyboard reference, `s` and `l` to
save and load reports, `1`–`9` to run a suggested follow-up, `q` to step back.

`marked --help` prints all of it.

## Models

Marked drives reasoning through a CLI you already have, so the model is
whatever that CLI accepts. Switch at any time with `/model`.

| Runtime | Auth | Models |
| --- | --- | --- |
| `claude` | your Claude Code CLI | `opus`, `fable`, `sonnet`, `haiku` — aliases that always resolve to the latest of each |
| `codex` | your Codex CLI | read live from the CLI's own catalogue on disk |
| `openai-codex` | ChatGPT device code | read from your account via `marked-auth models` |

Codex models are not curated here; a list written into this repository goes
stale on the next release. Choosing "Default" leaves the model to whatever the
CLI is already configured to use.

### OpenAI Codex

`openai-codex` is a first-class runtime. It authenticates through ChatGPT
device code and uses the Codex backend — not the standard OpenAI API-key
endpoint, which remains separate.

```bash
marked-auth login
marked-auth status
marked-auth models
marked-auth logout
```

Credentials live in `~/.marked/auth.json` with user-only permissions. Refresh
tokens are never returned by status commands, included in prompts, written to
telemetry, or sent to Marked's data service.

## State

Everything local lives under `~/.marked/`: `config.json` (0600), `auth.json`,
per-research sessions, `conversation.json` for follow-ups, and saved reports.
A `.marked/config.json` in a repository takes precedence over the global one.

## Development

Node.js 20+ and Python 3.11+.

```bash
npm install
npm test          # 960 tests
npm run build     # bundles terminal/dist/app.mjs — commit the result

uv sync
uv run pytest
uv run ruff check .
```

The terminal ships as a built bundle, so a change under `terminal/` is not live
until `npm run build` has run.

## License

GNU Affero General Public License v3.0 — see [LICENSE](LICENSE).

If you run a modified version of this harness as a network service, the AGPL
requires you to offer that modified source to its users.
