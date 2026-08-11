"""Robust JSON extraction from LLM replies.

Local reasoning models (qwen3 and similar) do not reliably emit clean JSON even
when the prompt says "return ONLY a JSON object". Two failure shapes recur, and
both were live in this codebase:

1. Trailing prose: ``{...}`` followed by a sentence of commentary, or an opened
   ```json fence that is never closed. ``json.loads`` dies with "Extra data".

2. The naive fix ``content[7:-3]`` (assuming a ```json fence is always there):
   when the model returns bare JSON with no fence, this slices the first 7 and
   last 3 characters off VALID JSON and corrupts it — turning a working reply
   into a parse error.

Every one of these sites had a lenient ``except`` that returned a plausible
default (an empty list, or compliance_score 100). That is worse than raising:
the fallback fires silently and hands back a confident wrong answer.

Parse from the first brace with ``raw_decode`` so trailing text is ignored, and
never blind-slice.
"""

import json
from typing import Any


def extract_json(text: str) -> Any:
    """Return the first complete JSON value in ``text``.

    Strips a leading/trailing markdown fence if present, then decodes the first
    JSON value starting at the first ``{`` or ``[``. Trailing prose after a
    complete value is ignored. Raises ValueError when no JSON value is present so
    callers fail loudly instead of defaulting to a fabricated result.
    """
    t = (text or "").strip()

    # Strip a fence only when it is actually there — do not assume it.
    if t.startswith("```json"):
        t = t[len("```json"):]
    elif t.startswith("```"):
        t = t[len("```"):]
    if t.endswith("```"):
        t = t[: -len("```")]
    t = t.strip()

    # Find the first plausible start of a JSON value.
    starts = [i for i in (t.find("{"), t.find("[")) if i != -1]
    if not starts:
        raise ValueError("no JSON value in model reply")
    start = min(starts)

    value, _ = json.JSONDecoder().raw_decode(t[start:])
    return value


def extract_json_object(text: str) -> dict:
    """Like :func:`extract_json`, but require a JSON object."""
    value = extract_json(text)
    if not isinstance(value, dict):
        raise ValueError("model reply was not a JSON object")
    return value
