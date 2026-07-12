"""Conversational ReAct agent used by the /ai/chat endpoint.

Builds workspace-scoped tools, wires them to a LangGraph ReAct agent with
durable Postgres conversation memory, and returns the final reply text.
"""
import json

import requests

from config import BACKEND_URL, DB_DSN, internal_headers
from i18n import language_directive, resolve_lang, system_prompt_for
from providers import get_active_llm


def _queue_approval(workspace_id: str, action_type: str, entity_type: str, data: dict, lang: str) -> str:
    """Defer a write action to the human-in-the-loop approval queue instead of
    executing it. The action runs only when an admin approves it."""
    try:
        res = requests.post(
            f"{BACKEND_URL}/internal/pending-approvals",
            json={
                "agent_name": "chat",
                "action_type": action_type,
                "workspace_id": workspace_id,
                "entity_type": entity_type,
                "data": data,
                "reason": f"AI proposed '{action_type}'; awaiting human approval before execution.",
            },
            headers=internal_headers(),
        )
        if res.status_code in (200, 201):
            return ("أرسلتُ الطلب للموافقة البشرية، وسيُنفَّذ فور اعتماده من مسؤول." if lang == "ar"
                    else "I've queued this for human approval; it will run once an admin approves it.")
        return (f"تعذّر إرسال الطلب للموافقة: {res.text}" if lang == "ar"
                else f"Failed to queue the action for approval: {res.text}")
    except Exception as e:
        return (f"خطأ أثناء إرسال الطلب للموافقة: {e}" if lang == "ar"
                else f"Error queuing the action for approval: {e}")


def _build_tools(workspace_id: str, lang: str):
    from langchain_core.tools import tool

    @tool
    def search_knowledge(query: str) -> str:
        """ابحث في مستندات الشركة، المهام، والسياسات عن أي معلومات مفيدة (Search Company Knowledge Base)."""
        try:
            res = requests.get(
                f"{BACKEND_URL}/internal/search/semantic?workspace_id={workspace_id}&q={query}&limit=3",
                headers=internal_headers(),
            )
            if res.status_code == 200:
                results = res.json().get("results", [])
                if not results:
                    return "لا توجد مستندات مطابقة."
                formatted = ""
                for r in results:
                    formatted += f"- [{r['entity_type']}] {r['content']} (Data: {r.get('entity_data')})\n"
                return f"إليك المعلومات التي وجدتها:\n{formatted}"
            return "فشل البحث في قاعدة المعرفة."
        except Exception as e:
            return f"خطأ أثناء البحث: {e}"

    @tool
    def create_task(title: str, description: str) -> str:
        """اقترح إنشاء مهمة جديدة (يتطلب موافقة بشرية قبل التنفيذ) — Propose creating a Task (requires human approval)."""
        return _queue_approval(
            workspace_id, "Create Task", "task",
            {"title": title, "description": description, "status": "Todo", "priority": 1, "points": 0},
            lang,
        )

    @tool
    def create_crm_deal(title: str, value: float, stage: str) -> str:
        """اقترح إنشاء صفقة مبيعات (يتطلب موافقة بشرية قبل التنفيذ) — Propose creating a CRM Deal (requires human approval)."""
        return _queue_approval(
            workspace_id, "Create CRM Deal", "crm_deal",
            {"title": title, "value": value, "stage": stage, "probability": 50},
            lang,
        )

    @tool
    def get_hr_policy() -> str:
        """استرجاع سياسات الموارد البشرية الحالية (Get HR Policy)."""
        try:
            res = requests.get(
                f"{BACKEND_URL}/internal/entities?workspace_id={workspace_id}&type=hr_policy",
                headers=internal_headers(),
            )
            if res.status_code == 200:
                data = res.json()
                if data and data.get("data"):
                    return json.dumps(data["data"], ensure_ascii=False)
            return "لا توجد سياسة موارد بشرية محفوظة."
        except Exception as e:
            return f"خطأ في استرجاع السياسة: {e}"

    return [search_knowledge, create_task, create_crm_deal, get_hr_policy]


