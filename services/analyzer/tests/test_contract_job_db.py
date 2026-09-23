"""Contract job against real Postgres, with the replay LLM provider."""

import shutil
from pathlib import Path

import pytest

from analyzer.config import get_settings
from analyzer.jobs import contract
from analyzer.jobs.base import Job, PermanentJobError

pytestmark = pytest.mark.db

FIXTURES = Path(__file__).parent / "fixtures"


@pytest.fixture
def replay(tmp_path, monkeypatch):
    shutil.copy(FIXTURES / "contract_glow_terms.json", tmp_path / "record_contract_terms.json")
    s = get_settings()
    monkeypatch.setattr(s, "llm_provider", "replay")
    monkeypatch.setattr(s, "llm_replay_dir", str(tmp_path))
    return tmp_path


def _contract(jobdb, text: str):
    conn = jobdb.conn
    user = conn.execute("INSERT INTO users (is_guest) VALUES (true) RETURNING id").fetchone()["id"]
    cid = conn.execute(
        "INSERT INTO contracts (user_id, source, raw_text) VALUES (%s, 'text', %s) RETURNING id",
        (user, text),
    ).fetchone()["id"]
    conn.commit()
    job_id = jobdb.insert("contract", ref_id=cid)
    return user, cid, Job(id=job_id, type="contract", ref_id=cid, attempts=1)


def _row(jobdb, cid):
    row = jobdb.conn.execute("SELECT * FROM contracts WHERE id = %s", (cid,)).fetchone()
    jobdb.conn.commit()
    return row


def _cleanup(jobdb, user):
    jobdb.conn.execute("DELETE FROM llm_calls WHERE job_id = ANY(%s)", (jobdb.created,))
    jobdb.conn.execute("DELETE FROM users WHERE id = %s", (user,))
    jobdb.conn.commit()


def test_text_contract_is_extracted_for_review(jobdb, replay):
    user, cid, job = _contract(jobdb, (FIXTURES / "contract_glow.txt").read_text())
    try:
        contract.run(job, jobdb.conn)
        row = _row(jobdb, cid)
        assert row["status"] == "needs_review"
        ex = row["extracted"]
        assert ex["prompt_version"] == "contract_v1"
        assert ex["terms"]["fee"]["amount"] == 2500
        flag_types = {f["type"] for f in ex["terms"]["red_flags"]}
        assert {"ai_likeness", "late_payment", "perpetual_usage"} <= flag_types
        assert "INFLUENCER SERVICES AGREEMENT" in row["raw_text"]
    finally:
        _cleanup(jobdb, user)


def test_empty_contract_errors_permanently(jobdb, replay):
    user, cid, job = _contract(jobdb, "   hi  ")
    try:
        with pytest.raises(PermanentJobError):
            contract.run(job, jobdb.conn)
        row = _row(jobdb, cid)
        assert row["status"] == "error"
        assert "empty" in row["extracted"]["error"]
    finally:
        _cleanup(jobdb, user)


def test_llm_failure_on_last_attempt_marks_error(jobdb, replay):
    (replay / "record_contract_terms.json").unlink()  # replay has no answer → LLMError
    user, cid, job = _contract(jobdb, (FIXTURES / "contract_glow.txt").read_text())
    job = Job(id=job.id, type="contract", ref_id=cid, attempts=get_settings().worker_max_attempts)
    try:
        with pytest.raises(Exception):  # noqa: B017 - any failure is re-raised for the worker
            contract.run(job, jobdb.conn)
        row = _row(jobdb, cid)
        assert row["status"] == "error"
        assert "No saved AI answer" in row["extracted"]["error"]
    finally:
        _cleanup(jobdb, user)
