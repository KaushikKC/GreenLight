"""Caption-level sponsorship signals that back up the LLM's is_sponsored."""

from analyzer.brands.rules import brand_rules
from analyzer.checks.base import find_phrase


def caption_discloses(caption: str | None) -> str | None:
    """The disclosure tag/phrase found in the caption, if any."""
    r = brand_rules()
    return find_phrase(caption, r["sponsored_tags"] + r["sponsored_phrases"])
