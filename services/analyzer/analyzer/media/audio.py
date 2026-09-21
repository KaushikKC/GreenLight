"""Audio: loudness (EBU R128), speech detection (VAD), music + voice heuristics."""

import re
import subprocess
import wave
from pathlib import Path

import numpy as np
import webrtcvad

from analyzer.models import AudioStats

SAMPLE_RATE = 16_000
FRAME_MS = 30
FRAME_LEN = SAMPLE_RATE * FRAME_MS // 1000
VAD_AGGRESSIVENESS = 2
# Non-speech frames louder than this count as "energetic" (likely music).
ENERGETIC_DBFS = -40.0
MERGE_GAP_S = 0.3
MIN_SEGMENT_S = 0.2
VOICE_BAND_HZ = (300.0, 3400.0)


def extract_wav(video: Path, out: Path) -> Path:
    subprocess.run(
        [
            "ffmpeg",
            "-v",
            "error",
            "-y",
            "-i",
            str(video),
            "-vn",
            "-ac",
            "1",
            "-ar",
            str(SAMPLE_RATE),
            "-sample_fmt",
            "s16",
            str(out),
        ],
        check=True,
        capture_output=True,
        timeout=120,
    )
    return out


_I_RE = re.compile(r"I:\s+(-?[\d.]+|-inf)\s+LUFS")
_PEAK_RE = re.compile(r"True peak:\s+Peak:\s+(-?[\d.]+|-inf)\s+dBFS", re.DOTALL)


def _num(s: str) -> float | None:
    return None if s == "-inf" else float(s)


def parse_ebur128(stderr: str) -> tuple[float | None, float | None]:
    """(integrated LUFS, true peak dBTP) from ffmpeg's ebur128 summary."""
    summary = stderr[stderr.rfind("Summary:") :] if "Summary:" in stderr else stderr
    i = _I_RE.findall(summary)
    p = _PEAK_RE.findall(summary)
    return (_num(i[-1]) if i else None, _num(p[-1]) if p else None)


def loudness(wav: Path) -> tuple[float | None, float | None]:
    proc = subprocess.run(
        [
            "ffmpeg",
            "-nostats",
            "-hide_banner",
            "-i",
            str(wav),
            "-af",
            "ebur128=peak=true",
            "-f",
            "null",
            "-",
        ],
        capture_output=True,
        text=True,
        timeout=120,
        check=False,
    )
    return parse_ebur128(proc.stderr)


def read_pcm(wav: Path) -> np.ndarray:
    with wave.open(str(wav), "rb") as w:
        return np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16)


def frame_dbfs(frames: np.ndarray) -> np.ndarray:
    rms = np.sqrt(np.mean((frames.astype(np.float64) / 32768.0) ** 2, axis=1))
    return 20 * np.log10(np.maximum(rms, 1e-10))


def speech_flags(pcm: np.ndarray) -> np.ndarray:
    vad = webrtcvad.Vad(VAD_AGGRESSIVENESS)
    n = len(pcm) // FRAME_LEN
    return np.array(
        [
            vad.is_speech(pcm[i * FRAME_LEN : (i + 1) * FRAME_LEN].tobytes(), SAMPLE_RATE)
            for i in range(n)
        ],
        dtype=bool,
    )


def flags_to_segments(
    flags: np.ndarray, frame_s: float = FRAME_MS / 1000
) -> list[tuple[float, float]]:
    """Speech flags → merged (start, end) segments, dropping blips."""
    segments: list[list[float]] = []
    for i, is_speech in enumerate(flags):
        if not is_speech:
            continue
        start, end = i * frame_s, (i + 1) * frame_s
        if segments and start - segments[-1][1] <= MERGE_GAP_S:
            segments[-1][1] = end
        else:
            segments.append([start, end])
    return [(round(s, 2), round(e, 2)) for s, e in segments if e - s >= MIN_SEGMENT_S]


def voice_band_ratio(frames: np.ndarray) -> float | None:
    """Energy-weighted share of spectrum energy inside the voice band."""
    if len(frames) == 0:
        return None
    window = np.hanning(frames.shape[1])
    spectrum = np.abs(np.fft.rfft(frames.astype(np.float64) * window, axis=1)) ** 2
    freqs = np.fft.rfftfreq(frames.shape[1], 1 / SAMPLE_RATE)
    band = (freqs >= VOICE_BAND_HZ[0]) & (freqs <= VOICE_BAND_HZ[1])
    total = spectrum.sum()
    return float(spectrum[:, band].sum() / total) if total > 0 else None


def analyze_pcm(pcm: np.ndarray) -> AudioStats:
    n = len(pcm) // FRAME_LEN
    if n == 0:
        return AudioStats()
    frames = pcm[: n * FRAME_LEN].reshape(n, FRAME_LEN)
    flags = speech_flags(pcm)
    db = frame_dbfs(frames)
    energetic_non_speech = (~flags) & (db > ENERGETIC_DBFS)
    return AudioStats(
        speech_ratio=round(float(flags.mean()), 3),
        speech_segments=flags_to_segments(flags),
        music_ratio=round(float(energetic_non_speech.mean()), 3),
        voice_band_ratio=voice_band_ratio(frames[flags]) if flags.any() else None,
    )


def analyze(video: Path, workdir: Path) -> AudioStats:
    wav = extract_wav(video, workdir / "audio.wav")
    lufs, peak = loudness(wav)
    stats = analyze_pcm(read_pcm(wav))
    return stats.model_copy(update={"integrated_lufs": lufs, "true_peak_dbtp": peak})
