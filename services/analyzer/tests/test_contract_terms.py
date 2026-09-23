import pytest
from pydantic import ValidationError

from analyzer.contracts.terms import CATEGORY_IDS, DateTerm, Exclusivity, UsageRight


def test_dates_must_be_iso_or_null():
    assert (
        DateTerm(value="2026-03-03", source_quote="3 March 2026", confidence=0.9).value
        == "2026-03-03"
    )
    assert DateTerm(value="", source_quote=None, confidence=0).value is None
    with pytest.raises(ValidationError):
        DateTerm(value="next Tuesday", source_quote=None, confidence=0.5)


def test_relative_window_keeps_duration_without_start():
    u = UsageRight(
        scope="paid",
        platforms=["all"],
        territories=["worldwide"],
        start=None,
        end=None,
        duration_text="90 days from first post",
        perpetual=False,
        source_quote="for ninety (90) days from the date the first deliverable is posted",
        confidence=0.8,
    )
    assert u.start is None and u.duration_text


def test_category_must_come_from_taxonomy():
    assert "skincare" in CATEGORY_IDS and "other" in CATEGORY_IDS
    with pytest.raises(ValidationError):
        Exclusivity(
            category="face stuff",
            category_id="face",
            competitors_named=[],
            start=None,
            end=None,
            duration_text=None,
            source_quote=None,
            confidence=0.5,
        )
