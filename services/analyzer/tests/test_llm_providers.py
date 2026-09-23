import anthropic
import httpx2
import pytest
from google.genai import errors

from analyzer.llm.errors import LLMError
from analyzer.llm.providers.anthropic_provider import AnthropicProvider
from analyzer.llm.providers.gemini_provider import GeminiProvider
from analyzer.llm.types import Image, Text, Turn
from tests.fake_anthropic import FakeAnthropic, response, text, tool_use, usage
from tests.fake_llm import FakeGenai, genai_response

SCHEMA = {
    "type": "object",
    "properties": {"inner": {"$ref": "#/$defs/Inner"}},
    "required": ["inner"],
    "additionalProperties": False,
    "$defs": {
        "Inner": {
            "type": "object",
            "properties": {"x": {"type": "integer"}},
            "required": ["x"],
            "additionalProperties": False,
        }
    },
}
TURNS = [Turn("user", [Text("look"), Image(b"\xff\xd8", "image/jpeg")])]


def gen(provider):
    return provider.generate(
        model="m",
        system="sys",
        turns=TURNS,
        schema=SCHEMA,
        name="rec",
        description="d",
        max_tokens=100,
    )


class TestAnthropic:
    def test_strict_tool_auto_choice_and_parsed_input(self):
        fake = FakeAnthropic(
            response(tool_use("rec", {"inner": {"x": 1}}), u=usage(inp=10, out=5, cache_read=100))
        )
        r = gen(AnthropicProvider(fake))
        req = fake.requests[0]
        assert req["tools"][0]["strict"] is True
        assert req["tool_choice"] == {"type": "auto"}
        assert req["system"][0]["cache_control"] == {"type": "ephemeral"}
        assert req["messages"][0]["content"][1]["source"]["media_type"] == "image/jpeg"
        assert r.output == {"inner": {"x": 1}}
        assert (r.usage.input_tokens, r.usage.cache_read_tokens) == (10, 100)

    def test_no_tool_call_returns_text(self):
        r = gen(AnthropicProvider(FakeAnthropic(response(text("prose"), stop_reason="end_turn"))))
        assert r.output is None and r.raw_text == "prose"

    def test_refusal_flag(self):
        assert gen(AnthropicProvider(FakeAnthropic(response(stop_reason="refusal")))).refused

    def test_connection_error_becomes_llm_error(self):
        err = anthropic.APIConnectionError(
            request=httpx2.Request("POST", "https://api.anthropic.com")
        )
        with pytest.raises(LLMError, match="temporarily unavailable"):
            gen(AnthropicProvider(FakeAnthropic(err)))

    def test_cost_uses_price_table(self):
        from analyzer.llm.types import Usage

        assert AnthropicProvider(None).cost_usd("claude-sonnet-5", Usage(1_000_000, 0)) == 2.0


