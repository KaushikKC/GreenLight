"""Build and run the single preflight vision call (BUILD_PLAN §6.4)."""

import base64
from typing import Any

from analyzer.checks.base import key_text
from analyzer.config import get_settings
from analyzer.llm.client import LLM, LLMError, ToolResult
from analyzer.llm.judgements import PreflightJudgements
from analyzer.llm.prompt_loader import load_prompt
from analyzer.models import AnalysisContext

PROMPT_VERSION = "preflight_v1"
TOOL_NAME = "record_preflight_judgements"
TOOL_DESCRIPTION = (
    "Record your assessment of the draft ad. Every judgement must cite a timestamp, "
    "a transcript quote, or what is visible in a specific frame."
)
MAX_LATER_FRAMES = 8


def select_frames(ctx: AnalysisContext, jpegs: dict[float, bytes]) -> list[float]:
    """All hook frames, plus up to 8 later frames spread across the rest."""
    times = sorted(jpegs)
    hook = [t for t in times if t <= ctx.rules.hook_window_s]
    later = [t for t in times if t > ctx.rules.hook_window_s]
    if len(later) > MAX_LATER_FRAMES:
        step = (len(later) - 1) / (MAX_LATER_FRAMES - 1)
        later = [later[round(i * step)] for i in range(MAX_LATER_FRAMES)]
    return hook + later


def _ocr_lines(ctx: AnalysisContext) -> str:
    lines = []
    for f in ctx.frames or []:
        texts = [b.text for b in key_text(f.ocr, ctx.rules)]
        if texts:
            lines.append(f"t={f.t:.1f}s: " + " | ".join(texts))
    return "\n".join(lines) or "(no on-screen text found)"


def build_content(
    ctx: AnalysisContext,
    jpegs: dict[float, bytes],
    *,
    brief: str | None,
    brand: str | None,
) -> list[dict[str, Any]]:
    content: list[dict[str, Any]] = []
    for t in select_frames(ctx, jpegs):
        content.append({"type": "text", "text": f"t={t:.1f}s"})
        content.append(
            {
                "type": "image",
                "source": {
                    "type": "base64",
                    "media_type": "image/jpeg",
                    "data": base64.standard_b64encode(jpegs[t]).decode("ascii"),
                },
            }
        )

    transcript = ctx.transcript.timestamped() if ctx.transcript and ctx.transcript.segments else ""
    details = [
        f"Platform: {ctx.rules.platform}. Video length: {ctx.probe.duration_s:.1f}s.",
        f"Brand name: {brand or '(not provided)'}",
        "<transcript>\n" + (transcript or "(no speech detected)") + "\n</transcript>",
        "<on_screen_text>\n" + _ocr_lines(ctx) + "\n</on_screen_text>",
        "<brief>\n" + (brief or "(no brief provided)") + "\n</brief>",
        "<caption>\n" + (ctx.caption_text or "(no caption provided)") + "\n</caption>",
        f"Call the {TOOL_NAME} tool with your assessment.",
    ]
    content.append({"type": "text", "text": "\n\n".join(details)})
    return content


def judge(
    llm: LLM,
    ctx: AnalysisContext,
    jpegs: dict[float, bytes],
    *,
    brief: str | None,
    brand: str | None,
) -> ToolResult[PreflightJudgements]:
    model = get_settings().model_vision
    if not model:
        raise LLMError("AI review isn't configured (MODEL_VISION is not set).")
    if not jpegs:
        raise LLMError("No frames were available for the AI review.")
    return llm.call_tool(
        purpose="preflight_judgements",
        model=model,
        system=load_prompt(PROMPT_VERSION),
        content=build_content(ctx, jpegs, brief=brief, brand=brand),
        output=PreflightJudgements,
        tool_name=TOOL_NAME,
        tool_description=TOOL_DESCRIPTION,
    )
