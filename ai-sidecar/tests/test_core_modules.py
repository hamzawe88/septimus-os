import unittest
from unittest.mock import patch, MagicMock
import os
import sys

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

import i18n
import providers
import knowledge
import observability


class TestI18n(unittest.TestCase):
    def test_resolve_lang(self):
        self.assertEqual(i18n.resolve_lang("ar"), "ar")
        self.assertEqual(i18n.resolve_lang("ar-SA"), "ar")
        self.assertEqual(i18n.resolve_lang("en"), "en")
        self.assertEqual(i18n.resolve_lang("en-US"), "en")
        self.assertEqual(i18n.resolve_lang(None), "ar")  # default fallthrough

    def test_language_directive(self):
        self.assertIn("العربية", i18n.language_directive("ar"))
        self.assertIn("English", i18n.language_directive("en"))

    def test_system_prompt_for(self):
        ar_hr = i18n.system_prompt_for("hr", "ar")
        en_hr = i18n.system_prompt_for("hr", "en")
        self.assertIn("الموارد البشرية", ar_hr)
        self.assertIn("HR Assistant", en_hr)
        self.assertEqual(
            i18n.system_prompt_for("unknown_agent", "en"),
            i18n.SYS_PROMPTS["en"]["general"],
        )


class TestProviders(unittest.TestCase):
    def test_model_for_default_tiers(self):
        self.assertEqual(providers._model_for("openai", "fast"), "gpt-5-mini")
        self.assertEqual(providers._model_for("openai", "strong"), "gpt-5")
        self.assertEqual(
            providers._model_for("anthropic", "fast"), "claude-3-5-haiku-20241022"
        )
        self.assertEqual(
            providers._model_for("anthropic", "strong"), "claude-sonnet-4-20250514"
        )

    def test_model_for_selected_model_override(self):
        # Explicit user selection overrides default task tier
        self.assertEqual(
            providers._model_for("anthropic", "fast", selected_model="claude-opus-3-7"),
            "claude-opus-3-7",
        )
        self.assertEqual(
            providers._model_for("openai", "strong", selected_model="gpt-4o"),
            "gpt-4o",
        )


class TestKnowledge(unittest.TestCase):
    @patch("requests.get")
    def test_retrieve_context_success(self, mock_get):
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "results": [
                {"content": "First relevant document chunk."},
                {"content": "Second relevant document chunk."},
            ]
        }
        mock_get.return_value = mock_response

        context = knowledge.retrieve_context("test-workspace-id", "test query")
        self.assertIn("First relevant document chunk.", context)
        self.assertIn("Second relevant document chunk.", context)
        mock_get.assert_called_once()

    @patch("requests.get")
    def test_retrieve_context_failure_returns_empty(self, mock_get):
        mock_response = MagicMock()
        mock_response.status_code = 500
        mock_get.return_value = mock_response

        context = knowledge.retrieve_context("test-workspace-id", "test query")
        self.assertEqual(context, "")


class TestObservability(unittest.TestCase):
    def test_estimate_cost_usd(self):
        # 1M prompt tokens for gpt-5-mini = $0.15, 1M completion = $0.60
        cost = observability.estimate_cost_usd("gpt-5-mini", 1_000_000, 1_000_000)
        self.assertAlmostEqual(cost, 0.75, places=4)

    def test_extract_usage_from_response(self):
        mock_response = MagicMock()
        mock_response.response_metadata = {
            "token_usage": {"prompt_tokens": 150, "completion_tokens": 50}
        }
        usage = observability.extract_usage_from_response(mock_response)
        self.assertEqual(usage["prompt_tokens"], 150)
        self.assertEqual(usage["completion_tokens"], 50)
        self.assertEqual(usage["total_tokens"], 200)

