"""Septimus AI Sidecar — HTTP API + NATS event orchestration.

This module is the thin wiring layer. Domain logic lives in:
  - config.py        env + service-to-service auth
  - i18n.py          UI-language handling for agent replies
  - providers.py     LLM / embeddings selection per workspace
  - knowledge.py     RAG retrieval + document indexing (unified Go store)
  - agents_chat.py   conversational ReAct agent (/ai/chat)
  - nats_events.py   durable JetStream + core NATS event handlers
"""
import asyncio
import json
from contextlib import asynccontextmanager
from typing import Any, Dict, List, Optional

import uvicorn
from fastapi import Depends, FastAPI, Header, HTTPException, WebSocket
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from langchain_core.messages import HumanMessage, SystemMessage

from config import CORS_ALLOW_ORIGINS, DEFAULT_WORKSPACE_ID, INTERNAL_API_TOKEN
from i18n import language_directive, resolve_lang
from knowledge import retrieve_context
from providers import get_active_llm
from agents_chat import run_chat_agent
from nats_events import start_nats_listener
from voice_realtime import create_realtime_session, realtime_voice_proxy


@asynccontextmanager
async def lifespan(app: FastAPI):
    print("🚀 Starting Septimus AI Sidecar...")
    nats_task = asyncio.create_task(start_nats_listener())
    yield
    nats_task.cancel()
    try:
        await nats_task
    except asyncio.CancelledError:
        pass


