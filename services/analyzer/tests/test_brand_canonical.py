from analyzer.brands.canonical import canonical_key, display_name, group_by_key
from analyzer.brands.sponsored import caption_discloses


def test_same_brand_written_differently_shares_a_key():
    keys = {
        canonical_key(r)
        for r in ["The Ordinary", "theordinary", "@theordinary", "#TheOrdinary", "the ordinary."]
    }
    assert keys == {"theordinary"}


def test_suffixes_are_stripped():
    assert canonical_key("Glossier Official") == "glossier"
    assert canonical_key("@glossierofficial") == "glossier"
    assert canonical_key("Nike UK") == "nike"
    assert canonical_key("Paula's Choice") == "paulaschoice"
    assert canonical_key("H&M") == "handm"


def test_short_names_keep_their_suffix_letters():
    assert canonical_key("Co") == "co"  # never strip a name to nothing
    assert canonical_key("Asos") == "asos"


def test_display_name_uses_alias_or_best_written_form():
    assert display_name(["@theordinary", "theordinary"]) == "The Ordinary"
    assert display_name(["@lrp"]) == "La Roche-Posay"
    assert display_name(["maya's matcha", "Maya's Matcha", "Maya's Matcha"]) == "Maya's Matcha"
    assert display_name(["#newbrandco"]) == "newbrandco"


def test_group_by_key():
    groups = group_by_key(["CeraVe", "@cerave", "Glossier"])
    assert groups == {"cerave": ["CeraVe", "@cerave"], "glossier": ["Glossier"]}


def test_caption_disclosure():
    assert caption_discloses("love this #ad") == "#ad"
    assert caption_discloses("use code MAYA10 for 10% off") in {"use code"}
    assert caption_discloses("#gifted by the lovely team") == "#gifted"
    assert caption_discloses("adventure time #adventure") is None
    assert caption_discloses(None) is None
