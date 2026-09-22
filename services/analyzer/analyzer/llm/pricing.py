"""USD cost per call, for llm_calls logging. Rates are per million tokens.

Keyed by model-ID prefix so dated snapshots (e.g. claude-haiku-4-5-20251001)
match. Update from the Anthropic pricing page when models change.
"""

# (input, output) USD per 1M tokens
RATES: dict[str, tuple[float, float]] = {
    "claude-opus-5": (5.00, 25.00),
    "claude-sonnet-5": (2.00, 10.00),
    "claude-sonnet-4-6": (3.00, 15.00),
    "claude-haiku-4-5": (1.00, 5.00),
}
CACHE_WRITE_MULT = 1.25
CACHE_READ_MULT = 0.10


def rates_for(model: str) -> tuple[float, float] | None:
    matches = [k for k in RATES if model == k or model.startswith(k + "-")]
    return RATES[max(matches, key=len)] if matches else None


def cost_usd(
    model: str,
    input_tokens: int,
    output_tokens: int,
    cache_creation_tokens: int = 0,
    cache_read_tokens: int = 0,
) -> float | None:
    rates = rates_for(model)
    if rates is None:
        return None
    rin, rout = rates
    total = (
        input_tokens * rin
        + cache_creation_tokens * rin * CACHE_WRITE_MULT
        + cache_read_tokens * rin * CACHE_READ_MULT
        + output_tokens * rout
    )
    return round(total / 1_000_000, 6)
