"""Brand scan + pitch jobs against real Postgres, with the replay provider and
the same fixtures the Playwright test uses."""

import csv
import json
import shutil
from pathlib import Path

import pytest

from analyzer.config import get_settings
from analyzer.jobs import brands, pitch
from analyzer.jobs.base import Job, PermanentJobError

pytestmark = pytest.mark.db

WEB_E2E = Path(__file__).resolve().parents[3] / "apps" / "web" / "e2e"


@pytest.fixture
def replay(tmp_path, monkeypatch):
    for f in (WEB_E2E / "replay").glob("record_*.json"):
        shutil.copy(f, tmp_path / f.name)
    s = get_settings()
    monkeypatch.setattr(s, "llm_provider", "replay")
    monkeypatch.setattr(s, "llm_replay_dir", str(tmp_path))
    return tmp_path


@pytest.fixture
def creator(jobdb):
    conn = jobdb.conn
    user = conn.execute(
        "INSERT INTO users (is_guest, name, handle) VALUES (true, 'Maya', '@maya') RETURNING id"
    ).fetchone()["id"]
    with open(WEB_E2E / "fixtures" / "posts.csv") as f:
        for row in csv.DictReader(f):
            conn.execute(
                """INSERT INTO posts (user_id, platform, url, posted_at, caption, source)
                   VALUES (%s, %s, %s, %s, %s, 'csv')""",
                (
                    user,
                    "tiktok" if "tiktok" in row["url"] else "instagram",
                    row["url"],
                    row["posted_at"],
                    row["caption"],
                ),
            )
    conn.commit()
    yield user
    conn.execute("DELETE FROM llm_calls WHERE job_id = ANY(%s)", (jobdb.created,))
    conn.execute("DELETE FROM users WHERE id = %s", (user,))
    conn.commit()


def _mentions(conn, user):
    rows = conn.execute(
        """SELECT m.brand_canonical, m.is_sponsored, m.evidence FROM brand_mentions m
             JOIN posts p ON p.id = m.post_id WHERE p.user_id = %s ORDER BY 1""",
        (user,),
    ).fetchall()
    conn.commit()
    return rows


def test_scan_records_grounded_canonical_mentions(jobdb, replay, creator):
    job_id = jobdb.insert("brands_scan", ref_id=creator)
    brands.run(Job(id=job_id, type="brands_scan", ref_id=creator, attempts=1), jobdb.conn)

    rows = _mentions(jobdb.conn, creator)
    names = sorted({r["brand_canonical"] for r in rows})
    assert names == ["CeraVe", "Glossier", "Glow Serum", "Gymshark", "Oatly", "The Ordinary"]
    # "@theordinary" and "The Ordinary" merged; both Glow Serum posts sponsored
    assert sum(r["brand_canonical"] == "The Ordinary" for r in rows) == 2
    assert all(r["is_sponsored"] for r in rows if r["brand_canonical"] == "Glow Serum")
    unscanned = jobdb.conn.execute(
        "SELECT count(*) AS n FROM posts WHERE user_id = %s AND scanned_at IS NULL", (creator,)
    ).fetchone()["n"]
    assert unscanned == 0

    # A second scan with no new posts does nothing (and makes no LLM calls).
    (replay / "record_brand_mentions.json").unlink()
    brands.run(Job(id=job_id, type="brands_scan", ref_id=creator, attempts=1), jobdb.conn)
    assert len(_mentions(jobdb.conn, creator)) == len(rows)


def _pitch(jobdb, creator, brand):
    pid = jobdb.conn.execute(
        """INSERT INTO pitches (user_id, brand_canonical, ask) VALUES (%s, %s, 'gifting') RETURNING id""",
        (creator, brand),
    ).fetchone()["id"]
    jobdb.conn.commit()
    job_id = jobdb.insert("pitch", ref_id=pid)
    return pid, Job(id=job_id, type="pitch", ref_id=pid, attempts=1)


def test_pitch_is_grounded_in_real_posts(jobdb, replay, creator):
    scan = jobdb.insert("brands_scan", ref_id=creator)
    brands.run(Job(id=scan, type="brands_scan", ref_id=creator, attempts=1), jobdb.conn)
    pid, job = _pitch(jobdb, creator, "The Ordinary")
    pitch.run(job, jobdb.conn)

    row = jobdb.conn.execute("SELECT * FROM pitches WHERE id = %s", (pid,)).fetchone()
    jobdb.conn.commit()
    assert row["status"] == "done"
    assert len(row["body"].split()) < 150
    post_ids = {str(p) for p in row["evidence_post_ids"]}
    assert len(post_ids) == 2
    assert all(set(c["post_ids"]) <= post_ids for c in row["claims"])


def test_pitch_for_sponsor_only_brand_is_refused(jobdb, replay, creator):
    scan = jobdb.insert("brands_scan", ref_id=creator)
    brands.run(Job(id=scan, type="brands_scan", ref_id=creator, attempts=1), jobdb.conn)
    pid, job = _pitch(jobdb, creator, "Glow Serum")
    with pytest.raises(PermanentJobError):
        pitch.run(job, jobdb.conn)
    row = jobdb.conn.execute("SELECT status, error FROM pitches WHERE id = %s", (pid,)).fetchone()
    jobdb.conn.commit()
    assert row["status"] == "error" and "No organic posts" in row["error"]


def test_invalid_pitch_citations_are_rejected(jobdb, replay, creator):
    bad = json.loads((replay / "record_pitch.json").read_text())
    bad["claims"][0]["post_ids"] = ["P9"]
    (replay / "record_pitch.json").write_text(json.dumps(bad))
    scan = jobdb.insert("brands_scan", ref_id=creator)
    brands.run(Job(id=scan, type="brands_scan", ref_id=creator, attempts=1), jobdb.conn)
    pid, job = _pitch(jobdb, creator, "The Ordinary")
    job = Job(id=job.id, type="pitch", ref_id=pid, attempts=get_settings().worker_max_attempts)
    with pytest.raises(Exception):  # noqa: B017 - re-raised for the worker
        pitch.run(job, jobdb.conn)
    row = jobdb.conn.execute("SELECT status, error FROM pitches WHERE id = %s", (pid,)).fetchone()
    jobdb.conn.commit()
    assert row["status"] == "error"
