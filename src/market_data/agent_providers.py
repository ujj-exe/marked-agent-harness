"""Provider registry and wire adapters for the Marked agent harness."""

from __future__ import annotations

import base64
import json
import os
from collections.abc import AsyncIterator
from dataclasses import dataclass
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

import aiohttp

from market_data.agent_auth import (
    CODEX_BASE_URL,
    CODEX_PROVIDER,
    CodexAuthError,
    CodexAuthStore,
)
from market_data.agent_auth import (
    resolve_runtime_credentials as resolve_codex_runtime_credentials,
)


@dataclass(frozen=True, slots=True)
class AgentProvider:
    id: str
    name: str
    description: str
    auth: str


AGENT_PROVIDERS = {
    "openai": AgentProvider("openai", "OpenAI", "Use an OpenAI API key", "api_key"),
    CODEX_PROVIDER: AgentProvider(
        CODEX_PROVIDER, "OpenAI Codex", "Use your ChatGPT/Codex subscription", "device_code"
    ),
}


@dataclass(frozen=True, slots=True)
class RuntimeCredentials:
    provider: str
    base_url: str
    api_key: str
    headers: dict[str, str]
    expires_at: float | None = None
    last_refresh: str | None = None


def _official_codex_url(base_url: str) -> bool:
    try:
        parsed = urlparse(base_url)
        path = parsed.path.rstrip("/")
        return (
            parsed.scheme == "https"
            and parsed.hostname == "chatgpt.com"
            and parsed.port in (None, 443)
            and (path == "/backend-api/codex" or path.startswith("/backend-api/codex/"))
        )
    except (TypeError, ValueError):
        return False


def codex_headers(access_token: str, *, base_url: str = CODEX_BASE_URL) -> dict[str, str]:
    """Codex identity headers plus the account claim required by the backend."""
    headers = (
        {"User-Agent": "MarkedAgent/0.1.0", "originator": "marked-agent"}
        if _official_codex_url(base_url)
        else {"User-Agent": "codex_cli_rs/0.0.0 (Marked Agent)", "originator": "codex_cli_rs"}
    )
    try:
        payload = access_token.split(".")[1]
        claims = json.loads(base64.urlsafe_b64decode(payload + "=" * (-len(payload) % 4)))
        account = claims.get("https://api.openai.com/auth", {}).get("chatgpt_account_id")
        if isinstance(account, str) and account.strip():
            headers["ChatGPT-Account-ID"] = account.strip()
    except (IndexError, ValueError, TypeError, json.JSONDecodeError):
        pass
    return headers


def _configured_agent_settings() -> dict[str, str]:
    candidates = []
    configured = os.getenv("MARKED_AGENT_CONFIG")
    if configured:
        candidates.append(Path(configured).expanduser())
    cwd = Path.cwd()
    candidates.extend(parent / ".marked" / "agent.json" for parent in (cwd, *cwd.parents))
    candidates.append(Path.home() / ".marked" / "agent.json")
    for path in candidates:
        try:
            payload = json.loads(path.read_text(encoding="utf-8"))
            settings = payload.get("agent") if isinstance(payload, dict) else None
            if isinstance(settings, dict):
                return {
                    key: value
                    for key, value in settings.items()
                    if key in {"provider", "model"} and isinstance(value, str)
                }
        except (OSError, ValueError):
            continue
    return {}


def configured_model() -> str | None:
    model = _configured_agent_settings().get("model", "").strip()
    return model or None


def provider_id(value: str | None = None) -> str:
    selected = value or os.getenv("MARKED_AGENT_PROVIDER") or _configured_agent_settings().get(
        "provider", "openai"
    )
    selected = selected.strip().lower()
    if selected not in AGENT_PROVIDERS:
        raise ValueError(f"Unknown agent provider: {selected}")
    return selected


