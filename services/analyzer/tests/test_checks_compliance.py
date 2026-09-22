from analyzer.checks import comp_disclosure
from analyzer.checks.base import find_phrase
from analyzer.llm.judgements import SpokenDisclosure
from tests.factories import ctx, frame, judgements, text, transcript


class TestFindPhrase:
    def test_hashtag_is_whole_tag(self):
        assert find_phrase("love it #ad #skincare", ["#ad"]) == "#ad"
        assert find_phrase("#adventure time", ["#ad"]) is None
        assert find_phrase("#AD, obviously", ["#ad"]) == "#ad"

    def test_phrase_is_whole_words(self):
        assert find_phrase("in paid partnership with X", ["paid partnership"]) == "paid partnership"
        assert find_phrase("entry item", ["try it"]) is None


class TestDisclosure:
    def test_caption_tag_passes(self):
        r = comp_disclosure.check(ctx(caption_text="my routine #ad"))
        assert r.status == "pass"
        assert "caption" in r.explanation

    def test_on_screen_tag_passes_with_frame(self):
        r = comp_disclosure.check(ctx(caption_text="my routine", frames=[frame(1.0, text("#AD"))]))
        assert r.status == "pass"
        assert r.timestamp_s == 1.0

    def test_spoken_phrase_passes(self):
        t = transcript((0.5, 2.0, "This video is sponsored by Glow."))
        assert comp_disclosure.check(ctx(caption_text="hi", transcript=t)).status == "pass"

    def test_llm_spoken_disclosure_passes(self):
        j = judgements(spoken_disclosure=SpokenDisclosure(present=True, timestamp_s=1.0, quote="they sent me this"))
        assert comp_disclosure.check(ctx(caption_text="hi", llm=j)).status == "pass"

    def test_caption_without_disclosure_fails(self):
        r = comp_disclosure.check(ctx(caption_text="my morning routine", llm=judgements()))
        assert r.status == "fail"
        assert "#ad" in r.fix

    def test_no_caption_and_nothing_else_warns(self):
        r = comp_disclosure.check(ctx(caption_text=None, llm=judgements()))
        assert r.status == "warn"
