import pytest
from pydantic import ValidationError

from analyzer.brands.schemas import MAX_PITCH_WORDS, BrandMention, Pitch


def pitch(**kw):
    base = {
        "subject": "Loving your serum",
        "body": "Hi team, I've used your serum every morning since June.",
        "claims": [{"text": "every morning since June", "post_ids": ["p1"]}],
    }
    return base | kw


def test_mention_sentiment_is_bounded():
    with pytest.raises(ValidationError):
        BrandMention(
            post=1,
            brand_raw="x",
            product=None,
            modality="caption",
            sentiment=2,
            is_sponsored=False,
            evidence="x",
            confidence=1,
        )


def test_pitch_must_be_short():
    long_body = " ".join(["word"] * (MAX_PITCH_WORDS + 1))
    with pytest.raises(ValidationError, match="under 150"):
        Pitch.model_validate(pitch(body=long_body))


def test_pitch_can_only_cite_evidence_posts():
    ok = Pitch.model_validate(pitch(), context={"post_ids": {"p1"}, "followers": None})
    assert ok.claims[0].post_ids == ["p1"]
    with pytest.raises(ValidationError, match="aren't in the evidence"):
        Pitch.model_validate(
            pitch(claims=[{"text": "x", "post_ids": ["p9"]}]), context={"post_ids": {"p1"}}
        )


def test_follower_numbers_need_creator_consent():
    body = "Hi! My 12k followers love skincare."
    with pytest.raises(ValidationError, match="follower"):
        Pitch.model_validate(pitch(body=body), context={"post_ids": {"p1"}, "followers": None})
    assert Pitch.model_validate(pitch(body=body), context={"post_ids": {"p1"}, "followers": 12000})
