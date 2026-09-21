"""Scene cuts and frame sampling.

Sampling plan (BUILD_PLAN §6.2): first 3s at 2 fps, one frame per scene cut
after that (max 12), final 2s at 1 fps.
"""

from collections.abc import Iterator
from pathlib import Path

import cv2
import numpy as np
from scenedetect import ContentDetector, detect

HOOK_END_S = 3.0
HOOK_STEP_S = 0.5
MAX_CUT_FRAMES = 12
TAIL_S = 2.0
MIN_GAP_S = 0.25
THUMB_LONG_EDGE = 768
OCR_LONG_EDGE = 1280
JPEG_QUALITY = 85


def detect_scene_cuts(path: Path) -> list[float]:
    """Timestamps (s) where a new scene starts, excluding t=0."""
    scenes = detect(str(path), ContentDetector(), show_progress=False)
    return [round(start.seconds, 3) for start, _ in scenes[1:]]


def _spread(values: list[float], n: int) -> list[float]:
    """Pick n values evenly spread across the list."""
    if len(values) <= n:
        return values
    step = (len(values) - 1) / (n - 1)
    return [values[round(i * step)] for i in range(n)]


def sample_timestamps(duration_s: float, scene_cuts: list[float]) -> list[float]:
    # Stay a little inside the end; seeking to exactly `duration` returns nothing.
    last = max(duration_s - 0.05, 0.0)
    hook = [round(i * HOOK_STEP_S, 2) for i in range(int(HOOK_END_S / HOOK_STEP_S) + 1)]
    cuts = _spread([t for t in scene_cuts if HOOK_END_S < t < duration_s - TAIL_S], MAX_CUT_FRAMES)
    tail = [duration_s - TAIL_S, duration_s - 1.0, last]

    out: list[float] = []
    for t in sorted(min(max(t, 0.0), last) for t in hook + cuts + tail):
        if not out or t - out[-1] >= MIN_GAP_S:
            out.append(round(t, 2))
    return out


def resize_long_edge(img: np.ndarray, long_edge: int) -> np.ndarray:
    h, w = img.shape[:2]
    scale = long_edge / max(h, w)
    if scale >= 1:
        return img
    return cv2.resize(img, (round(w * scale), round(h * scale)), interpolation=cv2.INTER_AREA)


def read_frames(path: Path, timestamps: list[float]) -> Iterator[tuple[float, np.ndarray]]:
    """Yield (t, BGR frame) for each timestamp that could be decoded.

    OpenCV applies the container's rotation metadata, so frames come out upright.
    """
    cap = cv2.VideoCapture(str(path))
    try:
        for t in timestamps:
            cap.set(cv2.CAP_PROP_POS_MSEC, t * 1000)
            ok, frame = cap.read()
            if ok and frame is not None:
                yield t, frame
    finally:
        cap.release()


def encode_jpeg(img: np.ndarray) -> bytes:
    ok, buf = cv2.imencode(".jpg", img, [cv2.IMWRITE_JPEG_QUALITY, JPEG_QUALITY])
    if not ok:
        raise ValueError("JPEG encoding failed")
    return buf.tobytes()
