"""Comprehensive integration & unit tests for AI-Sidecar FastAPI endpoints & NATS event consumer handlers.

Covers:
  - Security / Token Verification (`verify_internal_token`)
  - HTTP Endpoints: /api/v1/ai/query, /api/v1/ai/chat, /api/v1/ai/plan-sprint, /api/v1/ai/correspondence/*, /internal/ai/orchestrator/execute
  - NATS Event Handlers: on_task_created, on_message_created, on_analytics_mine_requested, on_correspondence_archived, on_internal_orchestrator_request
"""
import json
import os
import sys
import unittest
from unittest.mock import AsyncMock, MagicMock, patch
from fastapi.testclient import TestClient

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

import main
from main import app, verify_internal_token
import nats_events


class TestVerifyInternalToken(unittest.TestCase):
    def test_token_verification_success_and_failure(self):
        # When INTERNAL_API_TOKEN is set
        with patch("main.INTERNAL_API_TOKEN", "secret-internal-token-123"):
            # Valid token header
            verify_internal_token(x_internal_token="secret-internal-token-123")
            
            # Invalid token header raises 401
            from fastapi import HTTPException
            with self.assertRaises(HTTPException) as cm:
                verify_internal_token(x_internal_token="wrong-token")
            assert cm.exception.status_code == 401

    def test_token_verification_dev_mode(self):
        # When INTERNAL_API_TOKEN is empty string (dev mode)
        with patch("main.INTERNAL_API_TOKEN", ""):
            # Should not raise any exception even if header is empty or wrong
            verify_internal_token(x_internal_token="")


