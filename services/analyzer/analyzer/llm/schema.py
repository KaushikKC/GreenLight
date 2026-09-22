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
    out = {}
    for key, value in node.items():
        if key in ("properties", "$defs"):
            # Maps of name → schema: keep every name, clean each schema.
            out[key] = {name: _clean(sub) for name, sub in value.items()}
        elif key not in UNSUPPORTED_KEYS:
            out[key] = _clean(value)
    if out.get("type") == "object" and "properties" in out:
        out["additionalProperties"] = False
        out["required"] = list(out["properties"])
    return out


def strict_schema(model: type[BaseModel]) -> dict[str, Any]:
    return _clean(model.model_json_schema())


def inline_refs(schema: dict[str, Any]) -> dict[str, Any]:
    """Replace every `{"$ref": "#/$defs/X"}` with the definition itself and drop
    `$defs`. For providers with limited JSON-schema support. Not for recursive schemas."""
    defs = schema.get("$defs", {})

    def walk(node: Any) -> Any:
        if isinstance(node, list):
            return [walk(n) for n in node]
        if not isinstance(node, dict):
            return node
        if "$ref" in node:
            return walk(defs[node["$ref"].rsplit("/", 1)[-1]])
        return {k: walk(v) for k, v in node.items() if k != "$defs"}

    return walk(schema)
