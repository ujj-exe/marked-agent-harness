import base64
import json
from pathlib import Path

import pytest

from market_data.agent_auth import (
    CODEX_BASE_URL,
    CODEX_CLIENT_ID,
    CODEX_ISSUER,
    CODEX_TOKEN_URL,
    CodexAuthError,
    CodexAuthStore,
    device_login,
    redact_secrets,
    resolve_runtime_credentials,
)
from market_data.agent_providers import AGENT_PROVIDERS, codex_headers, discover_codex_models
from market_data.agent_providers import resolve_runtime_credentials as resolve_provider


def token(*, exp: int = 2_000_000_000, account: str = "acct-123") -> str:
    payload = {"exp": exp, "https://api.openai.com/auth": {"chatgpt_account_id": account}}
    encoded = base64.urlsafe_b64encode(json.dumps(payload).encode()).decode().rstrip("=")
    return f"header.{encoded}.signature"


class Response:
    def __init__(self, status, payload):
        self.status = status
        self._payload = payload

    async def __aenter__(self):
        return self

    async def __aexit__(self, *args):
        return None

    async def json(self):
        return self._payload


class Session:
    def __init__(self, responses):
        self.responses = iter(responses)
        self.calls = []

    async def __aenter__(self):
        return self

    async def __aexit__(self, *args):
        return None

    def post(self, url, **kwargs):
        self.calls.append((url, kwargs))
        return next(self.responses)

    def get(self, url, **kwargs):
        self.calls.append((url, kwargs))
        return next(self.responses)


def factory(session):
    return lambda **kwargs: session


@pytest.mark.asyncio
async def test_device_login_requests_code_polls_and_exchanges_tokens(capsys):
    access, refresh = token(), "refresh-secret"
    session = Session(
        [
            Response(200, {"user_code": "ABCD-EFGH", "device_auth_id": "device-1", "interval": 1}),
            Response(404, {}),
            Response(200, {"authorization_code": "auth-code", "code_verifier": "verifier"}),
            Response(200, {"access_token": access, "refresh_token": refresh, "expires_in": 3600}),
        ]
    )
    credentials = await device_login(session_factory=factory(session), sleep=lambda _: _no_sleep())
    assert credentials["tokens"]["access_token"] == access
    assert session.calls[0][0] == f"{CODEX_ISSUER}/api/accounts/deviceauth/usercode"
    assert session.calls[0][1]["json"] == {"client_id": CODEX_CLIENT_ID}
    assert session.calls[1][0].endswith("/api/accounts/deviceauth/token")
    assert session.calls[3][0] == CODEX_TOKEN_URL
    assert "refresh-secret" not in capsys.readouterr().out


async def _no_sleep():
    return None


def test_credential_persistence_status_and_logout(tmp_path: Path):
    store = CodexAuthStore(tmp_path / "auth.json")
    access, refresh = token(), "refresh-secret"
    store.save_tokens({"access_token": access, "refresh_token": refresh})
    assert store.status()["logged_in"] is True
    status_text = json.dumps(store.status())
    assert access not in status_text and refresh not in status_text
    assert oct((tmp_path / "auth.json").stat().st_mode & 0o777) == "0o600"
    assert store.logout() is True
    assert store.status()["logged_in"] is False


@pytest.mark.asyncio
async def test_expired_access_token_refreshes_and_rotates_refresh_token(monkeypatch, tmp_path):
    store = CodexAuthStore(tmp_path / "auth.json")
    store.save_tokens({"access_token": token(exp=1), "refresh_token": "old-refresh"})

    async def refresh(refresh_token):
        assert refresh_token == "old-refresh"
        return {"access_token": token(), "refresh_token": "new-refresh"}

    monkeypatch.setattr("market_data.agent_auth.refresh_access_token", refresh)
    credentials = await resolve_runtime_credentials(store)
    assert credentials["api_key"] != "old-refresh"
    assert store.load()["tokens"]["refresh_token"] == "new-refresh"


