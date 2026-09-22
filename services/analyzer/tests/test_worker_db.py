"""End-to-end queue behaviour against real Postgres.

Test jobs are back-dated so they're claimed before any other queued rows.
Don't run these while a real worker is polling the same database.
"""

from datetime import UTC, datetime, timedelta

import pytest

from analyzer import queue
from analyzer.db import connect
from analyzer.jobs import PermanentJobError
from analyzer.worker import run_one

pytestmark = pytest.mark.db

EARLY = datetime(2000, 1, 1, tzinfo=UTC)


def ok(job, conn):
    pass


def boom(job, conn):
    raise RuntimeError("test: kaboom")


def bad_input(job, conn):
    raise PermanentJobError("test: bad input")


def test_noop_job_runs_to_done(jobdb):
    job_id = jobdb.insert(run_after=EARLY)
    job = run_one(jobdb.conn, {"noop": ok}, max_attempts=3)
    assert job.id == job_id
    row = jobdb.get(job_id)
    assert row["status"] == "done"
    assert row["attempts"] == 1
    assert row["locked_at"] is None


def test_failure_is_requeued_with_backoff(jobdb):
    job_id = jobdb.insert(run_after=EARLY)
    run_one(jobdb.conn, {"noop": boom}, max_attempts=3)
    row = jobdb.get(job_id)
    assert row["status"] == "queued"
    assert "kaboom" in row["error"]
    assert row["run_after"] > datetime.now(UTC)


def test_failure_on_last_attempt_marks_error(jobdb):
    job_id = jobdb.insert(run_after=EARLY, attempts=2)
    run_one(jobdb.conn, {"noop": boom}, max_attempts=3)
    row = jobdb.get(job_id)
    assert row["status"] == "error"
    assert row["attempts"] == 3


def test_permanent_error_skips_retries(jobdb):
    job_id = jobdb.insert(run_after=EARLY)
    run_one(jobdb.conn, {"noop": bad_input}, max_attempts=3)
    assert jobdb.get(job_id)["status"] == "error"


def test_unknown_type_errors_without_retry(jobdb):
    job_id = jobdb.insert("pitch", run_after=EARLY)
    run_one(jobdb.conn, {}, max_attempts=3)
    row = jobdb.get(job_id)
    assert row["status"] == "error"
    assert "no handler" in row["error"]


def test_skip_locked_gives_each_worker_a_different_job(jobdb):
    a = jobdb.insert(run_after=EARLY)
    b = jobdb.insert(run_after=EARLY + timedelta(seconds=1))
    # Hold worker 1's row lock open while worker 2 claims.
    with connect() as other, jobdb.conn.transaction():
        first = jobdb.conn.execute(queue.CLAIM_SQL).fetchone()
        second = queue.claim(other)
    assert {first["id"], second.id} == {a, b}


def test_stale_running_job_is_recovered(jobdb):
    old = datetime.now(UTC) - timedelta(hours=1)
    retry_id = jobdb.insert(status="running", locked_at=old, attempts=1)
    dead_id = jobdb.insert(status="running", locked_at=old, attempts=3)
    queue.requeue_stale(jobdb.conn, stale_after_s=600, max_attempts=3)
    assert jobdb.get(retry_id)["status"] == "queued"
    assert jobdb.get(dead_id)["status"] == "error"


def test_llm_calls_are_logged_with_cost(jobdb):
    from pydantic import BaseModel

    from analyzer.llm.client import LLM
    from tests.fake_anthropic import FakeAnthropic, response, tool_use, usage

    class Out(BaseModel):
        ok: bool

    job_id = jobdb.insert()
    fake = FakeAnthropic(response(tool_use("t", {"ok": True}), u=usage(inp=1000, out=100)))
    LLM(client=fake, conn=jobdb.conn, job_id=job_id).call_tool(
        purpose="test_logging",
        model="claude-sonnet-5",
        system="s",
        content=[{"type": "text", "text": "x"}],
        output=Out,
        tool_name="t",
        tool_description="d",
    )
    row = jobdb.conn.execute("SELECT * FROM llm_calls WHERE job_id = %s", (job_id,)).fetchone()
    jobdb.conn.execute("DELETE FROM llm_calls WHERE job_id = %s", (job_id,))
    jobdb.conn.commit()
    assert row["purpose"] == "test_logging"
    assert (row["input_tokens"], row["output_tokens"]) == (1000, 100)
    assert float(row["cost_usd"]) == pytest.approx(0.003)
    assert row["latency_ms"] is not None
