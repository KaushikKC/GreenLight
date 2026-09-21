"""audio.voice_clarity: is the voice clear of background music? Heuristic."""

from analyzer.checks.base import CheckSpec
from analyzer.models import AnalysisContext, CheckResult


def check(ctx: AnalysisContext) -> CheckResult:
    a = ctx.audio
    if not ctx.probe.has_audio or not a.speech_segments or a.voice_band_ratio is None:
        return CheckResult(
            id="audio.voice_clarity",
            group="audio",
            status="na",
            severity="info",
            title="No speech detected",
            explanation="We didn't detect talking, so voice clarity doesn't apply.",
            estimate=True,
        )
    ratio, floor = a.voice_band_ratio, ctx.rules.voice_band_ratio_min
    evidence = {"voice_band_ratio": round(ratio, 2), "min": floor}
    if ratio >= floor:
        return CheckResult(
            id="audio.voice_clarity",
            group="audio",
            status="pass",
            severity="info",
            title="Voice is clear",
            explanation="Your voice stands out clearly from any background sound.",
            evidence=evidence,
            estimate=True,
        )
    first = a.speech_segments[0][0]
    return CheckResult(
        id="audio.voice_clarity",
        group="audio",
        status="warn",
        severity="medium",
        title="Voice may be buried",
        explanation="Background sound seems to compete with your voice while you're talking.",
        fix="Duck the music by 10–15 dB under your voice, or record closer to the mic.",
        timestamp_s=first,
        evidence=evidence,
        estimate=True,
    )


SPEC = CheckSpec("audio.voice_clarity", "audio", check, needs=("audio",), estimate=True)
