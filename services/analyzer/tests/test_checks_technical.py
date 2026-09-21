from analyzer.checks import tech_blur, tech_lighting
from tests.factories import ctx, frame


class TestBlur:
    def test_sharp_passes(self):
        assert tech_blur.check(ctx()).status == "pass"

    def test_mostly_blurry_warns_at_worst_frame(self):
        frames = [frame(0, blur=20), frame(1, blur=5), frame(2, blur=500)]
        r = tech_blur.check(ctx(frames=frames))
        assert r.status == "warn"
        assert r.timestamp_s == 1
        assert r.evidence["frame_key"] == "frames/1.00.jpg"

    def test_one_soft_frame_in_many_passes(self):
        frames = [frame(t, blur=500) for t in range(9)] + [frame(9, blur=10)]
        assert tech_blur.check(ctx(frames=frames)).status == "pass"

    def test_flat_graphic_frames_are_skipped(self):
        frames = [frame(0, blur=20), frame(1, blur=500)]
        frames[0].detail = 5  # solid-colour slide
        assert tech_blur.check(ctx(frames=frames)).status == "pass"

    def test_all_flat_graphics_is_na(self):
        frames = [frame(0, blur=20), frame(1, blur=30)]
        for f in frames:
            f.detail = 5
        assert tech_blur.check(ctx(frames=frames)).status == "na"

    def test_no_measurements_is_error(self):
        frames = [frame(0, blur=None)]
        assert tech_blur.check(ctx(frames=frames)).status == "error"


class TestLighting:
    def test_bright_passes(self):
        assert tech_lighting.check(ctx()).status == "pass"

    def test_dark_warns_at_darkest(self):
        frames = [frame(0, luma=30), frame(1, luma=12), frame(2, luma=140)]
        r = tech_lighting.check(ctx(frames=frames))
        assert r.status == "warn"
        assert r.timestamp_s == 1
