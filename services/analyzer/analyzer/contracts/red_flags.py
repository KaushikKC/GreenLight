"""Deterministic red flags that back up the LLM's (BUILD_PLAN §7.2).

If the extracted terms clearly show a problem the model didn't flag, add it,
quoting the term it came from.
"""

import json
from pathlib import Path

from analyzer.contracts.terms import ContractTerms, RedFlag

_RULES = json.loads((Path(__file__).resolve().parents[2] / "rules" / "contracts.json").read_text())


def _mentions(values: list[str] | str | None, terms: list[str]) -> bool:
    if not values:
        return False
    text = " ".join(values) if isinstance(values, list) else values
    text = text.lower()
    return any(t in text for t in terms)


def derive_red_flags(t: ContractTerms, rules: dict = _RULES) -> list[RedFlag]:
    found: list[RedFlag] = []

    net = t.payment_terms.net_days
    if net is not None and net > rules["late_payment_days"]:
        found.append(
            RedFlag(
                type="late_payment",
                quote=t.payment_terms.source_quote or f"net {net} days",
                why=f"Payment {net} days after invoice is long; {rules['late_payment_days']} or fewer is common.",
            )
        )

    for u in t.usage_rights:
        if u.perpetual:
            found.append(
                RedFlag(
                    type="perpetual_usage",
                    quote=u.source_quote or "in perpetuity",
                    why=f"The brand can use your content ({u.scope}) forever, with no end date.",
                )
            )
        if u.scope == "paid" and _mentions(u.territories, rules["worldwide_terms"]):
            found.append(
                RedFlag(
                    type="worldwide_paid_usage",
                    quote=u.source_quote or "worldwide",
                    why="Paid ads can run anywhere in the world; usually this costs the brand extra.",
                )
            )

    usage_ends = [u.end for u in t.usage_rights if u.end and not u.perpetual]
    if usage_ends and not any(u.perpetual for u in t.usage_rights):
        last_usage = max(usage_ends)
        for e in t.exclusivity:
            if e.end and e.end > last_usage:
                found.append(
                    RedFlag(
                        type="exclusivity_exceeds_usage",
                        quote=e.source_quote or e.category,
                        why=f"You can't work with other {e.category} brands until {e.end}, after the brand's usage ends ({last_usage}).",
                    )
                )

    if _mentions(t.revision_rounds.value, rules["unlimited_revision_terms"]) or _mentions(
        t.revision_rounds.source_quote, rules["unlimited_revision_terms"]
    ):
        found.append(
            RedFlag(
                type="unlimited_revisions",
                quote=t.revision_rounds.source_quote
                or t.revision_rounds.value
                or "unlimited revisions",
                why="No cap on revision rounds means unpaid extra work; 1 or 2 rounds is typical.",
            )
        )
    return found


def merge_red_flags(llm_flags: list[RedFlag], derived: list[RedFlag]) -> list[RedFlag]:
    """LLM flags first; add derived ones whose type the LLM didn't already raise."""
    seen = {f.type for f in llm_flags}
    return llm_flags + [f for f in derived if f.type not in seen]
