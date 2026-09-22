"""msg.cta: a clear call to action in speech or text in the last 5s? (D + L)"""

from analyzer.checks.base import AI_UNAVAILABLE, CheckSpec, find_phrase, fmt_t, key_text
from analyzer.models import AnalysisContext, CheckResult


def _deterministic_cta(ctx: AnalysisContext, start: float) -> tuple[float, str] | None:
    """Latest CTA phrase found in the transcript or on-screen text after `start`."""
    phrases = ctx.rules.cta_phrases
    hits: list[tuple[float, str]] = []
    if ctx.transcript:
        for seg in ctx.transcript.segments:
            if seg.end >= start and (p := find_phrase(seg.text, phrases)):
                hits.append((max(seg.start, start), f"said “{seg.text}” ({p})"))
    for f in ctx.frames or []:
        if f.t >= start:
            text = " ".join(b.text for b in key_text(f.ocr, ctx.rules))
            if p := find_phrase(text, phrases):
                hits.append((f.t, f"on screen “{text}” ({p})"))
    return max(hits) if hits else None


def check(ctx: AnalysisContext) -> CheckResult:
    duration, window = ctx.probe.duration_s, ctx.rules.cta_window_s
    start = max(duration - window, 0.0)
    llm_cta = ctx.llm.cta if ctx.llm else None
    found = _deterministic_cta(ctx, start)
    evidence = {"window_start_s": round(start, 2), "llm": llm_cta.model_dump() if llm_cta else None}

    if llm_cta and llm_cta.present and llm_cta.timestamp_s is not None and llm_cta.timestamp_s >= start:
        return CheckResult(
            id="msg.cta",
            group="message",
            status="pass",
            severity="info",
            title="Clear call to action at the end",
            explanation=f"At {fmt_t(llm_cta.timestamp_s)}: “{llm_cta.quote}”.",
            timestamp_s=llm_cta.timestamp_s,
            evidence=evidence,
        )
    if found:
        t, what = found
        return CheckResult(
            id="msg.cta",
            group="message",
            status="pass",
            severity="info",
            title="Call to action at the end",
            explanation=f"At {fmt_t(t)} you {what}." + ("" if ctx.llm else AI_UNAVAILABLE),
            timestamp_s=t,
            evidence=evidence | {"match": what},
        )

    earlier = (
        f" There's one at {fmt_t(llm_cta.timestamp_s)} (“{llm_cta.quote}”), but not in the final {window:.0f}s."
        if llm_cta and llm_cta.present and llm_cta.timestamp_s is not None
        else ""
    )
    return CheckResult(
        id="msg.cta",
        group="message",
        status="warn",
        severity="medium",
        title=f"No call to action in the last {window:.0f}s",
        explanation=f"Viewers who watched to the end aren't told what to do next.{earlier}"
        + ("" if ctx.llm else AI_UNAVAILABLE),
        fix="End with a clear next step, said and shown: e.g. “Tap the link to get 20% off”.",
        timestamp_s=round(start, 2),
        evidence=evidence,
    )


SPEC = CheckSpec("msg.cta", "message", check)
