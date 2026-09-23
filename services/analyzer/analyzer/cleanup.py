"""Privacy housekeeping: delete videos (and their sampled frames) once their
7-day `delete_after` has passed. Report text is kept; the UI says why the
video is gone."""

import logging
from collections.abc import Callable

import psycopg

from analyzer import storage

log = logging.getLogger(__name__)

BATCH = 50


def delete_expired_videos(
    conn: psycopg.Connection,
    *,
    delete: Callable[[str], None] = storage.delete,
    delete_prefix: Callable[[str], int] = storage.delete_prefix,
) -> int:
    """Remove expired videos from storage and mark them deleted. Returns count."""
    with conn.transaction():
        rows = conn.execute(
            """SELECT v.id, v.storage_key, array_agg(p.id) FILTER (WHERE p.id IS NOT NULL) AS preflights
                 FROM videos v LEFT JOIN preflights p ON p.video_id = v.id
                WHERE v.deleted_at IS NULL AND v.delete_after < now()
                GROUP BY v.id
                LIMIT %s""",
            (BATCH,),
        ).fetchall()
    done = 0
    for row in rows:
        try:
            delete(row["storage_key"])
            for pid in row["preflights"] or []:
                delete_prefix(f"preflights/{pid}/frames/")
        except Exception:  # storage hiccup: leave it for the next sweep
            log.exception("couldn't delete video %s", row["id"])
            continue
        with conn.transaction():
            conn.execute("UPDATE videos SET deleted_at = now() WHERE id = %s", (row["id"],))
        done += 1
    if done:
        log.info("auto-deleted %d expired video(s)", done)
    return done
