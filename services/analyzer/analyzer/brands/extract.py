"""Brand mention extraction and canonicalisation (BUILD_PLAN §8.2 steps 1–3)."""

import logging
import re
from dataclasses import dataclass
from datetime import date

from analyzer.brands.canonical import canonical_key, display_name, group_by_key
from analyzer.brands.schemas import BrandMentions, BrandMerges
from analyzer.brands.sponsored import caption_discloses
from analyzer.llm.client import LLM, LLMError
from analyzer.llm.prompt_loader import load_prompt
from analyzer.llm.types import Text

log = logging.getLogger(__name__)

MENTIONS_PROMPT = "brand_mentions_v1"
MERGE_PROMPT = "brand_merge_v1"


@dataclass(frozen=True)
class PostIn:
    id: str
    caption: str | None
    transcript: str | None = None
    ocr_text: str | None = None
    posted_at: date | None = None
    platform: str | None = None

    @property
    def text(self) -> str:
        return "\n".join(t for t in (self.caption, self.transcript, self.ocr_text) if t)


@dataclass(frozen=True)
class FoundMention:
    post_id: str
    brand_raw: str
    product: str | None
    modality: str
    sentiment: float
    is_sponsored: bool
    evidence: str
    confidence: float


def _norm(s: str) -> str:
    return re.sub(r"\s+", " ", s).strip().lower()


def batch_text(posts: list[PostIn]) -> str:
    blocks = []
    for i, p in enumerate(posts, start=1):
        meta = ", ".join(x for x in (p.platform, p.posted_at.isoformat() if p.posted_at else None) if x)
        lines = [f"Post {i}" + (f" ({meta})" if meta else "") + ":", f"Caption: {p.caption or '(none)'}"]
        if p.transcript:
            lines.append(f"Transcript: {p.transcript}")
        if p.ocr_text:
            lines.append(f"On-screen text: {p.ocr_text}")
        blocks.append("\n".join(lines))
    return "\n\n".join(blocks)


def extract_mentions(llm: LLM, posts: list[PostIn]) -> list[FoundMention]:
    """One LLM call for up to ~10 posts. Mentions whose evidence isn't really in
    the post are dropped: we never invent a brand the creator didn't mention."""
    result = llm.structured(
        purpose="brand_mentions",
        model=llm.provider.fast_model,
        system=load_prompt(MENTIONS_PROMPT),
        parts=[Text(batch_text(posts) + "\n\nRecord the brand mentions with record_brand_mentions.")],
        output=BrandMentions,
        name="record_brand_mentions",
        description="Every brand mentioned in these posts, with the exact words as evidence.",
        max_tokens=8000,
    )
    found: dict[tuple[str, str], FoundMention] = {}
    for m in result.output.mentions:
        if not 1 <= m.post <= len(posts):
            continue
        post = posts[m.post - 1]
        if not m.evidence.strip() or _norm(m.evidence) not in _norm(post.text):
            log.info("dropping mention %r: evidence not in post %s", m.brand_raw, post.id)
            continue
        key = canonical_key(m.brand_raw)
        if not key or (post.id, key) in found:
            continue
        found[(post.id, key)] = FoundMention(
            post_id=post.id,
            brand_raw=m.brand_raw.strip(),
            product=m.product,
            modality=m.modality,
            sentiment=m.sentiment,
            is_sponsored=m.is_sponsored or caption_discloses(post.caption) is not None,
            evidence=m.evidence.strip(),
            confidence=m.confidence,
        )
    return list(found.values())


def canonicalise(llm: LLM | None, raws: list[str]) -> dict[str, str]:
    """Map every raw brand string to one display name per brand.

    Deterministic first (keys + alias table); then one LLM pass merges the
    remaining names ("Deciem" vs "The Ordinary"). If that call fails we keep
    the deterministic result."""
    groups = group_by_key(raws)
    names = {key: display_name(members) for key, members in groups.items()}
    mapping = {raw: names[canonical_key(raw)] for raw in raws if canonical_key(raw) in names}

    distinct = sorted(set(names.values()))
    if llm is None or len(distinct) < 2:
        return mapping
    try:
        merged = llm.structured(
            purpose="brand_merge",
            model=llm.provider.fast_model,
            system=load_prompt(MERGE_PROMPT),
            parts=[Text("Brand names:\n" + "\n".join(f"- {n}" for n in distinct))],
            output=BrandMerges,
            name="record_brand_merges",
            description="Groups of names that are the same brand, with the proper name.",
            max_tokens=4000,
        ).output
    except LLMError as e:
        log.warning("brand merge pass failed, keeping deterministic names: %s", e)
        return mapping
    rename: dict[str, str] = {}
    for g in merged.groups:
        canonical = g.canonical.strip()
        for v in g.variants:
            if v in names.values() and canonical:
                rename[v] = canonical
    return {raw: rename.get(name, name) for raw, name in mapping.items()}
