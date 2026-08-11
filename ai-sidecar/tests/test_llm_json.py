"""Guards for llm_json.extract_json.

Every case here maps to a real bug this module replaced: local models emit JSON
with trailing prose, unclosed fences, or no fence at all, and the old sites
either died on `json.loads` or — worse — corrupted valid JSON with a blind
`content[7:-3]` slice and then defaulted to a fabricated result.
"""

import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from llm_json import extract_json, extract_json_object


def test_bare_object_no_fence():
    # The exact shape the old `content[7:-3]` slice corrupted.
    assert extract_json('{"selected_task_ids": ["a", "b"]}') == {"selected_task_ids": ["a", "b"]}


def test_clean_fence():
    assert extract_json('```json\n{"subtasks": ["x"]}\n```') == {"subtasks": ["x"]}


def test_trailing_prose():
    # qwen3 appends commentary after the object → json.loads "Extra data".
    assert extract_json('{"compliance_score": 60}\n\nThis score reflects...') == {"compliance_score": 60}


def test_unclosed_fence_with_prose():
    assert extract_json('```json\n{"a": 1}\ncommentary with no closing fence') == {"a": 1}


def test_surrounding_whitespace():
    assert extract_json('  \n{"k": [1, 2, 3]}  ') == {"k": [1, 2, 3]}


def test_top_level_array():
    assert extract_json('[1, 2, 3]') == [1, 2, 3]


def test_no_json_raises():
    # Must fail loudly, never default to a fabricated value.
    with pytest.raises(ValueError):
        extract_json("there is no json here at all")


def test_object_helper_rejects_array():
    with pytest.raises(ValueError):
        extract_json_object('[1, 2, 3]')


def test_object_helper_accepts_object():
    assert extract_json_object('{"ok": true}') == {"ok": True}
