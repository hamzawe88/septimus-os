"""Offline tests for the orchestrator's parameter Stop-Gate (no langchain).

The Stop-Gate's whole purpose is to refuse to guess a missing parameter. The
original resolver undermined that: it assigned the first `#123` in the text to
*any* parameter whose name ended in "id", so a ticket reference could populate
`letter_id`, and a request carrying two references silently took the first.
These tests pin the corrected contract — named values are accepted, a single
unambiguous reference is accepted, ambiguity falls through to the gate.
"""
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from stop_gate import resolve_required_parameters as _resolve_required_parameters


class TestStopGate(unittest.TestCase):
    def test_named_value_is_accepted(self):
        ctx = {}
        missing = _resolve_required_parameters(["letter_id"], ctx, "افحص letter_id: 42 من فضلك")
        self.assertEqual(missing, [])
        self.assertEqual(ctx["letter_id"], "42")

    def test_named_value_with_equals(self):
        ctx = {}
        missing = _resolve_required_parameters(["sprint_id"], ctx, "review sprint_id=S-9 now")
        self.assertEqual(missing, [])
        self.assertEqual(ctx["sprint_id"], "S-9")

    def test_already_supplied_in_context_is_untouched(self):
        ctx = {"letter_id": "99"}
        missing = _resolve_required_parameters(["letter_id"], ctx, "no reference here")
        self.assertEqual(missing, [])
        self.assertEqual(ctx["letter_id"], "99")

    def test_single_reference_fills_the_single_required_param(self):
        ctx = {}
        missing = _resolve_required_parameters(["letter_id"], ctx, "الخطاب رقم #L-42 يحتاج تدقيقاً")
        self.assertEqual(missing, [])
        self.assertEqual(ctx["letter_id"], "#L-42")

    def test_missing_with_no_reference_is_reported(self):
        ctx = {}
        missing = _resolve_required_parameters(["letter_id"], ctx, "دقّق الخطاب الأخير")
        self.assertEqual(missing, ["letter_id"])
        self.assertNotIn("letter_id", ctx)

    # ── the two regressions that mattered ────────────────────────────────────
    def test_two_references_are_not_guessed(self):
        """A query naming #T-7 and #L-9 must not silently pick one for letter_id."""
        ctx = {}
        missing = _resolve_required_parameters(["letter_id"], ctx, "التذكرة #T-7 مرتبطة بالخطاب #L-9")
        self.assertEqual(missing, ["letter_id"])
        self.assertNotIn("letter_id", ctx)

    def test_bare_reference_is_not_spread_across_multiple_params(self):
        """With two params missing, one loose #45 is ambiguous — ask for both."""
        ctx = {}
        missing = _resolve_required_parameters(["letter_id", "ticket_id"], ctx, "راجع #45")
        self.assertEqual(set(missing), {"letter_id", "ticket_id"})
        self.assertEqual(ctx, {})

    def test_named_resolves_one_leaving_a_reference_for_the_other(self):
        """Once letter_id is named, ticket_id is the sole remaining param and a
        single bare reference may fill it — no ambiguity left."""
        ctx = {}
        missing = _resolve_required_parameters(
            ["letter_id", "ticket_id"], ctx, "letter_id=7 والتذكرة #T-88")
        self.assertEqual(missing, [])
        self.assertEqual(ctx["letter_id"], "7")
        self.assertEqual(ctx["ticket_id"], "#T-88")


if __name__ == "__main__":
    unittest.main()
