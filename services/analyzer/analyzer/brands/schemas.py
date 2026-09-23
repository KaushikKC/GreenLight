"""LLM output schemas for Brands You Already Love."""

import re
from typing import Literal

from pydantic import BaseModel, Field, ValidationInfo, field_validator, model_validator

Modality = Literal["spoken", "caption", "on_screen", "visual"]

# --- record_brand_mentions (MODEL_FAST, 10 posts per call) -------------------


class BrandMention(BaseModel):
    post: int = Field(description="The post number from the list, e.g. 3 for 'Post 3'.")
    brand_raw: str = Field(description="The brand exactly as written in the post (keep @/#).")
    product: str | None = Field(description="Specific product, if named.")
    modality: Modality = Field(description="Where the brand appears. Captions are 'caption'.")
    sentiment: float = Field(ge=-1, le=1, description="-1 negative, 0 neutral, 1 very positive.")
    is_sponsored: bool = Field(description="Paid, gifted, #ad, affiliate code or partnership.")
    evidence: str = Field(description="Exact words from the post that mention the brand.")
    confidence: float = Field(ge=0, le=1)


class BrandMentions(BaseModel):
    mentions: list[BrandMention]


# --- record_brand_merges ------------------------------------------------------


class BrandGroup(BaseModel):
    canonical: str = Field(description="The brand's proper name, e.g. 'The Ordinary'.")
    variants: list[str] = Field(description="Every listed name that refers to this brand.")


class BrandMerges(BaseModel):
    groups: list[BrandGroup]


# --- record_pitch ---------------------------------------------------------------

MAX_PITCH_WORDS = 150
FOLLOWER_RE = re.compile(r"\b\d[\d,.]*\s*[km]?\s*(followers|subscribers|fans)\b", re.IGNORECASE)


class PitchClaim(BaseModel):
    text: str = Field(description="A sentence or phrase from the body that refers to past posts.")
    post_ids: list[str] = Field(description="IDs of the evidence posts that back it up.")


class Pitch(BaseModel):
    subject: str
    body: str = Field(description=f"The email body, under {MAX_PITCH_WORDS} words.")
    claims: list[PitchClaim]

    @field_validator("body")
    @classmethod
    def _short(cls, v: str) -> str:
        words = len(v.split())
        if words > MAX_PITCH_WORDS:
            raise ValueError(f"body is {words} words; keep it under {MAX_PITCH_WORDS}")
        return v

    @model_validator(mode="after")
    def _grounded(self, info: ValidationInfo) -> "Pitch":
        ctx = info.context or {}
        allowed = ctx.get("post_ids")
        if allowed is not None:
            bad = sorted({p for c in self.claims for p in c.post_ids if p not in allowed})
            if bad:
                raise ValueError(f"claims cite posts that aren't in the evidence: {bad}")
        if ctx.get("followers") is None and FOLLOWER_RE.search(self.body):
            raise ValueError("don't mention follower numbers: the creator didn't provide any")
        return self
