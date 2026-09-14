"""Local OpenAI Codex subscription authentication for the Marked agent harness.

This store is deliberately separate from Marked's server/API-key and financial
data paths. It contains only the user's local Codex OAuth session.
"""

from __future__ import annotations

import asyncio
import base64
import json
import os
import tempfile
import time
from collections.abc import Callable
from contextlib import contextmanager
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import aiohttp

CODEX_PROVIDER = "openai-codex"
CODEX_ISSUER = "https://auth.openai.com"
CODEX_CLIENT_ID = "app_EMoamEEZ73f0CkXaXp7hrann"
CODEX_TOKEN_URL = f"{CODEX_ISSUER}/oauth/token"
CODEX_BASE_URL = "https://chatgpt.com/backend-api/codex"
CODEX_REFRESH_SKEW_SECONDS = 120
CODEX_AUTH_URL = f"{CODEX_ISSUER}/codex/device"
_REFRESH_LOCK = asyncio.Lock()


class CodexAuthError(RuntimeError):
    """An authentication failure safe to show without upstream response bodies."""

    def __init__(
        self, message: str, *, code: str, relogin_required: bool = False, status: int | None = None
    ) -> None:
        super().__init__(message)
        self.code = code
        self.relogin_required = relogin_required
        self.status = status


def _now_z() -> str:
    return datetime.now(UTC).isoformat().replace("+00:00", "Z")


def _token_claims(token: Any) -> dict[str, Any]:
    if not isinstance(token, str):
        return {}
    try:
        part = token.split(".")[1]
        return json.loads(base64.urlsafe_b64decode(part + "=" * (-len(part) % 4)))
    except (IndexError, ValueError, TypeError, json.JSONDecodeError):
        return {}


def _account_id(token: str) -> str | None:
    auth = _token_claims(token).get("https://api.openai.com/auth")
    value = auth.get("chatgpt_account_id") if isinstance(auth, dict) else None
    return value.strip() if isinstance(value, str) and value.strip() else None


def _expiry(token: str, payload: dict[str, Any] | None = None) -> float | None:
    claims = _token_claims(token)
    if isinstance(claims.get("exp"), (int, float)):
        return float(claims["exp"])
    expires_in = (payload or {}).get("expires_in")
    if isinstance(expires_in, (int, float)):
        return time.time() + float(expires_in)
    return None


def _nonempty(value: Any) -> str:
    return value.strip() if isinstance(value, str) else ""


def redact_secrets(value: Any, secrets: tuple[str, ...] | list[str]) -> Any:
    """Redact token material in log/error strings without changing structured data types."""
    if isinstance(value, str):
        result = value
        for secret in secrets:
            if secret:
                result = result.replace(secret, "[REDACTED]")
        return result
    if isinstance(value, dict):
        return {key: redact_secrets(item, secrets) for key, item in value.items()}
    if isinstance(value, list):
        return [redact_secrets(item, secrets) for item in value]
    if isinstance(value, tuple):
        return tuple(redact_secrets(item, secrets) for item in value)
    return value


def default_auth_path() -> Path:
    return Path(os.getenv("MARKED_AUTH_FILE", "~/.marked/auth.json")).expanduser()


