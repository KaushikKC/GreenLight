from analyzer.checks import hook_spoken, hook_text, hook_visual_product
from analyzer.llm.judgements import OnScreenHook
from analyzer.models import Transcript
from tests.factories import ctx, frame, judgements, text, transcript

SPEECH = transcript((0.4, 2.0, "Stop scrolling if you have dry skin."))


class TestVisualProduct:
    def test_visible_in_hook_passes(self):
        r = hook_visual_product.check(ctx(llm=judgements(product_first_visible_s=1.5)))
        assert r.status == "pass"
        assert r.timestamp_s == 1.5

    def test_late_product_fails(self):
        r = hook_visual_product.check(ctx(llm=judgements(product_first_visible_s=7.0)))
        assert r.status == "fail"
        assert "7.0s" in r.explanation

    def test_never_visible_fails(self):
        r = hook_visual_product.check(ctx(llm=judgements(product_first_visible_s=None)))
        assert r.status == "fail"
        assert "never" in r.explanation

    def test_unknown_product_is_na(self):
        r = hook_visual_product.check(
            ctx(llm=judgements(product_identified=False, product_first_visible_s=None))
        )
        assert r.status == "na"


class TestSpoken:
    def test_fast_strong_hook_passes(self):
        r = hook_spoken.check(ctx(transcript=SPEECH, llm=judgements()))
        assert r.status == "pass"
        assert r.timestamp_s == 0.4
        assert "bold claim" in r.explanation

    def test_late_start_warns(self):
        late = transcript((2.6, 4.0, "Hi guys so today"))
        r = hook_spoken.check(ctx(transcript=late, llm=judgements()))
        assert r.status == "warn"
        assert "2.6s" in r.explanation

    def test_weak_hook_warns(self):
        r = hook_spoken.check(
            ctx(transcript=SPEECH, llm=judgements(hook_strength=2, hook_reason="Generic greeting"))
        )
        assert r.status == "warn"
        assert "Generic greeting" in r.explanation

    def test_late_and_weak_fails(self):
        late = transcript((3.0, 4.0, "Hi guys"))
        r = hook_spoken.check(
            ctx(transcript=late, llm=judgements(hook_type="none", hook_strength=1))
        )
        assert r.status == "fail"

    def test_no_speech_is_na(self):
        assert hook_spoken.check(ctx(transcript=Transcript())).status == "na"

    def test_without_llm_judges_timing_only(self):
        r = hook_spoken.check(ctx(transcript=SPEECH, llm=None))
        assert r.status == "pass"
        assert "AI review unavailable" in r.explanation


HOOK_FRAMES = [frame(0.5, text("DRY SKIN?"))]


class TestHookTextWithLlm:
    def test_reinforcing_text_passes(self):
        assert hook_text.check(ctx(frames=HOOK_FRAMES, llm=judgements())).status == "pass"

    def test_distracting_text_warns(self):
        j = judgements(
            on_screen_hook=OnScreenHook(
                text="DRY SKIN?", reinforces_hook=False, reason="Unrelated to the spoken hook."
            )
        )
        r = hook_text.check(ctx(frames=HOOK_FRAMES, llm=j))
        assert r.status == "warn"
        assert "Unrelated" in r.explanation
