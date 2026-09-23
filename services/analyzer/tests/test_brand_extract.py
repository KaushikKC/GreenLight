from datetime import date

from analyzer.brands.extract import PostIn, batch_text, canonicalise, extract_mentions
from analyzer.llm.client import LLM
from analyzer.llm.errors import LLMError
from tests.fake_llm import FakeProvider, reply

POSTS = [
    PostIn(
        id="p1",
        caption="obsessed with @theordinary niacinamide 😍",
        posted_at=date(2026, 8, 1),
        platform="tiktok",
    ),
    PostIn(id="p2", caption="gym fit #gymshark #ad", platform="instagram"),
]


def mention(**kw):
    base = {
        "post": 1,
        "brand_raw": "@theordinary",
        "product": "niacinamide",
        "modality": "caption",
        "sentiment": 1,
        "is_sponsored": False,
        "evidence": "obsessed with @theordinary niacinamide",
        "confidence": 0.9,
    }
    return base | kw


def test_batch_text_numbers_posts_with_meta():
    text = batch_text(POSTS)
    assert "Post 1 (tiktok, 2026-08-01):" in text
    assert "Post 2 (instagram):" in text


def test_keeps_grounded_mentions_and_uses_fast_model():
    fake = FakeProvider(reply({"mentions": [mention()]}))
    found = extract_mentions(LLM(provider=fake), POSTS)
    assert [(f.post_id, f.brand_raw) for f in found] == [("p1", "@theordinary")]
    assert fake.requests[0]["model"] == "fake-fast"


def test_drops_mentions_whose_evidence_is_not_in_the_post():
    fake = FakeProvider(
        reply({"mentions": [mention(brand_raw="CeraVe", evidence="love my cerave")]})
    )
    assert extract_mentions(LLM(provider=fake), POSTS) == []


def test_drops_bad_post_numbers_and_duplicates():
    fake = FakeProvider(
        reply({"mentions": [mention(post=9), mention(), mention(brand_raw="The Ordinary")]})
    )
    assert len(extract_mentions(LLM(provider=fake), POSTS)) == 1


def test_caption_disclosure_marks_sponsored_even_if_model_missed_it():
    fake = FakeProvider(
        reply(
            {
                "mentions": [
                    mention(post=2, brand_raw="#gymshark", evidence="#gymshark", is_sponsored=False)
                ]
            }
        )
    )
    [f] = extract_mentions(LLM(provider=fake), POSTS)
    assert f.is_sponsored


def test_canonicalise_deterministic_then_llm_merge():
    raws = ["@theordinary", "The Ordinary", "Deciem Skincare", "@mayasmatcha"]
    fake = FakeProvider(
        reply(
            {
                "groups": [
                    {"canonical": "The Ordinary", "variants": ["The Ordinary", "Deciem Skincare"]},
                    {"canonical": "Maya's Matcha", "variants": ["mayasmatcha"]},
                ]
            }
        )
    )
    mapping = canonicalise(LLM(provider=fake), raws)
    assert mapping == {
        "@theordinary": "The Ordinary",
        "The Ordinary": "The Ordinary",
        "Deciem Skincare": "The Ordinary",
        "@mayasmatcha": "Maya's Matcha",
    }


def test_canonicalise_survives_llm_failure():
    fake = FakeProvider(LLMError("rate limited"))
    mapping = canonicalise(LLM(provider=fake), ["@cerave", "Glossier"])
    assert mapping == {"@cerave": "CeraVe", "Glossier": "Glossier"}


def test_canonicalise_skips_llm_for_a_single_brand():
    fake = FakeProvider()
    assert canonicalise(LLM(provider=fake), ["@cerave", "CeraVe"]) == {
        "@cerave": "CeraVe",
        "CeraVe": "CeraVe",
    }
    assert fake.requests == []
