"""Job loop: poll the jobs table, run handlers, record the outcome.

Run with `uv run python -m analyzer.worker`.
"""

import logging
import signal
import time
import traceback

import psycopg

from analyzer import queue
from analyzer.config import get_settings
from analyzer.db import connect
from analyzer.jobs import HANDLERS, Handler, Job, PermanentJobError

log = logging.getLogger("analyzer.worker")

STALE_CHECK_EVERY_S = 60


def run_one(conn: psycopg.Connection, handlers: dict[str, Handler], max_attempts: int) -> Job | None:
    """Claim and run a single job. Returns the job, or None if the queue was empty."""
    job = queue.claim(conn)
    if job is None:
        return None

    handler = handlers.get(job.type)
    if handler is None:
        queue.fail(conn, job, f"no handler for job type {job.type!r}",
                   max_attempts=max_attempts, permanent=True)
        log.error("job %s: no handler for type %s", job.id, job.type)
        return job

    log.info("job %s (%s) attempt %d: start", job.id, job.type, job.attempts)
    started = time.monotonic()
    try:
        handler(job, conn)
    except PermanentJobError as e:
        queue.fail(conn, job, str(e), max_attempts=max_attempts, permanent=True)
        log.error("job %s: permanent failure: %s", job.id, e)
    except Exception as e:  # noqa: BLE001 - a handler bug must never kill the loop
        if conn.info.transaction_status != psycopg.pq.TransactionStatus.IDLE:
            conn.rollback()
        status = queue.fail(conn, job, f"{type(e).__name__}: {e}", max_attempts=max_attempts)
        log.error("job %s: failed (%s)\n%s", job.id, status, traceback.format_exc())
    else:
        queue.complete(conn, job)
        log.info("job %s: done in %.1fs", job.id, time.monotonic() - started)
    return job


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
    settings = get_settings()

    stopping = False

    def stop(signum: int, _frame: object) -> None:
        nonlocal stopping
        log.info("received %s, finishing current job then exiting", signal.Signals(signum).name)
        stopping = True

    signal.signal(signal.SIGINT, stop)
    signal.signal(signal.SIGTERM, stop)

    log.info("worker started (poll every %.1fs)", settings.worker_poll_interval_s)
    last_stale_check = 0.0
    while not stopping:
        try:
            with connect() as conn:
                while not stopping:
                    now = time.monotonic()
                    if now - last_stale_check > STALE_CHECK_EVERY_S:
                        n = queue.requeue_stale(conn, settings.worker_stale_lock_s,
                                                max_attempts=settings.worker_max_attempts)
                        if n:
                            log.warning("recovered %d stale job(s)", n)
                        last_stale_check = now
                    if run_one(conn, HANDLERS, settings.worker_max_attempts) is None:
                        time.sleep(settings.worker_poll_interval_s)
        except psycopg.OperationalError as e:
            log.warning("database unavailable (%s); retrying in 3s", e)
            time.sleep(3)
    log.info("worker stopped")


if __name__ == "__main__":
    main()
