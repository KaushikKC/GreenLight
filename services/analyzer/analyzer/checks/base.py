"""Shared helpers for checks. Every check is a pure function of AnalysisContext."""

import re
from collections.abc import Callable, Iterable
from dataclasses import dataclass

from analyzer.models import AnalysisContext, CheckResult, Frame, Group, OcrBox
from analyzer.rules import Region, Rules

CheckFn = Callable[[AnalysisContext], CheckResult]


@dataclass(frozen=True)
class CheckSpec:
    id: str
    group: Group
    fn: CheckFn
    # AnalysisContext fields that must be present; if a pipeline step failed
    # and left one as None, the check reports "couldn't check" instead of running.
    needs: tuple[str, ...] = ()
    estimate: bool = False


def fmt_t(t: float) -> str:
    return f"{t:.1f}s"


def key_text(boxes: Iterable[OcrBox], rules: Rules) -> list[OcrBox]:
    """OCR boxes worth judging: confident and more than a stray character."""
    return [
        b
        for b in boxes
        if b.confidence >= rules.ocr_min_confidence and len(b.text.strip()) >= rules.ocr_min_chars
    ]


def frames_with_text(frames: list[Frame], rules: Rules) -> list[tuple[Frame, list[OcrBox]]]:
    out = []
    for f in frames:
        boxes = key_text(f.ocr, rules)
        if boxes:
            out.append((f, boxes))
    return out


def overlap_fraction(box: tuple[float, float, float, float], region: Region) -> float:
    """Share of the OCR box's area that falls inside the region (0..1)."""
    x, y, w, h = box
    ix = max(0.0, min(x + w, region.x + region.w) - max(x, region.x))
    iy = max(0.0, min(y + h, region.y + region.h) - max(y, region.y))
    area = w * h
    return (ix * iy) / area if area > 0 else 0.0


def in_segments(t: float, segments: list[tuple[float, float]]) -> bool:
    return any(start <= t <= end for start, end in segments)


def find_phrase(text: str | None, phrases: Iterable[str]) -> str | None:
    """First phrase or #tag found as a whole word/tag (case-insensitive).

    "#ad" matches "#ad" and "#AD," but not "#adventure"; "try it" doesn't match "entry item".
    """
    if not text:
        return None
    lowered = text.lower()
    for phrase in phrases:
        if re.search(rf"(?<![\w#]){re.escape(phrase.lower())}(?!\w)", lowered):
            return phrase
    return None


AI_UNAVAILABLE = " (AI review unavailable, so this is based on automatic checks only.)"
