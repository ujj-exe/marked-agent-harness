import json

from market_data.agent_auth import CODEX_PROVIDER, CodexAuthStore
from market_data.agent_providers import configured_model, provider_id
from market_data.onboarding import ClientDetection, config_path, detect_clients, run_onboarding


def test_detects_installed_clients_without_exposing_auth(tmp_path):
    store = CodexAuthStore(tmp_path / "auth.json")
    store.save_tokens({"access_token": "access", "refresh_token": "refresh"})
    detected = detect_clients(
        which=lambda name: "/bin/tool" if name in {"claude", "codex"} else None,
        auth_store=store,
    )

    assert detected == ClientDetection(True, True, True)
    assert "access" not in str(detected)


def test_repo_and_global_config_paths(tmp_path):
    repo = tmp_path / "repo"
    (repo / ".git").mkdir(parents=True)

    assert config_path("repo", cwd=repo) == repo / ".marked" / "agent.json"
    assert config_path("global", home=tmp_path) == tmp_path / ".marked" / "agent.json"


def test_onboarding_persists_secret_securely_without_printing_it(tmp_path):
    secret = "mk_live_test_secret"
    output: list[str] = []
    target = run_onboarding(
        scope="repo",
        provider=CODEX_PROVIDER,
        model="gpt-test",
        cwd=tmp_path,
        home=tmp_path / "home",
        secret_input=lambda _: secret,
        output_fn=output.append,
        auth_store=CodexAuthStore(tmp_path / "auth.json"),
    )

    payload = json.loads(target.read_text())
    assert payload["marked"]["api_key"] == secret
    assert payload["agent"] == {"provider": CODEX_PROVIDER, "model": "gpt-test"}
    assert target.stat().st_mode & 0o777 == 0o600
    assert secret not in "\n".join(output)


def test_provider_and_model_are_loaded_from_onboarding_config(tmp_path, monkeypatch):
    config = tmp_path / ".marked" / "agent.json"
    config.parent.mkdir()
    config.write_text(json.dumps({"agent": {"provider": CODEX_PROVIDER, "model": "gpt-test"}}))
    monkeypatch.chdir(tmp_path)
    monkeypatch.delenv("MARKED_AGENT_PROVIDER", raising=False)
    monkeypatch.delenv("MARKED_AGENT_MODEL", raising=False)
    monkeypatch.delenv("MARKED_AGENT_CONFIG", raising=False)

    assert provider_id() == CODEX_PROVIDER
    assert configured_model() == "gpt-test"


def test_onboarding_rejects_newline_in_api_key(tmp_path):
    output: list[str] = []
    try:
        run_onboarding(
            scope="repo",
            provider="openai",
            model="gpt-test",
            cwd=tmp_path,
            secret_input=lambda _: "bad\nkey",
            output_fn=output.append,
            auth_store=CodexAuthStore(tmp_path / "auth.json"),
        )
    except ValueError as error:
        assert "API key" in str(error)
    else:
        raise AssertionError("newline API key should be rejected")
