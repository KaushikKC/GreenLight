"""hook.pacing: scene cuts in the first 3s (info only, not scored)."""

from analyzer.checks.base import CheckSpec, fmt_t
from analyzer.models import AnalysisContext, CheckResult


def check(ctx: AnalysisContext) -> CheckResult:
    window = ctx.rules.hook_window_s
    cuts = [t for t in ctx.scene_cuts or [] if t <= window]
    if cuts:
        explanation = (
            f"{len(cuts)} cut(s) in the first {window:.0f}s, at "
            + ", ".join(fmt_t(t) for t in cuts)
            + "."
        )
        fix = None
    else:
        explanation = f"No cuts in the first {window:.0f}s. A static opening can work if the first line is strong."
        fix = "Consider a quick cut, zoom or movement in the opening seconds to stop the scroll."
    return CheckResult(
        id="hook.pacing",
        group="hook",
        status="info",
        severity="info",
        title="Opening pacing",
        explanation=explanation,
        fix=fix,
        timestamp_s=cuts[0] if cuts else None,
        evidence={"cuts_in_hook": cuts, "window_s": window},
    )


SPEC = CheckSpec("hook.pacing", "hook", check, needs=("scene_cuts",))
