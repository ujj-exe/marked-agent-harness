from contextlib import asynccontextmanager

import pytest

from market_data import terminal


class Tool:
    name = "get_quote"
    description = "Get a quote"
    inputSchema = {"type": "object", "properties": {"symbol": {"type": "string"}}}


class Result:
    def model_dump(self, **_):
        return {"content": [{"type": "text", "text": "RELIANCE 100"}]}


class Session:
    async def list_tools(self):
        return type("Tools", (), {"tools": [Tool()]})()

    async def call_tool(self, name, arguments):
        assert name == "get_quote"
        assert arguments == {"symbol": "RELIANCE"}
        return Result()


@pytest.mark.asyncio
async def test_agent_turn_calls_marked_tool_then_returns_text(monkeypatch):
    replies = iter(
        [
            {
                "output": [
                    {
                        "type": "function_call",
                        "name": "get_quote",
                        "arguments": '{"symbol":"RELIANCE"}',
                        "call_id": "call-1",
                    }
                ]
            },
            {
                "output": [
                    {
                        "type": "message",
                        "content": [{"type": "output_text", "text": "Reliance is ₹100."}],
                    }
                ]
            },
        ]
    )

    @asynccontextmanager
    async def session(_):
        yield Session()

    async def respond(*args, **kwargs):
        return next(replies)

    monkeypatch.setattr(terminal, "_marked_session", session)
    monkeypatch.setattr(terminal, "responses_json", respond)
    used: list[str] = []
    answer = await terminal.ask_marked(
        {
            "marked": {"mcp_url": "https://example.test/mcp", "api_key": "secret"},
            "agent": {"provider": "openai-codex", "model": "gpt-test"},
        },
        [],
        "Quote Reliance",
        on_tool=used.append,
    )

    assert answer == "Reliance is ₹100."
    assert used == ["get_quote"]


def test_marked_help_describes_terminal(capsys):
    assert terminal.main(["--help"]) == 0
    assert "open the Marked terminal" in capsys.readouterr().out
