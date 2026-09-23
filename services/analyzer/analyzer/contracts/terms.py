"""Output schema for contract extraction (tool `record_contract_terms`, BUILD_PLAN §7.2).

Every term carries the contract words it came from (`source_quote`) and a
0..1 confidence, so the creator can check it on the review screen.
"""

import json
from datetime import date
from pathlib import Path
from typing import Literal

from pydantic import BaseModel, Field, field_validator

_CATEGORIES_PATH = Path(__file__).resolve().parents[2] / "rules" / "categories.json"
CATEGORY_IDS: tuple[str, ...] = tuple(
    c["id"] for c in json.loads(_CATEGORIES_PATH.read_text())["categories"]
)
CategoryId = Literal[CATEGORY_IDS]  # type: ignore[valid-type]


def _iso_or_none(v: str | None) -> str | None:
    if v in (None, ""):
        return None
    date.fromisoformat(v)  # raises ValueError → validation error → model retries
    return v


class Sourced(BaseModel):
    source_quote: str | None = Field(
        description="Exact words from the contract; null if not stated."
    )
    confidence: float = Field(ge=0, le=1, description="0..1: how sure you are this is right.")


class TextTerm(Sourced):
    value: str | None


class DateTerm(Sourced):
    value: str | None = Field(description="YYYY-MM-DD, only if the contract states the date.")

    @field_validator("value")
    @classmethod
    def _iso_dates(cls, v: str | None) -> str | None:
        return _iso_or_none(v)


class BoolTerm(Sourced):
    value: bool | None


class Fee(Sourced):
    amount: float | None
    currency: str | None = Field(description="ISO 4217 code, e.g. GBP, USD, EUR.")


class PaymentTerms(Sourced):
    net_days: int | None = Field(description="Days after the trigger event that payment is due.")
    trigger: str | None = Field(description="What starts the clock, e.g. 'receipt of invoice'.")


class Dated(Sourced):
    start: str | None = Field(description="YYYY-MM-DD, only if stated or directly computable.")
    end: str | None = Field(description="YYYY-MM-DD, only if stated or directly computable.")
    duration_text: str | None = Field(
        description="The duration as worded, e.g. '90 days from first post'."
    )

    @field_validator("start", "end")
    @classmethod
    def _iso_dates(cls, v: str | None) -> str | None:
        return _iso_or_none(v)


class Deliverable(Sourced):
    platform: str | None
    format: str | None = Field(description="e.g. 'video', 'reel', 'story', 'post'.")
    count: int | None
    due_date: str | None = Field(description="YYYY-MM-DD if stated.")

    @field_validator("due_date")
    @classmethod
    def _iso_dates(cls, v: str | None) -> str | None:
        return _iso_or_none(v)


class UsageRight(Dated):
    scope: Literal["organic", "paid"]
    platforms: list[str] = Field(description="As named; ['all'] if all platforms.")
    territories: list[str] = Field(description="As named; ['worldwide'] if worldwide.")
    perpetual: bool


class Whitelisting(Dated):
    platforms: list[str]


class Exclusivity(Dated):
    category: str = Field(description="The restricted category as worded in the contract.")
    category_id: CategoryId = Field(description="Closest id from the category list.")
    competitors_named: list[str]


RedFlagType = Literal[
    "perpetual_usage",
    "worldwide_paid_usage",
    "unlimited_revisions",
    "late_payment",
    "exclusivity_exceeds_usage",
    "ai_likeness",
    "raw_footage",
    "no_kill_fee",
    "other",
]


class RedFlag(BaseModel):
    type: RedFlagType
    quote: str = Field(description="Exact words from the contract.")
    why: str = Field(description="One sentence on why a creator should look twice.")


class ContractTerms(BaseModel):
    brand: TextTerm
    brand_category_id: CategoryId = Field(
        description="Category of the brand's product being promoted."
    )
    campaign: TextTerm
    signed_date: DateTerm
    fee: Fee
    payment_terms: PaymentTerms
    deliverables: list[Deliverable]
    usage_rights: list[UsageRight]
    whitelisting: list[Whitelisting]
    exclusivity: list[Exclusivity]
    revision_rounds: TextTerm = Field(description="Number of revision rounds, or 'unlimited'.")
    raw_file_delivery: BoolTerm
    termination: TextTerm
    kill_fee: TextTerm
    red_flags: list[RedFlag]