class TestGemini:
    def test_json_mode_with_inlined_schema_and_image_parts(self):
        fake = FakeGenai(
            genai_response('{"inner": {"x": 2}}', prompt=1200, cached=200, out=50, thoughts=30)
        )
        r = gen(GeminiProvider(fake))
        cfg = fake.requests[0]["config"]
        assert cfg.response_mime_type == "application/json"
        assert "$ref" not in str(cfg.response_json_schema)
        assert "sys" in cfg.system_instruction
        parts = fake.requests[0]["contents"][0].parts
        assert parts[0].text == "look"
        assert parts[1].inline_data.mime_type == "image/jpeg"
        assert r.output == {"inner": {"x": 2}}
        # cached tokens split out of prompt; thinking tokens count as output
        assert (r.usage.input_tokens, r.usage.cache_read_tokens, r.usage.output_tokens) == (
            1000,
            200,
            80,
        )

    def test_assistant_turns_use_model_role(self):
        fake = FakeGenai(genai_response("{}"))
        GeminiProvider(fake).generate(
            model="m",
            system="s",
            turns=[
                Turn("user", [Text("a")]),
                Turn("assistant", [Text("b")]),
                Turn("user", [Text("c")]),
            ],
            schema=SCHEMA,
            name="rec",
            description="d",
            max_tokens=10,
        )
        assert [c.role for c in fake.requests[0]["contents"]] == ["user", "model", "user"]

    def test_invalid_json_gives_no_output(self):
        r = gen(GeminiProvider(FakeGenai(genai_response("not json"))))
        assert r.output is None and r.raw_text == "not json"

    def test_blocked_prompt_is_refusal(self):
        assert gen(GeminiProvider(FakeGenai(genai_response(None, block_reason="SAFETY")))).refused

    def test_safety_finish_is_refusal(self):
        assert gen(GeminiProvider(FakeGenai(genai_response("", finish="SAFETY")))).refused

    def test_rate_limit_carries_googles_retry_delay(self):
        from analyzer.llm.errors import LLMRateLimited

        body = {
            "error": {
                "message": "quota",
                "status": "RESOURCE_EXHAUSTED",
                "details": [
                    {"@type": "type.googleapis.com/google.rpc.RetryInfo", "retryDelay": "37s"}
                ],
            }
        }
        with pytest.raises(LLMRateLimited, match="rate limit") as exc:
            gen(GeminiProvider(FakeGenai(errors.ClientError(429, body))))
        assert exc.value.retry_after_s == 37.0

    def test_rate_limit_without_delay_defaults_to_a_minute(self):
        from analyzer.llm.errors import LLMRateLimited

        err = errors.ClientError(
            429, {"error": {"message": "quota", "status": "RESOURCE_EXHAUSTED"}}
        )
        with pytest.raises(LLMRateLimited) as exc:
            gen(GeminiProvider(FakeGenai(err)))
        assert exc.value.retry_after_s == 60.0

    def test_bad_key_message(self):
        err = errors.ClientError(
            400, {"error": {"message": "API key not valid.", "status": "INVALID_ARGUMENT"}}
        )
        with pytest.raises(LLMError, match="Gemini API key was rejected"):
            gen(GeminiProvider(FakeGenai(err)))

    def test_server_error_message(self):
        err = errors.ServerError(503, {"error": {"message": "overloaded", "status": "UNAVAILABLE"}})
        with pytest.raises(LLMError, match="temporarily unavailable"):
            gen(GeminiProvider(FakeGenai(err)))

    def test_free_tier_costs_zero(self):
        from analyzer.llm.types import Usage

        assert GeminiProvider(None, free_tier=True).cost_usd("gemini-x", Usage(10, 10)) == 0.0
        assert GeminiProvider(None, free_tier=False).cost_usd("gemini-x", Usage(10, 10)) is None


def test_documents_are_sent_natively():
    from analyzer.llm.types import Document

    turns = [Turn("user", [Document(b"%PDF-1.4", "application/pdf"), Text("extract")])]
    fake_a = FakeAnthropic(response(tool_use("rec", {"inner": {"x": 1}})))
    AnthropicProvider(fake_a).generate(
        model="m",
        system="s",
        turns=turns,
        schema=SCHEMA,
        name="rec",
        description="d",
        max_tokens=10,
    )
    block = fake_a.requests[0]["messages"][0]["content"][0]
    assert block["type"] == "document" and block["source"]["media_type"] == "application/pdf"

    fake_g = FakeGenai(genai_response('{"inner": {"x": 1}}'))
    GeminiProvider(fake_g).generate(
        model="m",
        system="s",
        turns=turns,
        schema=SCHEMA,
        name="rec",
        description="d",
        max_tokens=10,
    )
    assert fake_g.requests[0]["contents"][0].parts[0].inline_data.mime_type == "application/pdf"


