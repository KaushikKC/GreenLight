"""tech.lighting: underexposed frames (mean luma)."""

from analyzer.checks.base import CheckSpec, fmt_t
from analyzer.models import AnalysisContext, CheckResult


def check(ctx: AnalysisContext) -> CheckResult:
    rules = ctx.rules
    measured = [f for f in ctx.frames or [] if f.luma is not None]
    if not measured:
        return CheckResult(
            id="tech.lighting",
            group="technical",
            status="error",
            severity="info",
            title="Couldn't check lighting",
            explanation="No frames could be measured.",
        )
    dark = [f for f in measured if f.luma < rules.lighting_min_luma]
    share = len(dark) / len(measured)
    evidence = {
        "frames_checked": len(measured),
        "dark_frames": [f.t for f in dark],
        "threshold": rules.lighting_min_luma,
    }
    if share < rules.lighting_warn_frame_frac:
        return CheckResult(
            id="tech.lighting",
            group="technical",
            status="pass",
            severity="info",
            title="Well lit",
            explanation="Your footage is bright enough throughout.",
            evidence=evidence,
        )
    darkest = min(dark, key=lambda f: f.luma)
    return CheckResult(
        id="tech.lighting",
        group="technical",
        status="warn",
        severity="medium",
        title="Too dark in places",
        explanation=f"{len(dark)} of {len(measured)} sampled frames are underexposed; the darkest is at {fmt_t(darkest.t)}.",
        fix="Face a window or add a ring light. Avoid strong light behind you.",
        timestamp_s=darkest.t,
        evidence={**evidence, "frame_key": darkest.key},
    )


SPEC = CheckSpec("tech.lighting", "technical", check, needs=("frames",))
