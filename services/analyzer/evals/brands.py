"""Brands suite: find brand mentions in 50 labelled captions (live LLM) and
score mention precision/recall and sponsorship accuracy."""

import csv
import time
from datetime import date
from pathlib import Path

from analyzer.brands.canonical import canonical_key
from analyzer.brands.extract import PostIn, canonicalise, extract_mentions
from analyzer.brands.rules import brand_rules
from analyzer.llm.client import LLM
from analyzer.llm.errors import LLMError
from evals.metrics import PR, pct, percentile
from evals.pacing import paced

HERE = Path(__file__).parent / "brands_golden"


def load() -> tuple[list[PostIn], dict[tuple[str, str], bool]]:
    posts: list[PostIn] = []
    expected: dict[tuple[str, str], bool] = {}  # (post id, brand key) -> sponsored
    with open(HERE / "captions.csv") as f:
        for row in csv.DictReader(f):
            posts.append(
                PostIn(
                    id=row["id"],
                    caption=row["caption"],
                    posted_at=date.fromisoformat(row["posted_at"]),
                )
            )
            for b in filter(None, row["brands"].split(";")):
                expected[(row["id"], canonical_key(b.rstrip("*")))] = b.endswith("*")
    return posts, expected


def run(pause_s: float = 6.0) -> dict:
    posts, expected = load()
    llm = LLM.from_settings()
    size = int(brand_rules()["batch_size"])
    found = []
    latencies: list[float] = []
    failures: list[str] = []
    for i in range(0, len(posts), size):
        batch = posts[i : i + size]
        started = time.monotonic()
        try:
            found += paced(lambda batch=batch: extract_mentions(llm, batch), pause_s)
        except LLMError as e:
            failures.append(f"posts {i + 1}-{i + len(batch)}: {e}")
            continue
        latencies.append(time.monotonic() - started)
    mapping = (
        paced(lambda: canonicalise(llm, [m.brand_raw for m in found]), pause_s) if found else {}
    )

    predicted: dict[tuple[str, str], bool] = {}
    for m in found:
        predicted[(m.post_id, canonical_key(mapping.get(m.brand_raw, m.brand_raw)))] = (
            m.is_sponsored
        )

    pr = PR()
    for key in set(expected) | set(predicted):
        pr.add(key in predicted, key in expected)
    both = set(expected) & set(predicted)
    sponsored_ok = sum(expected[k] == predicted[k] for k in both)
    return {
        "captions": len(posts),
        "labelled_mentions": len(expected),
        "found_mentions": len(predicted),
        "precision": pr.precision,
        "recall": pr.recall,
        "sponsored_accuracy": sponsored_ok / len(both) if both else None,
        "missed": sorted(f"{p}:{b}" for p, b in set(expected) - set(predicted)),
        "extra": sorted(f"{p}:{b}" for p, b in set(predicted) - set(expected)),
        "sponsor_errors": sorted(
            f"{p}:{b}" for p, b in both if expected[(p, b)] != predicted[(p, b)]
        ),
        "failures": failures,
        "latency_p50_s": percentile(latencies, 0.5),
        "latency_p95_s": percentile(latencies, 0.95),
        "llm_calls": len(llm.calls),
        "cost_usd": round(llm.total_cost_usd, 6),
    }


def to_markdown(r: dict) -> str:
    p50 = r["latency_p50_s"] or 0
    p95 = r["latency_p95_s"] or 0
    lines = [
        f"## Brands ({r['captions']} captions, {r['labelled_mentions']} labelled mentions)",
        "",
        (
            f"Mention precision **{pct(r['precision'])}** · recall **{pct(r['recall'])}** · "
            f"sponsored accuracy **{pct(r['sponsored_accuracy'])}** · {r['llm_calls']} LLM calls · "
            f"p50 {p50:.1f}s · p95 {p95:.1f}s per batch · cost ${r['cost_usd']:.4f}"
        ),
    ]
    for label, key in (
        ("Missed", "missed"),
        ("Extra", "extra"),
        ("Wrong sponsorship", "sponsor_errors"),
        ("Failed batches", "failures"),
    ):
        if r[key]:
            lines += ["", f"{label}: {', '.join(r[key])}"]
    return "\n".join(lines)
