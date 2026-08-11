"""Offline unit tests for the agent-RBAC capability matrix (no langchain)."""
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import agent_rbac


class _FakeTool:
    def __init__(self, name):
        self.name = name


class TestAllowedTools(unittest.TestCase):
    def test_common_tools_everywhere(self):
        for at in ("hr", "crm", "tasks", "correspondence", "supervisor", "monolithic"):
            self.assertIn("search_knowledge", agent_rbac.allowed_tools_for(at))
            self.assertIn("list_institutional_facts", agent_rbac.allowed_tools_for(at))

    def test_hr_scope(self):
        allowed = agent_rbac.allowed_tools_for("hr")
        self.assertIn("get_hr_policy", allowed)
        self.assertIn("get_attendance_summary", allowed)
        # HR must NOT be able to reach finance/CRM tools
        self.assertNotIn("create_crm_deal", allowed)
        self.assertNotIn("get_crm_deals", allowed)

    def test_aliases(self):
        self.assertEqual(agent_rbac.allowed_tools_for("policy"), agent_rbac.allowed_tools_for("hr"))
        self.assertEqual(agent_rbac.allowed_tools_for("sales"), agent_rbac.allowed_tools_for("crm"))
        self.assertEqual(agent_rbac.allowed_tools_for("diwan"), agent_rbac.allowed_tools_for("correspondence"))
        # Unknown agent types fail closed: common read tools only, never the
        # supervisor's delegation capabilities.
        unknown = agent_rbac.allowed_tools_for("what_is_this")
        self.assertIn("search_knowledge", unknown)
        self.assertNotIn("delegate_to_hr_specialist", unknown)

    def test_supervisor_has_only_delegation(self):
        allowed = agent_rbac.allowed_tools_for("supervisor")
        self.assertIn("delegate_to_hr_specialist", allowed)
        self.assertNotIn("create_task", allowed)

    def test_monolithic_superset(self):
        allowed = agent_rbac.allowed_tools_for("monolithic")
        for t in ("get_hr_policy", "get_crm_deals", "get_tasks", "create_task",
                  "create_crm_deal", "rewrite_correspondence"):
            self.assertIn(t, allowed)


class TestMemoryWriteScope(unittest.TestCase):
    """Writing an institutional fact steers every later agent run in the
    workspace, so it belongs to the agents that own workspace-wide policy — not
    to every specialist by default."""

    def test_specialists_cannot_write_memory(self):
        for at in ("hr", "crm", "tasks", "correspondence", "policy", "sales", "pm", "diwan"):
            allowed = agent_rbac.allowed_tools_for(at)
            self.assertNotIn("save_institutional_fact", allowed, at)
            self.assertNotIn("delete_institutional_fact", allowed, at)

    def test_specialists_can_still_read_memory(self):
        for at in ("hr", "crm", "tasks", "correspondence"):
            self.assertIn("list_institutional_facts", agent_rbac.allowed_tools_for(at))

    def test_supervisor_and_monolithic_may_write_memory(self):
        for at in ("supervisor", "general", "monolithic"):
            allowed = agent_rbac.allowed_tools_for(at)
            self.assertIn("save_institutional_fact", allowed, at)
            self.assertIn("delete_institutional_fact", allowed, at)

    def test_memory_write_is_stripped_from_a_specialist(self):
        logs = []
        tools = [_FakeTool("get_hr_policy"), _FakeTool("save_institutional_fact")]
        kept = [t.name for t in agent_rbac.enforce("hr", tools, log=logs.append)]
        self.assertEqual(kept, ["get_hr_policy"])
        self.assertTrue(logs and "save_institutional_fact" in logs[0])


class TestEnforce(unittest.TestCase):
    def test_strips_disallowed_and_logs(self):
        logs = []
        # An HR agent mistakenly handed a finance tool: must be stripped.
        tools = [_FakeTool("search_knowledge"), _FakeTool("get_hr_policy"),
                 _FakeTool("create_crm_deal")]
        kept = agent_rbac.enforce("hr", tools, log=logs.append)
        names = [t.name for t in kept]
        self.assertIn("get_hr_policy", names)
        self.assertNotIn("create_crm_deal", names)
        self.assertTrue(logs and "create_crm_deal" in logs[0])

    def test_noop_when_all_allowed(self):
        logs = []
        tools = [_FakeTool("search_knowledge"), _FakeTool("get_crm_deals"),
                 _FakeTool("create_crm_deal")]
        kept = agent_rbac.enforce("crm", tools, log=logs.append)
        self.assertEqual(len(kept), 3)
        self.assertEqual(logs, [])

    def test_describe_capabilities_shape(self):
        d = agent_rbac.describe_capabilities()
        self.assertIn("hr", d)
        self.assertIsInstance(d["hr"], list)


if __name__ == "__main__":
    unittest.main()
