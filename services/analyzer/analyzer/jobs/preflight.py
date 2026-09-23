"""Preflight job: download the video, run the pipeline (analyzer/preflight_pipeline.py),
mirror progress into preflights.report, and store the report.
"""

import logging
import tempfile
from pathlib import Path
from typing import Any

import psycopg
from psycopg.types.json import Jsonb

from analyzer import storage
from analyzer.checks.base import key_text
from analyzer.config import get_settings
from analyzer.jobs.base import Job, PermanentJobError
from analyzer.llm.client import LLM
from analyzer.llm.preflight_call import PROMPT_VERSION
from analyzer.models import Probe
from analyzer.preflight_pipeline import STEPS, VideoRejected, analyze_video
from analyzer.report import REPORT_VERSION, build_report
from analyzer.rules import load_rules

log = logging.getLogger(__name__)


class Progress:
    """Mirrors step status into preflights.report so the web app can poll it."""

    def __init__(self, conn: psycopg.Connection, preflight_id):
        self.conn = conn
        self.preflight_id = preflight_id
        self.steps = [{"step": s, "label": label, "status": "pending"} for s, label in STEPS]

    def set(self, step: str, status: str) -> None:
        for s in self.steps:
            if s["step"] == step:
                s["status"] = status
        with self.conn.transaction():
            self.conn.execute(
                "UPDATE preflights SET report = %s WHERE id = %s",
                (Jsonb({"version": REPORT_VERSION, "progress": self.steps}), self.preflight_id),
            )


def _load(conn: psycopg.Connection, preflight_id) -> dict[str, Any]:
    with conn.transaction():
        row = conn.execute(
            """SELECT p.id, p.platform, p.caption_text, p.brief_text, p.brand_name,
                      p.video_id, v.storage_key
                 FROM preflights p JOIN videos v ON v.id = p.video_id
                WHERE p.id = %s""",
            (preflight_id,),
        ).fetchone()
    if row is None:
        raise PermanentJobError(f"preflight {preflight_id} not found")
    return row


def _set_status(
    conn: psycopg.Connection, preflight_id, status: str, error: str | None = None
) -> None:
    with conn.transaction():
        if error is None:
            conn.execute(
                "UPDATE preflights SET status = %s::job_status WHERE id = %s",
                (status, preflight_id),
            )
        else:
            conn.execute(
                """UPDATE preflights
                      SET status = %s::job_status,
                          report = coalesce(report, '{}'::jsonb) || jsonb_build_object('error', %s::text)
                    WHERE id = %s""",
                (status, error, preflight_id),
            )


def _run(job: Job, conn: psycopg.Connection) -> None:
    row = _load(conn, job.ref_id)
    pid = row["id"]
    progress = Progress(conn, pid)
    _set_status(conn, pid, "running")

    def save_probe(meta: Probe) -> None:
        with conn.transaction():
            conn.execute(
                """UPDATE videos SET duration_s = %s, width = %s, height = %s, fps = %s, has_audio = %s
                    WHERE id = %s""",
                (
                    meta.duration_s,
                    meta.width,
                    meta.height,
                    meta.fps,
                    meta.has_audio,
                    row["video_id"],
                ),
            )

    def upload(t: float, jpeg: bytes) -> str:
        return storage.upload_bytes(f"preflights/{pid}/frames/{t:07.2f}.jpg", jpeg, "image/jpeg")

    with tempfile.TemporaryDirectory(prefix="preflight-") as tmp:
        workdir = Path(tmp)
        progress.set("probe", "running")
        video = storage.download(row["storage_key"], workdir / "input")
        try:
            result = analyze_video(
                video,
                workdir,
                rules=load_rules(row["platform"]),
                caption=row["caption_text"],
                brief=row["brief_text"],
                brand=row["brand_name"],
                make_llm=lambda: LLM.from_settings(conn=conn, job_id=job.id),
                upload=upload,
                on_step=progress.set,
                on_probe=save_probe,
            )
        except VideoRejected as e:
            raise PermanentJobError(str(e)) from e

    ctx, llm = result.ctx, result.llm
    report = build_report(ctx, result.checks, result.score, progress.steps)
    report["meta"] |= {
        "prompt_version": PROMPT_VERSION,
        "llm_cost_usd": round(llm.total_cost_usd, 6) if llm else 0.0,
        "llm_calls": len(llm.calls) if llm else 0,
        "ai_review_error": result.llm_error,
    }
    artifacts = {
        # OCR boxes per frame power the safe-zone overlay in the report UI.
        "frames": [
            {
                "t": f.t,
                "key": f.key,
                "ocr": [b.model_dump() for b in key_text(f.ocr, ctx.rules)],
            }
            for f in ctx.frames or []
        ],
        "scene_cuts": ctx.scene_cuts,
        "audio": ctx.audio.model_dump() if ctx.audio else None,
        "transcript": ctx.transcript.model_dump() if ctx.transcript else None,
        "llm": ctx.llm.model_dump() if ctx.llm else None,
        "timings_s": result.timings_s,
    }
    with conn.transaction():
        conn.execute(
            """UPDATE preflights
                  SET status = 'done', score = %s, verdict = %s::verdict,
                      report = %s, artifacts = %s, prompt_version = %s
                WHERE id = %s""",
            (
                result.score.score,
                result.score.verdict,
                Jsonb(report),
                Jsonb(artifacts),
                PROMPT_VERSION,
                pid,
            ),
        )


def run(job: Job, conn: psycopg.Connection) -> None:
    if job.ref_id is None:
        raise PermanentJobError("preflight job has no ref_id")
    try:
        _run(job, conn)
    except PermanentJobError as e:
        _set_status(conn, job.ref_id, "error", str(e))
        raise
    except Exception:
        if conn.info.transaction_status != psycopg.pq.TransactionStatus.IDLE:
            conn.rollback()
        if job.attempts >= get_settings().worker_max_attempts:
            _set_status(conn, job.ref_id, "error", "Analysis failed. Please try uploading again.")
        else:
            _set_status(conn, job.ref_id, "queued")
        raise
