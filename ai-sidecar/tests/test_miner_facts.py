"""Offline tests for the miner's fact reconciliation (no langchain, no network).

The miner writes `[VERIFIED STATS]` facts that every other agent later quotes as
checked truth. The original dedup rule compared the first 40 characters, and
because each fact kind opens with a fixed Arabic prefix, that rule matched on the
*label* rather than the *value*: the first figure ever stored won permanently and
every refresh was discarded as a duplicate. These tests pin the replacement
behaviour — same metric refreshes, distinct metrics coexist.
"""
import os
import sys
import types
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# `requests` is stubbed because the miner imports it at module scope but never
# calls it in these tests. `config` is imported for real — it is stdlib-only, and
# stubbing it would couple this module to test execution order.
sys.modules.setdefault("requests", types.ModuleType("requests"))


class _FakeKnowledge(types.ModuleType):
    """Records save/delete calls so a full mining pass can be asserted on."""

    def __init__(self):
        super().__init__("knowledge")
        self.facts = []
        self.deleted = []
        self._next_id = 1

    def list_facts(self, workspace_id):
        return list(self.facts)

    def save_fact(self, workspace_id, content):
        entry = {"id": str(self._next_id), "content": content}
        self._next_id += 1
        self.facts.append(entry)
        return entry

    def delete_fact(self, workspace_id, fact_id):
        self.deleted.append(fact_id)
        self.facts = [f for f in self.facts if f["id"] != fact_id]
        return True


_fake = _FakeKnowledge()
sys.modules["knowledge"] = _fake

import agents_miner  # noqa: E402

CONVERSION = "[VERIFIED STATS] معدل إغلاق الصفقات الناجحة (Conversion Rate) يبلغ {}% ({} صفقة ناجحة من إجمالي {})."
BOTTLENECK = ("[VERIFIED STATS - Candidate Fact] المراسلات في المسار المؤسسي ('{}') "
              "تعاني من تراكم ({} معاملة معلقة) بمتوسط تأخير {} أيام.")


class TestFactKey(unittest.TestCase):
    def test_same_metric_different_figure_shares_a_key(self):
        self.assertEqual(
            agents_miner._fact_key(CONVERSION.format("12.0", 3, 25)),
            agents_miner._fact_key(CONVERSION.format("31.0", 9, 29)),
        )

    def test_distinct_metrics_get_distinct_keys(self):
        keys = {
            agents_miner._fact_key("[VERIFIED STATS] المراسلات الرسمية تواجه نسبة تراكم تبلغ 42.0% (21 من 50)."),
            agents_miner._fact_key("[VERIFIED STATS - Candidate Fact] الفواتير المالية في مسار التحصيل تواجه تأخراً بنسبة 33.0%."),
            agents_miner._fact_key("[VERIFIED STATS - Candidate Fact] معدلات التأخر في تسجيل الحضور والانصراف تبلغ 22.0%."),
            agents_miner._fact_key(CONVERSION.format("31.0", 9, 29)),
        }
        self.assertEqual(len(keys), 4)

    def test_path_bottlenecks_stay_separate_per_department(self):
        finance = agents_miner._fact_key(BOTTLENECK.format("الشؤون المالية", 5, "4.0"))
        hr = agents_miner._fact_key(BOTTLENECK.format("الموارد البشرية", 2, "3.0"))
        self.assertNotEqual(finance, hr)
        # …but the same department across two runs must reconcile.
        self.assertEqual(finance, agents_miner._fact_key(BOTTLENECK.format("الشؤون المالية", 9, "7.0")))

    def test_unrecognised_text_is_only_its_own_duplicate(self):
        a = agents_miner._fact_key("رؤية واردة من الـ backend")
        self.assertTrue(a.startswith("raw:"))
        self.assertNotEqual(a, agents_miner._fact_key("رؤية أخرى مختلفة"))


