"""format.duration: is the length suited to ads?"""

from analyzer.checks.base import CheckSpec, fmt_t
from analyzer.models import AnalysisContext, CheckResult


def check(ctx: AnalysisContext) -> CheckResult:
    d, limit = ctx.probe.duration_s, ctx.rules.duration_warn_s
    evidence = {"duration_s": round(d, 2), "warn_above_s": limit}
    if d <= limit:
        return CheckResult(
            id="format.duration",
            group="format",
            status="pass",
            severity="info",
            title="Good ad length",
            explanation=f"At {fmt_t(d)} it's within the {limit:.0f}s guideline.",
            evidence=evidence,
        )
    return CheckResult(
        id="format.duration",
        group="format",
        status="warn",
        severity="medium",
        title="Long for an ad",
        explanation=f"At {fmt_t(d)} it's over {limit:.0f}s. Most viewers drop off well before that.",
        fix=f"Trim to under {limit:.0f}s. Cut repeated points and get to the product sooner.",
        evidence=evidence,
    )


SPEC = CheckSpec("format.duration", "format", check)
