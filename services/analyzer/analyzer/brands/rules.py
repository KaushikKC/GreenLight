"""Brand rules from rules/brands.json (shared with the web app)."""

import json
from functools import lru_cache
from pathlib import Path

RULES_PATH = Path(__file__).resolve().parents[2] / "rules" / "brands.json"


@lru_cache
def brand_rules() -> dict:
    return json.loads(RULES_PATH.read_text())
