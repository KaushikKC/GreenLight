"""Real ffmpeg / OpenCV / OCR on a synthetic clip. Skipped without ffmpeg."""

import shutil
import subprocess
from pathlib import Path

import cv2
import numpy as np
import pytest

from analyzer.checks import run_checks
from analyzer.jobs import preflight
from analyzer.media import audio, frames
from analyzer.media.ocr import read_text
from analyzer.media.probe import probe
from analyzer.models import AnalysisContext
from analyzer.rules import load_rules

pytestmark = pytest.mark.skipif(shutil.which("ffmpeg") is None, reason="ffmpeg not installed")

W, H, FPS, SECONDS = 540, 960, 30, 6


def _draw(bg, label, y_frac):
    img = np.full((H, W, 3), bg, np.uint8)
    cv2.putText(
        img, label, (40, int(H * y_frac)), cv2.FONT_HERSHEY_SIMPLEX, 1.6, (255, 255, 255), 4
    )
    return img


@pytest.fixture(scope="module")
def clip(tmp_path_factory) -> Path:
    d = tmp_path_factory.mktemp("clip")
    silent = d / "silent.mp4"
    writer = cv2.VideoWriter(str(silent), cv2.VideoWriter_fourcc(*"mp4v"), FPS, (W, H))
    for i in range(FPS * SECONDS):
        if i < FPS * 3:
            writer.write(_draw((120, 60, 20), "STOP SCROLLING", 0.45))  # hook text, centre
        else:
            writer.write(_draw((20, 90, 200), "SHOP NOW", 0.9))  # bottom caption area
    writer.release()
    out = d / "clip.mp4"
    subprocess.run(
        [
            "ffmpeg",
            "-v",
            "error",
            "-y",
            "-i",
            str(silent),
            "-f",
            "lavfi",
            "-i",
            f"sine=frequency=440:duration={SECONDS}",
            "-c:v",
            "libx264",
            "-pix_fmt",
            "yuv420p",
            "-c:a",
            "aac",
            "-shortest",
            str(out),
        ],
        check=True,
    )
    return out


def test_probe_reads_generated_clip(clip):
    p = probe(clip)
    assert (p.width, p.height) == (W, H)
    assert p.has_audio
    assert p.duration_s == pytest.approx(SECONDS, abs=0.1)


def test_scene_cut_found_at_3s(clip):
    cuts = frames.detect_scene_cuts(clip)
    assert any(abs(t - 3.0) < 0.1 for t in cuts)


def test_ocr_reads_hook_text(clip):
    [(_, img)] = list(frames.read_frames(clip, [1.0]))
    texts = " ".join(b.text for b in read_text(img)).upper()
    assert "STOP" in texts


def test_audio_analysis_measures_tone(clip, tmp_path):
    stats = audio.analyze(clip, tmp_path)
    assert stats.integrated_lufs is not None
    assert stats.true_peak_dbtp is not None


def test_pipeline_checks_on_clip(clip, monkeypatch):
    """Frames → OCR → checks, with storage stubbed out."""
    monkeypatch.setattr(preflight.storage, "upload_bytes", lambda key, data, ct: key)
    meta = probe(clip)
    ctx = AnalysisContext(rules=load_rules("tiktok"), probe=meta)
    ctx.frames, ctx.scene_cuts, images, _ = preflight._sample_frames(clip, meta.duration_s, "test")
    for f, img in zip(ctx.frames, images, strict=True):
        f.ocr = read_text(img)
        f.ocr_ok = True
    ctx.audio = audio.analyze(clip, clip.parent)

    results = {r.id: r for r in run_checks(ctx)}
    assert results["hook.text"].status == "pass"
    assert results["format.aspect"].status == "pass"
    assert results["format.resolution"].status == "fail"  # 540 wide < 720
    safe = results["read.safe_zone"]
    assert safe.status == "fail"
    assert safe.timestamp_s >= 3.0
    assert "SHOP" in safe.evidence["text"].upper()
    assert results["hook.pacing"].status == "info"


@pytest.mark.skipif(shutil.which("say") is None, reason="needs macOS `say` for a voice clip")
def test_transcribe_voice_with_word_timestamps(tmp_path):
    from analyzer.media.transcribe import transcribe

    aiff = tmp_path / "voice.aiff"
    subprocess.run(["say", "-o", str(aiff), "Stop scrolling. Tap the link to try it."], check=True)
    t = transcribe(aiff)
    text = " ".join(s.text for s in t.segments).lower()
    assert "scrolling" in text and "link" in text
    assert t.first_word_s is not None and t.first_word_s < 1.0
    assert all(w.end >= w.start for w in t.words)
