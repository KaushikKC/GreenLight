"""Preflight suite: run each golden clip through the real pipeline and compare
check statuses with labels. Deterministic by default; --llm adds the AI call."""

import logging
import tempfile
import time
from collections import defaultdict
from pathlib import Path

from analyzer.llm.client import LLM
from analyzer.preflight_pipeline import analyze_video
from analyzer.rules import load_rules
from evals.metrics import PR, pct, percentile
from evals.preflight_golden.generate import NeedsVoice, build, load_cases

log = logging.getLogger(__name__)

FLAGGED = {"warn", "fail"}


def run(use_llm: bool = False) -> dict:
    per_check: dict[str, dict] = defaultdict(lambda: {"n": 0, "exact": 0, "pr": PR()})
    mismatches: list[dict] = []
    latencies: list[float] = []
    cost = 0.0
    skipped: list[str] = []

    for case in load_cases():
        try:
            clip = build(case)
        except NeedsVoice:
            skipped.append(case["id"])
            continue
        started = time.monotonic()
        with tempfile.TemporaryDirectory() as tmp:
            result = analyze_video(
                clip,
                Path(tmp),
                rules=load_rules(case.get("platform", "tiktok")),
                caption=case.get("caption"),
                brief=case.get("brief"),
                brand=case.get("brand"),
                make_llm=LLM.from_settings if use_llm else None,
            )
        latencies.append(time.monotonic() - started)
        if result.llm:
            cost += result.llm.total_cost_usd
        got = {c.id: c.status for c in result.checks}
        for check_id, expected in case["labels"].items():
            actual = got.get(check_id, "missing")
            stats = per_check[check_id]
            stats["n"] += 1
            stats["exact"] += actual == expected
            stats["pr"].add(actual in FLAGGED, expected in FLAGGED)
            if actual != expected:
                mismatches.append(
                    {"case": case["id"], "check": check_id, "expected": expected, "got": actual}
                )

    total = sum(s["n"] for s in per_check.values())
    exact = sum(s["exact"] for s in per_check.values())
    overall = PR()
    for s in per_check.values():
        p = s["pr"]
        overall.tp, overall.fp, overall.fn, overall.tn = (
            overall.tp + p.tp,
            overall.fp + p.fp,
            overall.fn + p.fn,
            overall.tn + p.tn,
        )
    return {
        "cases": len(latencies),
        "skipped": skipped,
        "labels": total,
        "accuracy": exact / total if total else None,
        "precision": overall.precision,
        "recall": overall.recall,
        "per_check": {
            k: {
                "n": v["n"],
                "accuracy": v["exact"] / v["n"],
                "precision": v["pr"].precision,
                "recall": v["pr"].recall,
            }
            for k, v in sorted(per_check.items())
        },
        "mismatches": mismatches,
        "latency_p50_s": percentile(latencies, 0.5),
        "latency_p95_s": percentile(latencies, 0.95),
        "cost_usd": round(cost, 6),
        "llm": use_llm,
    }


def to_markdown(r: dict) -> str:
    lines = [
        f"## Preflight ({r['cases']} clips, {r['labels']} labelled checks, AI {'on' if r['llm'] else 'off'})",
        "",
        (
            f"Status accuracy **{pct(r['accuracy'])}** · flagged precision "
            f"**{pct(r['precision'])}** · recall **{pct(r['recall'])}** · "
            f"p50 {r['latency_p50_s']:.1f}s · p95 {r['latency_p95_s']:.1f}s per clip · "
            f"cost ${r['cost_usd']:.4f}"
        ),
        "",
        "| Check | Labels | Accuracy | Precision | Recall |",
        "|---|---:|---:|---:|---:|",
    ]
    for k, v in r["per_check"].items():
        lines.append(
            f"| `{k}` | {v['n']} | {pct(v['accuracy'])} | {pct(v['precision'])} | {pct(v['recall'])} |"
        )
    if r["mismatches"]:
        lines += ["", "Mismatches:", ""]
        lines += [
            f"- `{m['case']}` → `{m['check']}`: expected {m['expected']}, got {m['got']}"
            for m in r["mismatches"]
        ]
    if r["skipped"]:
        lines += ["", f"Skipped (need macOS `say`): {', '.join(r['skipped'])}"]
    return "\n".join(lines)
