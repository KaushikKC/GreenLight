"""audio.music: music detected → ask whether it's original or licensed. Heuristic."""

from analyzer.checks.base import CheckSpec
from analyzer.models import AnalysisContext, CheckResult


def check(ctx: AnalysisContext) -> CheckResult:
    if not ctx.probe.has_audio:
        return CheckResult(
            id="audio.music",
            group="audio",
            status="na",
            severity="info",
            title="No audio",
            explanation="No audio track, so no music to check.",
            estimate=True,
        )
    ratio = ctx.audio.music_ratio
    evidence = {"music_ratio": round(ratio, 2), "warn_above": ctx.rules.music_warn_ratio}
    if ratio < ctx.rules.music_warn_ratio:
        return CheckResult(
            id="audio.music",
            group="audio",
            status="pass",
            severity="info",
            title="Little or no background music",
            explanation="We didn't detect much music, so there's likely no licensing issue.",
            evidence=evidence,
            estimate=True,
        )
    return CheckResult(
        id="audio.music",
        group="audio",
        status="warn",
        severity="medium",
        title="Is this music licensed for ads?",
        explanation=(
            f"Music seems to play for about {ratio:.0%} of the video. Trending sounds from the "
            "app's library usually aren't cleared for paid ads."
        ),
        fix="Confirm the track is original or commercially licensed (e.g. TikTok Commercial Music Library). If not, swap it.",
        evidence=evidence,
        estimate=True,
    )


SPEC = CheckSpec("audio.music", "audio", check, needs=("audio",), estimate=True)
