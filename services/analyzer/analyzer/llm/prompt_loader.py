"""Versioned prompts live in llm/prompts/<name>_v<N>.md."""

from functools import lru_cache
from pathlib import Path

PROMPTS_DIR = Path(__file__).resolve().parent / "prompts"


@lru_cache
def load_prompt(version: str) -> str:
    """`load_prompt("preflight_v1")` → contents of prompts/preflight_v1.md."""
    return (PROMPTS_DIR / f"{version}.md").read_text().strip()