class TestHTTPEndpoints(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(app)
        # Override dependency for testing endpoints without token barrier
        app.dependency_overrides[verify_internal_token] = lambda: None

    def tearDown(self):
        app.dependency_overrides.clear()

    @patch("main.local_voice_status")
    def test_voice_local_status(self, mock_status):
        mock_status.return_value = {"whisper": True, "piper": True}
        resp = self.client.get("/api/v1/ai/voice/local/status")
        assert resp.status_code == 200
        assert resp.json() == {"whisper": True, "piper": True}

    @patch("main.get_active_llm")
    @patch("main.retrieve_context")
    def test_query_documents_success(self, mock_retrieve, mock_llm_getter):
        mock_retrieve.return_value = "مستند السياسة الداخلية للبنوك."
        mock_llm = AsyncMock()
        mock_llm.ainvoke.return_value = MagicMock(content="وفقاً للسياسة، فإن الإجراء معتمد.")
        mock_llm_getter.return_value = mock_llm

        payload = {"query": "هل الإجراء معتمد؟", "workspace_id": "ws-1", "lang": "ar"}
        resp = self.client.post("/api/v1/ai/query", json=payload)
        assert resp.status_code == 200
        assert resp.json()["answer"] == "وفقاً للسياسة، فإن الإجراء معتمد."

    @patch("main.run_chat_agent")
    def test_chat_with_agent_success(self, mock_run_agent):
        mock_run_agent.return_value = "تم تنفيذ المهمة المطلوبة بنجاح."
        payload = {
            "agent_type": "supervisor",
            "message": "قم بتوزيع المهام على الفريق",
            "context": {"lang": "ar", "workspace_id": "ws-1"}
        }
        resp = self.client.post("/api/v1/ai/chat", json=payload)
        assert resp.status_code == 200
        assert resp.json()["reply"] == "تم تنفيذ المهمة المطلوبة بنجاح."

    @patch("main.get_active_llm")
    def test_plan_sprint_greedy_fallback(self, mock_llm_getter):
        mock_llm_getter.return_value = None
        payload = {
            "capacity": 10,
            "backlog": [
                {"ID": "TASK-1", "Priority": 5, "StoryPoints": 5},
                {"ID": "TASK-2", "Priority": 3, "StoryPoints": 3},
                {"ID": "TASK-3", "Priority": 1, "StoryPoints": 8}
            ]
        }
        resp = self.client.post("/api/v1/ai/plan-sprint", json=payload)
        assert resp.status_code == 200
        # Should pick TASK-1 (5 pts) + TASK-2 (3 pts) = 8 <= 10 capacity
        assert resp.json()["selected_task_ids"] == ["TASK-1", "TASK-2"]

    @patch("main.rewrite_official_letter")
    def test_correspondence_rewrite(self, mock_rewrite):
        mock_rewrite.return_value = {"rewritten_title": "خطاب معدل", "rewritten_content": "نص معدل"}
        payload = {"title": "عنوان", "content": "نص", "tone": "formal_diwan", "workspace_id": "ws-1"}
        resp = self.client.post("/api/v1/ai/correspondence/rewrite", json=payload)
        assert resp.status_code == 200
        assert resp.json()["rewritten_title"] == "خطاب معدل"

    @patch("main.get_active_llm")
    def test_generate_subtasks_fallback(self, mock_llm_getter):
        mock_llm_getter.return_value = None
        payload = {"title": "تطوير واجهة الإشعارات", "description": "بناء نظام إشعارات في الوقت الفعلي", "lang": "ar"}
        resp = self.client.post("/api/v1/ai/generate-subtasks", json=payload)
        assert resp.status_code == 200
        assert len(resp.json()["subtasks"]) == 4
        assert "تفكيك معماري لـ: تطوير واجهة الإشعارات" in resp.json()["subtasks"][0]

    @patch("main.agent_orchestrator.execute_query")
    def test_internal_orchestrator_execute(self, mock_exec):
        mock_exec.return_value = {"status": "success", "output_prose": "تنفيذ داخلي محكم"}
        payload = {"query": "مراجعة المهام", "target_persona": "general_brain", "workspace_id": "ws-1"}
        resp = self.client.post("/internal/ai/orchestrator/execute", json=payload)
        assert resp.status_code == 200
        assert resp.json()["output_prose"] == "تنفيذ داخلي محكم"


class TestNATSEventsHandlers(unittest.IsolatedAsyncioTestCase):
    @patch("nats_events.get_active_llm")
    @patch("nats_events.requests.get")
    async def test_on_task_created_estimates_points(self, mock_get, mock_llm_getter):
        # Mocking task with 0 story points
        mock_msg = MagicMock()
        mock_msg.data = json.dumps({"task_id": "t-99", "title": "مهمة برمجية جديدة", "story_points": 0}).encode()
        mock_msg.ack = AsyncMock()

        mock_llm = AsyncMock()
        mock_llm.ainvoke.return_value = MagicMock(content="5")
        mock_llm_getter.return_value = mock_llm

        with patch("aiohttp.ClientSession") as mock_session_cls:
            mock_session = MagicMock()
            mock_put = MagicMock()
            mock_put.__aenter__.return_value = AsyncMock(status=200)
            mock_session.put.return_value = mock_put
            mock_session.__aenter__.return_value = mock_session
            mock_session_cls.return_value = mock_session

            await nats_events.on_task_created(mock_msg)
            mock_msg.ack.assert_called_once()
            mock_llm.ainvoke.assert_called_once()

    @patch("nats_events.get_active_llm")
    @patch("nats_events.retrieve_context")
    async def test_on_message_created_with_ai_mention(self, mock_retrieve, mock_llm_getter):
        mock_msg = MagicMock()
        # Message mentions @ai
        mock_msg.data = json.dumps({"content": "مرحباً @ai اعطني ملخص المهام", "channel_id": "ch-1", "workspace_id": "ws-1"}).encode()
        mock_msg.ack = AsyncMock()

        mock_retrieve.return_value = "ملخص المهام: 5 منجزة"
        mock_llm = AsyncMock()
        mock_llm.ainvoke.return_value = MagicMock(content="أهلاً بك! لديك 5 مهام منجزة اليوم.")
        mock_llm_getter.return_value = mock_llm

        mock_nc = AsyncMock()
        with patch("nats_events._nc", mock_nc):
            await nats_events.on_message_created(mock_msg)
            mock_msg.ack.assert_called_once()
            mock_nc.publish.assert_called_once()
            pub_args = mock_nc.publish.call_args[0]
            assert pub_args[0] == "chat.message.ai_reply"
            assert "أهلاً بك" in json.loads(pub_args[1].decode())["content"]

    @patch("agents_miner.run_analytics_miner")
    async def test_on_analytics_mine_requested(self, mock_miner):
        mock_msg = MagicMock()
        mock_msg.data = json.dumps({"workspace_id": "ws-55", "patterns": {"correspondence_metrics": {"pending_count": 10}}}).encode()
        mock_msg.ack = AsyncMock()

        mock_miner.return_value = {"status": "success", "distilled_total": 1}
        await nats_events.on_analytics_mine_requested(mock_msg)
        mock_msg.ack.assert_called_once()
        mock_miner.assert_called_once_with("ws-55", {"correspondence_metrics": {"pending_count": 10}})

    @patch("nats_events.index_archived_correspondence")
    async def test_on_correspondence_archived(self, mock_index):
        mock_msg = MagicMock()
        mock_msg.data = json.dumps({
            "correspondence_id": "corr-88",
            "serial_number": "SN-88",
            "title": "خطاب",
            "content": "نص الخطاب الأرشيفي...",
            "workspace_id": "ws-1"
        }).encode()
        mock_msg.ack = AsyncMock()

        await nats_events.on_correspondence_archived(mock_msg)
        mock_msg.ack.assert_called_once()
        mock_index.assert_called_once_with("corr-88", "SN-88", "خطاب", "نص الخطاب الأرشيفي...", "ws-1")

    @patch("nats_events.agent_orchestrator.execute_query")
    async def test_on_internal_orchestrator_request(self, mock_exec):
        mock_msg = MagicMock()
        mock_msg.data = json.dumps({
            "query": "ما حالة المشروع؟",
            "target_persona": "general_brain",
            "workspace_id": "ws-1",
            "user_id": "usr-1"
        }).encode()
        mock_msg.ack = AsyncMock()

        mock_exec.return_value = {"status": "success", "output_prose": "المشروع يتقدم بثبات"}
        mock_nc = AsyncMock()
        with patch("nats_events._nc", mock_nc):
            await nats_events.on_internal_orchestrator_request(mock_msg)
            mock_msg.ack.assert_called_once()
            mock_exec.assert_called_once()
            mock_nc.publish.assert_called_once()
            assert mock_nc.publish.call_args[0][0] == "events.ai.orchestrator_result"
