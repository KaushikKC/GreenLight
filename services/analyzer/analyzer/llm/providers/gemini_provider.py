"""Google Gemini: structured output via JSON-schema response mode.

Works on the free tier of Google AI Studio (no card). The schema is sent with
$refs inlined; Pydantic still validates the result in the caller.
"""

import json
import logging
from typing import Any

from google.genai import errors, types

from analyzer.llm.errors import LLMError
from analyzer.llm.schema import inline_refs
from analyzer.llm.types import Part, Reply, Text, Turn, Usage

log = logging.getLogger(__name__)

BLOCKED_FINISH = {
    "SAFETY",
    "PROHIBITED_CONTENT",
    "BLOCKLIST",
    "SPII",
    "IMAGE_SAFETY",
    "IMAGE_PROHIBITED_CONTENT",
}


def _part(part: Part) -> types.Part:
    if isinstance(part, Text):
        return types.Part.from_text(text=part.text)
    return types.Part.from_bytes(data=part.data, mime_type=part.media_type)


def _is_refusal(resp: Any) -> bool:
    feedback = getattr(resp, "prompt_feedback", None)
    if feedback is not None and getattr(feedback, "block_reason", None):
        return True
    for cand in getattr(resp, "candidates", None) or []:
        reason = getattr(cand, "finish_reason", None)
        if reason is not None and getattr(reason, "name", str(reason)) in BLOCKED_FINISH:
            return True
    return False


class GeminiProvider:
    name = "gemini"

    def __init__(self, client: Any, vision_model: str | None = None, free_tier: bool = True):
        self.client = client
        self.vision_model = vision_model
        self.free_tier = free_tier

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
        config = types.GenerateContentConfig(
            system_instruction=f"{system}\n\nReturn your answer as a single JSON object ({name}): {description}",
            response_mime_type="application/json",
            response_json_schema=inline_refs(schema),
            max_output_tokens=max_tokens,
            # We pass no Python tools; keep the SDK from trying function calling.
            automatic_function_calling=types.AutomaticFunctionCallingConfig(disable=True),
        )
        contents = [
            types.Content(
                role="user" if t.role == "user" else "model", parts=[_part(p) for p in t.parts]
            )
            for t in turns
        ]
        try:
            resp = self.client.models.generate_content(
                model=model, contents=contents, config=config
            )
        except errors.ClientError as e:
            if e.code == 429:
                raise LLMError("Gemini free-tier rate limit reached. Try again in a minute.") from e
            if e.code == 404:
                raise LLMError(f"AI model {model!r} isn't available.") from e
            if e.code in (400, 401, 403) and "key" in str(e).lower():
                raise LLMError(
                    "AI review isn't configured (the Gemini API key was rejected)."
                ) from e
            log.warning("gemini client error %s: %s", e.code, e)
            raise LLMError("The AI review request was rejected.") from e
        except errors.APIError as e:
            raise LLMError("AI review is temporarily unavailable.") from e
        except Exception as e:  # network/transport errors from the SDK's HTTP layer
            log.warning("gemini transport error: %r", e)
            raise LLMError("AI review is temporarily unavailable.") from e

        meta = resp.usage_metadata
        prompt = (getattr(meta, "prompt_token_count", 0) or 0) if meta else 0
        cached = (getattr(meta, "cached_content_token_count", 0) or 0) if meta else 0
        out = (getattr(meta, "candidates_token_count", 0) or 0) if meta else 0
        thoughts = (getattr(meta, "thoughts_token_count", 0) or 0) if meta else 0
        usage = Usage(
            input_tokens=prompt - cached, output_tokens=out + thoughts, cache_read_tokens=cached
        )

        if _is_refusal(resp):
            return Reply(output=None, raw_text="", usage=usage, refused=True)
        try:
            text = resp.text or ""
        except (ValueError, AttributeError):  # no usable candidates
            text = ""
        try:
            parsed = json.loads(text)
        except json.JSONDecodeError:
            parsed = None
        return Reply(
            output=parsed if isinstance(parsed, dict) else None, raw_text=text, usage=usage
        )

    def cost_usd(self, model: str, usage: Usage) -> float | None:
        # Free tier: $0. On a paid plan we don't track Gemini rates yet.
        return 0.0 if self.free_tier else None
