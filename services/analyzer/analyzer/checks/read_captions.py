"""read.captions: are there burned-in captions while people are talking?

Phase 1 proxy: share of frames during detected speech that carry on-screen
text. Phase 2 swaps this for OCR-vs-transcript word overlap.
"""

from analyzer.checks.base import CheckSpec, in_segments, key_text
from analyzer.models import AnalysisContext, CheckResult


def check(ctx: AnalysisContext) -> CheckResult:
    audio, rules = ctx.audio, ctx.rules
    speech_frames = [f for f in ctx.frames or [] if in_segments(f.t, audio.speech_segments)]
    if not speech_frames:
        return CheckResult(
            id="read.captions",
            group="readability",
            status="na",
            severity="info",
            title="No speech to caption",
            explanation="We didn't detect talking, so captions aren't needed.",
            estimate=True,
        )

    with_text = [f for f in speech_frames if key_text(f.ocr, rules)]
    share = len(with_text) / len(speech_frames)
    evidence = {
        "speech_frames": len(speech_frames),
        "speech_frames_with_text": len(with_text),
        "share": round(share, 2),
    }
    if share >= rules.captions_min_frame_frac:
        return CheckResult(
            id="read.captions",
            group="readability",
            status="pass",
            severity="info",
            title="Captions look present",
            explanation=f"On-screen text appears in {share:.0%} of the frames where you're talking.",
            evidence=evidence,
            estimate=True,
        )
    first_uncaptioned = next(f for f in speech_frames if f not in with_text)
    return CheckResult(
        id="read.captions",
        group="readability",
        status="warn",
        severity="medium",
        title="Missing captions",
        explanation=(
            f"Only {share:.0%} of the frames where you're talking have on-screen text. "
            "Most people watch ads muted."
        ),
        fix="Add burned-in captions for the spoken parts (CapCut's auto-captions work well).",
        timestamp_s=first_uncaptioned.t,
        evidence={**evidence, "frame_key": first_uncaptioned.key},
        estimate=True,
    )


SPEC = CheckSpec("read.captions", "readability", check, needs=("ocr", "audio"), estimate=True)
