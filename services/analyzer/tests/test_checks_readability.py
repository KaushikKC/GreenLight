from analyzer.checks import read_captions, read_safe_zone, read_text_size
from analyzer.models import AudioStats
from tests.factories import ctx, frame, text, transcript

MIDDLE = (0.2, 0.45, 0.6, 0.05)
BOTTOM = (0.1, 0.85, 0.8, 0.06)  # inside TikTok's bottom caption area
RIGHT_RAIL = (0.87, 0.5, 0.12, 0.05)


class TestSafeZone:
    def test_centered_text_passes(self):
        r = read_safe_zone.check(ctx(frames=[frame(1.0, text("Hello there", MIDDLE))]))
        assert r.status == "pass"

    def test_bottom_text_fails_with_frame_and_box(self):
        r = read_safe_zone.check(ctx(frames=[frame(4.0, text("Try it for 30 days", BOTTOM))]))
        assert r.status == "fail"
        assert r.timestamp_s == 4.0
        assert r.evidence["box"] == list(BOTTOM)
        assert r.evidence["frame_key"] == "frames/4.00.jpg"
        assert "caption area" in r.title
        assert "middle third" in r.fix

    def test_right_rail_text_fails(self):
        r = read_safe_zone.check(ctx(frames=[frame(2.0, text("Link below", RIGHT_RAIL))]))
        assert r.status == "fail"
        assert r.evidence["region"]["name"] == "right_action_rail"

    def test_tiny_edge_overlap_is_ignored(self):
        # Only 20% of the box dips into the bottom area (threshold is 30%).
        box = (0.2, 0.74, 0.6, 0.05)
        assert read_safe_zone.check(ctx(frames=[frame(1.0, text("Almost", box))])).status == "pass"

    def test_both_platforms_use_stricter_union(self):
        # y=0.7 is safe on TikTok (starts 0.78) but not on Reels (starts 0.65).
        box = (0.1, 0.7, 0.8, 0.05)
        frames = [frame(1.0, text("Shop now", box))]
        assert read_safe_zone.check(ctx(frames=frames)).status == "pass"
        assert read_safe_zone.check(ctx(platform="both", frames=frames)).status == "fail"

    def test_points_at_earliest_equally_bad_moment(self):
        frames = [frame(5.0, text("Now!", BOTTOM)), frame(1.0, text("Buy", BOTTOM))]
        assert read_safe_zone.check(ctx(frames=frames)).timestamp_s == 1.0

    def test_reports_every_timestamp(self):
        frames = [frame(1.0, text("Buy", BOTTOM)), frame(5.0, text("Now!", BOTTOM))]
        assert read_safe_zone.check(ctx(frames=frames)).evidence["all_timestamps"] == [1.0, 5.0]


class TestCaptions:
    SPEECH = AudioStats(speech_segments=[(0.0, 3.0)], speech_ratio=0.5)

    def test_captioned_speech_passes(self):
        frames = [frame(t, text("words here")) for t in (0.5, 1.5, 2.5)]
        r = read_captions.check(ctx(frames=frames, audio=self.SPEECH))
        assert r.status == "pass"
        assert r.estimate

    def test_uncaptioned_speech_warns_at_first_gap(self):
        frames = [frame(0.5, text("words here")), frame(1.5), frame(2.5)]
        r = read_captions.check(ctx(frames=frames, audio=self.SPEECH))
        assert r.status == "warn"
        assert r.timestamp_s == 1.5

    def test_no_speech_is_na(self):
        r = read_captions.check(ctx(audio=AudioStats()))
        assert r.status == "na"


class TestTextSize:
    def test_no_text_is_na(self):
        assert read_text_size.check(ctx()).status == "na"

    def test_big_text_passes(self):
        frames = [frame(1.0, text("Big headline", (0.1, 0.4, 0.8, 0.06)))]
        assert read_text_size.check(ctx(frames=frames)).status == "pass"

    def test_small_text_warns_with_smallest(self):
        frames = [
            frame(1.0, text("small print", (0.1, 0.4, 0.3, 0.015))),
            frame(2.0, text("tiny print", (0.1, 0.4, 0.3, 0.010))),
        ]
        r = read_text_size.check(ctx(frames=frames))
        assert r.status == "warn"
        assert r.timestamp_s == 2.0
        assert r.evidence["small_count"] == 2


class TestCaptionsWithTranscript:
    SPEECH = transcript((0.0, 3.0, "this serum changed my skin"))

    def test_matching_words_pass(self):
        frames = [frame(1.0, text("this SERUM changed")), frame(2.0, text("my skin"))]
        r = read_captions.check(ctx(frames=frames, transcript=self.SPEECH))
        assert r.status == "pass"
        assert not r.estimate
        assert r.evidence["method"] == "transcript_overlap"

    def test_unrelated_text_is_not_a_caption(self):
        frames = [frame(1.0, text("SUMMER SALE")), frame(2.0, text("SUMMER SALE"))]
        r = read_captions.check(ctx(frames=frames, transcript=self.SPEECH))
        assert r.status == "warn"
        assert r.timestamp_s == 1.0

    def test_empty_transcript_is_na(self):
        from analyzer.models import Transcript

        assert read_captions.check(ctx(transcript=Transcript())).status == "na"

    def test_no_transcript_or_audio_is_error(self):
        assert read_captions.check(ctx(transcript=None, audio=None)).status == "error"
