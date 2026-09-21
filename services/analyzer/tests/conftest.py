"""Fixtures for tests that need a real Postgres (`make dev` or `docker compose up -d postgres`).

DB tests are skipped automatically when the database isn't reachable or the
migrations haven't been applied.
"""

import psycopg
import pytest

from analyzer.db import connect


@pytest.fixture
def conn():
    try:
        c = connect()
    except psycopg.OperationalError as e:
        pytest.skip(f"postgres unavailable: {e}")
    try:
        exists = c.execute("SELECT to_regclass('public.jobs') AS t").fetchone()["t"]
        if exists is None:
            pytest.skip("jobs table missing; run `pnpm --filter web db:migrate`")
        c.commit()
        yield c
    finally:
        # Only remove what the tests created.
        c.rollback()
        c.execute("DELETE FROM jobs WHERE error LIKE 'test:%%' OR type = 'noop'")
        c.commit()
        c.close()


def insert_job(conn, type_: str = "noop") -> str:
    row = conn.execute(
        "INSERT INTO jobs (type) VALUES (%s::job_type) RETURNING id", (type_,)
    ).fetchone()
    conn.commit()
    return row["id"]


def job_row(conn, job_id):
    row = conn.execute("SELECT * FROM jobs WHERE id = %s", (job_id,)).fetchone()
    conn.commit()
    return row
