"""hook.spoken: does speech start by ~1.5s (D) and is the opening line a hook (L)?"""

import re

from analyzer.checks.base import AI_UNAVAILABLE, CheckSpec, fmt_t
from analyzer.models import AnalysisContext, CheckResult


def _first_sentence(text: str) -> str:
    match = re.match(r"(.+?[.!?])(\s|$)", text.strip())
    return match.group(1) if match else text.strip()


HOOK_TYPE_LABELS = {
    "question": "a question",
    "bold_claim": "a bold claim",
    "pattern_interrupt": "a pattern interrupt",
    "story": "a story opener",
}


def check(ctx: AnalysisContext) -> CheckResult:
    rules, j, transcript = ctx.rules, ctx.llm, ctx.transcript
    first = transcript.first_word_s
    if first is None:
        return CheckResult(
            id="hook.spoken",
            group="hook",
            status="na",
            severity="info",
            title="No spoken hook",
            explanation="Nobody speaks in this video, so the hook relies on visuals and on-screen text.",
        )

    opening = (j.opening_line if j and j.opening_line else None) or _first_sentence(
        transcript.segments[0].text if transcript.segments else ""
    )
    timing_ok = first <= rules.hook_speech_start_s
    problems: list[str] = []
    fixes: list[str] = []
    if not timing_ok:
        problems.append(f"you start talking at {fmt_t(first)}")
        fixes.append(f"cut the dead air so you speak within {rules.hook_speech_start_s:.1f}s")

    evidence = {"first_word_s": first, "opening_line": opening}
    strength_ok = True
    if j is not None:
        evidence |= {
            "hook_type": j.hook_type,
            "hook_strength": j.hook_strength,
            "reason": j.hook_reason,
        }
        strength_ok = j.hook_type != "none" and j.hook_strength >= rules.hook_strength_min
        if not strength_ok:
            reason = j.hook_reason.strip().rstrip(".")
            problems.append(f"the opening line is weak ({j.hook_strength}/5): {reason}")
            fixes.append("open with a question, a bold claim or a surprising statement")

    if not problems:
        kind = HOOK_TYPE_LABELS.get(j.hook_type, "a hook") if j else "speech"
        return CheckResult(
            id="hook.spoken",
            group="hook",
            status="pass",
            severity="info",
            title="Strong spoken opening" if j else "You start talking quickly",
            explanation=f"You open at {fmt_t(first)} with {kind}: “{opening}”."
            + ("" if j else AI_UNAVAILABLE),
            timestamp_s=first,
            evidence=evidence,
        )

    status = "fail" if not timing_ok and not strength_ok else "warn"
    fix = "; ".join(fixes)
    return CheckResult(
        id="hook.spoken",
        group="hook",
        status=status,
        severity="high" if status == "fail" else "medium",
        title="Spoken hook needs work",
        explanation=f"Opening line “{opening}”: "
        + "; ".join(problems)
        + "."
        + ("" if j else AI_UNAVAILABLE),
        fix=fix[:1].upper() + fix[1:] + ".",
        timestamp_s=first,
        evidence=evidence,
    )


SPEC = CheckSpec("hook.spoken", "hook", check, needs=("transcript",))
