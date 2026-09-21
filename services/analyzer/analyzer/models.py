"""Data passed between the media pipeline, checks and the report."""

from typing import Any, Literal

from pydantic import BaseModel, Field

from analyzer.rules import Rules

# --- media ------------------------------------------------------------------


class Probe(BaseModel):
    duration_s: float
    width: int  # display width (rotation applied)
    height: int  # display height (rotation applied)
    fps: float
    rotation: int = 0
    has_audio: bool
    video_codec: str | None = None


class OcrBox(BaseModel):
    text: str
    confidence: float
    # Normalised [x, y, w, h], origin top-left.
    box: tuple[float, float, float, float]


class Frame(BaseModel):
    t: float
    key: str | None = None  # storage key of the uploaded JPEG
    blur: float | None = None  # Laplacian variance, higher = sharper
    detail: float | None = None  # luma std-dev; low = flat graphic
    luma: float | None = None  # mean luma 0..255
    ocr: list[OcrBox] = Field(default_factory=list)
    ocr_ok: bool = False


class AudioStats(BaseModel):
    integrated_lufs: float | None = None
    true_peak_dbtp: float | None = None
    speech_ratio: float = 0.0
    speech_segments: list[tuple[float, float]] = Field(default_factory=list)
    music_ratio: float = 0.0
    # Share of speech-time energy inside the 300–3400 Hz voice band.
    voice_band_ratio: float | None = None


class AnalysisContext(BaseModel):
    """Everything a check may look at. Steps that failed leave their field None."""

    rules: Rules
    probe: Probe
    frames: list[Frame] | None = None
    scene_cuts: list[float] | None = None
    audio: AudioStats | None = None
    caption_text: str | None = None


# --- checks -------------------------------------------------------------------

Status = Literal["pass", "warn", "fail", "na", "info", "error"]
Severity = Literal["high", "medium", "low", "info"]
Group = Literal["hook", "format", "readability", "message", "compliance", "audio", "technical"]


class CheckResult(BaseModel):
    id: str
    group: Group
    status: Status
    severity: Severity
    title: str
    explanation: str
    fix: str | None = None
    timestamp_s: float | None = None
    evidence: dict[str, Any] = Field(default_factory=dict)
    # Heuristic checks are shown with an "estimate" label.
    estimate: bool = False
