"""Builders for check tests. Uses the shipped rules file (TikTok unless stated)."""

from analyzer.models import AnalysisContext, AudioStats, Frame, OcrBox, Probe
from analyzer.rules import load_rules


def probe(**kw) -> Probe:
    base = dict(duration_s=30.0, width=1080, height=1920, fps=30.0, has_audio=True)
    return Probe(**{**base, **kw})


def text(t: str, box=(0.2, 0.4, 0.6, 0.05), confidence=0.95) -> OcrBox:
    return OcrBox(text=t, confidence=confidence, box=box)


def frame(t: float, *boxes: OcrBox, blur=500.0, luma=120.0) -> Frame:
    return Frame(t=t, key=f"frames/{t:.2f}.jpg", blur=blur, luma=luma, ocr=list(boxes), ocr_ok=True)


def ctx(platform="tiktok", **kw) -> AnalysisContext:
    base = dict(
        rules=load_rules(platform),
        probe=probe(),
        frames=[frame(t) for t in (0.0, 0.5, 1.0, 1.5, 2.0, 2.5, 3.0)],
        scene_cuts=[],
        audio=AudioStats(integrated_lufs=-14, true_peak_dbtp=-2, speech_ratio=0.6),
    )
    return AnalysisContext(**{**base, **kw})
