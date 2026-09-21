"""format.resolution: at least 1080×1920?"""

from analyzer.checks.base import CheckSpec
from analyzer.models import AnalysisContext, CheckResult


def check(ctx: AnalysisContext) -> CheckResult:
    p, r = ctx.probe, ctx.rules
    short = min(p.width, p.height)
    evidence = {"width": p.width, "height": p.height, "short_side": short}
    if short >= r.resolution_warn_short_side:
        return CheckResult(
            id="format.resolution",
            group="format",
            status="pass",
            severity="info",
            title="Full HD or better",
            explanation=f"{p.width}×{p.height} meets the 1080p minimum.",
            evidence=evidence,
        )
    status = "fail" if short < r.resolution_fail_short_side else "warn"
    return CheckResult(
        id="format.resolution",
        group="format",
        status=status,
        severity="high" if status == "fail" else "medium",
        title="Resolution is too low" if status == "fail" else "Resolution is below 1080p",
        explanation=(
            f"Your video is {p.width}×{p.height}. Ads look soft on modern phones below "
            f"{r.resolution_warn_short_side}px wide"
            + (
                f", and under {r.resolution_fail_short_side}px they may be rejected."
                if status == "fail"
                else "."
            )
        ),
        fix="Export at 1080×1920. If you recorded in higher quality, check your editor's export settings.",
        evidence=evidence,
    )


SPEC = CheckSpec("format.resolution", "format", check)
