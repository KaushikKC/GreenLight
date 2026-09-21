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


Handler = Callable[[Job, psycopg.Connection], None]
