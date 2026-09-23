class LLMError(Exception):
    """The LLM step couldn't produce a usable answer. Message is safe to show."""


class LLMRateLimited(LLMError):
    """The provider asked us to slow down. `retry_after_s` is its suggested wait."""

    def __init__(self, message: str, retry_after_s: float = 60.0):
        super().__init__(message)
        self.retry_after_s = retry_after_s
