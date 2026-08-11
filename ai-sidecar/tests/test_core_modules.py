import unittest
from unittest.mock import patch, MagicMock, AsyncMock
import os
import sys

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

import i18n
import providers
import knowledge
import observability
import nats_events
import json


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
        self.assertIn("HR Specialist", en_hr)
        # system_prompt_for now appends reasoning directives and the validation
        # gate, so the base role prompt is the prefix rather than the whole string.
        self.assertTrue(
            i18n.system_prompt_for("unknown_agent", "en").startswith(
                i18n.SYS_PROMPTS["en"]["general"]
            )
        )


class TestProviders(unittest.TestCase):
    def test_model_for_default_tiers(self):
        self.assertEqual(providers._model_for("openai", "fast"), "gpt-5-mini")
        self.assertEqual(providers._model_for("openai", "strong"), "gpt-5")
        self.assertEqual(
            providers._model_for("anthropic", "fast"), "claude-haiku-4-5-20251001"
        )
        self.assertEqual(
            providers._model_for("anthropic", "strong"), "claude-sonnet-5"
        )
        self.assertEqual(providers._model_for("ollama", "fast"), "llama3.2:3b")
        self.assertEqual(providers._model_for("ollama", "strong"), "qwen3:8b")

    def test_model_for_per_tier_selection(self):
        # Per-tier UI selection wins over the legacy single selectedModel.
        cfg = {"selectedModelFast": "llama3.2:3b", "selectedModelStrong": "qwen3:8b"}
        self.assertEqual(
            providers._model_for("ollama", "fast", selected_model="qwen2.5-coder:7b", provider_cfg=cfg),
            "llama3.2:3b",
        )
        self.assertEqual(
            providers._model_for("ollama", "strong", selected_model="qwen2.5-coder:7b", provider_cfg=cfg),
            "qwen3:8b",
        )
        # Legacy selectedModel still applies when no per-tier value exists.
        self.assertEqual(
            providers._model_for("ollama", "strong", selected_model="qwen2.5-coder:7b", provider_cfg={}),
            "qwen2.5-coder:7b",
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

    @patch("requests.get")
    def test_drive_import_rejects_untrusted_identifiers_before_network(self, mock_get):
        indexed = knowledge.embed_drive_document(
            "not-a-uuid", "policy.pdf", "also-invalid", "invalid-workspace"
        )
        self.assertEqual(indexed, 0)
        mock_get.assert_not_called()

    @patch.object(knowledge, "_embed_document_file", return_value=2)
    @patch("requests.get")
    def test_drive_import_streams_internal_file_to_temporary_indexer(self, mock_get, mock_index):
        response = MagicMock()
        response.headers = {"Content-Length": "18"}
        response.iter_content.return_value = [b"trusted knowledge\n"]
        response.raise_for_status.return_value = None
        response.__enter__.return_value = response
        response.__exit__.return_value = False
        mock_get.return_value = response

        indexed = knowledge.embed_drive_document(
            "11111111-1111-4111-8111-111111111111",
            "policy.txt",
            "22222222-2222-4222-8222-222222222222",
            "33333333-3333-4333-8333-333333333333",
        )

        self.assertEqual(indexed, 2)
        mock_get.assert_called_once()
        temporary_path = mock_index.call_args.args[0]
        self.assertFalse(os.path.exists(temporary_path))
        self.assertTrue(mock_index.call_args.kwargs["trusted_temporary_path"])


class TestObservability(unittest.TestCase):
    def test_estimate_cost_usd(self):
        # 1M prompt tokens for gpt-5-mini = $0.15, 1M completion = $0.60
        cost = observability.estimate_cost_usd("gpt-5-mini", 1_000_000, 1_000_000)
        self.assertAlmostEqual(cost, 0.75, places=4)

    def test_check_budget_guardrails(self):
        # Clear tracker for clean state
        observability._daily_token_tracker.clear()
        
        # When under budget, shouldn't raise anything
        observability.check_budget_guardrails("ws-test", "ar", max_daily_tokens=100)
        
        # Add tokens beyond limit
        observability._add_tokens("ws-test", 150)
        
        # Now it should raise BudgetExceededError
        with self.assertRaises(observability.BudgetExceededError):
            observability.check_budget_guardrails("ws-test", "ar", max_daily_tokens=100)


class TestSupervisorAndRBAC(unittest.TestCase):
    def test_hr_rbac_filtering(self):
        from agents_chat import _build_tools
        member_tools = _build_tools("ws-test", "ar", user_role="member", agent_type="hr")
        tool_names_member = [t.name for t in member_tools]
        self.assertIn("search_knowledge", tool_names_member)
        self.assertIn("get_hr_policy", tool_names_member)
        self.assertNotIn("get_attendance_summary", tool_names_member)

        admin_tools = _build_tools("ws-test", "ar", user_role="admin", agent_type="hr")
        tool_names_admin = [t.name for t in admin_tools]
        self.assertIn("get_attendance_summary", tool_names_admin)

    def test_crm_rbac_filtering(self):
        from agents_chat import _build_tools
        member_tools = _build_tools("ws-test", "en", user_role="member", agent_type="crm")
        tool_names = [t.name for t in member_tools]
        self.assertIn("get_crm_deals", tool_names)
        self.assertNotIn("create_crm_deal", tool_names)

        sales_tools = _build_tools("ws-test", "en", user_role="sales", agent_type="crm")
        tool_names_sales = [t.name for t in sales_tools]
        self.assertIn("create_crm_deal", tool_names_sales)

    def test_supervisor_delegate_tools(self):
        from agents_chat import _build_tools
        sup_tools = _build_tools("ws-test", "ar", user_role="admin", agent_type="supervisor")
        tool_names = [t.name for t in sup_tools]
        self.assertIn("delegate_to_correspondence_specialist", tool_names)
        self.assertIn("delegate_to_crm_specialist", tool_names)
        self.assertIn("delegate_to_hr_specialist", tool_names)
        self.assertIn("delegate_to_tasks_specialist", tool_names)
        self.assertIn("list_institutional_facts", tool_names)
        self.assertIn("save_institutional_fact", tool_names)
        self.assertIn("delete_institutional_fact", tool_names)

    def test_memory_tools_rbac_filtering(self):
        from agents_chat import _build_tools
        member_tools = _build_tools("ws-test", "ar", user_role="member", agent_type="general")
        tool_names = [t.name for t in member_tools]
        self.assertIn("list_institutional_facts", tool_names)
        self.assertNotIn("save_institutional_fact", tool_names)
        self.assertNotIn("delete_institutional_fact", tool_names)


class TestLongTermMemory(unittest.TestCase):
    @patch("requests.get")
    def test_retrieve_institutional_facts_success(self, mock_get):
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "results": [
                {"content": "الدوام الرسمي يبدأ الساعة 8 صباحاً."},
                {"content": "المراسلات السيادية يجب أن توقع باللون الأزرق."},
            ]
        }
        mock_get.return_value = mock_response

        facts = knowledge.retrieve_institutional_facts("ws-test", "استفسار عن الدوام")
        self.assertEqual(len(facts), 2)
        self.assertIn("الدوام الرسمي يبدأ الساعة 8 صباحاً.", facts[0])

    @patch("requests.post")
    def test_save_fact(self, mock_post):
        mock_response = MagicMock()
        mock_response.status_code = 201
        mock_response.json.return_value = {"id": "fact-123", "success": True}
        mock_post.return_value = mock_response

        res = knowledge.save_fact("ws-test", "سياسة جديدة")
        self.assertEqual(res.get("id"), "fact-123")


