# Marked Agent Harness

Local authentication and provider transport for the Marked agent harness.
This repository intentionally does not contain Marked's API server, financial
dataset, schema, retrieval code, or proprietary data.

## Install and onboard

```bash
curl -fsSL https://raw.githubusercontent.com/ujjwalpreenja1308-web/marked-agent-harness/main/install.sh | sh
```

The installer installs `marked`, then runs `marked onboard`. The wizard:

- chooses global (`~/.marked`) or current-repository (`.marked`) scope;
- securely collects the user's Marked API key;
- detects Claude Code, Codex CLI, and local Codex auth;
- discovers Codex models when authenticated; and
- stores local harness configuration with `0600` permissions.

OpenAI Codex subscription login is separate:

```bash
marked-auth login
marked-auth status
marked-auth logout
```

Codex credentials are stored locally in `~/.marked/auth.json` (or
`MARKED_AUTH_FILE`) and are never sent to Marked's data service.
