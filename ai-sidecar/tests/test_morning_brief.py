"""Offline tests for morning-brief entity flattening (no langchain, no network).

The backend sends unified Entity records shaped `{id, entity_type, data:{...}}`,
where every human-readable field (title, status, amount, stage, due_date) lives
inside `data`. The original minifier read `type`/`title`/`status` from the top
level and produced nothing but `{id}` — so every brief was data-blind. These
tests pin that the flattener reads `entity_type` and pulls fields out of `data`,
and buckets entities by kind.
"""
import importlib.util
import os
import re
import sys
import unittest

_MOD = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                    "agents_morning_auditor.py")

# `_flatten_entities` is a closure inside generate_morning_brief; importing the
# module would pull in langchain. Extract the function body and exec it in
# isolation — it depends only on the stdlib.
_src = open(_MOD, encoding="utf-8").read()
_m = re.search(r"def _flatten_entities\(raw_entities.*?\n(?=\n    #|\n    minified)", _src, re.DOTALL)
_body = _m.group(0)
_dedent = "\n".join(line[4:] if line.startswith("    ") else line for line in _body.splitlines())
_ns: dict = {}
exec(_dedent, _ns)
flatten = _ns["_flatten_entities"]


class TestFlattenEntities(unittest.TestCase):
    def _entities(self):
        return [
            {"id": "t1", "entity_type": "task",
             "data": {"title": "Q3 report", "status": "in_progress", "priority": 2, "due_date": "2026-07-20"}},
            {"id": "i1", "entity_type": "finance_invoice",
             "data": {"title": "Acme invoice", "status": "overdue", "amount": 4500, "currency": "LYD"}},
            {"id": "d1", "entity_type": "crm_opportunity",
             "data": {"title": "Expansion deal", "value": 22000, "stage": "negotiation"}},
        ]

    def test_task_fields_come_from_nested_data(self):
        b = flatten(self._entities())
        self.assertEqual(len(b["overdue_tasks"]), 1)
        task = b["overdue_tasks"][0]
        self.assertEqual(task["title"], "Q3 report")          # was null before
        self.assertEqual(task["status"], "in_progress")       # was null before
        self.assertEqual(task["priority"], 2)

    def test_invoice_amount_is_extracted(self):
        b = flatten(self._entities())
        inv = b["overdue_invoices"][0]
        self.assertEqual(inv["amount"], 4500)
        self.assertEqual(inv["currency"], "LYD")

    def test_deal_value_and_stage(self):
        b = flatten(self._entities())
        deal = b["new_deals"][0]
        self.assertEqual(deal["value"], 22000)
        self.assertEqual(deal["stage"], "negotiation")

    def test_entities_are_bucketed_by_type(self):
        b = flatten(self._entities())
        self.assertEqual((len(b["overdue_tasks"]), len(b["overdue_invoices"]), len(b["new_deals"])), (1, 1, 1))

    def test_canonical_crm_opportunity_counts_as_deal(self):
        b = flatten([{"id": "l1", "entity_type": "crm_opportunity", "data": {"title": "Opportunity"}}])
        self.assertEqual(len(b["new_deals"]), 1)

    def test_missing_title_gets_placeholder_not_crash(self):
        b = flatten([{"id": "t1", "entity_type": "task", "data": {"status": "todo"}}])
        self.assertEqual(b["overdue_tasks"][0]["title"], "(بدون عنوان)")

    def test_unknown_type_goes_to_other(self):
        b = flatten([{"id": "x1", "entity_type": "widget", "data": {"title": "X"}}])
        self.assertEqual(len(b["other"]), 1)
        self.assertEqual(b["other"][0]["type"], "widget")

    def test_robust_against_malformed_records(self):
        # data missing, data not a dict, non-dict element — none may raise
        b = flatten([
            {"id": "a", "entity_type": "task"},
            {"id": "b", "entity_type": "task", "data": None},
            {"id": "c", "entity_type": "task", "data": "oops"},
            "not-a-dict",
            None,
        ])
        self.assertEqual(len(b["overdue_tasks"]), 3)

    def test_empty_input(self):
        b = flatten([])
        self.assertEqual(sum(len(v) for v in b.values()), 0)


if __name__ == "__main__":
    unittest.main()
