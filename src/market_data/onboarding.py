"""Interactive first-run setup for the local Marked agent harness."""

from __future__ import annotations

import argparse
import asyncio
import getpass
import json
import os
import shutil
import sys
import tempfile
from collections.abc import Callable
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Literal

from market_data.agent_auth import CODEX_PROVIDER, CodexAuthError, CodexAuthStore

InstallScope = Literal["global", "repo"]
MARKED_MCP_URL = "https://app.marked.run/mcp/"
DEFAULT_MODEL = "gpt-5.6-luna"


@dataclass(frozen=True, slots=True)
class ClientDetection:
    claude_code: bool
    codex_cli: bool
    codex_auth: bool


def detect_clients(
    *,
    which: Callable[[str], str | None] = shutil.which,
    auth_store: CodexAuthStore | None = None,
) -> ClientDetection:
    """Detect local clients without reading or returning credential material."""
    try:
        codex_auth = bool((auth_store or CodexAuthStore()).status().get("logged_in"))
    except CodexAuthError:
        codex_auth = False
    return ClientDetection(
        claude_code=which("claude") is not None,
        codex_cli=which("codex") is not None,
        codex_auth=codex_auth,
    )


def repository_root(start: str | Path | None = None) -> Path:
    path = Path(start or Path.cwd()).expanduser().resolve()
    for candidate in (path, *path.parents):
        if (candidate / ".git").exists():
            return candidate
    return path


def config_path(
    scope: InstallScope, *, cwd: str | Path | None = None, home: str | Path | None = None
) -> Path:
    if scope == "global":
        return Path(home or Path.home()).expanduser() / ".marked" / "agent.json"
    return repository_root(cwd) / ".marked" / "agent.json"


def write_config(path: str | Path, *, marked_api_key: str, provider: str, model: str,
                 clients: ClientDetection) -> Path:
    """Persist onboarding state atomically; the API key is never included in the return value."""
    if not marked_api_key or any(char in marked_api_key for char in "\r\n"):
        raise ValueError("A valid Marked API key is required.")
    if provider not in {"openai", CODEX_PROVIDER}:
        raise ValueError(f"Unknown agent provider: {provider}")
    if not model or any(char in model for char in "\r\n"):
        raise ValueError("A model is required.")

    target = Path(path).expanduser()
    target.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
    payload = {
        "version": 1,
        "marked": {"mcp_url": MARKED_MCP_URL, "api_key": marked_api_key},
        "agent": {"provider": provider, "model": model},
        "detected_clients": asdict(clients),
    }
    fd, temporary = tempfile.mkstemp(prefix=".agent-", dir=target.parent)
    try:
        os.fchmod(fd, 0o600)
        with os.fdopen(fd, "w", encoding="utf-8") as handle:
            json.dump(payload, handle, indent=2)
            handle.write("\n")
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temporary, target)
        os.chmod(target, 0o600)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)
    return target


def _ask_choice(prompt: str, options: tuple[str, ...], *, input_fn: Callable[[str], str],
                output_fn: Callable[[str], None], default: int = 1) -> int:
    for index, option in enumerate(options, 1):
        output_fn(f"  {index}. {option}")
    while True:
        answer = input_fn(f"{prompt} [{default}]: ").strip()
        if not answer:
            return default
        if answer.isdigit() and 1 <= int(answer) <= len(options):
            return int(answer)
        output_fn("Choose one of the listed options.")


def _model_options(provider: str, clients: ClientDetection,
                   auth_store: CodexAuthStore | None) -> list[str]:
    if provider != CODEX_PROVIDER or not clients.codex_auth:
        return []
    try:
        from market_data.agent_providers import discover_codex_models

        return sorted(set(asyncio.run(discover_codex_models(store=auth_store))))
    except (CodexAuthError, OSError, RuntimeError):
        return []


def run_onboarding(
    *,
    scope: InstallScope | None = None,
    provider: str | None = None,
    model: str | None = None,
    cwd: str | Path | None = None,
    home: str | Path | None = None,
    input_fn: Callable[[str], str] = input,
    secret_input: Callable[[str], str] = getpass.getpass,
    output_fn: Callable[[str], None] = print,
    auth_store: CodexAuthStore | None = None,
) -> Path:
    clients = detect_clients(auth_store=auth_store)
    output_fn("Marked agent setup")
    output_fn(f"Claude Code: {'detected' if clients.claude_code else 'not found'}")
    output_fn(f"Codex CLI: {'detected' if clients.codex_cli else 'not found'}")
    output_fn(f"OpenAI Codex auth: {'signed in' if clients.codex_auth else 'not signed in'}")

    if scope is None:
        selected_scope = "global" if _ask_choice(
            "Where should Marked be installed?",
            ("Global (~/.marked)", "This repository (.marked)"),
            input_fn=input_fn,
            output_fn=output_fn,
        ) == 1 else "repo"
    else:
        selected_scope = scope
    if selected_scope not in {"global", "repo"}:
        raise ValueError(f"Unknown install scope: {selected_scope}")

    output_fn("Get your key at https://app.marked.run/dashboard")
    marked_api_key = secret_input("Paste your Marked API key (input is hidden): ").strip()

    if provider is None:
        selected_provider = (
            CODEX_PROVIDER
            if _ask_choice(
                "Which model provider should the harness use?",
                (
                    "OpenAI — use the existing API-key configuration",
                    "OpenAI Codex — use your ChatGPT/Codex subscription",
                ),
                input_fn=input_fn,
                output_fn=output_fn,
                default=2 if clients.codex_auth else 1,
            ) == 2
            else "openai"
        )
    else:
        selected_provider = provider

    if selected_provider == CODEX_PROVIDER and not clients.codex_auth:
        output_fn("Codex auth is not configured. Run `marked-auth login` after setup.")

    discovered = _model_options(selected_provider, clients, auth_store)
    if model is None:
        if discovered:
            output_fn("Available Codex models:")
            model_index = _ask_choice(
                "Choose a model", tuple(discovered), input_fn=input_fn, output_fn=output_fn
            )
            selected_model = discovered[model_index - 1]
        else:
            default_model = os.getenv(
                "MARKED_AGENT_MODEL", os.getenv("LUNA_MODEL", DEFAULT_MODEL)
            )
            selected_model = input_fn(
                f"Model [{default_model}]: "
            ).strip() or default_model
    else:
        selected_model = model

    target = config_path(selected_scope, cwd=cwd, home=home)
    write_config(
        target,
        marked_api_key=marked_api_key,
        provider=selected_provider,
        model=selected_model,
        clients=clients,
    )
    output_fn(f"Saved Marked agent configuration to {target}")
    output_fn(f"Provider: {selected_provider}; model: {selected_model}")
    output_fn("Restart the detected agent CLI to load the setup.")
    return target


def main(argv: list[str] | None = None) -> int:
    argv = sys.argv[1:] if argv is None else argv
    if argv and argv[0] == "onboard":
        argv = argv[1:]
    parser = argparse.ArgumentParser(prog="marked-onboard")
    parser.add_argument("--scope", choices=("global", "repo"))
    parser.add_argument("--provider", choices=("openai", CODEX_PROVIDER))
    parser.add_argument("--model")
    args = parser.parse_args(argv)
    try:
        run_onboarding(scope=args.scope, provider=args.provider, model=args.model)
    except (KeyboardInterrupt, EOFError):
        print("Setup cancelled.")
        return 1
    except (CodexAuthError, ValueError) as error:
        print(f"Setup failed: {error}")
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
