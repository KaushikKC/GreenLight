"""Run the eval suites and write evals/results/<date>.md (BUILD_PLAN §9).

uv run python -m evals.run --suite preflight          # free, deterministic
uv run python -m evals.run --suite preflight --llm    # + AI review
uv run python -m evals.run --suite contracts          # live LLM (~8 calls)
uv run python -m evals.run --suite brands             # live LLM (~6 calls)
uv run python -m evals.run --suite all
"""

import argparse
import json
import logging
from datetime import UTC, datetime
from pathlib import Path

from analyzer.config import get_settings
from analyzer.llm.client import provider_from_settings
from analyzer.llm.errors import LLMError
from evals import brands, contracts, preflight

RESULTS = Path(__file__).parent / "results"


def _model_line() -> str:
    try:
        p = provider_from_settings()
        return f"{p.name}: vision `{p.vision_model}`, fast `{p.fast_model}`"
    except LLMError as e:
        return f"no LLM configured ({e})"


def main() -> None:
    ap = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    ap.add_argument(
        "--suite", choices=["preflight", "contracts", "brands", "all"], default="preflight"
    )
    ap.add_argument(
        "--llm", action="store_true", help="include the AI review in the preflight suite"
    )
    ap.add_argument(
        "--pause", type=float, default=6.0, help="seconds between LLM calls (free-tier friendly)"
    )
    args = ap.parse_args()
    logging.basicConfig(level=logging.WARNING)

    suites = ["preflight", "contracts", "brands"] if args.suite == "all" else [args.suite]
    RESULTS.mkdir(exist_ok=True)
    today = datetime.now(UTC).date().isoformat()
    json_path = RESULTS / f"{today}.json"
    # Suites run separately on the same day merge into one report.
    results: dict = json.loads(json_path.read_text()) if json_path.exists() else {}

    for s in suites:
        print(f"running {s}…", flush=True)
        if s == "preflight":
            results[s] = preflight.run(use_llm=args.llm)
        elif s == "contracts":
            results[s] = contracts.run(pause_s=args.pause)
        else:
            results[s] = brands.run(pause_s=args.pause)
        print(RENDER[s](results[s]), "\n", flush=True)

    json_path.write_text(json.dumps(results, indent=2, default=str))
    md_path = RESULTS / f"{today}.md"
    md_path.write_text(render_report(today, results))
    print(f"wrote {md_path}")


RENDER = {
    "preflight": preflight.to_markdown,
    "contracts": contracts.to_markdown,
    "brands": brands.to_markdown,
}


def render_report(day: str, results: dict) -> str:
    header = [
        f"# Eval results: {day}",
        "",
        f"Models: {_model_line()}. Free-tier Gemini: {get_settings().gemini_free_tier}.",
        "",
        "Golden sets are synthetic (see `evals/*_golden`); real creator footage and contracts will be harder.",
        "",
    ]
    sections = [RENDER[s](results[s]) for s in ("preflight", "contracts", "brands") if s in results]
    return "\n".join(header) + "\n\n".join(sections) + "\n"


if __name__ == "__main__":
    main()
