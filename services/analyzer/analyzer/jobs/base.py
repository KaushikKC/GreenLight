"""Shared types for job handlers."""

from collections.abc import Callable
from dataclasses import dataclass
from uuid import UUID

import psycopg


@dataclass(frozen=True)
class Job:
    id: UUID
    type: str
    ref_id: UUID | None
    attempts: int


class PermanentJobError(Exception):
    """Raise when retrying can't help (bad input, missing row). Skips retries."""


class RetryLater(Exception):
    """Raise to have the worker retry after `delay_s` instead of the default backoff."""

    def __init__(self, message: str, delay_s: float):
        super().__init__(message)
        self.delay_s = delay_s


Handler = Callable[[Job, psycopg.Connection], None]
