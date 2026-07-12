"""NATS event handlers and listener for the AI sidecar.

`events.*` subjects are consumed as **durable JetStream** consumers so events
are not lost across sidecar restarts (they resume from the last ack). The
request/reply and best-effort subjects (`huddle.speak`, `crm.lead.score`,
`document.uploaded`) stay on core NATS.
"""
import asyncio
import base64
import json
import re

import nats
import requests
from nats.errors import ConnectionClosedError, NoServersError
from nats.js.api import ConsumerConfig, DeliverPolicy
from langchain_core.messages import HumanMessage, SystemMessage

from config import (
    BACKEND_URL,
    NATS_URL,
    OPENAI_API_KEY,
    get_default_workspace_id,
    internal_headers,
)
from i18n import language_directive, resolve_lang
from knowledge import embed_document, retrieve_context
from providers import get_active_llm

# The active connection, set on startup so handlers can publish replies.
_nc = None


# ── Durable JetStream handlers (events.*) ─────────────────────────────────────

async def on_task_created(msg):
    """events.tasks.created → estimate story points for unpointed tasks."""
    await msg.ack()
    try:
        data = json.loads(msg.data.decode())
    except Exception as e:
        print(f"[tasks.created] bad payload: {e}")
        return

    if data.get("story_points", 0) != 0:
        return

    task_id = data.get("task_id")
    title = data.get("title", "")
    description = data.get("description", "")
    workspace_id = data.get("workspace_id") or get_default_workspace_id()

    llm = await get_active_llm(workspace_id, tier="fast")
    if not llm:
        print("[tasks.created] no active LLM for estimation.")
        return

    prompt = ("Estimate the story points (Fibonacci: 1, 2, 3, 5, 8, 13) for the following task. "
              f"Respond ONLY with an integer number and nothing else.\nTitle: {title}\nDescription: {description}")
    try:
        response = await llm.ainvoke(prompt)
        pts = int(response.content.strip())
        import aiohttp
        api_url = f"{BACKEND_URL}/internal"
        async with aiohttp.ClientSession() as session:
            async with session.put(f"{api_url}/system/tasks/{task_id}",
                                   json={"story_points": pts},
                                   headers=internal_headers()) as resp:
                if resp.status == 200:
                    print(f"[tasks.created] task {task_id} estimated at {pts} points.")
                else:
                    print(f"[tasks.created] update failed: {await resp.text()}")
    except Exception as e:
        print(f"[tasks.created] estimation error: {e}")


async def on_message_created(msg):
    """events.messages.created → reply when the assistant is @-mentioned."""
    await msg.ack()
    try:
        data = json.loads(msg.data.decode())
    except Exception as e:
        print(f"[messages.created] bad payload: {e}")
        return

    content = data.get("content", "")
    channel_id = data.get("channel_id")

    # Reply only when explicitly mentioned (@ai / @AI).
    if not re.search(r"@ai\b", content, re.IGNORECASE):
        return

    workspace_id = data.get("workspace_id") or get_default_workspace_id()
    lang = resolve_lang(data.get("lang"))

    llm = await get_active_llm(workspace_id)
    if not llm:
        print("[messages.created] no active LLM.")
        return

    context_text = retrieve_context(workspace_id, content, k=3)

    system_prompt = ("You are Septimus AI, a helpful enterprise assistant. Answer queries based on the "
                     "provided Knowledge Base context if available. If the message implies a task needs to "
                     "be created, add a JSON block at the end: {\"is_task\": true, \"title\": \"...\"}. "
                     + language_directive(lang))
    messages = [SystemMessage(content=system_prompt)]
    if context_text:
        messages.append(SystemMessage(content=f"Knowledge Base Context:\n{context_text}"))
    messages.append(HumanMessage(content=content))

    try:
        response = await llm.ainvoke(messages)
        if _nc is not None:
            await _nc.publish("chat.message.ai_reply", json.dumps({
                "content": response.content,
                "channel_id": channel_id,
                "workspace_id": workspace_id,
            }).encode())
    except Exception as e:
        print(f"[messages.created] LLM error: {e}")


