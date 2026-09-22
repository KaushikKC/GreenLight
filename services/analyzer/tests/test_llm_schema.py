from typing import Literal

from pydantic import BaseModel, Field

from analyzer.llm.pricing import cost_usd, rates_for
from analyzer.llm.schema import strict_schema


class Inner(BaseModel):
    title: str  # a property literally named "title" must survive
    score: int = Field(ge=1, le=5)


class Outer(BaseModel):
    label: Literal["a", "b"]
    maybe: float | None = None
    items: list[Inner] = Field(default_factory=list, max_length=3)


def test_every_object_is_closed_and_fully_required():
    s = strict_schema(Outer)
    assert s["additionalProperties"] is False
    assert set(s["required"]) == {"label", "maybe", "items"}
    inner = s["$defs"]["Inner"]
    assert inner["additionalProperties"] is False
    assert set(inner["required"]) == {"title", "score"}


def test_property_named_title_is_kept():
    assert "title" in strict_schema(Outer)["$defs"]["Inner"]["properties"]


def test_unsupported_constraints_are_stripped():
    text = str(strict_schema(Outer))
    for key in ("minimum", "maximum", "maxItems", "'default'"):
        assert key not in text


def test_pricing_matches_dated_snapshot_ids():
    assert rates_for("claude-haiku-4-5-20251001") == (1.0, 5.0)
    assert rates_for("claude-sonnet-5") == (2.0, 10.0)
    assert rates_for("gpt-4") is None


def test_cost_includes_cache_multipliers():
    # 1M input @ $2 + 1M output @ $10 + 1M cache read @ $0.20
    assert cost_usd("claude-sonnet-5", 1_000_000, 1_000_000, 0, 1_000_000) == 12.2


def test_unknown_model_cost_is_none():
    assert cost_usd("mystery-model", 10, 10) is None
