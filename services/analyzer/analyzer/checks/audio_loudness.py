"""audio.loudness: integrated loudness (LUFS) and clipping (true peak)."""

from analyzer.checks.base import CheckSpec
from analyzer.models import AnalysisContext, CheckResult


def check(ctx: AnalysisContext) -> CheckResult:
    if not ctx.probe.has_audio:
        return CheckResult(
            id="audio.loudness",
            group="audio",
            status="warn",
            severity="medium",
            title="No audio track",
            explanation="This video has no sound. Silent ads can work, but most perform better with a voice or music.",
            fix="Add a voiceover or licensed music, or make sure captions carry the whole message.",
        )

    a, rules = ctx.audio, ctx.rules
    lo, hi = rules.loudness_lufs_range
    lufs, peak = a.integrated_lufs, a.true_peak_dbtp
    evidence = {"integrated_lufs": lufs, "true_peak_dbtp": peak, "target_lufs": [lo, hi]}
    problems: list[str] = []
    fixes: list[str] = []

    if lufs is not None and lufs < lo:
        problems.append(f"it's quiet ({lufs:.1f} LUFS; aim for {lo:.0f} to {hi:.0f})")
        fixes.append(f"Raise the overall volume by about {lo - lufs:.0f} dB")
    elif lufs is not None and lufs > hi:
        problems.append(f"it's loud ({lufs:.1f} LUFS; aim for {lo:.0f} to {hi:.0f})")
        fixes.append(f"Lower the overall volume by about {lufs - hi:.0f} dB")
    if peak is not None and peak > rules.true_peak_max_dbtp:
        problems.append(f"it peaks at {peak:.1f} dBTP, which can distort")
        fixes.append(f"add a limiter so peaks stay under {rules.true_peak_max_dbtp:.0f} dBTP")

    if not problems:
        return CheckResult(
            id="audio.loudness",
            group="audio",
            status="pass",
            severity="info",
            title="Volume is on target",
            explanation=f"Loudness is {lufs:.1f} LUFS with no clipping." if lufs is not None else "No loudness problems found.",
            evidence=evidence,
        )
    return CheckResult(
        id="audio.loudness",
        group="audio",
        status="warn",
        severity="medium",
        title="Volume needs adjusting",
        explanation="Your audio needs work: " + "; ".join(problems) + ".",
        fix=("; ".join(fixes) + ".").capitalize(),
        evidence=evidence,
    )


SPEC = CheckSpec("audio.loudness", "audio", check, needs=("audio",))