async def on_workflow_trigger(msg):
    """events.workflow.trigger → run a specialized ReAct agent."""
    await msg.ack()
    try:
        data = json.loads(msg.data.decode())
    except Exception as e:
        print(f"[workflow.trigger] bad payload: {e}")
        return

    agent_type = data.get("agent_type", "default")
    prompt_template = data.get("prompt", "")
    context_data = data.get("context", {})
    thread_id = data.get("thread_id", "default-thread")
    workspace_id = context_data.get("workspace_id") or get_default_workspace_id()

    llm = await get_active_llm(workspace_id)
    if not llm:
        print("[workflow.trigger] no active LLM.")
        return

    try:
        from langchain_core.tools import tool
        from langgraph.prebuilt import create_react_agent
        from langgraph.checkpoint.postgres.aio import AsyncPostgresSaver
        from config import DB_DSN

        @tool
        def search_knowledge(query: str) -> str:
            """Search the company knowledge base, tasks, and documents."""
            try:
                res = requests.get(
                    f"{BACKEND_URL}/internal/search/semantic?workspace_id={workspace_id}&q={query}&limit=3",
                    headers=internal_headers(),
                )
                if res.status_code == 200:
                    results = res.json().get("results", [])
                    if not results:
                        return "No relevant documents found."
                    formatted = ""
                    for r in results:
                        formatted += f"- [{r['entity_type']}] {r['content']} (Data: {r.get('entity_data')})\n"
                    return f"Found the following context:\n{formatted}"
                return "Failed to fetch from knowledge base."
            except Exception as e:
                return f"Error searching knowledge base: {e}"

        sys_prompts = {
            "data analyst": "You are a specialized Data Analysis AI Agent. Use your tools to query the knowledge base and find insights.",
            "qa tester": "You are a specialized QA Tester Agent. Focus on testing and quality assurance.",
            "workflow architect": "You are a specialized Workflow Architect Agent. Build workflows and processes.",
        }
        sp = sys_prompts.get(agent_type.lower(), "You are a helpful AI Agent.")
        system_message = f"{sp}\nContext: {json.dumps(context_data)}"

        async with AsyncPostgresSaver.from_conn_string(DB_DSN) as memory:
            await memory.asetup()
            agent = create_react_agent(llm, tools=[search_knowledge], checkpointer=memory, state_modifier=system_message)
            config = {"configurable": {"thread_id": thread_id}}
            inputs = {"messages": [("user", prompt_template)]}
            async for event in agent.astream(inputs, config, stream_mode="values"):
                message = event["messages"][-1]
                if type(message).__name__ == "AIMessage" and not getattr(message, "tool_calls", None):
                    print(f"[workflow.trigger] {agent_type} output: {message.content}")
    except Exception as e:
        print(f"[workflow.trigger] LangGraph error: {e}")


# ── Core NATS handlers (best-effort / request-reply) ──────────────────────────

async def on_document_uploaded(msg):
    """document.uploaded → embed the file into the workspace knowledge base."""
    try:
        data = json.loads(msg.data.decode())
    except Exception as e:
        print(f"[document.uploaded] bad payload: {e}")
        return

    file_path = data.get("file_path", "")
    document_id = data.get("document_id", "")
    workspace_id = data.get("workspace_id") or get_default_workspace_id()
    if not file_path:
        print("[document.uploaded] no file_path.")
        return
    embed_document(file_path, document_id, workspace_id)