class CodexAuthStore:
    """0600 JSON store with one provider block and atomic writes."""

    def __init__(self, path: str | Path | None = None) -> None:
        self.path = Path(path).expanduser() if path else default_auth_path()
        self.lock_path = self.path.with_name(self.path.name + ".lock")

    @contextmanager
    def _lock(self):
        self.path.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
        with self.lock_path.open("a+", encoding="utf-8") as handle:
            os.chmod(self.lock_path, 0o600)
            try:
                import fcntl

                fcntl.flock(handle.fileno(), fcntl.LOCK_EX)
            except (ImportError, OSError):
                pass
            try:
                yield
            finally:
                try:
                    import fcntl

                    fcntl.flock(handle.fileno(), fcntl.LOCK_UN)
                except (ImportError, OSError):
                    pass

    def _read_unlocked(self) -> dict[str, Any]:
        if not self.path.is_file():
            return {"version": 1, "providers": {}}
        try:
            payload = json.loads(self.path.read_text(encoding="utf-8"))
        except (OSError, ValueError) as error:
            raise CodexAuthError(
                "Marked auth store is unreadable.", code="auth_store_invalid"
            ) from error
        return payload if isinstance(payload, dict) else {"version": 1, "providers": {}}

    def _write_unlocked(self, payload: dict[str, Any]) -> None:
        self.path.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
        fd, temporary = tempfile.mkstemp(prefix=".auth-", dir=self.path.parent)
        try:
            os.fchmod(fd, 0o600)
            with os.fdopen(fd, "w", encoding="utf-8") as handle:
                json.dump(payload, handle, separators=(",", ":"))
                handle.write("\n")
                handle.flush()
                os.fsync(handle.fileno())
            os.replace(temporary, self.path)
        finally:
            if os.path.exists(temporary):
                os.unlink(temporary)

    def load(self) -> dict[str, Any] | None:
        with self._lock():
            providers = self._read_unlocked().get("providers", {})
            state = providers.get(CODEX_PROVIDER) if isinstance(providers, dict) else None
            return dict(state) if isinstance(state, dict) else None

    def save_tokens(self, tokens: dict[str, Any], *, source: str = "device-code") -> dict[str, Any]:
        state = self._state_from_tokens(tokens, source=source)
        with self._lock():
            payload = self._read_unlocked()
            providers = payload.setdefault("providers", {})
            providers[CODEX_PROVIDER] = state
            payload["version"] = 1
            self._write_unlocked(payload)
        return dict(state)

    def _state_from_tokens(self, tokens: dict[str, Any], *, source: str) -> dict[str, Any]:
        access_token = _nonempty(tokens.get("access_token"))
        refresh_token = _nonempty(tokens.get("refresh_token"))
        if not access_token or not refresh_token:
            raise CodexAuthError(
                "Codex login did not return both tokens.", code="token_pair_incomplete"
            )
        return {
            "provider": CODEX_PROVIDER,
            "tokens": {"access_token": access_token, "refresh_token": refresh_token},
            "expires_at": _expiry(access_token, tokens),
            "last_refresh": _now_z(),
            "auth_mode": "chatgpt",
            "source": source,
            "account_id": _account_id(access_token),
        }

    def _save_tokens_unlocked(self, tokens: dict[str, Any], *, source: str) -> dict[str, Any]:
        state = self._state_from_tokens(tokens, source=source)
        payload = self._read_unlocked()
        providers = payload.setdefault("providers", {})
        providers[CODEX_PROVIDER] = state
        payload["version"] = 1
        self._write_unlocked(payload)
        return dict(state)

    def save_refreshed(self, tokens: dict[str, Any], previous: dict[str, Any]) -> dict[str, Any]:
        state = self.save_tokens(tokens, source=previous.get("source", "device-code"))
        if previous.get("account_id") and not state.get("account_id"):
            state["account_id"] = previous["account_id"]
            with self._lock():
                payload = self._read_unlocked()
                current = payload.get("providers", {}).get(CODEX_PROVIDER)
                if isinstance(current, dict):
                    current["account_id"] = state["account_id"]
                    self._write_unlocked(payload)
        return state

    def logout(self) -> bool:
        """Remove local Codex credentials; leave Marked data and API keys untouched."""
        with self._lock():
            payload = self._read_unlocked()
            providers = payload.get("providers")
            removed = (
                isinstance(providers, dict) and providers.pop(CODEX_PROVIDER, None) is not None
            )
            if removed:
                self._write_unlocked(payload)
            return bool(removed)

    def status(self) -> dict[str, Any]:
        state = self.load()
        if not state:
            return {"provider": CODEX_PROVIDER, "logged_in": False}
        tokens = state.get("tokens")
        return {
            "provider": CODEX_PROVIDER,
            "logged_in": bool(tokens.get("access_token")) if isinstance(tokens, dict) else False,
            "account_id": state.get("account_id"),
            "expires_at": state.get("expires_at"),
            "last_refresh": state.get("last_refresh"),
            "auth_file": str(self.path),
        }


async def _json_response(
    response: aiohttp.ClientResponse, *, expected: int = 200
) -> dict[str, Any]:
    if response.status != expected:
        error_code = "auth_request_failed"
        try:
            body = await response.json()
            candidate = body.get("error") if isinstance(body, dict) else None
            if isinstance(candidate, dict):
                candidate = candidate.get("code") or candidate.get("type")
            if isinstance(candidate, str) and candidate.strip():
                error_code = candidate.strip()
        except (aiohttp.ContentTypeError, ValueError):
            pass
        if response.status == 429:
            error_code = "rate_limited"
        relogin = response.status in {401, 403} or error_code in {
            "invalid_grant",
            "invalid_token",
            "refresh_token_reused",
        }
        raise CodexAuthError(
            f"Codex authentication request failed (HTTP {response.status}).",
            code=error_code,
            relogin_required=relogin,
            status=response.status,
        )
    try:
        payload = await response.json()
    except (aiohttp.ContentTypeError, ValueError) as error:
        raise CodexAuthError(
            "Codex authentication returned invalid JSON.", code="invalid_json"
        ) from error
    if not isinstance(payload, dict):
        raise CodexAuthError(
            "Codex authentication returned an invalid response.", code="invalid_response"
        )
    return payload


