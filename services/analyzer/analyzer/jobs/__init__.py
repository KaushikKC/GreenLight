"""Job type → handler registry."""

from analyzer.jobs import brands, contract, noop, pitch, preflight
from analyzer.jobs.base import Handler, Job, PermanentJobError, RetryLater

HANDLERS: dict[str, Handler] = {
    "noop": noop.run,
    "preflight": preflight.run,
    "contract": contract.run,
    "brands_scan": brands.run,
    "pitch": pitch.run,
}

__all__ = ["HANDLERS", "Handler", "Job", "PermanentJobError", "RetryLater"]
