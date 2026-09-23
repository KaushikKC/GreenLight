"""Contracts suite: extract terms from each golden contract (live LLM) and
score key fields plus red-flag precision/recall."""

import json
import time
from collections import defaultdict
from pathlib import Path

from analyzer.contracts.extract import extract_terms
from analyzer.contracts.terms import ContractTerms
from analyzer.llm.client import LLM
from analyzer.llm.errors import LLMError
from evals.metrics import PR, pct, percentile
from evals.pacing import paced

HERE = Path(__file__).parent / "contracts_golden"


def field_values(t: ContractTerms) -> dict:
    return {
        "brand": (t.brand.value or "").lower(),
        "category": t.brand_category_id,
        "signed_date": t.signed_date.value,
        "fee_amount": t.fee.amount,
        "fee_currency": (t.fee.currency or "").upper() or None,
        "net_days": t.payment_terms.net_days,
        "has_paid_usage": any(u.scope == "paid" for u in t.usage_rights),
        "perpetual_usage": any(u.perpetual for u in t.usage_rights),
        "whitelisting_start_unstated": bool(t.whitelisting)
        and all(w.start is None for w in t.whitelisting),
        "has_exclusivity": bool(t.exclusivity),
        "exclusivity_categories": {e.category_id for e in t.exclusivity},
        "exclusivity_ends": {e.end for e in t.exclusivity},
    }


def score_contract(expected: dict, got: dict) -> dict[str, bool]:
    checks: dict[str, bool] = {}
    for field, want in expected.items():
        if field in ("red_flags",):
            continue
        if field == "brand_contains":
            checks[field] = want.lower() in got["brand"]
        elif field == "exclusivity_category":
            checks[field] = want in got["exclusivity_categories"]
        elif field == "exclusivity_end":
            checks[field] = want in got["exclusivity_ends"]
        elif field == "fee_amount":
            checks[field] = (
                (got[field] is None)
                if want is None
                else (got[field] is not None and abs(got[field] - want) < 0.01)
            )
        else:
            checks[field] = got[field] == want
    return checks


def run(pause_s: float = 6.0) -> dict:
    expected_all = json.loads((HERE / "expected.json").read_text())["contracts"]
    per_field: dict[str, list[bool]] = defaultdict(list)
    flags = PR()
    flag_errors: list[str] = []
    latencies: list[float] = []
    cost = 0.0
    failures: list[str] = []
    misses: list[str] = []

    for name, expected in expected_all.items():
        text = (HERE / f"{name}.txt").read_text()
        llm = LLM.from_settings()
        started = time.monotonic()
        try:
            terms = paced(lambda llm=llm, text=text: extract_terms(llm, text=text), pause_s)
        except LLMError as e:
            failures.append(f"{name}: {e}")
            continue
        latencies.append(time.monotonic() - started)
        cost += llm.total_cost_usd
        got = field_values(terms)
        for field, ok in score_contract(expected, got).items():
            per_field[field].append(ok)
            if not ok:
                misses.append(f"`{name}` → {field}: expected {expected[field]!r}")
        want = set(expected.get("red_flags", []))
        found = {f.type for f in terms.red_flags}
        for flag in want | found:
            flags.add(flag in found, flag in want)
        if want != found:
            flag_errors.append(
                f"`{name}`: missing {sorted(want - found) or '–'}, extra {sorted(found - want) or '–'}"
            )

    all_checks = [ok for oks in per_field.values() for ok in oks]
    return {
        "contracts": len(latencies),
        "failures": failures,
        "field_accuracy": sum(all_checks) / len(all_checks) if all_checks else None,
        "per_field": {k: sum(v) / len(v) for k, v in sorted(per_field.items())},
        "field_misses": misses,
        "flag_precision": flags.precision,
        "flag_recall": flags.recall,
        "flag_errors": flag_errors,
        "latency_p50_s": percentile(latencies, 0.5),
        "latency_p95_s": percentile(latencies, 0.95),
        "cost_usd": round(cost, 6),
    }


def to_markdown(r: dict) -> str:
    p50 = r["latency_p50_s"] or 0
    p95 = r["latency_p95_s"] or 0
    lines = [
        f"## Contracts ({r['contracts']} extracted)",
        "",
        (
            f"Field accuracy **{pct(r['field_accuracy'])}** · red flags precision "
            f"**{pct(r['flag_precision'])}** · recall **{pct(r['flag_recall'])}** · "
            f"p50 {p50:.1f}s · p95 {p95:.1f}s · cost ${r['cost_usd']:.4f}"
        ),
        "",
        "| Field | Accuracy |",
        "|---|---:|",
        *[f"| `{k}` | {pct(v)} |" for k, v in r["per_field"].items()],
    ]
    if r["field_misses"]:
        lines += ["", "Field misses:", "", *[f"- {m}" for m in r["field_misses"]]]
    if r["flag_errors"]:
        lines += ["", "Red flag differences:", "", *[f"- {m}" for m in r["flag_errors"]]]
    if r["failures"]:
        lines += ["", "Couldn't extract:", "", *[f"- {m}" for m in r["failures"]]]
    return "\n".join(lines)
