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

import questionary
from questionary import Choice, Style

from market_data.agent_auth import CODEX_PROVIDER, CodexAuthError, CodexAuthStore

InstallScope = Literal["global", "repo"]
MARKED_MCP_URL = "https://app.marked.run/mcp/"
DEFAULT_MODEL = "gpt-5.6-luna"
TOTAL_STEPS = 4
_TTY_INPUT = None
TUI_STYLE = Style(
    [
        ("qmark", "fg:#00d7af bold"),
        ("question", "bold"),
        ("answer", "fg:#00d7af bold"),
        ("pointer", "fg:#00d7af bold"),
        ("highlighted", "fg:#00d7af bold"),
        ("selected", "fg:#00d7af"),
        ("instruction", "fg:#777777"),
    ]
)


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


def _interactive(input_fn: Callable[[str], str]) -> bool:
    return input_fn is input and sys.stdin.isatty()


def _ask_choice(
    prompt: str,
    options: tuple[str, ...],
    *,
    input_fn: Callable[[str], str],
    output_fn: Callable[[str], None],
    default: int = 1,
) -> int:
    if _interactive(input_fn):
        answer = questionary.select(
            prompt,
            choices=[Choice(option, value=index) for index, option in enumerate(options, 1)],
            default=default,
            pointer="❯",
            qmark="◆",
            instruction="(use arrow keys)",
            style=TUI_STYLE,
        ).ask()
        if answer is None:
            raise KeyboardInterrupt
        return int(answer)
    for index, option in enumerate(options, 1):
        output_fn(f"  {index}. {option}")
    while True:
        answer = input_fn(f"{prompt} [{default}]: ").strip()
        if not answer:
            return default
        if answer.isdigit() and 1 <= int(answer) <= len(options):
            return int(answer)
        output_fn("Choose one of the listed options.")


def _ask_text(
    prompt: str, default: str, *, input_fn: Callable[[str], str]
) -> str:
    if _interactive(input_fn):
        answer = questionary.text(
            prompt, default=default, qmark="◆", style=TUI_STYLE
        ).ask()
        if answer is None:
            raise KeyboardInterrupt
        return answer.strip() or default
    return input_fn(f"{prompt} [{default}]: ").strip() or default


def _ask_secret(prompt: str, *, secret_input: Callable[[str], str]) -> str:
    if secret_input is getpass.getpass and sys.stdin.isatty():
        answer = questionary.password(prompt, qmark="◆", style=TUI_STYLE).ask()
        if answer is None:
            raise KeyboardInterrupt
        return answer.strip()
    return secret_input(f"{prompt} (input is hidden): ").strip()


def _ask_confirm(prompt: str, *, input_fn: Callable[[str], str]) -> bool:
    if _interactive(input_fn):
        answer = questionary.confirm(
            prompt, default=True, qmark="◆", style=TUI_STYLE
        ).ask()
        if answer is None:
            raise KeyboardInterrupt
        return bool(answer)
    return input_fn(f"{prompt} [Y/n]: ").strip().lower() not in {"n", "no"}


def _header(output_fn: Callable[[str], None], *, step: int, title: str) -> None:
    cyan = "\033[38;5;43m" if output_fn is print and sys.stdout.isatty() else ""
    reset = "\033[0m" if cyan else ""
    output_fn(f"{cyan}╭──────────────────────────────────────────────╮{reset}")
    output_fn(f"{cyan}│  MARKED                                      │{reset}")
    output_fn(f"{cyan}│  Step {step} of {TOTAL_STEPS}  ·  {title:<27}│{reset}")
    output_fn(f"{cyan}╰──────────────────────────────────────────────╯{reset}")


def _screen(output_fn: Callable[[str], None], *, step: int, title: str) -> None:
    if output_fn is print and sys.stdout.isatty():
        output_fn("\033[2J\033[H")
    _header(output_fn, step=step, title=title)
    output_fn("")


