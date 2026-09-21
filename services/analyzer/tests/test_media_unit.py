import numpy as np
import pytest

from analyzer.media.audio import (
    FRAME_LEN,
    SAMPLE_RATE,
    flags_to_segments,
    parse_ebur128,
    voice_band_ratio,
)
from analyzer.media.frames import sample_timestamps
from analyzer.media.ocr import quad_to_box
from analyzer.media.probe import ProbeError, parse_ffprobe


def ffprobe_json(w=1080, h=1920, rotation=None, audio=True, rate="30000/1001", duration="12.5"):
    video = {
        "codec_type": "video",
        "codec_name": "h264",
        "width": w,
        "height": h,
        "avg_frame_rate": rate,
    }
    if rotation is not None:
        video["side_data_list"] = [{"rotation": rotation}]
    streams = [video] + ([{"codec_type": "audio"}] if audio else [])
    return {"streams": streams, "format": {"duration": duration}}


class TestProbe:
    def test_basic_fields(self):
        p = parse_ffprobe(ffprobe_json())
        assert (p.width, p.height, p.duration_s, p.has_audio) == (1080, 1920, 12.5, True)
        assert p.fps == pytest.approx(29.97)

    def test_rotation_swaps_display_size(self):
        p = parse_ffprobe(ffprobe_json(w=1920, h=1080, rotation=-90))
        assert (p.width, p.height, p.rotation) == (1080, 1920, 270)

    def test_legacy_rotate_tag(self):
        data = ffprobe_json(w=1920, h=1080)
        data["streams"][0]["tags"] = {"rotate": "90"}
        assert parse_ffprobe(data).width == 1080

    def test_no_audio(self):
        assert parse_ffprobe(ffprobe_json(audio=False)).has_audio is False

    def test_no_video_stream_raises(self):
        with pytest.raises(ProbeError):
            parse_ffprobe({"streams": [{"codec_type": "audio"}], "format": {"duration": "3"}})

    def test_zero_duration_raises(self):
        with pytest.raises(ProbeError):
            parse_ffprobe(ffprobe_json(duration="0"))


class TestSampleTimestamps:
    def test_hook_at_2fps_and_tail(self):
        ts = sample_timestamps(30.0, [])
        assert ts[:7] == [0.0, 0.5, 1.0, 1.5, 2.0, 2.5, 3.0]
        assert ts[-3:] == [28.0, 29.0, 29.95]

    def test_adds_scene_cuts_between_hook_and_tail(self):
        ts = sample_timestamps(30.0, [1.0, 8.2, 15.5, 29.5])
        assert 8.2 in ts and 15.5 in ts
        assert 29.5 not in ts  # inside the tail window

    def test_caps_cut_frames_at_12(self):
        cuts = [3.5 + i * 0.5 for i in range(40)]
        ts = sample_timestamps(30.0, cuts)
        assert len([t for t in ts if 3.0 < t < 28.0]) == 12

    def test_short_video_stays_in_bounds_without_dupes(self):
        ts = sample_timestamps(2.0, [])
        assert max(ts) <= 1.95
        assert ts == sorted(set(ts))


def test_quad_to_box_normalises_and_clamps():
    quad = [[-10, 100], [540, 100], [540, 200], [-10, 200]]
    assert quad_to_box(quad, 1080, 1920) == (0.0, 0.0521, 0.5, 0.0521)


def test_parse_ebur128_summary():
    stderr = """[Parsed_ebur128_0] t: 1 ... I: -30.0 LUFS
[Parsed_ebur128_0 @ 0x1] Summary:

  Integrated loudness:
    I:         -21.7 LUFS
    Threshold: -31.7 LUFS

  True peak:
    Peak:      -18.1 dBFS
"""
    assert parse_ebur128(stderr) == (-21.7, -18.1)


def test_parse_ebur128_silence():
    assert parse_ebur128("Summary:\n I: -inf LUFS\n True peak:\n Peak: -inf dBFS") == (None, None)


def test_flags_to_segments_merges_gaps_and_drops_blips():
    flags = np.array([1] * 10 + [0] * 5 + [1] * 10 + [0] * 30 + [1] * 2, dtype=bool)
    # 0.30s speech, 0.15s gap (merged), 0.30s speech; the final 0.06s blip is dropped
    assert flags_to_segments(flags) == [(0.0, 0.75)]


def _tone(*freqs: float, n_frames: int = 20) -> np.ndarray:
    t = np.arange(FRAME_LEN * n_frames) / SAMPLE_RATE
    wave = sum(np.sin(2 * np.pi * f * t) for f in freqs)
    return (wave / len(freqs) * 10000).astype(np.int16).reshape(n_frames, FRAME_LEN)


def test_voice_band_ratio_high_for_voice_band_tone():
    assert voice_band_ratio(_tone(1000)) > 0.95


def test_voice_band_ratio_low_for_bass_and_highs():
    assert voice_band_ratio(_tone(80, 6000)) < 0.1


def test_voice_band_ratio_empty():
    assert voice_band_ratio(np.zeros((0, FRAME_LEN), dtype=np.int16)) is None


def test_unreadable_file_gives_plain_message(tmp_path):
    from analyzer.media.probe import probe

    bad = tmp_path / "bad.mp4"
    bad.write_text("not a video")
    with pytest.raises(ProbeError) as exc:
        probe(bad)
    assert str(tmp_path) not in str(exc.value)
    assert "MP4 or MOV" in str(exc.value)
