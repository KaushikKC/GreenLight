"""Data passed between the media pipeline, checks and the report."""

from typing import Any, Literal

from pydantic import BaseModel, Field

from analyzer.llm.judgements import PreflightJudgements
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


class Word(BaseModel):
    start: float
    end: float
    text: str


class Segment(BaseModel):
    start: float
    end: float
    text: str
    words: list[Word] = Field(default_factory=list)


class Transcript(BaseModel):
    language: str | None = None
    segments: list[Segment] = Field(default_factory=list)

    @property
    def words(self) -> list[Word]:
        return [w for s in self.segments for w in s.words]

    @property
    def first_word_s(self) -> float | None:
        words = self.words
        return words[0].start if words else None

    def text_between(self, start: float, end: float) -> str:
        return " ".join(w.text for w in self.words if w.end >= start and w.start <= end)

    def timestamped(self) -> str:
        """Transcript as `[12.4s–15.0s] text` lines, for prompts."""
        return "\n".join(f"[{s.start:.1f}s–{s.end:.1f}s] {s.text}" for s in self.segments)


class AnalysisContext(BaseModel):
    """Everything a check may look at. Steps that failed leave their field None."""

    rules: Rules
    probe: Probe
    frames: list[Frame] | None = None
    scene_cuts: list[float] | None = None
    audio: AudioStats | None = None
    transcript: Transcript | None = None
    llm: PreflightJudgements | None = None
    caption_text: str | None = None
    brief_text: str | None = None
    brand_name: str | None = None


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
