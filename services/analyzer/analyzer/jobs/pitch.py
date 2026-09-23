"""Pitch drafting job (BUILD_PLAN §8.3). jobs.ref_id is the pitch id.

The model only sees the creator's real posts that mention the brand, as short
ids (P1, P2, ...), and the output is rejected if it cites anything else or
mentions follower numbers the creator didn't give. We never send it.
"""

import logging
from typing import Any

import psycopg
from psycopg.types.json import Jsonb

from analyzer.brands.schemas import Pitch
from analyzer.config import get_settings
from analyzer.jobs.base import Job, PermanentJobError, RetryLater
from analyzer.llm.client import LLM, LLMError
from analyzer.llm.errors import LLMRateLimited
from analyzer.llm.prompt_loader import load_prompt
from analyzer.llm.types import Text

log = logging.getLogger(__name__)

PROMPT_VERSION = "pitch_v1"
MAX_EVIDENCE_POSTS = 8
ASKS = {
    "gifting": "a gifted product in exchange for honest content",
    "paid": "a paid post",
    "affiliate": "an affiliate partnership (a code or link with commission)",
}


def _load(conn: psycopg.Connection, pitch_id) -> dict[str, Any]:
    with conn.transaction():
        row = conn.execute(
            """SELECT pi.id, pi.user_id, pi.brand_canonical, pi.ask, pi.note,
                      u.name, u.handle, u.niche, u.audience, u.followers
                 FROM pitches pi JOIN users u ON u.id = pi.user_id
                WHERE pi.id = %s""",
            (pitch_id,),
        ).fetchone()
    if row is None:
        raise PermanentJobError(f"pitch {pitch_id} not found")
    return row


def _evidence(conn: psycopg.Connection, user_id, brand: str) -> list[dict[str, Any]]:
    """Organic posts mentioning the brand, most recent first (one row per post)."""
    with conn.transaction():
        rows = conn.execute(
            """SELECT DISTINCT ON (p.id) p.id, p.posted_at, p.platform, p.url, p.caption,
                      m.evidence, m.product
                 FROM brand_mentions m JOIN posts p ON p.id = m.post_id
                WHERE p.user_id = %s AND m.brand_canonical = %s AND NOT m.is_sponsored
                ORDER BY p.id, m.confidence DESC NULLS LAST""",
            (user_id, brand),
        ).fetchall()
    rows.sort(key=lambda r: r["posted_at"].isoformat() if r["posted_at"] else "", reverse=True)
    return rows[:MAX_EVIDENCE_POSTS]


def build_prompt(row: dict[str, Any], evidence: list[dict[str, Any]]) -> str:
    profile = [
        f"Name: {row['name']}" if row["name"] and row["name"] != "Guest" else None,
        f"Handle: {row['handle']}" if row["handle"] else None,
        f"Niche: {row['niche']}" if row["niche"] else None,
        f"Audience: {row['audience']}" if row["audience"] else None,
        f"Followers: {row['followers']}"
        if row["followers"] is not None
        else "Followers: (not given: don't mention any)",
    ]
    posts = []
    for i, e in enumerate(evidence, start=1):
        when = e["posted_at"].date().isoformat() if e["posted_at"] else "undated"
        posts.append(
            f'P{i} ({e["platform"] or "post"}, {when}): caption: "{(e["caption"] or "")[:600]}"'
            + (f' | mention: "{e["evidence"]}"' if e["evidence"] else "")
        )
    ask = ASKS.get(row["ask"] or "", None)
    return "\n\n".join(
        [
            f"Brand: {row['brand_canonical']}",
            "Creator profile:\n" + "\n".join(p for p in profile if p),
            f"Ask: {ask}" if ask else "Ask: (none given)",
            f"Creator's note: {row['note']}" if row["note"] else "",
            "Evidence posts (the only posts you may reference):\n" + "\n".join(posts),
            "Write the pitch with record_pitch.",
        ]
    ).replace("\n\n\n\n", "\n\n")


def _fail(conn: psycopg.Connection, pitch_id, message: str) -> None:
    with conn.transaction():
        conn.execute(
            "UPDATE pitches SET status = 'error', error = %s WHERE id = %s", (message, pitch_id)
        )


def _run(job: Job, conn: psycopg.Connection) -> None:
    row = _load(conn, job.ref_id)
    evidence = _evidence(conn, row["user_id"], row["brand_canonical"])
    if not evidence:
        raise PermanentJobError(
            f"No organic posts mention {row['brand_canonical']}, so there's nothing genuine to pitch with."
        )
    with conn.transaction():
        conn.execute("UPDATE pitches SET status = 'running' WHERE id = %s", (row["id"],))

    ids = {f"P{i}": str(e["id"]) for i, e in enumerate(evidence, start=1)}
    llm = LLM.from_settings(conn=conn, job_id=job.id)
    pitch = llm.structured(
        purpose="pitch",
        system=load_prompt(PROMPT_VERSION),
        parts=[Text(build_prompt(row, evidence))],
        output=Pitch,
        name="record_pitch",
        description="A short, warm pitch email grounded only in the evidence posts.",
        max_tokens=4000,
        validation_context={"post_ids": set(ids), "followers": row["followers"]},
    ).output

    claims = [{"text": c.text, "post_ids": [ids[p] for p in c.post_ids]} for c in pitch.claims]
    with conn.transaction():
        conn.execute(
            """UPDATE pitches
                  SET status = 'done', subject = %s, body = %s, claims = %s,
                      evidence_post_ids = %s::uuid[], error = NULL
                WHERE id = %s""",
            (pitch.subject, pitch.body, Jsonb(claims), list(ids.values()), row["id"]),
        )


def run(job: Job, conn: psycopg.Connection) -> None:
    if job.ref_id is None:
        raise PermanentJobError("pitch job has no ref_id")
    try:
        _run(job, conn)
    except PermanentJobError as e:
        _fail(conn, job.ref_id, str(e))
        raise
    except LLMRateLimited as e:
        if job.attempts >= get_settings().worker_max_attempts:
            _fail(conn, job.ref_id, str(e))
            raise
        raise RetryLater(str(e), max(e.retry_after_s, 30.0)) from e
    except Exception as e:
        if conn.info.transaction_status != psycopg.pq.TransactionStatus.IDLE:
            conn.rollback()
        if job.attempts >= get_settings().worker_max_attempts:
            _fail(
                conn,
                job.ref_id,
                str(e) if isinstance(e, LLMError) else "Drafting failed. Try again.",
            )
        raise
