"""format.aspect: is the video vertical 9:16?"""

from analyzer.checks.base import CheckSpec
from analyzer.models import AnalysisContext, CheckResult


def check(ctx: AnalysisContext) -> CheckResult:
    p, r = ctx.probe, ctx.rules
    ratio = p.width / p.height
    deviation = abs(ratio - r.aspect_target) / r.aspect_target
    evidence = {"width": p.width, "height": p.height, "ratio": round(ratio, 4)}
    if deviation <= r.aspect_tolerance:
        return CheckResult(
            id="format.aspect",
            group="format",
            status="pass",
            severity="info",
            title="Vertical 9:16",
            explanation=f"Your video is {p.width}×{p.height}, which is 9:16.",
            evidence=evidence,
        )
    shape = "horizontal" if ratio > 1 else "square-ish" if ratio > 0.8 else "not quite 9:16"
    return CheckResult(
        id="format.aspect",
        group="format",
        status="warn",
        severity="high",
        title="Video isn't 9:16",
        explanation=(
            f"Your video is {p.width}×{p.height} ({shape}). TikTok and Reels ads fill the "
            "screen at 9:16; other shapes get letterboxed or cropped."
        ),
        fix="Re-export at 1080×1920 (9:16), keeping key content away from the edges.",
        evidence=evidence,
    )


SPEC = CheckSpec("format.aspect", "format", check)
