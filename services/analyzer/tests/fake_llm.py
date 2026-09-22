"""Scripted providers/clients for LLM tests."""

from types import SimpleNamespace
from typing import Any

from analyzer.llm.types import Reply, Usage


class FakeProvider:
    """Replays Reply objects (or raises exceptions) in order."""

    name = "fake"

    def __init__(
        self, *replies: Any, vision_model: str | None = "fake-vision", cost: float | None = 0.001
    ):
        self._replies = list(replies)
        self.vision_model = vision_model
        self.cost = cost
        self.requests: list[dict] = []

    def generate(self, **kwargs) -> Reply:
        self.requests.append({**kwargs, "turns": list(kwargs["turns"])})
        item = self._replies.pop(0)
        if isinstance(item, Exception):
            raise item
        return item

    def cost_usd(self, model: str, usage: Usage) -> float | None:
        return self.cost


def reply(output: dict | None, raw: str = "", refused: bool = False, **usage) -> Reply:
    return Reply(
        output=output, raw_text=raw or str(output or ""), usage=Usage(**usage), refused=refused
    )


class FakeGenai:
    """Stand-in for google.genai.Client: client.models.generate_content(...)."""

    def __init__(self, *responses: Any):
        self._responses = list(responses)
        self.requests: list[dict] = []
        self.models = self

    def generate_content(self, **kwargs):
        self.requests.append(kwargs)
        item = self._responses.pop(0)
        if isinstance(item, Exception):
            raise item
        return item


def genai_response(
    text: str | None,
    *,
    block_reason=None,
    finish="STOP",
    prompt=1000,
    out=200,
    thoughts=0,
    cached=0,
):
    return SimpleNamespace(
        text=text,
        prompt_feedback=SimpleNamespace(block_reason=block_reason) if block_reason else None,
        candidates=[SimpleNamespace(finish_reason=SimpleNamespace(name=finish))],
        usage_metadata=SimpleNamespace(
            prompt_token_count=prompt,
            candidates_token_count=out,
            thoughts_token_count=thoughts,
            cached_content_token_count=cached,
        ),
    )
