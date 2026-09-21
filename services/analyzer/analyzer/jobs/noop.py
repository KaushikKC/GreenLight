"""No-op job used to prove the queue works end-to-end (Phase 0)."""

import logging
import time

import psycopg

from analyzer.jobs.base import Job

log = logging.getLogger(__name__)


def run(job: Job, conn: psycopg.Connection) -> None:
    log.info("noop job %s: pretending to work", job.id)
    time.sleep(1.0)