async def _post_json(session: aiohttp.ClientSession, url: str, **kwargs: Any) -> dict[str, Any]:
    try:
        async with session.post(url, **kwargs) as response:
            return await _json_response(response)
    except CodexAuthError:
        raise
    except (TimeoutError, aiohttp.ClientError) as error:
        raise CodexAuthError(
            "Codex authentication request could not be completed.", code="network_error"
        ) from error


async def device_login(
    *,
    sleep: Callable[[float], Any] = asyncio.sleep,
    max_wait: float = 900,
    session_factory: Callable[..., Any] = aiohttp.ClientSession,
) -> dict[str, Any]:
    """Run Hermes-compatible OpenAI device auth and return credentials, without persisting them."""
    timeout = aiohttp.ClientTimeout(total=20)
    try:
        async with session_factory(timeout=timeout) as session:
            for attempt in range(4):
                try:
                    device = await _post_json(
                        session,
                        f"{CODEX_ISSUER}/api/accounts/deviceauth/usercode",
                        json={"client_id": CODEX_CLIENT_ID},
                        headers={"Content-Type": "application/json"},
                    )
                    break
                except CodexAuthError as error:
                    if error.status != 429 or attempt == 3:
                        raise
                    await sleep(min(2 ** (attempt + 1), 60))
            user_code = _nonempty(device.get("user_code"))
            device_auth_id = _nonempty(device.get("device_auth_id"))
            if not user_code or not device_auth_id:
                raise CodexAuthError(
                    "Device code response was incomplete.", code="device_code_incomplete"
                )
            interval = max(3, int(device.get("interval", 5)))
            print(
                "OpenAI Codex\nUse your ChatGPT/Codex subscription\n\nSign in with ChatGPT",
                flush=True,
            )
            print(f"\nOpen this URL: {CODEX_AUTH_URL}\nYour code: {user_code}", flush=True)
            print("Waiting for sign-in... (press Ctrl+C to cancel)", flush=True)
            started = time.monotonic()
            code_response = None
            while time.monotonic() - started < max_wait:
                await sleep(interval)
                try:
                    async with session.post(
                        f"{CODEX_ISSUER}/api/accounts/deviceauth/token",
                        json={"device_auth_id": device_auth_id, "user_code": user_code},
                        headers={"Content-Type": "application/json"},
                    ) as response:
                        if response.status in {403, 404}:
                            continue
                        code_response = await _json_response(response)
                        break
                except CodexAuthError:
                    raise
                except (TimeoutError, aiohttp.ClientError) as error:
                    raise CodexAuthError(
                        "Codex device polling failed.", code="device_poll_failed"
                    ) from error
            if code_response is None:
                raise CodexAuthError("Codex device login timed out.", code="device_code_timeout")
            authorization_code = _nonempty(code_response.get("authorization_code"))
            code_verifier = _nonempty(code_response.get("code_verifier"))
            if not authorization_code or not code_verifier:
                raise CodexAuthError(
                    "Device auth response was incomplete.", code="exchange_incomplete"
                )
            tokens = await _post_json(
                session,
                CODEX_TOKEN_URL,
                data={
                    "grant_type": "authorization_code",
                    "code": authorization_code,
                    "redirect_uri": f"{CODEX_ISSUER}/deviceauth/callback",
                    "client_id": CODEX_CLIENT_ID,
                    "code_verifier": code_verifier,
                },
                headers={"Content-Type": "application/x-www-form-urlencoded"},
            )
    except KeyboardInterrupt as error:
        raise CodexAuthError("Codex login cancelled.", code="cancelled") from error
    if not _nonempty(tokens.get("access_token")) or not _nonempty(tokens.get("refresh_token")):
        raise CodexAuthError(
            "Token exchange did not return both tokens.", code="token_pair_incomplete"
        )
    return {
        "tokens": tokens,
        "base_url": CODEX_BASE_URL,
        "last_refresh": _now_z(),
        "auth_mode": "chatgpt",
    }


async def refresh_access_token(
    refresh_token: str,
    *,
    session_factory: Callable[..., Any] = aiohttp.ClientSession,
) -> dict[str, Any]:
    if not _nonempty(refresh_token):
        raise CodexAuthError(
            "Codex refresh token is missing.", code="refresh_token_missing", relogin_required=True
        )
    async with session_factory(timeout=aiohttp.ClientTimeout(total=20)) as session:
        payload = await _post_json(
            session,
            CODEX_TOKEN_URL,
            data={
                "grant_type": "refresh_token",
                "refresh_token": refresh_token,
                "client_id": CODEX_CLIENT_ID,
            },
            headers={
                "Content-Type": "application/x-www-form-urlencoded",
                "Accept": "application/json",
            },
        )
    access_token = _nonempty(payload.get("access_token"))
    if not access_token:
        raise CodexAuthError(
            "Codex refresh response was missing an access token.",
            code="refresh_incomplete",
            relogin_required=True,
        )
    return {
        "access_token": access_token,
        "refresh_token": _nonempty(payload.get("refresh_token")) or refresh_token,
        "expires_in": payload.get("expires_in"),
    }


