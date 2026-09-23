"""Contract extraction job (BUILD_PLAN §7.2).

extracting → needs_review (terms saved for the creator to check), or → error
with a plain message. LLM hiccups (e.g. free-tier rate limits) are retried by
the worker with backoff; the contract only shows an error after the last try.
"""

import logging
import tempfile
from pathlib import Path
from typing import Any

import psycopg
from psycopg.types.json import Jsonb

from analyzer import storage
from analyzer.config import get_settings
from analyzer.contracts.extract import PROMPT_VERSION, extract_terms
from analyzer.contracts.text import ContractText, from_docx, from_pdf, from_plain
from analyzer.jobs.base import Job, PermanentJobError, RetryLater
from analyzer.llm.client import LLM, LLMError
from analyzer.llm.errors import LLMRateLimited

log = logging.getLogger(__name__)

EXTRACTED_VERSION = 1
# Never retry a rate limit sooner than this; free-tier quotas are per minute.
MIN_RATE_LIMIT_WAIT_S = 30.0
# Contracts longer than this are almost certainly not a single deal.
MAX_CHARS = 200_000


def _load(conn: psycopg.Connection, contract_id) -> dict[str, Any]:
    with conn.transaction():
        row = conn.execute(
            "SELECT id, source, storage_key, raw_text FROM contracts WHERE id = %s", (contract_id,)
        ).fetchone()
    if row is None:
        raise PermanentJobError(f"contract {contract_id} not found")
    return row


def _set(conn: psycopg.Connection, contract_id, status: str, **cols: Any) -> None:
    sets = ["status = %s::contract_status"] + [f"{k} = %s" for k in cols]
    values = [status, *(Jsonb(v) if isinstance(v, dict) else v for v in cols.values())]
    with conn.transaction():
        conn.execute(
            f"UPDATE contracts SET {', '.join(sets)} WHERE id = %s", (*values, contract_id)
        )


def _read(row: dict[str, Any]) -> tuple[ContractText, bytes | None]:
    """Contract text, plus the PDF bytes when it's a scan the LLM must read."""
    if row["source"] == "text":
        return from_plain(row["raw_text"] or ""), None
    with tempfile.TemporaryDirectory(prefix="contract-") as tmp:
        path = storage.download(row["storage_key"], Path(tmp) / f"contract.{row['source']}")
        try:
            ct = from_pdf(path) if row["source"] == "pdf" else from_docx(path)
        except Exception as e:
            log.warning("couldn't read contract %s: %r", row["id"], e)
            raise PermanentJobError(
                "We couldn't read this file. Try exporting it again as PDF or DOCX, or paste the text."
            ) from e
        return ct, (path.read_bytes() if ct.scanned else None)


def _run(job: Job, conn: psycopg.Connection) -> None:
    row = _load(conn, job.ref_id)
    ct, scan = _read(row)
    if scan is None and len(ct.text) < 40:
        raise PermanentJobError(
            "This contract looks empty. Paste the full text or upload the document."
        )
    if len(ct.text) > MAX_CHARS:
        raise PermanentJobError("This document is too long to be a single deal contract.")
    if scan is None:
        _set(conn, row["id"], "extracting", raw_text=ct.text)

    llm = LLM.from_settings(conn=conn, job_id=job.id)
    terms = extract_terms(llm, text=None if scan else ct.text, pdf=scan)
    _set(
        conn,
        row["id"],
        "needs_review",
        extracted={
            "version": EXTRACTED_VERSION,
            "prompt_version": PROMPT_VERSION,
            "scanned": scan is not None,
            "terms": terms.model_dump(mode="json"),
            "llm_cost_usd": round(llm.total_cost_usd, 6),
        },
    )


def run(job: Job, conn: psycopg.Connection) -> None:
    if job.ref_id is None:
        raise PermanentJobError("contract job has no ref_id")
    try:
        _run(job, conn)
    except PermanentJobError as e:
        _set(conn, job.ref_id, "error", extracted={"error": str(e)})
        raise
    except LLMRateLimited as e:
        if job.attempts >= get_settings().worker_max_attempts:
            _set(conn, job.ref_id, "error", extracted={"error": str(e)})
            raise
        raise RetryLater(str(e), max(e.retry_after_s, MIN_RATE_LIMIT_WAIT_S)) from e
    except Exception as e:
        if conn.info.transaction_status != psycopg.pq.TransactionStatus.IDLE:
            conn.rollback()
        if job.attempts >= get_settings().worker_max_attempts:
            message = str(e) if isinstance(e, LLMError) else "Extraction failed. Please try again."
            _set(conn, job.ref_id, "error", extracted={"error": message})
        raise
