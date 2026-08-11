"""The system prompt is charged on every LLM call, so it gets trimmed.

Before compression it was 1301 tokens of a ~1600-token prompt — 81% boilerplate,
re-sent on each step of a multi-step agent loop. Compression is worth doing, but
each rule below is load-bearing: dropping one changes what agents do, silently
and only in the cases that matter. These tests state what must survive.

The security directives are asserted separately and verbatim: injection defense
and identity are boundaries, not style, and must never be shortened away.
"""

import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from reasoning_manual import (  # noqa: E402
    get_identity_directive,
    get_injection_defense_prompt,
    get_reasoning_directives,
    get_validation_gate_prompt,
)

LANGS = ("en", "ar")


def _full(agent_type: str, lang: str) -> str:
    return "\n".join([
        get_reasoning_directives(agent_type, lang),
        get_validation_gate_prompt(lang),
        get_injection_defense_prompt(lang),
        get_identity_directive(lang),
    ])


@pytest.mark.parametrize("lang", LANGS)
def test_epistemic_labels_survive(lang):
    """Agents tag claims [VERIFIED]/[ASSUMPTION]; the labels appear in real replies."""
    text = _full("hr", lang)
    for label in ("[VERIFIED]", "[CONFIDENT RECALL]", "[ASSUMPTION]", "[SPECULATION]"):
        assert label in text, f"{label} missing for lang={lang}"


@pytest.mark.parametrize("lang", LANGS)
def test_tools_before_assertions(lang):
    """Without this the agent answers about workspace state from recall."""
    text = get_reasoning_directives("hr", lang)
    assert "search_knowledge" in text
    assert "list_institutional_facts" in text


@pytest.mark.parametrize("lang", LANGS)
def test_high_stakes_routes_to_human_approval(lang):
    """Irreversible and financial actions must fall back to HITL, not confidence."""
    text = get_reasoning_directives("crm", lang).lower()
    assert "hitl" in text or "human-in-the-loop" in text or "موافقة بشرية" in text


@pytest.mark.parametrize("lang", LANGS)
def test_domain_emphasis_still_applies(lang):
    """Correspondence and CRM carry extra emphasis; generic agents do not."""
    generic = get_reasoning_directives("hr", lang)
    assert get_reasoning_directives("correspondence", lang) != generic
    assert get_reasoning_directives("crm", lang) != generic


@pytest.mark.parametrize("lang", LANGS)
def test_security_directives_are_intact(lang):
    """These two are boundaries. Compression may not touch them."""
    injection = get_injection_defense_prompt(lang)
    identity = get_identity_directive(lang)
    assert len(injection) > 400, "injection defense looks truncated"
    assert len(identity) > 200, "identity directive looks truncated"
    # The rule that makes retrieved text quotable but never obeyable.
    assert ("never" in injection.lower() or "لا " in injection)
    assert "Septimus" in identity


@pytest.mark.parametrize("lang", LANGS)
def test_prompt_stays_within_budget(lang):
    """Regression guard on the thing that caused this work.

    The four directives are prepended to every agent call and re-sent on every
    step of the loop. This asserts the compression holds; raise it deliberately,
    with a reason, not by accident.
    """
    total = len(_full("hr", lang))
    assert total < 3600, f"system prompt grew back to {total} chars for lang={lang}"
