"""Build the synthetic Preflight golden clips from cases.json.

Clips are cached in .clips/ (git-ignored) keyed by a hash of each case, so
editing a case rebuilds only that clip. Voices use macOS `say`; cases that
need a voice are skipped where `say` isn't available.
"""

import hashlib
import json
import shutil
import subprocess
import tempfile
import wave
from pathlib import Path

import cv2
import numpy as np

HERE = Path(__file__).parent
CASES = HERE / "cases.json"
CACHE = HERE / ".clips"
FPS = 30
SR = 44_100
# Bump when the way clips are built changes, so cached clips are rebuilt.
GENERATOR_VERSION = 2


class NeedsVoice(Exception):
    pass


def load_cases() -> list[dict]:
    return json.loads(CASES.read_text())["cases"]


def _background(kind: str, w: int, h: int, seed: int) -> np.ndarray:
    if kind == "flat":
        return np.full((h, w, 3), (90, 140, 200), np.uint8)
    rng = np.random.default_rng(seed)
    coarse = rng.integers(40, 230, (max(h // 40, 2), max(w // 40, 2), 3), dtype=np.uint8)
    img = cv2.resize(coarse, (w, h), interpolation=cv2.INTER_CUBIC).astype(np.float32)
    img += rng.normal(0, 22, img.shape)  # fine detail so frames read as "real footage"
    img = np.clip(img, 0, 255).astype(np.uint8)
    if kind == "blurry":
        img = cv2.GaussianBlur(img, (0, 0), 7)
    elif kind == "dark":
        img = (img * 0.18).astype(np.uint8)
    return img


def _draw_text(img: np.ndarray, spec: dict) -> None:
    h, w = img.shape[:2]
    scale = spec["size"] * h / 22
    thickness = max(1, round(scale * 2.2))
    org = (int(spec["x"] * w), int(spec["y"] * h + spec["size"] * h))
    cv2.putText(
        img,
        spec["text"],
        org,
        cv2.FONT_HERSHEY_SIMPLEX,
        scale,
        (0, 0, 0),
        thickness + 4,
        cv2.LINE_AA,
    )
    cv2.putText(
        img,
        spec["text"],
        org,
        cv2.FONT_HERSHEY_SIMPLEX,
        scale,
        (255, 255, 255),
        thickness,
        cv2.LINE_AA,
    )


def _music(seconds: float, path: Path) -> None:
    """A little backing track: chords, a kick every beat and noisy hats."""
    t = np.arange(int(seconds * SR)) / SR
    chords = sum(np.sin(2 * np.pi * f * t) for f in (220.0, 277.2, 329.6, 110.0)) * 0.12
    kick = np.zeros_like(t)
    hats = np.zeros_like(t)
    rng = np.random.default_rng(0)
    for beat in np.arange(0, seconds, 0.5):
        i = int(beat * SR)
        n = min(int(0.15 * SR), len(t) - i)
        env = np.exp(-np.arange(n) / (0.03 * SR))
        kick[i : i + n] += np.sin(2 * np.pi * 55 * np.arange(n) / SR) * env * 0.6
        j = int((beat + 0.25) * SR)
        m = min(int(0.04 * SR), max(len(t) - j, 0))
        hats[j : j + m] += rng.normal(0, 0.15, m) * np.exp(-np.arange(m) / (0.01 * SR))
    audio = np.clip(chords + kick + hats, -1, 1)
    with wave.open(str(path), "wb") as f:
        f.setnchannels(1)
        f.setsampwidth(2)
        f.setframerate(SR)
        f.writeframes((audio * 32767 * 0.7).astype(np.int16).tobytes())


def _key(case: dict) -> str:
    payload = json.dumps({"v": GENERATOR_VERSION, "case": case}, sort_keys=True)
    return hashlib.sha1(payload.encode()).hexdigest()[:10]


def build(case: dict) -> Path:
    CACHE.mkdir(exist_ok=True)
    out = CACHE / f"{case['id']}-{_key(case)}.mp4"
    if out.exists():
        return out
    if case.get("voice") and shutil.which("say") is None:
        raise NeedsVoice(case["id"])

    w, h = case.get("size", [1080, 1920])
    seconds = case.get("seconds", 7)
    bg = _background(case.get("background", "texture"), w, h, seed=int(_key(case), 16) % 2**32)
    with tempfile.TemporaryDirectory() as tmp:
        tmp = Path(tmp)
        silent = tmp / "video.mp4"
        writer = cv2.VideoWriter(str(silent), cv2.VideoWriter_fourcc(*"mp4v"), FPS, (w, h))
        texts = case.get("texts", [])
        for i in range(int(seconds * FPS)):
            t = i / FPS
            frame = bg.copy()
            for s in texts:
                if s["from"] <= t < s["to"]:
                    _draw_text(frame, s)
            writer.write(frame)
        writer.release()

        cmd = ["ffmpeg", "-v", "error", "-y", "-i", str(silent)]
        if case.get("no_audio"):
            cmd += ["-an"]
        else:
            if case.get("voice"):
                src = tmp / "voice.aiff"
                subprocess.run(["say", "-o", str(src), case["voice"]], check=True)
            elif case.get("music"):
                src = tmp / "music.wav"
                _music(seconds, src)
            else:
                src = None
            if src:
                level = (
                    # About -14 LUFS with a hard limiter at -4.4 dBFS: AAC encoding
                    # overshoots peaks by ~1 dB and the check measures the decoded file.
                    # (ffmpeg's single-pass loudnorm misses its targets on short clips.)
                    "volume=6dB,alimiter=limit=0.6:level=false"
                    if case.get("mastered")
                    else f"volume={case.get('gain_db', 0)}dB"
                )
                cmd += ["-i", str(src), "-af", f"{level},apad"]
            else:
                cmd += ["-f", "lavfi", "-i", "anullsrc=r=44100:cl=mono"]
            cmd += ["-c:a", "aac", "-shortest"]
        cmd += ["-c:v", "libx264", "-pix_fmt", "yuv420p", "-t", str(seconds), str(out)]
        subprocess.run(cmd, check=True)
    return out


if __name__ == "__main__":
    for c in load_cases():
        try:
            print(c["id"], build(c))
        except NeedsVoice:
            print(c["id"], "skipped: needs macOS `say`")
