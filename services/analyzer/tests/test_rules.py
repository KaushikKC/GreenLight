from analyzer.rules import load_rules

RAW = {
    "defaults": {
        "_todo_verify": ["x"],
        "aspect_target": 0.5625,
        "aspect_tolerance": 0.02,
        "resolution_warn_short_side": 1080,
        "resolution_fail_short_side": 720,
        "duration_warn_s": 60,
        "max_duration_s": 180,
        "max_upload_bytes": 1,
        "hook_window_s": 3,
        "hook_text_window_s": 2,
        "hook_speech_start_s": 1.5,
        "hook_strength_min": 3,
        "cta_window_s": 5,
        "cta_phrases": ["shop now"],
        "disclosure_tags": ["#ad"],
        "disclosure_phrases": ["paid partnership"],
        "ocr_min_confidence": 0.6,
        "ocr_min_chars": 3,
        "safe_zone_min_overlap": 0.3,
        "text_min_height_frac": 0.025,
        "captions_min_frame_frac": 0.5,
        "loudness_lufs_range": [-18, -10],
        "true_peak_max_dbtp": -1,
        "music_warn_ratio": 0.25,
        "voice_band_ratio_min": 0.6,
        "blur_laplacian_min": 100,
        "blur_min_detail_std": 12,
        "blur_warn_frame_frac": 0.3,
        "lighting_min_luma": 60,
        "lighting_warn_frame_frac": 0.3,
    },
    "tiktok": {
        "safe_zones_note": "x",
        "unsafe_regions": [{"name": "a", "x": 0, "y": 0, "w": 1, "h": 0.1}],
        "duration_warn_s": 60,
        "loudness_lufs_range": [-20, -12],
    },
    "reels": {
        "unsafe_regions": [{"name": "b", "x": 0, "y": 0.7, "w": 1, "h": 0.3}],
        "duration_warn_s": 90,
        "loudness_lufs_range": [-16, -8],
    },
}


def test_single_platform_uses_its_overrides():
    rules = load_rules("reels", RAW)
    assert rules.duration_warn_s == 90
    assert [r.name for r in rules.unsafe_regions] == ["b"]
    assert rules.unsafe_regions[0].platform == "reels"


def test_both_takes_union_of_regions():
    rules = load_rules("both", RAW)
    assert {(r.platform, r.name) for r in rules.unsafe_regions} == {("tiktok", "a"), ("reels", "b")}


def test_both_takes_stricter_limits():
    rules = load_rules("both", RAW)
    assert rules.duration_warn_s == 60
    assert rules.loudness_lufs_range == (-16, -12)


def test_shipped_rules_file_loads_for_every_platform():
    for p in ("tiktok", "reels", "both"):
        rules = load_rules(p)
        assert rules.unsafe_regions
