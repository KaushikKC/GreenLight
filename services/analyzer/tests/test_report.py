from analyzer.checks import run_checks
from analyzer.models import CheckResult
from analyzer.report import build_report, fix_list
from analyzer.scoring import score_checks
from tests.factories import ctx


def c(id_, group, status, severity="medium", fix="do it", t=None):
    return CheckResult(
        id=id_,
        group=group,
        status=status,
        severity=severity,
        title="t",
        explanation="e",
        fix=fix,
        timestamp_s=t,
    )


def test_fix_list_orders_fails_then_severity_then_group_weight():
    items = fix_list(
        [
            c("tech", "technical", "warn", "medium"),
            c("hook", "hook", "warn", "medium"),
            c("read", "readability", "fail", "high"),
            c("fmt", "format", "warn", "high"),
            c("ok", "format", "pass"),
            c("nofix", "audio", "warn", fix=None),
        ]
    )
    assert [i["check_id"] for i in items] == ["read", "fmt", "hook", "tech"]
    assert [i["n"] for i in items] == [1, 2, 3, 4]


def test_report_has_plan_shape():
    context = ctx()
    checks = run_checks(context)
    report = build_report(
        context, checks, score_checks(checks), [{"step": "probe", "status": "done"}]
    )
    for key in (
        "version",
        "progress",
        "score",
        "verdict",
        "checks",
        "transcript",
        "meta",
        "fix_list",
    ):
        assert key in report
    assert report["meta"]["width"] == 1080
    assert report["checks"][0]["id"]