class TestReplay:
    def test_serves_saved_json_for_the_output_name(self, tmp_path):
        from analyzer.llm.providers.replay_provider import ReplayProvider

        (tmp_path / "rec.json").write_text('{"inner": {"x": 7}}')
        r = gen(ReplayProvider(tmp_path))
        assert r.output == {"inner": {"x": 7}}
        assert ReplayProvider(tmp_path).cost_usd("replay", r.usage) == 0.0

    def test_missing_answer_is_an_llm_error(self, tmp_path):
        from analyzer.llm.providers.replay_provider import ReplayProvider

        with pytest.raises(LLMError, match="No saved AI answer"):
            gen(ReplayProvider(tmp_path))

    def test_selected_by_settings(self, tmp_path, monkeypatch):
        from analyzer.config import get_settings
        from analyzer.llm.client import provider_from_settings

        s = get_settings()
        monkeypatch.setattr(s, "llm_provider", "replay")
        monkeypatch.setattr(s, "llm_replay_dir", str(tmp_path))
        assert provider_from_settings().name == "replay"
        monkeypatch.setattr(s, "llm_replay_dir", str(tmp_path / "missing"))
        with pytest.raises(LLMError, match="LLM_REPLAY_DIR"):
            provider_from_settings()


DAILY = {
    "error": {
        "message": "quota",
        "status": "RESOURCE_EXHAUSTED",
        "details": [{"quotaId": "GenerateRequestsPerDayPerProjectPerModel-FreeTier"}],
    }
}


class TestGeminiFallbacks:
    def provider(self, *responses):
        fake = FakeGenai(*responses)
        return fake, GeminiProvider(fake, vision_model="a", fallback_models=["b", "c"])

    def test_daily_quota_falls_back_to_next_model(self):
        fake, p = self.provider(
            errors.ClientError(429, DAILY), genai_response('{"inner": {"x": 1}}')
        )
        r = p.generate(
            model="a",
            system="s",
            turns=TURNS,
            schema=SCHEMA,
            name="rec",
            description="d",
            max_tokens=10,
        )
        assert [req["model"] for req in fake.requests] == ["a", "b"]
        assert r.model == "b" and r.output == {"inner": {"x": 1}}

    def test_overloaded_and_missing_models_fall_back_too(self):
        _, p = self.provider(
            errors.ServerError(503, {"error": {"message": "busy", "status": "UNAVAILABLE"}}),
            errors.ClientError(404, {"error": {"message": "gone", "status": "NOT_FOUND"}}),
            genai_response("{}"),
        )
        r = p.generate(
            model="a",
            system="s",
            turns=TURNS,
            schema=SCHEMA,
            name="rec",
            description="d",
            max_tokens=10,
        )
        assert r.model == "c"

    def test_all_models_out_of_daily_quota(self):
        _, p = self.provider(*(errors.ClientError(429, DAILY) for _ in range(3)))
        with pytest.raises(LLMError, match="free daily limit") as exc:
            p.generate(
                model="a",
                system="s",
                turns=TURNS,
                schema=SCHEMA,
                name="rec",
                description="d",
                max_tokens=10,
            )
        from analyzer.llm.errors import LLMRateLimited

        assert not isinstance(exc.value, LLMRateLimited)  # waiting a minute won't help

    def test_per_minute_limit_is_not_a_fallback(self):
        from analyzer.llm.errors import LLMRateLimited

        per_minute = {"error": {"message": "quota", "status": "RESOURCE_EXHAUSTED"}}
        fake, p = self.provider(errors.ClientError(429, per_minute))
        with pytest.raises(LLMRateLimited):
            p.generate(
                model="a",
                system="s",
                turns=TURNS,
                schema=SCHEMA,
                name="rec",
                description="d",
                max_tokens=10,
            )
        assert len(fake.requests) == 1


def test_settings_parse_gemini_model_list(monkeypatch):
    from analyzer.config import get_settings
    from analyzer.llm.client import provider_from_settings

    s = get_settings()
    monkeypatch.setattr(s, "llm_provider", "gemini")
    monkeypatch.setattr(s, "gemini_api_key", "g-key")
    monkeypatch.setattr(s, "gemini_model_vision", "m1, m2 ,m3")
    monkeypatch.setattr(s, "gemini_model_fast", "f1,f2")
    p = provider_from_settings()
    assert (p.vision_model, p.fast_model) == ("m1", "f1")
    # every other model can stand in when one runs out of quota
    assert p.fallback_models == ["m2", "m3", "f2", "m1", "f1"]
