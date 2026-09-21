"""Load platform rules from rules/platforms.json. Nothing here hard-codes a threshold."""

import json
from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic import BaseModel

RULES_PATH = Path(__file__).resolve().parents[1] / "rules" / "platforms.json"

Platform = Literal["tiktok", "reels", "both"]


class Region(BaseModel):
    name: str
    platform: str
    x: float
    y: float
    w: float
    h: float
    status: str | None = None


class Rules(BaseModel):
    platform: Platform
    unsafe_regions: list[Region]

    aspect_target: float
    aspect_tolerance: float
    resolution_warn_short_side: int
    resolution_fail_short_side: int
    duration_warn_s: float
    max_duration_s: float
    max_upload_bytes: int

    hook_window_s: float
    hook_text_window_s: float

    ocr_min_confidence: float
    ocr_min_chars: int
    safe_zone_min_overlap: float
    text_min_height_frac: float
    captions_min_frame_frac: float

    loudness_lufs_range: tuple[float, float]
    true_peak_max_dbtp: float
    music_warn_ratio: float
    voice_band_ratio_min: float

    blur_laplacian_min: float
    blur_warn_frame_frac: float
    lighting_min_luma: float
    lighting_warn_frame_frac: float


@lru_cache
def _raw(path: Path = RULES_PATH) -> dict:
    return json.loads(path.read_text())


def _strip_meta(d: dict) -> dict:
    return {k: v for k, v in d.items() if not k.startswith("_") and k != "safe_zones_note"}


def _platform_values(raw: dict, name: str) -> tuple[dict, list[Region]]:
    section = _strip_meta(raw[name])
    regions = [Region(platform=name, **r) for r in section.pop("unsafe_regions", [])]
    return section, regions


def load_rules(platform: Platform, raw: dict | None = None) -> Rules:
    """Defaults merged with platform overrides. For "both", take the stricter
    value of each override and the union of unsafe regions."""
    raw = raw or _raw()
    values = _strip_meta(raw["defaults"])

    if platform == "both":
        t_vals, t_regions = _platform_values(raw, "tiktok")
        r_vals, r_regions = _platform_values(raw, "reels")
        regions = t_regions + r_regions
        for key in set(t_vals) | set(r_vals):
            a, b = t_vals.get(key), r_vals.get(key)
            if a is None or b is None:
                values[key] = a if b is None else b
            elif key == "duration_warn_s":
                values[key] = min(a, b)
            elif key == "loudness_lufs_range":
                values[key] = [max(a[0], b[0]), min(a[1], b[1])]
            else:
                values[key] = a
    else:
        overrides, regions = _platform_values(raw, platform)
        values.update(overrides)

    return Rules(platform=platform, unsafe_regions=regions, **values)
