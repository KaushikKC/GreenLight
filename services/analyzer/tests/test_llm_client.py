import pytest
from pydantic import BaseModel, Field

from analyzer.config import get_settings
from analyzer.llm.client import LLM, LLMError, provider_from_settings
from analyzer.llm.types import Image, Text
from tests.fake_llm import FakeProvider, reply


class Answer(BaseModel):
    verdict: str
    strength: int = Field(ge=1, le=5)


def call(llm: LLM):
    return llm.structured(
        purpose="test",
        system="sys",
        parts=[Text("hi"), Image(b"jpeg")],
        output=Answer,
        name="record_answer",
        description="Record the answer.",
    )


def test_valid_output_is_parsed_and_logged():
    fake = FakeProvider(reply({"verdict": "ok", "strength": 4}, input_tokens=100, output_tokens=20))
    llm = LLM(provider=fake)
    result = call(llm)
    assert result.output == Answer(verdict="ok", strength=4)
    assert result.attempts == 1
    assert result.model == "fake-vision"
    assert llm.calls[0]["input_tokens"] == 100
    # the schema sent is the strict one (constraints stripped, validated client-side)
    assert "maximum" not in str(fake.requests[0]["schema"])


def test_invalid_output_is_fed_back_and_retried_once():
    fake = FakeProvider(
        reply({"verdict": "ok", "strength": 9}, raw='{"verdict":"ok","strength":9}'),
        reply({"verdict": "ok", "strength": 3}),
    )
    llm = LLM(provider=fake)
    result = call(llm)
    assert result.attempts == 2
    turns = fake.requests[1]["turns"]
    assert [t.role for t in turns] == ["user", "assistant", "user"]
    assert "strength" in turns[1].parts[0].text
    assert "invalid" in turns[2].parts[0].text
    assert len(llm.calls) == 2


def test_missing_output_is_retried_with_instruction():
    fake = FakeProvider(
        reply(None, raw="Here is prose instead"), reply({"verdict": "ok", "strength": 2})
    )
    result = call(LLM(provider=fake))
    assert result.attempts == 2
    assert (
        "must return your answer via record_answer" in fake.requests[1]["turns"][-1].parts[0].text
    )


def test_empty_raw_text_is_never_sent_back_blank():
    fake = FakeProvider(reply(None, raw=""), reply({"verdict": "ok", "strength": 2}))
    call(LLM(provider=fake))
    assert fake.requests[1]["turns"][1].parts[0].text == "(no answer)"


def test_two_invalid_answers_raise():
    bad = reply({"verdict": "ok", "strength": 0})
    with pytest.raises(LLMError, match="couldn't be validated"):
        call(LLM(provider=FakeProvider(bad, bad)))


def test_refusal_raises_without_retry():
    fake = FakeProvider(reply(None, refused=True))
    with pytest.raises(LLMError, match="declined"):
        call(LLM(provider=fake))
    assert len(fake.requests) == 1


def test_provider_errors_propagate_as_llm_errors():
    fake = FakeProvider(LLMError("Gemini free-tier rate limit reached. Try again in a minute."))
    with pytest.raises(LLMError, match="rate limit"):
        call(LLM(provider=fake))


def test_no_model_configured_raises():
    with pytest.raises(LLMError, match="no model set"):
        call(LLM(provider=FakeProvider(vision_model=None)))


def test_cost_accumulates_across_retries():
    fake = FakeProvider(reply(None), reply({"verdict": "ok", "strength": 2}), cost=0.002)
    llm = LLM(provider=fake)
    assert call(llm).cost_usd == pytest.approx(0.004)
    assert llm.total_cost_usd == pytest.approx(0.004)


class TestProviderSelection:
    @pytest.fixture(autouse=True)
    def clean(self, monkeypatch):
        s = get_settings()
        for k in ("llm_provider", "anthropic_api_key", "gemini_api_key"):
            monkeypatch.setattr(s, k, None)
        self.s = s
        self.mp = monkeypatch

    def test_no_keys_explains_both_options(self):
        with pytest.raises(LLMError, match="GEMINI_API_KEY \\(free\\) or ANTHROPIC_API_KEY"):
            provider_from_settings()

    def test_gemini_key_alone_selects_gemini(self):
        self.mp.setattr(self.s, "gemini_api_key", "g-key")
        self.mp.setattr(self.s, "gemini_model_vision", "gemini-x")
        p = provider_from_settings()
        assert p.name == "gemini" and p.vision_model == "gemini-x"

    def test_anthropic_preferred_when_both_keys_set(self):
        self.mp.setattr(self.s, "gemini_api_key", "g-key")
        self.mp.setattr(self.s, "anthropic_api_key", "a-key")
        assert provider_from_settings().name == "anthropic"

    def test_explicit_provider_wins(self):
        self.mp.setattr(self.s, "gemini_api_key", "g-key")
        self.mp.setattr(self.s, "anthropic_api_key", "a-key")
        self.mp.setattr(self.s, "llm_provider", "gemini")
        assert provider_from_settings().name == "gemini"

    def test_explicit_provider_without_key_raises(self):
        self.mp.setattr(self.s, "llm_provider", "anthropic")
        with pytest.raises(LLMError, match="no ANTHROPIC_API_KEY"):
            provider_from_settings()

    def test_unknown_provider_raises(self):
        self.mp.setattr(self.s, "llm_provider", "openai")
        with pytest.raises(LLMError, match="Unknown LLM_PROVIDER"):
            provider_from_settings()


def test_logs_the_model_that_actually_answered():
    from analyzer.llm.types import Reply, Usage

    fake = FakeProvider(
        Reply(
            output={"verdict": "ok", "strength": 3},
            raw_text="{}",
            usage=Usage(),
            model="backup-model",
        )
    )
    llm = LLM(provider=fake)
    result = call(llm)
    assert result.model == "backup-model"
    assert llm.calls[0]["model"] == "backup-model"
