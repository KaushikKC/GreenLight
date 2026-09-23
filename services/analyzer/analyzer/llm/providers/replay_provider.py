"""Replay provider: answers from saved JSON files instead of calling an API.

For the Playwright happy path and the demo seed, so both run without an API
key and always get the same answer. `LLM_PROVIDER=replay` with
`LLM_REPLAY_DIR` pointing at a folder of `<output name>.json` files, e.g.
`record_contract_terms.json`. A missing file raises LLMError, so the caller
degrades exactly as when a real provider fails.
"""

import json
from pathlib import Path
from typing import Any

from analyzer.llm.errors import LLMError
from analyzer.llm.types import Reply, Turn, Usage


class ReplayProvider:
    name = "replay"
    vision_model = "replay"

    def __init__(self, directory: Path):
        self.directory = directory

    def generate(
        self,
        *,
        model: str,
        system: str,
        turns: list[Turn],
        schema: dict[str, Any],
        name: str,
        description: str,
        max_tokens: int,
    ) -> Reply:
        path = self.directory / f"{name}.json"
        if not path.is_file():
            raise LLMError(f"No saved AI answer for {name} (replay mode).")
        text = path.read_text()
        return Reply(output=json.loads(text), raw_text=text, usage=Usage())

    def cost_usd(self, model: str, usage: Usage) -> float | None:
        return 0.0
