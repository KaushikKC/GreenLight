from analyzer.models import CheckResult
from analyzer.scoring import score_checks, verdict_for


def c(id_: str, group: str, status: str) -> CheckResult:
    return CheckResult(id=id_, group=group, status=status, severity="info", title="t", explanation="e")


def test_all_pass_is_100_ready():
    r = score_checks([c("a", "hook", "pass"), c("b", "format", "pass")])
    assert r.score == 100
    assert r.verdict == "ready"


def test_warn_is_half_points():
    r = score_checks([c("a", "format", "warn")])
    assert r.score == 50


def test_weights_redistribute_over_scored_groups():
    # hook 30 pass, format 10 fail -> 30/40 = 75
    r = score_checks([c("a", "hook", "pass"), c("b", "format", "fail")])
    assert r.score == 75
    assert r.verdict == "fix_first"
    assert {g.group: g.effective_weight for g in r.groups} == {"hook": 75.0, "format": 25.0}


def test_na_info_error_are_excluded():
    r = score_checks(
        [
            c("a", "format", "pass"),
            c("b", "format", "na"),
            c("c", "format", "error"),
            c("d", "hook", "info"),
        ]
    )
    assert r.score == 100
    assert "hook" in r.uncounted_groups
    assert r.groups[0].excluded == 2


def test_disclosure_fail_caps_at_49():
    r = score_checks([c("comp.disclosure", "compliance", "fail")] + [c(f"h{i}", "hook", "pass") for i in range(5)])
    assert r.raw_score > 49
    assert r.score == 49
    assert r.verdict == "not_ready"
    assert r.caps == ["comp.disclosure"]


def test_brief_donts_fail_caps():
    r = score_checks([c("msg.brief_donts", "message", "fail"), c("a", "hook", "pass")])
    assert r.score <= 49


def test_verdict_boundaries():
    assert verdict_for(80) == "ready"
    assert verdict_for(79) == "fix_first"
    assert verdict_for(50) == "fix_first"
    assert verdict_for(49) == "not_ready"


def test_nothing_scored():
    r = score_checks([c("a", "hook", "info")])
    assert r.score == 0
    assert r.groups == []
