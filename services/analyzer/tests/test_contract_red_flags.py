import json
from pathlib import Path

from analyzer.contracts.red_flags import derive_red_flags, merge_red_flags
from analyzer.contracts.terms import ContractTerms

FIXTURE = Path(__file__).parent / "fixtures" / "contract_glow_terms.json"


def terms(**overrides) -> ContractTerms:
    data = json.loads(FIXTURE.read_text())
    data.update(overrides)
    return ContractTerms.model_validate(data)


def test_fixture_is_valid():
    t = terms()
    assert t.fee.amount == 2500 and t.brand_category_id == "skincare"


def test_derives_late_payment_perpetual_worldwide_and_unlimited_revisions():
    types = {f.type for f in derive_red_flags(terms())}
    assert {"late_payment", "perpetual_usage", "worldwide_paid_usage", "unlimited_revisions"} <= types


def test_derived_flags_quote_the_contract():
    late = next(f for f in derive_red_flags(terms()) if f.type == "late_payment")
    assert "ninety (90) days" in late.quote


def test_exclusivity_longer_than_usage():
    data = json.loads(FIXTURE.read_text())
    data["usage_rights"] = [data["usage_rights"][0] | {"end": "2026-06-30"}]
    flags = derive_red_flags(ContractTerms.model_validate(data))
    assert any(f.type == "exclusivity_exceeds_usage" for f in flags)


def test_no_exclusivity_flag_when_usage_is_perpetual():
    assert not any(f.type == "exclusivity_exceeds_usage" for f in derive_red_flags(terms()))


def test_payment_within_threshold_is_fine():
    data = json.loads(FIXTURE.read_text())
    data["payment_terms"]["net_days"] = 30
    assert not any(f.type == "late_payment" for f in derive_red_flags(ContractTerms.model_validate(data)))


def test_merge_keeps_llm_flags_and_adds_only_new_types():
    t = terms()
    merged = merge_red_flags(t.red_flags, derive_red_flags(t))
    types = [f.type for f in merged]
    assert types[:2] == ["ai_likeness", "raw_footage"]
    assert len(types) == len(set(types)) or types.count("perpetual_usage") == 1
