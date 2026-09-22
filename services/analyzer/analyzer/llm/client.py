"""Anthropic wrapper: structured output via one strict tool, validated with Pydantic.

- tool_choice is "auto" (forced tool choice is rejected by some models, and the
  model name comes from env), so we check a call was made.
- Validation failures are fed back to the model and retried once; a second
  failure raises LLMError so the caller can mark its checks as `error`.
- Every API call is logged to llm_calls with tokens, cost and latency.
"""

import logging
import time
from dataclasses import dataclass, field
from typing import Any, Generic, TypeVar
from uuid import UUID

import anthropic
import psycopg
from pydantic import BaseModel, ValidationError

from analyzer.config import get_settings
from analyzer.llm.pricing import cost_usd
from analyzer.llm.schema import strict_schema

log = logging.getLogger(__name__)

T = TypeVar("T", bound=BaseModel)

MAX_ATTEMPTS = 2  # first try + one retry


class LLMError(Exception):
    """The LLM step couldn't produce a usable answer. Message is safe to show."""


@dataclass
class ToolResult(Generic[T]):
    output: T
    model: str
    attempts: int
    cost_usd: float | None


@dataclass
class LLM:
    client: Any = None  # anthropic.Anthropic, or a fake in tests
    conn: psycopg.Connection | None = None
    job_id: UUID | None = None
    total_cost_usd: float = 0.0
    calls: list[dict[str, Any]] = field(default_factory=list)

    @classmethod
    def from_settings(cls, **kw) -> "LLM":
        s = get_settings()
        if not s.anthropic_api_key:
            raise LLMError("AI review isn't configured (no ANTHROPIC_API_KEY).")
        return cls(client=anthropic.Anthropic(api_key=s.anthropic_api_key, timeout=s.llm_timeout_s), **kw)

    def _log(self, *, model: str, purpose: str, usage: Any, latency_ms: int) -> float | None:
        input_tokens = getattr(usage, "input_tokens", 0) or 0
        output_tokens = getattr(usage, "output_tokens", 0) or 0
        cache_write = getattr(usage, "cache_creation_input_tokens", 0) or 0
        cache_read = getattr(usage, "cache_read_input_tokens", 0) or 0
        cost = cost_usd(model, input_tokens, output_tokens, cache_write, cache_read)
        row = {
            "model": model,
            "purpose": purpose,
            "input_tokens": input_tokens + cache_write + cache_read,
            "output_tokens": output_tokens,
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
        log.info("llm %s %s: %s in / %s out, $%s, %sms", purpose, model, row["input_tokens"], output_tokens, cost, latency_ms)
        return cost

    def call_tool(
        self,
        *,
        purpose: str,
        model: str,
        system: str,
        content: list[dict[str, Any]],
        output: type[T],
        tool_name: str,
        tool_description: str,
        max_tokens: int = 16000,
    ) -> ToolResult[T]:
        tool = {
            "name": tool_name,
            "description": tool_description,
            "strict": True,
            "input_schema": strict_schema(output),
        }
        messages: list[dict[str, Any]] = [{"role": "user", "content": content}]
        call_cost = 0.0

        for attempt in range(1, MAX_ATTEMPTS + 1):
            started = time.monotonic()
            try:
                resp = self.client.messages.create(
                    model=model,
                    max_tokens=max_tokens,
                    system=[{"type": "text", "text": system, "cache_control": {"type": "ephemeral"}}],
                    tools=[tool],
                    tool_choice={"type": "auto"},
                    messages=messages,
                )
            except anthropic.AuthenticationError as e:
                raise LLMError("AI review isn't configured (the API key was rejected).") from e
            except anthropic.NotFoundError as e:
                raise LLMError(f"AI model {model!r} isn't available.") from e
            except (anthropic.APIStatusError, anthropic.APIConnectionError) as e:
                # The SDK has already retried 429/5xx/connection errors.
                raise LLMError("AI review is temporarily unavailable.") from e
            call_cost += self._log(
                model=model,
                purpose=purpose,
                usage=resp.usage,
                latency_ms=round((time.monotonic() - started) * 1000),
            ) or 0.0

            if resp.stop_reason == "refusal":
                raise LLMError("The AI reviewer declined to assess this video.")

            block = next(
                (b for b in resp.content if b.type == "tool_use" and b.name == tool_name), None
            )
            if block is None:
                problem = f"You must call the {tool_name} tool with your answer."
            else:
                try:
                    parsed = output.model_validate(block.input)
                except ValidationError as e:
                    problem = f"Your {tool_name} input was invalid: {e}. Call the tool again with corrected input."
                else:
                    return ToolResult(output=parsed, model=model, attempts=attempt, cost_usd=call_cost)

            log.warning("llm %s attempt %d invalid: %s", purpose, attempt, problem[:300])
            messages.append({"role": "assistant", "content": resp.content})
            if block is not None:
                messages.append(
                    {
                        "role": "user",
                        "content": [
                            {"type": "tool_result", "tool_use_id": block.id, "is_error": True, "content": problem}
                        ],
                    }
                )
            else:
                messages.append({"role": "user", "content": problem})

        raise LLMError("The AI reviewer's answer couldn't be validated.")
