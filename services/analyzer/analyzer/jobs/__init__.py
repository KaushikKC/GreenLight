"""Job type → handler registry."""

from analyzer.jobs import noop
from analyzer.jobs.base import Handler, Job, PermanentJobError

HANDLERS: dict[str, Handler] = {
    "noop": noop.run,
}

__all__ = ["HANDLERS", "Handler", "Job", "PermanentJobError"]
