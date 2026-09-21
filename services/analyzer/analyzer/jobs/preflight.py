"""Preflight pipeline (BUILD_PLAN §6.2), Phase 1: deterministic checks only.

Each step updates report.progress. A failing step marks only the checks that
depend on it as "couldn't check"; only a probe failure fails the whole job.
"""

import logging
import tempfile
from pathlib import Path
from typing import Any

import numpy as np
import psycopg
from psycopg.types.json import Jsonb

from analyzer import storage
from analyzer.checks import run_checks
from analyzer.config import get_settings
from analyzer.jobs.base import Job, PermanentJobError
from analyzer.media import audio as audio_mod
from analyzer.media import frames as frames_mod
from analyzer.media.ocr import read_text
from analyzer.media.probe import ProbeError, probe
from analyzer.media.quality import blur_score, detail, mean_luma
from analyzer.models import AnalysisContext, AudioStats, Frame
from analyzer.report import REPORT_VERSION, build_report
from analyzer.rules import load_rules
from analyzer.scoring import score_checks

log = logging.getLogger(__name__)

STEPS: list[tuple[str, str]] = [
    ("probe", "Reading video"),
    ("frames", "Sampling frames"),
    ("audio", "Analysing audio"),
    ("ocr", "Reading on-screen text"),
    ("checks", "Running checks"),
    ("score", "Scoring"),
]


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
            """SELECT p.id, p.platform, p.caption_text, p.video_id, v.storage_key
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


def _sample_frames(
    video: Path, duration_s: float, preflight_id
) -> tuple[list[Frame], list[float] | None, list[np.ndarray]]:
    try:
        cuts: list[float] | None = frames_mod.detect_scene_cuts(video)
    except Exception:
        log.exception("scene detection failed")
        cuts = None

    frames: list[Frame] = []
    ocr_images: list[np.ndarray] = []
    for t, img in frames_mod.read_frames(
        video, frames_mod.sample_timestamps(duration_s, cuts or [])
    ):
        thumb = frames_mod.resize_long_edge(img, frames_mod.THUMB_LONG_EDGE)
        key = storage.upload_bytes(
            f"preflights/{preflight_id}/frames/{t:07.2f}.jpg",
            frames_mod.encode_jpeg(thumb),
            "image/jpeg",
        )
        frames.append(
            Frame(t=t, key=key, blur=blur_score(thumb), detail=detail(thumb), luma=mean_luma(thumb))
        )
        ocr_images.append(frames_mod.resize_long_edge(img, frames_mod.OCR_LONG_EDGE))
    if not frames:
        raise RuntimeError("no frames could be decoded")
    return frames, cuts, ocr_images


def _run(job: Job, conn: psycopg.Connection) -> None:
    row = _load(conn, job.ref_id)
    pid = row["id"]
    rules = load_rules(row["platform"])
    progress = Progress(conn, pid)
    _set_status(conn, pid, "running")

    with tempfile.TemporaryDirectory(prefix="preflight-") as tmp:
        workdir = Path(tmp)

        # 1. probe: the only step allowed to fail the job
        progress.set("probe", "running")
        video = storage.download(row["storage_key"], workdir / "input")
        try:
            meta = probe(video)
        except ProbeError as e:
            progress.set("probe", "error")
            raise PermanentJobError(str(e)) from e
        if meta.duration_s > rules.max_duration_s:
            progress.set("probe", "error")
            raise PermanentJobError(
                f"Video is {meta.duration_s:.0f}s long; the limit is {rules.max_duration_s:.0f}s."
            )
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
        progress.set("probe", "done")

        ctx = AnalysisContext(rules=rules, probe=meta, caption_text=row["caption_text"])

        # 2. frames + scene cuts + quality
        progress.set("frames", "running")
        ocr_images: list[np.ndarray] = []
        try:
            ctx.frames, ctx.scene_cuts, ocr_images = _sample_frames(video, meta.duration_s, pid)
            progress.set("frames", "done")
        except Exception:
            log.exception("frames step failed")
            progress.set("frames", "error")

        # 3. audio
        progress.set("audio", "running")
        try:
            ctx.audio = audio_mod.analyze(video, workdir) if meta.has_audio else AudioStats()
            progress.set("audio", "done")
        except Exception:
            log.exception("audio step failed")
            progress.set("audio", "error")

        # 4. OCR (per frame; a bad frame doesn't sink the rest)
        progress.set("ocr", "running")
        for frame, img in zip(ctx.frames or [], ocr_images, strict=False):
            try:
                frame.ocr = read_text(img)
                frame.ocr_ok = True
            except Exception:
                log.exception("ocr failed at t=%s", frame.t)
        ocr_ok = bool(ctx.frames) and any(f.ocr_ok for f in ctx.frames)
        progress.set("ocr", "done" if ocr_ok else "error")

    # 5. checks + 6. score
    progress.set("checks", "running")
    checks = run_checks(ctx)
    progress.set("checks", "done")
    progress.set("score", "running")
    score = score_checks(checks)
    progress.set("score", "done")

    report = build_report(ctx, checks, score, progress.steps)
    artifacts = {
        "frames": [{"t": f.t, "key": f.key} for f in ctx.frames or []],
        "scene_cuts": ctx.scene_cuts,
        "audio": ctx.audio.model_dump() if ctx.audio else None,
    }
    with conn.transaction():
        conn.execute(
            """UPDATE preflights
                  SET status = 'done', score = %s, verdict = %s::verdict,
                      report = %s, artifacts = %s
                WHERE id = %s""",
            (score.score, score.verdict, Jsonb(report), Jsonb(artifacts), pid),
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
