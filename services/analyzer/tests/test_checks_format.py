from analyzer.checks import format_aspect, format_duration, format_resolution
from tests.factories import ctx, probe


class TestAspect:
    def test_exact_9_16_passes(self):
        assert format_aspect.check(ctx()).status == "pass"

    def test_within_tolerance_passes(self):
        assert format_aspect.check(ctx(probe=probe(width=1080, height=1900))).status == "pass"

    def test_horizontal_warns_with_fix(self):
        r = format_aspect.check(ctx(probe=probe(width=1920, height=1080)))
        assert r.status == "warn"
        assert "horizontal" in r.explanation
        assert r.fix

    def test_square_warns(self):
        assert format_aspect.check(ctx(probe=probe(width=1080, height=1080))).status == "warn"


class TestResolution:
    def test_1080p_passes(self):
        assert format_resolution.check(ctx()).status == "pass"

    def test_720p_warns(self):
        r = format_resolution.check(ctx(probe=probe(width=720, height=1280)))
        assert r.status == "warn"

    def test_below_720_fails(self):
        r = format_resolution.check(ctx(probe=probe(width=540, height=960)))
        assert r.status == "fail"
        assert r.severity == "high"

    def test_uses_short_side_for_landscape(self):
        r = format_resolution.check(ctx(probe=probe(width=1920, height=1080)))
        assert r.status == "pass"


class TestDuration:
    def test_short_passes(self):
        assert format_duration.check(ctx()).status == "pass"

    def test_exactly_at_limit_passes(self):
        assert format_duration.check(ctx(probe=probe(duration_s=60))).status == "pass"

    def test_long_warns(self):
        r = format_duration.check(ctx(probe=probe(duration_s=95)))
        assert r.status == "warn"
        assert "95.0s" in r.explanation
