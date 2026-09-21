"""Weighted score + verdict (BUILD_PLAN §6.5), with a "why this score" breakdown."""

from typing import Literal

from pydantic import BaseModel

from analyzer.models import CheckResult

GROUP_WEIGHTS: dict[str, int] = {
    "hook": 30,
    "message": 20,
    "readability": 15,
    "compliance": 15,
    "format": 10,
    "audio": 5,
    "technical": 5,
}
POINTS = {"pass": 1.0, "warn": 0.5, "fail": 0.0}  # na / info / error are excluded
HARD_CAP = 49
HARD_CAP_CHECKS = ("comp.disclosure", "msg.brief_donts")

Verdict = Literal["ready", "fix_first", "not_ready"]


class GroupScore(BaseModel):
    group: str
    weight: int
    effective_weight: float  # after redistributing excluded groups, sums to 100
    score: float  # 0..1
    counted: int
    excluded: int


class ScoreResult(BaseModel):
    score: int
    verdict: Verdict
    groups: list[GroupScore]
    uncounted_groups: list[str]
    caps: list[str]
    raw_score: int


def verdict_for(score: int) -> Verdict:
    if score >= 80:
        return "ready"
    if score >= 50:
        return "fix_first"
    return "not_ready"


def score_checks(checks: list[CheckResult]) -> ScoreResult:
    groups: list[GroupScore] = []
    uncounted: list[str] = []
    for group, weight in GROUP_WEIGHTS.items():
        in_group = [c for c in checks if c.group == group]
        scored = [POINTS[c.status] for c in in_group if c.status in POINTS]
        if not scored:
            uncounted.append(group)
            continue
        groups.append(
            GroupScore(
                group=group,
                weight=weight,
                effective_weight=0,
                score=sum(scored) / len(scored),
                counted=len(scored),
                excluded=len(in_group) - len(scored),
            )
        )

    total_weight = sum(g.weight for g in groups)
    if total_weight == 0:
        return ScoreResult(
            score=0, verdict="not_ready", groups=[], uncounted_groups=uncounted, caps=[], raw_score=0
        )
    for g in groups:
        g.effective_weight = round(g.weight * 100 / total_weight, 2)
    raw = round(sum(g.weight * g.score for g in groups) * 100 / total_weight)

    caps = [c.id for c in checks if c.id in HARD_CAP_CHECKS and c.status == "fail"]
    score = min(raw, HARD_CAP) if caps else raw
    return ScoreResult(
        score=score,
        verdict=verdict_for(score),
        groups=groups,
        uncounted_groups=uncounted,
        caps=caps,
        raw_score=raw,
    )
