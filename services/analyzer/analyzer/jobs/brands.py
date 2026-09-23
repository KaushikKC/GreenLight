"""Brand scan job (BUILD_PLAN §8.2): read the creator's new posts, record
brand mentions, then re-canonicalise brand names across all their mentions.

jobs.ref_id is the user id. Progress is saved per batch, so a rate limit or
crash never loses work already done.
"""

import logging

import psycopg

from analyzer.brands.extract import PostIn, canonicalise, extract_mentions
from analyzer.brands.rules import brand_rules
from analyzer.jobs.base import Job, PermanentJobError, RetryLater
from analyzer.llm.client import LLM
from analyzer.llm.errors import LLMRateLimited

log = logging.getLogger(__name__)

MIN_RATE_LIMIT_WAIT_S = 30.0


def _unscanned(conn: psycopg.Connection, user_id) -> list[PostIn]:
    with conn.transaction():
        rows = conn.execute(
            """SELECT id, caption, transcript, ocr_text, posted_at, platform FROM posts
                WHERE user_id = %s AND scanned_at IS NULL
                ORDER BY posted_at NULLS LAST, created_at""",
            (user_id,),
        ).fetchall()
    return [
        PostIn(
            id=str(r["id"]),
            caption=r["caption"],
            transcript=r["transcript"],
            ocr_text=r["ocr_text"],
            posted_at=r["posted_at"].date() if r["posted_at"] else None,
            platform=r["platform"],
        )
        for r in rows
    ]


def _save_batch(conn: psycopg.Connection, posts: list[PostIn], mentions) -> None:
    with conn.transaction():
        for m in mentions:
            conn.execute(
                """INSERT INTO brand_mentions
                     (post_id, brand_canonical, brand_raw, product, modality, sentiment,
                      is_sponsored, evidence, confidence)
                   VALUES (%s, %s, %s, %s, %s::mention_modality, %s, %s, %s, %s)""",
                (
                    m.post_id,
                    m.brand_raw,
                    m.brand_raw,
                    m.product,
                    m.modality,
                    m.sentiment,
                    m.is_sponsored,
                    m.evidence,
                    m.confidence,
                ),
            )
        conn.execute(
            "UPDATE posts SET scanned_at = now() WHERE id = ANY(%s::uuid[])",
            ([p.id for p in posts],),
        )


def _recanonicalise(conn: psycopg.Connection, llm: LLM, user_id) -> int:
    with conn.transaction():
        raws = [
            r["brand_raw"]
            for r in conn.execute(
                """SELECT DISTINCT m.brand_raw FROM brand_mentions m
                     JOIN posts p ON p.id = m.post_id WHERE p.user_id = %s""",
                (user_id,),
            ).fetchall()
        ]
    mapping = canonicalise(llm, raws)
    with conn.transaction():
        for raw, name in mapping.items():
            conn.execute(
                """UPDATE brand_mentions m SET brand_canonical = %s
                     FROM posts p
                    WHERE p.id = m.post_id AND p.user_id = %s AND m.brand_raw = %s""",
                (name, user_id, raw),
            )
    return len(set(mapping.values()))


def run(job: Job, conn: psycopg.Connection) -> None:
    if job.ref_id is None:
        raise PermanentJobError("brands_scan job has no ref_id (user id)")
    posts = _unscanned(conn, job.ref_id)
    if not posts:
        log.info("brand scan for %s: nothing new", job.ref_id)
        return
    llm = LLM.from_settings(conn=conn, job_id=job.id)
    size = int(brand_rules()["batch_size"])
    try:
        for i in range(0, len(posts), size):
            batch = posts[i : i + size]
            mentions = extract_mentions(llm, batch)
            _save_batch(conn, batch, mentions)
            log.info("brand scan: posts %d-%d → %d mentions", i + 1, i + len(batch), len(mentions))
    except LLMRateLimited as e:
        # Batches done so far are saved; the retry carries on from there.
        raise RetryLater(str(e), max(e.retry_after_s, MIN_RATE_LIMIT_WAIT_S)) from e
    brands = _recanonicalise(conn, llm, job.ref_id)
    log.info("brand scan for %s: %d posts, %d brands", job.ref_id, len(posts), brands)
