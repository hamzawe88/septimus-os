"""Comprehensive unit & integration tests for internal AI agents & skills.

Covers:
  - agents_miner.py: Active learning loop, mathematical re-derivation, fact deduplication.
  - agents_correspondence.py: Redrafting, compliance audit, chunk indexing.
  - skills_registry.py: Dynamic loading, query search, system prompt generation, stop-gate parameters.
  - agents_orchestrator.py: Sovereign Brain execution, stop-gate guardrail trigger, fallback and LLM extraction.
"""
import json
import os
import sys
import tempfile
import unittest
from unittest.mock import AsyncMock, MagicMock, patch
import pytest  # type: ignore

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from agents_miner import run_analytics_miner, verify_and_distill_patterns
from agents_correspondence import rewrite_official_letter, audit_legal_compliance, index_archived_correspondence
from skills_registry import DynamicSkillRegistry, skills_registry
from agents_orchestrator import InternalAgentOrchestrator


class TestAgentsMiner(unittest.TestCase):
    def test_verify_and_distill_patterns_correspondence(self):
        patterns = {
            "correspondence_metrics": {
                "total_correspondences": 100,
                "pending_count": 35,
                "bottlenecks_by_path": [
                    {"path_segment": "legal_diwan", "pending_count": 5, "avg_days_open": 4.2}
                ]
            }
        }
        facts = verify_and_distill_patterns(patterns)
        assert len(facts) == 2
        assert "[VERIFIED STATS] المراسلات الرسمية تواجه نسبة تراكم تبلغ 35.0%" in facts[0]
        assert "[VERIFIED STATS - Candidate Fact] المراسلات في المسار المؤسسي ('legal_diwan')" in facts[1]

    def test_verify_and_distill_patterns_finance_and_crm(self):
        patterns = {
            "finance_crm_metrics": {
                "total_invoices": 50,
                "overdue_invoices": 12,
                "overdue_amount": 45000.50,
                "total_deals": 20,
                "won_deals": 8
            }
        }
        facts = verify_and_distill_patterns(patterns)
        assert any("الفواتير المالية في مسار التحصيل تواجه تأخراً بنسبة 24.0%" in f for f in facts)
        assert any("معدل إغلاق الصفقات الناجحة (Conversion Rate) يبلغ 40.0%" in f for f in facts)

    def test_verify_and_distill_patterns_attendance_and_insights(self):
        patterns = {
            "operational_metrics": {
                "total_attendance_logs": 200,
                "late_check_ins": 40
            },
            "candidate_insights": [
                "[VERIFIED STATS] الموظفون في فرع طرابلس يسجلون حضور منتظم بنسبة 95%."
            ]
        }
        facts = verify_and_distill_patterns(patterns)
        assert any("معدلات التأخر في تسجيل الحضور والانصراف تبلغ 20.0%" in f for f in facts)
        assert any("الموظفون في فرع طرابلس يسجلون حضور منتظم" in f for f in facts)

    @patch("agents_miner.knowledge.list_facts")
    @patch("agents_miner.knowledge.save_fact")
    def test_run_analytics_miner_with_payload_deduplication(self, mock_save, mock_list):
        mock_list.return_value = [
            {"id": "fact-1", "content": "[VERIFIED STATS] المراسلات الرسمية تواجه نسبة تراكم تبلغ 35.0% (35 خطاب معلق من إجمالي 100)."}
        ]
        patterns = {
            "correspondence_metrics": {
                "total_correspondences": 100,
                "pending_count": 35,
            },
            "finance_crm_metrics": {
                "total_invoices": 10,
                "overdue_invoices": 3,
                "overdue_amount": 5000.0
            }
        }
        res = run_analytics_miner("ws-123", payload_patterns=patterns)
        assert res["status"] == "success"
        assert res["distilled_total"] == 2
        # First fact is exact duplicate of existing, second fact (invoices 30.0%) is new
        assert res["saved_to_pgvector"] == 1
        mock_save.assert_called_once()

    @patch("agents_miner.requests.post")
    def test_run_analytics_miner_fetch_backend_error(self, mock_post):
        mock_resp = MagicMock()
        mock_resp.status_code = 500
        mock_resp.text = "Internal error"
        mock_post.return_value = mock_resp

        res = run_analytics_miner("ws-123", payload_patterns=None)
        assert res["status"] == "error"
        assert "backend status 500" in res["message"]


