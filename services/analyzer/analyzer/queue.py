"""Postgres-backed job queue (the `jobs` table). No Redis.

Every function runs in its own short transaction so a slow handler never
holds a row lock.
"""

import psycopg

from analyzer.jobs.base import Job

CLAIM_SQL = """
UPDATE jobs
   SET status = 'running',
       locked_at = now(),
       attempts = attempts + 1,
       updated_at = now()
 WHERE id = (
        SELECT id FROM jobs
         WHERE status = 'queued' AND run_after <= now()
         ORDER BY run_after, created_at
         FOR UPDATE SKIP LOCKED
         LIMIT 1
       )
RETURNING id, type, ref_id, attempts
"""


def claim(conn: psycopg.Connection) -> Job | None:
    """Atomically take the next runnable job, or None if the queue is empty."""
    with conn.transaction():
        row = conn.execute(CLAIM_SQL).fetchone()
    if row is None:
        return None
    return Job(id=row["id"], type=row["type"], ref_id=row["ref_id"], attempts=row["attempts"])


def complete(conn: psycopg.Connection, job: Job) -> None:
    with conn.transaction():
        conn.execute(
            """UPDATE jobs SET status = 'done', locked_at = NULL, error = NULL,
                   updated_at = now()
                WHERE id = %s""",
            (job.id,),
        )


def backoff_s(attempts: int) -> int:
    """Seconds to wait before the next attempt: 5, 10, 20, … capped at 5 min."""
    return min(5 * 2 ** max(attempts - 1, 0), 300)


def fail(
    conn: psycopg.Connection, job: Job, error: str, *, max_attempts: int, permanent: bool = False
) -> str:
    """Record a failure. Re-queues with backoff unless out of attempts. Returns new status."""
    retry = not permanent and job.attempts < max_attempts
    status = "queued" if retry else "error"
    with conn.transaction():
        conn.execute(
            """UPDATE jobs SET status = %s, locked_at = NULL, error = %s,
                   run_after = now() + make_interval(secs => %s),
                   updated_at = now()
                WHERE id = %s""",
            (status, error[:2000], backoff_s(job.attempts) if retry else 0, job.id),
        )
    return status


def requeue_stale(conn: psycopg.Connection, stale_after_s: int) -> int:
    """Put back jobs whose worker died mid-run. Returns how many were re-queued."""
    with conn.transaction():
        cur = conn.execute(
            """UPDATE jobs SET status = 'queued', locked_at = NULL, updated_at = now()
                WHERE status = 'running'
                  AND locked_at < now() - make_interval(secs => %s)""",
            (stale_after_s,),
        )
    return cur.rowcount