async def resolve_runtime_credentials(
    store: CodexAuthStore | None = None,
    *,
    force_refresh: bool = False,
    refresh_skew_seconds: int = CODEX_REFRESH_SKEW_SECONDS,
) -> dict[str, Any]:
    """Return runtime-safe credentials; refresh tokens never leave this function."""
    store = store or CodexAuthStore()
    state = store.load()
    if not state or not isinstance(state.get("tokens"), dict):
        raise CodexAuthError(
            "No OpenAI Codex credentials are stored. Run `marked-auth login`.",
            code="auth_missing",
            relogin_required=True,
        )
    tokens = state["tokens"]
    access_token = _nonempty(tokens.get("access_token"))
    refresh_token = _nonempty(tokens.get("refresh_token"))
    async with _REFRESH_LOCK:
        if force_refresh or _needs_refresh(state, access_token, refresh_skew_seconds):
            try:
                # Keep the cross-process lock through the single-use refresh request. A second
                # Marked process therefore rereads the rotated pair instead of replaying it.
                with store._lock():
                    latest = store._read_unlocked().get("providers", {})
                    latest = latest.get(CODEX_PROVIDER) if isinstance(latest, dict) else None
                    latest = latest if isinstance(latest, dict) else state
                    latest_tokens = (
                        latest.get("tokens") if isinstance(latest.get("tokens"), dict) else {}
                    )
                    latest_access = _nonempty(latest_tokens.get("access_token"))
                    if (
                        not force_refresh
                        and latest_access
                        and not _needs_refresh(latest, latest_access, refresh_skew_seconds)
                    ):
                        state = latest
                    else:
                        refreshed = await refresh_access_token(
                            _nonempty(latest_tokens.get("refresh_token")) or refresh_token
                        )
                        state = store._save_tokens_unlocked(
                            refreshed, source=latest.get("source", "device-code")
                        )
            except CodexAuthError as error:
                if error.relogin_required:
                    store.logout()
                raise
        tokens = state["tokens"]
        access_token = _nonempty(tokens.get("access_token"))
    expires_at = state.get("expires_at")
    token_expiry = _expiry(access_token)
    if token_expiry is not None:
        expires_at = token_expiry
    if not access_token:
        store.logout()
        raise CodexAuthError(
            "Stored OpenAI Codex credentials are invalid. Run `marked-auth login`.",
            code="auth_invalid",
            relogin_required=True,
        )
    return {
        "provider": CODEX_PROVIDER,
        "base_url": os.getenv("MARKED_CODEX_BASE_URL", CODEX_BASE_URL).rstrip("/"),
        "api_key": access_token,
        "account_id": state.get("account_id") or _account_id(access_token),
        "expires_at": expires_at,
        "last_refresh": state.get("last_refresh"),
        "auth_mode": "chatgpt",
    }


async def resolve_codex_runtime_credentials(
    store: CodexAuthStore | None = None, **kwargs: Any
) -> dict[str, Any]:
    """Named adapter equivalent of Hermes' Codex runtime resolver."""
    return await resolve_runtime_credentials(store, **kwargs)


def get_codex_auth_status(store: CodexAuthStore | None = None) -> dict[str, Any]:
    return (store or CodexAuthStore()).status()


def _needs_refresh(state: dict[str, Any], access_token: str, skew_seconds: int) -> bool:
    expires_at = _expiry(access_token)
    if expires_at is None:
        expires_at = state.get("expires_at")
    return isinstance(expires_at, (int, float)) and expires_at <= time.time() + skew_seconds


async def login_codex(store: CodexAuthStore | None = None) -> dict[str, Any]:
    store = store or CodexAuthStore()
    credentials = await device_login()
    store.save_tokens(credentials["tokens"])
    return store.status()


def run_login(store: CodexAuthStore | None = None) -> dict[str, Any]:
    return asyncio.run(login_codex(store))


def main() -> None:
    import argparse

    parser = argparse.ArgumentParser(prog="marked-auth")
    parser.add_argument("command", nargs="?", choices=("login", "logout", "status", "models"))
    args = parser.parse_args()
    store = CodexAuthStore()
    if args.command is None:
        print("OpenAI Codex\nUse your ChatGPT/Codex subscription\n\nSign in with ChatGPT")
        print("\nCommands: marked-auth login | status | logout | models")
        return
    if args.command == "login":
        run_login(store)
    elif args.command == "logout":
        print(
            "Signed out of OpenAI Codex."
            if store.logout()
            else "OpenAI Codex is already signed out."
        )
    elif args.command == "status":
        print(json.dumps(store.status(), indent=2))
    else:
        from market_data.agent_providers import discover_codex_models

        print("\n".join(asyncio.run(discover_codex_models(store=store))))
