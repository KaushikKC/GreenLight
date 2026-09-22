"""Speech → timestamped transcript with faster-whisper (runs locally, no API key)."""

from functools import lru_cache
from pathlib import Path

from faster_whisper import WhisperModel

from analyzer.config import get_settings
from analyzer.models import Segment, Transcript, Word


@lru_cache(maxsize=1)
def _model() -> WhisperModel:
    s = get_settings()
    return WhisperModel(s.whisper_model, device="cpu", compute_type=s.whisper_compute_type)


def transcribe(media: Path) -> Transcript:
    segments, info = _model().transcribe(str(media), word_timestamps=True, vad_filter=True)
    out = []
    for seg in segments:
        words = [
            Word(start=round(float(w.start), 2), end=round(float(w.end), 2), text=w.word.strip())
            for w in seg.words or []
            if w.word.strip()
        ]
        out.append(
            Segment(start=round(float(seg.start), 2), end=round(float(seg.end), 2), text=seg.text.strip(), words=words)
        )
    return Transcript(language=info.language, segments=out)
