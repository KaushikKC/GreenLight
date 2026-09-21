"""read.text_size: is on-screen text big enough to read on a phone?"""

from analyzer.checks.base import CheckSpec, fmt_t, frames_with_text
from analyzer.models import AnalysisContext, CheckResult


def check(ctx: AnalysisContext) -> CheckResult:
    rules = ctx.rules
    hits = frames_with_text(ctx.frames or [], rules)
    if not hits:
        return CheckResult(
            id="read.text_size",
            group="readability",
            status="na",
            severity="info",
            title="No on-screen text",
            explanation="There's no on-screen text to size-check.",
        )

    small = [(f, b) for f, boxes in hits for b in boxes if b.box[3] < rules.text_min_height_frac]
    if not small:
        return CheckResult(
            id="read.text_size",
            group="readability",
            status="pass",
            severity="info",
            title="Text is readable",
            explanation="All on-screen text is large enough to read on a phone.",
        )

    frame, box = min(small, key=lambda fb: fb[1].box[3])
    pct = box.box[3] * 100
    return CheckResult(
        id="read.text_size",
        group="readability",
        status="warn",
        severity="medium",
        title="Some text is too small",
        explanation=(
            f"“{box.text}” at {fmt_t(frame.t)} is only {pct:.1f}% of the frame height, "
            "which is hard to read on a phone."
        ),
        fix=f"Make text at least {rules.text_min_height_frac * 100:.1f}% of the frame height (roughly 48px+ on a 1920px-tall video).",
        timestamp_s=frame.t,
        evidence={
            "frame_key": frame.key,
            "box": list(box.box),
            "text": box.text,
            "small_count": len(small),
        },
    )


SPEC = CheckSpec("read.text_size", "readability", check, needs=("ocr",))