app = FastAPI(title="Septimus AI Sidecar", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ALLOW_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def verify_internal_token(x_internal_token: str = Header(default="")):
    """Reject any HTTP request that did not come through the trusted backend
    proxy. When INTERNAL_API_TOKEN is unset the check is disabled (local dev)."""
    if not INTERNAL_API_TOKEN:
        return
    if x_internal_token != INTERNAL_API_TOKEN:
        raise HTTPException(status_code=401, detail="invalid internal token")


# ── Request models ────────────────────────────────────────────────────────────

class ChatRequest(BaseModel):
    agent_type: str
    message: str
    context: dict = {}
    thread_id: str = "default-thread"
    system_prompt: Optional[str] = None


class QueryRequest(BaseModel):
    query: str
    workspace_id: Optional[str] = None
    lang: Optional[str] = None


class SprintPlanRequest(BaseModel):
    capacity: int
    backlog: List[Dict[str, Any]]


class GenerateSubtasksRequest(BaseModel):
    title: str
    description: str
    lang: Optional[str] = None


class VoiceSessionRequest(BaseModel):
    workspace_id: Optional[str] = None
    voice: str = "alloy"
    instructions: Optional[str] = None


# ── Endpoints ─────────────────────────────────────────────────────────────────

@app.post("/api/v1/ai/voice/session", dependencies=[Depends(verify_internal_token)])
async def create_voice_session(req: VoiceSessionRequest):
    """Generate an ephemeral OpenAI Realtime session token for WebRTC / WebSocket low-latency voice chat."""
    workspace_id = req.workspace_id or DEFAULT_WORKSPACE_ID
    try:
        session_data = await create_realtime_session(
            workspace_id=workspace_id,
            voice=req.voice,
            instructions=req.instructions,
        )
        return session_data
    except Exception as e:
        print(f"[voice/session] error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.websocket("/api/v1/ai/voice/ws")
async def voice_websocket_endpoint(websocket: WebSocket, workspace_id: str = DEFAULT_WORKSPACE_ID, voice: str = "alloy"):
    """Server-side bidirectional WebSocket proxy relay connecting client <-> OpenAI Realtime API with RAG tool execution."""
    await websocket.accept()
    await realtime_voice_proxy(client_ws=websocket, workspace_id=workspace_id, voice=voice)


@app.post("/api/v1/ai/query", dependencies=[Depends(verify_internal_token)])
async def query_documents(req: QueryRequest):
    """RAG over the shared workspace knowledge base (Doc Chat), answered in the
    UI language and grounded in the retrieved context."""
    workspace_id = req.workspace_id or DEFAULT_WORKSPACE_ID
    lang = resolve_lang(req.lang)

    llm = await get_active_llm(workspace_id)
    if not llm:
        return {"answer": ("عذراً، لم يتم إعداد مزود الذكاء الاصطناعي (LLM) بعد." if lang == "ar"
                           else "Sorry, no AI provider (LLM) has been configured yet.")}

    context_text = retrieve_context(workspace_id, req.query, k=4)
    if not context_text:
        return {"answer": ("لم أعثر على مستندات ذات صلة بسؤالك في قاعدة المعرفة." if lang == "ar"
                           else "I couldn't find any relevant documents for your question in the knowledge base.")}

    system_prompt = (
        "أنت مساعد معرفي في Septimus OS. أجب فقط اعتماداً على السياق المرفق من قاعدة المعرفة. "
        "إذا لم يكن الجواب في السياق فقل ذلك بصراحة."
        if lang == "ar" else
        "You are a knowledge assistant in Septimus OS. Answer strictly from the provided knowledge-base "
        "context. If the answer is not in the context, say so honestly."
    )
    messages = [
        SystemMessage(content=system_prompt),
        SystemMessage(content=f"Knowledge Base Context:\n{context_text}"),
        HumanMessage(content=f"{req.query}\n\n{language_directive(lang)}"),
    ]
    try:
        response = await llm.ainvoke(messages)
        return {"answer": response.content}
    except Exception as e:
        print(f"[query] LLM error: {e}")
        return {"answer": (f"حدث خطأ أثناء الاستعلام: {str(e)}" if lang == "ar"
                           else f"An error occurred while querying: {str(e)}")}


@app.post("/api/v1/ai/chat", dependencies=[Depends(verify_internal_token)])
async def chat_with_agent(req: ChatRequest):
    lang = resolve_lang(req.context.get("lang"))
    # Ensure a workspace is always scoped for the tools.
    context = dict(req.context)
    context.setdefault("workspace_id", DEFAULT_WORKSPACE_ID)
    try:
        reply = await run_chat_agent(
            agent_type=req.agent_type,
            message=req.message,
            context=context,
            thread_id=req.thread_id,
            system_prompt=req.system_prompt,
        )
        return {"reply": reply}
    except RuntimeError:
        return {"reply": ("عذراً، لم يتم إعداد مزود الذكاء الاصطناعي (LLM) بعد." if lang == "ar"
                          else "Sorry, no AI provider (LLM) has been configured yet.")}
    except Exception as e:
        print(f"[chat] error: {e}")
        return {"reply": (f"حدث خطأ أثناء معالجة طلبك: {str(e)}" if lang == "ar"
                          else f"An error occurred while processing your request: {str(e)}")}


@app.post("/api/v1/ai/plan-sprint", dependencies=[Depends(verify_internal_token)])
async def plan_sprint(req: SprintPlanRequest):
    llm = await get_active_llm(DEFAULT_WORKSPACE_ID)
    if not llm:
        # Deterministic greedy fallback.
        sorted_tasks = sorted(req.backlog, key=lambda x: (-x.get('Priority', 0), x.get('StoryPoints', 0)))
        selected, cap = [], req.capacity
        for t in sorted_tasks:
            pts = t.get('StoryPoints') or 0
            if cap >= pts:
                selected.append(t['ID'])
                cap -= pts
        return {"selected_task_ids": selected}

    prompt = f"""
    You are an AI Agile Coach. Analyze the following backlog of tasks and select a subset of tasks to include in the next sprint.
    The sprint has a maximum capacity of {req.capacity} story points.
    Prioritize high-priority tasks. Do not exceed the capacity limit.
    Return ONLY a valid JSON object with the key 'selected_task_ids' containing a list of strings (the IDs of the selected tasks).

    Backlog Tasks:
    {json.dumps(req.backlog)}
    """
    try:
        res = await llm.ainvoke([HumanMessage(content=prompt)])
        content = res.content.strip()
        if content.startswith("```json"):
            content = content[7:-3]
        return json.loads(content)
    except Exception as e:
        print(f"[plan-sprint] parse error: {e}")
        return {"selected_task_ids": []}


@app.post("/api/v1/ai/generate-subtasks", dependencies=[Depends(verify_internal_token)])
async def generate_subtasks(req: GenerateSubtasksRequest):
    lang = resolve_lang(req.lang)
    llm = await get_active_llm(DEFAULT_WORKSPACE_ID, tier="fast")
    if not llm:
        if lang == "ar":
            return {"subtasks": [
                f"تفكيك معماري لـ: {req.title}",
                "نماذج قاعدة البيانات وتصميم الـ API",
                "مكونات واجهة المستخدم",
                "تغطية اختبارات آلية",
            ]}
        return {"subtasks": [
            f"Architecture breakdown for: {req.title}",
            "Database models and API design",
            "Frontend UI components",
            "Automated test coverage",
        ]}

    prompt = f"""
    Break down the following task into 3-5 concrete, actionable subtasks.
    Write the subtask titles in {"Arabic" if lang == "ar" else "English"}.
    Return ONLY a valid JSON object with the key 'subtasks' containing a list of strings (the subtask titles).

    Task Title: {req.title}
    Task Description: {req.description}
    """
    try:
        res = await llm.ainvoke([HumanMessage(content=prompt)])
        content = res.content.strip()
        if content.startswith("```json"):
            content = content[7:-3]
        return json.loads(content)
    except Exception as e:
        print(f"[generate-subtasks] parse error: {e}")
        return {"subtasks": []}


if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=False)