async def _fetch_hr_policy_text(workspace_id: str) -> str:
    try:
        import aiohttp
        async with aiohttp.ClientSession() as session:
            async with session.get(
                f"{BACKEND_URL}/internal/entities?workspace_id={workspace_id}&type=hr_policy",
                headers=internal_headers(),
            ) as resp:
                if resp.status == 200:
                    p_data = await resp.json()
                    if p_data and p_data.get("data"):
                        return f"\nسياسات الموارد البشرية الحالية (HR Policies): {json.dumps(p_data['data'], ensure_ascii=False)}"
    except Exception as e:
        print(f"Failed to fetch HR policy: {e}")
    return ""


async def run_chat_agent(agent_type: str, message: str, context: dict,
                         thread_id: str, system_prompt=None) -> str:
    """Run the conversational agent and return the final reply text.

    When context carries a `stream_id`, reply tokens are also streamed live to
    the Centrifugo channel `ai_<stream_id>` (best-effort). The returned string
    stays the authoritative reply the caller sends over HTTP.

    Raises on failure so the caller can format a localized error.
    """
    from langgraph.prebuilt import create_react_agent
    from langgraph.checkpoint.postgres.aio import AsyncPostgresSaver

    lang = resolve_lang(context.get("lang"))
    workspace_id = context.get("workspace_id")
    stream_id = context.get("stream_id")
    channel = f"ai_{stream_id}" if stream_id else None

    llm = await get_active_llm(workspace_id)
    if not llm:
        raise RuntimeError("no active LLM")

    tools = _build_tools(workspace_id, lang)
    sp = system_prompt if system_prompt else system_prompt_for(agent_type, lang)

    hr_policy_text = ""
    if agent_type.lower() == "hr":
        hr_policy_text = await _fetch_hr_policy_text(workspace_id)

    reasoning_hint = ("فكّر (Reason) قبل الإجابة واستخدم الأدوات المتاحة متى دعت الحاجة."
                      if lang == "ar"
                      else "Reason before answering and use the available tools whenever needed.")
    system_message = (f"{sp}\nContext: {json.dumps(context, ensure_ascii=False)}\n"
                      f"{hr_policy_text}\n\n{language_directive(lang)} {reasoning_hint}")

    # Durable conversation memory in Postgres keyed by thread_id.
    async with AsyncPostgresSaver.from_conn_string(DB_DSN) as memory:
        await memory.asetup()
        agent = create_react_agent(llm, tools=tools, checkpointer=memory, state_modifier=system_message)

        config = {"configurable": {"thread_id": thread_id}}
        inputs = {"messages": [("user", message)]}

        if channel:
            return await _run_streaming(agent, inputs, config, channel)

        final_reply = ""
        async for event in agent.astream(inputs, config, stream_mode="values"):
            msg = event["messages"][-1]
            if type(msg).__name__ == "AIMessage" and not getattr(msg, "tool_calls", None):
                final_reply = msg.content
    return final_reply


async def _run_streaming(agent, inputs, config, channel: str) -> str:
    """Stream token deltas of the final assistant message to `channel` and
    return the accumulated reply. Falls back cleanly if message-mode streaming
    isn't available."""
    from realtime import publish

    final_reply = ""
    try:
        async for chunk, _meta in agent.astream(inputs, config, stream_mode="messages"):
            # Only stream the assistant's natural-language tokens — skip tool
            # call chunks (empty content) and tool result messages.
            name = type(chunk).__name__
            delta = getattr(chunk, "content", "")
            if "AIMessage" in name and isinstance(delta, str) and delta:
                final_reply += delta
                await publish(channel, {"type": "token", "delta": delta})
    except Exception as e:
        # Fall back to a single non-streamed pass so the reply is never lost.
        print(f"[chat] streaming failed ({e}); falling back to non-streamed run")
        final_reply = ""
        async for event in agent.astream(inputs, config, stream_mode="values"):
            msg = event["messages"][-1]
            if type(msg).__name__ == "AIMessage" and not getattr(msg, "tool_calls", None):
                final_reply = msg.content

    await publish(channel, {"type": "done", "reply": final_reply})
    return final_reply
