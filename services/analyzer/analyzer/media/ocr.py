"""On-screen text with normalised boxes (RapidOCR, onnxruntime)."""

from functools import lru_cache

import numpy as np
from rapidocr_onnxruntime import RapidOCR

from analyzer.models import OcrBox


@lru_cache(maxsize=1)
def _engine() -> RapidOCR:
    return RapidOCR()


def quad_to_box(quad: list[list[float]], width: int, height: int) -> tuple[float, float, float, float]:
    """Axis-aligned [x, y, w, h] (fractions of the frame) around an OCR quadrilateral."""
    xs = [p[0] for p in quad]
    ys = [p[1] for p in quad]
    x0, x1 = max(min(xs), 0), min(max(xs), width)
    y0, y1 = max(min(ys), 0), min(max(ys), height)
    return (
        round(x0 / width, 4),
        round(y0 / height, 4),
        round((x1 - x0) / width, 4),
        round((y1 - y0) / height, 4),
    )


def read_text(bgr: np.ndarray) -> list[OcrBox]:
    height, width = bgr.shape[:2]
    result, _ = _engine()(bgr)
    return [
        OcrBox(text=text, confidence=round(float(score), 3), box=quad_to_box(quad, width, height))
        for quad, text, score in result or []
    ]
