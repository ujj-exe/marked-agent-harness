# Marked Agent Harness

Marked is a full-screen terminal for India-first financial research. It owns
the terminal UI, local configuration, research orchestration, evidence
validation, and model-provider lifecycle.

This public repository contains only the local harness. Marked's proprietary
financial dataset and hosted data service are not included.

## Install

```bash
curl -fsSL https://raw.githubusercontent.com/ujjwalpreenja1308-web/marked-agent-harness/main/install.sh | sh
```

Installation opens the native Marked terminal and runs four steps using the
same full-screen UI:

1. Choose global or repository configuration.
2. Paste a Marked API key into a masked field.
3. Choose Claude Code CLI, Codex CLI, or OpenAI Codex subscription auth.
4. Choose a model.

Run onboarding again with `marked-onboard`, or open the terminal with `marked`.

## OpenAI Codex

OpenAI Codex is a first-class provider named `openai-codex`. It authenticates
through ChatGPT device code and uses the Codex backend—not the standard OpenAI
API-key endpoint.

```bash
marked-auth login
marked-auth status
marked-auth models
marked-auth logout
```

Codex credentials are stored locally in `~/.marked/auth.json` with user-only
permissions. Refresh tokens are never returned by status commands, included in
prompts, written to telemetry, or sent to Marked's data service.

Standard `openai` API-key behavior remains separate from `openai-codex`.

## Development

Requires Node.js 20+ and Python 3.11+.

```bash
npm install
npm test
npm run build

uv sync
uv run pytest
uv run ruff check .
```

## License

MIT