def _status(label: str, detected: bool) -> str:
    return f"  {'✓' if detected else '○'} {label:<20} {'detected' if detected else 'not found'}"


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
    _screen(output_fn, step=1, title="Install scope")
    if scope is None:
        selected_scope = "global" if _ask_choice(
            "Where should Marked be installed?",
            (
                "Global  · available in every project",
                f"This repository  · {repository_root(cwd)}",
            ),
            input_fn=input_fn,
            output_fn=output_fn,
        ) == 1 else "repo"
    else:
        selected_scope = scope
    if selected_scope not in {"global", "repo"}:
        raise ValueError(f"Unknown install scope: {selected_scope}")

    _screen(output_fn, step=2, title="Connect Marked")
    output_fn("Marked API key  ·  https://app.marked.run/dashboard")
    marked_api_key = _ask_secret("Paste your Marked API key", secret_input=secret_input)

    _screen(output_fn, step=3, title="Choose runtime")
    output_fn("Detected on this computer")
    output_fn(_status("Claude Code", clients.claude_code))
    output_fn(_status("Codex CLI", clients.codex_cli))
    output_fn(
        f"  {'✓' if clients.codex_auth else '○'} {'OpenAI Codex auth':<20} "
        f"{'signed in' if clients.codex_auth else 'not signed in'}"
    )
    output_fn("")
    if provider is None:
        selected_provider = (
            CODEX_PROVIDER
            if _ask_choice(
                "Choose a model provider",
                (
                    "OpenAI  · existing API-key configuration",
                    "OpenAI Codex  · ChatGPT/Codex subscription",
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
        if provider is None and _ask_confirm("Sign in with ChatGPT now?", input_fn=input_fn):
            from market_data.agent_auth import run_login

            run_login(auth_store)
            clients = detect_clients(auth_store=auth_store)
        else:
            output_fn("  ○ Codex sign-in needed  · run `marked-auth login` after setup")

    _screen(output_fn, step=4, title="Choose model")
    discovered = _model_options(selected_provider, clients, auth_store)
    if model is None:
        if discovered:
            model_index = _ask_choice(
                "Choose a model",
                (*discovered, "Enter a model name manually"),
                input_fn=input_fn,
                output_fn=output_fn,
            )
            selected_model = (
                discovered[model_index - 1]
                if model_index <= len(discovered)
                else _ask_text("Model name", DEFAULT_MODEL, input_fn=input_fn)
            )
        else:
            default_model = os.getenv(
                "MARKED_AGENT_MODEL", os.getenv("LUNA_MODEL", DEFAULT_MODEL)
            )
            selected_model = _ask_text("Choose a model", default_model, input_fn=input_fn)
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
    if output_fn is print and sys.stdout.isatty():
        output_fn("\033[2J\033[H")
    output_fn("✓ Marked agent is ready")
    output_fn(f"  Scope     {selected_scope}")
    output_fn(f"  Provider  {selected_provider}")
    output_fn(f"  Model     {selected_model}")
    output_fn(f"  Config    {target}")
    output_fn("")
    output_fn("Restart your agent CLI to load the configuration.")
    return target


def attach_terminal_input() -> None:
    global _TTY_INPUT
    if sys.stdin.isatty() or os.name == "nt":
        return
    try:
        _TTY_INPUT = open("/dev/tty", encoding="utf-8")  # noqa: SIM115
    except OSError:
        return
    if _TTY_INPUT.isatty():
        sys.stdin = _TTY_INPUT


def main(argv: list[str] | None = None) -> int:
    argv = sys.argv[1:] if argv is None else argv
    if argv and argv[0] == "onboard":
        argv = argv[1:]
    parser = argparse.ArgumentParser(prog="marked-onboard")
    parser.add_argument("--scope", choices=("global", "repo"))
    parser.add_argument("--provider", choices=("openai", CODEX_PROVIDER))
    parser.add_argument("--model")
    args = parser.parse_args(argv)
    attach_terminal_input()
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
