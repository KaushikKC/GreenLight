"""read.safe_zone: does key on-screen text sit under the platform's UI?"""

from analyzer.checks.base import CheckSpec, fmt_t, frames_with_text, overlap_fraction
from analyzer.models import AnalysisContext, CheckResult

PLATFORM_NAMES = {"tiktok": "TikTok", "reels": "Reels"}
REGION_NAMES = {
    "top_bar": "top bar",
    "right_action_rail": "like/comment/share buttons",
    "bottom_caption_area": "caption area",
}
FIXES = {
    "top_bar": "Move the text down, below the top ~15% of the frame.",
    "right_action_rail": "Move the text left, away from the right edge.",
    "bottom_caption_area": "Move the text up to the middle third of the frame.",
}


def check(ctx: AnalysisContext) -> CheckResult:
    rules = ctx.rules
    hits = []
    for frame, boxes in frames_with_text(ctx.frames or [], rules):
        for b in boxes:
            for region in rules.unsafe_regions:
                overlap = overlap_fraction(b.box, region)
                if overlap >= rules.safe_zone_min_overlap:
                    hits.append((frame, b, region, overlap))

    if not hits:
        return CheckResult(
            id="read.safe_zone",
            group="readability",
            status="pass",
            severity="info",
            title="Text clear of platform UI",
            explanation="None of your on-screen text sits under the app's buttons or caption area.",
            evidence={"regions": [r.model_dump() for r in rules.unsafe_regions]},
        )

    frame, box, region, overlap = max(hits, key=lambda h: (h[3], h[1].box[3]))
    where = REGION_NAMES.get(region.name, region.name.replace("_", " "))
    platform = PLATFORM_NAMES.get(region.platform, region.platform)
    distinct_times = sorted({h[0].t for h in hits})
    return CheckResult(
        id="read.safe_zone",
        group="readability",
        status="fail",
        severity="high",
        title=f"Text is hidden behind {platform}'s {where}",
        explanation=(
            f"Your text “{box.text}” at {fmt_t(frame.t)} sits under {platform}'s {where}"
            + (f" ({len(distinct_times)} moments in total)." if len(distinct_times) > 1 else ".")
        ),
        fix=FIXES.get(region.name, "Move the text towards the centre of the frame."),
        timestamp_s=frame.t,
        evidence={
            "frame_key": frame.key,
            "box": list(box.box),
            "text": box.text,
            "region": region.model_dump(),
            "overlap": round(overlap, 2),
            "all_timestamps": distinct_times,
        },
    )


SPEC = CheckSpec("read.safe_zone", "readability", check, needs=("ocr",))
