from analyzer.checks import hook_pacing, hook_text
from tests.factories import ctx, frame, text


class TestPacing:
    def test_is_info_only(self):
        assert hook_pacing.check(ctx(scene_cuts=[1.2, 8.0])).status == "info"

    def test_counts_only_cuts_in_hook_window(self):
        r = hook_pacing.check(ctx(scene_cuts=[0.8, 2.1, 8.0]))
        assert r.evidence["cuts_in_hook"] == [0.8, 2.1]
        assert r.timestamp_s == 0.8

    def test_no_cuts_suggests_movement(self):
        r = hook_pacing.check(ctx(scene_cuts=[]))
        assert r.fix and "cut" in r.fix


class TestHookText:
    def test_text_in_first_two_seconds_passes(self):
        frames = [frame(0.0), frame(0.5, text("Stop scrolling!"))]
        r = hook_text.check(ctx(frames=frames))
        assert r.status == "pass"
        assert r.timestamp_s == 0.5
        assert r.evidence["frame_key"] == "frames/0.50.jpg"

    def test_text_only_after_window_warns(self):
        frames = [frame(0.0), frame(1.5), frame(2.5, text("Too late"))]
        assert hook_text.check(ctx(frames=frames)).status == "warn"

    def test_low_confidence_text_is_ignored(self):
        frames = [frame(0.5, text("blur", confidence=0.2))]
        assert hook_text.check(ctx(frames=frames)).status == "warn"

    def test_stray_characters_are_ignored(self):
        frames = [frame(0.5, text("a"))]
        assert hook_text.check(ctx(frames=frames)).status == "warn"
