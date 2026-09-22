"""Output schema for the preflight vision call (output `record_preflight_judgements`).

Follows BUILD_PLAN §6.4, plus three additions marked (+): whether the product
could be identified at all, a judgement on the on-screen hook text, and a
`mandatory` flag on brief points.
"""

from typing import Literal

from pydantic import BaseModel, Field

HookType = Literal["question", "bold_claim", "pattern_interrupt", "story", "none"]


class BriefPoint(BaseModel):
    point: str = Field(description="The talking point, as written in the brief.")
    mandatory: bool = Field(
        description="(+) True unless the brief marks it optional / nice-to-have."
    )
    covered: bool
    timestamp_s: float | None = Field(description="Where it's covered; null if not covered.")
    quote: str | None = Field(
        description="Words spoken or shown that cover it; null if not covered."
    )


class BriefViolation(BaseModel):
    rule: str = Field(description="The brief's don't/banned item, as written in the brief.")
    timestamp_s: float | None
    evidence: str = Field(description="Exact quote, or what is visible in the frame.")


class Cta(BaseModel):
    present: bool
    timestamp_s: float | None
    quote: str | None = Field(description="The CTA words, spoken or on screen.")


class RiskyClaim(BaseModel):
    quote: str
    timestamp_s: float | None
    why: str


class SpokenDisclosure(BaseModel):
    present: bool
    timestamp_s: float | None
    quote: str | None


class OnScreenHook(BaseModel):
    text: str | None = Field(description="On-screen text in the first 2s; null if none.")
    reinforces_hook: bool | None = Field(description="Null if there's no hook text.")
    reason: str


class PreflightJudgements(BaseModel):
    product_identified: bool = Field(
        description="(+) True if you know what is advertised (brand name, brief or speech), even if it's never shown."
    )
    product_first_visible_s: float | None = Field(
        description="Earliest frame timestamp where the product or brand is visible; null if never."
    )
    product_visibility_evidence: str
    opening_line: str | None = Field(
        description="First spoken sentence, verbatim; null if no speech."
    )
    hook_type: HookType
    hook_strength: int = Field(
        ge=1, le=5, description="1 = no hook, 5 = impossible to scroll past."
    )
    hook_reason: str
    on_screen_hook: OnScreenHook
    brief_points: list[BriefPoint] = Field(description="Empty if no brief was provided.")
    brief_violations: list[BriefViolation] = Field(description="Empty if none, or no brief.")
    cta: Cta
    risky_claims: list[RiskyClaim]
    spoken_disclosure: SpokenDisclosure
