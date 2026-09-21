"""hook.text: on-screen text in the first 2s.

Deterministic part only. Phase 2 adds an LLM judgement of whether the text
reinforces the hook.
"""

from analyzer.checks.base import CheckSpec, fmt_t, frames_with_text
from analyzer.models import AnalysisContext, CheckResult


def check(ctx: AnalysisContext) -> CheckResult:
    window = ctx.rules.hook_text_window_s
    early = [f for f in ctx.frames or [] if f.t <= window]
    hits = frames_with_text(early, ctx.rules)
    if hits:
        frame, boxes = hits[0]
        text = " ".join(b.text for b in boxes)
        return CheckResult(
            id="hook.text",
            group="hook",
            status="pass",
            severity="info",
            title="Hook text on screen",
            explanation=f"Text appears at {fmt_t(frame.t)}: “{text}”.",
            timestamp_s=frame.t,
            evidence={"frame_key": frame.key, "text": text, "boxes": [b.box for b in boxes]},
        )
    return CheckResult(
        id="hook.text",
        group="hook",
        status="warn",
        severity="medium",
        title=f"No text in the first {window:.0f}s",
        explanation=(
            f"We didn't find on-screen text in the first {window:.0f}s. Many people watch "
            "muted, so a text hook helps them stop scrolling."
        ),
        fix="Add a short headline (3–7 words) in the first second that states the hook.",
        timestamp_s=0.0,
        evidence={"frames_checked": [f.t for f in early]},
    )


SPEC = CheckSpec("hook.text", "hook", check, needs=("frames",))
