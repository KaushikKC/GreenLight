"""hook.visual_product: is the product or brand visible by 3s? (LLM-judged)"""

from analyzer.checks.base import CheckSpec, fmt_t
from analyzer.models import AnalysisContext, CheckResult


def check(ctx: AnalysisContext) -> CheckResult:
    j, window = ctx.llm, ctx.rules.hook_window_s
    evidence = {"evidence": j.product_visibility_evidence, "first_visible_s": j.product_first_visible_s}
    if not j.product_identified:
        return CheckResult(
            id="hook.visual_product",
            group="hook",
            status="na",
            severity="info",
            title="Couldn't tell what's being advertised",
            explanation="We couldn't identify the product. Add the brand name so we can check when it first appears.",
            evidence=evidence,
        )
    t = j.product_first_visible_s
    if t is not None and t <= window:
        return CheckResult(
            id="hook.visual_product",
            group="hook",
            status="pass",
            severity="info",
            title="Product shows up early",
            explanation=f"The product is visible at {fmt_t(t)}: {j.product_visibility_evidence}",
            timestamp_s=t,
            evidence=evidence,
        )
    when = f"doesn't appear until {fmt_t(t)}" if t is not None else "never clearly appears"
    return CheckResult(
        id="hook.visual_product",
        group="hook",
        status="fail",
        severity="high",
        title=f"Product not visible in the first {window:.0f}s",
        explanation=f"The product {when}. Viewers who scroll past early never see what you're promoting.",
        fix=f"Show the product (or its logo) in the first {window:.0f}s, even briefly in hand.",
        timestamp_s=t,
        evidence=evidence,
    )


SPEC = CheckSpec("hook.visual_product", "hook", check, needs=("llm",))
