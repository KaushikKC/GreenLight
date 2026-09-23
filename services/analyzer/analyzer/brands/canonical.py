"""Brand name canonicalisation (BUILD_PLAN §8.2 step 3).

"The Ordinary" = "theordinary" = "@theordinary": lowercase, drop @/#/spaces/
punctuation and trailing suffixes like "official" or "uk", then look the key
up in the alias table. An LLM merge pass (see jobs/brands.py) handles the rest.
"""

import re
from collections import Counter

from analyzer.brands.rules import brand_rules


def canonical_key(raw: str, suffixes: list[str] | None = None) -> str:
    suffixes = suffixes if suffixes is not None else brand_rules()["strip_suffixes"]
    words = re.findall(r"[a-z0-9]+", raw.lower().replace("&", " and ").replace("'", ""))
    # Strip suffix words ("Glossier Official", "Nike UK"), keeping at least one.
    while len(words) > 1 and words[-1] in suffixes:
        words.pop()
    key = "".join(words)
    # Handles run together ("@glossierofficial", "nikeuk").
    for s in sorted(suffixes, key=len, reverse=True):
        if key.endswith(s) and len(key) - len(s) >= 3:
            key = key[: -len(s)]
            break
    return key


def display_name(raws: list[str], aliases: dict[str, str] | None = None) -> str:
    """Alias if known, else the most common way the creator wrote it (sans @/#)."""
    aliases = aliases if aliases is not None else brand_rules()["aliases"]
    key = canonical_key(raws[0])
    if key in aliases:
        return aliases[key]
    cleaned = [r.strip().lstrip("@#").strip() for r in raws if r.strip().lstrip("@#").strip()]
    if not cleaned:
        return raws[0]
    # Prefer forms with capitals or spaces ("The Ordinary" over "theordinary").
    counts = Counter(cleaned)
    return max(counts, key=lambda s: (counts[s], s != s.lower(), " " in s))


def group_by_key(raws: list[str]) -> dict[str, list[str]]:
    groups: dict[str, list[str]] = {}
    for r in raws:
        k = canonical_key(r)
        if k:
            groups.setdefault(k, []).append(r)
    return groups
