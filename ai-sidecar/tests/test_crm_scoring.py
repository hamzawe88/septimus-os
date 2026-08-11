"""Offline contract tests for CRM lead scoring safety."""
import os
import re
import unittest


MODULE_PATH = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "nats_events.py"
)
SOURCE = open(MODULE_PATH, encoding="utf-8").read()

match = re.search(r"def _parse_crm_score\(value\).*?\n(?=\n(?:async )?def )", SOURCE, re.DOTALL)
namespace = {"re": re}
exec(match.group(0), namespace)
parse_score = namespace["_parse_crm_score"]


class TestCRMScoreContract(unittest.TestCase):
    def test_accepts_only_integer_range(self):
        self.assertEqual(parse_score("1"), 1)
        self.assertEqual(parse_score("73"), 73)
        self.assertEqual(parse_score("100"), 100)

    def test_rejects_fallback_like_or_unstructured_scores(self):
        for value in ("0", "101", "50.0", "Score: 50", "-1", "", None):
            with self.subTest(value=value), self.assertRaises(ValueError):
                parse_score(value)

    def test_handler_has_no_default_workspace_or_default_score(self):
        handler = re.search(
            r"async def on_crm_opportunity_score\(msg\).*?\n(?=\n# ── Listener)",
            SOURCE,
            re.DOTALL,
        ).group(0)
        self.assertNotIn("get_default_workspace_id", handler)
        self.assertNotIn('{"score": 50}', handler)
        self.assertIn('data.get("workspace_id")', handler)
        self.assertIn('"kind": "assumption"', handler)


if __name__ == "__main__":
    unittest.main()
