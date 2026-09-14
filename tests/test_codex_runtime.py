import pytest

from market_data import codex_runtime


@pytest.mark.asyncio
async def test_runtime_sends_schema_and_returns_structured_output(monkeypatch):
    async def request(payload, **kwargs):
        assert kwargs["selected"] == "openai-codex"
        assert payload["store"] is False
        assert payload["text"]["format"]["schema"] == {"type": "object"}
        return {
            "output": [
                {"type": "message", "content": [{"type": "output_text", "text": '{"ok":true}'}]}
            ]
        }

    monkeypatch.setattr(codex_runtime, "responses_json", request)
    assert await codex_runtime.run("question", "gpt-test", {"type": "object"}) == {"ok": True}
