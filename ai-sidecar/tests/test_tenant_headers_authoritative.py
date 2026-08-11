"""Tenant identity must come from the proxy headers, never the request body.

The Go layer (backend-core/handlers/ai_proxy.go) stamps X-Workspace-Id and
X-User-Role onto every forwarded request from the caller's JWT. The sidecar used
to treat those headers as a *fallback*, so a body that already carried a
workspace_id or user_role won — letting any authenticated user read and write
another tenant's data, and hand themselves a higher role, just by editing the
JSON they posted. These tests pin the inverted precedence.
"""
import os
import sys
import unittest
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi.testclient import TestClient  # type: ignore

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

import main
from main import app, verify_internal_token

VICTIM_WS = "victim-workspace"
ATTACKER_WS = "attacker-workspace"

# Headers as the Go proxy stamps them: the caller really belongs to ATTACKER_WS
# and really is a plain member.
PROXY_HEADERS = {"X-Workspace-Id": ATTACKER_WS, "X-User-Role": "member"}


class TestChatContextIsHeaderScoped(unittest.TestCase):
    """/api/v1/ai/chat — context["workspace_id"] / ["user_role"] feed the agent
    tools, so they decide what the agent may touch and what it may run."""

    def setUp(self):
        self.client = TestClient(app)
        app.dependency_overrides[verify_internal_token] = lambda: None

    def tearDown(self):
        app.dependency_overrides.clear()

    def _post_chat(self, context, headers):
        with patch("main.run_chat_agent") as mock_agent:
            mock_agent.return_value = "ok"
            resp = self.client.post(
                "/api/v1/ai/chat",
                json={"agent_type": "supervisor", "message": "hi", "context": context},
                headers=headers,
            )
        assert resp.status_code == 200, resp.text
        assert mock_agent.call_count == 1
        return mock_agent.call_args.kwargs["context"]

    def test_body_workspace_id_is_ignored_in_favor_of_header(self):
        ctx = self._post_chat({"workspace_id": VICTIM_WS}, PROXY_HEADERS)
        assert ctx["workspace_id"] == ATTACKER_WS

    def test_body_user_role_is_ignored_in_favor_of_header(self):
        ctx = self._post_chat({"user_role": "admin"}, PROXY_HEADERS)
        assert ctx["user_role"] == "member"

    def test_both_body_claims_ignored_together(self):
        ctx = self._post_chat(
            {"workspace_id": VICTIM_WS, "user_role": "super_admin", "lang": "en"},
            PROXY_HEADERS,
        )
        assert ctx["workspace_id"] == ATTACKER_WS
        assert ctx["user_role"] == "member"
        # Unrelated context keys still pass through untouched.
        assert ctx["lang"] == "en"

    def test_header_scopes_request_when_body_says_nothing(self):
        ctx = self._post_chat({}, PROXY_HEADERS)
        assert ctx["workspace_id"] == ATTACKER_WS
        assert ctx["user_role"] == "member"

    def test_role_defaults_to_member_when_header_absent(self):
        """A missing X-User-Role must not let the body supply one."""
        ctx = self._post_chat({"user_role": "admin"}, {"X-Workspace-Id": ATTACKER_WS})
        assert ctx["user_role"] == "member"

    def test_missing_workspace_header_is_rejected(self):
        response = self.client.post(
            "/api/v1/ai/chat",
            json={"agent_type": "supervisor", "message": "hi", "context": {"workspace_id": VICTIM_WS}},
        )
        assert response.status_code == 400


class TestWorkspaceResolution(unittest.TestCase):
    """_workspace_from is the shared helper behind every workspace-scoped
    endpoint; header beats body beats single-tenant default."""

    def test_header_wins_over_body(self):
        assert main._workspace_from(VICTIM_WS, ATTACKER_WS) == ATTACKER_WS

    def test_body_used_when_header_empty(self):
        assert main._workspace_from(VICTIM_WS, "") == VICTIM_WS

    def test_missing_workspace_is_rejected(self):
        from fastapi import HTTPException
        with pytest.raises(HTTPException):
            main._workspace_from(None, "")


class TestEndpointsHonorWorkspaceHeader(unittest.TestCase):
    """Endpoints that take a body workspace_id must still resolve header-first."""

    def setUp(self):
        self.client = TestClient(app)
        app.dependency_overrides[verify_internal_token] = lambda: None

    def tearDown(self):
        app.dependency_overrides.clear()

    @patch("main.get_active_llm")
    def test_text_to_task_uses_header_workspace(self, mock_llm_getter):
        # Regression: this endpoint had no header fallback at all, so the body
        # picked which tenant's LLM provider config was loaded.
        mock_llm = AsyncMock()
        mock_llm.ainvoke.return_value = MagicMock(content='{"title": "t"}')
        mock_llm_getter.return_value = mock_llm

        resp = self.client.post(
            "/api/v1/ai/text-to-task",
            json={"message": "ship the thing", "workspace_id": VICTIM_WS},
            headers=PROXY_HEADERS,
        )
        assert resp.status_code == 200, resp.text
        assert mock_llm_getter.call_args.args[0] == ATTACKER_WS

    @patch("main.retrieve_context")
    @patch("main.get_active_llm")
    def test_query_documents_retrieves_from_header_workspace(self, mock_llm_getter, mock_retrieve):
        # The RAG store is the tenant's documents — the sharpest read leak.
        mock_retrieve.return_value = ""
        mock_llm = AsyncMock()
        mock_llm_getter.return_value = mock_llm

        resp = self.client.post(
            "/api/v1/ai/query",
            json={"query": "anything", "workspace_id": VICTIM_WS},
            headers=PROXY_HEADERS,
        )
        assert resp.status_code == 200, resp.text
        assert mock_retrieve.call_args.args[0] == ATTACKER_WS

    def test_orchestrator_execute_uses_header_identity(self):
        with patch("main.agent_orchestrator") as mock_orch:
            mock_orch.execute_query = AsyncMock(return_value={"status": "success"})
            resp = self.client.post(
                "/internal/ai/orchestrator/execute",
                json={
                    "query": "do it",
                    "workspace_id": VICTIM_WS,
                    "user_id": "someone-else",
                    "user_role": "super_admin",
                },
                headers={**PROXY_HEADERS, "X-User-Id": "attacker-user"},
            )
        assert resp.status_code == 200, resp.text
        kwargs = mock_orch.execute_query.call_args.kwargs
        assert kwargs["workspace_id"] == ATTACKER_WS
        assert kwargs["user_id"] == "attacker-user"
        assert kwargs["user_role"] == "member"


if __name__ == "__main__":
    unittest.main()
