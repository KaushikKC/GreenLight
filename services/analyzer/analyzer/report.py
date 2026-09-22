"""Assemble the report JSON stored on preflights.report (BUILD_PLAN §6.6)."""

from typing import Any

from analyzer.models import AnalysisContext, CheckResult
from analyzer.scoring import GROUP_WEIGHTS, ScoreResult

REPORT_VERSION = 1
STATUS_RANK = {"fail": 0, "warn": 1}
SEVERITY_RANK = {"high": 0, "medium": 1, "low": 2, "info": 3}


def fix_list(checks: list[CheckResult]) -> list[dict[str, Any]]:
    """Actionable items, most impactful first: fails before warns, then severity, then group weight."""
    actionable = [c for c in checks if c.status in STATUS_RANK and c.fix]
    actionable.sort(
        key=lambda c: (
            STATUS_RANK[c.status],
            SEVERITY_RANK[c.severity],
            -GROUP_WEIGHTS.get(c.group, 0),
            c.timestamp_s if c.timestamp_s is not None else float("inf"),
        )
    )
    return [
        {
            "n": i + 1,
            "check_id": c.id,
            "fix": c.fix,
            "timestamp_s": c.timestamp_s,
            "status": c.status,
        }
        for i, c in enumerate(actionable)
    ]


def build_report(
    ctx: AnalysisContext,
    checks: list[CheckResult],
    score: ScoreResult,
    progress: list[dict[str, str]],
) -> dict[str, Any]:
    p = ctx.probe
    return {
        "version": REPORT_VERSION,
        "progress": progress,
        "score": score.score,
        "verdict": score.verdict,
        "score_breakdown": score.model_dump(exclude={"score", "verdict"}),
        "checks": [c.model_dump() for c in checks],
        "fix_list": fix_list(checks),
        "transcript": [
            {"start": s.start, "end": s.end, "text": s.text}
            for s in (ctx.transcript.segments if ctx.transcript else [])
        ],
        "meta": {
            "duration_s": p.duration_s,
            "width": p.width,
            "height": p.height,
            "fps": p.fps,
            "has_audio": p.has_audio,
            "platform": ctx.rules.platform,
        },
    }
