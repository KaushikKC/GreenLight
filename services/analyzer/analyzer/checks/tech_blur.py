"""tech.blur: blurry frames (Laplacian variance)."""

from analyzer.checks.base import CheckSpec, fmt_t
from analyzer.models import AnalysisContext, CheckResult


def check(ctx: AnalysisContext) -> CheckResult:
    rules = ctx.rules
    measured = [f for f in ctx.frames or [] if f.blur is not None]
    if not measured:
        return CheckResult(
            id="tech.blur",
            group="technical",
            status="error",
            severity="info",
            title="Couldn't check sharpness",
            explanation="No frames could be measured.",
        )
    blurry = [f for f in measured if f.blur < rules.blur_laplacian_min]
    share = len(blurry) / len(measured)
    evidence = {
        "frames_checked": len(measured),
        "blurry_frames": [f.t for f in blurry],
        "threshold": rules.blur_laplacian_min,
    }
    if share < rules.blur_warn_frame_frac:
        return CheckResult(
            id="tech.blur",
            group="technical",
            status="pass",
            severity="info",
            title="Footage is sharp",
            explanation="Most of your frames are in focus.",
            evidence=evidence,
        )
    worst = min(blurry, key=lambda f: f.blur)
    return CheckResult(
        id="tech.blur",
        group="technical",
        status="warn",
        severity="medium",
        title="Some footage is blurry",
        explanation=f"{len(blurry)} of {len(measured)} sampled frames look soft; the worst is at {fmt_t(worst.t)}.",
        fix="Wipe the lens, lock focus on your face or the product, and film in better light to avoid motion blur.",
        timestamp_s=worst.t,
        evidence={**evidence, "frame_key": worst.key},
    )


SPEC = CheckSpec("tech.blur", "technical", check, needs=("frames",))