class TestExternalWebhooks(unittest.IsolatedAsyncioTestCase):
    @patch("nats_events.get_active_llm")
    async def test_on_webhook_external_delegation(self, mock_get_llm):
        """A valid external event must prove the target channel is in its tenant."""
        mock_llm = AsyncMock()
        mock_llm.ainvoke.return_value = MagicMock(content="Welcome from Agent HR")
        mock_get_llm.return_value = mock_llm

        mock_nc = AsyncMock()
        nats_events._nc = mock_nc

        msg = AsyncMock()
        msg.ack = AsyncMock()
        payload = {
            "event": "whatsapp.ingress",
            "source": "whatsapp",
            "workspace_id": "ws-123",
            "data": {
                "agent_role": "hr",
                "message": "Hello HR agent",
                "channel_id": "11111111-1111-1111-1111-111111111111"
            }
        }
        msg.data = json.dumps(payload).encode()

        access_response = AsyncMock()
        access_response.status = 204
        access_context = AsyncMock()
        access_context.__aenter__.return_value = access_response
        session = MagicMock()
        session.get.return_value = access_context

        with patch("nats_events.http_client.get_session", return_value=session):
            await nats_events.on_webhook_external(msg)

        msg.ack.assert_called_once()
        mock_get_llm.assert_called_once_with("ws-123")
        mock_nc.publish.assert_called_once()
        session.get.assert_called_once()
