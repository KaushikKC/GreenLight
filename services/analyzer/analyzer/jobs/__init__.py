"""Job type → handler registry."""

from analyzer.jobs import contract, noop, preflight
from analyzer.jobs.base import Handler, Job, PermanentJobError, RetryLater

HANDLERS: dict[str, Handler] = {
    "noop": noop.run,
    "preflight": preflight.run,
    "contract": contract.run,
}

__all__ = ["HANDLERS", "Handler", "Job", "PermanentJobError", "RetryLater"]
