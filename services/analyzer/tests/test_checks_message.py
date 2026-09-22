from analyzer.checks import msg_brief_donts, msg_brief_points, msg_claims, msg_cta
from analyzer.llm.judgements import BriefPoint, BriefViolation, Cta, RiskyClaim
from tests.factories import ctx, frame, judgements, probe, text, transcript

BRIEF = "Mention the 30-day guarantee. Say it's fragrance-free. Don't mention competitors."


def point(p, covered, mandatory=True, t=None):
    return BriefPoint(point=p, mandatory=mandatory, covered=covered, timestamp_s=t, quote="q" if covered else None)


class TestBriefPoints:
    def test_no_brief_is_na_even_without_llm(self):
        assert msg_brief_points.check(ctx(brief_text=None, llm=None)).status == "na"

    def test_brief_but_llm_failed_is_error(self):
        assert msg_brief_points.check(ctx(brief_text=BRIEF, llm=None)).status == "error"

    def test_all_covered_passes_with_timestamps(self):
        j = judgements(brief_points=[point("30-day guarantee", True, t=8.2), point("fragrance-free", True, t=12.0)])
        r = msg_brief_points.check(ctx(brief_text=BRIEF, llm=j))
        assert r.status == "pass"
        assert "8.2s" in r.explanation

    def test_missing_mandatory_fails(self):
        j = judgements(brief_points=[point("30-day guarantee", False), point("fragrance-free", True, t=12)])
        r = msg_brief_points.check(ctx(brief_text=BRIEF, llm=j))
        assert r.status == "fail"
        assert "30-day guarantee" in r.fix

    def test_missing_optional_only_warns(self):
        j = judgements(brief_points=[point("mention the app", False, mandatory=False), point("guarantee", True, t=3)])
        assert msg_brief_points.check(ctx(brief_text=BRIEF, llm=j)).status == "warn"


class TestBriefDonts:
    def test_clean_passes(self):
        assert msg_brief_donts.check(ctx(brief_text=BRIEF, llm=judgements())).status == "pass"

    def test_violation_fails_at_earliest(self):
        j = judgements(
            brief_violations=[
                BriefViolation(rule="Don't mention competitors", timestamp_s=14.0, evidence="Says 'better than CeraVe'"),
                BriefViolation(rule="No bathroom setting", timestamp_s=2.0, evidence="Filmed in a bathroom"),
            ]
        )
        r = msg_brief_donts.check(ctx(brief_text=BRIEF, llm=j))
        assert r.status == "fail"
        assert r.timestamp_s == 2.0
        assert "+1 more" in r.explanation


class TestCta:
    def test_llm_cta_at_end_passes(self):
        r = msg_cta.check(ctx(probe=probe(duration_s=30), llm=judgements(cta=Cta(present=True, timestamp_s=27, quote="Tap the link"))))
        assert r.status == "pass"
        assert r.timestamp_s == 27

    def test_llm_cta_too_early_warns(self):
        j = judgements(cta=Cta(present=True, timestamp_s=5, quote="Use code GLOW"))
        r = msg_cta.check(ctx(probe=probe(duration_s=30), llm=j))
        assert r.status == "warn"
        assert "5.0s" in r.explanation

    def test_spoken_phrase_found_without_llm(self):
        t = transcript((26.0, 28.5, "Tap the link to try it."))
        r = msg_cta.check(ctx(probe=probe(duration_s=30), transcript=t, llm=None))
        assert r.status == "pass"
        assert "AI review unavailable" in r.explanation

    def test_on_screen_phrase_found(self):
        frames = [frame(29.0, text("SHOP NOW"))]
        r = msg_cta.check(ctx(probe=probe(duration_s=30), frames=frames, llm=judgements(cta=Cta(present=False, timestamp_s=None, quote=None))))
        assert r.status == "pass"

    def test_nothing_warns(self):
        r = msg_cta.check(ctx(probe=probe(duration_s=30), llm=judgements(cta=Cta(present=False, timestamp_s=None, quote=None))))
        assert r.status == "warn"
        assert r.timestamp_s == 25.0


class TestClaims:
    def test_none_passes(self):
        assert msg_claims.check(ctx(llm=judgements())).status == "pass"

    def test_claims_warn_with_quote(self):
        j = judgements(risky_claims=[RiskyClaim(quote="it cured my eczema", timestamp_s=9.0, why="Medical claim.")])
        r = msg_claims.check(ctx(llm=j))
        assert r.status == "warn"
        assert "cured my eczema" in r.explanation
        assert r.timestamp_s == 9.0
