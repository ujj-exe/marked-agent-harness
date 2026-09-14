# Marked Agent Harness

Local authentication and provider transport for the Marked agent harness.
This repository intentionally does not contain Marked's API server, financial
dataset, schema, retrieval code, or proprietary data.

## Install and onboard

```bash
curl -fsSL https://raw.githubusercontent.com/ujjwalpreenja1308-web/marked-agent-harness/main/install.sh | sh
```

The installer installs and opens the full `marked` terminal. On first run, a
four-step terminal wizard:

- chooses global (`~/.marked`) or current-repository (`.marked`) scope;
- securely collects the user's Marked API key;
- detects Claude Code, Codex CLI, and local Codex auth;
- discovers Codex models when authenticated; and
- stores local harness configuration with `0600` permissions.

After setup, `marked` stays open as an interactive agent with a persistent
header, chat prompt, model status, Marked MCP tool execution, and slash
commands. Run it again at any time with:

```bash
marked
```

Available commands include `/status`, `/setup`, `/login`, `/logout`, `/clear`,
and `/exit`.

OpenAI Codex subscription login is separate:

```bash
marked-auth login
marked-auth status
marked-auth logout
```

Codex credentials are stored locally in `~/.marked/auth.json` (or
`MARKED_AUTH_FILE`) and are never sent to Marked's data service.
