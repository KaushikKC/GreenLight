"""Structured LLM calls, validated with Pydantic, on any configured provider.

- The provider turns our JSON schema into its native structured-output feature
  (Anthropic: a strict tool; Gemini: JSON-schema response mode).
- Invalid or missing output is fed back to the model and retried once; a second
  failure raises LLMError so the caller can mark its checks as `error`.
- Every API call is logged to llm_calls with tokens, cost and latency.
"""

import logging
import time
from dataclasses import dataclass, field
from typing import Any, Generic, TypeVar
from uuid import UUID

import psycopg
from pydantic import BaseModel, ValidationError

from analyzer.config import get_settings
from analyzer.llm.errors import LLMError
from analyzer.llm.schema import strict_schema
from analyzer.llm.types import Part, Provider, Text, Turn, Usage

log = logging.getLogger(__name__)

T = TypeVar("T", bound=BaseModel)

MAX_ATTEMPTS = 2  # first try + one retry

__all__ = ["LLM", "LLMError", "ToolResult", "provider_from_settings"]


@dataclass
class ToolResult(Generic[T]):
    output: T
    model: str
    attempts: int
    cost_usd: float | None


def provider_from_settings() -> Provider:
    """Explicit LLM_PROVIDER wins; otherwise whichever key is set, Anthropic first."""
    s = get_settings()
    choice = (s.llm_provider or "").strip().lower()
    if not choice:
        choice = "anthropic" if s.anthropic_api_key else "gemini" if s.gemini_api_key else ""

    if choice == "anthropic":
        if not s.anthropic_api_key:
            raise LLMError(
                "AI review isn't configured (LLM_PROVIDER=anthropic but no ANTHROPIC_API_KEY)."
            )
        import anthropic

        from analyzer.llm.providers.anthropic_provider import AnthropicProvider

        client = anthropic.Anthropic(api_key=s.anthropic_api_key, timeout=s.llm_timeout_s)
        return AnthropicProvider(client, vision_model=s.model_vision)

    if choice == "gemini":
        if not s.gemini_api_key:
            raise LLMError(
                "AI review isn't configured (LLM_PROVIDER=gemini but no GEMINI_API_KEY)."
            )
        from google import genai
        from google.genai import types

        from analyzer.llm.providers.gemini_provider import GeminiProvider

        client = genai.Client(
            api_key=s.gemini_api_key,
            http_options=types.HttpOptions(
                timeout=int(s.llm_timeout_s * 1000),  # milliseconds
                retry_options=types.HttpRetryOptions(attempts=3),
            ),
        )
        return GeminiProvider(
            client, vision_model=s.gemini_model_vision, free_tier=s.gemini_free_tier
        )

    if choice == "replay":
        from pathlib import Path

        from analyzer.llm.providers.replay_provider import ReplayProvider

        if not s.llm_replay_dir or not Path(s.llm_replay_dir).is_dir():
            raise LLMError("LLM_PROVIDER=replay needs LLM_REPLAY_DIR pointing at a folder.")
        return ReplayProvider(Path(s.llm_replay_dir))

    if choice:
        raise LLMError(f"Unknown LLM_PROVIDER {choice!r}; use 'anthropic', 'gemini' or 'replay'.")
    raise LLMError("AI review isn't configured: set GEMINI_API_KEY (free) or ANTHROPIC_API_KEY.")


@dataclass
class LLM:
    provider: Provider
    conn: psycopg.Connection | None = None
    job_id: UUID | None = None
    total_cost_usd: float = 0.0
    calls: list[dict[str, Any]] = field(default_factory=list)

    @classmethod
    def from_settings(cls, **kw) -> "LLM":
        return cls(provider=provider_from_settings(), **kw)

    def _log(self, *, model: str, purpose: str, usage: Usage, latency_ms: int) -> float | None:
        cost = self.provider.cost_usd(model, usage)
        row = {
            "model": model,
            "purpose": purpose,
            "input_tokens": usage.input_tokens + usage.cache_write_tokens + usage.cache_read_tokens,
            "output_tokens": usage.output_tokens,
            "cost_usd": cost,
            "latency_ms": latency_ms,
        }
        self.calls.append(row)
        self.total_cost_usd += cost or 0.0
        if self.conn is not None:
            with self.conn.transaction():
                self.conn.execute(
                    """INSERT INTO llm_calls
                         (job_id, model, purpose, input_tokens, output_tokens, cost_usd, latency_ms)
                       VALUES (%s, %s, %s, %s, %s, %s, %s)""",
                    (self.job_id, *row.values()),
                )
        log.info(
            "llm %s %s/%s: %s in / %s out, $%s, %sms",
            purpose,
            self.provider.name,
            model,
            row["input_tokens"],
            usage.output_tokens,
            cost,
            latency_ms,
        )
        return cost

    def structured(
        self,
        *,
        purpose: str,
        system: str,
        parts: list[Part],
        output: type[T],
        name: str,
        description: str,
        model: str | None = None,
        max_tokens: int = 16000,
    ) -> ToolResult[T]:
        model = model or self.provider.vision_model
        if not model:
            raise LLMError(f"AI review isn't configured (no model set for {self.provider.name}).")
        schema = strict_schema(output)
        turns = [Turn("user", list(parts))]
        call_cost = 0.0

        for attempt in range(1, MAX_ATTEMPTS + 1):
            started = time.monotonic()
            reply = self.provider.generate(
                model=model,
                system=system,
                turns=turns,
                schema=schema,
                name=name,
                description=description,
                max_tokens=max_tokens,
            )
            latency_ms = round((time.monotonic() - started) * 1000)
            call_cost += (
                self._log(model=model, purpose=purpose, usage=reply.usage, latency_ms=latency_ms)
                or 0.0
            )

            if reply.refused:
                raise LLMError("The AI reviewer declined to assess this video.")
            if reply.output is None:
                problem = (
                    f"You must return your answer via {name}, as a JSON object matching the schema."
                )
            else:
                try:
                    parsed = output.model_validate(reply.output)
                except ValidationError as e:
                    problem = f"Your {name} answer was invalid: {e}. Return it again with corrected values."
                else:
                    return ToolResult(
                        output=parsed, model=model, attempts=attempt, cost_usd=call_cost
                    )

            log.warning("llm %s attempt %d invalid: %s", purpose, attempt, problem[:300])
            turns += [
                Turn("assistant", [Text(reply.raw_text or "(no answer)")]),
                Turn("user", [Text(problem)]),
            ]

        raise LLMError("The AI reviewer's answer couldn't be validated.")