@pytest.mark.asyncio
async def test_refresh_failure_invalidates_credentials(monkeypatch, tmp_path):
    store = CodexAuthStore(tmp_path / "auth.json")
    store.save_tokens({"access_token": token(exp=1), "refresh_token": "revoked"})

    async def refresh(_):
        raise CodexAuthError("refresh failed", code="invalid_grant", relogin_required=True)

    monkeypatch.setattr("market_data.agent_auth.refresh_access_token", refresh)
    with pytest.raises(CodexAuthError) as error:
        await resolve_runtime_credentials(store)
    assert error.value.code == "invalid_grant"
    assert store.status()["logged_in"] is False


def test_provider_registration_runtime_headers_and_redaction(monkeypatch, tmp_path):
    assert "openai" in AGENT_PROVIDERS and "openai-codex" in AGENT_PROVIDERS
    assert AGENT_PROVIDERS["openai-codex"].description == "Use your ChatGPT/Codex subscription"
    access = token()
    headers = codex_headers(access)
    assert headers["originator"] == "marked-agent"
    assert headers["ChatGPT-Account-ID"] == "acct-123"
    assert CODEX_BASE_URL == "https://chatgpt.com/backend-api/codex"
    assert redact_secrets(
        {"error": access, "refresh": "refresh-secret"}, (access, "refresh-secret")
    ) == {"error": "[REDACTED]", "refresh": "[REDACTED]"}


@pytest.mark.asyncio
async def test_provider_resolves_codex_without_openai_key(monkeypatch, tmp_path):
    store = CodexAuthStore(tmp_path / "auth.json")
    store.save_tokens({"access_token": token(), "refresh_token": "refresh-secret"})
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    credentials = await resolve_provider("openai-codex", store=store)
    assert credentials.provider == "openai-codex"
    assert credentials.base_url == CODEX_BASE_URL
    assert credentials.api_key == token()


@pytest.mark.asyncio
async def test_codex_request_uses_bearer_and_backend_url(monkeypatch, tmp_path):
    from market_data.agent_providers import responses_json

    store = CodexAuthStore(tmp_path / "auth.json")
    access = token()
    store.save_tokens({"access_token": access, "refresh_token": "refresh-secret"})
    session = Session([Response(200, {"status": "completed"})])
    monkeypatch.setattr("market_data.agent_providers.aiohttp.ClientSession", factory(session))
    result = await responses_json({"model": "gpt-5.6-luna"}, selected="openai-codex", store=store)
    assert result == {"status": "completed"}
    url, request = session.calls[0]
    assert url == f"{CODEX_BASE_URL}/responses"
    assert request["headers"]["Authorization"] == f"Bearer {access}"
    assert request["headers"]["ChatGPT-Account-ID"] == "acct-123"


@pytest.mark.asyncio
async def test_model_discovery_uses_codex_client_version(monkeypatch, tmp_path):
    store = CodexAuthStore(tmp_path / "auth.json")
    store.save_tokens({"access_token": token(), "refresh_token": "refresh-secret"})
    session = Session([Response(200, {"models": [{"slug": "gpt-6-astra"}]})])
    monkeypatch.setattr("market_data.agent_providers.aiohttp.ClientSession", factory(session))

    assert await discover_codex_models(store=store) == ["gpt-6-astra"]
    assert session.calls[0][0] == f"{CODEX_BASE_URL}/models?client_version=0.0.0"


@pytest.mark.asyncio
async def test_revoked_refresh_response_requires_relogin():
    from market_data.agent_auth import refresh_access_token

    session = Session([Response(400, {"error": "invalid_grant"})])
    with pytest.raises(CodexAuthError) as error:
        await refresh_access_token("revoked", session_factory=factory(session))
    assert error.value.code == "invalid_grant"
    assert error.value.relogin_required is True
