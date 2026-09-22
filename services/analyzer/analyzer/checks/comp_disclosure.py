"""comp.disclosure: is the ad disclosed in the caption, on screen, or out loud? (D + L)

A fail caps the score at 49. If no caption was given we can't see where #ad
usually lives, so a missing disclosure is a warning rather than a fail.
"""

from analyzer.checks.base import CheckSpec, find_phrase, fmt_t, key_text
from analyzer.models import AnalysisContext, CheckResult


def check(ctx: AnalysisContext) -> CheckResult:
    rules = ctx.rules
    everything = rules.disclosure_tags + rules.disclosure_phrases
    found: list[dict] = []

    if tag := find_phrase(ctx.caption_text, everything):
        found.append({"where": "caption", "match": tag})
    for f in ctx.frames or []:
        text = " ".join(b.text for b in key_text(f.ocr, rules))
        if tag := find_phrase(text, everything):
            found.append({"where": "on_screen", "match": tag, "timestamp_s": f.t, "frame_key": f.key})
            break
    if ctx.transcript:
        for seg in ctx.transcript.segments:
            if phrase := find_phrase(seg.text, rules.disclosure_phrases):
                found.append({"where": "spoken", "match": phrase, "timestamp_s": seg.start, "quote": seg.text})
                break
    spoken = ctx.llm.spoken_disclosure if ctx.llm else None
    if spoken and spoken.present and not any(f["where"] == "spoken" for f in found):
        found.append({"where": "spoken", "match": spoken.quote, "timestamp_s": spoken.timestamp_s, "quote": spoken.quote})

    if found:
        first = found[0]
        where = {"caption": "your caption", "on_screen": "on screen", "spoken": "out loud"}[first["where"]]
        at = f" at {fmt_t(first['timestamp_s'])}" if first.get("timestamp_s") is not None else ""
        return CheckResult(
            id="comp.disclosure",
            group="compliance",
            status="pass",
            severity="info",
            title="Ad is disclosed",
            explanation=f"Found “{first['match']}” {where}{at}.",
            timestamp_s=first.get("timestamp_s"),
            evidence={"found": found},
        )

    if not ctx.caption_text:
        return CheckResult(
            id="comp.disclosure",
            group="compliance",
            status="warn",
            severity="high",
            title="No ad disclosure found yet",
            explanation="Nothing on screen or spoken says this is an ad, and we don't have your caption to check.",
            fix="Add #ad (or use the platform's paid-partnership label) to your caption, and paste the caption here to re-check.",
            evidence={"caption_provided": False},
        )
    return CheckResult(
        id="comp.disclosure",
        group="compliance",
        status="fail",
        severity="high",
        title="No ad disclosure",
        explanation="Your caption, on-screen text and speech never say this is an ad. Brands and platforms require it.",
        fix="Add #ad to the start of your caption, or turn on the platform's paid-partnership label.",
        evidence={"caption_provided": True, "caption": ctx.caption_text[:300]},
    )


SPEC = CheckSpec("comp.disclosure", "compliance", check)