class TestAgentsCorrespondence(unittest.IsolatedAsyncioTestCase):
    @patch("agents_correspondence.get_active_llm")
    @patch("agents_correspondence.knowledge.retrieve_institutional_facts")
    async def test_rewrite_official_letter_success(self, mock_retrieve, mock_llm_getter):
        mock_retrieve.return_value = ["[VERIFIED STATS] الردود المعلقة 10"]
        mock_llm = AsyncMock()
        mock_llm.ainvoke.return_value = MagicMock(
            content='```json\n{"rewritten_title": "خطاب رسمي محكم", "rewritten_content": "تحية طيبة وبعد..."}\n```'
        )
        mock_llm_getter.return_value = mock_llm

        res = await rewrite_official_letter("ws-1", "عنوان مسودة", "محتوى مسودة", target_tone="formal_diwan", lang="ar")
        assert res["rewritten_title"] == "خطاب رسمي محكم"
        assert res["rewritten_content"] == "تحية طيبة وبعد..."
        assert res["tone_used"] == "formal_diwan"

    @patch("agents_correspondence.get_active_llm")
    async def test_rewrite_official_letter_no_llm(self, mock_llm_getter):
        mock_llm_getter.return_value = None
        res = await rewrite_official_letter("ws-1", "عنوان", "محتوى", lang="ar")
        assert res["error"] == "No active LLM found for workspace."
        assert res["rewritten_title"] == "عنوان"

    @patch("agents_correspondence.get_active_llm")
    @patch("agents_correspondence.knowledge.retrieve_institutional_facts")
    async def test_audit_legal_compliance_success(self, mock_retrieve, mock_llm_getter):
        mock_retrieve.return_value = []
        mock_llm = AsyncMock()
        mock_llm.ainvoke.return_value = MagicMock(
            content='{"compliance_score": 92, "issues": ["تحديد الموعد النهائي غير دقيق"], "suggestions": ["إضافة مادة قانونية"]}'
        )
        mock_llm_getter.return_value = mock_llm

        res = await audit_legal_compliance("ws-1", "عنوان", "نص الخطاب", lang="ar")
        assert res["compliance_score"] == 92
        assert len(res["issues"]) == 1
        assert res["issues"][0] == "تحديد الموعد النهائي غير دقيق"

    @patch("agents_correspondence.requests.post")
    def test_index_archived_correspondence(self, mock_post):
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = {"indexed": 3}
        mock_post.return_value = mock_resp

        long_content = "نص طويل جداً في الخطاب الرسمي... " * 50
        count = index_archived_correspondence("corr-1", "SN-999", "قرار إداري", long_content, "ws-1")
        assert count == 3
        mock_post.assert_called_once()
        payload = mock_post.call_args[1]["json"]
        assert payload["entity_type"] == "correspondence"
        assert payload["entity_id"] == "corr-1"
        assert len(payload["chunks"]) > 0


class TestSkillsRegistry(unittest.TestCase):
    def test_registry_loading_and_retrieval(self):
        with tempfile.TemporaryDirectory() as tmp_dir:
            skill_md_path = os.path.join(tmp_dir, "test_auditor.md")
            with open(skill_md_path, "w", encoding="utf-8") as f:
                f.write("---\nname: Test Legal Auditor\ndescription: Audits legal contracts\nemoji: ⚖️\nrequired_parameters: contract_id, risk_level\n---\nHere are instructions for auditing contracts.")

            registry = DynamicSkillRegistry(skills_directory=tmp_dir)
            assert len(registry.registry) == 1
            assert registry.get_skill("test_auditor") is not None
            assert registry.get_skill("Test Legal Auditor") is not None

            search = registry.search_skills("Audits legal contracts")
            assert len(search) == 1
            assert search[0]["id"] == "test_auditor"

    def test_generate_system_prompt_contains_router_contract(self):
        prompt = skills_registry.generate_system_prompt()
        assert "orchestrator" in prompt.lower()
        assert "Epistemic rigor" in prompt


