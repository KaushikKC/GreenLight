from analyzer.checks import ALL_CHECKS, run_checks
from analyzer.checks.base import CheckSpec
from analyzer.models import AnalysisContext, CheckResult
from tests.factories import ctx, frame


def test_runs_every_deterministic_check_once():
    results = run_checks(ctx())
    assert [r.id for r in results] == [s.id for s in ALL_CHECKS]
    assert len({r.id for r in results}) == len(results)


def test_failed_step_marks_dependent_checks_error_only():
    results = {r.id: r for r in run_checks(ctx(audio=None))}
    assert results["audio.loudness"].status == "error"
    assert results["read.captions"].status == "error"
    assert results["format.aspect"].status == "pass"


def test_ocr_failure_marks_ocr_checks_error():
    frames = [frame(0).model_copy(update={"ocr_ok": False})]
    results = {r.id: r for r in run_checks(ctx(frames=frames))}
    assert results["read.safe_zone"].status == "error"
    assert results["tech.blur"].status != "error"


def test_crashing_check_becomes_error_not_exception():
    def boom(_: AnalysisContext) -> CheckResult:
        raise ValueError("nope")

    [r] = run_checks(ctx(), [CheckSpec("x.boom", "technical", boom)])
    assert r.status == "error"
    assert r.title == "Couldn't check"


def test_spec_estimate_flag_is_applied():
    results = {r.id: r for r in run_checks(ctx())}
    assert results["audio.music"].estimate
    assert not results["format.aspect"].estimate
