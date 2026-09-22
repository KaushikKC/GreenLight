import anthropic
import httpx2
import pytest
from pydantic import BaseModel, Field

from analyzer.llm.client import LLM, LLMError
from tests.fake_anthropic import FakeAnthropic, response, text, tool_use, usage


class Answer(BaseModel):
    verdict: str
    strength: int = Field(ge=1, le=5)


def call(llm: LLM):
    return llm.call_tool(
        purpose="test",
        model="claude-sonnet-5",
        system="sys",
        content=[{"type": "text", "text": "hi"}],
        output=Answer,
        tool_name="record_answer",
        tool_description="Record the answer.",
    )


def test_valid_tool_call_returns_parsed_output_and_cost():
    fake = FakeAnthropic(response(tool_use("record_answer", {"verdict": "ok", "strength": 4})))
    llm = LLM(client=fake)
    result = call(llm)
    assert result.output == Answer(verdict="ok", strength=4)
    assert result.attempts == 1
    # 1000 in @ $2/M + 200 out @ $10/M
    assert result.cost_usd == pytest.approx(0.004)
    req = fake.requests[0]
    assert req["tool_choice"] == {"type": "auto"}
    assert req["tools"][0]["strict"] is True
    assert req["system"][0]["cache_control"] == {"type": "ephemeral"}


def test_invalid_input_is_fed_back_and_retried_once():
    fake = FakeAnthropic(
        response(tool_use("record_answer", {"verdict": "ok", "strength": 9}, id_="t1")),
        response(tool_use("record_answer", {"verdict": "ok", "strength": 3}, id_="t2")),
    )
    llm = LLM(client=fake)
    result = call(llm)
    assert result.attempts == 2
    retry_msgs = fake.requests[1]["messages"]
    tool_result = retry_msgs[-1]["content"][0]
    assert tool_result["type"] == "tool_result"
    assert tool_result["tool_use_id"] == "t1"
    assert tool_result["is_error"] is True
    assert len(llm.calls) == 2  # both calls logged


def test_missing_tool_call_is_retried_with_instruction():
    fake = FakeAnthropic(
        response(text("Here's my answer in prose"), stop_reason="end_turn"),
        response(tool_use("record_answer", {"verdict": "ok", "strength": 2})),
    )
    result = call(LLM(client=fake))
    assert result.attempts == 2
    assert "must call the record_answer tool" in fake.requests[1]["messages"][-1]["content"]


def test_two_invalid_answers_raise():
    bad = response(tool_use("record_answer", {"verdict": "ok", "strength": 0}))
    with pytest.raises(LLMError):
        call(LLM(client=FakeAnthropic(bad, bad)))


def test_refusal_raises_without_retry():
    fake = FakeAnthropic(response(stop_reason="refusal"))
    with pytest.raises(LLMError, match="declined"):
        call(LLM(client=fake))
    assert len(fake.requests) == 1


def test_connection_error_becomes_llm_error():
    err = anthropic.APIConnectionError(request=httpx2.Request("POST", "https://api.anthropic.com"))
    with pytest.raises(LLMError, match="temporarily unavailable"):
        call(LLM(client=FakeAnthropic(err)))


def test_cache_tokens_count_towards_input_and_cost():
    fake = FakeAnthropic(
        response(
            tool_use("record_answer", {"verdict": "ok", "strength": 4}),
            u=usage(inp=100, out=0, cache_read=10_000),
        )
    )
    llm = LLM(client=fake)
    call(llm)
    assert llm.calls[0]["input_tokens"] == 10_100
    assert llm.total_cost_usd == pytest.approx((100 * 2 + 10_000 * 0.2) / 1_000_000)


def test_from_settings_without_key_raises(monkeypatch):
    from analyzer import config

    monkeypatch.setattr(config.get_settings(), "anthropic_api_key", None)
    with pytest.raises(LLMError, match="isn't configured"):
        LLM.from_settings()
