"""msg.brief_points: is every talking point from the brief covered? (LLM-judged)"""

from analyzer.checks.base import CheckSpec, fmt_t
from analyzer.models import AnalysisContext, CheckResult


def check(ctx: AnalysisContext) -> CheckResult:
    if not ctx.brief_text:
        return CheckResult(
            id="msg.brief_points",
            group="message",
            status="na",
            severity="info",
            title="No brief provided",
            explanation="Paste the brand brief to check that every talking point is covered.",
        )
    points = ctx.llm.brief_points
    evidence = {"points": [p.model_dump() for p in points]}
    if not points:
        return CheckResult(
            id="msg.brief_points",
            group="message",
            status="na",
            severity="info",
            title="No talking points found in the brief",
            explanation="We couldn't find specific talking points in the brief to check against.",
            evidence=evidence,
        )

    missing = [p for p in points if not p.covered]
    missing_required = [p for p in missing if p.mandatory]
    covered = len(points) - len(missing)
    if not missing:
        return CheckResult(
            id="msg.brief_points",
            group="message",
            status="pass",
            severity="info",
            title=f"All {len(points)} brief points covered",
            explanation="; ".join(
                f"“{p.point}” at {fmt_t(p.timestamp_s)}" if p.timestamp_s is not None else f"“{p.point}”"
                for p in points
            )
            + ".",
            evidence=evidence,
        )

    names = ", ".join(f"“{p.point}”" for p in (missing_required or missing))
    status = "fail" if missing_required else "warn"
    return CheckResult(
        id="msg.brief_points",
        group="message",
        status=status,
        severity="high" if status == "fail" else "low",
        title=(
            f"Missing {len(missing_required)} required brief point(s)"
            if missing_required
            else f"Missing {len(missing)} optional brief point(s)"
        ),
        explanation=f"Covered {covered} of {len(points)}. Not covered: {names}.",
        fix=f"Add a line covering {names}. Saying it out loud and showing it as text both count.",
        evidence=evidence,
    )


SPEC = CheckSpec("msg.brief_points", "message", check, needs=("llm",))
