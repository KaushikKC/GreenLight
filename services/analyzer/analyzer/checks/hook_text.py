"""hook.text: on-screen text in the first 2s (D), and does it reinforce the hook (L)?"""

from analyzer.checks.base import CheckSpec, fmt_t, frames_with_text
from analyzer.models import AnalysisContext, CheckResult


def check(ctx: AnalysisContext) -> CheckResult:
    window = ctx.rules.hook_text_window_s
    early = [f for f in ctx.frames or [] if f.t <= window]
    hits = frames_with_text(early, ctx.rules)
    if not hits:
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

    frame, boxes = hits[0]
    text = " ".join(b.text for b in boxes)
    evidence = {"frame_key": frame.key, "text": text, "boxes": [b.box for b in boxes]}
    judged = ctx.llm.on_screen_hook if ctx.llm else None
    if judged is not None and judged.reinforces_hook is False:
        return CheckResult(
            id="hook.text",
            group="hook",
            status="warn",
            severity="medium",
            title="Hook text doesn't back up the hook",
            explanation=f"Text at {fmt_t(frame.t)} reads “{text}”. {judged.reason}",
            fix="Make the headline repeat or sharpen the promise you make out loud.",
            timestamp_s=frame.t,
            evidence=evidence | {"reason": judged.reason},
        )
    return CheckResult(
        id="hook.text",
        group="hook",
        status="pass",
        severity="info",
        title="Hook text on screen",
        explanation=f"Text appears at {fmt_t(frame.t)}: “{text}”."
        + (f" {judged.reason}" if judged and judged.reinforces_hook else ""),
        timestamp_s=frame.t,
        evidence=evidence,
    )


SPEC = CheckSpec("hook.text", "hook", check, needs=("ocr",))
