"""Check registry and runner."""

import logging

from analyzer.checks import (
    audio_loudness,
    audio_music,
    audio_voice_clarity,
    comp_disclosure,
    format_aspect,
    format_duration,
    format_resolution,
    hook_pacing,
    hook_spoken,
    hook_text,
    hook_visual_product,
    msg_brief_donts,
    msg_brief_points,
    msg_claims,
    msg_cta,
    read_captions,
    read_safe_zone,
    read_text_size,
    tech_blur,
    tech_lighting,
)
from analyzer.checks.base import CheckSpec, couldnt_check
from analyzer.models import AnalysisContext, CheckResult

log = logging.getLogger(__name__)

ALL_CHECKS: list[CheckSpec] = [
    hook_visual_product.SPEC,
    hook_spoken.SPEC,
    hook_text.SPEC,
    hook_pacing.SPEC,
    format_aspect.SPEC,
    format_resolution.SPEC,
    format_duration.SPEC,
    read_safe_zone.SPEC,
    read_captions.SPEC,
    read_text_size.SPEC,
    msg_brief_points.SPEC,
    msg_brief_donts.SPEC,
    msg_cta.SPEC,
    msg_claims.SPEC,
    comp_disclosure.SPEC,
    audio_loudness.SPEC,
    audio_music.SPEC,
    audio_voice_clarity.SPEC,
    tech_blur.SPEC,
    tech_lighting.SPEC,
]


STEP_NAMES = {
    "frames": "frame sampling",
    "ocr": "on-screen text reading",
    "audio": "audio analysis",
    "transcript": "transcription",
    "scene_cuts": "scene detection",
    "llm": "AI review",
}


def _missing(ctx: AnalysisContext, needs: tuple[str, ...]) -> list[str]:
    missing = []
    for need in needs:
        if need == "ocr":
            if not ctx.frames or not any(f.ocr_ok for f in ctx.frames):
                missing.append("ocr")
        elif getattr(ctx, need) is None:
            missing.append(need)
    return missing


def run_checks(ctx: AnalysisContext, specs: list[CheckSpec] = ALL_CHECKS) -> list[CheckResult]:
    results = []
    for spec in specs:
        missing = _missing(ctx, spec.needs)
        if missing:
            results.append(
                couldnt_check(
                    spec.id,
                    spec.group,
                    f"The {' and '.join(STEP_NAMES.get(m, m) for m in missing)} step didn't complete.",
                    spec.estimate,
                )
            )
            continue
        try:
            result = spec.fn(ctx)
        except Exception:  # one broken check must not block the report
            log.exception("check %s crashed", spec.id)
            result = couldnt_check(
                spec.id, spec.group, "Something went wrong running this check.", spec.estimate
            )
        results.append(result.model_copy(update={"estimate": result.estimate or spec.estimate}))
    return results