async def resolve_runtime_credentials(
    selected: str | None = None,
    *,
    store: CodexAuthStore | None = None,
) -> RuntimeCredentials | None:
    selected = provider_id(selected)
    if selected == "openai":
        key = os.getenv("OPENAI_API_KEY", "").strip()
        return (
            RuntimeCredentials(
                "openai",
                "https://api.openai.com/v1",
                key,
                {},
            )
            if key
            else None
        )
    creds = await resolve_codex_runtime_credentials(store)
    return RuntimeCredentials(
        CODEX_PROVIDER,
        creds["base_url"],
        creds["api_key"],
        codex_headers(creds["api_key"], base_url=creds["base_url"]),
        creds.get("expires_at"),
        creds.get("last_refresh"),
    )


def _responses_url(credentials: RuntimeCredentials) -> str:
    return f"{credentials.base_url}/responses"


async def responses_json(
    payload: dict[str, Any],
    *,
    selected: str | None = None,
    store: CodexAuthStore | None = None,
    timeout: float = 90,
) -> dict[str, Any] | None:
    credentials = await resolve_runtime_credentials(selected, store=store)
    if credentials is None:
        return None
    headers = dict(credentials.headers)
    headers["Authorization"] = f"Bearer {credentials.api_key}"
    try:
        async with aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=timeout)) as session:
            async with session.post(
                _responses_url(credentials), headers=headers, json=payload
            ) as response:
                if response.status >= 400:
                    if credentials.provider == CODEX_PROVIDER and response.status in {401, 403}:
                        (store or CodexAuthStore()).logout()
                    raise CodexAuthError(
                        f"{credentials.provider} request failed (HTTP {response.status}).",
                        code="provider_request_failed",
                        relogin_required=response.status in {401, 403},
                    )
                result = await response.json()
                return result if isinstance(result, dict) else None
    except CodexAuthError:
        raise
    except (TimeoutError, aiohttp.ClientError) as error:
        raise RuntimeError(f"{credentials.provider} request could not be completed.") from error


async def responses_stream(
    payload: dict[str, Any],
    *,
    selected: str | None = None,
    store: CodexAuthStore | None = None,
    timeout: float = 120,
) -> AsyncIterator[tuple[str, Any]]:
    credentials = await resolve_runtime_credentials(selected, store=store)
    if credentials is None:
        return
    headers = dict(credentials.headers)
    headers["Authorization"] = f"Bearer {credentials.api_key}"
    async with aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=timeout)) as session:
        async with session.post(
            _responses_url(credentials), headers=headers, json={**payload, "stream": True}
        ) as response:
            if response.status >= 400:
                if credentials.provider == CODEX_PROVIDER and response.status in {401, 403}:
                    (store or CodexAuthStore()).logout()
                raise CodexAuthError(
                    f"{credentials.provider} request failed (HTTP {response.status}).",
                    code="provider_request_failed",
                    relogin_required=response.status in {401, 403},
                )
            async for raw in response.content:
                line = raw.decode("utf-8", "replace").strip()
                if not line.startswith("data:"):
                    continue
                body = line[5:].strip()
                if not body or body == "[DONE]":
                    continue
                try:
                    chunk = json.loads(body)
                except json.JSONDecodeError:
                    continue
                if chunk.get("type") == "response.output_text.delta" and chunk.get("delta"):
                    yield "delta", chunk["delta"]
                elif chunk.get("type") == "response.completed":
                    yield "usage", (chunk.get("response") or {}).get("usage") or {}


async def discover_codex_models(*, store: CodexAuthStore | None = None) -> list[str]:
    credentials = await resolve_runtime_credentials(CODEX_PROVIDER, store=store)
    assert credentials is not None
    headers = {**credentials.headers, "Authorization": f"Bearer {credentials.api_key}"}
    try:
        async with aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=15)) as session:
            async with session.get(
                f"{credentials.base_url}/models?client_version=0.0.0", headers=headers
            ) as response:
                if response.status != 200:
                    return []
                payload = await response.json()
    except (TimeoutError, aiohttp.ClientError, ValueError):
        return []
    entries = payload.get("models", []) if isinstance(payload, dict) else []
    return [
        item["slug"].strip()
        for item in entries
        if isinstance(item, dict) and isinstance(item.get("slug"), str) and item["slug"].strip()
    ]
