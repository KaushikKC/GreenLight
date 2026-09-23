"""Preflight analysis of one video file (BUILD_PLAN §6.2), independent of the
database and storage so the job and the eval runner share it.

A failing step marks only the checks that depend on it as "couldn't check";
only an unreadable or too-long video raises (VideoRejected).
"""

import logging
import time
from collections.abc import Callable
from dataclasses import dataclass, field
from pathlib import Path

import numpy as np

from analyzer.checks import run_checks
from analyzer.llm.client import LLM, LLMError
from analyzer.llm.preflight_call import judge
from analyzer.media import audio as audio_mod
from analyzer.media import frames as frames_mod
from analyzer.media.ocr import read_text
from analyzer.media.probe import ProbeError, probe
from analyzer.media.quality import blur_score, detail, mean_luma
from analyzer.media.transcribe import transcribe
from analyzer.models import AnalysisContext, AudioStats, CheckResult, Frame, Probe, Transcript
from analyzer.rules import Rules
from analyzer.scoring import ScoreResult, score_checks

log = logging.getLogger(__name__)

STEPS: list[tuple[str, str]] = [
    ("probe", "Reading video"),
    ("frames", "Sampling frames"),
    ("audio", "Analysing audio"),
    ("transcribe", "Transcribing"),
    ("ocr", "Reading on-screen text"),
    ("llm", "Checking hook, brief and claims"),
    ("checks", "Running checks"),
    ("score", "Scoring"),
]

OnStep = Callable[[str, str], None]  # (step, "running" | "done" | "error")
UploadFrame = Callable[[float, bytes], str | None]  # (t, jpeg) -> storage key


class VideoRejected(Exception):
    """The video can't be analysed at all. Message is shown to the creator."""


@dataclass
class PipelineResult:
    ctx: AnalysisContext
    checks: list[CheckResult]
    score: ScoreResult
    llm: LLM | None = None
    llm_error: str | None = None
    timings_s: dict[str, float] = field(default_factory=dict)


def sample_frames(
    video: Path, duration_s: float, upload: UploadFrame
) -> tuple[list[Frame], list[float] | None, list[np.ndarray], dict[float, bytes]]:
    """Frames (uploaded + measured), scene cuts, OCR-sized images, and the JPEGs
    by timestamp for the LLM call."""
    try:
        cuts: list[float] | None = frames_mod.detect_scene_cuts(video)
    except Exception:
        log.exception("scene detection failed")
        cuts = None

    frames: list[Frame] = []
    ocr_images: list[np.ndarray] = []
    jpegs: dict[float, bytes] = {}
    for t, img in frames_mod.read_frames(
        video, frames_mod.sample_timestamps(duration_s, cuts or [])
    ):
        thumb = frames_mod.resize_long_edge(img, frames_mod.THUMB_LONG_EDGE)
        jpegs[t] = frames_mod.encode_jpeg(thumb)
        frames.append(
            Frame(
                t=t,
                key=upload(t, jpegs[t]),
                blur=blur_score(thumb),
                detail=detail(thumb),
                luma=mean_luma(thumb),
            )
        )
        ocr_images.append(frames_mod.resize_long_edge(img, frames_mod.OCR_LONG_EDGE))
    if not frames:
        raise RuntimeError("no frames could be decoded")
    return frames, cuts, ocr_images, jpegs


def analyze_video(
    video: Path,
    workdir: Path,
    *,
    rules: Rules,
    caption: str | None = None,
    brief: str | None = None,
    brand: str | None = None,
    make_llm: Callable[[], LLM] | None = None,
    upload: UploadFrame = lambda t, data: None,
    on_step: OnStep = lambda step, status: None,
    on_probe: Callable[[Probe], None] = lambda meta: None,
) -> PipelineResult:
    """Run every Preflight step on a local video file. `make_llm=None` skips
    the AI review (its checks then report "couldn't check")."""
    timings: dict[str, float] = {}

    def step(name: str):
        on_step(name, "running")
        timings[name] = time.monotonic()

    def done(name: str, ok: bool = True):
        timings[name] = round(time.monotonic() - timings[name], 3)
        on_step(name, "done" if ok else "error")

    # 1. probe: the only step allowed to stop everything
    step("probe")
    try:
        meta = probe(video)
    except ProbeError as e:
        done("probe", ok=False)
        raise VideoRejected(str(e)) from e
    if meta.duration_s > rules.max_duration_s:
        done("probe", ok=False)
        raise VideoRejected(
            f"Video is {meta.duration_s:.0f}s long; the limit is {rules.max_duration_s:.0f}s."
        )
    on_probe(meta)
    done("probe")

    ctx = AnalysisContext(
        rules=rules, probe=meta, caption_text=caption, brief_text=brief, brand_name=brand
    )

    # 2. frames + scene cuts + quality
    step("frames")
    ocr_images: list[np.ndarray] = []
    jpegs: dict[float, bytes] = {}
    try:
        ctx.frames, ctx.scene_cuts, ocr_images, jpegs = sample_frames(
            video, meta.duration_s, upload
        )
        done("frames")
    except Exception:
        log.exception("frames step failed")
        done("frames", ok=False)

    # 3. audio
    step("audio")
    try:
        ctx.audio = audio_mod.analyze(video, workdir) if meta.has_audio else AudioStats()
        done("audio")
    except Exception:
        log.exception("audio step failed")
        done("audio", ok=False)

    # 4. transcript
    step("transcribe")
    try:
        ctx.transcript = transcribe(video) if meta.has_audio else Transcript()
        done("transcribe")
    except Exception:
        log.exception("transcription failed")
        done("transcribe", ok=False)

    # 5. OCR (per frame; a bad frame doesn't sink the rest)
    step("ocr")
    for frame, img in zip(ctx.frames or [], ocr_images, strict=False):
        try:
            frame.ocr = read_text(img)
            frame.ocr_ok = True
        except Exception:
            log.exception("ocr failed at t=%s", frame.t)
    done("ocr", ok=bool(ctx.frames) and any(f.ocr_ok for f in ctx.frames))

    # 6. one LLM vision call; failure only affects the LLM-judged checks
    step("llm")
    llm: LLM | None = None
    llm_error: str | None = None
    try:
        if make_llm is None:
            raise LLMError("AI review was turned off for this run.")
        llm = make_llm()
        ctx.llm = judge(llm, ctx, jpegs, brief=brief, brand=brand).output
        done("llm")
    except LLMError as e:
        llm_error = str(e)
        log.warning("llm step failed: %s", e)
        done("llm", ok=False)

    # 7. checks + 8. score
    step("checks")
    checks = run_checks(ctx)
    done("checks")
    step("score")
    score = score_checks(checks)
    done("score")

    return PipelineResult(
        ctx=ctx, checks=checks, score=score, llm=llm, llm_error=llm_error, timings_s=timings
    )
