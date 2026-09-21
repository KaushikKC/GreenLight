"""Fixtures for tests that need a real Postgres (`make dev` or `docker compose up -d postgres`).

DB tests are skipped automatically when the database isn't reachable or the
migrations haven't been applied. They only delete rows they created.
"""

import psycopg
import pytest

from analyzer.db import connect


class JobDb:
    def __init__(self, conn: psycopg.Connection):
        self.conn = conn
        self.created: list = []

    def insert(self, type_: str = "noop", **cols) -> str:
        names = ["type", *cols]
        values = [type_, *cols.values()]
        placeholders = ["%s::job_type", *["%s"] * len(cols)]
        row = self.conn.execute(
            f"INSERT INTO jobs ({', '.join(names)}) VALUES ({', '.join(placeholders)}) RETURNING id",
            values,
        ).fetchone()
        self.conn.commit()
        self.created.append(row["id"])
        return row["id"]

    def get(self, job_id) -> dict:
        row = self.conn.execute("SELECT * FROM jobs WHERE id = %s", (job_id,)).fetchone()
        self.conn.commit()
        return row


@pytest.fixture
def jobdb():
    try:
        c = connect()
    except psycopg.OperationalError as e:
        pytest.skip(f"postgres unavailable: {e}")
    if c.execute("SELECT to_regclass('public.jobs') AS t").fetchone()["t"] is None:
        c.close()
        pytest.skip("jobs table missing; run `pnpm --filter web db:migrate`")
    c.commit()
    db = JobDb(c)
    try:
        yield db
    finally:
        c.rollback()
        if db.created:
            c.execute("DELETE FROM jobs WHERE id = ANY(%s)", (db.created,))
            c.commit()
        c.close()
