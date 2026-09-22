import pytest

from analyzer.config import get_settings
from analyzer.llm.client import LLM, LLMError
from analyzer.llm.preflight_call import TOOL_NAME, build_content, judge, select_frames
from tests.factories import ctx, frame, judgements, text, transcript
from tests.fake_anthropic import FakeAnthropic, response, tool_use

JPEGS = {t: b"\xff\xd8jpeg" for t in [0.0, 0.5, 1.0, 1.5, 2.0, 2.5, 3.0, *range(4, 30)]}


def test_select_frames_keeps_all_hook_frames_and_caps_later():
    times = select_frames(ctx(), JPEGS)
    assert times[:7] == [0.0, 0.5, 1.0, 1.5, 2.0, 2.5, 3.0]
    later = times[7:]
    assert len(later) == 8
    assert later[0] == 4 and later[-1] == 29


def test_every_image_is_preceded_by_its_timestamp():
    content = build_content(ctx(), {0.0: b"a", 12.4: b"b"}, brief=None, brand=None)
    assert content[0] == {"type": "text", "text": "t=0.0s"}
    assert content[1]["type"] == "image"
    assert content[1]["source"]["media_type"] == "image/jpeg"
    assert content[2] == {"type": "text", "text": "t=12.4s"}


def test_context_block_includes_transcript_ocr_brief_and_caption():
    c = ctx(
        frames=[frame(1.0, text("DRY SKIN?"))],
        transcript=transcript((0.2, 1.8, "Stop scrolling")),
        caption_text="my routine #ad",
    )
    details = build_content(c, {0.0: b"a"}, brief="Mention the guarantee", brand="Glow")[-1]["text"]
    assert "[0.2s–1.8s] Stop scrolling" in details
    assert "t=1.0s: DRY SKIN?" in details
    assert "Mention the guarantee" in details
    assert "Brand name: Glow" in details
    assert "my routine #ad" in details


def test_missing_inputs_are_labelled_not_blank():
    details = build_content(ctx(transcript=None), {0.0: b"a"}, brief=None, brand=None)[-1]["text"]
    assert "(no brief provided)" in details
    assert "(no speech detected)" in details
    assert "(not provided)" in details


def test_judge_uses_model_from_env(monkeypatch):
    monkeypatch.setattr(get_settings(), "model_vision", "claude-sonnet-5")
    fake = FakeAnthropic(response(tool_use(TOOL_NAME, judgements().model_dump())))
    result = judge(LLM(client=fake), ctx(), JPEGS, brief=None, brand=None)
    assert result.output.hook_type == "bold_claim"
    assert fake.requests[0]["model"] == "claude-sonnet-5"


def test_judge_without_model_configured_raises(monkeypatch):
    monkeypatch.setattr(get_settings(), "model_vision", None)
    with pytest.raises(LLMError, match="MODEL_VISION"):
        judge(LLM(client=FakeAnthropic()), ctx(), JPEGS, brief=None, brand=None)
