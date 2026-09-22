"""Check registry and runner."""

import logging

from analyzer.checks import (
    audio_loudness,
    audio_music,
    audio_voice_clarity,
    format_aspect,
    format_duration,
    format_resolution,
    hook_pacing,
    hook_text,
    read_captions,
    read_safe_zone,
    read_text_size,
    tech_blur,
    tech_lighting,
)
from analyzer.checks.base import CheckSpec, couldnt_check
from analyzer.models import AnalysisContext, CheckResult

log = logging.getLogger(__name__)

DETERMINISTIC: list[CheckSpec] = [
    hook_text.SPEC,
    hook_pacing.SPEC,
    format_aspect.SPEC,
    format_resolution.SPEC,
    format_duration.SPEC,
    read_safe_zone.SPEC,
    read_captions.SPEC,
    read_text_size.SPEC,
    audio_loudness.SPEC,
    audio_music.SPEC,
    audio_voice_clarity.SPEC,
    tech_blur.SPEC,
    tech_lighting.SPEC,
]


def _missing(ctx: AnalysisContext, needs: tuple[str, ...]) -> list[str]:
    missing = []
    for need in needs:
        if need == "ocr":
            if not ctx.frames or not any(f.ocr_ok for f in ctx.frames):
                missing.append("ocr")
        elif getattr(ctx, need) is None:
            missing.append(need)
    return missing


def run_checks(ctx: AnalysisContext, specs: list[CheckSpec] = DETERMINISTIC) -> list[CheckResult]:
    results = []
    for spec in specs:
        missing = _missing(ctx, spec.needs)
        if missing:
            results.append(couldnt_check(spec.id, spec.group, f"The {', '.join(missing)} step failed.", spec.estimate))
            continue
        try:
            result = spec.fn(ctx)
        except Exception:  # one broken check must not block the report
            log.exception("check %s crashed", spec.id)
            result = couldnt_check(spec.id, spec.group, "Something went wrong running this check.", spec.estimate)
        results.append(result.model_copy(update={"estimate": result.estimate or spec.estimate}))
    return results
