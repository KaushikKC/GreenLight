"""msg.brief_donts: are any of the brief's don'ts broken? (LLM-judged)"""

from analyzer.checks.base import CheckSpec, couldnt_check, fmt_t
from analyzer.models import AnalysisContext, CheckResult


def check(ctx: AnalysisContext) -> CheckResult:
    if not ctx.brief_text:
        return CheckResult(
            id="msg.brief_donts",
            group="message",
            status="na",
            severity="info",
            title="No brief provided",
            explanation="Paste the brand brief to check its dos and don'ts.",
        )
    if ctx.llm is None:
        return couldnt_check("msg.brief_donts", "message", "The AI review step didn't complete.")
    violations = ctx.llm.brief_violations
    if not violations:
        return CheckResult(
            id="msg.brief_donts",
            group="message",
            status="pass",
            severity="info",
            title="No brief rules broken",
            explanation="Nothing in the video goes against the brief's don'ts.",
        )
    first = min(
        violations, key=lambda v: v.timestamp_s if v.timestamp_s is not None else float("inf")
    )
    where = f" at {fmt_t(first.timestamp_s)}" if first.timestamp_s is not None else ""
    return CheckResult(
        id="msg.brief_donts",
        group="message",
        status="fail",
        severity="high",
        title=f"Breaks {len(violations)} brief rule(s)",
        explanation=f"The brief says “{first.rule}”, but{where}: {first.evidence}"
        + (f" (+{len(violations) - 1} more)" if len(violations) > 1 else ""),
        fix="Re-record or cut the parts that break the brief. Brands reject these outright.",
        timestamp_s=first.timestamp_s,
        evidence={"violations": [v.model_dump() for v in violations]},
    )


SPEC = CheckSpec("msg.brief_donts", "message", check)
