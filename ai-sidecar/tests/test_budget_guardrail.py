"""Offline tests for the daily token budget (no langchain, no Redis, no network).

The guardrail used to count into a plain process dict and was called from a
single code path, so it reset on every restart, counted separately per replica,
and left 25 of the 26 inference entry points unmetered. These tests pin the
counter's arithmetic and its per-workspace/per-day isolation using the in-memory
fallback (Redis absent), which is exactly the degraded mode that must still work.
"""
import os
import sys
import types
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# `config` is imported for real — it depends only on the stdlib, so stubbing it
# would only create ordering coupling with whichever test module ran first.
sys.modules.setdefault("requests", types.ModuleType("requests"))

os.environ.pop("REDIS_URL", None)  # force the in-memory fallback path

import observability  # noqa: E402


class _BudgetTestBase(unittest.TestCase):
    def setUp(self):
        observability._daily_token_tracker.clear()
        observability._redis_client = None
        observability._redis_checked = True  # skip discovery; stay in-memory
        # Neutralise the backend budget probe: it is a separate, optional check.
        self._orig_get = getattr(observability.requests, "get", None)
        observability.requests.get = lambda *a, **k: (_ for _ in ()).throw(RuntimeError("offline"))

    def tearDown(self):
        if self._orig_get is not None:
            observability.requests.get = self._orig_get


class TestCounter(_BudgetTestBase):
    def test_tokens_accumulate_per_workspace(self):
        observability._add_tokens("ws-a", 100)
        observability._add_tokens("ws-a", 250)
        self.assertEqual(observability._tokens_used_today("ws-a"), 350)

    def test_workspaces_are_isolated(self):
        observability._add_tokens("ws-a", 100)
        self.assertEqual(observability._tokens_used_today("ws-b"), 0)

    def test_unknown_workspace_reads_zero(self):
        self.assertEqual(observability._tokens_used_today("never-seen"), 0)

    def test_counter_key_is_scoped_by_day_and_workspace(self):
        key = observability._counter_key("ws-a")
        self.assertIn("ws-a", key)
        self.assertNotEqual(key, observability._counter_key("ws-b"))


class TestGuardrail(_BudgetTestBase):
    def test_under_limit_passes(self):
        observability._add_tokens("ws-a", 10)
        observability.check_budget_guardrails("ws-a", max_daily_tokens=1000)  # must not raise

    def test_at_limit_blocks(self):
        observability._add_tokens("ws-a", 1000)
        with self.assertRaises(observability.BudgetExceededError):
            observability.check_budget_guardrails("ws-a", max_daily_tokens=1000)

    def test_over_limit_blocks(self):
        observability._add_tokens("ws-a", 5000)
        with self.assertRaises(observability.BudgetExceededError):
            observability.check_budget_guardrails("ws-a", max_daily_tokens=1000)

    def test_one_workspace_exhausting_budget_does_not_block_another(self):
        observability._add_tokens("ws-a", 5000)
        observability.check_budget_guardrails("ws-b", max_daily_tokens=1000)  # must not raise

    def test_message_is_localized(self):
        observability._add_tokens("ws-a", 5000)
        for lang, needle in (("ar", "تجاوز"), ("en", "budget")):
            with self.assertRaises(observability.BudgetExceededError) as ctx:
                observability.check_budget_guardrails("ws-a", lang=lang, max_daily_tokens=10)
            self.assertIn(needle, str(ctx.exception).lower() if lang == "en" else str(ctx.exception))

    def test_blank_workspace_is_not_metered(self):
        observability.check_budget_guardrails("", max_daily_tokens=1)  # must not raise


class TestCostPricing(unittest.TestCase):
    def test_every_tier_model_has_a_price(self):
        """A model in MODEL_TIERS but not in COST_PER_MILLION is billed at a
        generic guess — which is how the default fast tier was mispriced."""
        tiers = {
            "gpt-5-mini", "gpt-5",
            "gemini-2.5-flash", "gemini-2.5-pro",
            "claude-haiku-4-5-20251001", "claude-sonnet-5",
            "llama3.2:3b", "qwen3:8b",
        }
        missing = sorted(tiers - set(observability.COST_PER_MILLION))
        self.assertEqual(missing, [], f"unpriced tier models: {missing}")

    def test_local_models_cost_nothing(self):
        self.assertEqual(observability.estimate_cost_usd("qwen3:8b", 1_000_000, 1_000_000), 0.0)

    def test_cost_is_proportional_to_tokens(self):
        one = observability.estimate_cost_usd("gpt-5", 1_000_000, 0)
        self.assertAlmostEqual(one, 2.50, places=4)


if __name__ == "__main__":
    unittest.main()
