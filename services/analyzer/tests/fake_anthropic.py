"""A stand-in for anthropic.Anthropic that replays scripted responses."""

from types import SimpleNamespace
from typing import Any


def usage(inp=1000, out=200, cache_write=0, cache_read=0):
    return SimpleNamespace(
        input_tokens=inp,
        output_tokens=out,
        cache_creation_input_tokens=cache_write,
        cache_read_input_tokens=cache_read,
    )


def tool_use(name: str, payload: dict, id_: str = "toolu_1"):
    return SimpleNamespace(type="tool_use", name=name, input=payload, id=id_)


def text(t: str):
    return SimpleNamespace(type="text", text=t)


def response(*blocks, stop_reason="tool_use", u=None):
    return SimpleNamespace(content=list(blocks), stop_reason=stop_reason, usage=u or usage())


class FakeAnthropic:
    def __init__(self, *responses: Any):
        self._responses = list(responses)
        self.requests: list[dict] = []
        self.messages = self

    def create(self, **kwargs):
        self.requests.append(kwargs)
        item = self._responses.pop(0)
        if isinstance(item, Exception):
            raise item
        return item
