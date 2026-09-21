"""Job type → handler registry."""

from analyzer.jobs import noop, preflight
from analyzer.jobs.base import Handler, Job, PermanentJobError

HANDLERS: dict[str, Handler] = {
    "noop": noop.run,
    "preflight": preflight.run,
}

__all__ = ["HANDLERS", "Handler", "Job", "PermanentJobError"]
