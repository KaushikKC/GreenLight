"""ffprobe → duration, display size (rotation applied), fps, audio presence."""

import json
import subprocess
from fractions import Fraction
from pathlib import Path

from analyzer.models import Probe


class ProbeError(Exception):
    pass


def _fps(rate: str | None) -> float:
    try:
        value = float(Fraction(rate)) if rate else 0.0
    except (ValueError, ZeroDivisionError):
        return 0.0
    return round(value, 3)


def _rotation(stream: dict) -> int:
    for sd in stream.get("side_data_list", []):
        if "rotation" in sd:
            return int(sd["rotation"]) % 360
    rotate = stream.get("tags", {}).get("rotate")
    return int(rotate) % 360 if rotate else 0


def parse_ffprobe(data: dict) -> Probe:
    streams = data.get("streams", [])
    video = next((s for s in streams if s.get("codec_type") == "video"), None)
    if video is None:
        raise ProbeError("No video stream found. Is this a video file?")

    duration = float(data.get("format", {}).get("duration") or video.get("duration") or 0)
    if duration <= 0:
        raise ProbeError("Couldn't read the video's duration.")

    w, h = int(video["width"]), int(video["height"])
    rotation = _rotation(video)
    if rotation in (90, 270):
        w, h = h, w

    return Probe(
        duration_s=round(duration, 3),
        width=w,
        height=h,
        fps=_fps(video.get("avg_frame_rate")) or _fps(video.get("r_frame_rate")),
        rotation=rotation,
        has_audio=any(s.get("codec_type") == "audio" for s in streams),
        video_codec=video.get("codec_name"),
    )


def probe(path: Path) -> Probe:
    proc = subprocess.run(
        [
            "ffprobe",
            "-v",
            "error",
            "-print_format",
            "json",
            "-show_streams",
            "-show_format",
            str(path),
        ],
        capture_output=True,
        text=True,
        timeout=60,
        check=False,
    )
    if proc.returncode != 0:
        raise ProbeError(f"ffprobe couldn't read this file: {proc.stderr.strip()[:300]}")
    return parse_ffprobe(json.loads(proc.stdout))