async def on_huddle_speak(msg):
    """huddle.speak → Whisper STT → LLM → TTS voice reply (request/reply)."""
    try:
        data = json.loads(msg.data.decode())
    except Exception as e:
        print(f"[huddle.speak] bad payload: {e}")
        return

    from openai import AsyncOpenAI
    import os

    file_path = data.get("file_path", "")
    workspace_id = data.get("workspace_id") or get_default_workspace_id()
    lang = resolve_lang(data.get("lang"))

    if not os.path.isabs(file_path):
        file_path = os.path.join("../backend-core", file_path)

    if not OPENAI_API_KEY:
        print("[huddle.speak] no OPENAI_API_KEY; returning demo response.")
        if msg.reply:
            await msg.respond(json.dumps({
                "text": ("هذا رد تجريبي لأن مفتاح OpenAI غير متوفر." if lang == "ar"
                         else "This is a demo reply because the OpenAI key is missing."),
                "audio_base64": "UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=",
            }).encode())
        return

    client = AsyncOpenAI(api_key=OPENAI_API_KEY)
    try:
        with open(file_path, "rb") as audio_file:
            transcript = await client.audio.transcriptions.create(
                model="whisper-1", file=audio_file, language=lang
            )
        user_text = transcript.text

        llm = await get_active_llm(workspace_id)
        if not llm:
            raise Exception("No active LLM found")

        system_prompt = ("You are a helpful AI voice & vision assistant in Septimus OS. Keep your answers brief, "
                         "conversational, and natural for a voice call. If the user shares their screen image, analyze what you see directly. " + language_directive(lang))
        
        image_base64 = data.get("image_base64", "")
        if image_base64:
            human_content = [
                {"type": "text", "text": user_text or "Please analyze what is on my screen right now."},
                {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{image_base64}"}}
            ]
            response = await llm.ainvoke([SystemMessage(content=system_prompt), HumanMessage(content=human_content)])
        else:
            response = await llm.ainvoke([SystemMessage(content=system_prompt), HumanMessage(content=user_text)])
        ai_text = response.content

        tts_response = await client.audio.speech.create(model="tts-1", voice="nova", input=ai_text)
        audio_base64 = base64.b64encode(tts_response.read()).decode("utf-8")

        if msg.reply:
            await msg.respond(json.dumps({"text": ai_text, "audio_base64": audio_base64}).encode())
    except Exception as e:
        print(f"[huddle.speak] error: {e}")
        if msg.reply:
            await msg.respond(json.dumps({"error": str(e)}).encode())


async def on_crm_lead_score(msg):
    """crm.lead.score → LLM lead score 1-100 (request/reply)."""
    try:
        data = json.loads(msg.data.decode())
    except Exception as e:
        print(f"[crm.lead.score] bad payload: {e}")
        return

    lead_name = data.get("name", "")
    lead_value = data.get("value", 0)
    workspace_id = data.get("workspace_id") or get_default_workspace_id()

    llm = await get_active_llm(workspace_id, tier="fast")
    if not llm:
        if msg.reply:
            await msg.respond(json.dumps({"score": 50}).encode())
        return

    prompt = ("Analyze this CRM lead and return ONLY an integer between 1 and 100 representing the "
              f"probability of closing this deal.\nLead Name: {lead_name}\nDeal Value: {lead_value}")
    try:
        res = await llm.ainvoke(prompt)
        score = int(res.content.strip())
        if msg.reply:
            await msg.respond(json.dumps({"score": score}).encode())
    except Exception as e:
        print(f"[crm.lead.score] error: {e}")
        if msg.reply:
            await msg.respond(json.dumps({"score": 50}).encode())


# ── Listener ──────────────────────────────────────────────────────────────────

async def start_nats_listener():
    """Connect to NATS and subscribe with durable JetStream consumers for
    events.* plus core subscriptions for the request/reply subjects. Retries
    with exponential backoff on connection loss."""
    global _nc
    retry_delay = 2
    while True:
        try:
            _nc = await nats.connect(NATS_URL, reconnect_time_wait=2, max_reconnect_attempts=-1)
            js = _nc.jetstream()
            print(f"[NATS] connected to {NATS_URL}")

            # Ensure the events stream exists (Go also creates it).
            try:
                await js.add_stream(name="COMPANY_OS_EVENTS", subjects=["events.>"])
            except Exception as e:
                print(f"[NATS] stream note: {e}")  # likely already exists

            # Durable JetStream consumers — resume from last ack across restarts.
            # DeliverPolicy.NEW avoids replaying all history on first creation.
            durable_subs = [
                ("events.tasks.created", "ai_sidecar_tasks", on_task_created),
                ("events.messages.created", "ai_sidecar_messages", on_message_created),
                ("events.workflow.trigger", "ai_sidecar_workflow", on_workflow_trigger),
            ]
            for subject, durable, cb in durable_subs:
                await js.subscribe(
                    subject,
                    cb=cb,
                    durable=durable,
                    manual_ack=True,
                    config=ConsumerConfig(deliver_policy=DeliverPolicy.NEW),
                )

            # Core NATS for best-effort + request/reply subjects.
            await _nc.subscribe("document.uploaded", cb=on_document_uploaded)
            await _nc.subscribe("huddle.speak", cb=on_huddle_speak)
            await _nc.subscribe("crm.lead.score", cb=on_crm_lead_score)

            print("[NATS] AI sidecar listening (durable: events.*; core: document/huddle/crm)")
            retry_delay = 2  # reset after a successful connect

            while True:
                await asyncio.sleep(60)

        except (ConnectionClosedError, NoServersError) as e:
            print(f"[NATS] connection lost: {e} — retrying in {retry_delay}s")
            await asyncio.sleep(retry_delay)
            retry_delay = min(retry_delay * 2, 30)
        except asyncio.CancelledError:
            print("[NATS] shutting down listener")
            if _nc is not None:
                await _nc.drain()
            break
        except Exception as e:
            print(f"[NATS] unexpected error: {e} — retrying in {retry_delay}s")
            await asyncio.sleep(retry_delay)
            retry_delay = min(retry_delay * 2, 30)
