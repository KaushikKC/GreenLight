"""Anthropic: structured output via one strict tool.

tool_choice is "auto" because forced tool choice is rejected by some models
and the model name comes from env; the caller checks that a call was made.
"""

import base64
import json
from typing import Any

import anthropic

from analyzer.llm.errors import LLMError
from analyzer.llm.pricing import cost_usd
from analyzer.llm.types import Document, Image, Part, Reply, Text, Turn, Usage


def _block(part: Part) -> dict[str, Any]:
    if isinstance(part, Text):
        return {"type": "text", "text": part.text}
    return {
        "type": "document" if isinstance(part, Document) else "image",
        "source": {
            "type": "base64",
            "media_type": part.media_type,
            "data": base64.standard_b64encode(part.data).decode("ascii"),
        },
    }


class AnthropicProvider:
    name = "anthropic"

    def __init__(self, client: Any, vision_model: str | None = None):
        self.client = client
        self.vision_model = vision_model

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
        try:
            resp = self.client.messages.create(
                model=model,
                max_tokens=max_tokens,
                system=[{"type": "text", "text": system, "cache_control": {"type": "ephemeral"}}],
                tools=[
                    {
                        "name": name,
                        "description": description,
                        "strict": True,
                        "input_schema": schema,
                    }
                ],
                tool_choice={"type": "auto"},
                messages=[{"role": t.role, "content": [_block(p) for p in t.parts]} for t in turns],
            )
        except anthropic.AuthenticationError as e:
            raise LLMError(
                "AI review isn't configured (the Anthropic API key was rejected)."
            ) from e
        except anthropic.NotFoundError as e:
            raise LLMError(f"AI model {model!r} isn't available.") from e
        except (anthropic.APIStatusError, anthropic.APIConnectionError) as e:
            # The SDK has already retried 429/5xx/connection errors.
            raise LLMError("AI review is temporarily unavailable.") from e

        u = resp.usage
        usage = Usage(
            input_tokens=getattr(u, "input_tokens", 0) or 0,
            output_tokens=getattr(u, "output_tokens", 0) or 0,
            cache_write_tokens=getattr(u, "cache_creation_input_tokens", 0) or 0,
            cache_read_tokens=getattr(u, "cache_read_input_tokens", 0) or 0,
        )
        call = next((b for b in resp.content if b.type == "tool_use" and b.name == name), None)
        texts = " ".join(b.text for b in resp.content if b.type == "text")
        return Reply(
            output=call.input if call is not None else None,
            raw_text=json.dumps(call.input) if call is not None else texts,
            usage=usage,
            refused=resp.stop_reason == "refusal",
        )

    def cost_usd(self, model: str, usage: Usage) -> float | None:
        return cost_usd(
            model,
            usage.input_tokens,
            usage.output_tokens,
            usage.cache_write_tokens,
            usage.cache_read_tokens,
        )
