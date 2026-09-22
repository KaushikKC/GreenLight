"""msg.claims: risky claims (medical, "cures", guaranteed results). LLM-judged."""

from analyzer.checks.base import CheckSpec, fmt_t
from analyzer.models import AnalysisContext, CheckResult


def check(ctx: AnalysisContext) -> CheckResult:
    claims = ctx.llm.risky_claims
    if not claims:
        return CheckResult(
            id="msg.claims",
            group="message",
            status="pass",
            severity="info",
            title="No risky claims",
            explanation="We didn't spot medical, guaranteed-result or comparative claims.",
        )
    first = min(claims, key=lambda c: c.timestamp_s if c.timestamp_s is not None else float("inf"))
    where = f"At {fmt_t(first.timestamp_s)} you" if first.timestamp_s is not None else "You"
    return CheckResult(
        id="msg.claims",
        group="message",
        status="warn",
        severity="high",
        title=f"{len(claims)} claim(s) a brand may reject",
        explanation=f"{where} say “{first.quote}”. {first.why}"
        + (f" (+{len(claims) - 1} more)" if len(claims) > 1 else ""),
        fix="Soften to personal experience (“my skin felt…”) or cut it. Avoid promises and medical words.",
        timestamp_s=first.timestamp_s,
        evidence={"claims": [c.model_dump() for c in claims]},
    )


SPEC = CheckSpec("msg.claims", "message", check, needs=("llm",))
