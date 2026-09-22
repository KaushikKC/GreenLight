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

    def test_rate_limit_message(self):
        err = errors.ClientError(
            429, {"error": {"message": "quota", "status": "RESOURCE_EXHAUSTED"}}
        )
        with pytest.raises(LLMError, match="rate limit"):
            gen(GeminiProvider(FakeGenai(err)))

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
