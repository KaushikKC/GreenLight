"""read.captions: are there burned-in captions while people are talking?

With a transcript: a speech segment counts as captioned when a frame inside it
shows OCR text sharing words with what's said around that moment.
Without one (transcription failed): fall back to "any text on screen during
VAD speech", labelled as an estimate.
"""

import re

from analyzer.checks.base import CheckSpec, couldnt_check, in_segments, key_text
from analyzer.models import AnalysisContext, CheckResult, Frame

WORD_WINDOW_S = 1.5
MIN_WORD_LEN = 3


def _words(text: str) -> set[str]:
    return {w for w in re.findall(r"[a-z0-9']+", text.lower()) if len(w) >= MIN_WORD_LEN}


def _result(
    status: str, share: float, evidence: dict, estimate: bool, first_gap: Frame | None
) -> CheckResult:
    if status == "pass":
        return CheckResult(
            id="read.captions",
            group="readability",
            status="pass",
            severity="info",
            title="Captions look present",
            explanation=f"Your speech is captioned on screen {share:.0%} of the time.",
            evidence=evidence,
            estimate=estimate,
        )
    return CheckResult(
        id="read.captions",
        group="readability",
        status="warn",
        severity="medium",
        title="Missing captions",
        explanation=f"Only {share:.0%} of your speech is captioned on screen. Most people watch ads muted.",
        fix="Add burned-in captions for the spoken parts (CapCut's auto-captions work well).",
        timestamp_s=first_gap.t if first_gap else None,
        evidence=evidence | ({"frame_key": first_gap.key} if first_gap else {}),
        estimate=estimate,
    )


def _no_speech(estimate: bool) -> CheckResult:
    return CheckResult(
        id="read.captions",
        group="readability",
        status="na",
        severity="info",
        title="No speech to caption",
        explanation="We didn't detect talking, so captions aren't needed.",
        estimate=estimate,
    )


def _with_transcript(ctx: AnalysisContext) -> CheckResult:
    rules, transcript = ctx.rules, ctx.transcript
    judged = 0
    captioned = 0
    first_gap: Frame | None = None
    for seg in transcript.segments:
        frames = [f for f in ctx.frames or [] if seg.start <= f.t <= seg.end]
        if not frames:
            continue
        judged += 1
        hit = False
        for f in frames:
            said = _words(transcript.text_between(f.t - WORD_WINDOW_S, f.t + WORD_WINDOW_S))
            shown = _words(" ".join(b.text for b in key_text(f.ocr, rules)))
            if said & shown:
                hit = True
                break
        if hit:
            captioned += 1
        elif first_gap is None:
            first_gap = frames[0]
    if judged == 0:
        return _no_speech(False)
    share = captioned / judged
    status = "pass" if share >= rules.captions_min_frame_frac else "warn"
    evidence = {
        "segments_checked": judged,
        "segments_captioned": captioned,
        "method": "transcript_overlap",
    }
    return _result(status, share, evidence, False, first_gap)


def _vad_proxy(ctx: AnalysisContext) -> CheckResult:
    speech_frames = [f for f in ctx.frames or [] if in_segments(f.t, ctx.audio.speech_segments)]
    if not speech_frames:
        return _no_speech(True)
    with_text = [f for f in speech_frames if key_text(f.ocr, ctx.rules)]
    share = len(with_text) / len(speech_frames)
    status = "pass" if share >= ctx.rules.captions_min_frame_frac else "warn"
    first_gap = next((f for f in speech_frames if f not in with_text), None)
    evidence = {
        "speech_frames": len(speech_frames),
        "speech_frames_with_text": len(with_text),
        "method": "vad_proxy",
    }
    return _result(status, share, evidence, True, first_gap)


def check(ctx: AnalysisContext) -> CheckResult:
    if ctx.transcript is not None:
        if not ctx.transcript.segments:
            return _no_speech(False)
        return _with_transcript(ctx)
    if ctx.audio is not None:
        return _vad_proxy(ctx)
    return couldnt_check(
        "read.captions", "readability", "The transcription and audio steps both failed."
    )


SPEC = CheckSpec("read.captions", "readability", check, needs=("ocr",))
