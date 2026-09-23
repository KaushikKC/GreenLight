"""7-day video auto-delete against real Postgres (storage calls are faked)."""

import pytest

from analyzer.cleanup import delete_expired_videos

pytestmark = pytest.mark.db


@pytest.fixture
def videos(jobdb):
    conn = jobdb.conn
    user = conn.execute("INSERT INTO users (is_guest) VALUES (true) RETURNING id").fetchone()["id"]

    def video(key: str, age_days: int):
        vid = conn.execute(
            """INSERT INTO videos (user_id, storage_key, filename, size_bytes, delete_after)
               VALUES (%s, %s, 'x.mp4', 1, now() + make_interval(days => %s)) RETURNING id""",
            (user, key, 7 - age_days),
        ).fetchone()["id"]
        pid = conn.execute(
            "INSERT INTO preflights (user_id, video_id, platform) VALUES (%s, %s, 'tiktok') RETURNING id",
            (user, vid),
        ).fetchone()["id"]
        conn.commit()
        return vid, pid

    yield video
    conn.execute("DELETE FROM users WHERE id = %s", (user,))
    conn.commit()


def test_only_expired_videos_are_deleted(jobdb, videos):
    old_vid, old_pid = videos("videos/u/old.mp4", age_days=8)
    new_vid, _ = videos("videos/u/new.mp4", age_days=1)
    deleted, prefixes = [], []

    n = delete_expired_videos(
        jobdb.conn, delete=deleted.append, delete_prefix=lambda p: prefixes.append(p) or 3
    )
    assert n >= 1
    assert "videos/u/old.mp4" in deleted and "videos/u/new.mp4" not in deleted
    assert f"preflights/{old_pid}/frames/" in prefixes

    state = {
        r["id"]: r["deleted_at"]
        for r in jobdb.conn.execute(
            "SELECT id, deleted_at FROM videos WHERE id = ANY(%s)", ([old_vid, new_vid],)
        )
    }
    jobdb.conn.commit()
    assert state[old_vid] is not None and state[new_vid] is None

    # Already-deleted videos aren't touched again.
    again = []
    delete_expired_videos(jobdb.conn, delete=again.append, delete_prefix=lambda p: 0)
    assert "videos/u/old.mp4" not in again


def test_storage_failure_leaves_video_for_next_sweep(jobdb, videos):
    vid, _ = videos("videos/u/flaky.mp4", age_days=9)

    def boom(key):
        if key == "videos/u/flaky.mp4":
            raise RuntimeError("s3 down")

    delete_expired_videos(jobdb.conn, delete=boom, delete_prefix=lambda p: 0)
    row = jobdb.conn.execute("SELECT deleted_at FROM videos WHERE id = %s", (vid,)).fetchone()
    jobdb.conn.commit()
    assert row["deleted_at"] is None
