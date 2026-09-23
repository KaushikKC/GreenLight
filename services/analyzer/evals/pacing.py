"""Call an LLM step gently: pause between calls and wait out one rate limit."""

import time
from collections.abc import Callable
from typing import TypeVar

from analyzer.llm.errors import LLMRateLimited

T = TypeVar("T")


def paced(fn: Callable[[], T], pause_s: float) -> T:
    if pause_s:
        time.sleep(pause_s)
    try:
        return fn()
    except LLMRateLimited as e:
        time.sleep(max(e.retry_after_s, 30))
        return fn()
