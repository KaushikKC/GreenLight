from analyzer.llm.client import LLM
from analyzer.llm.preflight_call import build_content, judge, select_frames
from analyzer.llm.types import Image, Text
from tests.factories import ctx, frame, judgements, text, transcript
from tests.fake_llm import FakeProvider, reply

JPEGS = {t: b"\xff\xd8jpeg" for t in [0.0, 0.5, 1.0, 1.5, 2.0, 2.5, 3.0, *range(4, 30)]}


def test_select_frames_keeps_all_hook_frames_and_caps_later():
    times = select_frames(ctx(), JPEGS)
    assert times[:7] == [0.0, 0.5, 1.0, 1.5, 2.0, 2.5, 3.0]
    later = times[7:]
    assert len(later) == 8
    assert later[0] == 4 and later[-1] == 29


def test_every_image_is_preceded_by_its_timestamp():
    parts = build_content(ctx(), {0.0: b"a", 12.4: b"b"}, brief=None, brand=None)
    assert parts[0] == Text("t=0.0s")
    assert parts[1] == Image(b"a")
    assert parts[2] == Text("t=12.4s")


def test_context_block_includes_transcript_ocr_brief_and_caption():
    c = ctx(
        frames=[frame(1.0, text("DRY SKIN?"))],
        transcript=transcript((0.2, 1.8, "Stop scrolling")),
        caption_text="my routine #ad",
    )
    details = build_content(c, {0.0: b"a"}, brief="Mention the guarantee", brand="Glow")[-1].text
    assert "[0.2s–1.8s] Stop scrolling" in details
    assert "t=1.0s: DRY SKIN?" in details
    assert "Mention the guarantee" in details
    assert "Brand name: Glow" in details
    assert "my routine #ad" in details


def test_missing_inputs_are_labelled_not_blank():
    details = build_content(ctx(transcript=None), {0.0: b"a"}, brief=None, brand=None)[-1].text
    assert "(no brief provided)" in details
    assert "(no speech detected)" in details
    assert "(not provided)" in details


def test_judge_returns_validated_judgements_with_provider_model():
    fake = FakeProvider(reply(judgements().model_dump(mode="json")), vision_model="gemini-x")
    result = judge(LLM(provider=fake), ctx(), JPEGS, brief=None, brand=None)
    assert result.output.hook_type == "bold_claim"
    assert fake.requests[0]["model"] == "gemini-x"
    assert fake.requests[0]["name"] == "record_preflight_judgements"


def test_judge_without_frames_raises():
    import pytest

    from analyzer.llm.errors import LLMError

    with pytest.raises(LLMError, match="No frames"):
        judge(LLM(provider=FakeProvider()), ctx(), {}, brief=None, brand=None)


def test_current_prompt_version_exists_and_is_loadable():
    from analyzer.llm.preflight_call import PROMPT_VERSION
    from analyzer.llm.prompt_loader import load_prompt

    assert PROMPT_VERSION == "preflight_v2"
    assert "record_preflight_judgements" in load_prompt(PROMPT_VERSION)
    assert "separate questions" in load_prompt(PROMPT_VERSION)
