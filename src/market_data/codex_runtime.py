"""Private stdout bridge between the Node harness and local Codex auth."""

from __future__ import annotations

import argparse
import asyncio
import json
import sys
from pathlib import Path
from typing import Any

from market_data.agent_auth import CODEX_PROVIDER, CodexAuthError
from market_data.agent_providers import responses_json


def output_text(response: dict[str, Any]) -> str:
    for item in response.get("output", []):
        if not isinstance(item, dict) or item.get("type") != "message":
            continue
        for content in item.get("content", []):
            if isinstance(content, dict) and content.get("type") == "output_text":
                text = content.get("text")
                if isinstance(text, str) and text.strip():
                    return text
    raise CodexAuthError("Codex returned no structured result.", code="empty_response")


async def run(prompt: str, model: str | None, schema: dict[str, Any]) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "input": prompt,
        "store": False,
        "text": {
            "format": {
                "type": "json_schema",
                "name": "marked_research_result",
                "strict": True,
                "schema": schema,
            }
        },
    }
    if model:
        payload["model"] = model
    response = await responses_json(payload, selected=CODEX_PROVIDER)
    if response is None:
        raise CodexAuthError("OpenAI Codex is not signed in.", code="login_required")
    result = json.loads(output_text(response))
    if not isinstance(result, dict):
        raise CodexAuthError("Codex returned an invalid result.", code="invalid_result")
    return result


def main() -> None:
    parser = argparse.ArgumentParser(prog="marked-codex")
    parser.add_argument("--model")
    parser.add_argument("--schema", required=True)
    args = parser.parse_args()
    try:
        schema = json.loads(Path(args.schema).read_text(encoding="utf-8"))
        result = asyncio.run(run(sys.stdin.read(), args.model, schema))
        print(json.dumps(result, separators=(",", ":")))
    except (CodexAuthError, OSError, ValueError, json.JSONDecodeError) as error:
        print(f"marked-codex: {error}", file=sys.stderr)
        raise SystemExit(1) from None


if __name__ == "__main__":
    main()
