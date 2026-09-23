"""Provider-neutral request/response shapes for structured LLM calls."""

from dataclasses import dataclass, field
from typing import Any, Literal, Protocol


@dataclass(frozen=True)
class Text:
    text: str


@dataclass(frozen=True)
class Image:
    data: bytes
    media_type: str = "image/jpeg"


@dataclass(frozen=True)
class Document:
    """A whole file for the model to read, e.g. a scanned PDF contract."""

    data: bytes
    media_type: str = "application/pdf"


Part = Text | Image | Document


@dataclass
class Turn:
    role: Literal["user", "assistant"]
    parts: list[Part]


@dataclass
class Usage:
    input_tokens: int = 0
    output_tokens: int = 0
    cache_write_tokens: int = 0
    cache_read_tokens: int = 0


@dataclass
class Reply:
    """One provider response. `output` is the parsed JSON object, or None if the
    model didn't return one."""

    output: dict[str, Any] | None
    raw_text: str
    usage: Usage = field(default_factory=Usage)
    refused: bool = False


class Provider(Protocol):
    name: str
    vision_model: str | None

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
    ) -> Reply: ...

    def cost_usd(self, model: str, usage: Usage) -> float | None: ...