class TestReconciliation(unittest.TestCase):
    """Drive run_analytics_miner end to end against the fake store."""

    def setUp(self):
        agents_miner.knowledge = _fake
        _fake.facts.clear()
        _fake.deleted.clear()
        _fake._next_id = 1

    @staticmethod
    def _patterns(won, total):
        return {"finance_crm_metrics": {"total_deals": total, "won_deals": won}}

    def test_first_run_saves_the_fact(self):
        res = agents_miner.run_analytics_miner("ws", self._patterns(3, 25))
        self.assertEqual(res["saved_to_pgvector"], 1)
        self.assertEqual(len(_fake.facts), 1)

    def test_identical_rerun_changes_nothing(self):
        agents_miner.run_analytics_miner("ws", self._patterns(3, 25))
        res = agents_miner.run_analytics_miner("ws", self._patterns(3, 25))
        self.assertEqual(res["unchanged"], 1)
        self.assertEqual(res["saved_to_pgvector"], 0)
        self.assertEqual(res["refreshed"], 0)
        self.assertEqual(len(_fake.facts), 1)

    def test_changed_figure_replaces_the_stale_fact(self):
        """The regression that mattered: this used to be silently discarded."""
        agents_miner.run_analytics_miner("ws", self._patterns(3, 25))   # 12%
        res = agents_miner.run_analytics_miner("ws", self._patterns(9, 29))  # 31%
        self.assertEqual(res["refreshed"], 1)
        self.assertEqual(len(_fake.facts), 1, "stale fact must not linger alongside the fresh one")
        self.assertIn("31.0", _fake.facts[0]["content"])
        self.assertEqual(_fake.deleted, ["1"])

    def test_two_departments_coexist(self):
        patterns = {"correspondence_metrics": {
            "total_correspondences": 50, "pending_count": 5,
            "bottlenecks_by_path": [
                {"path_segment": "الشؤون المالية", "pending_count": 5, "avg_days_open": 4.0},
                {"path_segment": "الموارد البشرية", "pending_count": 2, "avg_days_open": 3.0},
            ],
        }}
        agents_miner.run_analytics_miner("ws", patterns)
        self.assertEqual(len(_fake.facts), 2)


class TestSampleSizeGate(unittest.TestCase):
    """A correct percentage over a tiny denominator is not a [VERIFIED] fact.
    Below the minimum sample the miner must emit [INSUFFICIENT DATA] and store
    nothing — otherwise the reasoning constitution makes every agent lead its
    answer with '100% conversion rate' derived from a single deal."""

    def setUp(self):
        agents_miner.knowledge = _fake
        _fake.facts.clear()
        _fake.deleted.clear()
        _fake._next_id = 1

    def test_single_deal_is_not_a_verified_conversion_rate(self):
        res = agents_miner.run_analytics_miner(
            "ws", {"finance_crm_metrics": {"total_deals": 1, "won_deals": 1}})
        self.assertEqual(res["saved_to_pgvector"], 0)
        self.assertEqual(len(_fake.facts), 0)
        self.assertTrue(any("INSUFFICIENT DATA" in n for n in res["insufficient_data"]))

    def test_sample_at_threshold_is_verified_and_stored(self):
        res = agents_miner.run_analytics_miner(
            "ws", {"finance_crm_metrics": {"total_deals": 5, "won_deals": 2}})
        self.assertEqual(res["saved_to_pgvector"], 1)
        self.assertIn("VERIFIED STATS", _fake.facts[0]["content"])
        self.assertEqual(res["insufficient_data"], [])

    def test_insufficient_notes_are_never_persisted(self):
        agents_miner.run_analytics_miner(
            "ws", {"finance_crm_metrics": {"total_deals": 2, "won_deals": 1},
                   "operational_metrics": {"total_attendance_logs": 3, "late_check_ins": 1}})
        self.assertEqual(_fake.facts, [], "insufficient-data notes must not reach pgvector")


if __name__ == "__main__":
    unittest.main()
