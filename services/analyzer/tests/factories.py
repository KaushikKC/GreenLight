"""Builders for check tests. Uses the shipped rules file (TikTok unless stated)."""

from analyzer.llm.judgements import Cta, OnScreenHook, PreflightJudgements, SpokenDisclosure
from analyzer.models import (
    AnalysisContext,
    AudioStats,
    Frame,
    OcrBox,
    Probe,
    Segment,
    Transcript,
    Word,
)
from analyzer.rules import load_rules


def probe(**kw) -> Probe:
    base = {"duration_s": 30.0, "width": 1080, "height": 1920, "fps": 30.0, "has_audio": True}
    return Probe(**{**base, **kw})


def text(t: str, box=(0.2, 0.4, 0.6, 0.05), confidence=0.95) -> OcrBox:
    return OcrBox(text=t, confidence=confidence, box=box)


def frame(t: float, *boxes: OcrBox, blur=500.0, luma=120.0) -> Frame:
    return Frame(t=t, key=f"frames/{t:.2f}.jpg", blur=blur, luma=luma, ocr=list(boxes), ocr_ok=True)


def ctx(platform="tiktok", **kw) -> AnalysisContext:
    base = {
        "rules": load_rules(platform),
        "probe": probe(),
        "frames": [frame(t) for t in (0.0, 0.5, 1.0, 1.5, 2.0, 2.5, 3.0)],
        "scene_cuts": [],
        "audio": AudioStats(integrated_lufs=-14, true_peak_dbtp=-2, speech_ratio=0.6),
    }
    return AnalysisContext(**{**base, **kw})


def judgements(**kw) -> PreflightJudgements:
    base = {
        "product_identified": True,
        "product_first_visible_s": 1.0,
        "product_visibility_evidence": "Serum bottle held up to camera",
        "opening_line": "Stop scrolling if you have dry skin.",
        "hook_type": "bold_claim",
        "hook_strength": 4,
        "hook_reason": "Calls out the viewer's problem directly.",
        "on_screen_hook": OnScreenHook(text="DRY SKIN?", reinforces_hook=True, reason="Repeats the spoken hook."),
        "brief_points": [],
        "brief_violations": [],
        "cta": Cta(present=True, timestamp_s=28.0, quote="Tap the link"),
        "risky_claims": [],
        "spoken_disclosure": SpokenDisclosure(present=False, timestamp_s=None, quote=None),
    }
    return PreflightJudgements(**{**base, **kw})


def transcript(*segments: tuple[float, float, str]) -> Transcript:
    """Segments as (start, end, text); words are spread evenly across each segment."""
    out = []
    for start, end, text in segments:
        tokens = text.split()
        step = (end - start) / max(len(tokens), 1)
        words = [Word(start=start + i * step, end=start + (i + 1) * step, text=w) for i, w in enumerate(tokens)]
        out.append(Segment(start=start, end=end, text=text, words=words))
    return Transcript(language="en", segments=out)