class TestInternalAgentOrchestrator(unittest.IsolatedAsyncioTestCase):
    async def test_execute_query_stop_gate_triggered(self):
        orch = InternalAgentOrchestrator()
        mock_skill = {
            "id": "mock_persona",
            "name": "Mock Persona",
            "emoji": "🛠️",
            "description": "Mock description",
            "vibe": "Mock vibe",
            "full_instructions": "Mock instructions",
            "required_parameters": ["ticket_id"]
        }
        with patch.object(orch.registry, "search_skills", return_value=[mock_skill]):
            res = await orch.execute_query("أرجو فحص المشكلة المستعجلة", target_persona="mock_persona")
            assert res["status"] == "missing_parameters"
            assert res["required_input"]["required_field"] == "ticket_id"
            assert "ticket_id" in res["deliverables"]["missing_parameters"]

    async def test_execute_query_regex_parameter_extraction(self):
        orch = InternalAgentOrchestrator()
        mock_skill = {
            "id": "mock_persona",
            "name": "Mock Persona",
            "emoji": "🛠️",
            "description": "Mock description",
            "vibe": "Mock vibe",
            "full_instructions": "Mock instructions",
            "required_parameters": ["ticket_id"]
        }
        with patch.object(orch.registry, "search_skills", return_value=[mock_skill]):
            # Query contains #T-1234
            res = await orch.execute_query("أرجو فحص التذكرة #T-1234 المستعجلة", target_persona="mock_persona")
            # No provider means the request is explicitly not executed.
            assert res["status"] == "unavailable"
            assert res["deliverables"]["processed_parameters"]["ticket_id"] == "#T-1234"

    @patch("agents_orchestrator.get_active_llm")
    async def test_execute_query_sovereign_fallback_when_no_llm(self, mock_llm_getter):
        mock_llm_getter.return_value = None
        orch = InternalAgentOrchestrator()
        mock_skill = {
            "id": "general_brain",
            "name": "General Brain",
            "emoji": "🧠",
            "description": "General Sovereign Brain",
            "vibe": "Sovereign Executive",
            "full_instructions": "Sovereign instructions",
            "required_parameters": []
        }
        with patch.object(orch.registry, "search_skills", return_value=[mock_skill]):
            res = await orch.execute_query("ما هو التقرير الصباحي؟")
            assert res["status"] == "unavailable"

    @patch("agents_orchestrator.get_active_llm")
    @patch("agents_orchestrator.retrieve_context")
    async def test_execute_query_llm_json_extraction(self, mock_retrieve, mock_llm_getter):
        mock_retrieve.return_value = "Knowledge docs found."
        mock_llm = AsyncMock()
        mock_llm.ainvoke.return_value = MagicMock(
            content='هذا تحليل تفصيلي للموضوع.\n```json\n{"analysis_score": 98, "recommendation": "Proceed immediately"}\n```'
        )
        mock_llm_getter.return_value = mock_llm

        orch = InternalAgentOrchestrator()
        mock_skill = {
            "id": "analyst",
            "name": "Data Analyst",
            "emoji": "📈",
            "description": "Data analysis",
            "vibe": "Analytical",
            "full_instructions": "Analyze data",
            "required_parameters": []
        }
        with patch.object(orch.registry, "search_skills", return_value=[mock_skill]):
            res = await orch.execute_query("حلل أداء الربع الأول")
            assert res["status"] == "success"
            assert res["deliverables"]["analysis_score"] == 98
            assert res["deliverables"]["recommendation"] == "Proceed immediately"
