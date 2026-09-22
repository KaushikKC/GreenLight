"""Pydantic model → JSON schema accepted by strict tool use.

Strict mode needs `additionalProperties: false` and every property listed in
`required` on every object, and rejects numeric/string constraints. We strip
those here; Pydantic re-checks them when the tool input is validated.
"""

from typing import Any

from pydantic import BaseModel

UNSUPPORTED_KEYS = {
    "title",
    "default",
    "examples",
    "minimum",
    "maximum",
    "exclusiveMinimum",
    "exclusiveMaximum",
    "multipleOf",
    "minLength",
    "maxLength",
    "pattern",
    "minItems",
    "maxItems",
    "uniqueItems",
}


def _clean(node: Any) -> Any:
    if isinstance(node, list):
        return [_clean(n) for n in node]
    if not isinstance(node, dict):
        return node
    out = {k: _clean(v) for k, v in node.items() if k not in UNSUPPORTED_KEYS}
    if out.get("type") == "object" and "properties" in out:
        out["additionalProperties"] = False
        out["required"] = list(out["properties"])
    return out


def strict_schema(model: type[BaseModel]) -> dict[str, Any]:
    return _clean(model.model_json_schema())
